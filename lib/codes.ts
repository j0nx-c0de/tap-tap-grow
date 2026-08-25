import { customAlphabet } from "nanoid";

// No 0/O/1/I — read aloud or off a small phone screen without ambiguity.
const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export const generateRedemptionCode = customAlphabet(alphabet, 6);
