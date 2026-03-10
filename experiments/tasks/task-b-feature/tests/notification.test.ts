import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Notification } from "../src/models/notification.js";
import { NotificationStore } from "../src/models/notification.js";
import { NotificationService } from "../src/services/notification-service.js";
import { ConsoleTransport } from "../src/services/transport.js";
import type { TransportAdapter } from "../src/services/transport.js";
import { UserService } from "../src/services/user-service.js";

describe("NotificationService", () => {
  let store: NotificationStore;
  let transport: TransportAdapter;
  let service: NotificationService;

  beforeEach(() => {
    store = new NotificationStore();
    transport = new ConsoleTransport();
    service = new NotificationService(transport, store);
  });

  it("should create a notification with pending status", async () => {
    service.subscribe("user_created", "admin@example.com");
    await service.emit("user_created", { userId: "u1", name: "Alice" });

    const notifications = store.getByRecipient("admin@example.com");
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe("user_created");
    expect(notifications[0].recipient).toBe("admin@example.com");
    expect(notifications[0].payload).toEqual({ userId: "u1", name: "Alice" });
  });

  it("should send notification and update status to sent", async () => {
    service.subscribe("user_created", "admin@example.com");
    await service.emit("user_created", { userId: "u1" });

    const notifications = store.getByRecipient("admin@example.com");
    expect(notifications[0].status).toBe("sent");
  });

  it("should notify subscriber on user_created event", async () => {
    const mockTransport: TransportAdapter = {
      send: vi.fn().mockResolvedValue(true),
    };
    const svc = new NotificationService(mockTransport, store);
    svc.subscribe("user_created", "watcher@example.com");

    const userService = new UserService(svc);
    userService.createUser({
      name: "Alice",
      email: "alice@example.com",
      role: "member",
    });

    // Allow async emit to settle
    await new Promise((resolve) => setTimeout(resolve, 50));

    const notifications = store.getByRecipient("watcher@example.com");
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe("user_created");
    expect(mockTransport.send).toHaveBeenCalledWith(
      "watcher@example.com",
      expect.objectContaining({ name: "Alice" })
    );
  });

  it("should notify subscriber on user_updated event", async () => {
    const mockTransport: TransportAdapter = {
      send: vi.fn().mockResolvedValue(true),
    };
    const svc = new NotificationService(mockTransport, store);
    svc.subscribe("user_updated", "watcher@example.com");

    const userService = new UserService(svc);
    const user = userService.createUser({
      name: "Bob",
      email: "bob@example.com",
      role: "member",
    });
    userService.updateUser(user.id, { name: "Robert" });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const notifications = store.getByRecipient("watcher@example.com");
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe("user_updated");
  });

  it("should not notify after unsubscribe", async () => {
    const mockTransport: TransportAdapter = {
      send: vi.fn().mockResolvedValue(true),
    };
    const svc = new NotificationService(mockTransport, store);

    svc.subscribe("user_created", "admin@example.com");
    svc.unsubscribe("user_created", "admin@example.com");

    await svc.emit("user_created", { userId: "u1" });

    const notifications = store.getByRecipient("admin@example.com");
    expect(notifications).toHaveLength(0);
    expect(mockTransport.send).not.toHaveBeenCalled();
  });

  it("should notify multiple subscribers", async () => {
    service.subscribe("user_created", "admin@example.com");
    service.subscribe("user_created", "manager@example.com");

    await service.emit("user_created", { userId: "u1" });

    const adminNotifs = store.getByRecipient("admin@example.com");
    const managerNotifs = store.getByRecipient("manager@example.com");
    expect(adminNotifs).toHaveLength(1);
    expect(managerNotifs).toHaveLength(1);
  });

  it("should set status to failed when transport fails", async () => {
    const failingTransport: TransportAdapter = {
      send: vi.fn().mockResolvedValue(false),
    };
    const svc = new NotificationService(failingTransport, store);

    svc.subscribe("user_deleted", "admin@example.com");
    await svc.emit("user_deleted", { userId: "u1" });

    const notifications = store.getByRecipient("admin@example.com");
    expect(notifications).toHaveLength(1);
    expect(notifications[0].status).toBe("failed");
  });

  it("should get notifications for a specific recipient", async () => {
    service.subscribe("user_created", "admin@example.com");
    service.subscribe("user_updated", "admin@example.com");
    service.subscribe("user_created", "other@example.com");

    await service.emit("user_created", { userId: "u1" });
    await service.emit("user_updated", { userId: "u1", changes: {} });

    const adminNotifs = store.getByRecipient("admin@example.com");
    const otherNotifs = store.getByRecipient("other@example.com");
    expect(adminNotifs).toHaveLength(2);
    expect(otherNotifs).toHaveLength(1);
  });
});
