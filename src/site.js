// The website this extension opens. Forks that use their own service only
// need to change SITE (and the locale paths below if theirs differ).
export const SITE = "https://ig.tools";

// Browser UI language → site path prefix. Anything else opens the English site.
const localePaths = {
  es: "/es", pt: "/pt-br", ja: "/ja", ko: "/ko", id: "/id", tr: "/tr", ar: "/ar",
  "zh-tw": "/zh-tw", "zh-hk": "/zh-tw", "zh-mo": "/zh-tw", "zh-hant": "/zh-tw", zh: "/zh-cn",
};

export function localePath(uiLanguage) {
  const tag = String(uiLanguage || "").toLowerCase().replace("_", "-");
  return localePaths[tag] ?? localePaths[tag.slice(0, 7)] ?? localePaths[tag.split("-")[0]] ?? "";
}

const handle = /^@?[A-Za-z0-9._]{1,30}$/;
const instagramUrl = /^(?:https?:\/\/)?(?:www\.|m\.)?instagram\.com\/\S+$/i;

// Accepts the same inputs as the site's main field: an Instagram link or @username.
export function instagramInput(value) {
  const text = String(value || "").trim();
  return handle.test(text) || instagramUrl.test(text) ? text : null;
}

// Instagram's own home and settings pages have nothing to open, so they are not prefilled.
export function inputFromTabUrl(tabUrl) {
  let url;
  try { url = new URL(tabUrl); } catch { return null; }
  if (!/^(?:www\.|m\.)?instagram\.com$/i.test(url.hostname)) return null;
  const first = url.pathname.split("/")[1] || "";
  if (!first || ["accounts", "direct", "explore"].includes(first.toLowerCase())) return null;
  return `https://www.instagram.com${url.pathname}`;
}

// `tool` is an optional ig.tools page slug, e.g. "instagram-profile-picture-downloader".
export function siteUrl(input, uiLanguage, tool = "") {
  const params = new URLSearchParams({ url: input, utm_source: "chrome_extension", utm_medium: "extension" });
  const base = localePath(uiLanguage);
  return `${SITE}${tool ? `${base}/${tool}` : base || "/"}?${params}`;
}
