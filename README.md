# NFL Last Man Standing — 2026

The original competition app, with its original layout, fonts, colours, 32 teams, 272 fixtures and shared rules engine. Vercel serves the page and six Node.js API endpoints; Postgres holds the competition. Paid players pick through private `/play/<code>` links, with no accounts or login system.

## Vercel and Postgres setup

1. In Vercel, choose **Add New → Project → Import `roboshea-byte/nfl-lms`**. Use framework preset **Other**, and the repository root (`/`, shown as `.` in some interfaces). Select the branch containing this conversion. Deploy once. API calls will fail until the database is configured; the site displays “Competition unavailable”.
2. In the project, choose **Storage → Create Database → Neon (Postgres)**. Select the free database plan and a region closest to London, such as London (`eu-west-2`) or Frankfurt (`fra1`), where available. Connect it to the project and enable the required environments. The integration supplies `DATABASE_URL`; this app also accepts `POSTGRES_URL` if supplied instead. Use the pooled connection string and retain its SSL settings.
3. In **Settings → Environment Variables**, add `ADMIN_KEY` with a long private passphrase of the organiser's choosing, for **Production**, **Preview** and **Development**. Never put the passphrase or database URL in the repository. Use a separate database/branch for previews if preview changes should not affect the live competition.
4. Choose **Deployments → Redeploy** so the environment variables are picked up. Open the site; the schema and defaults are created on the first API request. No manual migration is required.
5. Click the padlock, enter the passphrase, add entries on **Entries** (or import a spreadsheet), mark them paid, and use **Copy link** or **Copy invite**. The app copies the message; the organiser sends it. Players can confirm or change their picks through their individual links.
6. Optionally, use **Settings → Domains** to attach a custom domain.
7. For local development, run `npm install`, then `vercel env pull .env.local` and `vercel dev` using the Vercel CLI. Alternatively, use `npm run dev` with `DATABASE_URL` (or `POSTGRES_URL`) and `ADMIN_KEY` in `.env.local`.

Live competition: https://nfl-lms.vercel.app. Vercel is connected to this repository and its dedicated Neon database in London. Credentials are managed separately and are never bundled with the source.

## Build and development

- `npm run build` inlines `lib/logic.js` and `lib/schedule.json` into the committed `index.html`, then copies only that page to the generated `public/` output directory. Vercel runs this build through `vercel.json`. Source files, tests and database SQL are not published as static assets.
- `npm test` uses Node's test runner, an isolated transactional memory store and a PostgreSQL emulator (`pg-mem`) to exercise the real handlers and SQL helper. It does not need or mutate a live database.
- `node scripts/dev.js --demo` starts an isolated local preview with fictional entries at `http://localhost:3000`. Its public sample organiser passphrase is `preview-only`, and the sample player link is `/play/alice12345`. The sample data exists only in memory and resets on restart. This mode is never used by Vercel.
- `npm run dev` uses real Postgres; it does not fall back to demo data. The local server binds to `127.0.0.1`.

Node 24 is selected in `package.json`: the first live build warned that Node 20 deployments will stop building on 1 October 2026, during this competition. The unchanged application and rules are tested on the supported runtime. The API uses the permitted `pg` driver with a small connection pool, parameterised queries and transactions.

## How the modes work

When `/api/state` returns a competition, **REMOTE** takes priority. Public viewers see the existing read-only screens; the padlock opens a passphrase modal. The passphrase is stored in localStorage and sent only in `x-admin-key` on organiser API requests. Exiting organiser mode removes it. No passphrase or player code is included in public state.

The original **file://**, **HOSTED** (Claude artifact) and **STATIC** (baked page) modes remain. A file opened directly still works without a server. A remote competition whose API is unavailable displays an error rather than pretending local edits were saved remotely.

Remote organiser edits save after a 500 ms debounce. Picks and ESPN results use dedicated endpoints. The gold tile shows **Saving…**, **✓ Live**, or **Save failed**. Clicking a failure retries an ordinary save; a conflict explains how to export unsaved work and reload. Writes are ordered in the browser and serialised in the database. A revision check detects competing organiser edits without treating players' independent picks as conflicts. Do not close a page while it is saving; the browser warns about unfinished writes.

Viewers and personal pages poll every 45 seconds. Public picks become visible when their specific game starts, even if no score has been entered. `updatedAt` is an opaque content revision, including visibility changes at kick-off. Countdown clocks use server time plus elapsed monotonic browser time, rather than the phone's wall clock; the server always makes the final deadline decision.

## Player links and deadlines

Each entry receives a server-generated 10-character URL-safe code. Existing codes survive entry edits and backup restoration into the same database; new entries receive fresh codes. `/play/<code>` and `?c=<code>` open the player view. An unpaid player gets a payment-pending message. Unknown codes get a friendly missing-link message.

Players select a team and explicitly confirm before anything is saved. Validation follows the brief's order: unknown code, unpaid, wrong round/week, eliminated, locked, bye, used team. An entry's first pick must be made before the week's first game. An existing pick can change to another unstarted game until the existing selection's game starts. Clearing a pick after the week begins prevents a fresh pick. Organisers can override deadlines, eligibility, used-team restrictions and byes, while IDs, weeks and teams must still exist.

Personal links are bearer credentials: anyone with one can act for that entry. Share them privately. API responses disable caching, and the page uses `Referrer-Policy: no-referrer` so ESPN logos and fonts do not receive the personal URL. Full organiser JSON backups contain private entry details and codes; store them privately. “Download live page” in remote mode strips codes/emails and masks unstarted picks before embedding public state. Masked picks in a downloaded static snapshot require a new export to reveal them later.

## Data and API

`db/schema.sql` is bootstrapped idempotently by `api/_db.js`. Tables are `settings`, `rounds`, `entries`, `picks`, and `results`. Each write locks the singleton settings row, loads a consistent competition, validates and persists changes in one transaction. Reads use a repeatable-read transaction. Database errors are returned without connection details.

| Route | Purpose |
| --- | --- |
| `GET /api/state` | Public masked state, or full state with a valid organiser header |
| `GET /api/me?code=...` | That player's entry and all their picks, plus public state |
| `POST /api/pick` | Player pick or clear, validated in a transaction |
| `POST /api/admin/pick` | Organiser override |
| `POST /api/admin/state` | Transactional settings, entries, results and rounds replacement/upsert |
| `POST /api/admin/results/fetch` | Fetch the selected week's ESPN scoreboard server-side |

All API responses include `serverTime`, including errors, and `Cache-Control: no-store`. Invalid organiser credentials on `/api/state` receive public state; organiser writes return 401.

The state endpoint preserves existing picks during ordinary saves. For the original backup restore, demo and reset controls, an optional organiser-only `replacePicks` object replaces picks atomically with the other data. An optional `baseRevision` prevents stale organiser saves; the client always supplies it. Removed entries cascade to picks. Removed results and rounds are deleted so clear-results and undo-round still work.

ESPN scores update only when the organiser presses **Fetch live scores from ESPN**. They are then shared at the next viewer poll; no automatic scoreboard cron is configured.

## Verification

Automated checks cover the original schedule and rules function byte-for-byte, player validation and deadlines, private data masking and timed reveal, admin authentication, code generation, removal and cascading picks, backup replacement, ESPN mapping, concurrent submissions, and schema/upsert/read-back through PostgreSQL emulation.

Browser acceptance uses an isolated local competition. The production setup and live verification are recorded in `docs/VERIFICATION.md`.

Official references: [Vercel Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), [Vercel Postgres integrations](https://vercel.com/docs/postgres), [node-postgres transactions](https://node-postgres.com/features/transactions).
