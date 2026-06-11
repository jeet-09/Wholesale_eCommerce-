import type { Role } from '@prisma/client';

import { BaseRepository } from '../../database/base.repository';
import type { PrismaExecutor } from '../../database/prisma';

export class RoleRepository extends BaseRepository {
  findByName(name: string, tx?: PrismaExecutor): Promise<Role | null> {
    return this.exec(tx).role.findFirst({ where: { name, ...this.notDeleted } });
  }

  /**
   * Idempotently grant a role to a user (optionally scoped to an org). A plain
   * find-then-create is used (rather than upsert) because the compound unique
   * includes a NULLable organizationId, which Postgres treats as distinct.
   */
  async assignRoleToUser(
    input: { userId: string; roleId: string; organizationId?: string | null },
    tx?: PrismaExecutor,
  ): Promise<void> {
    const organizationId = input.organizationId ?? null;
    const existing = await this.exec(tx).userRole.findFirst({
      where: { userId: input.userId, roleId: input.roleId, organizationId },
      select: { id: true },
    });
    if (!existing) {
      await this.exec(tx).userRole.create({
        data: { userId: input.userId, roleId: input.roleId, organizationId },
      });
    }
  }
}
