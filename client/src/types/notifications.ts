export interface NotificationData {
  type: "background-sync" | "maintenance" | "lightning-invoice-request" | "backup-trigger";
  request_id?: string;
  amount?: string;
}
