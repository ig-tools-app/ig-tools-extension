// User settings, kept in chrome.storage.local and changed in the popup.
// pageButtons: show download buttons on instagram.com (on by default).
// folderLayout: where files go: "account", "folder" or "downloads" (see layoutFilename in instagram.js).
export const defaults = { pageButtons: true, folderLayout: "account" };

export async function getSettings() {
  return { ...defaults, ...await chrome.storage.local.get(Object.keys(defaults)) };
}

export const setSetting = (key, value) => chrome.storage.local.set({ [key]: value });
