/**
 * Parse a short duration string (`15m`, `30d`, `12h`, `45s`, `2w`) into
 * milliseconds. Used to compute token expiry timestamps from env config.
 */
const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
};

export function durationToMs(value: string): number {
  const match = /^(\d+)\s*(s|m|h|d|w)$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid duration string: "${value}" (expected e.g. "15m", "30d")`);
  }
  const amount = Number(match[1]);
  const unit = match[2] as keyof typeof UNIT_MS;
  const unitMs = UNIT_MS[unit];
  if (unitMs === undefined) {
    throw new Error(`Invalid duration unit in: "${value}"`);
  }
  return amount * unitMs;
}

export function expiryFromNow(value: string, from: Date = new Date()): Date {
  return new Date(from.getTime() + durationToMs(value));
}
