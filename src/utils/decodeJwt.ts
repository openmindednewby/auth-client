/**
 * Decode the payload segment of a compact JWT.
 *
 * No signature verification — that responsibility belongs to the backend that
 * accepts the token. This helper is for UI concerns: reading `exp` to schedule
 * refresh, reading custom claims for routing decisions, etc.
 *
 * Returns `null` when the input is malformed, base64url-decodes incorrectly, or
 * does not produce a JSON object payload.
 *
 * Runtime requirement: a global `atob` function. Available in browsers, in
 * Node ≥ 16, and in modern bundler test envs (jsdom, node-jest).
 */
export function decodeJwt<T = Record<string, unknown>>(token: string | null | undefined): T | null {
  if (typeof token !== 'string' || token === '') {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }
  const payload = parts[1];
  if (payload === undefined || payload === '') {
    return null;
  }
  try {
    const json = base64UrlDecode(payload);
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    return parsed as T;
  } catch {
    return null;
  }
}

const BASE64_PAD_LENGTH = 4;

function base64UrlDecode(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLength =
    (BASE64_PAD_LENGTH - (normalized.length % BASE64_PAD_LENGTH)) % BASE64_PAD_LENGTH;
  const padded = normalized + '='.repeat(padLength);
  if (typeof globalThis.atob !== 'function') {
    throw new Error('decodeJwt: globalThis.atob is unavailable in this runtime');
  }
  return decodeUtf8(globalThis.atob(padded));
}

function decodeUtf8(binary: string): string {
  // `atob` returns a "binary string" where each char code is one byte. Convert
  // to UTF-8 properly using TextDecoder when available (browsers + Node).
  if (typeof TextDecoder === 'undefined') {
    return binary;
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder('utf-8').decode(bytes);
}
