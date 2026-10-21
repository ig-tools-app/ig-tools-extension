import { mediaFromResult, pageFromUrl, shortcodeToId } from "./instagram.js";
import { collectFromPage } from "./collect.js";

// The files behind one Instagram address, read in the given tab with the
// user's session. Used by the on-page download buttons. `index` (0-based)
// keeps one carousel slide; file names stay those of a full download.
// Resolves to { files } or { reason, detail }.
export async function mediaForUrl(tabId, url, index = null) {
  const page = pageFromUrl(url);
  if (!page || !["post", "story", "highlight"].includes(page.kind)) return { reason: "unsupported" };
  const mediaId = page.kind === "post" ? shortcodeToId(page.shortcode) : null;
  if (page.kind === "post" && !mediaId) return { reason: "unavailable" };
  let result;
  try {
    [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: collectFromPage, args: [{ ...page, mediaId }] });
  } catch (error) {
    return { reason: "failed", detail: `script ${error?.message ?? ""}`.trim() };
  }
  if (result?.reason && result.reason !== "unavailable") return result;
  // A Story address names one item; the button saves that item, not the whole reel.
  const items = page.kind === "story" && page.storyId
    ? (result?.items ?? []).filter(item => String(item?.pk ?? "") === page.storyId || String(item?.id ?? "").startsWith(`${page.storyId}_`))
    : result?.items;
  const files = mediaFromResult({ ...result, items }, page);
  if (Number.isInteger(index)) return files[index] ? { files: [files[index]] } : { reason: "unavailable", detail: `slide ${index + 1}/${files.length}` };
  return files.length ? { files } : { reason: "unavailable", detail: result?.detail };
}
