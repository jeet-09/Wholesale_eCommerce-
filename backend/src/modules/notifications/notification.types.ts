export interface NotificationDto {
  id: string;
  title: string;
  message: string;
  type: string;
  data: unknown;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}
