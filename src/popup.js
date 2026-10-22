import { REPOSITORY, instagramInput, inputFromTabUrl, siteUrl } from "./site.js";
import { avatarFile, highlightsFromResult, layoutFilename, mediaFromResult, pageFromUrl, safeMediaUrl, shortcodeToId } from "./instagram.js";
import { collectFromPage } from "./collect.js";
import { getSettings, setSetting } from "./settings.js";

const settings = await getSettings();

const message = (key, ...substitutions) => chrome.i18n.getMessage(key, substitutions.map(String));
const $ = id => document.getElementById(id);
const form = $("form"), input = $("input"), error = $("error");
const mediaSection = $("media"), grid = $("grid"), title = $("media-title"), back = $("back");
const mediaCount = $("media-count"), selectToggle = $("select-toggle"), mediaNote = $("media-note");
const actions = $("actions"), primary = $("download-all"), actionsNote = $("actions-note"), siteLink = $("site-link");
const tabs = $("tabs"), tabButtons = [...tabs.querySelectorAll("[role=tab]")];
const status = $("status"), statusText = $("status-text"), statusLink = $("status-link");

const svg = path => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
const icons = {
  download: svg('<path d="M12 4v11m-5-5 5 5 5-5M5 20h14"/>'),
  done: svg('<path d="m5 12 5 5 9-10"/>'),
  play: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  back: svg('<path d="m15 18-6-6 6-6"/>'),
  external: svg('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
  link: svg('<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>'),
};

document.documentElement.lang = message("@@ui_locale").replace("_", "-");
document.documentElement.dir = message("@@bidi_dir");
for (const element of document.querySelectorAll("[data-i18n]")) element.textContent = message(element.dataset.i18n);
for (const element of document.querySelectorAll("[data-i18n-label]")) {
  element.setAttribute("aria-label", message(element.dataset.i18nLabel));
  element.title = element.getAttribute("aria-label");
}
input.placeholder = message("placeholder");
$("settings-open").innerHTML = icons.settings;
$("settings-back").innerHTML = icons.back;
document.querySelector(".field-icon").innerHTML = icons.link;

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

// Pages with nothing to save show the ig.tools link field instead.
function showForm() {
  form.hidden = false;
  document.body.classList.add("is-empty");
}

// The account the media belongs to, above the media. `picture` is a small
// profile picture when one is known; otherwise the first letter stands in.
function showSource(username, detail, picture) {
  if (!username) return;
  $("source").hidden = false;
  $("source-name").textContent = `@${username}`;
  $("source-detail").textContent = detail;
  const slot = $("source-picture");
  const url = safeMediaUrl(picture);
  if (url) {
    const image = document.createElement("img");
    image.src = url;
    image.alt = "";
    image.referrerPolicy = "no-referrer";
    image.onerror = () => { slot.textContent = username[0]; };
    slot.replaceChildren(image);
  } else if (!slot.firstElementChild) {
    slot.textContent = username[0];
  }
}

const itemsText = files => files.length > 1 ? message("itemCount", files.length) : message(files[0].type === "video" ? "oneVideo" : "onePhoto");

// Each view gets a ticket; a request that finishes after the user moved on is ignored.
let currentView = 0;
const isCurrent = ticket => ticket === currentView;

// Clears the media before a view is drawn, and starts a new ticket. On profile
// tabs the selected tab already names the view, so the heading is kept for
// screen readers only (`visibleHeading` false).
function resetView(heading, visibleHeading = true) {
  currentView++;
  mediaSection.hidden = false;
  status.hidden = true;
  grid.replaceChildren();
  grid.className = "grid";
  title.textContent = heading;
  title.classList.toggle("sr-only", !visibleHeading);
  back.hidden = true;
  mediaCount.textContent = "";
  selectToggle.hidden = true;
  mediaNote.hidden = true;
  actions.hidden = true;
  updateHead();
}

// The heading row is dropped when it would show nothing.
function updateHead() {
  $("media-head").hidden = title.classList.contains("sr-only") && back.hidden && !mediaCount.textContent;
}

async function save(file, button) {
  button.disabled = true;
  try {
    await chrome.downloads.download({ url: file.url, filename: layoutFilename(file.filename, settings.folderLayout), conflictAction: "uniquify" });
    file.saved = true;
    if (button.classList.contains("save")) {
      button.innerHTML = icons.done;
      button.setAttribute("aria-label", message("saved"));
      button.classList.add("is-done");
    }
    return true;
  } catch {
    button.disabled = false;
    showStatus(message("downloadFailed"));
    return false;
  }
}

function setPrimary(label, done = false) {
  primary.innerHTML = `${done ? icons.done : icons.download}<span></span>`;
  primary.lastChild.textContent = done ? message("saved") : label;
  primary.classList.toggle("is-done", done);
  primary.disabled = done;
}

// layout: "post" (2 columns), "story" (3 columns), "avatar" (one round picture).
// One item is shown large and saved with the main button; several get a grid
// with select and save controls on each card, and the main button saves the
// selection, or everything when nothing is selected.
function renderMedia(files, layout) {
  mediaSection.hidden = false;
  const single = files.length === 1;
  grid.className = `grid${single ? " is-single" : ""}${layout === "post" ? "" : ` is-${layout}`}`;
  const selected = new Set();
  let photos = 0, videos = 0;
  const cards = files.map(file => {
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
    grid.append(item);
    if (single) return { item };
    const pick = document.createElement("button");
    pick.type = "button";
    pick.className = "pick";
    pick.innerHTML = `<span>${icons.done}</span>`;
    pick.setAttribute("aria-label", `${message("select")}: ${label}`);
    pick.setAttribute("aria-pressed", "false");
    pick.addEventListener("click", () => {
      selected.has(file) ? selected.delete(file) : selected.add(file);
      update();
    });
    const button = document.createElement("button");
    button.type = "button";
    button.className = "save";
    button.innerHTML = icons.download;
    button.setAttribute("aria-label", `${message("download")}: ${label}`);
    button.addEventListener("click", () => save(file, button).then(update));
    item.append(pick, button);
    return { item, pick, button };
  });

  const singleLabel = layout === "avatar" ? message("downloadAvatar") : files[0]?.type === "video" ? message("downloadVideo") : message("downloadPhoto");
  function update() {
    for (const [index, { item, pick }] of cards.entries()) {
      if (!pick) continue;
      item.classList.toggle("is-selected", selected.has(files[index]));
      pick.setAttribute("aria-pressed", String(selected.has(files[index])));
    }
    const targets = selected.size ? [...selected] : files;
    const label = single ? singleLabel : selected.size ? message("downloadSelected", selected.size) : message("downloadAllCount", files.length);
    if (!primary.dataset.busy) setPrimary(label, targets.every(file => file.saved));
    if (!single) {
      mediaCount.textContent = selected.size ? message("selectedCount", selected.size) : message("itemCount", files.length);
      selectToggle.hidden = false;
      selectToggle.textContent = message(selected.size ? "clearSelection" : "selectAll");
    }
    updateHead();
  }
  selectToggle.onclick = () => {
    if (selected.size) selected.clear();
    else files.forEach(file => selected.add(file));
    update();
  };
  primary.onclick = async () => {
    const targets = (selected.size ? [...selected] : files).filter(file => !file.saved);
    primary.dataset.busy = "1";
    primary.disabled = true;
    for (const file of targets) {
      const card = cards[files.indexOf(file)];
      if (!await save(file, card.button ?? primary)) break;
    }
    delete primary.dataset.busy;
    update();
  };
  actions.hidden = false;
  noteFile = files[0];
  updateNote();
  update();
}

// Every file of a view goes to the same folder; the line under the main button names it.
let noteFile;
function updateNote() {
  if (!noteFile) return;
  const folder = layoutFilename(noteFile.filename, settings.folderLayout).split("/").slice(0, -1).join("/");
  actionsNote.textContent = message("savesTo", `Downloads/${folder ? `${folder}/` : ""}`);
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

const profile = { username: "", userId: null, smallPicture: null, picture: null, stories: null, highlights: null, avatar: null };

function remember(result) {
  profile.userId ??= result?.userId ?? null;
  profile.smallPicture ??= result?.smallPicture ?? null;
  // The account line shows the profile header's picture, else the small one
  // from the HTML (only ever this account's; see pictureFromHtml in collect.js).
  const picture = result?.headerPicture ?? profile.smallPicture;
  if (!profile.picture && picture) {
    profile.picture = picture;
    showSource(profile.username, message("kindProfile"), picture);
  }
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
  showNote("storiesNote");
}

// Tested in October 2026 with two accounts for these profile-page requests
// only (the Stories viewer is never opened); see README.
function showNote(key) {
  mediaNote.textContent = message(key);
  mediaNote.hidden = false;
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
  showNote("highlightsNote");
}

async function showHighlight(highlight) {
  resetView(highlight.title || message("tabHighlights"));
  const ticket = currentView;
  back.hidden = false;
  updateHead();
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
  showNote("highlightsNote");
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

function showSiteLink(siteInput, label) {
  siteLink.hidden = false;
  siteLink.innerHTML = `<span></span>${icons.external}`;
  siteLink.firstChild.textContent = label;
  siteLink.onclick = event => { event.preventDefault(); openOnSite(siteInput); };
}

const kindLabels = { story: "kindStory", highlight: "kindHighlight" };

async function loadPage(tab) {
  tabId = tab?.id;
  const page = tab?.url ? pageFromUrl(tab.url) : null;
  const siteInput = tab?.url && inputFromTabUrl(tab.url);
  if (siteInput) input.value = siteInput;
  if (!page || page.kind === "other") return showStatus(message("notMediaPage")), showForm();
  if (page.kind === "profile") {
    profile.username = page.username;
    showSource(page.username, message("kindProfile"));
    showSiteLink(`@${page.username}`, message("browseOnSite"));
    tabs.hidden = false;
    return selectTab(tabButtons[0]);
  }
  if (siteInput) showSiteLink(siteInput, message("openOnSiteFooter"));
  const mediaId = page.kind === "post" ? shortcodeToId(page.shortcode) : null;
  if (page.kind === "post" && !mediaId) return showStatus(message("unavailable"));
  showStatus(message("loading"));
  const statusSiteLink = siteInput ? { label: message("openOnSite"), input: siteInput } : undefined;
  const result = await collect({ ...page, mediaId });
  if (showFailure(result, statusSiteLink)) return;
  const files = mediaFromResult(result, page);
  if (!files.length) return showStatus(message("unavailable"), statusSiteLink, result?.detail);
  status.hidden = true;
  const isReel = page.kind === "post" && /\/reels?\//.test(new URL(tab.url).pathname);
  const kind = message(isReel ? "kindReel" : kindLabels[page.kind] ?? "kindPost");
  const owner = result.items?.[0]?.user;
  title.textContent = kind;
  // Several items are counted above the grid instead.
  showSource(owner?.username ?? result.owner ?? page.username, files.length > 1 ? kind : `${kind} · ${itemsText(files)}`, owner?.profile_pic_url);
  renderMedia(files, page.kind);
}

// Tests open the popup as a normal page and pass the Instagram tab to inspect.
const testTab = Number(new URLSearchParams(location.search).get("tab"));
const query = testTab ? chrome.tabs.get(testTab).then(tab => [tab]) : chrome.tabs.query({ active: true, currentWindow: true });
query.then(([tab]) => loadPage(tab)).finally(() => { if (!form.hidden) input.focus(); });

// ---- Settings ----

function showSettings(open) {
  document.body.classList.toggle("in-settings", open);
  for (const id of ["settings", "settings-title", "settings-back"]) $(id).hidden = !open;
  $(open ? "settings-back" : "settings-open").focus();
}
$("settings-open").addEventListener("click", () => showSettings(true));
$("settings-back").addEventListener("click", () => showSettings(false));

$("version").textContent = message("version", chrome.runtime.getManifest().version);
for (const [id, href] of [["source-code", REPOSITORY], ["privacy", `${REPOSITORY}/blob/main/PRIVACY.md`]]) {
  $(id).href = href;
  $(id).target = "_blank";
  $(id).rel = "noopener";
}
$("shortcut-change").addEventListener("click", event => {
  event.preventDefault();
  chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
  window.close();
});
// There is no default shortcut; the user picks one in Chrome's shortcut settings.
chrome.commands.getAll().then(commands => {
  const keys = commands.find(command => command.name === "_execute_action")?.shortcut;
  const slot = $("shortcut-keys");
  $("shortcut-change").textContent = message(keys ? "shortcutChange" : "shortcutSet");
  if (!keys) return void (slot.textContent = message("shortcutNotSet"));
  const [before, after = ""] = message("shortcutHelp", "⁣").split("⁣");
  slot.replaceChildren(before);
  keys.split("+").forEach((key, index) => {
    if (index) slot.append(" + ");
    const kbd = document.createElement("kbd");
    kbd.textContent = key;
    slot.append(kbd);
  });
  slot.append(after);
});

// ---- On-page buttons and download folder ----

const pageButtons = $("page-buttons");
pageButtons.checked = settings.pageButtons;
pageButtons.addEventListener("change", async () => {
  settings.pageButtons = pageButtons.checked;
  await setSetting("pageButtons", pageButtons.checked);
  // Open pages follow the setting; a tab opened while the buttons were off gets them now.
  if (!pageButtons.checked || !tabId) return;
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab?.url && pageFromUrl(tab.url)) {
    await chrome.scripting.insertCSS({ target: { tabId }, files: ["src/content.css"] }).catch(() => {});
    await chrome.scripting.executeScript({ target: { tabId }, files: ["src/content.js"] }).catch(() => {});
  }
});

for (const radio of document.querySelectorAll('input[name="folder"]')) {
  radio.checked = radio.value === settings.folderLayout;
  radio.addEventListener("change", () => {
    settings.folderLayout = radio.value;
    setSetting("folderLayout", radio.value);
    updateNote();
  });
}

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
