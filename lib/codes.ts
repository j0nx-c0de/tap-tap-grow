import { customAlphabet } from "nanoid";

// No 0/O/1/I — read aloud or off a small phone screen without ambiguity.
const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export const generateRedemptionCode = customAlphabet(alphabet, 6);

// The stable part of a punch tag's URL. Lowercase and unambiguous because it
// gets typed into an NFC writer app by hand when provisioning a chip.
const urlAlphabet = "23456789abcdefghijkmnpqrstuvwxyz";

export const generatePunchTagKey = customAlphabet(urlAlphabet, 10);
