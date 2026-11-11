/** Readable temporary password: no look-alike characters (0/O, 1/l/I). */
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generatePassword(length = 14, random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const bytes = random(length * 2);
  let out = "";
  for (let i = 0; i < bytes.length && out.length < length; i++) {
    // Rejection sampling keeps every character equally likely.
    if (bytes[i] < 256 - (256 % ALPHABET.length)) out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out.length === length ? out : generatePassword(length, random);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}
