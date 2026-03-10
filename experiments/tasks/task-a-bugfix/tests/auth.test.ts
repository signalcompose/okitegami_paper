import { describe, it, expect, beforeEach, vi } from "vitest";
import { validateToken } from "../src/auth/jwt-validator.js";
import { TokenStore } from "../src/auth/token-store.js";
import { authMiddleware, resetTokenCache } from "../src/auth/middleware.js";

// --- Helpers ---

function base64UrlEncode(obj: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(obj))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function createToken(payload: Record<string, unknown>): string {
  const header = { alg: "HS256", typ: "JWT" };
  return `${base64UrlEncode(header)}.${base64UrlEncode(payload)}.fake-signature`;
}

const TEST_SECRET = "test-secret-key";

// --- JWT Validator Tests ---

describe("JWT Validator", () => {
  it("should validate a token with future expiry", () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    const token = createToken({ sub: "user-1", exp: futureExp, iat: futureExp - 3600 });

    const result = validateToken(token, TEST_SECRET);

    expect(result.valid).toBe(true);
    expect(result.payload?.sub).toBe("user-1");
  });

  it("should reject a token with missing authorization", () => {
    const result = validateToken("", TEST_SECRET);

    expect(result.valid).toBe(false);
    expect(result.error).toBe("Token is required");
  });

  it("should reject a token with invalid format", () => {
    const result = validateToken("not-a-jwt-token", TEST_SECRET);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid token format");
  });

  it("should reject a token at exact expiry boundary", () => {
    // When exp === now, the token should be considered expired
    const nowSeconds = Math.floor(Date.now() / 1000);
    const token = createToken({ sub: "user-2", exp: nowSeconds, iat: nowSeconds - 3600 });

    // Mock Date.now to return a stable value matching exp exactly
    const stableNow = nowSeconds * 1000;
    vi.spyOn(Date, "now").mockReturnValue(stableNow);

    const result = validateToken(token, TEST_SECRET);

    vi.restoreAllMocks();

    // Token at exact expiry should be INVALID
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Token has expired");
  });

  it("should reject a token well past expiry", () => {
    const pastExp = Math.floor(Date.now() / 1000) - 7200; // 2 hours ago
    const token = createToken({ sub: "user-3", exp: pastExp, iat: pastExp - 3600 });

    const result = validateToken(token, TEST_SECRET);

    expect(result.valid).toBe(false);
    expect(result.error).toBe("Token has expired");
  });
});

// --- Token Store Tests ---

describe("Token Store", () => {
  let store: TokenStore;

  beforeEach(() => {
    store = new TokenStore();
  });

  it("should store and retrieve a value within TTL", () => {
    store.set("key-1", { userId: "abc" }, 60);

    const value = store.get("key-1");

    expect(value).toEqual({ userId: "abc" });
  });

  it("should return undefined for entry at exact TTL boundary", () => {
    const baseTime = Date.now();

    // Set with 10 second TTL
    vi.spyOn(Date, "now").mockReturnValue(baseTime);
    store.set("key-2", { data: "test" }, 10);

    // Access at exactly the expiry time (baseTime + 10000ms)
    vi.spyOn(Date, "now").mockReturnValue(baseTime + 10_000);
    const value = store.get("key-2");

    vi.restoreAllMocks();

    // Entry at exact TTL boundary should be expired (undefined)
    expect(value).toBeUndefined();
  });

  it("should return undefined for entry well past TTL", () => {
    const baseTime = Date.now();

    vi.spyOn(Date, "now").mockReturnValue(baseTime);
    store.set("key-3", { data: "old" }, 5);

    // Access well past expiry
    vi.spyOn(Date, "now").mockReturnValue(baseTime + 60_000);
    const value = store.get("key-3");

    vi.restoreAllMocks();

    expect(value).toBeUndefined();
  });
});

// --- Auth Middleware Tests ---

describe("Auth Middleware", () => {
  beforeEach(() => {
    resetTokenCache();
  });

  it("should return 403 for expired tokens", () => {
    const pastExp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
    const token = createToken({ sub: "user-expired", exp: pastExp, iat: pastExp - 3600 });

    const req = {
      headers: { authorization: `Bearer ${token}` },
      path: "/api/profile",
    };

    const result = authMiddleware(req, TEST_SECRET);

    // Expired tokens should return 403 Forbidden, not 401 Unauthorized
    expect(result.allowed).toBe(false);
    expect(result.status).toBe(403);
    expect(result.message).toBe("Token has expired");
  });

  it("should allow valid tokens through middleware", () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const token = createToken({ sub: "user-valid", exp: futureExp, iat: futureExp - 3600 });

    const req = {
      headers: { authorization: `Bearer ${token}` },
      path: "/api/data",
    };

    const result = authMiddleware(req, TEST_SECRET);

    expect(result.allowed).toBe(true);
    expect(result.status).toBe(200);
  });
});
