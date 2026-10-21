// On-page download buttons for instagram.com. Registered only after the user
// turns them on in the popup (optional host permission). Runs as a classic
// content script, so it cannot import modules; the saving itself happens in
// the background (see background.js and page-media.js).
//
// Instagram's markup has no stable class names and its labels are translated,
// so elements are found by structure:
// - action row: a short <section> with 4+ labelled icons; its last child holds
//   the bookmark button. Our button goes in front of the bookmark.
// - post address: the <time> link inside a feed <article>, else the page address.
// - profile grid: links to /<user>/p/<code>/ or /<user>/reel/<code>/ with an image.
// - Stories, Highlights and the Reels player: a floating button, top right.
(() => {
  if (window.__igToolsButtons) return;
  window.__igToolsButtons = true;

  const t = key => chrome.i18n.getMessage(key);
  const svg = path => `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
  const icons = {
    download: svg('<path d="M12 4v11m-5-5 5 5 5-5M5 20h14"/>'),
    done: svg('<path d="m5 12 5 5 9-10"/>'),
    failed: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/>'),
  };
  const postPath = /\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]{5,64})\/?/;
  const postUrl = code => `https://www.instagram.com/p/${code}/`;

  function makeButton(className, url, label) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `igt-button ${className}`;
    button.dataset.igtUrl = url;
    button.innerHTML = icons.download + (label ? `<span>${label}</span>` : "");
    button.title = t("pageButtonTitle");
    button.setAttribute("aria-label", t("pageButtonTitle"));
    // The button sits inside Instagram's links and gesture areas; keep clicks to ourselves.
    for (const type of ["pointerdown", "mousedown", "touchstart"]) button.addEventListener(type, event => event.stopPropagation());
    button.addEventListener("click", onClick);
    return button;
  }

  function setState(button, state, detail) {
    button.dataset.igtState = state;
    const label = button.querySelector("span")?.outerHTML ?? "";
    button.innerHTML = (state === "done" ? icons.done : state === "failed" ? icons.failed : icons.download) + label;
    const text = state === "done" ? t("saved") : state === "failed" ? `${t("pageButtonFailed")}${detail ? ` (${detail})` : ""}` : t("pageButtonTitle");
    button.title = text;
    button.setAttribute("aria-label", text);
  }

  async function onClick(event) {
    event.preventDefault();
    event.stopPropagation();
    const button = event.currentTarget;
    if (button.dataset.igtState === "busy") return;
    setState(button, "busy");
    let response;
    try {
      response = await chrome.runtime.sendMessage({ type: "download-page-media", url: button.dataset.igtUrl });
    } catch {
      response = { reason: "failed", detail: "extension reloaded" };
    }
    if (response?.count) setState(button, "done");
    else setState(button, "failed", response?.detail ?? response?.reason);
    // The floating button follows the page, so it resets for the next Story.
    if (button.classList.contains("igt-float")) setTimeout(() => setState(button, "idle"), 2500);
  }

  function actionRows(root) {
    return [...root.querySelectorAll("section")].filter(section => {
      if (section.dataset.igtDone || section.children.length < 2) return false;
      const height = section.getBoundingClientRect().height;
      return height > 0 && height < 64 && section.querySelectorAll("svg[aria-label]").length >= 4;
    });
  }

  function postCodeFor(section) {
    const article = section.closest("article");
    const link = article?.querySelector("time")?.closest("a")?.getAttribute("href") ?? article?.querySelector('a[href*="/p/"], a[href*="/reel/"]')?.getAttribute("href");
    return (link ?? location.pathname).match(postPath)?.[1] ?? null;
  }

  function addActionButtons() {
    for (const section of actionRows(document)) {
      section.dataset.igtDone = "1";
      const code = postCodeFor(section);
      if (!code) continue;
      const bookmarkGroup = section.lastElementChild;
      bookmarkGroup.classList.add("igt-row-end");
      bookmarkGroup.prepend(makeButton("igt-action", postUrl(code)));
    }
  }

  function addGridButtons() {
    for (const link of document.querySelectorAll('main a[href*="/p/"], main a[href*="/reel/"]')) {
      if (link.dataset.igtDone || !link.querySelector("img") || link.closest("article")) continue;
      const code = link.getAttribute("href").match(postPath)?.[1];
      if (!code) continue;
      link.dataset.igtDone = "1";
      const tile = link.parentElement;
      tile.classList.add("igt-tile");
      tile.append(makeButton("igt-tile-button", postUrl(code)));
    }
  }

  // Stories and Highlights play full screen and the Reels player has its own layout;
  // one floating button saves what the address bar points at.
  function updateFloatingButton() {
    const path = location.pathname;
    const wanted = /^\/stories\//.test(path) || /^\/reels?\/[A-Za-z0-9_-]{5,64}/.test(path);
    let button = document.querySelector(".igt-float");
    if (!wanted) return button?.remove();
    const url = `https://www.instagram.com${path}`;
    if (!button) {
      button = makeButton("igt-float", url, t("download"));
      document.body.append(button);
    }
    if (button.dataset.igtUrl !== url) {
      button.dataset.igtUrl = url;
      setState(button, "idle");
    }
  }

  let scheduled = false;
  function scan() {
    scheduled = false;
    addActionButtons();
    addGridButtons();
    updateFloatingButton();
  }
  new MutationObserver(() => {
    if (!scheduled) { scheduled = true; requestAnimationFrame(scan); }
  }).observe(document.body, { childList: true, subtree: true });
  scan();
})();
