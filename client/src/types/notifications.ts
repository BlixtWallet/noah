import { NotificationTypes } from "./serverTypes";

export interface NotificationData {
  notification_type: NotificationTypes;
  amount?: string;
  k1?: string;
}
