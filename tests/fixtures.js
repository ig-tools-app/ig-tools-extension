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
export const highlightItems = [{ pk: "3200", media_type: 1, image_versions2: { candidates: candidates("hl1") } }];

const reelsConnection = items => ({ data: { xdt_api__v1__feed__reels_media__connection: { edges: [{ node: { user: { username: "natgeo" }, items } }] } } });
export const storyGraphql = reelsConnection(storyItems);
export const highlightGraphql = reelsConnection(highlightItems);

// The profile page HTML names the account ID and carries the GraphQL request token.
// Other pages pass no ID and carry only the token.
export const profileHtml = profileId => `<!doctype html><title>Instagram</title>
<script type="application/json">{"require":[["DTSGInitialData",[],{"token":"test-dtsg"}]]}</script>
${profileId ? `<script type="application/json">{"page_logging":{"params":{"page_id":"profilePage_${profileId}","profile_id":"${profileId}"}}}</script>` : ""}`;
