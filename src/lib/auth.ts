export async function hashPassword(value: string) {
  if (!value) return '';
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function verifyPassword(input: string, storedHash: string) {
  if (!input || !storedHash) return false;
  const derived = await hashPassword(input);
  return derived === storedHash;
}
