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
// - carousel: a <ul> whose <li> slides sit at translateX(index × width) inside a
//   clipping frame; the slide whose left edge meets the frame is on screen. A
//   button in the frame's top-right corner saves that slide only.
// - single photo or video: the same top-right button on the post's largest media.
// - Reels player: an item in the vertical action column, between share and save.
// - Stories and Highlights: a control in the playing card's header, before
//   "more"; a floating button only if that header is not found.
(() => {
  if (window.__igToolsButtons) return;
  window.__igToolsButtons = true;

  const t = (key, ...substitutions) => chrome.i18n.getMessage(key, substitutions.map(String));
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
    button.dataset.igtIcon = "download";
    button.title = t("pageButtonTitle");
    button.setAttribute("aria-label", t("pageButtonTitle"));
    // The button sits inside Instagram's links and gesture areas; keep clicks to ourselves.
    for (const type of ["pointerdown", "mousedown", "touchstart"]) button.addEventListener(type, event => event.stopPropagation());
    button.addEventListener("click", onClick);
    return button;
  }

  // `button.describe` (optional) gives the idle label, e.g. "Download all 6".
  // The icon is only replaced when it changes: replacing it under the pointer
  // (e.g. on hover) would swallow the click that follows.
  function setState(button, state, detail) {
    button.dataset.igtState = state;
    const icon = state === "done" || state === "failed" ? state : "download";
    if (button.dataset.igtIcon !== icon) {
      const label = button.querySelector("span")?.outerHTML ?? "";
      button.innerHTML = icons[icon] + label;
      button.dataset.igtIcon = icon;
    }
    const text = state === "done" ? t("saved") : state === "failed" ? `${t("pageButtonFailed")}${detail ? ` (${detail})` : ""}` : button.describe?.() ?? t("pageButtonTitle");
    button.title = text;
    button.setAttribute("aria-label", text);
  }

  // Refreshes an idle button's label just before the user reads or clicks it.
  function describeOnHover(button) {
    const refresh = () => { if (!button.dataset.igtState || button.dataset.igtState === "idle") setState(button, "idle"); };
    button.addEventListener("pointerenter", refresh);
    button.addEventListener("focus", refresh);
  }

  async function onClick(event) {
    event.preventDefault();
    event.stopPropagation();
    const button = event.currentTarget;
    if (button.dataset.igtState === "busy") return;
    // Slide, Reels and Story buttons save what is on screen at click time.
    const index = button.slideIndex?.() ?? null;
    const url = button.targetUrl?.() ?? button.dataset.igtUrl;
    setState(button, "busy");
    let response;
    try {
      response = await chrome.runtime.sendMessage({ type: "download-page-media", url, index });
    } catch {
      response = { reason: "failed", detail: "extension reloaded" };
    }
    if (response?.count) setState(button, "done");
    else setState(button, "failed", response?.detail ?? response?.reason);
    // These buttons follow what is on screen, so they reset for the next Story, Reel or slide.
    if (button.matches(".igt-float, .igt-slide-button, .igt-reel-button, .igt-story-button")) setTimeout(() => setState(button, "idle"), 2500);
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

  // ---- Carousels ----

  const slideOffset = li => Number((li.style.transform || "").match(/translateX\((-?\d+(?:\.\d+)?)px\)/)?.[1] ?? NaN);

  // The <ul> of slides, the element that clips it to one slide (`frame`) and the
  // element the slide button goes in (`host`). Post pages clip with
  // overflow: hidden and move slides with transforms; the feed scrolls the frame
  // itself (overflow-x: auto), so there the button sits in the frame's parent,
  // which does not scroll.
  function carouselParts(ul) {
    let frame = ul.parentElement;
    while (frame && frame !== document.body && !/hidden|clip|auto|scroll/.test(getComputedStyle(frame).overflowX)) frame = frame.parentElement;
    if (!frame || frame === document.body) return null;
    const width = frame.getBoundingClientRect().width;
    // Real slides are as wide as the frame; a Highlights tray or other list is not.
    const slides = [...ul.children].filter(li => Number.isFinite(slideOffset(li)) && Math.abs(li.getBoundingClientRect().width - width) < 2);
    if (!slides.length || width <= 0) return null;
    const scrolls = /auto|scroll/.test(getComputedStyle(frame).overflowX);
    const parent = frame.parentElement;
    const host = scrolls && parent && Math.abs(parent.getBoundingClientRect().width - width) < 2 ? parent : frame;
    return { frame, host, slides, width };
  }

  // 0-based index of the slide on screen and the number of slides. Instagram
  // renders only nearby slides plus a 1px end marker at translateX(count × width − 1).
  function slidePosition(ul) {
    const parts = carouselParts(ul);
    if (!parts) return null;
    const left = parts.frame.getBoundingClientRect().left;
    const current = parts.slides.find(li => Math.abs(li.getBoundingClientRect().left - left) < parts.width / 2) ?? parts.slides[0];
    const total = Math.max(...[...ul.children].map(li => Math.round((slideOffset(li) + li.getBoundingClientRect().width) / parts.width)).filter(Number.isFinite));
    const index = Math.round(slideOffset(current) / parts.width);
    return { index, total: Math.max(total, index + 1) };
  }

  const carouselIn = scope => [...(scope?.querySelectorAll("ul") ?? [])].find(ul => carouselParts(ul));

  function addCarouselButtons() {
    for (const ul of document.querySelectorAll("main ul, [role=dialog] ul")) {
      if (ul.dataset.igtDone) continue;
      const parts = carouselParts(ul);
      if (!parts || !ul.querySelector("img, video")) continue;
      ul.dataset.igtDone = "1";
      // Instagram may replace the list while keeping the frame: reuse the frame's button.
      const existing = parts.host.querySelector(":scope > .igt-slide-button");
      if (existing) { existing.carousel = ul; continue; }
      const article = ul.closest("article");
      const code = (article?.querySelector("time")?.closest("a")?.getAttribute("href") ?? location.pathname).match(postPath)?.[1];
      if (!code) continue;
      const button = makeButton("igt-slide-button", postUrl(code));
      button.carousel = ul;
      button.slideIndex = () => slidePosition(button.carousel)?.index ?? null;
      button.describe = () => {
        const position = slidePosition(button.carousel);
        return position ? t("pageButtonSlide", position.index + 1, position.total) : t("pageButtonTitle");
      };
      describeOnHover(button);
      parts.host.classList.add("igt-slide-frame");
      parts.host.append(button);
      clearCorner(parts.host);
    }
  }

  function addActionButtons() {
    for (const section of actionRows(document)) {
      section.dataset.igtDone = "1";
      const code = postCodeFor(section);
      if (!code) continue;
      const bookmarkGroup = section.lastElementChild;
      bookmarkGroup.classList.add("igt-row-end");
      const button = makeButton("igt-action", postUrl(code));
      // On a carousel this button saves every slide; its label says how many.
      const scope = section.closest("article, [role=dialog]") ?? document.querySelector("main");
      button.describe = () => {
        const ul = carouselIn(scope);
        const total = ul && slidePosition(ul)?.total;
        return total > 1 ? t("pageButtonAll", total) : t("pageButtonTitle");
      };
      describeOnHover(button);
      bookmarkGroup.prepend(button);
    }
  }

  // ---- Single photos and videos: the same top-right button as on carousels ----
  // From a post's action row, the post is the nearest ancestor holding a large
  // photo or video (feed posts are <article>s; post pages and dialogs are not).
  // Media inside a <li> is a carousel slide, which has its own button.
  const isLarge = el => el.getBoundingClientRect().width >= 250;
  const largestMedia = scope => [...scope.querySelectorAll("img, video")].filter(isLarge)
    .sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0];

  function addMediaButtons() {
    for (const section of document.querySelectorAll("section[data-igt-done]:not([data-igt-media])")) {
      // A few levels up at most, and never past the post; media may still be loading.
      let scope = section.parentElement, media = null;
      for (let level = 0; scope && level < 12 && !(media = largestMedia(scope)); level++) {
        if (scope.matches("article, [role=dialog], main")) break;
        scope = scope.parentElement;
      }
      if (!media) continue;
      section.dataset.igtMedia = "1";
      const code = postCodeFor(section);
      if (!code || media.closest("li")) continue;
      // The outermost wrapper the size of the media, so Instagram's overlays sit inside it.
      const box = media.getBoundingClientRect();
      let host = media.parentElement;
      while (host.parentElement && scope.contains(host.parentElement) && host.parentElement !== scope) {
        const outer = host.parentElement.getBoundingClientRect();
        if (Math.abs(outer.width - box.width) > 4 || Math.abs(outer.height - box.height) > 4) break;
        host = host.parentElement;
      }
      if (host.querySelector(":scope > .igt-media-button")) continue;
      host.classList.add("igt-slide-frame");
      host.append(makeButton("igt-slide-button igt-media-button", postUrl(code)));
      clearCorner(host);
    }
  }

  // Feed videos carry the post header (avatar, Follow, "more") over the top of
  // the media; the corner button then moves below Instagram's own controls.
  function clearCorner(host) {
    const button = host.querySelector(":scope > .igt-slide-button");
    if (!button || button.dataset.igtCorner) return;
    button.dataset.igtCorner = "1";
    host.addEventListener("pointerenter", () => {
      // Every control in the header row counts, so the button lines up under the whole row.
      const frame = host.getBoundingClientRect();
      const bottoms = [...host.querySelectorAll("a, button, [role=button], [role=link]")]
        .filter(el => !el.closest(".igt-button"))
        .map(el => el.getBoundingClientRect())
        .filter(box => box.width > 0 && box.height < 64 && box.top < frame.top + 64)
        .map(box => box.bottom - frame.top);
      button.style.insetBlockStart = bottoms.length ? `${Math.round(Math.max(...bottoms) + 8)}px` : "";
    });
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

  const currentUrl = () => `https://www.instagram.com${location.pathname}`;
  const hasIcon = el => Boolean(el.querySelector("svg[aria-label]"));

  // ---- Reels player (/reels/): the vertical action column ----
  // Like, comment and repost carry counts; share, save and "more" are bare icons.
  // The button goes between share and save, as next to the bookmark on posts, in a
  // wrapper that copies the share item's classes so spacing and colour match.
  // A Reel opened from the home feed plays in a layer outside <main>, over the
  // feed, so the whole page is searched. Items must be icon-sized: the feed's
  // own column of posts is also a vertical stack.
  function addReelButtons() {
    if (!location.pathname.startsWith("/reels/")) return;
    for (const column of document.querySelectorAll("div")) {
      if (column.dataset.igtDone || column.children.length < 4) continue;
      const items = [...column.children].filter(hasIcon);
      if (items.length < 4 || items.some(item => item.querySelector("[role=link] svg"))) continue;
      const boxes = items.map(item => item.getBoundingClientRect());
      if (boxes.some(box => box.width > 80 || box.height > 80)) continue;
      const lefts = boxes.map(box => box.left), tops = boxes.map(box => box.top);
      if (Math.max(...lefts) - Math.min(...lefts) > 12 || Math.max(...tops) - Math.min(...tops) < 100) continue;
      column.dataset.igtDone = "1";
      const bare = items.filter(item => !item.innerText.trim());
      const wrapper = document.createElement("div");
      wrapper.className = (bare[0] ?? items[0]).className;
      const button = makeButton("igt-reel-button", currentUrl());
      // The address bar follows the Reel on screen as the user scrolls.
      button.targetUrl = currentUrl;
      wrapper.append(button);
      if (bare.length >= 3) column.insertBefore(wrapper, bare[1]);
      else column.prepend(wrapper);
    }
  }

  // ---- Stories and Highlights: the header of the playing card ----
  // A flex row: avatar and name, then sound and pause controls, then the "more"
  // button (24px icon). The button joins the controls, before "more".
  function storyHeaderRows() {
    return [...document.querySelectorAll("div")].filter(row => {
      if (row.dataset.igtDone || row.children.length < 2 || getComputedStyle(row).display !== "flex") return false;
      const more = row.lastElementChild;
      const moreIcon = more?.matches("[role=button]") && more.querySelector("svg[aria-label]");
      return moreIcon && Math.round(moreIcon.getBoundingClientRect().width) === 24 && row.querySelector("img") && row.querySelectorAll("svg[aria-label]").length >= 2;
    });
  }

  // 0-based index of the playing item, from the progress bars above the header:
  // finished bars are full, the playing one is partly filled (translateX(-x%)).
  function storyIndex(row) {
    let card = row;
    for (let level = 0; level < 6 && card; level++, card = card.parentElement) {
      const bars = [...card.querySelectorAll("div")].filter(d => { const r = d.getBoundingClientRect(); return r.height > 0 && r.height <= 4 && r.width >= row.getBoundingClientRect().width * 0.6; })
        .sort((a, b) => b.children.length - a.children.length)[0];
      if (!bars?.children.length) continue;
      const fills = [...bars.children].map(segment => {
        const moved = [segment, ...segment.querySelectorAll("*")].find(el => /translateX\(/.test(el.style.transform || ""));
        return moved ? 100 + Number(moved.style.transform.match(/translateX\((-?[\d.]+)%\)/)?.[1] ?? -100) : 0;
      });
      const finished = fills.filter(fill => fill >= 99.5).length;
      return Math.min(finished, fills.length - 1);
    }
    return null;
  }

  function addStoryButtons() {
    if (!location.pathname.startsWith("/stories/")) return;
    const rows = storyHeaderRows();
    // Desktop shows neighbouring Stories as small previews; the playing card is the widest.
    const row = rows.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
    if (!row) return;
    row.dataset.igtDone = "1";
    const button = makeButton("igt-story-button", currentUrl());
    button.targetUrl = currentUrl;
    // A Story address names its item; a Highlight address does not, so the progress bars tell.
    button.slideIndex = () => (/^\/stories\/(?!highlights\/)[^/]+\/\d+/.test(location.pathname) ? null : storyIndex(row));
    const controls = row.lastElementChild.previousElementSibling;
    if (controls?.querySelector("[role=button]") && getComputedStyle(controls).display === "flex") controls.append(button);
    else row.insertBefore(button, row.lastElementChild);
  }

  // Fallback when the Story header is not found (e.g. after an Instagram redesign):
  // a floating button for the address in the address bar.
  let storyPageSince = 0;
  function updateFloatingButton() {
    const button = document.querySelector(".igt-float");
    if (!location.pathname.startsWith("/stories/")) {
      storyPageSince = 0;
      return button?.remove();
    }
    if (document.querySelector(".igt-story-button")) return button?.remove();
    storyPageSince ||= Date.now();
    if (Date.now() - storyPageSince < 2000) return setTimeout(schedule, 2100);
    if (button) return;
    const floating = makeButton("igt-float", currentUrl(), t("download"));
    floating.targetUrl = currentUrl;
    document.body.append(floating);
  }

  let scheduled = false;
  function scan() {
    scheduled = false;
    addActionButtons();
    addCarouselButtons();
    addMediaButtons();
    addGridButtons();
    addReelButtons();
    addStoryButtons();
    updateFloatingButton();
  }
  function schedule() {
    if (!scheduled) { scheduled = true; requestAnimationFrame(scan); }
  }
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  scan();
})();
