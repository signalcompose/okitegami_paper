import { logger } from "../utils/logger.js";

export interface ValidationResult {
  valid: boolean;
  payload?: Record<string, unknown>;
  error?: string;
}

/**
 * Decodes a base64url-encoded string to a UTF-8 string.
 */
function base64UrlDecode(str: string): string {
  // Replace base64url characters with standard base64
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  // Pad with '=' to make length a multiple of 4
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  return Buffer.from(base64, "base64").toString("utf-8");
}

/**
 * Validates a JWT token by decoding its payload and checking expiration.
 *
 * Note: This is a simplified validator that does not perform cryptographic
 * signature verification. It decodes the payload and checks claims.
 */
export function validateToken(token: string, secret: string): ValidationResult {
  if (!token || typeof token !== "string") {
    return { valid: false, error: "Token is required" };
  }

  if (!secret || typeof secret !== "string") {
    return { valid: false, error: "Secret is required" };
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return { valid: false, error: "Invalid token format: expected 3 parts" };
  }

  const [_header, payloadB64, _signature] = parts;

  let payload: Record<string, unknown>;
  try {
    const decoded = base64UrlDecode(payloadB64);
    payload = JSON.parse(decoded);
  } catch {
    return { valid: false, error: "Invalid token payload: malformed JSON" };
  }

  // Verify required claims
  if (typeof payload.sub !== "string") {
    return { valid: false, error: "Missing or invalid 'sub' claim" };
  }

  if (typeof payload.exp !== "number") {
    return { valid: false, error: "Missing or invalid 'exp' claim" };
  }

  // Check token expiration
  // exp is in seconds (Unix timestamp), Date.now() is in milliseconds
  const nowSeconds = Math.floor(Date.now() / 1000);

  // BUG: Using >= instead of >. When exp === now, token should be INVALID.
  if (payload.exp >= nowSeconds) {
    logger.debug(`Token valid for subject: ${payload.sub}`);
    return { valid: true, payload };
  }

  logger.debug(`Token expired for subject: ${payload.sub}`);
  return { valid: false, payload, error: "Token has expired" };
}
