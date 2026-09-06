# Accounts and administration

## User routes

- `/signup`: first name, last name, email and password. Both name fields are required. Sign-in is immediate; there is no confirmation email.
- `/login`: email/password login and organiser-assisted recovery instructions.
- `/dashboard`: the member home page, with owned entries, payment status, weekly deadline, competition overview, rules, team directory and password changes. Its member navigation is Dashboard, Picks, Results and Standings.
- `/admin`: dedicated Admin home with direct cards and persistent controls for Entries & payments, Members & roles, Manage picks, Results, Settings and Overview.
- `/reset-password#token=...`: one-time password reset. Links last one hour.

## Owner setup

Set `OWNER_EMAIL` and a random 32-byte `OWNER_SETUP_TOKEN` in the server environment before launch. Open `/signup#setup=TOKEN` privately and register the reserved email. Public signup cannot create this owner without the token; no other email receives owner privileges. Once registered, ownership cannot be reassigned through the API. Remove the setup environment variable after registration when convenient.

Rob's private setup file is outside the repository at `/Users/Rob/.config/nfl-lms/Owner account setup.md`. No credentials belong in project records, commits or chat.

## Admin workflows

Use Entries to add/import people manually, record the current fee as paid/unpaid and remove entries. Use Members & roles to connect an entry to a registered account explicitly. An email match never automatically transfers an entry. A member's automatically created unpaid entry can be removed if an older manual entry is connected instead.

The owner sees account-entry linking and the recent admin activity log. Admin accounts have a simpler Members page and do not see those owner controls; they retain member password resets and the day-to-day entries, payments, picks and results tools.

The owner can promote/demote admins and disable/enable other accounts. These actions sign the affected user out. Admins can generate resets for members; only the owner can generate resets for admins. Neither can generate an owner reset through the website. Trusted database access is required for owner recovery. Users can change their own password by entering the existing one.

Staff enter the admin area from the Admin control in the top header. The same position becomes Exit admin inside `/admin`. Account and sign-out controls no longer appear as a separate toolbar above page content.

Admins retain result fetching/manual scores, pick overrides, new rounds, rollover/payment controls and import/export tools. The owner can review the resulting audit trail in Members & roles.

## Deadlines and payments

All member pick creation, changes and clears lock at the first kickoff of the selected week minus one hour. The server clock is authoritative. Public/member dashboards show the deadline in Europe/London time. Admin overrides bypass that lock.

A new account/entry starts unpaid. Current-round and rollover payments remain separate. Each rollover requires a new payment, and unpaid entries cannot pick. Existing losing picks still eliminate paid members.

## Runtime and verification

Run `npm test` for API, SQL and domain regression checks. Run `npm run build` after changing shared logic or `lib/account-client.js`; the build inlines both into the standalone HTML. `PORT=3001 NODE_ENV=development node scripts/dev.js --demo` uses an isolated in-memory Postgres emulator. Its owner is `owner@example.test` with setup token `local-owner-setup`; these values have no production authority.

Production uses the normal public database schema. Preview uses `DB_SCHEMA=nfl_accounts_preview`, isolated from real entries and accounts. Never point test/seed scripts at the production schema. Legacy ADMIN_KEY and player-code authentication are disabled by the live handlers.

Authentication uses salted scrypt, opaque hashed sessions, secure HttpOnly cookies, origin/custom-header checks and database-backed throttling. Passwords must contain 7-256 characters. Email addresses are unverified by design. No automatic email or online payment integration is configured.
