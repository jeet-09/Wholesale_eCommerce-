import type { Notification } from '@prisma/client';

import { ForbiddenError, NotFoundError } from '../../common/errors';
import { buildPaginationMeta, toPaginationArgs } from '../../common/pagination';
import type { PaginationMeta } from '../../common/pagination';
import type { RequestContext } from '../../common/types';
import type { NotificationRepository } from './notification.repository';
import type { NotificationDto } from './notification.types';
import type { ListNotificationsQueryInput } from './notification.schemas';

function toDto(entity: Notification): NotificationDto {
  return {
    id: entity.id,
    title: entity.title,
    message: entity.message,
    type: entity.type,
    data: entity.data ?? null,
    isRead: entity.isRead,
    readAt: entity.readAt?.toISOString() ?? null,
    createdAt: entity.createdAt.toISOString(),
  };
}

export class NotificationService {
  constructor(private readonly repository: NotificationRepository) {}

  async list(
    ctx: RequestContext,
    query: ListNotificationsQueryInput,
  ): Promise<{ items: NotificationDto[]; pagination: PaginationMeta }> {
    const { skip, take } = toPaginationArgs(query);
    const result = await this.repository.list({
      skip,
      take,
      userId: ctx.userId,
      isRead: query.isRead,
    });
    return {
      items: result.items.map(toDto),
      pagination: buildPaginationMeta(result.total, query),
    };
  }

  async markRead(ctx: RequestContext, id: string): Promise<NotificationDto> {
    const notification = await this.repository.findById(id);
    if (!notification) {
      throw new NotFoundError('Notification not found');
    }
    if (notification.userId !== ctx.userId) {
      throw new ForbiddenError('You cannot modify this notification');
    }
    const updated = await this.repository.markRead(id);
    return toDto(updated);
  }

  async markAllRead(ctx: RequestContext): Promise<{ updated: number }> {
    const updated = await this.repository.markAllRead(ctx.userId);
    return { updated };
  }
}
