export interface Notification {
  id: string;
  type: "user_created" | "user_updated" | "user_deleted" | "custom";
  recipient: string;
  payload: Record<string, unknown>;
  status: "pending" | "sent" | "failed";
  createdAt: string;
}

// The agent must implement: NotificationStore (in-memory)
