export interface NotificationData {
  notification_type:
    | "background_sync"
    | "maintenance"
    | "lightning_invoice_request"
    | "backup_trigger";
  request_id?: string;
  amount?: string;
  k1?: string;
}
