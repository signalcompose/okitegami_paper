import type { User } from "../models/user.js";
import { UserService } from "../services/user-service.js";

export interface ApiRequest<T = unknown> {
  body?: T;
  params?: Record<string, string>;
}

export interface ApiResponse<T = unknown> {
  status: number;
  data?: T;
  error?: string;
}

export class UserApi {
  private userService: UserService;

  constructor(userService: UserService) {
    this.userService = userService;
  }

  createUser(
    req: ApiRequest<{ name: string; email: string; role: User["role"] }>
  ): ApiResponse<User> {
    try {
      if (!req.body) {
        return { status: 400, error: "Request body is required" };
      }
      const user = this.userService.createUser(req.body);
      return { status: 201, data: user };
    } catch (err) {
      return {
        status: 500,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  getUser(req: ApiRequest): ApiResponse<User> {
    const id = req.params?.id;
    if (!id) {
      return { status: 400, error: "User ID is required" };
    }
    const user = this.userService.getUser(id);
    if (!user) {
      return { status: 404, error: "User not found" };
    }
    return { status: 200, data: user };
  }

  updateUser(req: ApiRequest<Partial<Pick<User, "name" | "email" | "role">>>): ApiResponse<User> {
    const id = req.params?.id;
    if (!id) {
      return { status: 400, error: "User ID is required" };
    }
    if (!req.body) {
      return { status: 400, error: "Request body is required" };
    }
    try {
      const user = this.userService.updateUser(id, req.body);
      return { status: 200, data: user };
    } catch (err) {
      return {
        status: 404,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  deleteUser(req: ApiRequest): ApiResponse<{ deleted: boolean }> {
    const id = req.params?.id;
    if (!id) {
      return { status: 400, error: "User ID is required" };
    }
    const deleted = this.userService.deleteUser(id);
    if (!deleted) {
      return { status: 404, error: "User not found" };
    }
    return { status: 200, data: { deleted: true } };
  }
}
