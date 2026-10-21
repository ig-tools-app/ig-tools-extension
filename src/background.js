import { siteUrl, inputFromTabUrl } from "./site.js";
import { mediaForUrl } from "./page-media.js";

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

// ---- On-page download buttons (optional) ----
// The buttons need access to instagram.com, an optional permission the user
// grants from the popup. The content script is registered only while it is held.

const instagramOrigins = ["https://www.instagram.com/*"];
const pageButtonsScript = {
  id: "page-buttons",
  matches: instagramOrigins,
  js: ["src/content.js"],
  css: ["src/content.css"],
  runAt: "document_idle",
  persistAcrossSessions: true,
};

async function syncPageButtons() {
  const enabled = await chrome.permissions.contains({ origins: instagramOrigins });
  const registered = (await chrome.scripting.getRegisteredContentScripts({ ids: [pageButtonsScript.id] })).length > 0;
  if (enabled && !registered) await chrome.scripting.registerContentScripts([pageButtonsScript]);
  if (!enabled && registered) await chrome.scripting.unregisterContentScripts({ ids: [pageButtonsScript.id] });
  return enabled;
}

chrome.runtime.onStartup.addListener(syncPageButtons);
chrome.permissions.onAdded.addListener(syncPageButtons);
chrome.permissions.onRemoved.addListener(syncPageButtons);

// A button on an Instagram page asks for the media at `url` (a post, Story or
// Highlight address). The media is read in that tab and saved here.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "page-buttons-sync") {
    syncPageButtons().then(enabled => sendResponse({ enabled }));
    return true;
  }
  if (message?.type !== "download-page-media" || !sender.tab?.id) return false;
  (async () => {
    const media = await mediaForUrl(sender.tab.id, message.url, Number.isInteger(message.index) ? message.index : null);
    if (!media.files) return sendResponse(media);
    try {
      for (const file of media.files) await chrome.downloads.download({ url: file.url, filename: file.filename, conflictAction: "uniquify" });
      sendResponse({ count: media.files.length });
    } catch (error) {
      sendResponse({ reason: "failed", detail: `download ${error?.message ?? ""}`.trim() });
    }
  })();
  return true;
});
