// Trimmed shapes of Instagram web API responses, used by unit and end-to-end tests.
export const cdn = "https://scontent.cdninstagram.com/v/t51";

const image = (name, width, height) => ({ url: `${cdn}/${name}.jpg?stp=x`, width, height });
const video = (name, width, height) => ({ url: `${cdn}/${name}.mp4?efg=x`, width, height, type: 101 });
const candidates = name => [image(`${name}_1080`, 1080, 1350), image(`${name}_640`, 640, 800), image(`${name}_320`, 320, 400), image(`${name}_150`, 150, 188)];

export const photoPost = {
  items: [{ pk: "3001", code: "Cphoto11111", media_type: 1, user: { username: "natgeo" }, image_versions2: { candidates: candidates("photo") } }],
};

export const reelPost = {
  items: [{
    pk: "3002", code: "Creel222222", media_type: 2, user: { username: "natgeo" },
    image_versions2: { candidates: candidates("reelcover") },
    video_versions: [video("reel_480", 480, 854), video("reel_720", 720, 1280), video("reel_360", 360, 640)],
  }],
};

export const carouselPost = {
  items: [{
    pk: "3003", code: "Ccarousel33", media_type: 8, user: { username: "natgeo" },
    carousel_media: [
      { pk: "1", media_type: 1, image_versions2: { candidates: candidates("slide1") } },
      { pk: "2", media_type: 2, image_versions2: { candidates: candidates("slide2cover") }, video_versions: [video("slide2", 720, 900)] },
      { pk: "3", media_type: 1, image_versions2: { candidates: candidates("slide3") } },
    ],
  }],
};

// Ten slides: more than fit in the popup, so the grid must scroll without cards overlapping.
export const bigCarouselPost = {
  items: [{
    pk: "3004", code: "Cbigcarou10", media_type: 8, user: { username: "natgeo" },
    carousel_media: Array.from({ length: 10 }, (_, i) => ({ pk: String(i + 1), media_type: 1, image_versions2: { candidates: candidates(`big${i + 1}`) } })),
  }],
};

export const storyProfile ={ data: { user: { id: "787132", username: "natgeo" } } };

// Stories and Highlights come from instagram.com's GraphQL Stories queries.
// Their video_versions carry only type and URL, without dimensions.
const storyVideo = name => ({ type: 101, url: `${cdn}/${name}.mp4?efg=x` });
export const storyItems = [
  { pk: "3100", id: "3100_787132", media_type: 1, image_versions2: { candidates: candidates("story1") } },
  { pk: "3101", id: "3101_787132", media_type: 2, image_versions2: { candidates: candidates("story2cover") }, video_versions: [storyVideo("story2"), { ...storyVideo("story2"), type: 102 }] },
];
export const highlightItems = [
  { pk: "3200", media_type: 1, image_versions2: { candidates: candidates("hl1") } },
  { pk: "3201", media_type: 2, image_versions2: { candidates: candidates("hl2cover") }, video_versions: [storyVideo("hl2")] },
];

const reelsConnection = items => ({ data: { xdt_api__v1__feed__reels_media__connection: { edges: [{ node: { user: { username: "natgeo" }, items } }] } } });
export const storyGraphql = reelsConnection(storyItems);
export const highlightGraphql = reelsConnection(highlightItems);

// The profile's Highlights tray (GraphQL "highlights" connection).
export const highlightsTray = {
  highlights: {
    edges: [
      { node: { id: "highlight:17900000000000001", title: "Travel 2026", cover_media: { cropped_image_version: { url: `${cdn}/hlcover1.jpg?stp=x` } }, user: { username: "natgeo" } } },
      { node: { id: "highlight:17900000000000002", title: "", cover_media: { cropped_image_version: { url: "https://evil.example/c.jpg" } } } },
      { node: { id: "not-a-highlight", title: "skip" } },
    ],
    page_info: { has_next_page: false },
  },
};

// /api/v1/users/<id>/info/ with the full-size profile picture.
export const userInfo = {
  user: {
    username: "natgeo",
    hd_profile_pic_url_info: { url: `${cdn}/avatar_1080.jpg?stp=x`, width: 1080, height: 1080 },
    hd_profile_pic_versions: [{ url: `${cdn}/avatar_320.jpg?stp=x`, width: 320, height: 320 }],
  },
};

// The profile header as instagram.com renders it after loading: the account's
// full-size picture, next to the signed-in viewer's small one and a look-alike name.
export const profileHeader = `<header>
<img alt="viewer's profile picture" src="${cdn}/viewer_s150x150.jpg?stp=dst-jpg_s150x150">
<img alt="natgeotravel's profile picture" src="${cdn}/lookalike_1080.jpg">
<img alt="natgeo's profile picture" src="${cdn}/avatar_page_1080.jpg?oh=x">
</header>`;

// Markup shaped like instagram.com's (October 2026), for the on-page buttons.
// An action row is a short <section>: like, comment, repost, share on the left,
// the bookmark alone in its last child.
const icon = label => `<svg aria-label="${label}" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/></svg>`;
export const actionRow = `<section style="display:flex;justify-content:space-between;height:40px">
<div style="display:flex">${["Like", "Comment", "Repost", "Share"].map(label => `<div role="button">${icon(label)}</div>`).join("")}</div>
<div><div role="button" class="bookmark">${icon("Save")}</div></div>
</section>`;
export const feedHtml = `<main>
<article><a href="/p/Cphoto11111/"><time>1h</time></a><img src="${cdn}/photo_640.jpg" width="400" height="400">${actionRow}</article>
<article><a href="/p/Cmissing999/"><time>2h</time></a>${actionRow}</article>
</main>`;
// A carousel post page: slides at translateX(index × width) in a clipping frame,
// plus Instagram's 1px end marker. Tests move .track to change the slide on screen.
const slide = (offset, inner) => `<li style="position:absolute;top:0;left:0;width:400px;height:500px;transform:translateX(${offset}px)">${inner}</li>`;
export const carouselPageHtml = `<main>
<div class="frame" style="overflow:hidden;width:400px;height:500px">
<div class="track" style="transition:none"><ul style="list-style:none;margin:0;padding:0;position:relative;height:500px">
${slide(0, `<img src="${cdn}/slide1_320.jpg" width="400" height="500">`)}
${slide(400, `<video width="400" height="500"></video>`)}
${slide(800, `<img src="${cdn}/slide3_320.jpg" width="400" height="500">`)}
<li style="position:absolute;top:0;left:0;width:1px;height:1px;transform:translateX(1199px)"></li>
</ul></div></div>
${actionRow}
</main>`;

// A feed carousel: the frame scrolls itself (overflow-x: auto); tests set scrollLeft.
export const feedCarouselHtml = `<main><article>
<a href="/p/Ccarousel33/"><time>3h</time></a>
<div class="host" style="width:400px;position:relative">
<div class="scroller" style="overflow-x:auto;overflow-y:hidden;width:400px;height:500px">
<ul style="list-style:none;margin:0;padding:0;position:relative;width:1200px;height:500px">
${slide(0, `<img src="${cdn}/slide1_320.jpg" width="400" height="500">`)}
${slide(400, `<video width="400" height="500"></video>`)}
${slide(800, `<img src="${cdn}/slide3_320.jpg" width="400" height="500">`)}
<li style="position:absolute;top:0;left:0;width:1px;height:1px;transform:translateX(1199px)"></li>
</ul></div></div>
${actionRow}
</article></main>`;

// The Reels player's vertical action column: like, comment and repost with counts,
// then share, save and "more" as bare icons, then the audio thumbnail.
const column = (label, count) => `<div class="reel-item item-${label.toLowerCase()}" style="display:flex;flex-direction:column;align-items:center;margin-top:20px"><div role="button">${icon(label)}</div>${count ? `<span>${count}</span>` : ""}</div>`;
export const reelsPageHtml = `<main><div style="display:flex;gap:16px">
<div style="width:300px;height:540px;background:#111"><video width="300" height="540"></video></div>
<div class="reel-column" style="display:flex;flex-direction:column;justify-content:flex-end;height:540px">
${column("Like", "28K")}${column("Comment", "935")}${column("Repost", "1.2K")}${column("Share")}${column("Save")}${column("More")}
<div style="margin-top:20px"><a href="/reels/audio/1/" role="link"><img src="${cdn}/audio.jpg" width="26" height="26"></a></div>
</div></div></main>`;

// The playing Story card: progress bars, then a flex header with the avatar,
// the sound and pause controls (32px boxes, 16px icons) and "more" (24px icon).
// `fills` gives each bar's progress in percent.
export const storyPageHtml = (fills = [100, 40]) => `<section><div class="card" style="width:500px;margin:20px auto;background:#222;color:#fff">
<div class="bars" style="display:flex;gap:4px;height:2px;width:480px;margin:0 10px">
${fills.map(fill => `<div style="flex:1;height:2px;overflow:hidden;background:#555"><div style="height:2px;background:#fff;transform:translateX(${fill - 100}%)"></div></div>`).join("")}
</div>
<div class="story-header" style="display:flex;align-items:center;justify-content:space-between;height:40px;padding:0 10px">
<div style="display:flex;align-items:center;gap:8px"><img src="${cdn}/avatar_150.jpg" width="32" height="32"><a href="/natgeo/">natgeo</a></div>
<div class="controls" style="display:flex"><div role="button" style="width:32px;height:32px"><svg aria-label="Muted" width="16" height="16"></svg></div><div role="button" class="pause" style="width:32px;height:32px"><svg aria-label="Pause" width="16" height="16"></svg></div></div>
<div role="button" class="more" style="width:40px;height:40px"><div><svg aria-label="Menu" width="24" height="24"></svg></div></div>
</div>
<div style="height:700px"></div>
</div></section>`;

export const gridHtml = `<main><div style="display:flex">
<div style="width:200px;height:250px"><a href="/gridacct/p/Ccarousel33/" role="link"><img src="${cdn}/slide1_320.jpg" width="200" height="250"></a></div>
<div style="width:200px;height:250px"><a href="/gridacct/reel/Creel222222/" role="link"><img src="${cdn}/reelcover_320.jpg" width="200" height="250"></a></div>
</div></main>`;

// The profile page HTML names the account ID and carries the GraphQL request token.
// Other pages pass no ID and carry only the token.
export const profileHtml = (profileId, body = "") => `<!doctype html><title>Instagram</title>${body}
<script type="application/json">{"require":[["DTSGInitialData",[],{"token":"test-dtsg"}]]}</script>
${profileId ? `<script type="application/json">{"page_logging":{"params":{"page_id":"profilePage_${profileId}","profile_id":"${profileId}"}},"profile_pic_url_hd":"${cdn.replace(/\//g, "\\/")}\\/avatar_150.jpg?stp=x"}</script>` : ""}`;
