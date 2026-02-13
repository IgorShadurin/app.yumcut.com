export function randomInt(min: number, max: number): number {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

export function randomBytes(size: number): Uint8Array {
  const buf = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) buf[i] = Math.floor(Math.random() * 256);
  return buf;
}

export function randomString(len: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,:;!?-\n';
  let out = '';
  for (let i = 0; i < len; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function randomText1k(): string {
  return randomString(1000);
}

