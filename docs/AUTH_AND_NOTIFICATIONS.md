# AcadeXMatch — sign-in, account recovery and email notifications

This document covers what was built, how to switch each provider on, how to deploy and roll back, and how
to test. Nothing here needs a database migration that changes or deletes existing data.

## 1. Architecture (as found, and what changed)

| Part | Before | Now |
|---|---|---|
| App | Next.js 15 (App Router), React 19, TypeScript, GoDaddy Node.js hosting from GitHub `main` | unchanged |
| Data | MySQL table `acx_kv` holding JSON collections (`db:acad_users_v3`, …); browser actions go through `/api/rpc` with server guards (`RPC_GUARDS` in `lib/server/db.ts`) | unchanged; new collections `db:_otp`, `db:_notify_queue`, `db:_email_suppressed`; new optional fields on users |
| Sessions | random token in an HttpOnly cookie, stored by raw value | stored by SHA-256 digest (old sessions are re-keyed on first use, nobody is signed out); device, method, “remember me” (30 days) or 12-hour sessions; list and sign-out of other devices |
| Passwords | PBKDF2-SHA256 | scrypt (N=2^15, r=8, p=3). Old PBKDF2 hashes still work and are upgraded at the next sign-in |
| Email | `lib/server/mailer.ts` (SMTP, Brevo or Resend API) called directly | one queue (`lib/server/notifications.ts`) with idempotency keys, retries with backoff, preferences, unsubscribe, delivery webhooks, history |

### Sign-in methods
* **Email + password** — strong-password rules (`lib/passwordPolicy.ts`), limits per address+IP, per IP and per address, the same error for “no such account” and “wrong password”, cross-site requests refused.
* **Mobile number + SMS code** (`lib/server/otp.ts`, `lib/server/sms.ts`) — 6 random digits, valid 5 minutes, single use, 5 wrong tries, 60 s between codes, max 5 per hour / 10 per day per number and 20 per hour per IP, only an HMAC of the code is stored, never logged. For an unknown number the answer is identical but no SMS is sent and the challenge can never be verified.
* **Continue with Google / Microsoft** (`lib/server/oidc.ts`) — OpenID Connect authorization code flow with PKCE (S256), `state` (signed, 10-minute cookie) and `nonce`; the ID token’s RS256 signature is checked against the provider’s published keys, plus issuer (Microsoft: tenant rules), audience, expiry and nonce. Accounts are keyed by the provider’s `sub`, never by email. An existing account with the same email is **not** merged: the person signs in the usual way and links the provider under *My account → Security*. New social accounts are candidate accounts (institutions register with the form). Buttons appear only for configured providers.
* **Administrator** — after the password, a 6-digit code by email (once email sending works; `ADMIN_EMAIL_CODE=off` disables).
* **LinkedIn** — not built. “Sign In with LinkedIn using OpenID Connect” can be added as another entry in `PROVIDERS` in `lib/server/oidc.ts` once the LinkedIn app has that product approved.

### Recovery
* **Email link** — single use, 30 minutes (`PASSWORD_RESET_MINUTES`), only its digest is stored; a new link replaces the old; reset signs out every session and sends “Your Password Has Been Changed”.
* **SMS code** — verifying the code gives a 10-minute single-use reset authorisation; the password changes only when the new one is submitted.
* Accounts that only use Google/Microsoft get an email explaining how to sign in instead of a reset link.
* Changing the email needs the password (or a sign-in in the last 15 minutes), a link to the new address, and a notice to the old one. Changing a confirmed mobile number needs the password and an SMS code.

### Verification rules
* New accounts start with `emailVerified: false` and get a welcome + confirmation email. Existing accounts are unchanged (missing = confirmed).
* Once email sending works (`REQUIRE_VERIFIED_EMAIL=auto`, default), applying and posting vacancies need a confirmed email. Optional emails go only to confirmed addresses; security emails always go out.

### Notifications (`lib/server/notifications.ts`, `lib/server/notify.ts`)
`notify()` is called only **after** the change has been saved (`/api/rpc` calls `afterRpc` only on success), so refused, duplicate or failed actions send nothing. Each message has an idempotency key; the queue retries failures at 1, 5, 30, 120, 360, 720 minutes; 4xx provider errors are not retried; bodies are dropped after sending and messages with links/codes are never stored with content; bounces and spam reports (webhook) suppress optional emails to that address.

| Event | Recipient | Category (preference) |
|---|---|---|
| Registration — “Welcome to AcadeXMatch — Verify Your Email” | new user | security (always) |
| Email confirmed | user | security |
| Mobile confirmed / changed | user | security |
| Google/Microsoft sign-up welcome | new user | account |
| Password reset link / password changed / password added | user | security |
| New sign-in from a new device | user | security (can be switched off: “New sign-in alerts”) |
| Email change link + notice to old address / email changed | user | security |
| Google/Microsoft sign-in linked or removed | user | security |
| Application submitted — “Application Submitted Successfully — [Job Title]” | applicant | applications |
| New application received | institution staff | recruiter |
| Status changed (screening, eligible, shortlisted, committee, not selected, joined) | applicant | statusUpdates |
| Offer made | applicant | statusUpdates |
| Offer accepted/declined | institution staff | recruiter |
| Interview scheduled / invited to choose a slot / slot booked / booking cancelled | applicant (and staff for bookings) | interviews / recruiter |
| Interview reminders 24 h and 1 h before (`INTERVIEW_REMINDER_HOURS`) | applicant | interviews |
| Saved-vacancy deadline reminders (3 days, 1 day) | applicant | deadlineReminders |
| Job alerts (daily/weekly, only when there are new matches) | applicant | jobAlerts |
| Talent-search invitation | candidate | jobAlerts |
| Vacancy published | posting staff | recruiter |
| Institution verified / not verified (moderation) | institution staff | account |
| Vacancy closes in 3 days / closed after last date | institution staff | recruiter |
| Administrator reset your password | user | security |
| Service announcements (admin console, “email” ticked) | chosen audience | announcements |

Payment receipts and renewal reminders were left as they were (`lib/server/payments.ts`).

Pages: *My account → Security* (password, mobile, linked sign-ins, email change, devices), `/account/notifications` (preferences + message history), `/unsubscribe` (signed links; mail apps’ one-click unsubscribe uses `/api/unsubscribe`), `/terms`, `/privacy`.

## 2. Files

New: `lib/server/security.ts`, `otp.ts`, `sms.ts`, `oidc.ts`, `notifications.ts`; `lib/phone.ts`, `lib/passwordPolicy.ts`;
`app/api/auth/{otp/request,otp/verify,oauth/[provider]/start,oauth/[provider]/callback,methods,email-change,email-change/confirm}`,
`app/api/account/{security,password,notifications,identities}`, `app/api/unsubscribe`, `app/api/email-events`;
`app/account/notifications`, `app/unsubscribe`, `app/terms`, `app/privacy`; `components/AuthWidgets.tsx`, `AccountSecurity.tsx`, `LegalPage.tsx`;
`tests/auth-unit.ts`, `tests/auth-flows.mjs`, `tests/mock-providers.mjs`; `.env.example`; this document.

Changed: `app/login`, `app/register`, `app/forgot-password`, `app/reset-password`, `app/verify-email`, `app/account`, `app/jobs/[id]` (apply needs a confirmed email when required), `app/institute/post-job`, `app/api/auth/{login,register,forgot,reset,verify,resend-verification}`, `lib/server/{auth,authEmails,db,mailer,notify,jobAlerts,deadlineReminders,expiry}.ts`, `lib/storage.ts`, `lib/site.ts`, `types/index.ts`, `instrumentation-node.ts`, `next.config.mjs`, `components/{Footer,Navbar,JobCard}.tsx`, `env-settings-example.txt`, `package.json` (adds `libphonenumber-js`).

## 3. Data changes (no migration step)
All additions are new JSON keys in `acx_kv` or new optional fields; nothing is renamed or removed.
* Users: `phone`, `phoneVerified`, `termsAcceptedAt`, `marketingConsent`, `identities[]` (`provider`, `subject`, …), `hasPassword`, `notificationPrefs`.
* `db:_otp` (code challenges, HMAC only), `db:_tokens` (link tokens, SHA-256 only), `db:_sessions` (digest keys), `db:_notify_queue` (max 5 000 newest), `db:_email_suppressed`.
* Uniqueness (email, confirmed phone, provider+subject) is enforced in code inside the store lock (`GET_LOCK('acx_store')`), as for all other data.

## 4. Settings (GoDaddy → Node.js app → Settings → Secrets, Publish tab)
See `.env.example` / `env-settings-example.txt` for every variable. Minimum for production:
```
AUTH_SECRET=<64 random hex characters>
EMAIL_API=brevo              EMAIL_API_KEY=<key>      MAIL_FROM=AcadeXMatch <info@acadexmatch.com>
APP_URL=https://acadexmatch.com
```
Optional groups: SMS (`SMS_PROVIDER`, `MSG91_*` or `TWILIO_*`), Google (`GOOGLE_CLIENT_ID/SECRET`), Microsoft (`MICROSOFT_CLIENT_ID/SECRET/TENANT`), `EMAIL_WEBHOOK_SECRET`.
At start-up the log prints which methods are on and warns about incomplete settings.

## 5. Provider setup

### Google
1. https://console.cloud.google.com → create/select a project → *APIs & Services → OAuth consent screen*: External, app name AcadeXMatch, support email info@acadexmatch.com, authorised domain `acadexmatch.com`, links to https://acadexmatch.com/privacy and /terms; scopes `openid`, `email`, `profile` only; publish the app.
2. *Credentials → Create credentials → OAuth client ID → Web application*.
   Authorised JavaScript origin: `https://acadexmatch.com`. Authorised redirect URI: `https://acadexmatch.com/api/auth/oauth/google/callback` (add the preview address too if you test there).
3. Put the client ID and secret into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

### Microsoft (Entra ID)
1. https://entra.microsoft.com → *Identity → Applications → App registrations → New registration*.
   Supported account types: “Accounts in any organizational directory and personal Microsoft accounts” (matches `MICROSOFT_TENANT=common`). Redirect URI (Web): `https://acadexmatch.com/api/auth/oauth/microsoft/callback`.
2. *Certificates & secrets → New client secret*; note its expiry date and renew it before then.
3. *API permissions*: Microsoft Graph delegated `openid`, `email`, `profile` (default). *Token configuration*: optional claim `email` and `xms_edov` (lets work-account emails count as verified).
4. Set `MICROSOFT_CLIENT_ID` (Application ID), `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT`.

### SMS (MSG91, India)
1. Register the business on a DLT portal (e.g. Jio, Airtel, Vodafone Idea, BSNL): principal entity, a 6-letter sender header (e.g. `ACADXM`) and a **Service Implicit / OTP** content template such as
   `{#var#} is your AcadeXMatch verification code. It is valid for 5 minutes. Do not share it. - AcadeXMatch`.
2. In MSG91: add the DLT entity, header and template; create an OTP/Flow template that maps the variable to `##OTP##`.
3. Set `SMS_PROVIDER=msg91`, `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`, `MSG91_SENDER`, and `MSG91_DLT_TE_ID` if MSG91 asks for it.
Until this is done, SMS options stay hidden and the API refuses to send.

### Email (Brevo or Resend) and deliverability checklist
* Brevo: *Senders, Domains & Dedicated IPs → Domains → add acadexmatch.com → authenticate* (adds DKIM and Brevo code TXT records in GoDaddy DNS); add sender info@acadexmatch.com; create an API key.
* DNS (GoDaddy): **SPF** — one TXT record on `@`, e.g. `v=spf1 include:spf.titan.email include:spf.brevo.com ~all` (merge with the existing Titan record; never two SPF records). **DKIM** — the records the provider shows. **DMARC** — TXT `_dmarc` = `v=DMARC1; p=none; rua=mailto:info@acadexmatch.com` (move to `quarantine` after a few weeks of clean reports).
* Webhook: Brevo → Transactional → Settings → Webhooks (or Resend → Webhooks) → `https://acadexmatch.com/api/email-events?key=<EMAIL_WEBHOOK_SECRET>`; events delivered, bounces, spam/complaint, blocked/invalid.
* Test copies of the site: `EMAIL_REDIRECT_TO=you@example.com` sends every message to one inbox.
* Admin console → Emails shows the outbox and can send a test email.

## 6. Background work
Runs inside the app process (`instrumentation-node.ts`), no extra worker to set up:
every minute the email queue (due messages and retries); every 10 minutes interview reminders, expiry
checks and reminders, job alerts and deadline reminders (each once per day where applicable, IST).
`ACAD_DISABLE_SCHEDULER=1` turns these off (for tests). Rate limits are kept in memory per process.

## 7. Tests (28 Oct 2026, local, MySQL/MariaDB)
| Suite | Result |
|---|---|
| `npx tsx tests/auth-unit.ts` (scrypt, policy, phone, OTP helpers, state cookie, ID-token claims and signatures, interview times) | all passed |
| `tests/auth-flows.mjs` against `tests/mock-providers.mjs` (real code paths: MSG91 API, Resend API, Google OIDC with PKCE) | 80/80 |
| end-to-end journeys (registration, institution, applications, interviews) | 27/27 |
| `tests/storage-flows.ts`, `tests/notice-parser.ts`, `tests/crawler.ts` | passed |
| `npm run test:seo` | passed |
| institution payment smoke test (mock Razorpay) | passed |

Run the integration suite:
```
node tests/mock-providers.mjs &
DB_…=… ACAD_DISABLE_SCHEDULER=1 AUTH_SECRET=<32+ chars> APP_URL=http://localhost:3500 \
EMAIL_API=resend EMAIL_API_KEY=test EMAIL_API_URL=http://127.0.0.1:3400 MAIL_FROM='AcadeXMatch <info@acadexmatch.com>' EMAIL_WEBHOOK_SECRET=webhook-secret-123456 \
SMS_PROVIDER=msg91 MSG91_AUTH_KEY=test MSG91_TEMPLATE_ID=t MSG91_API_URL=http://127.0.0.1:3400 \
GOOGLE_CLIENT_ID=test-client GOOGLE_CLIENT_SECRET=s GOOGLE_DISCOVERY_URL=http://127.0.0.1:3400/.well-known/openid-configuration \
npx next start -p 3500
EMAIL_WEBHOOK_SECRET=webhook-secret-123456 BASE_URL=http://localhost:3500 node tests/auth-flows.mjs
```
Not covered automatically: real Google/Microsoft/MSG91/Brevo accounts (need the production credentials), Microsoft end-to-end (claims and tenant rules are unit-tested), interview reminders end-to-end (time parsing is unit-tested).

## 8. Deployment
1. Download a backup first: admin console → *Backup & restore* → *Download backup* (all collections as JSON).
2. Add `AUTH_SECRET` (and any provider settings that are ready) to the Publish secrets. Save restarts the app.
3. GoDaddy → app → *Update Preview* (pull `main`), wait for the build, test the preview (sign in, sign up, apply).
4. *Publish to Live*. Check: sign in works for an existing account, `/register`, `/forgot-password`, `/account` → Security, an application by a test candidate, and the admin console Emails tab.
5. Watch the runtime log for `[AcadeXMatch] Configuration:` warnings and email failures.

## 9. Rollback
* Code: GoDaddy → *Rollback to previous version* (or redeploy the previous commit). All data written by the new code is additive; the previous version ignores the new fields and keys. Sessions created by the new version are digest-keyed, so after a rollback people sign in again once.
* Data: restore the backup from step 1 only if data was damaged (admin console → Backup & restore → import the file).
* Provider switches: removing `SMS_PROVIDER`, `GOOGLE_CLIENT_ID`, etc. hides that method immediately after the restart.

## 10. Manual acceptance checklist
- [ ] Existing user signs in with email and password (old password still works).
- [ ] New candidate registers with mobile number, receives the welcome + confirmation email, link confirms.
- [ ] Before confirming, applying shows “Please confirm your email address first” (when email is on).
- [ ] Apply → “Application Submitted Successfully” email; institution gets “New application”.
- [ ] Change application status → candidate email; schedule an interview → email; reminder arrives the day before and an hour before.
- [ ] Forgot password by email: link works once, old sessions signed out, “Password Has Been Changed” email.
- [ ] (After SMS setup) confirm mobile on Account → Security; sign in with SMS code; recover by SMS.
- [ ] (After Google/Microsoft setup) Continue with Google/Microsoft for a new address; link to an existing account from Security; existing email is not merged.
- [ ] Notification settings: switch off job alerts, unsubscribe link from an email works, history lists messages.
- [ ] Administrator sign-in asks for the emailed code.
- [ ] Mobile layout of /login, /register, /forgot-password, /account, /account/notifications.

## 11. Needs your accounts or approval
* `AUTH_SECRET` in GoDaddy secrets (recommended before publishing).
* Brevo domain authentication + API key (email is the base for verification, reset links and all notifications).
* MSG91 account + DLT registration (sender header and OTP template) for SMS.
* Google Cloud OAuth client and Microsoft Entra app registration.
* SPF/DKIM/DMARC records in GoDaddy DNS.
* Have a lawyer review `/terms` and `/privacy` (written from how the site actually works, but not legal advice).
