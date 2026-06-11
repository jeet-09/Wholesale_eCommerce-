import type { PasswordResetToken, RefreshToken } from '@prisma/client';

import { BaseRepository } from '../../database/base.repository';
import type { PrismaExecutor } from '../../database/prisma';

interface CreateRefreshTokenInput {
  userId: string;
  tokenHash: string;
  familyId: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  expiresAt: Date;
}

/**
 * Persistence for auth token tables. Refresh tokens are stored HASHED with
 * rotation lineage (`familyId`); reuse of a revoked token revokes the family
 * (DATABASE.md refresh_tokens). Reset tokens are single-use and short-lived.
 */
export class AuthRepository extends BaseRepository {
  createRefreshToken(input: CreateRefreshTokenInput, tx?: PrismaExecutor): Promise<RefreshToken> {
    return this.exec(tx).refreshToken.create({
      data: {
        userId: input.userId,
        tokenHash: input.tokenHash,
        familyId: input.familyId,
        userAgent: input.userAgent ?? null,
        ipAddress: input.ipAddress ?? null,
        expiresAt: input.expiresAt,
      },
    });
  }

  findRefreshTokenByHash(tokenHash: string, tx?: PrismaExecutor): Promise<RefreshToken | null> {
    return this.exec(tx).refreshToken.findUnique({ where: { tokenHash } });
  }

  async revokeRefreshToken(
    id: string,
    replacedById: string | null,
    tx?: PrismaExecutor,
  ): Promise<void> {
    await this.exec(tx).refreshToken.update({
      where: { id },
      data: { revokedAt: new Date(), replacedById },
    });
  }

  /** Token theft response: revoke every still-active token in the family. */
  async revokeFamily(familyId: string, tx?: PrismaExecutor): Promise<void> {
    await this.exec(tx).refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Revoke every active session for a user (e.g. after a password reset). */
  async revokeAllForUser(userId: string, tx?: PrismaExecutor): Promise<void> {
    await this.exec(tx).refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  createPasswordResetToken(
    input: { userId: string; tokenHash: string; expiresAt: Date },
    tx?: PrismaExecutor,
  ): Promise<PasswordResetToken> {
    return this.exec(tx).passwordResetToken.create({
      data: { userId: input.userId, tokenHash: input.tokenHash, expiresAt: input.expiresAt },
    });
  }

  findPasswordResetByHash(
    tokenHash: string,
    tx?: PrismaExecutor,
  ): Promise<PasswordResetToken | null> {
    return this.exec(tx).passwordResetToken.findFirst({ where: { tokenHash } });
  }

  async markPasswordResetUsed(id: string, tx?: PrismaExecutor): Promise<void> {
    await this.exec(tx).passwordResetToken.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }
}
