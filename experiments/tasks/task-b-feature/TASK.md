# Task B: Feature Addition — Notification System

## Overview
Add a notification system to the existing user management service.

## Specification

### Notification Model
Already defined in `src/models/notification.ts`. Implement a `NotificationStore` class:
- `add(notification: Notification): void`
- `getByRecipient(recipient: string): Notification[]`
- `updateStatus(id: string, status: Notification["status"]): void`

### NotificationService
Implement in `src/services/notification-service.ts`:
- Constructor takes a `TransportAdapter` and `NotificationStore`
- `subscribe(eventType: Notification["type"], subscriberId: string): void`
- `unsubscribe(eventType: Notification["type"], subscriberId: string): void`
- `emit(eventType: Notification["type"], payload: Record<string, unknown>): Promise<void>`
  - For each subscriber of the event type, create a Notification, attempt to send via transport, and update status

### TransportAdapter
Interface already in `src/services/transport.ts`. Implement `ConsoleTransport`:
- `send(recipient, payload)`: logs to console and returns true

### Integration with UserService
- Modify `UserService` to accept an optional `NotificationService`
- Emit "user_created" when creating a user
- Emit "user_updated" when updating a user
- Emit "user_deleted" when deleting a user

## Constraints
- Do not modify existing test files
- Implement all required classes and integrate with UserService
- All tests must pass when complete
