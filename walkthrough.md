# Security Summary

**Reviewed Files**: 14 (`server.ts`, `firestore.rules`, `.env.example`, `.gitignore`, `src/App.tsx`, `src/firebase.ts`, `src/components/ZadtooAdminDashboard.tsx`, `src/components/TelegramBotManager.tsx`, `src/components/ZadtooAdminLiveBroadcast.tsx`, `src/components/ZadtooForexNewsPage.tsx`, `src/components/ZadtooAutoTradePage.tsx`, `src/components/QuotexRobotAdminPage.tsx`, `src/components/ZadtooPlansAndLinksManager.tsx`, `src/components/ZadtooPaymentsManager.tsx`)
**Issues Resolved**: 10

### Issues Resolved
| Area | File | Line | What Was Happening | Impact | Status | How It Was Fixed |
|---|---|---|---|---|---|---|
| Admin Auth Bypass & Hardcoded Credentials | `src/App.tsx` / `server.ts` | `831-877` / `9524-9599` | Admin authentication relied on client-side checks, a URL query backdoor (`?admin=Tr@7177`), and browser `zad_admin_auth` flags, allowing unauthorized access with arbitrary credentials or URL manipulation. | Critical | Fixed | Replaced client-side checks with server-side `POST /api/admin/setup` (first-run claim when `ADMIN_PASS` is unset) and `POST /api/admin/login` using `scryptSync` password hashing, constant-time comparisons, and HMAC-SHA256 signed session tokens (`zad_admin_token`). |
| Unauthenticated Admin & Operational Routes | `server.ts` | `9346-11956` | Sensitive mutation, broadcast, settings, QuickNotes, subscriber, Forex news, and diagnostic endpoints lacked server-side authorization checks. | Critical | Fixed | Applied `requireAdmin` middleware validating `Authorization: Bearer <token>` across all administrative and mutating endpoints, including `/api/autopilot*`, `/api/telegram-bot/*`, `/api/admin/*`, `/api/forex-news` writes, `/api/platform-config/*` writes, and `/api/payments/methods` & `review-transaction`. |
| Exposed Telegram Bot Tokens | `server.ts` / `src/*.tsx` | `38-41`, `185-198` | Telegram bot tokens were hardcoded in frontend and backend source files, stored in browser storage, and returned unredacted in public API payloads, with direct browser calls to `api.telegram.org`. | Critical | Fixed | Removed all hardcoded bot tokens from client and server code, disabled direct browser calls to Telegram APIs, moved token config to `.env.example` (`TELEGRAM_*_BOT_TOKEN`), and redacted tokens (`'CONFIGURED' \| ''`) via `redactAutoPilotForPublic` and `redactBotConfigForAdmin`. |
| Exposed PII & Financial Records | `server.ts` | `9632-9641`, `11627-11636`, `9301-9343`, `9463-9482` | Unauthenticated `GET /api/signals` and `GET /api/payments/config` exposed subscriber records, notes, and payment transactions; member lookup/messaging could be accessed without credential verification. | High | Fixed | Filtered `subscribers`, `quickNotes`, and `paymentTransactions` to empty arrays unless an authenticated admin session is present; enforced constant-time Broker Account ID verification on `POST /api/member/lookup` and `POST /api/subscribers/:id/message`. |
| Downloadable Programs, Source Code & Static `.txt` Exposure | `public/assets/aistudio/` & `server.ts` & UI | `9989-9999`, `11917-11919` | Downloadable `.user.js` robot scripts, `.mq4` MetaTrader indicator code, `/strategy.txt` endpoints, and a static MQL4 text file (`NB_FX_Momentum_Pause_Breakout_MT4_f0a4df1b.txt`) were publicly downloadable. | High | Fixed | Deleted the static `.txt` MQL4 asset from `public/assets/aistudio/`, disabled all `.user.js`, `.mq4`, and `.txt` download endpoints with HTTP `404`, and removed all download/copy-code UI controls. |
| Permissive Firestore Rules & Client Cloud Writes | `firestore.rules` / `src/firebase.ts` | `23-35` / `82-144` | Client browser code could read or overwrite global cloud state and bot configurations in Firestore. | High | Fixed | Locked `firestore.rules` so `test` and `robot_feed` deny all access and `system_state` permits `get` only for public `platform_plans` and `platform_contact_links`; disabled all client-side Firestore writes and sensitive reads in `src/firebase.ts`. |
| Unverified Country Update Endpoint | `server.ts` | `12107-12112` | `/api/verify-country` accepted an unsigned `chatId` query parameter, allowing third parties to alter stored Telegram user country state. | Medium | Fixed | Added `signVerifyCountryToken` / `verifyCountryToken` HMAC-SHA256 verification so `chatId` state updates return `403 Forbidden` without a valid signature. |
| HTML Injection in Server-Rendered Status Pages | `server.ts` | `176-183`, `10108-10149`, `12192` | Dynamic member/signal/country strings were interpolated directly into server-rendered HTML responses (`/api/robot-status`, `/api/verify-country`). | Medium | Fixed | Added `escapeHtml()` and escaped all interpolated values before rendering HTML responses. |
| Credential Rotation for Previously Exposed Bot Tokens | External (`@BotFather` / Env Secrets) | — | Historical Telegram bot tokens (`FREE`, `VIP`, `ONBOARDING`) previously existed in source code prior to this remediation. | High | Needs Follow-Up | Rotate the three Telegram bot tokens via `@BotFather` and configure the new tokens strictly via server environment secrets or the authenticated admin panel. |
| Transitive Dependency Advisories | `package.json` / `bun.lock` | — | Read-only `bun audit` reported 5 transitive advisories in `express` (`body-parser < 1.20.9`, `qs`) and `firebase` (`@grpc/grpc-js < 1.13.6`, `re2js < 2.8.7`). | Medium | Needs Follow-Up | Plan targeted upgrades of `express` and `firebase` when upstream patches fit compatibility requirements; also deploy hardened `firestore.rules` to Firebase. |

### Safeguards Verified
| Area | File | How It's Protected |
|---|---|---|
| Admin Password Storage & Sessions | `server.ts` | Passwords set via first-run setup are salted and hashed with `crypto.scryptSync`; login and token signatures are checked using `crypto.timingSafeEqual`; sessions expire after 24 hours. |
| Server-Only Secrets | `.env.example`, `.gitignore` | Sensitive secrets (`ADMIN_PASS`, `ADMIN_SESSION_SECRET`, `TELEGRAM_*_BOT_TOKEN`) are server-side environment variables only; runtime state files (`*-state.json`) are excluded via `.gitignore`. |
| Zero Downloadable Programs/Archives | `public/`, `dist/`, `server.ts` | Verified post-build (`compile_applet` + filesystem scan) that zero `.txt`, `.mq4`, `.mq5`, `.ex4`, `.user.js`, `.zip`, `.rar`, `.7z`, `.tar*`, `.exe`, or `.dmg` files exist on disk or are served via API. |
| Type Safety & Build Integrity | `tsconfig.json`, `vite.config.ts` | Verified clean `tsc --noEmit` (`lint_applet`) and production bundle compilation (`compile_applet`) after all security changes and asset removal. |

### Needs Follow-Up
1. **Rotate Telegram Bot Tokens**: Issue fresh tokens in `@BotFather` for the Free, VIP, and Onboarding bots so previously committed tokens are permanently invalidated, and set them in server Secrets (`TELEGRAM_FREE_BOT_TOKEN`, `TELEGRAM_VIP_BOT_TOKEN`, `TELEGRAM_ONBOARDING_BOT_TOKEN`).
2. **Deploy Updated Firestore Rules**: Publish the hardened `firestore.rules` to your live Firebase project so cloud database access matches the local rules configuration.
3. **Configure Production Admin Secrets**: Optionally set `ADMIN_EMAILS`, `ADMIN_PASS`, and `ADMIN_SESSION_SECRET` in environment secrets (otherwise complete the one-time first-run admin setup screen on `/api/admin/setup`).
4. **Upgrade Flagged Dependencies**: Schedule dependency updates for `express` (`body-parser` / `qs`) and `firebase` (`@grpc/grpc-js` / `re2js`) to resolve the 5 transitive advisories identified by `bun audit`.

---

## PoC Verification

### 1. Arbitrary Credential & URL Backdoor Admin Login Bypass
#### Summary
| Field | Value |
|---|---|
| Issue Type | Broken Authentication & Authorization Bypass |
| Impact | Critical |
| Affected File | `src/App.tsx:831-877`, `server.ts:9524-9599` |
| Test Scenario | Navigating to `/?admin=Tr@7177` or calling `POST /api/admin/login` with `{"email":"attacker@example.com","password":"anypassword"}` or calling `POST /api/autopilot` without an `Authorization` header. |

#### How It Was Fixed
Removed the URL query backdoor and client-side `zad_admin_auth` flags. All admin sessions now require a signed HMAC-SHA256 token issued by `POST /api/admin/setup` (only allowed once if neither `ENV_ADMIN_PASS` nor `persistedAdminAuth` exists) or `POST /api/admin/login` verified with `scryptSync` and `timingSafeEqual`. Protected API routes enforce `requireAdmin`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Attacker submits arbitrary credentials to `POST /api/admin/login` (`server.ts:9563`) | Enters server-side validation |
| 2 | `verifyPasswordScrypt` / `safeTimingEqualStr` checks against `ENV_ADMIN_PASS` or `persistedAdminAuth.passwordHash` (`server.ts:9581-9591`) | Returns `false` (`401` rejected) |
| 3 | Direct `POST /api/autopilot` without `Bearer` token reaches `requireAdmin` (`server.ts:154-160`, `10307`) | Rejected with `401 Unauthorized` |

#### Conclusion
**Fix Verified** - Neither URL parameters, browser storage tampering, nor arbitrary email/password combinations can unlock the admin dashboard or execute administrative API endpoints.

---

### 2. Unauthenticated Telegram Bot Token & PII Extraction
#### Summary
| Field | Value |
|---|---|
| Issue Type | Sensitive Secret & PII Exposure |
| Impact | Critical |
| Affected File | `server.ts:185-198`, `9632-9641`, `11627-11636`, `11925-11927` |
| Test Scenario | Unauthenticated `GET /api/signals`, `GET /api/payments/config`, and `GET /api/telegram-bot/config` requests seeking Telegram bot tokens, subscriber lists, or payment receipts. |

#### How It Was Fixed
Removed hardcoded tokens from frontend and backend sources, wrapped public payloads in `redactAutoPilotForPublic` / `redactBotConfigForAdmin` (returning `'CONFIGURED'` instead of raw tokens), stripped `subscribers`, `quickNotes`, and `paymentTransactions` when no valid admin session is attached, and protected `/api/telegram-bot/*` with `requireAdmin`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Unauthenticated client calls `GET /api/signals` (`server.ts:9602`) and `GET /api/payments/config` (`server.ts:11627`) | `extractAdminSession(req)` evaluates to `null` |
| 2 | `redactAutoPilotForPublic(autoPilot)` replaces token strings with `'CONFIGURED' \| ''`; `subscribers`, `quickNotes`, and `paymentTransactions` resolve to `[]` (`server.ts:9637-9641`, `11635`) | No secrets or user PII returned |
| 3 | Unauthenticated client calls `GET /api/telegram-bot/config` (`server.ts:11925`) | `requireAdmin` returns `401 Unauthorized` |

#### Conclusion
**Fix Verified** - Unauthenticated visitors cannot retrieve raw Telegram bot tokens, subscriber records, private notes, or payment transaction receipts.

---

### 3. Downloadable Scripts, Indicators, and Static Text Code Exposure
#### Summary
| Field | Value |
|---|---|
| Issue Type | Unintended Source Code & Downloadable File Exposure |
| Impact | High |
| Affected File | `public/assets/aistudio/` & `server.ts:9989-9999`, `11917-11919` |
| Test Scenario | Direct HTTP requests to `/assets/aistudio/NB_FX_Momentum_Pause_Breakout_MT4_f0a4df1b.txt`, `/api/quotex-robot/zad-broker-robot.user.js`, `/strategy.txt`, or `/api/strategy/download-mq4`. |

#### How It Was Fixed
Deleted the static MQL4 `.txt` file from `public/assets/aistudio/`, rebuilt the production `dist/` bundle cleanly, replaced all `.user.js`, `.mq4`, and `.txt` download route handlers with `404` responses, and removed every script/code download button from the UI.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Request targets `/api/quotex-robot/zad-broker-robot.user.js`, `/strategy.txt`, or `/api/strategy/download-mq4` (`server.ts:9989`, `11917`) | Hits explicit `404` handler |
| 2 | Request targets `/assets/aistudio/NB_FX_Momentum_Pause_Breakout_MT4_f0a4df1b.txt` | File no longer exists in `public/` or rebuilt `dist/` |
| 3 | Filesystem & build audit (`find` across workspace, `public/`, and `dist/`) | Zero `.txt`, `.mq4`, `.user.js`, or archive files present |

#### Conclusion
**Fix Verified** - No downloadable scripts, MetaTrader indicators, strategy text files, or compressed program archives remain accessible anywhere in the application or static build.

---

### 4. Member Lookup & Cross-Account Messaging Spoofing
#### Summary
| Field | Value |
|---|---|
| Issue Type | Missing Ownership / Credential Verification |
| Impact | High |
| Affected File | `server.ts:9301-9343`, `9463-9482` |
| Test Scenario | Calling `POST /api/member/lookup` with another subscriber's email/phone without a matching Broker Account ID, or calling `POST /api/subscribers/:id/message` with `{"sender":"admin"}` without an admin token. |

#### How It Was Fixed
Both endpoints now verify `extractAdminSession(req)` for admin access and otherwise enforce constant-time (`safeTimingEqualStr`) verification against the subscriber's registered `brokerAccountId`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Attacker sends `POST /api/subscribers/:id/message` with `sender: "admin"` and no Bearer token (`server.ts:9470-9475`) | Rejected with `401` |
| 2 | Attacker sends `POST /api/member/lookup` with target `identifier` and wrong/empty `password` (`server.ts:9331-9339`) | `safeTimingEqualStr` fails; rejected with `401` |

#### Conclusion
**Fix Verified** - Member profiles and support threads cannot be accessed or impersonated without either an authenticated admin session or the member's verified Broker Account ID.

---

### 5. HTML Injection & Unsigned Verification Callback
#### Summary
| Field | Value |
|---|---|
| Issue Type | Reflected HTML Injection & Unsigned State Mutation |
| Impact | Medium |
| Affected File | `server.ts:163-183`, `10080-10150`, `12107-12193` |
| Test Scenario | Calling `GET /api/verify-country?chatId=12345&token=forged` or requesting `GET /api/robot-status?apiKey=<script>alert(1)</script>` with an admin session. |

#### How It Was Fixed
Added `verifyCountryToken` (HMAC-SHA256 signature validation) before updating Telegram user country state, protected `/api/robot-status` with `requireAdmin`, and escaped all dynamic HTML values via `escapeHtml()`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Unsigned or forged `GET /api/verify-country?chatId=12345&token=forged` reaches `server.ts:12110` | `verifyCountryToken` returns `false` -> `403 Forbidden` |
| 2 | Script payload passed in `/api/robot-status` query reaches `escapeHtml(apiKey)` (`server.ts:10110`) | `<` and `>` encoded as `&lt;` and `&gt;` before rendering |

#### Conclusion
**Fix Verified** - Unverified `chatId` country overrides are blocked and HTML injection vectors are neutralized.
