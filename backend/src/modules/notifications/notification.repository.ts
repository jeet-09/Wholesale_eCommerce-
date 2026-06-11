import type { Prisma } from '@prisma/client';
import type { Notification, NotificationType } from '@prisma/client';

import type { ListResult } from '../../common/types';
import { BaseRepository } from '../../database/base.repository';
import type { PrismaExecutor } from '../../database/prisma';

export class NotificationRepository extends BaseRepository {
  async list(args: {
    skip: number;
    take: number;
    userId: string;
    isRead?: boolean;
  }): Promise<ListResult<Notification>> {
    const where: Prisma.NotificationWhereInput = { userId: args.userId, ...this.notDeleted };
    if (args.isRead !== undefined) {
      where.isRead = args.isRead;
    }
    const [items, total] = await Promise.all([
      this.db.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: args.skip,
        take: args.take,
      }),
      this.db.notification.count({ where }),
    ]);
    return { items, total };
  }

  countUnread(userId: string): Promise<number> {
    return this.db.notification.count({
      where: { userId, isRead: false, ...this.notDeleted },
    });
  }

  findById(id: string): Promise<Notification | null> {
    return this.db.notification.findFirst({ where: { id, ...this.notDeleted } });
  }

  create(
    input: {
      userId: string;
      title: string;
      message: string;
      type: NotificationType;
      data?: Prisma.InputJsonValue;
    },
    tx?: PrismaExecutor,
  ): Promise<Notification> {
    return this.exec(tx).notification.create({
      data: {
        userId: input.userId,
        title: input.title,
        message: input.message,
        type: input.type,
        data: input.data,
      },
    });
  }

  markRead(id: string): Promise<Notification> {
    return this.db.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllRead(userId: string): Promise<number> {
    const result = await this.db.notification.updateMany({
      where: { userId, isRead: false, ...this.notDeleted },
      data: { isRead: true, readAt: new Date() },
    });
    return result.count;
  }
}
