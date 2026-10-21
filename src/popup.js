import { instagramInput, inputFromTabUrl, siteUrl } from "./site.js";
import { avatarFile, highlightsFromResult, mediaFromResult, pageFromUrl, shortcodeToId } from "./instagram.js";
import { collectFromPage } from "./collect.js";

const message = (key, ...substitutions) => chrome.i18n.getMessage(key, substitutions.map(String));
const $ = id => document.getElementById(id);
const form = $("form"), input = $("input"), error = $("error");
const mediaSection = $("media"), grid = $("grid"), downloadAll = $("download-all"), title = $("media-title"), back = $("back");
const tabs = $("tabs"), tabButtons = [...tabs.querySelectorAll("[role=tab]")];
const status = $("status"), statusText = $("status-text"), statusLink = $("status-link");

document.documentElement.lang = message("@@ui_locale").replace("_", "-");
document.documentElement.dir = message("@@bidi_dir");
for (const element of document.querySelectorAll("[data-i18n]")) element.textContent = message(element.dataset.i18n);
input.placeholder = message("placeholder");

const svg = path => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
const icons = {
  download: svg('<path d="M12 4v11m-5-5 5 5 5-5M5 20h14"/>'),
  done: svg('<path d="m5 12 5 5 9-10"/>'),
  play: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
};

// `tool` is an ig.tools page slug, e.g. the profile picture downloader.
function openOnSite(value, tool) {
  chrome.tabs.create({ url: siteUrl(value, chrome.i18n.getUILanguage(), tool) });
  window.close();
}

// `detail` is the failed request and its status, e.g. "stories 429", to quote in a bug report.
function showStatus(text, link, detail) {
  status.hidden = false;
  statusText.textContent = text;
  $("status-detail").hidden = !detail;
  $("status-detail").textContent = detail ? `(${detail})` : "";
  statusLink.hidden = !link;
  if (link) {
    statusLink.textContent = link.label;
    statusLink.onclick = event => { event.preventDefault(); openOnSite(link.input, link.tool); };
  }
}

// With media on screen, saving is the main action and ig.tools becomes the secondary one.
function demoteSiteForm() {
  $("open").className = "secondary";
  $("form-title").hidden = false;
}

// Each view gets a ticket; a request that finishes after the user moved on is ignored.
let currentView = 0;
const isCurrent = ticket => ticket === currentView;

// Clears the grid and heading before a view is drawn, and starts a new ticket.
// On profile tabs the selected tab already names the view, so the heading is
// kept for screen readers only (`visibleHeading` false).
function resetView(heading, visibleHeading = true) {
  currentView++;
  mediaSection.hidden = false;
  status.hidden = true;
  grid.replaceChildren();
  grid.className = "grid";
  title.textContent = heading;
  title.classList.toggle("sr-only", !visibleHeading);
  back.hidden = true;
  downloadAll.hidden = true;
  downloadAll.disabled = false;
  updateHead();
}

// The heading row is dropped when it would only hold a hidden heading.
function updateHead() {
  $("media-head").hidden = title.classList.contains("sr-only") && back.hidden && downloadAll.hidden;
}

async function save(file, button) {
  button.disabled = true;
  try {
    await chrome.downloads.download({ url: file.url, filename: file.filename, conflictAction: "uniquify" });
    button.innerHTML = icons.done;
    button.setAttribute("aria-label", message("saved"));
    button.classList.add("is-done");
  } catch {
    button.disabled = false;
    showStatus(message("downloadFailed"));
  }
}

// layout: "post" (2 columns), "story" (3 columns), "avatar" (one square card).
function renderMedia(files, layout) {
  mediaSection.hidden = false;
  grid.className = `grid${files.length === 1 ? " is-single" : ""}${layout === "post" ? "" : ` is-${layout}`}`;
  let photos = 0, videos = 0;
  const buttons = files.map(file => {
    const label = layout === "avatar" ? message("tabAvatar") : file.type === "video" ? message("videoLabel", ++videos) : message("photoLabel", ++photos);
    const item = document.createElement("li");
    item.className = "card";
    if (file.previewUrl) {
      const image = document.createElement("img");
      image.src = file.previewUrl;
      image.alt = label;
      image.loading = "lazy";
      item.append(image);
    }
    if (file.type === "video") item.insertAdjacentHTML("beforeend", `<span class="badge">${icons.play}</span>`);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "save";
    button.innerHTML = icons.download;
    button.setAttribute("aria-label", `${message("download")}: ${label}`);
    button.addEventListener("click", () => save(file, button));
    item.append(button);
    grid.append(item);
    return button;
  });
  downloadAll.hidden = files.length < 2;
  downloadAll.onclick = async () => {
    downloadAll.disabled = true;
    for (const [index, file] of files.entries()) if (!buttons[index].disabled) await save(file, buttons[index]);
  };
  updateHead();
  demoteSiteForm();
}

let tabId;

// Runs the collector in the Instagram tab. Errors come back as { reason, detail }.
async function collect(request) {
  try {
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: collectFromPage, args: [request] });
    return result ?? { reason: "failed", detail: "script empty" };
  } catch (scriptError) {
    return { reason: "failed", detail: `script ${scriptError?.message ?? ""}`.trim() };
  }
}

// Shows a failed result; returns true when there was nothing else to show.
function showFailure(result, link) {
  if (result?.reason === "login") return showStatus(message("loginNeeded"), link, result.detail), true;
  if (result?.reason === "failed") return showStatus(message("failed"), link, result.detail), true;
  return false;
}

// ---- Profile pages: Stories, Highlights and profile picture tabs ----

const profile = { username: "", userId: null, smallPicture: null, stories: null, highlights: null, avatar: null };

function remember(result) {
  profile.userId ??= result?.userId ?? null;
  profile.smallPicture ??= result?.smallPicture ?? null;
}
const accountRequest = kind => ({ kind, username: profile.username, userId: profile.userId, smallPicture: profile.smallPicture, storyId: null });
const browseLink = () => ({ label: message("browseOnSite"), input: `@${profile.username}` });

async function showStoriesTab() {
  resetView(message("currentStories"), false);
  const ticket = currentView;
  if (!profile.stories) {
    showStatus(message("loading"));
    const result = await collect(accountRequest("story"));
    remember(result);
    if (!isCurrent(ticket)) return;
    if (showFailure(result, browseLink())) return;
    profile.stories = mediaFromResult(result, { kind: "story" });
    profile.storiesDetail = result?.detail;
  }
  if (!profile.stories.length) return showStatus(message("noStories"), browseLink(), profile.storiesDetail);
  status.hidden = true;
  renderMedia(profile.stories, "story");
}

async function showHighlightsTab() {
  resetView(message("tabHighlights"), false);
  const ticket = currentView;
  if (!profile.highlights) {
    showStatus(message("loading"));
    const result = await collect(accountRequest("highlights"));
    remember(result);
    if (!isCurrent(ticket)) return;
    if (showFailure(result, browseLink())) return;
    profile.highlights = highlightsFromResult(result);
  }
  if (!profile.highlights.length) return showStatus(message("noHighlights"), browseLink());
  status.hidden = true;
  grid.className = "grid is-story is-highlights";
  for (const highlight of profile.highlights) {
    const item = document.createElement("li");
    item.className = "highlight";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "highlight-open";
    // An empty circle stands in for a missing cover, so titles stay aligned.
    const cover = document.createElement("span");
    cover.className = "highlight-cover";
    if (highlight.coverUrl) {
      const image = document.createElement("img");
      image.src = highlight.coverUrl;
      image.alt = "";
      image.loading = "lazy";
      cover.append(image);
    }
    button.append(cover);
    const name = document.createElement("span");
    name.className = "highlight-title";
    name.textContent = highlight.title || message("tabHighlights");
    button.append(name);
    button.addEventListener("click", () => showHighlight(highlight));
    item.append(button);
    grid.append(item);
  }
  demoteSiteForm();
}

async function showHighlight(highlight) {
  resetView(highlight.title || message("tabHighlights"));
  const ticket = currentView;
  back.hidden = false;
  if (!highlight.files) {
    showStatus(message("loading"));
    const result = await collect({ kind: "highlight", highlightId: highlight.id });
    if (!isCurrent(ticket)) return;
    if (showFailure(result, browseLink())) return;
    highlight.files = mediaFromResult({ ...result, owner: result.owner ?? profile.username }, { kind: "highlight", title: highlight.title, highlightId: highlight.id });
  }
  if (!highlight.files.length) return showStatus(message("unavailable"), browseLink());
  status.hidden = true;
  renderMedia(highlight.files, "story");
  back.hidden = false;
  back.focus();
}

async function showAvatarTab() {
  resetView(message("tabAvatar"), false);
  const ticket = currentView;
  if (!profile.avatar) {
    showStatus(message("loading"));
    const result = await collect(accountRequest("avatar"));
    remember(result);
    if (!isCurrent(ticket)) return;
    if (showFailure(result, browseLink())) return;
    profile.avatar = { file: avatarFile(profile.username, result.picture), detail: result.detail };
  }
  const { file, detail } = profile.avatar;
  const siteAvatar = { label: message("avatarOnSite"), input: `@${profile.username}`, tool: "instagram-profile-picture-downloader" };
  if (!file) return showStatus(message("avatarUnavailable"), siteAvatar, detail);
  status.hidden = true;
  renderMedia([file], "avatar");
  // Instagram refused the full-size picture: offer the small one and ig.tools for the full size.
  if (!file.hd) showStatus(message("avatarSmall"), siteAvatar, detail);
}

const views = { stories: showStoriesTab, highlights: showHighlightsTab, avatar: showAvatarTab };

function selectTab(button, focus = false) {
  for (const tab of tabButtons) {
    const selected = tab === button;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  if (focus) button.focus();
  return views[button.dataset.tab]();
}

tabButtons.forEach((button, index) => {
  button.addEventListener("click", () => selectTab(button));
  // Arrow keys move between tabs, as in other tab lists.
  button.addEventListener("keydown", event => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const rtl = document.documentElement.dir === "rtl" ? -1 : 1;
    selectTab(tabButtons[(index + step * rtl + tabButtons.length) % tabButtons.length], true);
  });
});
back.addEventListener("click", () => showHighlightsTab());

// ---- Entry point ----

async function loadPage(tab) {
  tabId = tab?.id;
  const page = tab?.url ? pageFromUrl(tab.url) : null;
  const siteInput = tab?.url && inputFromTabUrl(tab.url);
  if (siteInput) input.value = siteInput;
  if (!page) return;
  if (page.kind === "other") return showStatus(message("notMediaPage"));
  if (page.kind === "profile") {
    profile.username = page.username;
    tabs.hidden = false;
    return selectTab(tabButtons[0]);
  }
  const mediaId = page.kind === "post" ? shortcodeToId(page.shortcode) : null;
  if (page.kind === "post" && !mediaId) return showStatus(message("unavailable"));
  showStatus(message("loading"));
  const siteLink = siteInput ? { label: message("openOnSite"), input: siteInput } : undefined;
  const result = await collect({ ...page, mediaId });
  if (showFailure(result, siteLink)) return;
  const files = mediaFromResult(result, page);
  if (!files.length) return showStatus(message("unavailable"), siteLink, result?.detail);
  status.hidden = true;
  renderMedia(files, page.kind);
}

// Tests open the popup as a normal page and pass the Instagram tab to inspect.
const testTab = Number(new URLSearchParams(location.search).get("tab"));
const query = testTab ? chrome.tabs.get(testTab).then(tab => [tab]) : chrome.tabs.query({ active: true, currentWindow: true });
query.then(([tab]) => loadPage(tab)).finally(() => { if (mediaSection.hidden) input.focus(); });

input.addEventListener("input", () => { error.hidden = true; input.removeAttribute("aria-invalid"); });

form.addEventListener("submit", event => {
  event.preventDefault();
  const value = instagramInput(input.value);
  if (!value) {
    error.hidden = false;
    input.setAttribute("aria-invalid", "true");
    input.focus();
    return;
  }
  openOnSite(value);
});
