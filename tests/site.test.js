import { test } from "node:test";
import assert from "node:assert/strict";
import { instagramInput, inputFromTabUrl, localePath, siteUrl } from "../src/site.js";

test("accepts the same inputs as the site field", () => {
  assert.equal(instagramInput(" @natgeo "), "@natgeo");
  assert.equal(instagramInput("natgeo"), "natgeo");
  assert.equal(instagramInput("https://www.instagram.com/reel/ABC123/"), "https://www.instagram.com/reel/ABC123/");
  assert.equal(instagramInput("instagram.com/stories/natgeo/"), "instagram.com/stories/natgeo/");
  assert.equal(instagramInput("https://example.com/video"), null);
  assert.equal(instagramInput("two words"), null);
  assert.equal(instagramInput(""), null);
});

test("prefills only Instagram pages that have something to open", () => {
  assert.equal(inputFromTabUrl("https://www.instagram.com/p/ABC123/?img_index=2"), "https://www.instagram.com/p/ABC123/");
  assert.equal(inputFromTabUrl("https://instagram.com/natgeo/"), "https://www.instagram.com/natgeo/");
  assert.equal(inputFromTabUrl("https://www.instagram.com/"), null);
  assert.equal(inputFromTabUrl("https://www.instagram.com/direct/inbox/"), null);
  assert.equal(inputFromTabUrl("https://www.instagram.com/accounts/edit/"), null);
  assert.equal(inputFromTabUrl("https://notinstagram.com/p/ABC123/"), null);
  assert.equal(inputFromTabUrl("chrome://newtab/"), null);
});

test("opens the site in the browser language", () => {
  assert.equal(localePath("en-US"), "");
  assert.equal(localePath("es-419"), "/es");
  assert.equal(localePath("pt-BR"), "/pt-br");
  assert.equal(localePath("pt-PT"), "/pt-br");
  assert.equal(localePath("zh-CN"), "/zh-cn");
  assert.equal(localePath("zh-TW"), "/zh-tw");
  assert.equal(localePath("zh-HK"), "/zh-tw");
  assert.equal(localePath("zh_TW"), "/zh-tw");
  assert.equal(localePath("ar"), "/ar");
  assert.equal(localePath("de"), "");
});

test("builds a site link that the site prefills and attributes", () => {
  assert.equal(siteUrl("@natgeo", "en-US"), "https://ig.tools/?url=%40natgeo&utm_source=chrome_extension&utm_medium=extension");
  assert.equal(siteUrl("https://www.instagram.com/reel/ABC/", "es"), "https://ig.tools/es?url=https%3A%2F%2Fwww.instagram.com%2Freel%2FABC%2F&utm_source=chrome_extension&utm_medium=extension");
});
