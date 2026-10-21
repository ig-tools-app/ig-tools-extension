# Contributing

Thanks for helping. Bug reports and small, focused pull requests are welcome. Please open an issue first for larger changes.

## Ground rules

- **Saving stays local.** Media is read from the open Instagram tab and downloaded from Instagram's CDN. No requests to any other server, no analytics, no remote code. If a change affects what data is read or where it goes, update `PRIVACY.md` in the same pull request.
- **Minimal permissions.** The extension uses `activeTab`, `scripting`, `downloads` and `contextMenus`. Access to instagram.com is an optional permission, requested only when the user turns on the on-page buttons; the content script is registered at runtime while it is held (`syncPageButtons` in `src/background.js`). Never move it into `host_permissions` or a static `content_scripts` entry: that would ask every user at install and disable the extension for existing users on update. Changes that need more permissions need an issue and discussion first.
- **Describe only what is tested.** Do not add claims to the README or store copy that you have not verified on instagram.com.

## How media is fetched

All Instagram requests live in [`src/collect.js`](src/collect.js). It runs in the open tab through `chrome.scripting.executeScript` with the user's own session, and must be self-contained because Chrome serializes the function.

| Page | Request |
| --- | --- |
| Post, Reel, carousel | REST `GET /api/v1/media/<id>/info/` (shortcode to ID in `src/instagram.js`) |
| Story, profile | Account ID from `"profile_id"` in the `/<username>/` page HTML, falling back to `/api/v1/users/web_profile_info/`; then the GraphQL query `PolarisStoriesV3ReelPageGalleryQuery` |
| Highlight | GraphQL `PolarisStoriesV3HighlightsPageQuery` with `highlight:<id>` |
| Profile: Highlights tab | GraphQL `PolarisProfileStoryHighlightsTrayContentQuery` with `{ user_id }` |
| Profile: picture tab | The `<img>` instagram.com shows in the profile header, matched by the username in its alt text: it is the full-size 1080px picture and needs no request. Fallbacks: REST `GET /api/v1/users/<id>/info/` (Android app ID first, then web; often rate limited), then the 150px `profile_pic_url_hd` from the profile page HTML |

On profile pages the popup passes the account ID back to the collector after the first request, so switching tabs does not reload the profile page. Downloads go to `ig.tools/<username>/posts|stories|highlights/<title>/`; Highlight titles pass through `safeFolder` in `src/instagram.js`.

- GraphQL requests need the page's `fb_dtsg` token (`DTSGInitialData`). The `doc_id`s are hard-coded and change when Instagram updates its web app; that is the usual cause of breakage.
- `/api/v1/feed/reels_media/` answers 500 on the web (October 2026), so Stories and Highlights use GraphQL.
- Story results whose owner differs from the requested username are dropped.
- Failures return `{ reason, detail }`, and the popup shows the detail, e.g. `(story 500)`. Please include it in bug reports.
- Videos use the first progressive MP4 in `video_versions`, which carries audio. Downloads are limited to `cdninstagram.com` and `fbcdn.net` over HTTPS.

## On-page buttons

[`src/content.js`](src/content.js) is a classic content script (no imports). It only places buttons; on click it sends the post or Story address to the background, which reads and saves the media with the same code as the popup ([`src/page-media.js`](src/page-media.js)).

Instagram's markup has no stable class names and its labels are translated, so elements are found by structure (checked October 2026):

- **Action row**: a `<section>` under 64px tall with at least four labelled icons. Its last child holds the bookmark; our button goes in front of it.
- **Post address**: the `<time>` link inside a feed `<article>`; on a post page or post dialog, the page address.
- **Profile grid**: links to `/<user>/p/<code>/` or `/<user>/reel/<code>/` that contain an image. The button sits in the tile's parent and shows on hover or focus.
- **Carousel**: a `<ul>` whose `<li>` slides sit at `translateX(index × width)` inside an ancestor that clips them, each slide as wide as that frame. Post pages clip with `overflow: hidden` and move the slides; the feed scrolls the frame itself (`overflow-x: auto`), so there the button goes in the frame's non-scrolling parent. The slide on screen is the one whose left edge meets the frame; a 1px end marker at `translateX(count × width − 1)` gives the slide count. The slide button sits in the top-right corner (the other corners and edges hold Instagram's tags, sound, arrows and dots) and sends the 0-based slide index; the background keeps that one file, named as in a full download.
- **Reels player** (`/reels/`): the vertical action column (icons at one x position, spread over 100px+ vertically, no navigation links). Like, comment and repost carry counts; share, save and "more" are bare icons. The button goes between share and save, in a wrapper that copies the share item's classes so spacing and colour match. It saves the Reel in the address bar, which follows the Reel on screen.
- **Stories and Highlights**: the playing card's header, a flex row whose last child is the "more" button (24px icon) and which holds the avatar image. The button joins the sound and pause controls, before "more". A Story address names its item; for a Highlight the playing item is read from the progress bars above the header (finished bars full, the playing one partly filled via `translateX(-x%)`). If no header is found within two seconds, a floating button (top right) is the fallback.

All CSS lives in [`src/content.css`](src/content.css) under `igt-` classes; nothing else on instagram.com is restyled. A `MutationObserver` re-scans after Instagram re-renders, and processed elements are marked with `data-igt-done`.

## Popup

- Colours and radii follow the ig.tools site's design tokens, with a dark value for every colour. One primary button per view.
- Media grid: two columns for posts, three for Stories, one large card for a single item. The scroll container wraps the grid; the grid itself must not scroll, or its rows collapse and cards overlap. Chrome limits popups to 600px tall.
- The font stack lists named fonts before `system-ui`: on Chinese Windows, `system-ui` resolves to a font that draws no visible underscore at 125% scaling.
- Use logical properties (`inset-inline-*`, `margin-inline-*`); Arabic is right-to-left.

## Translations

Strings live in `_locales/<locale>/messages.json` for en, es, pt_BR, ja, ko, id, tr, ar, zh_TW and zh_CN. Every new visible string needs all ten. Keep `extDescription` at or under 132 characters.

## Tests

```bash
npm test
```

```bash
npm install
```

```bash
npm run test:e2e
```

- Unit tests (`tests/*.test.js`) cover URL parsing, shortcode conversion and response mapping.
- End-to-end tests (`tests/e2e/`) load the extension in Chromium against a stand-in instagram.com built from `tests/fixtures.js`. Chrome downloads bypass Playwright's request routing, so the CDN host is mapped to a local HTTPS server; this needs `openssl` on your path. The tests never contact Instagram.
- `POPUP_SCREENSHOTS=<dir> npm run test:e2e` saves popup screenshots in light and dark mode.
- The popup accepts `?tab=<id>` only so tests can point it at a tab.

When you change `src/collect.js`, also try it by hand: load the folder with **Load unpacked**, open the page type you changed while signed in to Instagram, and click the toolbar icon. Reload the extension at `chrome://extensions` after each change.

## Packaging

`npm run package` zips the committed `manifest.json`, `src/`, `_locales/` and `icons/` into `ig-tools-extension.zip`. Commit first; uncommitted changes are not included.

## Forks

The code is MIT licensed. The ig.tools name and icon are not; see [TRADEMARK.md](TRADEMARK.md) before publishing a fork. To point a fork at another service, change [`src/site.js`](src/site.js).
