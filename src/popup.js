import { REPOSITORY, instagramInput, inputFromTabUrl, siteUrl } from "./site.js";
import { avatarFile, highlightsFromResult, layoutFilename, mediaFromResult, pageFromUrl, safeMediaUrl, shortcodeToId } from "./instagram.js";
import { collectFromPage } from "./collect.js";
import { getSettings, setSetting } from "./settings.js";

const settings = await getSettings();

const message = (key, ...substitutions) => chrome.i18n.getMessage(key, substitutions.map(String));
// Usernames and paths are left-to-right text; isolated, they keep their order
// inside Arabic (otherwise "@natgeo" shows as "natgeo@").
const ltr = text => `\u2068${text}\u2069`;
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
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>',
  soundOn: svg('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
  muted: svg('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  back: svg('<path d="m15 18-6-6 6-6"/>'),
  next: svg('<path d="m9 6 6 6-6 6"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  eyeOff: svg('<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c5 0 9 4.5 10 7a12 12 0 0 1-2.6 3.6M6.6 6.6A12.5 12.5 0 0 0 2 12c1 2.5 5 7 10 7a9.6 9.6 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
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
$("viewer-close").innerHTML = icons.close;
$("viewer-prev").innerHTML = icons.back;
$("viewer-next").innerHTML = icons.next;
document.querySelector(".anon-icon").innerHTML = icons.eyeOff;
document.querySelector(".field-icon").innerHTML = icons.link;

// `tool` is an ig.tools page slug, e.g. the profile picture downloader.
function openOnSite(value, tool) {
  chrome.tabs.create({ url: siteUrl(value, chrome.i18n.getUILanguage(), tool) });
  window.close();
}

// `detail` is the failed request and its status, e.g. "stories 429", to quote in
// a bug report. `retry` (optional) runs the view again from a "Try again" button.
function showStatus(text, link, detail, retry) {
  status.hidden = false;
  statusText.textContent = text;
  const again = $("status-retry");
  again.hidden = !retry;
  again.onclick = retry ? () => { again.hidden = true; retry(); } : null;
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
  $("source-name").textContent = ltr(`@${username}`);
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
  const labels = [];
  // Saving from the viewer goes through the card's own button, so both show the result.
  const saveAt = async index => {
    await save(files[index], cards[index].button ?? primary);
    update();
  };
  const cards = files.map((file, index) => {
    const label = layout === "avatar" ? message("tabAvatar") : file.type === "video" ? message("videoLabel", ++videos) : message("photoLabel", ++photos);
    labels.push(label);
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
    const open = document.createElement("button");
    open.type = "button";
    open.className = "open";
    open.setAttribute("aria-label", `${message("view")}: ${label}`);
    open.addEventListener("click", () => openViewer({ files, index, labels, saveAt, opener: open }));
    item.append(open);
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
  actionsNote.textContent = message("savesTo", ltr(`Downloads/${folder ? `${folder}/` : ""}`));
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
// When Instagram did not respond, `retry` runs the view again.
function showFailure(result, link, retry) {
  if (result?.reason === "login") return showStatus(message("loginNeeded"), link, result.detail), true;
  if (result?.reason === "failed") return showStatus(message("failed"), link, result.detail, retry), true;
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
    if (showFailure(result, browseLink(), showStoriesTab)) return;
    profile.stories = mediaFromResult(result, { kind: "story" });
    profile.storiesDetail = result?.detail;
  }
  if (!profile.stories.length) return showStatus(message("noStories"), browseLink(), profile.storiesDetail);
  status.hidden = true;
  renderMedia(profile.stories, "story");
  showAnonymousBadge();
}

// Tested in October 2026 with two accounts for these profile-page requests
// only (Instagram's Stories viewer is never opened); see README.
function showAnonymousBadge() {
  $("media-note-text").textContent = message("anonymousBadge");
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
    if (showFailure(result, browseLink(), showHighlightsTab)) return;
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
  showAnonymousBadge();
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
    if (showFailure(result, browseLink(), () => showHighlight(highlight))) return;
    highlight.files = mediaFromResult({ ...result, owner: result.owner ?? profile.username }, { kind: "highlight", title: highlight.title, highlightId: highlight.id });
  }
  if (!highlight.files.length) return showStatus(message("unavailable"), browseLink());
  status.hidden = true;
  renderMedia(highlight.files, "story");
  showAnonymousBadge();
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
    if (showFailure(result, browseLink(), showAvatarTab)) return;
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

// ---- Viewer: one item at a time, over the whole popup ----
// Photos load the full-size file and videos play from Instagram's CDN, the
// same files a download saves. Instagram's own Stories viewer is never opened.

const viewer = $("viewer"), stage = $("viewer-stage"), viewerSave = $("viewer-save");
let viewing = null;

// Opening the viewer grows the popup to 600px. Chrome resizes popups a moment
// later, and a video laid out before that keeps squeezed controls, so the
// media goes in once the window has its full height (or after 300ms).
async function openViewer(state) {
  viewing = state;
  document.body.classList.add("viewing");
  viewer.hidden = false;
  // The viewer itself takes focus: Space then plays and pauses instead of
  // pressing the close button.
  viewer.focus();
  await readInstagramSound();
  if (innerHeight < 590) {
    await new Promise(resolve => {
      const done = () => { removeEventListener("resize", check); resolve(); };
      const check = () => { if (innerHeight >= 590) done(); };
      addEventListener("resize", check);
      setTimeout(done, 300);
    });
  }
  if (viewing === state) showViewerItem();
}

function showViewerItem() {
  const { files, index, labels } = viewing;
  const file = files[index];
  // `media` is what goes on the stage: the photo, or a frame holding the video
  // and its control bar. `source` is the <img> or <video> itself.
  let media, source;
  if (file.type === "video") {
    source = document.createElement("video");
    source.src = file.url;
    if (file.previewUrl) source.poster = file.previewUrl;
    source.autoplay = true;
    source.playsInline = true;
    source.setAttribute("aria-label", labels[index]);
    // Like Instagram's viewer, a finished video moves on to the next item.
    source.addEventListener("ended", () => moveViewer(1));
    media = videoFrame(source);
  } else {
    media = source = document.createElement("img");
    source.src = file.url;
    source.alt = labels[index];
  }
  // The box gets the file's shape before it is shown. Story videos have no
  // size in Instagram's response (instagram.js takes the cover's); if one is
  // still unknown, it is shown once its metadata (or, after 3s, an error) arrives.
  const show = () => {
    if (viewing?.files[viewing.index] !== file) return;
    fitMedia(media, file, source);
    stage.replaceChildren(media);
  };
  if (file.width && file.height) show();
  else if (file.type === "video") {
    stage.replaceChildren();
    source.preload = "metadata";
    const timer = setTimeout(show, 3000);
    source.addEventListener("loadedmetadata", () => { clearTimeout(timer); show(); }, { once: true });
    source.addEventListener("error", () => { clearTimeout(timer); show(); }, { once: true });
  } else {
    show();
    source.addEventListener("load", () => fitMedia(media, file, source), { once: true });
  }
  $("viewer-position").textContent = `${index + 1} / ${files.length}`;
  $("viewer-prev").hidden = index === 0;
  $("viewer-next").hidden = index === files.length - 1;
  updateViewerSave();
}

// The largest box with the file's shape that fits the stage. `source` is the
// <img> or <video>, for its natural size when the file has none.
function fitMedia(media, file, source = media) {
  const width = file.width || source.videoWidth || source.naturalWidth;
  const height = file.height || source.videoHeight || source.naturalHeight;
  const room = { width: stage.clientWidth - 16, height: stage.clientHeight };
  if (!width || !height || room.width <= 0 || room.height <= 0) {
    media.style.width = media.style.height = "100%";
    return;
  }
  const scale = Math.min(room.width / width, room.height / height);
  media.style.width = `${Math.floor(width * scale)}px`;
  media.style.height = `${Math.floor(height * scale)}px`;
}
addEventListener("resize", () => {
  const media = stage.firstElementChild;
  if (viewing && media) fitMedia(media, viewing.files[viewing.index], media.querySelector("video") ?? media);
});

// Videos start with Instagram's sound: the volume it remembers for this
// browser (localStorage "ig_volume_settings", e.g. {"volume":0.28}) and its
// mute state, which Instagram keeps only in memory and applies to every video
// on the page. So mute is read from the page's playing (or any) video; on a
// page without one, from what content.js saw while the page was open; and
// otherwise it is muted, as Instagram starts after a page load. Read from the
// open Instagram tab once per popup, never written.
const sound = { volume: 1, muted: true, read: false };

async function readInstagramSound() {
  if (sound.read || !tabId) return;
  sound.read = true;
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        let volume = null;
        try { volume = JSON.parse(localStorage.getItem("ig_volume_settings"))?.volume ?? null; } catch { /* no setting */ }
        const videos = [...document.querySelectorAll("video")].filter(video => video.getBoundingClientRect().width > 0);
        const live = videos.find(video => !video.paused) ?? videos[0];
        return { volume, muted: live ? live.muted : window.__igtSound?.muted ?? null };
      },
    });
    const volume = Number(result?.volume);
    if (result?.volume !== null && volume >= 0 && volume <= 1) sound.volume = volume;
    if (typeof result?.muted === "boolean") sound.muted = result.muted;
    if (sound.volume === 0) sound.muted = true;
  } catch {
    // Not an Instagram tab: muted at full volume.
  }
}

// Our own control bar: Chrome draws no usable native video controls inside a
// toolbar popup (only a sliver in the corner), in any size or state.
const clock = seconds => Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}` : "0:00";

function videoFrame(video) {
  const frame = document.createElement("div");
  frame.className = "viewer-frame";
  const bar = document.createElement("div");
  bar.className = "video-controls";
  bar.innerHTML = `<button type="button" class="vc-play"></button><input class="vc-seek" type="range" min="0" max="1000" step="1" value="0"><span class="vc-time">0:00 / 0:00</span><button type="button" class="vc-mute"></button><input class="vc-volume" type="range" min="0" max="100" step="1">`;
  const [play, seek, time, mute, level] = bar.children;
  seek.setAttribute("aria-label", message("seek"));
  level.setAttribute("aria-label", message("volume"));
  video.volume = sound.volume;
  video.muted = sound.muted;
  const update = () => {
    const playing = !video.paused && !video.ended;
    play.innerHTML = playing ? icons.pause : icons.play;
    play.setAttribute("aria-label", message(playing ? "pause" : "play"));
    const silent = video.muted || video.volume === 0;
    mute.innerHTML = silent ? icons.muted : icons.soundOn;
    mute.setAttribute("aria-label", message(silent ? "unmute" : "mute"));
    level.value = silent ? 0 : Math.round(video.volume * 100);
    if (!seek.matches(":active")) seek.value = video.duration ? Math.round(video.currentTime / video.duration * 1000) : 0;
    time.textContent = `${clock(video.currentTime)} / ${clock(video.duration)}`;
  };
  const toggle = () => (video.paused || video.ended ? video.play().catch(() => {}) : video.pause());
  for (const type of ["play", "pause", "ended", "timeupdate", "durationchange", "volumechange", "loadedmetadata"]) video.addEventListener(type, update);
  play.addEventListener("click", toggle);
  video.addEventListener("click", toggle);
  // Sound changes carry over to the next video in this popup.
  mute.addEventListener("click", () => {
    if (video.muted || video.volume === 0) {
      video.muted = false;
      if (video.volume === 0) video.volume = 0.5;
    } else video.muted = true;
    Object.assign(sound, { volume: video.volume, muted: video.muted });
  });
  level.addEventListener("input", () => {
    video.volume = level.value / 100;
    video.muted = video.volume === 0;
    Object.assign(sound, { volume: video.volume, muted: video.muted });
  });
  seek.addEventListener("input", () => {
    if (video.duration) video.currentTime = seek.value / 1000 * video.duration;
    time.textContent = `${clock(video.currentTime)} / ${clock(video.duration)}`;
  });
  update();
  frame.append(video, bar);
  return frame;
}

function updateViewerSave() {
  const file = viewing.files[viewing.index];
  viewerSave.innerHTML = `${file.saved ? icons.done : icons.download}<span></span>`;
  viewerSave.lastChild.textContent = message(file.saved ? "saved" : "download");
  viewerSave.classList.toggle("is-done", Boolean(file.saved));
  viewerSave.disabled = Boolean(file.saved);
}

function moveViewer(step) {
  const index = viewing ? viewing.index + step : -1;
  if (index < 0 || index >= viewing.files.length) return;
  viewing.index = index;
  showViewerItem();
}

function closeViewer() {
  stage.replaceChildren();
  viewer.hidden = true;
  document.body.classList.remove("viewing");
  const { opener } = viewing;
  viewing = null;
  opener?.focus();
}

$("viewer-close").addEventListener("click", closeViewer);
$("viewer-prev").addEventListener("click", () => moveViewer(-1));
$("viewer-next").addEventListener("click", () => moveViewer(1));
viewerSave.addEventListener("click", async () => {
  const state = viewing;
  viewerSave.disabled = true;
  await state.saveAt(state.index);
  if (viewing === state) updateViewerSave();
});
document.addEventListener("keydown", event => {
  if (!viewing) return;
  // Arrow keys on the progress bar seek; elsewhere they change the item.
  if (event.target.matches?.('input[type="range"]') && event.key.startsWith("Arrow")) return;
  const rtl = document.documentElement.dir === "rtl" ? -1 : 1;
  const video = stage.querySelector("video");
  if (event.key === " " && video && !event.target.closest?.("button, input")) video.paused ? video.play().catch(() => {}) : video.pause();
  else if (event.key === "Escape") closeViewer();
  else if (event.key === "ArrowRight") moveViewer(rtl);
  else if (event.key === "ArrowLeft") moveViewer(-rtl);
  else return;
  event.preventDefault();
});

// ---- Entry point ----

function showSiteLink(siteInput, label) {
  siteLink.hidden = false;
  siteLink.innerHTML = `<span></span>${icons.external}`;
  siteLink.firstChild.textContent = label;
  siteLink.onclick = event => { event.preventDefault(); openOnSite(siteInput); };
}

const kindLabels = { story: "kindStory", highlight: "kindHighlight" };

// On a Story or Highlight page Instagram's viewer is already open, so the view
// is recorded. The tip says so and offers the account's profile, where the
// Stories and Highlights tabs fetch without opening the viewer.
function showStoryTip(username) {
  $("story-tip").hidden = false;
  $("story-tip-text").textContent = message("storyPageTip");
  const open = $("story-tip-open");
  open.hidden = !username;
  if (!username) return;
  open.textContent = message("openProfile", ltr(username));
  open.onclick = () => {
    chrome.tabs.update(tabId, { url: `https://www.instagram.com/${encodeURIComponent(username)}/` });
    window.close();
  };
}

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
  if (page.kind === "story") showStoryTip(page.username);
  if (page.kind === "highlight") showStoryTip(null);
  const mediaId = page.kind === "post" ? shortcodeToId(page.shortcode) : null;
  if (page.kind === "post" && !mediaId) return showStatus(message("unavailable"));
  showStatus(message("loading"));
  const statusSiteLink = siteInput ? { label: message("openOnSite"), input: siteInput } : undefined;
  const result = await collect({ ...page, mediaId });
  if (showFailure(result, statusSiteLink, () => loadPage(tab))) return;
  const files = mediaFromResult(result, page);
  if (!files.length) return showStatus(message("unavailable"), statusSiteLink, result?.detail);
  status.hidden = true;
  const isReel = page.kind === "post" && /\/reels?\//.test(new URL(tab.url).pathname);
  const kind = message(isReel ? "kindReel" : kindLabels[page.kind] ?? "kindPost");
  const owner = result.items?.[0]?.user;
  if (page.kind === "highlight") showStoryTip(owner?.username ?? result.owner);
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
  const [before, after = ""] = message("shortcutHelp", "\u2063").split("\u2063");
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
