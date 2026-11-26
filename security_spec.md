# Firestore Security Specification (`security_spec.md`)

## 1. Data Invariants
1. **Default-Deny Catch-All:** Every undefined path in Firestore is denied (`allow read, write: if false`).
2. **Path Variable Hardening (`isValidId`):** Every single-document ID (`{docId}`, `{userId}`) must be a string matching `^[a-zA-Z0-9_\-]+$` with `size() <= 128`.
3. **Admin Authentication & Verified Email:** All administrative writes (`create`, `update`, `delete`) across `system_state`, `robot_feed`, and `admins` require an authenticated user (`request.auth != null`) with `request.auth.token.email_verified == true` and an authorized admin identity (`exists(/databases/$(database)/documents/admins/$(request.auth.uid))` or verified bootstrapped admin email).
4. **PII & Secret Isolation:** `system_state/telegram_bot_state` (Telegram bot token, payment/bank account details, bot user PII) and `system_state/zad_main_state_v1` (subscriber API keys/broker IDs) must NEVER be readable (`get`/`list`) by unauthenticated visitors or non-admins. Only `platform_plans` and `platform_contact_links` in `system_state`, `robot_feed/live`, and `test/connection` allow public `get` (and `list` is strictly denied everywhere).
5. **Strict Schema & Size Guards:** Every write to `system_state` must validate `isValidAppState(incoming())` (`updatedAt` string `1..64`, `payload` string `<= 500000`, no shadow keys). Every write to `robot_feed` must validate `isValidRobotFeed(incoming())`. Every `update` explicitly constrains `affectedKeys().hasOnly(...)`.

## 2. The "Dirty Dozen" Payloads (Must All Return PERMISSION_DENIED)
1. Unauthenticated write to `system_state/platform_plans` (`{ updatedAt: "2026-11-26T00:00:00Z", payload: "[]" }`).
2. Unauthenticated read (`get`) on `system_state/telegram_bot_state` (bot token + bank details + user PII).
3. Unauthenticated `list` query on `system_state`.
4. Unauthenticated write to `robot_feed/live` (`{ updatedAt: "2026-11-26T00:00:00Z", payload: "{}" }`).
5. Authenticated non-admin user attempting write to `system_state/zad_main_state_v1`.
6. Unverified email admin spoof (`request.auth.token.email == "thrayanabil@gmail.com"`, `email_verified: false`) writing to `system_state/platform_plans`.
7. Shadow update attack injecting an extra ghost field (`{ updatedAt: "...", payload: "{}", isAdmin: true }`) on `system_state/platform_plans`.
8. Oversized payload DoW attack (`payload` > 500,000 bytes) on `system_state/zad_main_state_v1`.
9. Oversized or invalid-character document ID (`docId = "../evil"` or 200-char ID) on `system_state/{docId}`.
10. Non-admin reading `admins/{otherUserId}` or writing self-assigned admin role to `admins/{selfUid}` (`{ email: "attacker@example.com", role: "admin" }`).
11. Unauthenticated write to `test/connection`.
12. Wrong-type `updatedAt` (`updatedAt: 123456`) or empty `updatedAt` (`""`) on `robot_feed/live`.
