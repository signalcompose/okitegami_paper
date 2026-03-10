import { authMiddleware, type AuthRequest, type AuthResult } from "../auth/middleware.js";

export interface HandlerResponse {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Health check endpoint — no auth required.
 */
export function healthCheck(): HandlerResponse {
  return {
    status: 200,
    body: { status: "ok", timestamp: new Date().toISOString() },
  };
}

/**
 * Get user profile — requires authentication.
 */
export function getProfile(req: AuthRequest): HandlerResponse {
  const auth: AuthResult = authMiddleware(req);
  if (!auth.allowed) {
    return {
      status: auth.status,
      body: { error: auth.message },
    };
  }

  return {
    status: 200,
    body: {
      id: "user-123",
      name: "Test User",
      email: "test@example.com",
    },
  };
}

/**
 * Get data — requires authentication.
 */
export function getData(req: AuthRequest): HandlerResponse {
  const auth: AuthResult = authMiddleware(req);
  if (!auth.allowed) {
    return {
      status: auth.status,
      body: { error: auth.message },
    };
  }

  return {
    status: 200,
    body: {
      items: [
        { id: 1, value: "item-one" },
        { id: 2, value: "item-two" },
      ],
    },
  };
}

/**
 * Create data — requires authentication.
 */
export function createData(req: AuthRequest): HandlerResponse {
  const auth: AuthResult = authMiddleware(req);
  if (!auth.allowed) {
    return {
      status: auth.status,
      body: { error: auth.message },
    };
  }

  return {
    status: 201,
    body: { id: 3, value: "new-item", created: true },
  };
}
