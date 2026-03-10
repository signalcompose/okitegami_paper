import { validateToken } from "./jwt-validator.js";
import { TokenStore } from "./token-store.js";
import { config } from "../utils/config.js";
import { logger } from "../utils/logger.js";

export interface AuthRequest {
  headers: Record<string, string | undefined>;
  path: string;
}

export interface AuthResult {
  allowed: boolean;
  status: number;
  message?: string;
}

const tokenCache = new TokenStore();

/**
 * Authentication middleware that validates JWT tokens from the
 * Authorization header.
 *
 * Status codes:
 * - 200: Valid token, request allowed
 * - 401: Missing or invalid token (Unauthorized)
 * - 403: Expired token (Forbidden)
 */
export function authMiddleware(req: AuthRequest, secret: string = config.jwtSecret): AuthResult {
  const authHeader = req.headers["authorization"];

  if (!authHeader) {
    logger.warn(`Missing authorization header for ${req.path}`);
    return {
      allowed: false,
      status: 401,
      message: "Authorization header is required",
    };
  }

  if (!authHeader.startsWith("Bearer ")) {
    logger.warn(`Invalid authorization format for ${req.path}`);
    return {
      allowed: false,
      status: 401,
      message: "Invalid authorization format. Expected: Bearer <token>",
    };
  }

  const token = authHeader.slice(7);

  if (!token) {
    return {
      allowed: false,
      status: 401,
      message: "Token is required",
    };
  }

  // Check token cache first
  const cached = tokenCache.get(token);
  if (cached) {
    logger.info(`Authenticated via cache for ${req.path}`);
    return { allowed: true, status: 200 };
  }

  // Validate the token
  const result = validateToken(token, secret);

  if (result.valid) {
    // Cache valid tokens
    const ttl = config.tokenTtlSeconds;
    tokenCache.set(token, result.payload, ttl);
    logger.info(`Authenticated for ${req.path}`);
    return { allowed: true, status: 200 };
  }

  // Handle different error cases
  if (result.error === "Token has expired") {
    // BUG: Returns 401 for expired tokens. Should return 403.
    logger.warn(`Expired token used for ${req.path}`);
    return {
      allowed: false,
      status: 401,
      message: "Token has expired",
    };
  }

  logger.warn(`Invalid token for ${req.path}: ${result.error}`);
  return {
    allowed: false,
    status: 401,
    message: result.error ?? "Invalid token",
  };
}

/**
 * Resets the internal token cache. Useful for testing.
 */
export function resetTokenCache(): void {
  tokenCache.clear();
}
