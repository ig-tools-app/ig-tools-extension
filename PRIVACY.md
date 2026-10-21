# Privacy

The ig.tools extension does not collect, store or transmit any personal data, and has no server of its own.

**Saving from an Instagram page**

- The extension can see a page only after you click its toolbar icon, and only that tab (Chrome's `activeTab` permission).
- It then asks Instagram, from that tab and with your existing Instagram session, for the photos and videos on the page (on a profile page: its Stories, Highlights and profile picture). This request goes only to instagram.com, as if the page had loaded the media itself.
- The files you choose are downloaded directly from Instagram's servers to your computer. The extension keeps no record of them.
- Your Instagram session, cookies and account details are never read out, saved or sent anywhere.

**Download buttons on Instagram (optional)**

- Off by default. When you turn it on in the popup, Chrome asks you to allow access to instagram.com. Turning it off removes that access.
- While it is on, a script runs on instagram.com pages only. It looks at the page's layout to place download buttons and reads nothing else.
- When you click a button, the post or Story address is passed to the extension, which requests the media from Instagram and downloads it, exactly as described above. Nothing is sent anywhere else.

**Opening ig.tools**

When you choose "Open in ig.tools" or a right-click menu item, the extension opens a new tab on `https://ig.tools/` with the Instagram link or username you chose in the address, plus `utm_source=chrome_extension` so the site can count visits that came from the extension. What happens on the website is covered by the ig.tools [Privacy Policy](https://ig.tools/privacy).

Contact: dev@ig.tools
