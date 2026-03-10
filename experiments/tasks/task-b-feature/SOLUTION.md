# Task B: Reference Solution

## 1. NotificationStore (`src/models/notification.ts`)

Add the following class after the `Notification` interface:

```typescript
export class NotificationStore {
  private notifications: Map<string, Notification> = new Map();

  add(notification: Notification): void {
    this.notifications.set(notification.id, notification);
  }

  getByRecipient(recipient: string): Notification[] {
    return Array.from(this.notifications.values()).filter(
      (n) => n.recipient === recipient,
    );
  }

  updateStatus(id: string, status: Notification["status"]): void {
    const notification = this.notifications.get(id);
    if (notification) {
      notification.status = status;
    }
  }
}
```

## 2. ConsoleTransport (`src/services/transport.ts`)

Add the following class after the `TransportAdapter` interface:

```typescript
export class ConsoleTransport implements TransportAdapter {
  async send(
    recipient: string,
    payload: Record<string, unknown>,
  ): Promise<boolean> {
    console.log(`[Notification] To: ${recipient}`, payload);
    return true;
  }
}
```

## 3. NotificationService (`src/services/notification-service.ts`)

Replace the placeholder with:

```typescript
import type { Notification } from "../models/notification.js";
import { NotificationStore } from "../models/notification.js";
import type { TransportAdapter } from "./transport.js";

let notifIdCounter = 0;

function generateNotifId(): string {
  notifIdCounter++;
  return `notif_${notifIdCounter.toString().padStart(4, "0")}`;
}

export class NotificationService {
  private transport: TransportAdapter;
  private store: NotificationStore;
  private subscriptions: Map<Notification["type"], Set<string>> = new Map();

  constructor(transport: TransportAdapter, store: NotificationStore) {
    this.transport = transport;
    this.store = store;
  }

  subscribe(eventType: Notification["type"], subscriberId: string): void {
    if (!this.subscriptions.has(eventType)) {
      this.subscriptions.set(eventType, new Set());
    }
    this.subscriptions.get(eventType)!.add(subscriberId);
  }

  unsubscribe(eventType: Notification["type"], subscriberId: string): void {
    const subs = this.subscriptions.get(eventType);
    if (subs) {
      subs.delete(subscriberId);
    }
  }

  async emit(
    eventType: Notification["type"],
    payload: Record<string, unknown>,
  ): Promise<void> {
    const subscribers = this.subscriptions.get(eventType);
    if (!subscribers || subscribers.size === 0) {
      return;
    }

    for (const recipient of subscribers) {
      const notification: Notification = {
        id: generateNotifId(),
        type: eventType,
        recipient,
        payload,
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      this.store.add(notification);

      const success = await this.transport.send(recipient, payload);
      this.store.updateStatus(
        notification.id,
        success ? "sent" : "failed",
      );
    }
  }
}
```

## 4. UserService Integration (`src/services/user-service.ts`)

The UserService already accepts an optional `NotificationService` in the constructor and calls `emit()` on create, update, and delete operations. This integration is pre-built in the initial codebase because it demonstrates how the notification system hooks into existing functionality.

Key integration points:
- `createUser()` emits `"user_created"` with `{ userId, name, email }`
- `updateUser()` emits `"user_updated"` with `{ userId, changes }`
- `deleteUser()` emits `"user_deleted"` with `{ userId }`

## Verification

After implementing all changes, run:

```bash
npm test
```

All 12 tests (4 user-service + 8 notification) should pass.
