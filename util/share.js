// Pure helpers for links shared into the app (kept free of native modules so they are unit tested).

const SOCIAL_HOST = /(^|\.)(instagram\.com|tiktok\.com)$/i;

// Instagram and TikTok links: the server reads the caption from public preview
// endpoints, since it cannot log in. Used to word errors for these posts.
export function isSocialUrl(url) {
  // A regex, not `new URL`, so it behaves the same on every React Native engine.
  const host = String(url || "").trim().match(/^https?:\/\/(?:[^@/?#]*@)?([^/?#:]+)/i)?.[1];
  return !!host && SOCIAL_HOST.test(host);
}

// What another app shared, split into the link and the text around it
// (Instagram and TikTok send the caption, or a line like "check this out", with the link).
export function splitShared({ webUrl, text } = {}) {
  const raw = String(text || "");
  const url = webUrl || raw.match(/https?:\/\/\S+/)?.[0] || null;
  const rest = (url ? raw.split(url).join(" ") : raw).replace(/[ \t]+/g, " ").trim();
  return { url, text: rest };
}
