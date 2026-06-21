import bcrypt from 'bcryptjs';

/**
 * Password hashing behind an interface so the algorithm is swappable and
 * services depend on an abstraction (RULES.md §3 — Dependency Inversion).
 * Default implementation uses bcrypt (README → Password Security). argon2id
 * can be slotted in later without touching callers.
 */
export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(plain: string, hash: string): Promise<boolean>;
  /**
   * Perform a real (but throwaway) hash comparison to spend the same time a
   * genuine `verify` would. Call this on the "user not found" branch of login so
   * an attacker cannot tell existing accounts from non-existent ones by response
   * timing (user enumeration). The result is intentionally discarded.
   */
  verifyDummy(plain: string): Promise<void>;
}

export class BcryptPasswordHasher implements PasswordHasher {
  /** A valid bcrypt hash at the configured cost, computed once and reused. */
  private dummyHash: Promise<string> | null = null;

  constructor(private readonly saltRounds: number) {}

  async hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.saltRounds);
  }

  async verify(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  async verifyDummy(plain: string): Promise<void> {
    if (!this.dummyHash) {
      // Lazily build a hash at the same cost factor as real password hashes so
      // the dummy comparison takes a comparable amount of time.
      this.dummyHash = bcrypt.hash('timing-equalization-placeholder', this.saltRounds);
    }
    await bcrypt.compare(plain, await this.dummyHash);
  }
}
