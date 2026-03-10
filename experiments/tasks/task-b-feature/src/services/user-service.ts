import type { User } from "../models/user.js";
import type { NotificationService } from "./notification-service.js";

let idCounter = 0;

function generateId(): string {
  idCounter++;
  return `user_${idCounter.toString().padStart(4, "0")}`;
}

export class UserService {
  private users: Map<string, User> = new Map();
  private notificationService?: NotificationService;

  constructor(notificationService?: NotificationService) {
    this.notificationService = notificationService;
  }

  createUser(data: { name: string; email: string; role: User["role"] }): User {
    const user: User = {
      id: generateId(),
      name: data.name,
      email: data.email,
      role: data.role,
      createdAt: new Date().toISOString(),
    };
    this.users.set(user.id, user);
    if (this.notificationService) {
      this.notificationService.emit("user_created", {
        userId: user.id,
        name: user.name,
        email: user.email,
      });
    }
    return user;
  }

  getUser(id: string): User | undefined {
    return this.users.get(id);
  }

  updateUser(id: string, data: Partial<Pick<User, "name" | "email" | "role">>): User {
    const user = this.users.get(id);
    if (!user) {
      throw new Error(`User not found: ${id}`);
    }
    const updated: User = { ...user, ...data };
    this.users.set(id, updated);
    if (this.notificationService) {
      this.notificationService.emit("user_updated", {
        userId: updated.id,
        changes: data,
      });
    }
    return updated;
  }

  deleteUser(id: string): boolean {
    const user = this.users.get(id);
    if (!user) {
      return false;
    }
    this.users.delete(id);
    if (this.notificationService) {
      this.notificationService.emit("user_deleted", {
        userId: id,
      });
    }
    return true;
  }
}
