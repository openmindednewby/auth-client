/**
 * PKCE (RFC 7636) primitives for the OIDC authorization-code flow.
 *
 * Pure (no React). Browser-compatible — uses `crypto.subtle` for SHA-256 and
 * `crypto.getRandomValues` for the verifier. Node 16+ exposes both via
 * `globalThis.crypto`.
 */

/** RFC 7636 §4.1: code_verifier MUST be 43..128 chars from the unreserved set. */
const VERIFIER_MIN_LENGTH = 43;
const VERIFIER_MAX_LENGTH = 128;
const DEFAULT_VERIFIER_LENGTH = 64;
const RANDOM_BYTES_PER_CHAR = 1;

const UNRESERVED_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

function getCrypto(): Crypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  // Runtime check: in some Node test environments `crypto.subtle` may not
  // exist even though the TS lib types mark it as non-optional.
  // eslint-disable-next-line sonarjs/different-types-comparison, @typescript-eslint/no-unnecessary-condition
  if (c === undefined || c.subtle === undefined) {
    throw new Error('pkce: globalThis.crypto.subtle is required (Node 16+ / modern browser)');
  }
  return c;
}

function assertVerifierLength(length: number): void {
  if (length < VERIFIER_MIN_LENGTH || length > VERIFIER_MAX_LENGTH) {
    throw new Error(`pkce: code_verifier length must be ${String(VERIFIER_MIN_LENGTH)}-${String(VERIFIER_MAX_LENGTH)} chars (RFC 7636)`);
  }
}

/**
 * Base64-URL encode an ArrayBuffer (no padding, `-` and `_` substitutions).
 *
 * Required for the S256 challenge — RFC 7636 §4.2.
 */
function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i] as number);
  }
  const b64 = (globalThis as { btoa?: (s: string) => string }).btoa?.(binary)
    ?? Buffer.from(binary, 'binary').toString('base64');
  // Strip trailing '=' padding by slicing — avoids the sonarjs/slow-regex
  // warning on /=+$/ even though base64 padding is bounded to 0..2 chars.
  let end = b64.length;
  while (end > 0 && b64.charCodeAt(end - 1) === '='.charCodeAt(0)) {
    end -= 1;
  }
  return b64.slice(0, end).replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * Generate a cryptographically random PKCE code_verifier.
 *
 * Default length 64 sits well inside the RFC 7636 43..128 band.
 *
 * @throws Error when `length` falls outside the RFC band.
 */
export function generateCodeVerifier(length: number = DEFAULT_VERIFIER_LENGTH): string {
  assertVerifierLength(length);
  const crypto = getCrypto();
  const bytes = new Uint8Array(length * RANDOM_BYTES_PER_CHAR);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    const byte = bytes[i] as number;
    out += UNRESERVED_CHARS[byte % UNRESERVED_CHARS.length];
  }
  return out;
}

/**
 * Derive the S256 code_challenge from a code_verifier.
 *
 * `code_challenge = BASE64URL(SHA256(code_verifier))` — RFC 7636 §4.2.
 *
 * @throws Error when `verifier` is shorter than 43 or longer than 128 chars.
 */
export async function deriveCodeChallenge(verifier: string): Promise<string> {
  assertVerifierLength(verifier.length);
  const crypto = getCrypto();
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(digest);
}

export interface PkcePair {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}

/**
 * Convenience: produce a fresh verifier + matching challenge in one call.
 */
export async function generatePkcePair(length?: number): Promise<PkcePair> {
  const codeVerifier = generateCodeVerifier(length);
  const codeChallenge = await deriveCodeChallenge(codeVerifier);
  return { codeVerifier, codeChallenge, codeChallengeMethod: 'S256' };
}
