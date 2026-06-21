import { describe, expect, it } from 'vitest';

import { BcryptPasswordHasher } from '../password';

// Low cost keeps the suite fast; production cost comes from env (default 12).
const hasher = new BcryptPasswordHasher(8);

describe('BcryptPasswordHasher', () => {
  it('hashes and verifies a correct password', async () => {
    const hash = await hasher.hash('S3cret-password');
    expect(hash).not.toBe('S3cret-password');
    expect(await hasher.verify('S3cret-password', hash)).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hasher.hash('S3cret-password');
    expect(await hasher.verify('wrong-password', hash)).toBe(false);
  });

  it('produces distinct hashes for the same input (random salt)', async () => {
    const a = await hasher.hash('same-input-123');
    const b = await hasher.hash('same-input-123');
    expect(a).not.toBe(b);
  });

  describe('verifyDummy (timing-equalization guard)', () => {
    it('resolves without throwing and returns nothing', async () => {
      await expect(hasher.verifyDummy('anything')).resolves.toBeUndefined();
    });

    it('is reusable across calls', async () => {
      await hasher.verifyDummy('first');
      await expect(hasher.verifyDummy('second')).resolves.toBeUndefined();
    });
  });
});
