import { randomInt } from 'node:crypto';

// Crockford-ish alphabet without ambiguous chars (no I, L, O, U).
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function randomCode(length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

/** Human-readable vendor code, e.g. `VND-7Q2K9X` (DATABASE.md vendors). */
export function generateVendorCode(): string {
  return `VND-${randomCode(6)}`;
}
