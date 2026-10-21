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
export async function collectFromPage(page) {
  const appId = "936619743392459";
  const csrf = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/)?.[1] ?? "";
  const restHeaders = { "X-IG-App-ID": appId, "X-Requested-With": "XMLHttpRequest", "X-CSRFToken": csrf };
  const storyQueries = {
    story: { name: "PolarisStoriesV3ReelPageGalleryQuery", docId: "28262315486766731" },
    highlight: { name: "PolarisStoriesV3HighlightsPageQuery", docId: "28325328583775973" },
  };

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

  // The profile page HTML is what the browser loads anyway; it names the account
  // ID ("profile_id") and carries a request token for GraphQL.
  async function profilePage(username) {
    try {
      const { response } = await request("profile", `/${encodeURIComponent(username)}/`);
      const html = await response.text();
      return { userId: html.match(/"profile_id":"(\d{3,25})"/)?.[1] ?? null, dtsg: dtsgFrom(html) };
    } catch (error) {
      if (error?.reason === "unavailable") throw error;
      return { userId: null, dtsg: null };
    }
  }

  async function storyItems(kind, reelId, dtsg) {
    const { name, docId } = storyQueries[kind];
    if (!dtsg) throw { reason: "login", detail: `${kind} no-token` };
    const body = new URLSearchParams({
      fb_dtsg: dtsg,
      fb_api_caller_class: "RelayModern",
      fb_api_req_friendly_name: name,
      doc_id: docId,
      variables: JSON.stringify({ initial_reel_id: reelId, reel_ids: [reelId], first: 3, last: 2, __relay_internal__pv__PolarisCommunityNoteStoriesLabelEnabledrelayprovider: true }),
      server_timestamps: true,
    });
    const { response, detail } = await request(kind, "/graphql/query", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "X-CSRFToken": csrf, "X-IG-App-ID": appId, "X-FB-Friendly-Name": name },
      body,
    });
    let data;
    try { data = await response.json(); } catch { throw { reason: "failed", detail: `${detail} not-json` }; }
    if (data?.errors?.length && !data?.data) throw { reason: "failed", detail: `${detail} graphql-error` };
    const node = data?.data?.xdt_api__v1__feed__reels_media__connection?.edges?.[0]?.node;
    return { items: node?.items ?? [], owner: node?.user?.username ?? null };
  }

  try {
    if (page.kind === "post") {
      const data = await rest("media", `/api/v1/media/${page.mediaId}/info/`);
      return { items: data?.items ?? [] };
    }
    if (page.kind === "story") {
      const profile = await profilePage(page.username);
      let userId = profile.userId;
      if (!userId) {
        const data = await rest("profile-api", `/api/v1/users/web_profile_info/?username=${encodeURIComponent(page.username)}`);
        userId = data?.data?.user?.id;
      }
      if (!userId) return { reason: "unavailable", detail: "profile no-id" };
      const result = await storyItems("story", userId, dtsgFromDocument() ?? profile.dtsg);
      // Never offer another account's Stories if the ID lookup went wrong.
      if (result.owner && result.owner.toLowerCase() !== page.username.toLowerCase()) return { reason: "unavailable", detail: "story owner-mismatch" };
      return { ...result, owner: result.owner ?? page.username };
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
