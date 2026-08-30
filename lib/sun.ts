import { createCipheriv, createDecipheriv, timingSafeEqual } from "crypto";

// NTAG 424 DNA "SUN" (Secure Unique NFC) message verification, per NXP
// AN12196. Every tap of a DNA chip rewrites the URL it emits:
//
//   /p/<key>?picc_data=<32 hex>&cmac=<16 hex>
//
// `picc_data` is an AES-128 block encrypted by the chip under its SDM Meta
// Read key, containing the chip UID and a monotonic tap counter. `cmac` is a
// truncated AES-CMAC over a per-tap session key derived from the SDM File
// Read key. Neither can be forged without the keys, which are write-only on
// the chip and can't be read back out — so a URL captured from browser
// history is inert on the next tap.
//
// Implemented on Node's built-in crypto: AES-CMAC (RFC 4493) isn't exposed by
// the standard library, so the subkey derivation and CBC-MAC are written out
// here rather than pulling in a dependency for ~50 lines.

const BLOCK = 16;

function aesEcbEncryptBlock(key: Buffer, block: Buffer): Buffer {
  const c = createCipheriv("aes-128-ecb", key, null);
  c.setAutoPadding(false);
  return Buffer.concat([c.update(block), c.final()]);
}

function xor(a: Buffer, b: Buffer): Buffer {
  const out = Buffer.alloc(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] ^ b[i];
  return out;
}

// RFC 4493 §2.3: one-bit left shift of a 128-bit block.
function shiftLeft(buf: Buffer): Buffer {
  const out = Buffer.alloc(buf.length);
  let carry = 0;
  for (let i = buf.length - 1; i >= 0; i--) {
    out[i] = ((buf[i] << 1) | carry) & 0xff;
    carry = (buf[i] >> 7) & 1;
  }
  return out;
}

function cmacSubkeys(key: Buffer): [Buffer, Buffer] {
  const l = aesEcbEncryptBlock(key, Buffer.alloc(BLOCK));
  const k1 = shiftLeft(l);
  if (l[0] & 0x80) k1[BLOCK - 1] ^= 0x87;
  const k2 = shiftLeft(k1);
  if (k1[0] & 0x80) k2[BLOCK - 1] ^= 0x87;
  return [k1, k2];
}

export function aesCmac(key: Buffer, message: Buffer): Buffer {
  const [k1, k2] = cmacSubkeys(key);

  let lastBlock: Buffer;
  let wholeBlocks: number;

  if (message.length > 0 && message.length % BLOCK === 0) {
    wholeBlocks = message.length / BLOCK - 1;
    lastBlock = xor(message.subarray(wholeBlocks * BLOCK), k1);
  } else {
    wholeBlocks = Math.floor(message.length / BLOCK);
    const padded = Buffer.alloc(BLOCK);
    const rest = message.subarray(wholeBlocks * BLOCK);
    rest.copy(padded);
    padded[rest.length] = 0x80;
    lastBlock = xor(padded, k2);
  }

  let x: Buffer<ArrayBufferLike> = Buffer.alloc(BLOCK);
  for (let i = 0; i < wholeBlocks; i++) {
    x = aesEcbEncryptBlock(key, xor(x, message.subarray(i * BLOCK, (i + 1) * BLOCK)));
  }
  return aesEcbEncryptBlock(key, xor(x, lastBlock));
}

// The chip emits only the odd-indexed bytes of the full 16-byte CMAC.
function truncateCmac(mac: Buffer): Buffer {
  const out = Buffer.alloc(8);
  for (let i = 0; i < 8; i++) out[i] = mac[2 * i + 1];
  return out;
}

export type PiccData = { uid: string; counter: number };

// AN12196 §3.2 — decrypt the mirrored PICC data block.
export function decryptPiccData(metaKey: Buffer, piccData: Buffer): PiccData | null {
  if (piccData.length !== BLOCK) return null;

  const d = createDecipheriv("aes-128-cbc", metaKey, Buffer.alloc(BLOCK));
  d.setAutoPadding(false);
  const plain = Buffer.concat([d.update(piccData), d.final()]);

  // PICCDataTag: bit 7 = UID mirrored, bit 6 = read counter mirrored, low
  // nibble = UID length. We require both mirrors — without the counter there
  // is no replay protection, which is the entire point of using these tags.
  const tag = plain[0];
  if ((tag & 0x80) === 0 || (tag & 0x40) === 0) return null;

  const uidLen = tag & 0x0f;
  if (uidLen !== 7) return null;

  const uid = plain.subarray(1, 1 + uidLen);
  const ctr = plain.subarray(1 + uidLen, 1 + uidLen + 3);
  // Read counter is little-endian.
  const counter = ctr[0] | (ctr[1] << 8) | (ctr[2] << 16);

  return { uid: uid.toString("hex").toUpperCase(), counter };
}

// AN12196 §3.3 — derive the per-tap session MAC key.
export function sessionMacKey(fileKey: Buffer, uidHex: string, counter: number): Buffer {
  const uid = Buffer.from(uidHex, "hex");
  const sv2 = Buffer.alloc(BLOCK);
  Buffer.from([0x3c, 0xc3, 0x00, 0x01, 0x00, 0x80]).copy(sv2, 0);
  uid.copy(sv2, 6);
  sv2[6 + uid.length] = counter & 0xff;
  sv2[7 + uid.length] = (counter >> 8) & 0xff;
  sv2[8 + uid.length] = (counter >> 16) & 0xff;
  return aesCmac(fileKey, sv2);
}

export type SunResult =
  | { ok: true; uid: string; counter: number }
  | { ok: false; reason: "malformed" | "bad_picc" | "bad_cmac" };

function hexToBuf(hex: string, bytes: number): Buffer | null {
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length !== bytes * 2) return null;
  return Buffer.from(hex, "hex");
}

export function verifySun(params: {
  sdmMetaKeyHex: string;
  sdmFileKeyHex: string;
  piccDataHex: string;
  cmacHex: string;
  // Present only when the tag also mirrors encrypted file data; empty for the
  // plain UID+counter configuration this project provisions.
  message?: Buffer;
}): SunResult {
  const metaKey = hexToBuf(params.sdmMetaKeyHex, 16);
  const fileKey = hexToBuf(params.sdmFileKeyHex, 16);
  const piccData = hexToBuf(params.piccDataHex, 16);
  const cmac = hexToBuf(params.cmacHex, 8);
  if (!metaKey || !fileKey || !piccData || !cmac) return { ok: false, reason: "malformed" };

  const picc = decryptPiccData(metaKey, piccData);
  if (!picc) return { ok: false, reason: "bad_picc" };

  const sessionKey = sessionMacKey(fileKey, picc.uid, picc.counter);
  const expected = truncateCmac(aesCmac(sessionKey, params.message ?? Buffer.alloc(0)));

  if (!timingSafeEqual(expected, cmac)) return { ok: false, reason: "bad_cmac" };

  return { ok: true, uid: picc.uid, counter: picc.counter };
}
