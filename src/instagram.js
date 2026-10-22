// Pure helpers for the "save from this page" feature: what the current
// Instagram page is, and how Instagram's own API responses map to files.
// Nothing here talks to the network; see collect.js for the page request.

const reserved = new Set(["accounts", "direct", "explore", "reels", "stories", "p", "reel", "tv", "about", "legal", "developer", "web", "emails"]);

// Describes the Instagram page at `url`, or returns null for other sites.
export function pageFromUrl(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  if (parsed.protocol !== "https:" || !/^(?:www\.|m\.)?instagram\.com$/i.test(parsed.hostname)) return null;
  const parts = parsed.pathname.split("/").filter(Boolean);
  const [first = "", second = "", third = ""] = parts;
  const shortcode = /^[A-Za-z0-9_-]{5,64}$/;
  if (["p", "reel", "reels", "tv"].includes(first) && shortcode.test(second)) return { kind: "post", shortcode: second };
  // A Reel opened from a profile grid can also live at /<username>/reel/<code>/.
  if (["p", "reel"].includes(second) && shortcode.test(third)) return { kind: "post", shortcode: third };
  if (first === "stories" && second === "highlights" && /^\d{5,25}$/.test(third)) return { kind: "highlight", highlightId: third };
  if (first === "stories" && /^[A-Za-z0-9._]{1,30}$/.test(second)) {
    return { kind: "story", username: second.toLowerCase(), storyId: /^\d{1,25}$/.test(third) ? third : null };
  }
  if (first && !reserved.has(first.toLowerCase()) && /^[A-Za-z0-9._]{1,30}$/.test(first)) return { kind: "profile", username: first.toLowerCase() };
  return { kind: "other" };
}

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

// Instagram shortcodes are the media ID written in base 64. Longer codes from
// private shares carry extra characters after the first 11, which are not part of the ID.
export function shortcodeToId(shortcode) {
  let id = 0n;
  for (const char of shortcode.slice(0, 11)) {
    const value = alphabet.indexOf(char);
    if (value < 0) return null;
    id = id * 64n + BigInt(value);
  }
  return id.toString();
}

// Only Instagram's own media CDNs are trusted as download sources.
export function safeMediaUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(?:^|\.)(?:cdninstagram\.com|fbcdn\.net)$/i.test(url.hostname) ? url.href : null;
  } catch { return null; }
}

function largest(candidates) {
  return (Array.isArray(candidates) ? candidates : [])
    .map(c => ({ url: safeMediaUrl(c?.url), width: Number(c?.width) || null, height: Number(c?.height) || null }))
    .filter(c => c.url)
    .sort((a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0));
}

function extension(url, type) {
  const match = new URL(url).pathname.match(/\.(jpe?g|png|webp|heic|mp4)$/i);
  return match ? match[1].toLowerCase().replace("jpeg", "jpg") : type === "video" ? "mp4" : "jpg";
}

// File and folder names are path segments, so "." and ".." are never returned.
const safeName = value => {
  const name = String(value || "instagram").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 60);
  return /^\.+$/.test(name) ? "_" : name;
};

// A folder name from free text such as a Highlight title: keeps letters in any
// script, drops characters Windows and macOS reject, and never yields "." or "..".
export function safeFolder(value, fallback) {
  const cleaned = String(value ?? "")
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, "");
  return [...cleaned].slice(0, 60).join("").trim() || safeName(fallback);
}

// Turns one API item (a post, Reel, carousel or Story) into the files it contains.
// Videos use the largest progressive MP4 Instagram provides, which carries audio.
function filesFromItem(item, owner) {
  const children = Array.isArray(item?.carousel_media) && item.carousel_media.length ? item.carousel_media : [item];
  return children.flatMap(child => {
    const images = largest(child?.image_versions2?.candidates);
    const videos = largest(child?.video_versions);
    const isVideo = child?.media_type === 2 || videos.length > 0;
    const source = isVideo ? videos[0] : images[0];
    if (!source) return [];
    // A preview of at least 320px is sharp in the popup grid without loading the full file.
    const preview = [...images].reverse().find(image => (image.width ?? 0) >= 320) ?? images[0];
    return [{
      type: isVideo ? "video" : "image",
      url: source.url,
      previewUrl: preview?.url ?? null,
      // Story videos come without a size; their cover image has the same shape.
      width: source.width ?? images[0]?.width ?? null,
      height: source.height ?? images[0]?.height ?? null,
      owner: item?.user?.username ?? owner ?? null,
      code: item?.code ?? String(item?.pk ?? "").split("_")[0],
    }];
  });
}

// Folders under Downloads/ig.tools/<username>/ for each kind of page.
function folderFor(place) {
  if (place?.kind === "highlight") return `highlights/${safeFolder(place.title, place.highlightId)}`;
  return place?.kind === "post" ? "posts" : "stories";
}

// Maps a collector result (see collect.js) to files with download names:
// ig.tools/<username>/posts/<code>[_<n>].<ext>, .../stories/<id>.<ext>,
// .../highlights/<title>/<id>.<ext>. `place` is { kind, title?, highlightId? }.
export function mediaFromResult(result, place = { kind: "post" }) {
  const items = Array.isArray(result?.items) ? result.items : [];
  const files = items.flatMap(item => filesFromItem(item, result?.owner));
  const counts = new Map();
  for (const file of files) counts.set(file.code, (counts.get(file.code) ?? 0) + 1);
  const seen = new Map();
  return files.map(file => {
    const index = (seen.get(file.code) ?? 0) + 1;
    seen.set(file.code, index);
    const suffix = counts.get(file.code) > 1 ? `_${index}` : "";
    const { owner, code, ...rest } = file;
    return { ...rest, filename: `ig.tools/${safeName(owner)}/${folderFor(place)}/${safeName(code)}${suffix}.${extension(file.url, file.type)}` };
  });
}

// Download folder layouts, chosen in the popup settings:
// "account"   ig.tools/<username>/posts|stories|highlights/<title>/<name> (as built above)
// "folder"    ig.tools/<username>_<name>, all in one folder
// "downloads" <username>_<name>, straight in Downloads
// Without subfolders the kind joins the name (story_, highlight_<title>_) so
// files of different kinds and accounts never collide.

export function layoutFilename(filename, layout) {
  if (layout !== "folder" && layout !== "downloads") return filename;
  const [, owner, ...rest] = filename.split("/");
  const kind = { stories: "story_", highlights: "highlight_" }[rest[0]] ?? "";
  const base = rest[0] === "posts" || kind ? `${kind}${rest.slice(1).join("_")}` : rest.join("_");
  const name = base.startsWith(`${owner}_`) ? base : `${owner}_${base}`;
  return layout === "folder" ? `ig.tools/${name}` : name;
}

// The Highlights tray of a profile (GraphQL "highlights" connection).
export function highlightsFromResult(result) {
  const edges = Array.isArray(result?.highlights?.edges) ? result.highlights.edges : [];
  return edges.flatMap(({ node } = {}) => {
    const id = String(node?.id ?? "").replace(/^highlight:/, "");
    if (!/^\d{5,25}$/.test(id)) return [];
    return [{ id, title: String(node?.title ?? ""), coverUrl: safeMediaUrl(node?.cover_media?.cropped_image_version?.url) }];
  });
}

// The profile picture as one file. `hd` is Instagram's full-size picture when it
// was returned; otherwise the small picture from the profile page is used.
export function avatarFile(username, picture) {
  const url = safeMediaUrl(picture?.url);
  if (!url) return null;
  const owner = safeName(username);
  return {
    type: "image", url, previewUrl: url,
    width: Number(picture.width) || null, height: Number(picture.height) || null,
    hd: Boolean(picture.hd),
    filename: `ig.tools/${owner}/${owner}_profile_picture.${extension(url, "image")}`,
  };
}
