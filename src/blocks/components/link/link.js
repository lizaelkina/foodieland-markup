const normalizePath = pathname => pathname.replace(/\/index\.html$/, '/');

export function getAnchorTarget(link) {
  if (!link?.hash || link.origin !== window.location.origin) return null;
  if (normalizePath(link.pathname) !== normalizePath(window.location.pathname)) return null;

  return document.getElementById(decodeURIComponent(link.hash.slice(1)));
}
