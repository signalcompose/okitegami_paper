import { describe, it, expect, beforeEach } from "vitest";
import { UserService } from "../src/services/user-service.js";

describe("UserService", () => {
  let service: UserService;

  beforeEach(() => {
    service = new UserService();
  });

  it("should create a user", () => {
    const user = service.createUser({
      name: "Alice",
      email: "alice@example.com",
      role: "admin",
    });

    expect(user).toBeDefined();
    expect(user.id).toBeDefined();
    expect(user.name).toBe("Alice");
    expect(user.email).toBe("alice@example.com");
    expect(user.role).toBe("admin");
    expect(user.createdAt).toBeDefined();
  });

  it("should get a user by id", () => {
    const created = service.createUser({
      name: "Bob",
      email: "bob@example.com",
      role: "member",
    });

    const found = service.getUser(created.id);
    expect(found).toBeDefined();
    expect(found!.name).toBe("Bob");
  });

  it("should update a user", () => {
    const created = service.createUser({
      name: "Charlie",
      email: "charlie@example.com",
      role: "member",
    });

    const updated = service.updateUser(created.id, { name: "Charles" });
    expect(updated.name).toBe("Charles");
    expect(updated.email).toBe("charlie@example.com");
  });

  it("should delete a user", () => {
    const created = service.createUser({
      name: "Dave",
      email: "dave@example.com",
      role: "member",
    });

    const deleted = service.deleteUser(created.id);
    expect(deleted).toBe(true);
    expect(service.getUser(created.id)).toBeUndefined();
  });
});
