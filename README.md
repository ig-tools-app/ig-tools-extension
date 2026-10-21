# ig.tools for Chrome

A small browser extension that opens Instagram posts, Reels, Stories and profiles in [ig.tools](https://ig.tools/), where you can preview and save public media without signing in to Instagram.

- **Toolbar popup**: paste a link or an `@username`. On an Instagram page, the current post or profile is filled in for you.
- **Right-click menu**: "Open link with ig.tools" on any Instagram link, and "Open this page with ig.tools" on Instagram pages.
- Opens ig.tools in your browser's language (10 languages).

The extension itself collects nothing and makes no network requests. It only opens a new tab on ig.tools. See [PRIVACY.md](PRIVACY.md).

> Not affiliated with Instagram or Meta. Use it only for content you own or have permission to save.

## Permissions

| Permission | Why |
| --- | --- |
| `activeTab` | When you click the toolbar icon, read the address of the current tab so an Instagram page can be prefilled. Nothing is read until you click. |
| `contextMenus` | Add the two right-click menu items. |

The extension has no host permissions and no content scripts.

## Install from source

1. Clone this repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Choose **Load unpacked** and select the repository folder.

## Develop

Plain JavaScript, no build step and no dependencies.

```bash
npm test
```

```bash
npm run package
```

`npm run package` zips the committed `manifest.json`, `src/`, `_locales/` and `icons/` into `ig-tools-extension.zip` for store upload. Commit your changes first.

Translations live in `_locales/<locale>/messages.json`. The popup wording matches the ig.tools site so both read the same.

### Using another service

All site-specific behaviour is in [`src/site.js`](src/site.js). Change `SITE` (and the locale paths if needed) to point the extension at your own service. If you publish a fork, please read [TRADEMARK.md](TRADEMARK.md) first.

## License

The code is released under the [MIT License](LICENSE). The ig.tools name and logo are not covered by it; see [TRADEMARK.md](TRADEMARK.md).
