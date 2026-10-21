import { instagramInput, inputFromTabUrl, siteUrl } from "./site.js";
import { mediaFromResult, pageFromUrl, shortcodeToId } from "./instagram.js";
import { collectFromPage } from "./collect.js";

const message = (key, ...substitutions) => chrome.i18n.getMessage(key, substitutions.map(String));
const $ = id => document.getElementById(id);
const form = $("form"), input = $("input"), error = $("error");
const mediaSection = $("media"), grid = $("grid"), downloadAll = $("download-all");
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

function openOnSite(value) {
  chrome.tabs.create({ url: siteUrl(value, chrome.i18n.getUILanguage()) });
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
    statusLink.onclick = event => { event.preventDefault(); openOnSite(link.input); };
  }
}

// With media on screen, saving is the main action and ig.tools becomes the secondary one.
function demoteSiteForm() {
  $("open").className = "secondary";
  $("form-title").hidden = false;
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

function renderMedia(files, kind) {
  mediaSection.hidden = false;
  grid.className = `grid${files.length === 1 ? " is-single" : ""}${kind === "post" ? "" : " is-story"}`;
  let photos = 0, videos = 0;
  const buttons = files.map(file => {
    const label = file.type === "video" ? message("videoLabel", ++videos) : message("photoLabel", ++photos);
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
  demoteSiteForm();
}

async function loadPage(tab) {
  const page = tab?.url ? pageFromUrl(tab.url) : null;
  const siteInput = tab?.url && inputFromTabUrl(tab.url);
  if (siteInput) input.value = siteInput;
  if (!page) return;
  if (page.kind === "other") return showStatus(message("notMediaPage"));
  // On a profile, the account's current Stories are listed without opening them.
  const isProfile = page.kind === "profile";
  const request = isProfile ? { kind: "story", username: page.username, storyId: null } : page;
  const mediaId = request.kind === "post" ? shortcodeToId(request.shortcode) : null;
  if (request.kind === "post" && !mediaId) return showStatus(message("unavailable"));
  showStatus(message("loading"));
  const siteLink = isProfile ? { label: message("browseOnSite"), input: `@${page.username}` }
    : siteInput ? { label: message("openOnSite"), input: siteInput } : undefined;
  let result;
  try {
    [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: collectFromPage, args: [{ ...request, mediaId }] });
  } catch (scriptError) {
    return showStatus(message("failed"), siteLink, `script ${scriptError?.message ?? ""}`.trim());
  }
  if (result?.reason === "login") return showStatus(message("loginNeeded"), siteLink, result.detail);
  if (result?.reason === "failed") return showStatus(message("failed"), siteLink, result.detail);
  const files = mediaFromResult(result);
  if (!files.length) return showStatus(message(isProfile ? "noStories" : "unavailable"), siteLink, result?.detail);
  status.hidden = true;
  if (isProfile) $("media-title").textContent = message("currentStories");
  renderMedia(files, request.kind);
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
