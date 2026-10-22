# Chrome Web Store listing

Copy for the developer dashboard. The name and summary come from `_locales/*/messages.json` (`extName`, `extDescription`), so the store shows them in each supported language automatically.

## Store listing

**Category**: Tools

**Language**: English (plus the 9 translated `_locales`)

**Detailed description**

> Save photos, videos, Reels and Stories from the Instagram page you're on, in one click.
>
> HOW IT WORKS
> • Open a post, Reel, Story or Highlight on instagram.com.
> • Click the ig.tools icon: the popup shows every photo and video on that page.
> • Save one, a selection, or all of them.
>
> WHAT YOU GET
> • Photos in the largest size Instagram provides
> • Videos and Reels as MP4 with sound, never re-encoded and with no added watermark
> • Every slide of a carousel, and all current Stories of an account
> • On a profile page, the account's current Stories and its Highlights are listed without opening them. Saving them this way doesn't add you to the viewer list. If you open a Story or Highlight in Instagram itself, Instagram records the view as usual.
> • Profile pages also offer the account's full-size profile picture
> • Download buttons right on Instagram: next to the bookmark on posts, on photos, videos and each carousel slide, on profile grids, and on Stories and Reels. Turn them off in the settings if you prefer the popup alone.
> • Choose where files go: sorted into a folder per account (with posts, stories and highlights folders), all in one ig.tools folder, or straight in Downloads
> • Set your own keyboard shortcut to open it
>
> SIGNED OUT, OR PREFER NOT TO SIGN IN?
> Paste any Instagram link or @username into the popup, or right-click an Instagram link, to open it in ig.tools and view public posts, Reels and Stories there without signing in.
>
> PRIVACY
> Saving happens in your browser. The extension runs on instagram.com only, talks only to Instagram and collects nothing.
>
> OPEN SOURCE
> https://github.com/ig-tools-app/ig-tools-extension
>
> Save only content you own or have permission to save. Not affiliated with Instagram or Meta.

**Official URL / Homepage**: https://ig.tools/

**Support URL**: https://ig.tools/contact

## Graphics

| Asset | Size | File |
| --- | --- | --- |
| Icon | 128×128 | `icons/icon-128.png` |
| Screenshots | 1280×800 | `store/images/screenshot-1-popup.png` (to be replaced with one showing the saved-media grid) |
| Small promo tile | 440×280 | `store/images/promo-small-440x280.png` |

## Privacy practices

**Single purpose**

> Save the photos and videos shown on the Instagram page the user has open. As a secondary action, the same links can be opened on the ig.tools website.

**Permission justification**

- Host permission `https://www.instagram.com/*`: The extension's single purpose is saving media from Instagram. It adds download buttons to Instagram posts, profile grids, Reels and Stories (users can turn them off in the settings), and reads the media on the open Instagram page with the user's session. It accesses no other site.
- `activeTab`: When the user clicks the toolbar icon on an Instagram address outside www.instagram.com (instagram.com, m.instagram.com), gives access to that tab so the extension can find the media on the page.
- `scripting`: Runs one function in the Instagram tab to request the page's media from Instagram's own web API with the user's session, and registers the download buttons' content script while they are switched on.
- `downloads`: Saves the photos and videos the user chooses to the Downloads folder.
- `storage`: Stores the user's two settings (download buttons on or off, and the download folder layout) locally.
- `contextMenus`: Adds "Open link with ig.tools" and "Open this page with ig.tools" to the right-click menu on Instagram links and pages.

**Remote code**: No, I am not using remote code.

**Data usage**: The extension does not collect or transmit any of the listed data types. Page content is read only in the user's browser to save the files they choose. Tick none, and certify the three disclosures.

**Privacy policy URL**: https://github.com/ig-tools-app/ig-tools-extension/blob/main/PRIVACY.md
