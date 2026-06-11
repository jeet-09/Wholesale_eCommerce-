import { Prisma } from '@prisma/client';

import { BaseRepository } from '../../database/base.repository';
import type { PrismaExecutor } from '../../database/prisma';

/**
 * Read access to the `settings` table (SYSTEM CONFIGURATION). Values are stored
 * as strings with a declared type; callers coerce as needed.
 */
export class SettingRepository extends BaseRepository {
  async get(key: string, tx?: PrismaExecutor): Promise<string | null> {
    const row = await this.exec(tx).setting.findFirst({
      where: { key, ...this.notDeleted },
      select: { value: true },
    });
    return row?.value ?? null;
  }

  async getNumber(key: string, fallback: number, tx?: PrismaExecutor): Promise<Prisma.Decimal> {
    const value = await this.get(key, tx);
    if (value === null) {
      return new Prisma.Decimal(fallback);
    }
    try {
      return new Prisma.Decimal(value);
    } catch {
      return new Prisma.Decimal(fallback);
    }
  }
}
