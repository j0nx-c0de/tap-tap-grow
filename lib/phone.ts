// Normalizes to a rough E.164 shape so the same person typing their number
// differently at signup vs. at a claim screen still matches one contact row
// (and so it's already in the shape Twilio's `to` field wants).
export function normalizePhone(input: string): string {
  const trimmed = input.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");

  if (hasPlus) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits;
}

export function isPlausiblePhone(normalized: string): boolean {
  return /^\+?\d{8,15}$/.test(normalized);
}
