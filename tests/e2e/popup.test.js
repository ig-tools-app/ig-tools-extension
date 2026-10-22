// Loads the extension in Chromium against a stand-in instagram.com.
// Nothing here contacts Instagram: instagram.com requests are answered from
// tests/fixtures.js, and the media CDN host is mapped to a local HTTPS server
// (Chrome downloads bypass page-level request routing).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { bigCarouselPost, carouselPageHtml, feedVideoHtml, reelOverFeedHtml, carouselPost, feedCarouselHtml, feedHtml, gridHtml, reelsPageHtml, storyPageHtml, highlightGraphql, highlightsTray, photoPost, profileHeader, profileHtml, reelPost, storyGraphql, storyProfile, userInfo } from "../fixtures.js";
import { shortcodeToId } from "../../src/instagram.js";

const root = fileURLToPath(new URL("../..", import.meta.url));
// The stand-in API answers /api/v1/media/<id>/info/ for these posts only.
const posts = new Map([[shortcodeToId("Cphoto11111"), photoPost], [shortcodeToId("Creel222222"), reelPost], [shortcodeToId("Ccarousel33"), carouselPost], [shortcodeToId("Cbigcarou10"), bigCarouselPost]]);
let context, worker, extensionId, work, downloads, cdnServer, apiHeaders, graphqlRequest;
// Every instagram.com request, as "METHOD /path [GraphQL query name]".
const instagramRequests = [];
// X-IG-App-ID of each profile picture request, in order.
const avatarAppIds = [];
// Set POPUP_SCREENSHOTS=<dir> to save popup screenshots for review or the store listing.
const screenshots = process.env.POPUP_SCREENSHOTS;
let scenario = "ok";

// The extension as it ships: what `npm run package` zips.
function extensionCopy() {
  const dir = join(work, "extension");
  for (const entry of ["manifest.json", "src", "_locales", "icons"]) cpSync(join(root, entry), join(dir, entry), { recursive: true });
  return dir;
}

function apiResponse(url) {
  if (scenario === "login") return { status: 401, body: { message: "login_required", require_login: true } };
  if (scenario === "busy") return { status: 429, body: { message: "Please wait a few minutes" } };
  const { pathname } = new URL(url);
  if (pathname.startsWith("/api/v1/media/")) {
    const data = posts.get(pathname.split("/")[4]);
    return data ? { status: 200, body: data } : { status: 404, body: { message: "Media not found or unavailable" } };
  }
  if (pathname === "/api/v1/users/web_profile_info/") return { status: 200, body: storyProfile };
  if (pathname === "/api/v1/users/787132/info/") return scenario === "avatar-limited" ? { status: 429, body: { message: "Please wait a few minutes" } } : { status: 200, body: userInfo };
  // Like Instagram today, the old REST Stories endpoint fails; Stories must use GraphQL.
  if (pathname === "/api/v1/feed/reels_media/") return { status: 500, body: { status: "fail" } };
  return { status: 404, body: {} };
}

// The Stories viewer's and the Highlights tray's GraphQL queries, keyed by doc_id.
function graphqlResponse(form) {
  graphqlRequest = Object.fromEntries(new URLSearchParams(form));
  if (scenario === "graphql-error") return { errors: [{ message: "execution error" }] };
  const variables = JSON.parse(graphqlRequest.variables);
  if (graphqlRequest.doc_id === "38168009559465141") return { data: variables.user_id === "787132" ? highlightsTray : { highlights: { edges: [] } } };
  const { reel_ids: [reelId] } = variables;
  if (graphqlRequest.doc_id === "28325328583775973" && reelId === "highlight:17900000000000001") return highlightGraphql;
  if (graphqlRequest.doc_id === "28262315486766731" && reelId === "787132") return storyGraphql;
  return { data: { xdt_api__v1__feed__reels_media__connection: { edges: [] } } };
}

// A throwaway self-signed certificate for the local CDN stand-in.
async function startCdn() {
  const key = join(work, "cdn.key"), cert = join(work, "cdn.crt");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-days", "1", "-subj", "/CN=scontent.cdninstagram.com"], { stdio: "ignore" });
  cdnServer = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (request, response) => {
    const video = new URL(request.url, "https://cdn").pathname.endsWith(".mp4");
    // Images are the extension icon, so previews render in screenshots.
    response.writeHead(200, { "Content-Type": video ? "video/mp4" : "image/png", "Access-Control-Allow-Origin": "*" });
    response.end(video ? "fake mp4" : readFileSync(join(root, "icons", "icon-128.png")));
  });
  await new Promise(resolve => cdnServer.listen(0, "127.0.0.1", resolve));
  return cdnServer.address().port;
}

before(async () => {
  work = mkdtempSync(join(tmpdir(), "igtools-ext-"));
  downloads = join(work, "downloads");
  const cdnPort = await startCdn();
  const profile = join(work, "profile");
  mkdirSync(join(profile, "Default"), { recursive: true });
  writeFileSync(join(profile, "Default", "Preferences"), JSON.stringify({ download: { default_directory: downloads, prompt_for_download: false } }));
  const extension = extensionCopy();
  context = await chromium.launchPersistentContext(profile, {
    channel: "chromium", headless: true, locale: "en-US",
    args: [
      `--disable-extensions-except=${extension}`, `--load-extension=${extension}`, "--lang=en-US",
      `--host-resolver-rules=MAP scontent.cdninstagram.com:443 127.0.0.1:${cdnPort}`, "--ignore-certificate-errors",
    ],
  });
  [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent("serviceworker");
  extensionId = new URL(worker.url()).host;
  await context.route("https://www.instagram.com/**", async route => {
    const url = route.request().url();
    const request = route.request();
    instagramRequests.push(`${request.method()} ${new URL(url).pathname}${request.method() === "POST" ? ` ${new URLSearchParams(request.postData() || "").get("fb_api_req_friendly_name")}` : ""}`);
    if (url.includes("/api/v1/")) {
      apiHeaders = route.request().headers();
      if (url.includes("/users/787132/info/")) avatarAppIds.push(apiHeaders["x-ig-app-id"]);
      const { status, body } = apiResponse(url);
      return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    }
    if (url.endsWith("/graphql/query")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(graphqlResponse(route.request().postData())) });
    }
    // Every page carries the GraphQL token; profile pages also name the account ID.
    // quietacct has no current Stories; mixedup's page names natgeo's ID, as a broken lookup would.
    const profileIds = { "/natgeo/": scenario === "no-profile-id" ? null : "787132", "/quietacct/": "555", "/mixedup/": "787132" };
    const pathname = new URL(url).pathname;
    const header = scenario === "avatar-on-page" && pathname === "/natgeo/" ? profileHeader
      : pathname === "/" ? feedHtml : pathname === "/gridacct/" ? gridHtml : pathname === "/p/Ccarousel33/" ? carouselPageHtml
      : pathname === "/feedcarousel/" ? feedCarouselHtml : pathname === "/feedvideo/" ? feedVideoHtml : pathname === "/reels/Creel222222/" ? (scenario === "reel-over-feed" ? reelOverFeedHtml : reelsPageHtml)
      : pathname.startsWith("/stories/") && scenario !== "no-story-header" ? storyPageHtml() : "";
    return route.fulfill({ status: 200, contentType: "text/html", headers: { "Set-Cookie": "csrftoken=test-token; Path=/" }, body: profileHtml(profileIds[new URL(url).pathname], header) });
  });
});

after(async () => {
  await context?.close();
  cdnServer?.close();
  rmSync(work, { recursive: true, force: true });
});

// Opens an Instagram page, then the popup pointed at that tab.
async function openPopup(instagramUrl) {
  const page = await context.newPage();
  await page.goto(instagramUrl);
  const tabId = await worker.evaluate(async url => (await chrome.tabs.query({ url })).at(-1).id, instagramUrl.split("?")[0] + "*");
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 392, height: 640 });
  await popup.goto(`chrome-extension://${extensionId}/src/popup.html?tab=${tabId}`);
  // Playwright stores downloads under its own names, so record the names the extension asks for.
  await popup.evaluate(() => {
    const download = chrome.downloads.download.bind(chrome.downloads);
    window.requestedFiles = [];
    chrome.downloads.download = options => { window.requestedFiles.push(options.filename); return download(options); };
  });
  return { page, popup };
}

// Waits until `count` downloads have completed and returns the file names the popup requested.
async function waitForSaved(popup, count) {
  const completed = () => worker.evaluate(async () => (await chrome.downloads.search({ state: "complete" })).length);
  for (let i = 0; i < 50 && (await completed()) < count; i++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(await completed(), count, "every requested download completes");
  return (await popup.evaluate(() => window.requestedFiles)).sort();
}

async function close(...pages) {
  for (const page of pages) await page.close();
  await worker.evaluate(() => chrome.downloads.erase({}));
  rmSync(downloads, { recursive: true, force: true });
}

test("a photo post shows one card and saves it to Downloads/ig.tools", async () => {
  scenario = "ok";
  const { page, popup } = await openPopup("https://www.instagram.com/p/Cphoto11111/");
  await popup.locator(".card").first().waitFor();
  assert.equal(await popup.locator(".card").count(), 1);
  // One item is saved with the main button; the link field gives way to a footer link.
  assert.equal(await popup.locator(".card .save").count(), 0);
  assert.equal(await popup.locator("#form").isHidden(), true);
  assert.equal(await popup.locator("#source-name").textContent(), "@natgeo");
  assert.equal(await popup.getByRole("link", { name: "Open in ig.tools" }).isVisible(), true);
  assert.equal(apiHeaders["x-ig-app-id"], "936619743392459");
  assert.equal(apiHeaders["x-csrftoken"], "test-token");
  await popup.getByRole("button", { name: "Download photo" }).click();
  await popup.getByRole("button", { name: "Saved" }).waitFor();
  assert.deepEqual(await waitForSaved(popup, 1), ["ig.tools/natgeo/posts/Cphoto11111.jpg"]);
  await close(page, popup);
});

test("a Reel saves the MP4", async () => {
  const { page, popup } = await openPopup("https://www.instagram.com/reel/Creel222222/");
  await popup.getByRole("button", { name: "Download video" }).click();
  assert.deepEqual(await waitForSaved(popup, 1), ["ig.tools/natgeo/posts/Creel222222.mp4"]);
  await close(page, popup);
});

test("a carousel lists every slide and Download all saves them in order", async () => {
  const { page, popup } = await openPopup("https://www.instagram.com/p/Ccarousel33/");
  await popup.locator(".card").nth(2).waitFor();
  assert.equal(await popup.locator(".card").count(), 3);
  assert.equal(await popup.locator(".card .badge").count(), 1);
  if (screenshots) {
    await popup.waitForLoadState("networkidle");
    for (const scheme of ["light", "dark"]) {
      await popup.emulateMedia({ colorScheme: scheme });
      await popup.locator("body").screenshot({ path: join(screenshots, `popup-carousel-${scheme}.png`) });
    }
  }
  await popup.getByRole("button", { name: "Download all 3" }).click();
  assert.deepEqual(await waitForSaved(popup, 3), ["ig.tools/natgeo/posts/Ccarousel33_1.jpg", "ig.tools/natgeo/posts/Ccarousel33_2.mp4", "ig.tools/natgeo/posts/Ccarousel33_3.jpg"]);
  await close(page, popup);
});

test("selected slides are the only ones the main button saves", async () => {
  const { page, popup } = await openPopup("https://www.instagram.com/p/Ccarousel33/");
  await popup.getByRole("button", { name: "Select: Photo 2" }).click();
  await popup.getByRole("button", { name: "Select: Video 1" }).click();
  assert.equal(await popup.locator("#media-count").textContent(), "2 selected");
  await popup.getByRole("button", { name: "Download 2 selected" }).click();
  assert.deepEqual(await waitForSaved(popup, 2), ["ig.tools/natgeo/posts/Ccarousel33_2.mp4", "ig.tools/natgeo/posts/Ccarousel33_3.jpg"]);
  await popup.locator("#download-all.is-done").waitFor();
  // Clearing the selection offers the rest again.
  await popup.getByRole("button", { name: "Clear" }).click();
  assert.equal(await popup.locator("#download-all").textContent(), "Download all 3");
  await close(page, popup);
});

test("a Story page lists the account's current Stories in a three-column grid", async () => {
  const { page, popup } = await openPopup("https://www.instagram.com/stories/natgeo/3100/");
  await popup.locator(".card").nth(1).waitFor();
  assert.equal(await popup.locator("#grid").getAttribute("class"), "grid is-story");
  await popup.getByRole("button", { name: "Download all" }).click();
  assert.deepEqual(await waitForSaved(popup, 2), ["ig.tools/natgeo/stories/3100.jpg", "ig.tools/natgeo/stories/3101.mp4"]);
  await close(page, popup);
});

test("a long carousel scrolls inside the popup without overlapping cards", async () => {
  const { page, popup } = await openPopup("https://www.instagram.com/p/Cbigcarou10/");
  await popup.locator(".card").nth(9).waitFor({ state: "attached" });
  const boxes = await popup.locator(".card").evaluateAll(cards => cards.map(card => { const r = card.getBoundingClientRect(); return { x: Math.round(r.x), y: r.y, height: r.height }; }));
  assert.equal(boxes.length, 10);
  for (let i = 2; i < boxes.length; i++) {
    const above = boxes[i - 2];
    assert.equal(boxes[i].x, above.x, "two columns");
    assert.ok(boxes[i].y >= above.y + above.height, `card ${i + 1} starts below card ${i - 1}`);
  }
  assert.ok(boxes[0].height > 150, "cards keep their 4:5 shape");
  // Chrome caps popups at 600px; the page itself must not need a scrollbar.
  const bodyHeight = await popup.evaluate(() => document.body.getBoundingClientRect().height);
  assert.ok(bodyHeight <= 600, `popup content is ${bodyHeight}px tall`);
  await close(page, popup);
});

test("underscores in a username stay visible in the link field", async () => {
  const { page, popup } = await openPopup("https://www.instagram.com/natgeo/");
  // system-ui on Chinese Windows draws no visible underscore, so named fonts come first.
  assert.match(await popup.locator("#input").evaluate(input => getComputedStyle(input).fontFamily), /^-apple-system, "Segoe UI", system-ui/);
  await close(page, popup);
});

test("Stories use the Stories GraphQL query with the account ID from the profile page", async () => {
  const { page, popup } = await openPopup("https://www.instagram.com/stories/natgeo/3100/");
  await popup.locator(".card").nth(1).waitFor();
  assert.equal(graphqlRequest.fb_dtsg, "test-dtsg");
  assert.equal(graphqlRequest.fb_api_req_friendly_name, "PolarisStoriesV3ReelPageGalleryQuery");
  assert.deepEqual(JSON.parse(graphqlRequest.variables).reel_ids, ["787132"]);
  await close(page, popup);
});

test("without an ID in the profile page, Stories fall back to the profile API", async () => {
  scenario = "no-profile-id";
  const { page, popup } = await openPopup("https://www.instagram.com/stories/natgeo/3100/");
  await popup.locator(".card").nth(1).waitFor();
  await close(page, popup);
  scenario = "ok";
});

test("a GraphQL error is reported with the failed step", async () => {
  scenario = "graphql-error";
  const { page, popup } = await openPopup("https://www.instagram.com/stories/natgeo/3100/");
  await popup.getByText("Instagram didn't respond").waitFor();
  assert.equal(await popup.locator("#status-detail").textContent(), "(story 200 graphql-error)");
  await close(page, popup);
  scenario = "ok";
});

test("a Highlight lists its items", async () => {
  const { page, popup } = await openPopup("https://www.instagram.com/stories/highlights/17900000000000001/");
  await popup.locator(".card").first().waitFor();
  await popup.locator(".card").nth(1).waitFor();
  assert.equal(await popup.locator(".card").count(), 2);
  await close(page, popup);
});

test("signed out, the popup explains and offers ig.tools", async () => {
  scenario = "login";
  const { page, popup } = await openPopup("https://www.instagram.com/p/Cphoto11111/");
  await popup.getByText("Sign in to Instagram in this browser").waitFor();
  assert.equal(await popup.locator(".card").count(), 0);
  const [site] = await Promise.all([context.waitForEvent("page"), popup.getByRole("link", { name: "Open on ig.tools instead" }).click()]);
  assert.match(site.url(), /^https:\/\/ig\.tools\/\?url=https%3A%2F%2Fwww\.instagram\.com%2Fp%2FCphoto11111%2F&utm_source=chrome_extension/);
  await site.close();
  await close(page);
});

test("when Instagram limits requests, the popup asks to try again", async () => {
  scenario = "busy";
  const { page, popup } = await openPopup("https://www.instagram.com/reel/Creel222222/");
  await popup.getByText("Instagram didn't respond").waitFor();
  await close(page, popup);
  scenario = "ok";
});

test("a deleted post is reported as unavailable", async () => {
  const { page, popup } = await openPopup("https://www.instagram.com/p/Cmissing999/");
  await popup.getByText("private, removed or no longer available").waitFor();
  await close(page, popup);
});

test("a profile page lists the account's current Stories without opening them", async () => {
  instagramRequests.length = 0;
  const { page, popup } = await openPopup("https://www.instagram.com/natgeo/");
  await popup.locator(".card").nth(1).waitFor();
  assert.equal(await popup.locator("#media-title").textContent(), "Current Stories");
  assert.equal(await popup.locator("#grid").getAttribute("class"), "grid is-story");
  assert.equal(await popup.locator("#input").inputValue(), "https://www.instagram.com/natgeo/");
  // The account's own picture from the profile HTML, never the signed-in viewer's beside it.
  assert.match(await popup.locator("#source-picture img").getAttribute("src"), /avatar_150/);
  // Only the profile page and the Stories query; no Stories page is opened and nothing else is sent.
  assert.deepEqual(instagramRequests, ["GET /natgeo/", "GET /natgeo/", "POST /graphql/query PolarisStoriesV3ReelPageGalleryQuery"]);
  await popup.getByRole("button", { name: "Download all" }).click();
  assert.deepEqual(await waitForSaved(popup, 2), ["ig.tools/natgeo/stories/3100.jpg", "ig.tools/natgeo/stories/3101.mp4"]);
  await close(page, popup);
});

test("profile tabs reuse the account and list Highlights, then a Highlight's items", async () => {
  instagramRequests.length = 0;
  const { page, popup } = await openPopup("https://www.instagram.com/natgeo/");
  await popup.locator(".card").nth(1).waitFor();
  assert.equal(await popup.getByRole("tab", { name: "Stories" }).getAttribute("aria-selected"), "true");
  await popup.getByRole("tab", { name: "Highlights" }).click();
  await popup.getByRole("button", { name: "Travel 2026" }).waitFor();
  if (screenshots) {
    await popup.waitForLoadState("networkidle");
    await popup.locator("body").screenshot({ path: join(screenshots, "popup-highlights.png") });
  }
  assert.equal(await popup.locator("#media-note").textContent(), "Saving Highlights here doesn't add you to the viewer list.");
  // The second Highlight has no safe cover and no title, so it falls back to the tab name.
  assert.equal(await popup.locator(".highlight-open").count(), 2);
  assert.equal(await popup.locator(".highlight-cover").count(), 2);
  assert.equal(await popup.locator(".highlight-cover img").count(), 1);
  // Switching tabs reuses the account ID: no second profile page load.
  assert.deepEqual(instagramRequests.slice(1), ["GET /natgeo/", "POST /graphql/query PolarisStoriesV3ReelPageGalleryQuery", "POST /graphql/query PolarisProfileStoryHighlightsTrayContentQuery"]);
  assert.equal(JSON.parse(graphqlRequest.variables).user_id, "787132");
  await popup.getByRole("button", { name: "Travel 2026" }).click();
  await popup.locator(".card").first().waitFor();
  assert.equal(await popup.locator("#media-title").textContent(), "Travel 2026");
  assert.equal(await popup.getByRole("button", { name: "Back" }).isVisible(), true);
  assert.equal(await popup.locator("#media-note").isVisible(), true);
  await popup.getByRole("button", { name: "Download: Photo 1" }).click();
  assert.deepEqual(await waitForSaved(popup, 1), ["ig.tools/natgeo/highlights/Travel 2026/3200.jpg"]);
  await popup.getByRole("button", { name: "Back" }).click();
  await popup.getByRole("button", { name: "Travel 2026" }).waitFor();
  // Going back and to Stories again uses what was already loaded.
  const before = instagramRequests.length;
  await popup.getByRole("tab", { name: "Stories" }).click();
  await popup.locator(".card").nth(1).waitFor();
  assert.equal(instagramRequests.length, before);
  await close(page, popup);
});

test("tabs follow the arrow keys", async () => {
  const { page, popup } = await openPopup("https://www.instagram.com/quietacct/");
  await popup.getByText("This account has no Stories right now.").waitFor();
  await popup.getByRole("tab", { name: "Stories" }).focus();
  await popup.keyboard.press("ArrowRight");
  await popup.getByText("This account has no Highlights.").waitFor();
  assert.equal(await popup.getByRole("tab", { name: "Highlights" }).getAttribute("aria-selected"), "true");
  await close(page, popup);
});

test("the profile picture shown on the page is saved without any request", async () => {
  scenario = "avatar-on-page";
  avatarAppIds.length = 0;
  const { page, popup } = await openPopup("https://www.instagram.com/natgeo/");
  await popup.getByRole("tab", { name: "Profile picture" }).click();
  await popup.getByRole("button", { name: "Download profile picture" }).click();
  assert.deepEqual(await waitForSaved(popup, 1), ["ig.tools/natgeo/natgeo_profile_picture.jpg"]);
  // The account's own picture, not the viewer's small one or a look-alike username's.
  assert.match(await popup.locator(".card img").getAttribute("src"), /avatar_page_1080/);
  // The account line uses the same header picture.
  assert.match(await popup.locator("#source-picture img").getAttribute("src"), /avatar_page_1080/);
  assert.deepEqual(avatarAppIds, [], "the user info API is not called");
  assert.equal(await popup.locator("#status").isHidden(), true);
  await close(page, popup);
  scenario = "ok";
});

test("the profile picture tab saves the full-size picture", async () => {
  avatarAppIds.length = 0;
  const { page, popup } = await openPopup("https://www.instagram.com/natgeo/");
  await popup.getByRole("tab", { name: "Profile picture" }).click();
  await popup.getByRole("button", { name: "Download profile picture" }).click();
  assert.deepEqual(await waitForSaved(popup, 1), ["ig.tools/natgeo/natgeo_profile_picture.jpg"]);
  assert.match(await popup.locator(".card img").getAttribute("src"), /avatar_1080/);
  assert.equal(await popup.locator("#status").isHidden(), true);
  // As on the ig.tools site, Instagram's Android app ID is tried first.
  assert.deepEqual(avatarAppIds, ["567067343352427"]);
  await close(page, popup);
});

test("when Instagram refuses the full-size picture, the small one and ig.tools are offered", async () => {
  scenario = "avatar-limited";
  avatarAppIds.length = 0;
  const { page, popup } = await openPopup("https://www.instagram.com/natgeo/");
  await popup.getByRole("tab", { name: "Profile picture" }).click();
  await popup.getByText("Instagram didn't return the full-size picture right now").waitFor();
  if (screenshots) {
    await popup.waitForLoadState("networkidle");
    for (const scheme of ["light", "dark"]) {
      await popup.emulateMedia({ colorScheme: scheme });
      await popup.locator("body").screenshot({ path: join(screenshots, `popup-avatar-${scheme}.png`) });
    }
  }
  assert.match(await popup.locator(".card img").getAttribute("src"), /avatar_150/);
  assert.equal(await popup.locator("#status-detail").textContent(), "(avatar 429)");
  assert.deepEqual(avatarAppIds, ["567067343352427", "936619743392459"]);
  const [site] = await Promise.all([context.waitForEvent("page"), popup.getByRole("link", { name: "Get the full-size picture on ig.tools" }).click()]);
  assert.match(site.url(), /^https:\/\/ig\.tools\/instagram-profile-picture-downloader\?url=%40natgeo&utm_source=chrome_extension/);
  await site.close();
  await close(page);
  scenario = "ok";
});

test("there is no default shortcut; settings link to Chrome's shortcut page", async () => {
  const commands = await worker.evaluate(() => chrome.commands.getAll());
  assert.deepEqual(commands.filter(c => c.name === "_execute_action").map(c => c.shortcut), [""]);
  const { page, popup } = await openPopup("https://www.instagram.com/");
  await popup.getByRole("button", { name: "Settings" }).click();
  assert.equal(await popup.locator("#shortcut-keys").textContent(), "Not set");
  assert.equal(await popup.locator("#shortcut-change").textContent(), "Set");
  await close(page, popup);
});

test("a profile without current Stories says so and offers ig.tools", async () => {
  const { page, popup } = await openPopup("https://www.instagram.com/quietacct/");
  await popup.getByText("This account has no Stories right now.").waitFor();
  await popup.getByRole("link", { name: "Browse this account on ig.tools" }).waitFor();
  // Only the viewer's picture is in this page's HTML: the initial stands in.
  assert.equal(await popup.locator("#source-picture img").count(), 0);
  assert.equal(await popup.locator("#source-picture").textContent(), "q");
  await close(page, popup);
});

test("Stories of a different account than the profile are never shown", async () => {
  const { page, popup } = await openPopup("https://www.instagram.com/mixedup/");
  await popup.getByText("This account has no Stories right now.").waitFor();
  assert.equal(await popup.locator("#status-detail").textContent(), "(story owner-mismatch)");
  assert.equal(await popup.locator(".card").count(), 0);
  await close(page, popup);
});

test("pages without media only show the link field", async () => {
  const home = await openPopup("https://www.instagram.com/");
  await home.popup.getByText("Open a post, Reel, Story or profile on Instagram").waitFor();
  assert.equal(await home.popup.locator("#open").isVisible(), true);
  assert.equal(await home.popup.locator("#actions").isHidden(), true);
  await close(home.page, home.popup);
});

// ---- On-page download buttons ----
// The test build holds instagram.com access from the start, as after the user
// turns the buttons on, so the content script is registered.

// Records the file names the background asks Chrome to save.
async function recordBackgroundDownloads() {
  await worker.evaluate(() => {
    globalThis.requestedFiles = [];
    if (globalThis.downloadsWrapped) return;
    globalThis.downloadsWrapped = true;
    const download = chrome.downloads.download.bind(chrome.downloads);
    chrome.downloads.download = options => { globalThis.requestedFiles.push(options.filename); return download(options); };
  });
}
const backgroundFiles = () => worker.evaluate(() => globalThis.requestedFiles.slice().sort());

async function closePage(page) {
  await page.close();
  await worker.evaluate(() => chrome.downloads.erase({}));
  rmSync(downloads, { recursive: true, force: true });
}

test("page buttons are on after install and the switch turns them off and on", async () => {
  const registered = () => worker.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts()).map(s => [s.id, s.js, s.css]));
  assert.deepEqual(await registered(), [["page-buttons", ["src/content.js"], ["src/content.css"]]]);
  const { page, popup } = await openPopup("https://www.instagram.com/");
  await page.locator(".igt-action").first().waitFor();
  await popup.getByRole("button", { name: "Settings" }).click();
  const toggle = popup.getByRole("switch", { name: "Download buttons on Instagram" });
  assert.equal(await toggle.isChecked(), true);
  assert.equal(await popup.locator("#main").isHidden(), true);
  // Off: no new pages get the script, and the open page drops its buttons.
  await toggle.click();
  await page.locator(".igt-button").first().waitFor({ state: "detached" });
  assert.equal(await page.locator("[data-igt-done]").count(), 0);
  for (let i = 0; i < 20 && (await registered()).length; i++) await page.waitForTimeout(50);
  assert.deepEqual(await registered(), []);
  // On again: the open page gets them back without a reload.
  await toggle.click();
  await page.locator(".igt-action").first().waitFor();
  for (let i = 0; i < 20 && !(await registered()).length; i++) await page.waitForTimeout(50);
  assert.equal((await registered()).length, 1);
  await popup.getByRole("button", { name: "Back" }).click();
  assert.equal(await popup.locator("#main").isVisible(), true);
  await close(page, popup);
});

test("the folder setting changes where the popup and the page buttons save", async () => {
  const { page, popup } = await openPopup("https://www.instagram.com/p/Cphoto11111/");
  await popup.locator(".card").first().waitFor();
  assert.equal(await popup.locator("#actions-note").textContent(), "Saves to Downloads/ig.tools/natgeo/posts/");
  await popup.getByRole("button", { name: "Settings" }).click();
  assert.equal(await popup.getByRole("radio", { name: /By account/ }).isChecked(), true);
  await popup.getByRole("radio", { name: /Straight to Downloads/ }).check();
  await popup.getByRole("button", { name: "Back" }).click();
  assert.equal(await popup.locator("#actions-note").textContent(), "Saves to Downloads/");
  await popup.getByRole("button", { name: "Download photo" }).click();
  assert.deepEqual(await waitForSaved(popup, 1), ["natgeo_Cphoto11111.jpg"]);
  await close(page, popup);
  // The page buttons read the same setting.
  await worker.evaluate(() => chrome.storage.local.set({ folderLayout: "folder" }));
  await recordBackgroundDownloads();
  const feed = await context.newPage();
  await feed.goto("https://www.instagram.com/");
  await feed.locator("article .igt-action").first().click();
  await feed.locator('article .igt-action[data-igt-state="done"]').first().waitFor();
  assert.deepEqual(await backgroundFiles(), ["ig.tools/natgeo_Cphoto11111.jpg"]);
  await closePage(feed);
  await worker.evaluate(() => chrome.storage.local.clear());
});

test("a feed post gets a button next to the bookmark that saves the post", async () => {
  await recordBackgroundDownloads();
  const page = await context.newPage();
  await page.goto("https://www.instagram.com/");
  const button = page.locator("article").first().locator(".igt-action");
  await button.waitFor();
  // In the bookmark's group, in front of the bookmark.
  assert.equal(await page.locator("article").first().evaluate(a => a.querySelector("section").lastElementChild.firstElementChild.classList.contains("igt-action")), true);
  assert.equal(await button.getAttribute("aria-label"), "Download with ig.tools");
  await button.click();
  await page.locator('article .igt-action[data-igt-state="done"]').first().waitFor();
  assert.deepEqual(await backgroundFiles(), ["ig.tools/natgeo/posts/Cphoto11111.jpg"]);
  // Each row gets one button, also after the page re-renders.
  await page.evaluate(() => document.body.append(document.createElement("div")));
  await page.waitForTimeout(100);
  assert.equal(await page.locator(".igt-action").count(), 2);
  await closePage(page);
});

test("a failed download shows on the button with the reason", async () => {
  const page = await context.newPage();
  await page.goto("https://www.instagram.com/");
  const button = page.locator("article").nth(1).locator(".igt-action");
  await button.click();
  await page.locator('article .igt-action[data-igt-state="failed"]').waitFor();
  assert.match(await button.getAttribute("title"), /^Couldn't download/);
  await closePage(page);
});

test("profile grid tiles get a download button on hover", async () => {
  await recordBackgroundDownloads();
  const page = await context.newPage();
  await page.goto("https://www.instagram.com/gridacct/");
  const tileButton = page.locator(".igt-tile-button").first();
  await tileButton.waitFor({ state: "attached" });
  assert.equal(await page.locator(".igt-tile-button").count(), 2);
  assert.equal(await tileButton.evaluate(b => getComputedStyle(b).opacity), "0");
  await page.locator(".igt-tile").first().hover();
  await page.waitForTimeout(250);
  assert.equal(await tileButton.evaluate(b => getComputedStyle(b).opacity), "1");
  await tileButton.click();
  await page.locator('.igt-tile-button[data-igt-state="done"]').waitFor();
  // The click saved the post and did not follow the tile's link.
  assert.equal(new URL(page.url()).pathname, "/gridacct/");
  assert.deepEqual(await backgroundFiles(), ["ig.tools/natgeo/posts/Ccarousel33_1.jpg", "ig.tools/natgeo/posts/Ccarousel33_2.mp4", "ig.tools/natgeo/posts/Ccarousel33_3.jpg"]);
  await closePage(page);
});

test("a Story gets a header control before \"more\" that saves the Story on screen", async () => {
  await recordBackgroundDownloads();
  const page = await context.newPage();
  await page.goto("https://www.instagram.com/stories/natgeo/3101/");
  const button = page.locator(".igt-story-button");
  await button.waitFor();
  // With the sound and pause controls, right after pause and before "more".
  assert.equal(await button.evaluate(b => b.parentElement.classList.contains("controls") && b.previousElementSibling.classList.contains("pause")), true);
  assert.equal(await page.locator(".igt-float").count(), 0);
  await button.click();
  await page.locator('.igt-story-button[data-igt-state="done"]').waitFor();
  // Only the Story in the address, not the account's other Stories.
  assert.deepEqual(await backgroundFiles(), ["ig.tools/natgeo/stories/3101.mp4"]);
  await closePage(page);
});

test("a Highlight's header control saves the item playing, read from the progress bars", async () => {
  await recordBackgroundDownloads();
  const page = await context.newPage();
  await page.goto("https://www.instagram.com/stories/highlights/17900000000000001/");
  const button = page.locator(".igt-story-button");
  await button.click();
  await page.locator('.igt-story-button[data-igt-state="done"]').waitFor();
  // Bars: the first is full, the second partly filled, so the second item is playing.
  assert.deepEqual(await backgroundFiles(), ["ig.tools/natgeo/highlights/17900000000000001/3201.mp4"]);
  await closePage(page);
});

test("without a recognisable Story header, a floating button is the fallback", async () => {
  scenario = "no-story-header";
  await recordBackgroundDownloads();
  const page = await context.newPage();
  await page.goto("https://www.instagram.com/stories/natgeo/3101/");
  const button = page.locator(".igt-float");
  await button.waitFor({ timeout: 5000 });
  assert.equal(await button.textContent(), "Download");
  await button.click();
  await page.locator('.igt-float[data-igt-state="done"]').waitFor();
  assert.deepEqual(await backgroundFiles(), ["ig.tools/natgeo/stories/3101.mp4"]);
  // Leaving the Stories viewer removes the button.
  await page.evaluate(() => history.pushState({}, "", "/natgeo/"));
  await page.evaluate(() => document.body.append(document.createElement("div")));
  await button.waitFor({ state: "detached" });
  await closePage(page);
  scenario = "ok";
});

test("the Reels player gets a button in its action column, between share and save", async () => {
  await recordBackgroundDownloads();
  const page = await context.newPage();
  await page.goto("https://www.instagram.com/reels/Creel222222/");
  const button = page.locator(".igt-reel-button");
  await button.waitFor();
  const placement = await button.evaluate(b => {
    const wrapper = b.parentElement;
    return { previous: wrapper.previousElementSibling.className, next: wrapper.nextElementSibling.className, wrapper: wrapper.className };
  });
  assert.deepEqual(placement, { previous: "reel-item item-share", next: "reel-item item-save", wrapper: "reel-item item-share" });
  assert.equal(await page.locator(".igt-float").count(), 0);
  await button.click();
  await page.locator('.igt-reel-button[data-igt-state="done"]').waitFor();
  assert.deepEqual(await backgroundFiles(), ["ig.tools/natgeo/posts/Creel222222.mp4"]);
  await closePage(page);
});

test("a Reel opened from the feed gets its button in the viewer layer, not in the feed", async () => {
  scenario = "reel-over-feed";
  await recordBackgroundDownloads();
  const page = await context.newPage();
  await page.goto("https://www.instagram.com/reels/Creel222222/");
  const button = page.locator(".igt-reel-button");
  await button.waitFor();
  assert.equal(await page.locator(".igt-reel-button").count(), 1);
  assert.equal(await button.evaluate(b => Boolean(b.closest(".reel-layer")) && b.parentElement.nextElementSibling.className), "reel-item item-save");
  await button.click();
  await page.locator('.igt-reel-button[data-igt-state="done"]').waitFor();
  assert.deepEqual(await backgroundFiles(), ["ig.tools/natgeo/posts/Creel222222.mp4"]);
  await closePage(page);
  scenario = "ok";
});

test("a feed carousel's slide button stays put while the slides scroll", async () => {
  await recordBackgroundDownloads();
  const page = await context.newPage();
  await page.goto("https://www.instagram.com/feedcarousel/");
  const button = page.locator(".igt-slide-button");
  await button.waitFor({ state: "attached" });
  // In the non-scrolling parent of the scrolling frame.
  assert.equal(await button.evaluate(b => b.parentElement.classList.contains("host")), true);
  const before = await button.boundingBox();
  await page.locator(".scroller").evaluate(s => { s.scrollLeft = 400; });
  await page.locator(".host").hover();
  assert.deepEqual(await button.boundingBox(), before);
  await button.hover();
  assert.equal(await button.getAttribute("aria-label"), "Download this one (2/3)");
  await button.click();
  await page.locator('.igt-slide-button[data-igt-state="done"]').waitFor();
  assert.deepEqual(await backgroundFiles(), ["ig.tools/natgeo/posts/Ccarousel33_2.mp4"]);
  await closePage(page);
});

test("a carousel gets a top-right button that saves only the slide on screen", async () => {
  await recordBackgroundDownloads();
  const page = await context.newPage();
  await page.goto("https://www.instagram.com/p/Ccarousel33/");
  const slideButton = page.locator(".igt-slide-button");
  await slideButton.waitFor({ state: "attached" });
  assert.equal(await page.locator(".igt-slide-button").count(), 1);
  // Hidden until the pointer is over the media, then in the top-right corner.
  assert.equal(await slideButton.evaluate(b => getComputedStyle(b).opacity), "0");
  await page.locator(".frame").hover();
  await page.waitForTimeout(250);
  assert.equal(await slideButton.evaluate(b => getComputedStyle(b).opacity), "1");
  const [frame, button] = await Promise.all([page.locator(".frame").boundingBox(), slideButton.boundingBox()]);
  assert.ok(button.x + button.width > frame.x + frame.width - 24 && button.y < frame.y + 24, "top-right corner");
  // Swipe to the second slide (a video) and save it.
  await page.locator(".track").evaluate(track => { track.style.transform = "translateX(-400px)"; });
  await slideButton.hover();
  assert.equal(await slideButton.getAttribute("aria-label"), "Download this one (2/3)");
  await slideButton.click();
  await page.locator('.igt-slide-button[data-igt-state="done"]').waitFor();
  assert.deepEqual(await backgroundFiles(), ["ig.tools/natgeo/posts/Ccarousel33_2.mp4"]);
  // The action row button still saves every slide, and says so.
  const allButton = page.locator(".igt-action");
  await allButton.hover();
  assert.equal(await allButton.getAttribute("aria-label"), "Download all 3");
  await recordBackgroundDownloads();
  await allButton.click();
  await page.locator('.igt-action[data-igt-state="done"]').waitFor();
  assert.deepEqual(await backgroundFiles(), ["ig.tools/natgeo/posts/Ccarousel33_1.jpg", "ig.tools/natgeo/posts/Ccarousel33_2.mp4", "ig.tools/natgeo/posts/Ccarousel33_3.jpg"]);
  // A re-rendered slide list keeps a single button in the frame.
  await page.locator("ul").evaluate(ul => ul.replaceWith(ul.cloneNode(true)));
  await page.waitForTimeout(150);
  assert.equal(await page.locator(".igt-slide-button").count(), 1);
  await closePage(page);
});

test("a single photo gets the same top-right button as a carousel slide", async () => {
  await recordBackgroundDownloads();
  const page = await context.newPage();
  await page.goto("https://www.instagram.com/");
  const button = page.locator(".igt-media-button");
  await button.waitFor({ state: "attached" });
  // Only the post with a photo; the second post has none.
  assert.equal(await page.locator(".igt-media-button").count(), 1);
  assert.equal(await button.evaluate(b => b.parentElement.classList.contains("media")), true);
  assert.equal(await button.evaluate(b => getComputedStyle(b).opacity), "0");
  await page.locator("article .media").first().hover();
  await page.waitForTimeout(250);
  assert.equal(await button.evaluate(b => getComputedStyle(b).opacity), "1");
  const [media, box] = await Promise.all([page.locator("article .media").first().boundingBox(), button.boundingBox()]);
  assert.ok(box.x + box.width > media.x + media.width - 24 && box.y < media.y + 24, "top-right corner");
  // The action row button stays a plain "download" on single posts.
  assert.equal(await page.locator(".igt-action").first().getAttribute("aria-label"), "Download with ig.tools");
  await button.click();
  await page.locator('.igt-media-button[data-igt-state="done"]').waitFor();
  assert.deepEqual(await backgroundFiles(), ["ig.tools/natgeo/posts/Cphoto11111.jpg"]);
  await closePage(page);
});

test("on a feed video the top-right button moves below the header Instagram lays over it", async () => {
  await recordBackgroundDownloads();
  const page = await context.newPage();
  await page.goto("https://www.instagram.com/feedvideo/");
  const button = page.locator(".igt-media-button");
  await button.waitFor({ state: "attached" });
  await page.locator(".media").hover();
  await page.waitForTimeout(250);
  const [more, box] = await Promise.all([page.locator(".overlay-header [role=button]").last().boundingBox(), button.boundingBox()]);
  assert.ok(box.y >= more.y + more.height + 4, `button at ${box.y} clears "more" ending at ${more.y + more.height}`);
  await button.click();
  await page.locator('.igt-media-button[data-igt-state="done"]').waitFor();
  assert.deepEqual(await backgroundFiles(), ["ig.tools/natgeo/posts/Creel222222.mp4"]);
  await closePage(page);
});

test("carousels get no second button for the whole post's media", async () => {
  for (const path of ["/p/Ccarousel33/", "/feedcarousel/"]) {
    const page = await context.newPage();
    await page.goto(`https://www.instagram.com${path}`);
    await page.locator(".igt-slide-button").waitFor({ state: "attached" });
    await page.waitForTimeout(200);
    assert.equal(await page.locator(".igt-slide-button").count(), 1, path);
    assert.equal(await page.locator(".igt-media-button").count(), 0, path);
    await closePage(page);
  }
});
