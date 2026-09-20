// What kind of Google link a business actually pasted.
//
// This matters more than it looks. The whole pitch is "tap the tag, land on
// the review box" — but there are several Google URLs for a business and
// only some of them open the review composer. A Maps listing link still
// "works": it loads, nothing errors, and the tracked redirect happily counts
// the click. The customer just arrives at the business's page and has to
// find "Write a review" themselves, and most won't. That failure is
// invisible from the metrics, which is exactly why it gets checked here.
export type GoogleReviewUrlKind =
  // Opens the review composer directly.
  | "write_review"
  // A Google short link. Could be either — the destination isn't in the URL,
  // so it can't be told apart without following it.
  | "shortlink"
  // A Google URL, but the listing/search result rather than the review box.
  | "listing"
  // Not Google at all, or not a URL.
  | "not_google";

// `g.page` serves double duty: `g.page/<name>` is a business's short profile
// link, while `g.page/r/<cid>/review` is the review link Google's own "Ask
// for reviews" button hands out.
const G_PAGE_REVIEW_PATH = /^\/r\/[^/]+\/review\/?$/i;

const SHORTLINK_HOSTS = new Set(["g.page", "g.co", "goo.gl", "maps.app.goo.gl"]);

// google.com, google.co.uk, maps.google.com, search.google.com, …
const GOOGLE_HOST = /(^|\.)google(\.[a-z]{2,3}){1,2}$/i;

// A parseable http(s) URL. Stricter than a prefix match: it rejects a bare
// scheme with nothing behind it, and it is the same parse the classifier
// below does, so a value that passes here cannot surprise it later.
export function isHttpUrl(raw: string): boolean {
  try {
    const url = new URL(raw.trim());
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.length > 0;
  } catch {
    return false;
  }
}

export function classifyGoogleReviewUrl(raw: string): GoogleReviewUrlKind {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return "not_google";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "not_google";

  const host = url.hostname.toLowerCase().replace(/^www\./, "");

  if (host === "g.page") {
    return G_PAGE_REVIEW_PATH.test(url.pathname) ? "write_review" : "shortlink";
  }
  if (SHORTLINK_HOSTS.has(host)) return "shortlink";

  if (GOOGLE_HOST.test(host)) {
    // https://search.google.com/local/writereview?placeid=ChIJ…
    const hasPlaceId = url.searchParams.has("placeid") || url.searchParams.has("place_id");
    if (url.pathname.toLowerCase().startsWith("/local/writereview") && hasPlaceId) {
      return "write_review";
    }
    return "listing";
  }

  return "not_google";
}

// The sentence the admin console shows next to a business's Google link, or
// null when there's nothing to say. Deliberately advisory everywhere rather
// than a validation error: a listing link is worse than a review link but it
// is not broken, and blocking a save on it would mean standing in a doorway
// telling an owner their own Google link is wrong.
export function googleReviewUrlWarning(raw: string | null | undefined): string | null {
  if (!raw) return null;

  switch (classifyGoogleReviewUrl(raw)) {
    case "write_review":
      return null;
    case "shortlink":
      return "Google short link — it'll resolve, but the destination isn't in the URL, so tap the tag once yourself to confirm it opens the review box and not just the listing.";
    case "listing":
      return "This opens the Google listing, not the review box — customers have to find “Write a review” themselves. The link behind “Ask for reviews” in the Business Profile (g.page/r/…/review) drops them straight into it.";
    case "not_google":
      return "This doesn't look like a Google link. Taps will still forward to it, but double-check it's the right destination.";
  }
}
