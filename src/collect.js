// Runs inside the open Instagram tab (chrome.scripting.executeScript, after the
// user clicks the toolbar icon). It asks Instagram's own web API for the media
// on this page, with the user's existing Instagram session, and returns the
// raw items to the popup. Nothing is sent anywhere else.
//
// Chrome serializes this function into the page, so it must not use anything
// from outside its own body.
//
// Endpoints (checked October 2026; update here when Instagram changes them):
// - posts and Reels: REST /api/v1/media/<id>/info/
// - Stories and Highlights: the GraphQL queries instagram.com's own Stories
//   viewer uses. The REST /api/v1/feed/reels_media/ endpoint now answers 500.
// - account ID for Stories: "profile_id" in the profile page's HTML, with
//   /api/v1/users/web_profile_info/ (often rate limited) as the fallback.
// - Highlights tray: GraphQL PolarisProfileStoryHighlightsTrayContentQuery.
// - full-size profile picture: the <img> instagram.com shows in the profile header
//   (1080px); then REST /api/v1/users/<id>/info/ (rate limited at times); the
//   150px picture in the profile page HTML is the last fallback.
export async function collectFromPage(page) {
  const appId = "936619743392459";
  const csrf = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/)?.[1] ?? "";
  const restHeaders = { "X-IG-App-ID": appId, "X-Requested-With": "XMLHttpRequest", "X-CSRFToken": csrf };
  const storyQueries = {
    story: { name: "PolarisStoriesV3ReelPageGalleryQuery", docId: "28262315486766731" },
    highlight: { name: "PolarisStoriesV3HighlightsPageQuery", docId: "28325328583775973" },
  };
  // The profile's Highlights tray (found in instagram.com's own scripts, October 2026).
  const highlightsTrayQuery = { name: "PolarisProfileStoryHighlightsTrayContentQuery", docId: "38168009559465141" };
  // The full-size profile picture comes from /api/v1/users/<id>/info/. Instagram's
  // Android app ID is tried first, as on the ig.tools site, then the web one.
  const avatarAppIds = ["567067343352427", appId];

  // Failures carry the step and HTTP status so a report can say which request broke.
  async function request(step, path, options = {}) {
    let response;
    try {
      response = await fetch(path, { credentials: "include", ...options });
    } catch {
      throw { reason: "failed", detail: `${step} network` };
    }
    const detail = `${step} ${response.status}`;
    if (response.status === 401 || response.status === 403) throw { reason: "login", detail };
    if (response.status === 404) throw { reason: "unavailable", detail };
    if (!response.ok) throw { reason: "failed", detail };
    return { response, detail };
  }

  async function rest(step, path) {
    const { response, detail } = await request(step, path, { headers: restHeaders });
    let data;
    try { data = await response.json(); } catch { throw { reason: "login", detail: `${detail} not-json` }; }
    // Signed-out requests can return 200 with a login challenge instead of data.
    if (data?.require_login || data?.message === "login_required") throw { reason: "login", detail: `${detail} login_required` };
    return data;
  }

  const dtsgPattern = /"DTSGInitialData",\[\],\{"token":"([^"]+)"|"dtsg":\s*\{\s*"token":"([^"]+)"/;
  function dtsgFrom(text) {
    const match = text.match(dtsgPattern);
    return match?.[1] ?? match?.[2] ?? null;
  }
  function dtsgFromDocument() {
    for (const script of document.scripts) {
      const token = dtsgFrom(script.textContent || "");
      if (token) return token;
    }
    return null;
  }

  // A profile picture in page HTML, only where the nearest "username" is this
  // account's: the HTML also carries the signed-in viewer's own picture
  // (October 2026: on another account's profile, often only the viewer's).
  function pictureFromHtml(html, username) {
    const names = [...html.matchAll(/"username":"([^"]+)"/g)].map(match => ({ at: match.index, name: match[1].toLowerCase() }));
    for (const match of html.matchAll(/"profile_pic_url_hd":"((?:[^"\\]|\\.)*)"/g)) {
      const nearest = names.reduce((best, entry) => (Math.abs(entry.at - match.index) < Math.abs((best?.at ?? Infinity) - match.index) ? entry : best), null);
      if (nearest?.name !== username.toLowerCase() || Math.abs(nearest.at - match.index) > 2000) continue;
      try { return JSON.parse(`"${match[1]}"`) || null; } catch { return null; }
    }
    return null;
  }

  // The profile page HTML is what the browser loads anyway; it names the account
  // ID ("profile_id"), carries a request token for GraphQL and maybe a small profile picture.
  async function profilePage(username) {
    try {
      const { response } = await request("profile", `/${encodeURIComponent(username)}/`);
      const html = await response.text();
      return { userId: html.match(/"profile_id":"(\d{3,25})"/)?.[1] ?? null, dtsg: dtsgFrom(html), smallPicture: pictureFromHtml(html, username) };
    } catch (error) {
      if (error?.reason === "unavailable") throw error;
      return { userId: null, dtsg: null, smallPicture: null };
    }
  }

  // The account behind a profile or Story page. The popup passes the ID back
  // once known, so switching tabs does not load the profile page again.
  // `headerPicture` is the picture in the profile header on the page, for the
  // popup's account line.
  async function account(page) {
    const headerPicture = pictureOnPage(page.username)?.url ?? null;
    if (page.userId) return { userId: page.userId, dtsg: dtsgFromDocument(), smallPicture: page.smallPicture ?? null, headerPicture };
    const profile = await profilePage(page.username);
    if (!profile.userId) {
      const data = await rest("profile-api", `/api/v1/users/web_profile_info/?username=${encodeURIComponent(page.username)}`);
      profile.userId = data?.data?.user?.id ?? null;
    }
    if (!profile.userId) throw { reason: "unavailable", detail: "profile no-id" };
    return { ...profile, dtsg: dtsgFromDocument() ?? profile.dtsg, headerPicture };
  }

  async function graphql(step, { name, docId }, variables, dtsg) {
    if (!dtsg) throw { reason: "login", detail: `${step} no-token` };
    const body = new URLSearchParams({
      fb_dtsg: dtsg,
      fb_api_caller_class: "RelayModern",
      fb_api_req_friendly_name: name,
      doc_id: docId,
      variables: JSON.stringify(variables),
      server_timestamps: true,
    });
    const { response, detail } = await request(step, "/graphql/query", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "X-CSRFToken": csrf, "X-IG-App-ID": appId, "X-FB-Friendly-Name": name },
      body,
    });
    let data;
    try { data = await response.json(); } catch { throw { reason: "failed", detail: `${detail} not-json` }; }
    if (data?.errors?.length && !data?.data) throw { reason: "failed", detail: `${detail} graphql-error` };
    return data?.data ?? {};
  }

  async function storyItems(kind, reelId, dtsg) {
    const variables = { initial_reel_id: reelId, reel_ids: [reelId], first: 3, last: 2, __relay_internal__pv__PolarisCommunityNoteStoriesLabelEnabledrelayprovider: true };
    const data = await graphql(kind, storyQueries[kind], variables, dtsg);
    const node = data?.xdt_api__v1__feed__reels_media__connection?.edges?.[0]?.node;
    return { items: node?.items ?? [], owner: node?.user?.username ?? null };
  }

  // The profile header shows the full-size picture (1080px) once instagram.com has
  // loaded it; the HTML only names a 150px one. Its alt text contains the username
  // in every language ("<username>'s profile picture"), which also rules out a stale
  // header left from the previous profile.
  function pictureOnPage(username) {
    // The whole username, not part of a longer one ("geo" must not match "natgeo").
    const name = new RegExp(`(^|[^a-z0-9._])${username.toLowerCase().replace(/\./g, "\\.")}($|[^a-z0-9._])`);
    const candidates = [...document.querySelectorAll("header img, main img")]
      .filter(img => name.test((img.alt || "").toLowerCase()) && !/[sp]\d{2,3}x\d{2,3}/.test(img.currentSrc || img.src))
      .sort((a, b) => b.naturalWidth - a.naturalWidth);
    const img = candidates[0];
    if (!img) return null;
    return { url: img.currentSrc || img.src, width: img.naturalWidth || null, height: img.naturalHeight || null, hd: true };
  }

  // The picture shown on the page first, then the user info API, then the small
  // picture from the profile page HTML.
  async function profilePicture(userId, smallPicture, username) {
    const shown = pictureOnPage(username);
    if (shown) return { picture: shown };
    let detail = "avatar";
    for (const id of avatarAppIds) {
      try {
        const response = await fetch(`/api/v1/users/${userId}/info/`, { credentials: "include", headers: { ...restHeaders, "X-IG-App-ID": id } });
        detail = `avatar ${response.status}`;
        if (!response.ok) continue;
        const user = (await response.json())?.user;
        const versions = [user?.hd_profile_pic_url_info, ...(user?.hd_profile_pic_versions ?? [])].filter(v => v?.url);
        versions.sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
        if (versions[0]) return { picture: { url: versions[0].url, width: versions[0].width, height: versions[0].height, hd: true } };
      } catch {
        detail = "avatar network";
      }
    }
    return { picture: smallPicture ? { url: smallPicture, hd: false } : null, detail };
  }

  try {
    if (page.kind === "post") {
      const data = await rest("media", `/api/v1/media/${page.mediaId}/info/`);
      return { items: data?.items ?? [] };
    }
    if (page.kind === "story") {
      const { userId, dtsg, smallPicture, headerPicture } = await account(page);
      const result = await storyItems("story", userId, dtsg);
      // Never offer another account's Stories if the ID lookup went wrong.
      if (result.owner && result.owner.toLowerCase() !== page.username.toLowerCase()) return { reason: "unavailable", detail: "story owner-mismatch", userId, smallPicture, headerPicture };
      return { ...result, owner: result.owner ?? page.username, userId, smallPicture, headerPicture };
    }
    if (page.kind === "highlights") {
      const { userId, dtsg, smallPicture, headerPicture } = await account(page);
      const data = await graphql("highlights", highlightsTrayQuery, { user_id: userId }, dtsg);
      return { highlights: data?.highlights ?? { edges: [] }, userId, smallPicture, headerPicture };
    }
    if (page.kind === "avatar") {
      const { userId, smallPicture, headerPicture } = await account(page);
      return { ...await profilePicture(userId, smallPicture, page.username), userId, smallPicture, headerPicture };
    }
    if (page.kind === "highlight") {
      let dtsg = dtsgFromDocument();
      if (!dtsg) {
        const { response } = await request("home", "/");
        dtsg = dtsgFrom(await response.text());
      }
      return await storyItems("highlight", `highlight:${page.highlightId}`, dtsg);
    }
    return { reason: "unsupported" };
  } catch (error) {
    return { reason: error?.reason ?? "failed", detail: error?.detail ?? String(error?.message ?? error) };
  }
}
