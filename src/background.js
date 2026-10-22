import { siteUrl, inputFromTabUrl } from "./site.js";
import { mediaForUrl } from "./page-media.js";
import { layoutFilename } from "./instagram.js";
import { getSettings } from "./settings.js";

const instagramPages = ["*://instagram.com/*", "*://*.instagram.com/*"];

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "open-link",
      title: chrome.i18n.getMessage("menuOpenLink"),
      contexts: ["link"],
      targetUrlPatterns: instagramPages,
    });
    chrome.contextMenus.create({
      id: "open-page",
      title: chrome.i18n.getMessage("menuOpenPage"),
      contexts: ["page"],
      documentUrlPatterns: instagramPages,
    });
  });
  syncPageButtons();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const input = inputFromTabUrl(info.menuItemId === "open-link" ? info.linkUrl : info.pageUrl);
  if (!input) return;
  chrome.tabs.create({ url: siteUrl(input, chrome.i18n.getUILanguage()), index: tab ? tab.index + 1 : undefined });
});

// ---- On-page download buttons ----
// On by default; the popup's switch stores the choice and the content script is
// registered only while it is on. Pages already open follow the setting through
// storage.onChanged in content.js.

const pageButtonsScript = {
  id: "page-buttons",
  matches: ["https://www.instagram.com/*"],
  js: ["src/content.js"],
  css: ["src/content.css"],
  runAt: "document_idle",
  persistAcrossSessions: true,
};

async function syncPageButtons() {
  const { pageButtons: enabled } = await getSettings();
  const registered = (await chrome.scripting.getRegisteredContentScripts({ ids: [pageButtonsScript.id] })).length > 0;
  if (enabled && !registered) await chrome.scripting.registerContentScripts([pageButtonsScript]);
  if (!enabled && registered) await chrome.scripting.unregisterContentScripts({ ids: [pageButtonsScript.id] });
  return enabled;
}

chrome.runtime.onStartup.addListener(syncPageButtons);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && "pageButtons" in changes) syncPageButtons();
});

// A button on an Instagram page asks for the media at `url` (a post, Story or
// Highlight address). The media is read in that tab and saved here.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "download-page-media" || !sender.tab?.id) return false;
  (async () => {
    const media = await mediaForUrl(sender.tab.id, message.url, Number.isInteger(message.index) ? message.index : null);
    if (!media.files) return sendResponse(media);
    const { folderLayout } = await getSettings();
    try {
      for (const file of media.files) await chrome.downloads.download({ url: file.url, filename: layoutFilename(file.filename, folderLayout), conflictAction: "uniquify" });
      sendResponse({ count: media.files.length });
    } catch (error) {
      sendResponse({ reason: "failed", detail: `download ${error?.message ?? ""}`.trim() });
    }
  })();
  return true;
});
