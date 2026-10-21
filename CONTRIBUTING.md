# Contributing

Thanks for helping. Bug reports and small, focused pull requests are welcome. Please open an issue first for larger changes.

## Ground rules

- **Saving stays local.** Media is read from the open Instagram tab and downloaded from Instagram's CDN. No requests to any other server, no analytics, no remote code. If a change affects what data is read or where it goes, update `PRIVACY.md` in the same pull request.
- **Minimal permissions.** The extension uses `activeTab`, `scripting`, `downloads` and `contextMenus`, with no host permissions and no content scripts. Changes that need more permissions need an issue and discussion first.
- **Describe only what is tested.** Do not add claims to the README or store copy that you have not verified on instagram.com.

## How media is fetched

All Instagram requests live in [`src/collect.js`](src/collect.js). It runs in the open tab through `chrome.scripting.executeScript` with the user's own session, and must be self-contained because Chrome serializes the function.

| Page | Request |
| --- | --- |
| Post, Reel, carousel | REST `GET /api/v1/media/<id>/info/` (shortcode to ID in `src/instagram.js`) |
| Story, profile | Account ID from `"profile_id"` in the `/<username>/` page HTML, falling back to `/api/v1/users/web_profile_info/`; then the GraphQL query `PolarisStoriesV3ReelPageGalleryQuery` |
| Highlight | GraphQL `PolarisStoriesV3HighlightsPageQuery` with `highlight:<id>` |

- GraphQL requests need the page's `fb_dtsg` token (`DTSGInitialData`). The `doc_id`s are hard-coded and change when Instagram updates its web app; that is the usual cause of breakage.
- `/api/v1/feed/reels_media/` answers 500 on the web (October 2026), so Stories and Highlights use GraphQL.
- Story results whose owner differs from the requested username are dropped.
- Failures return `{ reason, detail }`, and the popup shows the detail, e.g. `(story 500)`. Please include it in bug reports.
- Videos use the first progressive MP4 in `video_versions`, which carries audio. Downloads are limited to `cdninstagram.com` and `fbcdn.net` over HTTPS.

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
