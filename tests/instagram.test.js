import { test } from "node:test";
import assert from "node:assert/strict";
import { mediaFromResult, pageFromUrl, safeMediaUrl, shortcodeToId } from "../src/instagram.js";
import { carouselPost, cdn, highlightItems, photoPost, reelPost, storyItems } from "./fixtures.js";

test("recognises the Instagram pages that hold media", () => {
  assert.deepEqual(pageFromUrl("https://www.instagram.com/p/Cphoto11111/?img_index=2"), { kind: "post", shortcode: "Cphoto11111" });
  assert.deepEqual(pageFromUrl("https://www.instagram.com/reel/Creel222222/"), { kind: "post", shortcode: "Creel222222" });
  assert.deepEqual(pageFromUrl("https://www.instagram.com/reels/Creel222222/"), { kind: "post", shortcode: "Creel222222" });
  assert.deepEqual(pageFromUrl("https://instagram.com/tv/Ctv33333333"), { kind: "post", shortcode: "Ctv33333333" });
  assert.deepEqual(pageFromUrl("https://www.instagram.com/natgeo/reel/Creel222222/"), { kind: "post", shortcode: "Creel222222" });
  assert.deepEqual(pageFromUrl("https://www.instagram.com/stories/NatGeo/3100123456789/"), { kind: "story", username: "natgeo", storyId: "3100123456789" });
  assert.deepEqual(pageFromUrl("https://www.instagram.com/stories/natgeo/"), { kind: "story", username: "natgeo", storyId: null });
  assert.deepEqual(pageFromUrl("https://www.instagram.com/stories/highlights/17900000000000001/"), { kind: "highlight", highlightId: "17900000000000001" });
  assert.deepEqual(pageFromUrl("https://www.instagram.com/natgeo/"), { kind: "profile", username: "natgeo" });
  assert.deepEqual(pageFromUrl("https://www.instagram.com/"), { kind: "other" });
  assert.deepEqual(pageFromUrl("https://www.instagram.com/explore/"), { kind: "other" });
  assert.deepEqual(pageFromUrl("https://www.instagram.com/direct/inbox/"), { kind: "other" });
  assert.equal(pageFromUrl("https://example.com/p/Cphoto11111/"), null);
  assert.equal(pageFromUrl("http://www.instagram.com/p/Cphoto11111/"), null);
  assert.equal(pageFromUrl("chrome://extensions/"), null);
});

test("converts a shortcode to its media ID", () => {
  assert.equal(shortcodeToId("B"), "1");
  assert.equal(shortcodeToId("BA"), "64");
  assert.equal(shortcodeToId("_"), "63");
  // Round trip through the same base-64 alphabet for a realistic 11-character code.
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let id = 3412345678901234567n, code = "";
  while (id > 0n) { code = alphabet[Number(id % 64n)] + code; id /= 64n; }
  assert.equal(shortcodeToId(code), "3412345678901234567");
  // Private share codes carry extra characters after the first 11.
  assert.equal(shortcodeToId(`${code}xyzExtraPart`), "3412345678901234567");
  assert.equal(shortcodeToId("bad!code"), null);
});

test("downloads only from Instagram's media CDNs over HTTPS", () => {
  assert.ok(safeMediaUrl(`${cdn}/a.jpg`));
  assert.ok(safeMediaUrl("https://instagram.fsgn2-1.fna.fbcdn.net/v/a.mp4"));
  assert.equal(safeMediaUrl("http://scontent.cdninstagram.com/a.jpg"), null);
  assert.equal(safeMediaUrl("https://evil.example/cdninstagram.com/a.jpg"), null);
  assert.equal(safeMediaUrl("https://cdninstagram.com.evil.example/a.jpg"), null);
  assert.equal(safeMediaUrl("not a url"), null);
});

test("a photo post becomes one file at the largest size", () => {
  assert.deepEqual(mediaFromResult(photoPost), [{
    type: "image", url: `${cdn}/photo_1080.jpg?stp=x`, previewUrl: `${cdn}/photo_320.jpg?stp=x`,
    width: 1080, height: 1350, filename: "ig.tools/natgeo_Cphoto11111.jpg",
  }]);
});

test("a Reel uses the largest MP4 and keeps the cover as preview", () => {
  const [file] = mediaFromResult(reelPost);
  assert.equal(file.type, "video");
  assert.equal(file.url, `${cdn}/reel_720.mp4?efg=x`);
  assert.equal(file.previewUrl, `${cdn}/reelcover_320.jpg?stp=x`);
  assert.equal(file.filename, "ig.tools/natgeo_Creel222222.mp4");
});

test("a carousel keeps its order and numbers each file", () => {
  const files = mediaFromResult(carouselPost);
  assert.deepEqual(files.map(f => [f.type, f.filename]), [
    ["image", "ig.tools/natgeo_Ccarousel33_1.jpg"],
    ["video", "ig.tools/natgeo_Ccarousel33_2.mp4"],
    ["image", "ig.tools/natgeo_Ccarousel33_3.jpg"],
  ]);
});

test("Stories and Highlights are named after the account and each item", () => {
  const stories = mediaFromResult({ items: storyItems, owner: "natgeo" });
  assert.deepEqual(stories.map(f => [f.type, f.filename]), [["image", "ig.tools/natgeo_3100.jpg"], ["video", "ig.tools/natgeo_3101.mp4"]]);
  const highlight = mediaFromResult({ items: highlightItems, owner: "natgeo" });
  assert.equal(highlight[0].filename, "ig.tools/natgeo_3200.jpg");
});

test("unsafe or empty responses produce no files", () => {
  assert.deepEqual(mediaFromResult({ reason: "login" }), []);
  assert.deepEqual(mediaFromResult({ items: [] }), []);
  assert.deepEqual(mediaFromResult({ items: [{ code: "x", media_type: 1, image_versions2: { candidates: [{ url: "https://evil.example/a.jpg" }] } }] }), []);
  const [file] = mediaFromResult({ items: [{ code: "../../x", user: { username: "a/b" }, image_versions2: { candidates: [{ url: `${cdn}/a.jpg` }] } }] });
  assert.equal(file.filename, "ig.tools/a_b_.._.._x.jpg");
});
