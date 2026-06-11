import type { FastifyBaseLogger } from 'fastify';
import { OrganizationType } from '@prisma/client';
import { uuidv7 } from 'uuidv7';

import {
  DuplicateResourceError,
  ForbiddenError,
  InternalError,
  UnauthenticatedError,
  ValidationError,
} from '../../common/errors';
import { PASSWORD_RESET_TTL_MINUTES } from '../../common/constants';
import type { RequestContext, RoleName } from '../../common/types';
import { ROLES } from '../../common/types';
import type { Env } from '../../config/env';
import type { Database, PrismaExecutor } from '../../database/prisma';
import { generateRawToken, hmacSha256 } from '../../utils/crypto';
import { expiryFromNow } from '../../utils/duration';
import { generateVendorCode } from '../../utils/codes';
import type { PasswordHasher } from '../../utils/password';
import type { AuthContextMeta } from '../../middleware/auth';
import type { UserRepository } from '../users/user.repository';
import type { RoleRepository } from '../users/role.repository';
import { toUserDto } from '../users/user.mapper';
import type { UserDto } from '../users/user.types';
import type {
  OrganizationMemberRepository,
  OrganizationRepository,
} from '../organizations/organization.repository';
import type { VendorRepository } from '../vendors/vendor.repository';
import type { RestaurantRepository } from '../restaurants/restaurant.repository';
import type { AuthRepository } from './auth.repository';
import type { AuthContextService } from './auth-context.service';
import type { AccessTokenSigner } from './token.types';
import type { RegisterInput, LoginInput, PasswordResetConfirmInput } from './auth.schemas';

export interface AuthContextDto {
  roles: string[];
  permissions: string[];
  organizationId: string | null;
  vendorId: string | null;
  restaurantId: string | null;
}

export interface AuthResult {
  accessToken: string;
  tokenType: 'Bearer';
  user: UserDto;
  context: AuthContextDto;
  /** Raw refresh token — the controller sets it as an HttpOnly cookie. */
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

function toContextDto(ctx: RequestContext): AuthContextDto {
  return {
    roles: ctx.roles,
    permissions: ctx.permissions,
    organizationId: ctx.organizationId,
    vendorId: ctx.vendorId,
    restaurantId: ctx.restaurantId,
  };
}

export class AuthService {
  constructor(
    private readonly db: Database,
    private readonly env: Env,
    private readonly users: UserRepository,
    private readonly roles: RoleRepository,
    private readonly organizations: OrganizationRepository,
    private readonly members: OrganizationMemberRepository,
    private readonly vendors: VendorRepository,
    private readonly restaurants: RestaurantRepository,
    private readonly authRepo: AuthRepository,
    private readonly contextService: AuthContextService,
    private readonly hasher: PasswordHasher,
    private readonly signer: AccessTokenSigner,
    private readonly logger: FastifyBaseLogger,
  ) {}

  async register(input: RegisterInput, meta: AuthContextMeta): Promise<AuthResult> {
    if (await this.users.existsByEmail(input.email)) {
      throw new DuplicateResourceError('An account with this email already exists', [
        { field: 'email', message: 'Email is already in use' },
      ]);
    }

    const roleName: RoleName = input.accountType === 'VENDOR' ? ROLES.VENDOR : ROLES.RESTAURANT;
    const role = await this.roles.findByName(roleName);
    if (!role) {
      throw new InternalError(`Role "${roleName}" is not seeded`);
    }

    const passwordHash = await this.hasher.hash(input.password);
    const orgType: OrganizationType =
      input.accountType === 'VENDOR' ? OrganizationType.VENDOR : OrganizationType.RESTAURANT;

    const userId = await this.db.$transaction(async (tx) => {
      const user = await this.users.create(
        {
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone ?? null,
          passwordHash,
          status: 'ACTIVE',
        },
        tx,
      );

      const organization = await this.organizations.create(
        {
          name: input.organizationName,
          organizationType: orgType,
          email: input.email,
          phone: input.phone ?? null,
          createdBy: user.id,
        },
        tx,
      );
      // New self-service organizations start ACTIVE so the owner can use the
      // platform immediately; staff can suspend later if needed.
      await this.organizations.update(organization.id, { status: 'ACTIVE' }, tx);

      if (input.accountType === 'VENDOR') {
        await this.vendors.create(
          {
            organizationId: organization.id,
            vendorName: input.organizationName,
            vendorCode: generateVendorCode(),
            status: 'ACTIVE',
            createdBy: user.id,
          },
          tx,
        );
      } else {
        await this.restaurants.create(
          {
            organizationId: organization.id,
            restaurantName: input.organizationName,
            status: 'ACTIVE',
            createdBy: user.id,
          },
          tx,
        );
      }

      await this.members.create(
        {
          organizationId: organization.id,
          userId: user.id,
          designation: 'Owner',
          status: 'ACTIVE',
          createdBy: user.id,
        },
        tx,
      );

      await this.roles.assignRoleToUser(
        { userId: user.id, roleId: role.id, organizationId: organization.id },
        tx,
      );

      return user.id;
    });

    this.logger.info({ userId, accountType: input.accountType }, 'account registered');
    return this.buildAuthResult(userId, input.email, meta);
  }

  async login(input: LoginInput, meta: AuthContextMeta): Promise<AuthResult> {
    const user = await this.users.findByEmail(input.email);
    // Same error whether the email is unknown or the password is wrong, to
    // avoid leaking which accounts exist (user enumeration).
    if (!user) {
      throw new UnauthenticatedError('Invalid email or password');
    }
    const passwordOk = await this.hasher.verify(input.password, user.passwordHash);
    if (!passwordOk) {
      throw new UnauthenticatedError('Invalid email or password');
    }
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenError('Your account is not active. Please contact support.');
    }

    await this.users.updateLastLogin(user.id, new Date());
    return this.buildAuthResult(user.id, user.email, meta);
  }

  async refresh(rawRefreshToken: string | null, meta: AuthContextMeta): Promise<AuthResult> {
    if (!rawRefreshToken) {
      throw new UnauthenticatedError('Missing refresh token');
    }

    const tokenHash = this.hashRefreshToken(rawRefreshToken);
    const existing = await this.authRepo.findRefreshTokenByHash(tokenHash);
    if (!existing) {
      throw new UnauthenticatedError('Invalid refresh token');
    }

    if (existing.revokedAt) {
      // A revoked token was presented again → likely theft. Burn the family.
      await this.authRepo.revokeFamily(existing.familyId);
      this.logger.warn({ familyId: existing.familyId }, 'refresh token reuse detected');
      throw new UnauthenticatedError('Refresh token has been revoked');
    }

    if (existing.expiresAt.getTime() < Date.now()) {
      throw new UnauthenticatedError('Refresh token has expired');
    }

    const user = await this.users.findById(existing.userId);
    if (!user || user.status !== 'ACTIVE') {
      await this.authRepo.revokeFamily(existing.familyId);
      throw new UnauthenticatedError('Session is no longer valid');
    }

    const rotated = await this.db.$transaction(async (tx) => {
      const created = await this.persistRefreshToken(user.id, existing.familyId, meta, tx);
      await this.authRepo.revokeRefreshToken(existing.id, created.id, tx);
      return created;
    });

    return this.assembleResult(user.id, user.email, rotated.raw, rotated.expiresAt, meta);
  }

  async logout(rawRefreshToken: string | null): Promise<void> {
    if (!rawRefreshToken) {
      return;
    }
    const tokenHash = this.hashRefreshToken(rawRefreshToken);
    const existing = await this.authRepo.findRefreshTokenByHash(tokenHash);
    if (existing) {
      await this.authRepo.revokeFamily(existing.familyId);
    }
  }

  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user) {
      // Do not reveal whether the email exists.
      return;
    }
    const rawToken = generateRawToken();
    const tokenHash = this.hashRefreshToken(rawToken);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000);
    await this.authRepo.createPasswordResetToken({ userId: user.id, tokenHash, expiresAt });

    // In production the outbox worker emails this token. For local development
    // it is logged so the flow is testable without email infrastructure.
    this.logger.info({ userId: user.id, resetToken: rawToken }, 'password reset requested');
  }

  async confirmPasswordReset(input: PasswordResetConfirmInput): Promise<void> {
    const tokenHash = this.hashRefreshToken(input.token);
    const record = await this.authRepo.findPasswordResetByHash(tokenHash);
    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw new ValidationError('Invalid or expired password reset token', [
        { field: 'token', message: 'This token is invalid or has expired' },
      ]);
    }

    const passwordHash = await this.hasher.hash(input.newPassword);
    await this.db.$transaction(async (tx) => {
      await this.users.updatePassword(record.userId, passwordHash, tx);
      await this.authRepo.markPasswordResetUsed(record.id, tx);
      await this.authRepo.revokeAllForUser(record.userId, tx);
    });
  }

  async getMe(ctx: RequestContext): Promise<{ user: UserDto; context: AuthContextDto }> {
    const user = await this.users.findById(ctx.userId);
    if (!user) {
      throw new UnauthenticatedError('Session is no longer valid');
    }
    return { user: toUserDto(user), context: toContextDto(ctx) };
  }

  async getContext(userId: string, meta: AuthContextMeta): Promise<RequestContext> {
    const ctx = await this.contextService.load(userId, meta);
    if (!ctx) {
      throw new UnauthenticatedError('Session is no longer valid');
    }
    return ctx;
  }

  private hashRefreshToken(rawToken: string): string {
    return hmacSha256(rawToken, this.env.JWT_REFRESH_SECRET);
  }

  private async persistRefreshToken(
    userId: string,
    familyId: string,
    meta: AuthContextMeta,
    tx: PrismaExecutor,
  ): Promise<{ id: string; raw: string; expiresAt: Date }> {
    const raw = generateRawToken();
    const expiresAt = expiryFromNow(this.env.JWT_REFRESH_EXPIRES_IN);
    const record = await this.authRepo.createRefreshToken(
      {
        userId,
        tokenHash: this.hashRefreshToken(raw),
        familyId,
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
        expiresAt,
      },
      tx,
    );
    return { id: record.id, raw, expiresAt };
  }

  private async buildAuthResult(
    userId: string,
    email: string,
    meta: AuthContextMeta,
  ): Promise<AuthResult> {
    const issued = await this.db.$transaction((tx) =>
      this.persistRefreshToken(userId, uuidv7(), meta, tx),
    );
    return this.assembleResult(userId, email, issued.raw, issued.expiresAt, meta);
  }

  private async assembleResult(
    userId: string,
    email: string,
    refreshToken: string,
    refreshTokenExpiresAt: Date,
    meta: AuthContextMeta,
  ): Promise<AuthResult> {
    const ctx = await this.getContext(userId, meta);
    const user = await this.users.findById(userId);
    if (!user) {
      throw new InternalError('User vanished during authentication');
    }
    return {
      accessToken: this.signer.sign({ sub: userId, email }),
      tokenType: 'Bearer',
      user: toUserDto(user),
      context: toContextDto(ctx),
      refreshToken,
      refreshTokenExpiresAt,
    };
  }
}
