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
import { bigCarouselPost, carouselPost, highlightGraphql, photoPost, profileHtml, reelPost, storyGraphql, storyProfile } from "../fixtures.js";
import { shortcodeToId } from "../../src/instagram.js";

const root = fileURLToPath(new URL("../..", import.meta.url));
// The stand-in API answers /api/v1/media/<id>/info/ for these posts only.
const posts = new Map([[shortcodeToId("Cphoto11111"), photoPost], [shortcodeToId("Creel222222"), reelPost], [shortcodeToId("Ccarousel33"), carouselPost], [shortcodeToId("Cbigcarou10"), bigCarouselPost]]);
let context, worker, extensionId, work, downloads, cdnServer, apiHeaders, graphqlRequest;
// Every instagram.com request, as "METHOD /path [GraphQL query name]".
const instagramRequests = [];
// Set POPUP_SCREENSHOTS=<dir> to save popup screenshots for review or the store listing.
const screenshots = process.env.POPUP_SCREENSHOTS;
let scenario = "ok";

// A click on the toolbar icon grants activeTab for instagram.com. Tests cannot
// click the toolbar, so a copy of the extension gets that host access up front.
function extensionCopy() {
  const dir = join(work, "extension");
  for (const entry of ["manifest.json", "src", "_locales", "icons"]) cpSync(join(root, entry), join(dir, entry), { recursive: true });
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  manifest.host_permissions = ["https://www.instagram.com/*"];
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest));
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
  // Like Instagram today, the old REST Stories endpoint fails; Stories must use GraphQL.
  if (pathname === "/api/v1/feed/reels_media/") return { status: 500, body: { status: "fail" } };
  return { status: 404, body: {} };
}

// The Stories viewer's GraphQL queries, keyed by doc_id.
function graphqlResponse(form) {
  graphqlRequest = Object.fromEntries(new URLSearchParams(form));
  if (scenario === "graphql-error") return { errors: [{ message: "execution error" }] };
  const { reel_ids: [reelId] } = JSON.parse(graphqlRequest.variables);
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
      const { status, body } = apiResponse(url);
      return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    }
    if (url.endsWith("/graphql/query")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(graphqlResponse(route.request().postData())) });
    }
    // Every page carries the GraphQL token; profile pages also name the account ID.
    // quietacct has no current Stories; mixedup's page names natgeo's ID, as a broken lookup would.
    const profileIds = { "/natgeo/": scenario === "no-profile-id" ? null : "787132", "/quietacct/": "555", "/mixedup/": "787132" };
    return route.fulfill({ status: 200, contentType: "text/html", headers: { "Set-Cookie": "csrftoken=test-token; Path=/" }, body: profileHtml(profileIds[new URL(url).pathname]) });
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
  assert.equal(await popup.locator("#download-all").isHidden(), true);
  assert.equal(await popup.locator("#open").getAttribute("class"), "secondary");
  assert.equal(apiHeaders["x-ig-app-id"], "936619743392459");
  assert.equal(apiHeaders["x-csrftoken"], "test-token");
  await popup.getByRole("button", { name: "Download: Photo 1" }).click();
  await popup.getByRole("button", { name: "Saved" }).waitFor();
  assert.deepEqual(await waitForSaved(popup, 1), ["ig.tools/natgeo_Cphoto11111.jpg"]);
  await close(page, popup);
});

test("a Reel saves the MP4", async () => {
  const { page, popup } = await openPopup("https://www.instagram.com/reel/Creel222222/");
  await popup.getByRole("button", { name: "Download: Video 1" }).click();
  assert.deepEqual(await waitForSaved(popup, 1), ["ig.tools/natgeo_Creel222222.mp4"]);
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
  await popup.getByRole("button", { name: "Download all" }).click();
  assert.deepEqual(await waitForSaved(popup, 3), ["ig.tools/natgeo_Ccarousel33_1.jpg", "ig.tools/natgeo_Ccarousel33_2.mp4", "ig.tools/natgeo_Ccarousel33_3.jpg"]);
  await close(page, popup);
});

test("a Story page lists the account's current Stories in a three-column grid", async () => {
  const { page, popup } = await openPopup("https://www.instagram.com/stories/natgeo/3100/");
  await popup.locator(".card").nth(1).waitFor();
  assert.equal(await popup.locator("#grid").getAttribute("class"), "grid is-story");
  await popup.getByRole("button", { name: "Download all" }).click();
  assert.deepEqual(await waitForSaved(popup, 2), ["ig.tools/natgeo_3100.jpg", "ig.tools/natgeo_3101.mp4"]);
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
  assert.equal(await popup.locator(".card").count(), 1);
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
  // Only the profile page and the Stories query; no Stories page is opened and nothing else is sent.
  assert.deepEqual(instagramRequests, ["GET /natgeo/", "GET /natgeo/", "POST /graphql/query PolarisStoriesV3ReelPageGalleryQuery"]);
  await popup.getByRole("button", { name: "Download all" }).click();
  assert.deepEqual(await waitForSaved(popup, 2), ["ig.tools/natgeo_3100.jpg", "ig.tools/natgeo_3101.mp4"]);
  await close(page, popup);
});

test("a profile without current Stories says so and offers ig.tools", async () => {
  const { page, popup } = await openPopup("https://www.instagram.com/quietacct/");
  await popup.getByText("This account has no Stories right now.").waitFor();
  await popup.getByRole("link", { name: "Browse this account on ig.tools" }).waitFor();
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
  assert.equal(await home.popup.locator("#open").getAttribute("class"), "primary");
  await close(home.page, home.popup);
});
