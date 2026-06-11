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
}

export class BcryptPasswordHasher implements PasswordHasher {
  constructor(private readonly saltRounds: number) {}

  async hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.saltRounds);
  }

  async verify(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
