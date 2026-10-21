import { siteUrl, inputFromTabUrl } from "./site.js";

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
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const input = inputFromTabUrl(info.menuItemId === "open-link" ? info.linkUrl : info.pageUrl);
  if (!input) return;
  chrome.tabs.create({ url: siteUrl(input, chrome.i18n.getUILanguage()), index: tab ? tab.index + 1 : undefined });
});
