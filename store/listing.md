# Chrome Web Store listing

Copy for the developer dashboard. The name and summary come from `_locales/*/messages.json` (`extName`, `extDescription`), so the store shows them in each supported language automatically.

## Store listing

**Category**: Tools

**Language**: English (plus the 9 translated `_locales`)

**Detailed description** (plain text: copy the block as is; the dashboard keeps line breaks)

```text
View and save Instagram Stories and Highlights anonymously from public accounts and private accounts you follow, and save photos, videos and Reels in one click.

VIEW STORIES AND HIGHLIGHTS ANONYMOUSLY
1. Open the account's profile on instagram.com. Don't open the Story itself.
2. Click the ig.tools icon and choose Stories or Highlights.
3. Tap any item to watch it in the viewer, then save one, a selection, or all.

You won't appear in the viewer list (tested in October 2026). Opening a Story or Highlight in Instagram itself still records the view as usual; the popup reminds you if you do.

This works for public accounts and for private accounts you follow, the same accounts your Instagram account has access to. ig.tools can't show content from private accounts you don't follow.

HOW IT WORKS
• Open a post, Reel, Story or Highlight on instagram.com.
• Click the ig.tools icon: the popup shows every photo and video on that page.
• Tap one to view it full size or play it, and save one, a selection, or all of them.

WHAT YOU GET
• Photos in the largest size Instagram provides
• Videos and Reels as MP4 with sound, never re-encoded and with no added watermark
• Every slide of a carousel, and all current Stories of an account
• Profile pages also offer the account's full-size profile picture
• Download buttons right on Instagram: next to the bookmark on posts, on photos, videos and each carousel slide, on profile grids, and on Stories and Reels. Turn them off in the settings if you prefer the popup alone.
• Choose where files go: sorted into a folder per account (with posts, stories and highlights folders), all in one ig.tools folder, or straight in Downloads
• Set your own keyboard shortcut to open it

SIGNED OUT, OR PREFER NOT TO SIGN IN?
Paste any Instagram link or @username into the popup, or right-click an Instagram link, to open it in ig.tools and view public posts, Reels and Stories there without signing in.

PRIVACY
Saving happens in your browser. The extension runs on instagram.com only, talks only to Instagram and collects nothing.

OPEN SOURCE
https://github.com/ig-tools-app/ig-tools-extension

Save only content you own or have permission to save. Not affiliated with Instagram or Meta.
```

**Official URL / Homepage**: https://ig.tools/

**Support URL**: https://ig.tools/contact

## Graphics

| Asset | Size | File |
| --- | --- | --- |
| Icon | 128×128 | `icons/icon-128.png` |
| Screenshots | 1280×800 | `store/images/screenshot-1-anonymous-stories.png`, `screenshot-2-viewer.png`, `screenshot-3-on-instagram.png`, `screenshot-4-save.png`, `screenshot-5-settings.png` (upload in this order; the real popup and the real on-page buttons on demo content and an illustrated post card, no real accounts and no Instagram branding) |
| Small promo tile | 440×280 | `store/images/promo-small-440x280.png` |
| Marquee promo tile (optional, used only if Google features the extension) | 1400×560 | `store/images/promo-marquee-1400x560.png` |

## Privacy practices

Each field as plain text, to paste into the dashboard's Privacy tab.

**Single purpose description**

```text
View and save the photos and videos (posts, Reels, Stories and Highlights) on the Instagram page the user has open. As a secondary action, the same Instagram links can be opened on the ig.tools website.
```

**Permission justification**

Host permission (`https://www.instagram.com/*`):

```text
The extension's single purpose is viewing and saving media from Instagram. It adds download buttons to Instagram posts, profile grids, Reels and Stories (users can turn them off in the settings), and reads the media on the open Instagram page with the user's own session. It accesses no other site.
```

`activeTab`:

```text
When the user clicks the toolbar icon on an Instagram address outside www.instagram.com (instagram.com, m.instagram.com), this gives access to that tab so the extension can find the media on the page.
```

`scripting`:

```text
Runs a function in the Instagram tab to request the page's media from Instagram's own web API with the user's session, and to read Instagram's video volume setting so videos in the popup play at the same volume. It also registers the download buttons' content script while they are switched on.
```

`downloads`:

```text
Saves the photos and videos the user chooses to the Downloads folder.
```

`storage`:

```text
Stores the user's two settings locally: download buttons on or off, and the download folder layout.
```

`contextMenus`:

```text
Adds "Open link with ig.tools" and "Open this page with ig.tools" to the right-click menu on Instagram links and pages.
```

**Remote code**: No, I am not using remote code.

**Data usage**: The extension does not collect or transmit any of the listed data types. Page content is read only in the user's browser to show and save the files the user chooses. Tick none of the data types, then tick the three certifications (yourself: they are your declarations as the developer).

**Privacy policy URL**

```text
https://github.com/ig-tools-app/ig-tools-extension/blob/main/PRIVACY.md
```
