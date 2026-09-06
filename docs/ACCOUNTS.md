# Accounts and administration

## User routes

- `/signup`: the primary route for new players. It requires first name, last name, email and password. Sign-in is immediate; there is no confirmation email.
- Accounts must have both names before submitting or changing a pick. Admins can correct a legacy single-name account without changing its hidden member ID or linked competition records.
- `/login`: existing-member email/password login with a prominent registration panel for new players and organiser-assisted recovery instructions.
- `/dashboard`: the member home page, with owned entries, payment status, weekly deadline, rules, team directory and current fixtures. Its member navigation is Dashboard, Picks, Results and Standings.
- `/account`: the member hub. It shows the person’s name, payment and playing status, weekly deadline, current pick, a direct make/change-pick action, personal pick history, teams available this week and all unused teams remaining. When an account controls more than one competition entry, explicit full-name entry buttons such as `Rob O’Shea 1` and `Rob O’Shea 2` switch every panel to that individual entry. Entry creation, password changes and help also live here. Regular members reach it from the Account control in the header; staff can open it from Admin home.
- `/admin`: dedicated Admin home with direct cards and persistent controls for Entries & payments, Members & roles, Manage picks, Results, Settings and Overview.
- `/help`: public searchable member guide with expandable answers for signup, payments, selections, deadlines, results, standings, rollovers, passwords and phone installation.
- `/privacy`: public privacy information covering member names, email addresses, password storage, competition records and access.
- `/reset-password#token=...`: one-time password reset. Links last one hour.

## Owner setup

Set `OWNER_EMAIL` and a random 32-byte `OWNER_SETUP_TOKEN` in the server environment before launch. Open `/signup#setup=TOKEN` privately and register the reserved email. Public signup cannot create this owner without the token; no other email receives owner privileges. Once registered, ownership cannot be reassigned through the API. Remove the setup environment variable after registration when convenient.

Rob's private setup file is outside the repository at `/Users/Rob/.config/nfl-lms/Owner account setup.md`. No credentials belong in project records, commits or chat.

## Admin workflows

Use Entries to add people individually, record the current fee as paid/unpaid and remove entries. The owner alone can use the legacy spreadsheet importer. Use Members & roles to connect an entry to a registered account explicitly. An email match never automatically transfers an entry. A member's automatically created unpaid entry can be removed if an older manual entry is connected instead.

The owner sees account-entry linking. Admin accounts have a simpler Members page and do not see that owner control; they retain member password resets and the day-to-day entries, payments, picks and results tools. The Members page does not display an admin activity history.

The owner can promote/demote admins and disable/enable other accounts. These actions sign the affected user out. Admins can generate resets for members; only the owner can generate resets for admins. Neither can generate an owner reset through the website. Trusted database access is required for owner recovery. Users can change their own password by entering the existing one.

Every registered account has an internal UUID that is never shown as a member-facing identifier. Owners can correct any account name; admins can correct their own name and member/admin names but cannot rename the owner. Name edits require separate first-name and last-name values and update every entry linked to that account. Account ID, email, roles, payments, picks and history remain unchanged. Account-owned entry names are read-only in Entries & payments and must be corrected in Members & roles.

Staff enter the admin area from the Admin control in the top header. The same position becomes Exit admin inside `/admin`. Account and sign-out controls no longer appear as a separate toolbar above page content.

Admins retain result fetching/manual scores, pick overrides, new rounds and rollover/payment controls. Entries & payments uses a compact number-sized Label field and shows an explicit Mark paid action on every unpaid row; its Paid control can correct a payment back to unpaid. Manage picks lists every entry, including owner/admin entries and entries that are unpaid or already eliminated. An unpaid row has the same Mark paid action, while paid active entries are labelled Paid. Staff can then add, replace or clear a selection for any entry and week. The server accepts an authorised staff change after the normal member cut-off, records whether the deadline was overridden, and keeps bye teams and teams already used since the last reset invalid.

Spreadsheet import is shown only to the owner. Admins can manage registered members and individual entries, but bulk spreadsheet import remains an owner-controlled legacy tool because imported rows do not create passwords; new members should register themselves.

The Admin home includes a searchable Admin guide for weekly operations and troubleshooting. It covers the complete entries, payments, roles, accounts, picks, results, rollover, rounds, announcements, settings and backup workflow. Staff can open the separate member guide from the Admin guide when helping a player. Member announcement settings publish a highlighted shared notice for payment reminders, deadline changes, important messages or general competition updates.

## Deadlines and payments

All member pick creation, changes and clears lock at the first kickoff of the selected week minus one hour. The server clock is authoritative. Public/member dashboards show the deadline in Europe/London time. Owner/admin overrides bypass that lock for a member who cannot sign in or for a genuine correction. Staff review the numbered entry, week, old selection and new selection before saving; the change is immediate and audited.

A new account/entry starts unpaid. A member can create multiple entries from Account; each is numbered beneath their full name and keeps independent payment status, picks, history and available-team list. Admin must mark every entry paid separately before it can pick. Current-round and rollover payments remain separate. Each rollover requires a new payment, and unpaid entries cannot pick. Existing losing picks still eliminate paid members.

Account role and payment status are independent. Owner and admin entries appear in Entries & payments and use the same Paid/Unpaid control as member entries. Marking a staff entry paid never changes its account permissions.

The quiet Refresh icon appears at the top right on Mac/PC, tablet and phone. In the admin area it waits for pending changes to finish saving before it reloads the app. The NFL LMS header logo is also a home link: it opens the member Dashboard when signed in and the public home page when signed out.

## Runtime and verification

Run `npm test` for API, SQL and domain regression checks. Run `npm run build` after changing shared logic or `lib/account-client.js`; the build inlines both into the standalone HTML. `PORT=3001 NODE_ENV=development node scripts/dev.js --demo` uses an isolated in-memory Postgres emulator. Its owner is `owner@example.test` with setup token `local-owner-setup`; these values have no production authority.

Production uses the normal public database schema. Preview uses `DB_SCHEMA=nfl_accounts_preview`, isolated from real entries and accounts. Never point test/seed scripts at the production schema. Legacy ADMIN_KEY and player-code authentication are disabled by the live handlers.

Authentication uses salted scrypt, opaque hashed sessions, secure HttpOnly cookies, origin/custom-header checks and database-backed throttling. Passwords must contain 7-256 characters. Email addresses are unverified by design. No automatic email or online payment integration is configured.
