# ig.tools for Chrome

Save photos, videos, Reels and Stories from the Instagram page you have open, straight from your browser. When you are signed out, or want to look without signing in, open the same link in [ig.tools](https://ig.tools/).

- **Save from this page**: open a post, Reel, Story or Highlight on instagram.com and click the toolbar icon. The popup lists every photo and video on that page; save one, a selection, or all of them.
- **Profile pages**: three tabs. **Stories** lists the account's current Stories, so you can save them without opening the Stories viewer. Saving them this way doesn't add you to the Story's viewer list (tested in October 2026; Instagram may change this). If you open a Story in Instagram itself, Instagram records the view as usual. **Highlights** lists the account's Highlights; open one to save its items. Saving Highlights this way doesn't add you to the viewer list either (tested in October 2026); playing a Highlight in Instagram itself records the view as usual. **Profile picture** saves the full-size picture shown on the profile.
- **Download buttons on Instagram** (on by default; turn them off with the switch in the popup's settings, the gear icon): a download button next to the bookmark on posts (on a carousel it saves every slide), one in the top-right corner of the photo or video (on hover; on a carousel it saves just the slide on screen), one on profile grid tiles (on hover), one in the Reels player's action column, and one in the header of a Story or Highlight, next to pause, that saves the item playing.
- **Open in ig.tools**: paste any Instagram link or `@username` in the popup, or right-click an Instagram link and choose "Open link with ig.tools".
- **Shortcut**: none by default. To open the popup from the keyboard, choose a key at `chrome://extensions/shortcuts` (the popup's settings link there).
- **Download folder**, chosen in the popup's settings: by account (`Downloads/ig.tools/<username>/` with `posts/`, `stories/` and `highlights/<title>/` folders, the default), all in one `Downloads/ig.tools/` folder, or straight in `Downloads/`. Without account folders, file names start with the username, e.g. `natgeo_story_3100.mp4`. Chrome extensions can only save inside your Downloads folder; to use another place, change Chrome's download location.
- 10 languages, light and dark themes.

Saving happens locally: the extension asks Instagram for the media on the open page using your existing Instagram session in this browser, and Chrome downloads the files from Instagram's servers. Nothing is sent to ig.tools or anywhere else. See [PRIVACY.md](PRIVACY.md).

> Not affiliated with Instagram or Meta. Save only content you own or have permission to save.

## Permissions

| Permission | Why |
| --- | --- |
| `https://www.instagram.com/*` | Add the download buttons to Instagram pages, and read the media on the open Instagram page when you click the toolbar icon. This is the only site the extension can access; Chrome shows it at install as "Read and change your data on www.instagram.com". |
| `activeTab` | The same, when you click the toolbar icon on `instagram.com` without `www` or on `m.instagram.com`. |
| `scripting` | Read the media on the open Instagram page (one request to Instagram's own web API) and place the download buttons. |
| `downloads` | Save the files you choose to your Downloads folder. |
| `storage` | Remember your two settings: the download buttons switch and the download folder. Stored only in your browser. |
| `contextMenus` | Add "Open link with ig.tools" and "Open this page with ig.tools" to the right-click menu. |

The extension runs on www.instagram.com only. With the download buttons switched off, no script runs on Instagram pages until you click the toolbar icon.

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
