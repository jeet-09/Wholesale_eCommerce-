import type { Database, PrismaExecutor } from './prisma';

/**
 * Base repository. Repositories are the ONLY layer that touches Prisma
 * (RULES.md §1.2, TECHNICAL-DETAILS.MD §6).
 *
 * Centralizes two things every repository needs:
 *   1. soft-delete filtering helpers (`deletedAt: null`) so it can never be
 *      forgotten on a read;
 *   2. resolving the active executor — either the root client or the
 *      transaction client passed by a service inside `$transaction`.
 */
export abstract class BaseRepository {
  constructor(protected readonly db: Database) {}

  /** Use the provided transaction client if present, else the root client. */
  protected exec(tx?: PrismaExecutor): PrismaExecutor {
    return tx ?? this.db;
  }

  /** Spread into a `where` to exclude soft-deleted rows. */
  protected get notDeleted(): { deletedAt: null } {
    return { deletedAt: null };
  }
}
