import { instagramInput, inputFromTabUrl, siteUrl } from "./site.js";

const message = (key) => chrome.i18n.getMessage(key);
const form = document.getElementById("form");
const input = document.getElementById("input");
const error = document.getElementById("error");

document.documentElement.lang = message("@@ui_locale").replace("_", "-");
document.documentElement.dir = message("@@bidi_dir");
for (const element of document.querySelectorAll("[data-i18n]")) element.textContent = message(element.dataset.i18n);
input.placeholder = message("placeholder");

// Clicking the toolbar icon grants activeTab, so the current Instagram page can be prefilled.
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  const current = tab?.url && inputFromTabUrl(tab.url);
  if (current && !input.value) input.value = current;
  input.focus();
  input.select();
});

input.addEventListener("input", () => { error.hidden = true; input.removeAttribute("aria-invalid"); });

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = instagramInput(input.value);
  if (!value) {
    error.hidden = false;
    input.setAttribute("aria-invalid", "true");
    input.focus();
    return;
  }
  chrome.tabs.create({ url: siteUrl(value, chrome.i18n.getUILanguage()) });
  window.close();
});
