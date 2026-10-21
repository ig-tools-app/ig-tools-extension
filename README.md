# ig.tools for Chrome

Save photos, videos, Reels and Stories from the Instagram page you have open, straight from your browser. When you are signed out, or want to look without signing in, open the same link in [ig.tools](https://ig.tools/).

- **Save from this page**: open a post, Reel, Story or Highlight on instagram.com and click the toolbar icon. The popup lists every photo and video on that page; save one or all of them.
- **Profile pages**: three tabs. **Stories** lists the account's current Stories, so you can save them without opening the Stories viewer. Saving them this way doesn't add you to the Story's viewer list (tested in October 2026; Instagram may change this). If you open a Story in Instagram itself, Instagram records the view as usual. **Highlights** lists the account's Highlights; open one to save its items. **Profile picture** saves the full-size picture shown on the profile.
- **Open in ig.tools**: paste any Instagram link or `@username` in the popup, or right-click an Instagram link and choose "Open link with ig.tools".
- **Shortcut**: <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> opens the popup. If another extension already uses it, Chrome leaves it unset; choose your own at `chrome://extensions/shortcuts`.
- **Tidy downloads**: files go to `Downloads/ig.tools/<username>/` with `posts/`, `stories/` and `highlights/<title>/` folders.
- 10 languages, light and dark themes.

Saving happens locally: the extension asks Instagram for the media on the open page using your existing Instagram session in this browser, and Chrome downloads the files from Instagram's servers. Nothing is sent to ig.tools or anywhere else. See [PRIVACY.md](PRIVACY.md).

> Not affiliated with Instagram or Meta. Save only content you own or have permission to save.

## Permissions

| Permission | Why |
| --- | --- |
| `activeTab` | Access to the current tab is granted only when you click the toolbar icon, and only for that tab. |
| `scripting` | With that access, read the media on the open Instagram page (one request to Instagram's own web API). |
| `downloads` | Save the files you choose to your Downloads folder. |
| `contextMenus` | Add "Open link with ig.tools" and "Open this page with ig.tools" to the right-click menu. |

There are no host permissions and no content scripts: the extension cannot see any page until you click its icon.

## How saving works

1. [`src/instagram.js`](src/instagram.js) works out what the open page is (post, Reel, Story, Highlight, profile) from its address.
2. [`src/collect.js`](src/collect.js) runs once in that tab and calls the same endpoints instagram.com uses, with your session: `/api/v1/media/<id>/info/` for posts and Reels, and the GraphQL queries of instagram.com's own Stories viewer for Stories and Highlights.
3. The popup turns the response into files with [`mediaFromResult`](src/instagram.js). Videos use the largest MP4 Instagram provides with sound; nothing is re-encoded.

When Instagram changes these endpoints, `src/collect.js` is the file to update.

## Install from source

1. Clone this repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Choose **Load unpacked** and select the repository folder.

## Develop

Plain JavaScript, no build step. The extension itself has no dependencies; Playwright is only used by the end-to-end tests.

```bash
npm test
```

```bash
npm install
```

```bash
npm run test:e2e
```

The end-to-end tests load the extension in Chromium, serve a stand-in instagram.com with fixture responses, and check listing and downloading. They never contact Instagram.

```bash
npm run package
```

`npm run package` zips the committed `manifest.json`, `src/`, `_locales/` and `icons/` into `ig-tools-extension.zip` for store upload. Commit your changes first.

Translations live in `_locales/<locale>/messages.json`. The popup wording matches the ig.tools site so both read the same.

### Using another service

All ig.tools-specific behaviour is in [`src/site.js`](src/site.js). Change `SITE` (and the locale paths if needed) to point the extension at your own service. If you publish a fork, please read [TRADEMARK.md](TRADEMARK.md) first.

## License

The code is released under the [MIT License](LICENSE). The ig.tools name and logo are not covered by it; see [TRADEMARK.md](TRADEMARK.md).
