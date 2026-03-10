# Task A: Solution

## Bug 1 — JWT Expiry Boundary (jwt-validator.ts)

**File**: `src/auth/jwt-validator.ts`
**Line**: Expiry check in `validateToken()`
**Bug**: Uses `payload.exp >= nowSeconds` — treats token as valid when `exp === now`
**Fix**: Change to `payload.exp > nowSeconds` — token at exact expiry should be invalid

```diff
- if (payload.exp >= nowSeconds) {
+ if (payload.exp > nowSeconds) {
```

## Bug 2 — Token Store TTL Boundary (token-store.ts)

**File**: `src/auth/token-store.ts`
**Line**: Expiry check in `get()`
**Bug**: Uses `Date.now() > entry.expiresAt` — returns value when `Date.now() === expiresAt`
**Fix**: Change to `Date.now() >= entry.expiresAt` — entry at exact expiry should be expired

```diff
- if (Date.now() > entry.expiresAt) {
+ if (Date.now() >= entry.expiresAt) {
```

## Bug 3 — Expired Token Status Code (middleware.ts)

**File**: `src/auth/middleware.ts`
**Line**: Status code for expired tokens
**Bug**: Returns `401` (Unauthorized) for expired tokens
**Fix**: Change to `403` (Forbidden) — expired tokens are a distinct case from missing/invalid tokens

```diff
  if (result.error === "Token has expired") {
    logger.warn(`Expired token used for ${req.path}`);
    return {
      allowed: false,
-     status: 401,
+     status: 403,
      message: "Token has expired",
    };
  }
```
