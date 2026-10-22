import { test } from "node:test";
import assert from "node:assert/strict";
import { avatarFile, highlightsFromResult, layoutFilename, mediaFromResult, pageFromUrl, safeFolder, safeMediaUrl, shortcodeToId } from "../src/instagram.js";
import { carouselPost, cdn, highlightItems, highlightsTray, photoPost, reelPost, storyItems } from "./fixtures.js";

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
    width: 1080, height: 1350, filename: "ig.tools/natgeo/posts/Cphoto11111.jpg",
  }]);
});

test("a Reel uses the largest MP4 and keeps the cover as preview", () => {
  const [file] = mediaFromResult(reelPost);
  assert.equal(file.type, "video");
  assert.equal(file.url, `${cdn}/reel_720.mp4?efg=x`);
  assert.equal(file.previewUrl, `${cdn}/reelcover_320.jpg?stp=x`);
  assert.equal(file.filename, "ig.tools/natgeo/posts/Creel222222.mp4");
});

test("a carousel keeps its order and numbers each file", () => {
  const files = mediaFromResult(carouselPost);
  assert.deepEqual(files.map(f => [f.type, f.filename]), [
    ["image", "ig.tools/natgeo/posts/Ccarousel33_1.jpg"],
    ["video", "ig.tools/natgeo/posts/Ccarousel33_2.mp4"],
    ["image", "ig.tools/natgeo/posts/Ccarousel33_3.jpg"],
  ]);
});

test("Stories and Highlights go to per-account folders", () => {
  const stories = mediaFromResult({ items: storyItems, owner: "natgeo" }, { kind: "story" });
  assert.deepEqual(stories.map(f => [f.type, f.filename]), [["image", "ig.tools/natgeo/stories/3100.jpg"], ["video", "ig.tools/natgeo/stories/3101.mp4"]]);
  // Story videos have no size of their own (as on instagram.com); the cover's is used.
  assert.deepEqual([stories[1].width, stories[1].height], [1080, 1350]);
  const highlight = mediaFromResult({ items: highlightItems, owner: "natgeo" }, { kind: "highlight", title: "Travel 2026", highlightId: "17900000000000001" });
  assert.equal(highlight[0].filename, "ig.tools/natgeo/highlights/Travel 2026/3200.jpg");
});

test("Highlight titles become safe folder names in any script", () => {
  assert.equal(safeFolder("旅行 / 东京: 2026?", "1"), "旅行 东京 2026");
  assert.equal(safeFolder("  ..hidden..  ", "1"), "hidden");
  assert.equal(safeFolder("a\u0000b<c>d|e*f\"g\\h", "1"), "a b c d e f g h");
  assert.equal(safeFolder("😀".repeat(80), "1").length, 120, "60 characters, counting each emoji once");
  assert.equal(safeFolder("", "17900000000000001"), "17900000000000001");
  assert.equal(safeFolder("..", "17900000000000001"), "17900000000000001");
  assert.equal(safeFolder("مرحبا", "1"), "مرحبا");
});

test("the Highlights tray becomes a list with safe cover URLs", () => {
  assert.deepEqual(highlightsFromResult(highlightsTray), [
    { id: "17900000000000001", title: "Travel 2026", coverUrl: `${cdn}/hlcover1.jpg?stp=x` },
    { id: "17900000000000002", title: "", coverUrl: null },
  ]);
  assert.deepEqual(highlightsFromResult({}), []);
});

test("the profile picture is saved once, in the account folder", () => {
  assert.deepEqual(avatarFile("natgeo", { url: `${cdn}/avatar_1080.jpg?stp=x`, width: 1080, height: 1080, hd: true }), {
    type: "image", url: `${cdn}/avatar_1080.jpg?stp=x`, previewUrl: `${cdn}/avatar_1080.jpg?stp=x`,
    width: 1080, height: 1080, hd: true, filename: "ig.tools/natgeo/natgeo_profile_picture.jpg",
  });
  assert.equal(avatarFile("natgeo", { url: `${cdn}/avatar_150.jpg` }).hd, false);
  assert.equal(avatarFile("natgeo", { url: "https://evil.example/a.jpg" }), null);
  assert.equal(avatarFile("natgeo", null), null);
});

test("unsafe or empty responses produce no files", () => {
  assert.deepEqual(mediaFromResult({ reason: "login" }), []);
  assert.deepEqual(mediaFromResult({ items: [] }), []);
  assert.deepEqual(mediaFromResult({ items: [{ code: "x", media_type: 1, image_versions2: { candidates: [{ url: "https://evil.example/a.jpg" }] } }] }), []);
  const [file] = mediaFromResult({ items: [{ code: "../../x", user: { username: "a/b" }, image_versions2: { candidates: [{ url: `${cdn}/a.jpg` }] } }] });
  assert.equal(file.filename, "ig.tools/a_b/posts/.._.._x.jpg");
  const [dots] = mediaFromResult({ items: [{ code: "..", user: { username: ".." }, image_versions2: { candidates: [{ url: `${cdn}/a.jpg` }] } }] });
  assert.equal(dots.filename, "ig.tools/_/posts/_.jpg");
});

test("folder layouts flatten the account folders into prefixed names", () => {
  const files = ["ig.tools/natgeo/posts/Cxyz_2.jpg", "ig.tools/natgeo/stories/3100.mp4", "ig.tools/natgeo/highlights/Travel 2026/3200.jpg", "ig.tools/natgeo/natgeo_profile_picture.jpg"];
  assert.deepEqual(files.map(file => layoutFilename(file, "account")), files);
  assert.deepEqual(files.map(file => layoutFilename(file, "folder")), [
    "ig.tools/natgeo_Cxyz_2.jpg", "ig.tools/natgeo_story_3100.mp4", "ig.tools/natgeo_highlight_Travel 2026_3200.jpg", "ig.tools/natgeo_profile_picture.jpg",
  ]);
  assert.deepEqual(files.map(file => layoutFilename(file, "downloads")), [
    "natgeo_Cxyz_2.jpg", "natgeo_story_3100.mp4", "natgeo_highlight_Travel 2026_3200.jpg", "natgeo_profile_picture.jpg",
  ]);
  // An unknown setting keeps the default layout.
  assert.equal(layoutFilename(files[0], "elsewhere"), files[0]);
});
