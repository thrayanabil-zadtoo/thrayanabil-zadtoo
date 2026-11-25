# Firestore Security Specification (ZAD FX)

## 1. Data Invariants
1. **Default-Deny Catch-All**: Every undefined collection or subcollection is denied via `match /{document=**} { allow read, write: if false; }`.
2. **Admin Identity**: Administrative mutations (`subscribers`, `robot_keys`, `robot_public_feed`, `signals`, `public_config`) require `request.auth != null`, `request.auth.token.email_verified == true`, and verified admin email (`thrayanabil@gmail.com`) or existence in `/admins/{uid}`. List queries avoid `get()`/`exists()` calls by checking verified admin email directly.
3. **PII Isolation**: Subscriber PII (`email`, `phone`, `telegramUsername`, `brokerAccountId`, `notes`) lives strictly in `/subscribers/{subId}`, which denies all reads, lists, and writes to non-admins.
4. **Key Enumeration Prevention**: `/robot_keys/{keyId}` stores zero PII and permits `get` only for a specific valid key ID (`^[a-zA-Z0-9_\\-]+$`), while `list` is restricted to the verified admin.
5. **Temporal Integrity**: All writes require `updatedAt == request.time`.

## 2. Dirty Dozen Attack Payloads (Expected: PERMISSION_DENIED)
1. Unauthenticated write to `/subscribers/sub_1` with `{ id: "sub_1", name: "Attacker", status: "ACTIVE" }`.
2. Signed-in non-admin user reading `/subscribers/sub_1` or listing `/subscribers`.
3. Signed-in user with unverified email (`email_verified: false`) pretending to be `thrayanabil@gmail.com` writing `/public_config/contact_links`.
4. Unauthenticated or non-admin listing of `/robot_keys` to scrape member API keys.
5. Unauthenticated write to `/robot_public_feed/live` injecting a fake `CALL` signal.
6. Admin shadow-field write to `/robot_keys/QX-TEST-1` containing an extra disallowed field `isAdmin: true`.
7. Admin write to `/subscribers/sub_bad` with an oversized `name` (> 160 chars) or forged client `updatedAt` != `request.time`.
8. Document ID poisoning on `/subscribers/bad..id..with..1500..chars` failing `isValidId()`.
9. Write to `/public_config/arbitrary_doc` outside `['plans', 'contact_links', 'payment_methods', 'robot_settings']`.
10. Write to `/robot_public_feed/live` with `allowedPairs` list containing > 20 items or non-string first element.
11. Read/write to legacy locked `/robot_feed/live` or `/test/connection`.
12. Non-admin `delete` or `update` on `/signals/sig_1` attempting to forge `WIN` outcome.
