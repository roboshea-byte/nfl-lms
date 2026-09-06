# Verification — 6 September 2026

## Source preservation

- Original source: GitHub `roboshea-byte/nfl-lms`, commit `328aa91ce7c09b609807e03bb9fc70a9fc4f96f1`.
- Automated comparison confirms the complete original stylesheet is retained verbatim, with only additional remote/player styles appended.
- All 32 teams, 272 games, dates, ESPN IDs and logo URLs are unchanged.
- The extracted rules function matches the original text exactly. The build inlines the shared sources into `index.html` and publishes only the generated page in `public/`.

## Automated checks

`npm test`: 16 passing tests on Node 25.6.1, and the full suite also passes on the deployment runtime, Node 20.20.2. Includes ordered pick rejection, before/at/after kick-off, changes and clears, public hiding and timed reveal, private data stripping, admin authentication, code generation/preservation, stale admin revisions, backup replacement, removal of entries and picks, result deletion, ESPN mapping, concurrent pick submission, wipeouts, missed picks, ties, winners, season splits and new rounds.

The real SQL helper and API handlers also run against `pg-mem`: bootstrap, repeated reads, generated codes, pick upserts and cascading entry deletion pass. This is PostgreSQL emulation, not a live Neon test. Production dependencies reported no known vulnerabilities via `npm audit --omit=dev`.

## Browser acceptance

Used an isolated local development server with fictional data. No live entrants were changed and no invites or chase messages were sent.

- Public home retains the original navy, red and gold design, fonts, spacing, branding and tabs. Entries and Settings are hidden for public viewers.
- Padlock opens the existing-style passphrase modal; valid organiser authentication reveals the full application and Live tile.
- Added an unpaid sample entry in Entries. Autosave created its private code; the row shows both copy buttons and the payment note.
- Personal page at 390 × 844 has no horizontal overflow, body zoom 1, no navigation tabs, greeting, status, pot, weeks and team cards.
- Selecting a team leaves the saved pick unchanged until Confirm. Confirm saved Kansas City; Change pick followed by Confirm saved Buffalo. The personal response and season history updated.
- Advanced the browser's synchronised server clock for the display test: the pick became locked and the Change/Confirm controls disappeared. Server-side deadline enforcement was tested separately with an injected clock.
- Unpaid personal link shows Payment pending and no team selection. An unknown code shows the organiser-help message.
- Picks tab shows Not picked yet for the remaining eligible paid entries. The chase message contains Week 1, the first UK kick-off, and the expected names; the unpaid entry is excluded.
- Remote public export contains neither the sample personal code nor the sample email; unstarted picks remain masked.
- A server-side ESPN fetch completed successfully. No games had started, so no fabricated live scores were shown.
- Saved an isolated sample score at 11:21:48 BST. A separate public Results tab received it through its normal poll by 11:22:23 BST, within 35 seconds.
- Direct `file://` opening remains editable, with REMOTE false, SHARED false and the original 1.2 zoom.

## Initial deployment status (before production setup)

No Vercel project appeared in the connected account during the read-only check. No live project/database was provisioned, no production secrets were set, no GitHub push was made and no deployment was published. Follow the README to configure Vercel, Postgres and ADMIN_KEY, then smoke-test the real database connection and a private test entry before inviting entrants.

HOSTED publication requires the Claude artifact environment and was not exercised here. Its original code path is retained. STATIC download code is retained and remote public export sanitisation was checked; publishing an exported snapshot to a third-party static host was not performed.

## Local workspace note

The Documents workspace is backed by iCloud. During verification, iCloud offloaded source and dependency files and blocked reads. The project folder was set to Keep Downloaded. For this Mac, `node_modules` points to the ignored local dependency cache `/Users/Rob/Library/Caches/nfl-lms-runtime/node_modules`; an ignored `.node_modules-icloud/` preserves the initially installed dependency directory. These machine-specific directories and the symlink are not committed. Fresh clones use ordinary `npm install`.


## Production verification — completed 6 September 2026

- Live URL: https://nfl-lms.vercel.app
- GitHub `main` and `codex/postgres-player-links` contain the application. Vercel is linked to `roboshea-byte/nfl-lms`; main publishes production and the feature branch publishes previews.
- Vercel project: `nfl-lms`, project ID `prj_04fpq2lHVLireiSHPdpF2A7xNYmr`.
- Dedicated Neon resource: `nfl-lms-db`, Free plan `free_v3`, London `lhr1`, authentication product disabled (the app uses its own personal links).
- Database variables and ADMIN_KEY are configured for Production, Preview and Development. Environment files are ignored and restricted locally; no credentials were committed or included in this record.
- Node 24 replaces the brief's Node 20 because Vercel's first build explicitly warned that Node 20 builds stop on 1 October 2026. Functions run in London alongside Postgres. Seventeen automated tests pass on Node 24, including the added idle-pool-disconnection regression test.
- Live API verification passed: public/private state separation, actual Postgres writes, unpaid rejection, paid picks, pick changes, used-team rejection, unauthorised admin-write rejection, and public masking of unstarted picks.
- Server-side ESPN fetch succeeded and returned zero started games; no artificial live scores were inserted.
- Live browser: organiser passphrase modal authenticated successfully. At 390 × 844, personal view has zoom 1, no horizontal overflow and no navigation tabs. Selecting a new team left the saved pick unchanged until Confirm; Confirm saved the replacement through the production API.
- Temporary test entry and cascading picks were removed. Final public API response: HTTP 200, zero entries, zero picks, Round 1, £20 fee, admin false, Cache-Control no-store.
- Production deployment `dpl_dyTBDzZrKnmqLQt6rSf37D5Tu7tz` / commit `983340b` was Ready and owned the production aliases during the live checks. A subsequent documentation-only commit records these results.
- Production 5xx log scan over the preceding 15 minutes completed with zero records. No recurring monitor or external log drain was added.

An initial direct database probe exposed an idle Neon connection closing unexpectedly. The pool now handles idle errors without crashing or dumping connection objects into logs, and explicit SSL certificate verification is retained.
