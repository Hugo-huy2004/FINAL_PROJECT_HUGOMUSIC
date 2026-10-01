// Signed playback tokens: "<exp>.<sig>", sig = base64url(HMAC-SHA256("<prefix>|<exp>")), exp in Unix seconds.
// One implementation for the API server, the edge worker and tests: Web Crypto only, no dependencies.
//
// Signed by resource PREFIX: an HLS rendition is dozens of segments resolved relative to its playlist, so
// "hls/<id>/…" is signed as "hls/<id>" and one token covers every segment of that song.
// exp rounds up to the next TTL boundary: every mint inside the same window returns the SAME token, so a
// prefetched URL equals the URL played later and every cache reuses it. A token lives TTL to 2·TTL.

export const TTL_SECONDS = 300;

const enc = new TextEncoder();
/** @type {Map<string, Promise<CryptoKey>>} */
const keys = new Map();

/** @param {string} secret @returns {Promise<CryptoKey>} */
function hmacKey(secret) {
  if (!secret) throw new Error('hugo-stream: a signing secret is required');
  if (!keys.has(secret)) {
    keys.set(secret, crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']));
  }
  return /** @type {Promise<CryptoKey>} */ (keys.get(secret));
}

/** @param {ArrayBuffer} buf */
const toB64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
/** @param {string} s */
const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

/**
 * The part of a storage key a token is bound to.
 * @param {string} key e.g. "audio/a.mp3" or "hls/<id>/low_003.ts"
 * @returns {string} "audio/a.mp3" or "hls/<id>"
 */
export function prefixForKey(key) {
  const hls = /^(hls\/[^/]+)\//.exec(key);
  return hls ? hls[1] : key;
}

/**
 * Mint a token for `key`, valid until the end of the next TTL window.
 * @param {string} key storage key of the file (or any segment of an HLS rendition)
 * @param {string} secret HMAC secret shared by whoever mints and verifies
 * @param {{ ttl?: number, now?: number }} [opts] window length in seconds; clock in ms (tests)
 * @returns {Promise<string>}
 */
export async function mintToken(key, secret, { ttl = TTL_SECONDS, now = Date.now() } = {}) {
  const exp = (Math.floor(now / 1000 / ttl) + 2) * ttl;
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(`${prefixForKey(key)}|${exp}`));
  return `${exp}.${toB64url(sig)}`;
}

/**
 * True when `token` is well-formed, unexpired and signed for `key`'s prefix. Never throws.
 * @param {string} key
 * @param {unknown} token
 * @param {string} secret
 * @param {{ now?: number }} [opts]
 * @returns {Promise<boolean>}
 */
export async function verifyToken(key, token, secret, { now = Date.now() } = {}) {
  if (typeof token !== 'string' || !secret) return false;
  const [expStr, sig, extra] = token.split('.');
  const exp = Number(expStr);
  if (!sig || extra !== undefined || !Number.isFinite(exp) || exp * 1000 < now) return false;
  let bytes;
  try { bytes = fromB64url(sig); } catch { return false; }
  // subtle.verify compares in constant time, so response timing leaks nothing about the signature.
  return crypto.subtle.verify('HMAC', await hmacKey(secret), bytes, enc.encode(`${prefixForKey(key)}|${exp}`));
}
