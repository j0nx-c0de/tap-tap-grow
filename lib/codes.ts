import { customAlphabet } from "nanoid";

// No 0/O/1/I — read aloud or off a small phone screen without ambiguity.
const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export const generateRedemptionCode = customAlphabet(alphabet, 6);

// The human-typed credential that binds ("claims") a physical tag to a
// business, or later rebinds the same physical sticker to a different one.
export const generateTagActivationCode = customAlphabet(alphabet, 8);

// Texted to a business owner signing in. Digits only — it gets typed off a
// lock screen into a phone keypad, and every SMS code anyone has ever
// received looks like this.
export const generateOwnerLoginCode = customAlphabet("0123456789", 6);

// The stable part of a punch tag's URL. Lowercase and unambiguous because it
// gets typed into an NFC writer app by hand when provisioning a chip.
const urlAlphabet = "23456789abcdefghijkmnpqrstuvwxyz";

export const generatePunchTagKey = customAlphabet(urlAlphabet, 10);
