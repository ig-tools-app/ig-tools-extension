# Chrome Web Store listing

Copy for the developer dashboard. The name and summary come from `_locales/*/messages.json` (`extName`, `extDescription`), so the store shows them in each supported language automatically.

## Store listing

**Category**: Tools

**Language**: English (plus the 9 translated `_locales`)

**Detailed description**

> Open any Instagram post, Reel, Story or profile in ig.tools with one click, then preview and save the public media you need.
>
> HOW IT WORKS
> • Click the toolbar icon on an Instagram page: the post or profile is filled in, choose Open in ig.tools.
> • Or paste any Instagram link or @username into the popup.
> • Or right-click an Instagram link and choose Open link with ig.tools.
>
> ON IG.TOOLS YOU CAN
> • Save public Reels, videos and photos in the source quality Instagram provides, with no added watermark
> • Browse a public profile's posts, Reels, Stories and Highlights from its username
> • Save carousels and several Stories together as one ZIP
> • Use it without signing in to Instagram
>
> PRIVACY
> The extension collects nothing and makes no network requests. It only opens ig.tools in a new tab. It has no access to Instagram pages and no content scripts.
>
> OPEN SOURCE
> The code is public: https://github.com/ig-tools-app/ig-tools-extension
>
> Public content only. Download only content you own or have permission to save. Not affiliated with Instagram or Meta.

**Official URL / Homepage**: https://ig.tools/

**Support URL**: https://ig.tools/contact

## Graphics

| Asset | Size | Content |
| --- | --- | --- |
| Icon | 128×128 | `icons/icon-128.png` |
| Screenshots | 1280×800 | `store/images/screenshot-1-popup.png` (a second one showing the ig.tools result can be added later) |
| Small promo tile | 440×280 | `store/images/promo-small-440x280.png` |

## Privacy practices

**Single purpose**

> Open Instagram links and usernames on the ig.tools website so the user can preview and save public media there.

**Permission justification**

- `activeTab`: Reads the current tab's address only after the user clicks the toolbar icon, to prefill an Instagram link in the popup.
- `contextMenus`: Adds "Open link with ig.tools" and "Open this page with ig.tools" to the right-click menu on Instagram links and pages.

**Remote code**: No, I am not using remote code.

**Data usage**: The extension does not collect or use any of the listed data types. Tick none, and certify the three disclosures (no selling, no unrelated use, no creditworthiness use).

**Privacy policy URL**: https://github.com/ig-tools-app/ig-tools-extension/blob/main/PRIVACY.md
