// Formatting for a business's street address. The address exists to tell
// near-identical rows apart — one chain's several locations, or a competitor
// trading on a similar name — so these helpers are shaped around *where* it
// gets shown: a one-line label in a list or the command palette, and the full
// block on the business's own page.

export type AddressParts = {
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
};

const join = (parts: (string | null | undefined)[], sep: string) =>
  parts.map((p) => p?.trim()).filter((p): p is string => !!p).join(sep);

// "Springfield, IL 62704" — the half that actually disambiguates. Split out
// because a list row wants the locality without the street eating the width.
export function formatLocality(a: AddressParts): string {
  const cityState = join([a.city, a.state], ", ");
  return join([cityState, a.postalCode], " ");
}

// One line, for a list row or a palette sublabel: "12 Main St · Springfield, IL
// 62704". Suite/unit is deliberately dropped here — it never distinguishes two
// businesses, and the row has limited room.
export function formatAddressLine(a: AddressParts): string {
  return join([a.addressLine1, formatLocality(a)], " · ");
}

// Every part, comma-separated, for the business's own page.
export function formatAddress(a: AddressParts): string {
  return join([a.addressLine1, a.addressLine2, formatLocality(a)], ", ");
}

// Google Maps rather than a raw string, so a "which of these two is it?"
// moment is one click from the answer.
export function mapsUrl(a: AddressParts): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(formatAddress(a))}`;
}
