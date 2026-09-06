# Verification — 6 September 2026

## Source preservation

- Original source: GitHub `roboshea-byte/nfl-lms`, commit `328aa91ce7c09b609807e03bb9fc70a9fc4f96f1`.
- Automated comparison confirms the complete original stylesheet is retained verbatim, with only additional remote/player styles appended.
- All 32 teams, 272 games, dates, ESPN IDs and logo URLs are unchanged.
- The shared rules function retains the original behaviour except for the requested mandatory rollover team reset. The build inlines the shared sources into `index.html` and publishes only the generated page in `public/`.

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

## Rollover change — 6 September 2026

- Renamed public rules, dashboard events, results help, pick-history legend and organiser settings to Rollover. All players return and prior used teams become available from the following week. Prior picks remain in history.
- Existing false settings cannot disable the reset; API responses, saves and local hydration use the new rule. Legacy identifiers remain compatible with saved data.
- Rules list text and numbered badge text reduced by 20%.
- All 18 automated tests pass, covering earlier eliminations, old saved settings, renewed team availability, reuse rejection after the reset, and a subsequent rollover.
- Browser checked at 758 × 890: rules text computes to 11.2px versus the original 14px; updated rollover copy is visible, with no horizontal overflow.

## Rollover re-entry payments — 6 September 2026

- Each rollover requires a new fee. Unpaid players are excluded from standings, winner eligibility and server-validated picks, even with a preselected winner or missed-pick survival enabled. A rollover cannot declare an immediate winner merely because one player has repaid.
- Separate per-entry payment records persist in the new JSONB column, with backward-compatible handling of older saves and public exports. Only organiser writes can confirm fees. Confirmed fees accumulate in the current round pot.
- All 20 tests pass on Node 24, including repeated repayments, unpaid exclusion, payment validation/authorisation, SQL persistence, and score corrections.
- Isolated browser test advanced the server clock to before Week 2: all three players became unpaid/out after Week 1 rollover, while the original £60 remained in the pot. The organiser payment button saved Alice’s new £20 fee; a separate player browser showed In, all 32 teams available and a £80 pot. Confirming a team saved the Week 2 pick. At 390 × 844, the unpaid screen showed the new fee requirement and no horizontal overflow. No live entries were used for these checks.

## Compact responsive layout — 6 September 2026

- Reduced header title/logo/stats and hero typography, padding and copy. Hero title uses 32px on phones, 38px on tablets and 44px on desktop; hero stats use two columns on phones and four on wider screens.
- Removed the original 120% body zoom at widths up to 900px. Header scrolls away on phones and short landscape screens; buttons and navigation remain usable.
- Fixed phone overflow in Picks and Entries with independently scrollable tables. Results stack teams, scores and fixture details on smaller screens.
- Browser checks at 320, 390, 430, 768, 844 (landscape), 1024 and 1440px: home, dashboard, picks, results and history stay within the viewport. Checked organiser Entries/Settings/Results and the 390px player page with 32 team buttons. Phone home hero is about 381px high at 390px width, with both primary actions visible above the fold.

## iPhone Safari clipping report — 6 September 2026

- Rob supplied an iPhone Safari screenshot showing enlarged content panned/clipped on the left. A fresh WebKit session did not reproduce that zoom state; the organiser password field was confirmed at 11px, a likely automatic input-zoom trigger.
- Mobile editable fields now use at least 16px; text-size-adjust is fixed at 100%. Mobile document width is constrained and horizontal page overflow clipped while navigation/table containers remain scrollable. User pinch zoom remains enabled.
- WebKit iPhone emulation exposed 16px of transient document overflow on the 320px Settings screen after rotation; the width constraint fixed it. Verified all organiser/public views at 320, 393, 430, 768 and 852px landscape after opening/filling/closing the organiser modal, with no document overflow, horizontal visual offset or sub-16px editable fields. Chromium check and all 20 existing tests pass.
- These are browser-engine checks, not a physical iPhone test. A fresh WebKit page already fitted before the fix, so the exact on-device zoom state remains unconfirmed.

## Persistent iPhone clipping investigation — 6 September 2026

- Rob confirmed the clipping persists even in a new Private Safari tab. Live HTML is current, with no browser errors in fresh WebKit emulation. The exact on-device cause remains unresolved.
- Removed every CSS zoom declaration, including the original body zoom of 1.2, rather than relying on breakpoint overrides. Preservation test allows that explicit deletion and still checks the rest of the original CSS.
- Added an opt-in `?display-check=1` panel to copy screen/viewport/visual zoom/body bounds/browser version and a build marker. It appears only via that query; measurements stay local unless the user copies them, and contain no account or entry details.
- WebKit checks pass at 320–852px including landscape. Verified the diagnostic panel shows accurate measurements and closes correctly; all 20 tests pass. Physical-device measurements are needed before calling the reported problem resolved.

## Hero annotations — 6 September 2026

- Removed the hero stripe overlay, kept the full Last Man Standing title on one mobile line with responsive type, applied Rob’s exact replacement description and expanded the final-week date to Sunday 10 Jan 2027.
- WebKit and Chromium checks at 320, 375, 393, 430, 758 and 1440px confirmed a single-line title without overflow, no stripe pseudo-element, exact description text and the full final-week date.

## Accounts release: 6 September 2026

Application commit 44793c3 deployed to production as dpl_6yDKwwov4SdJHb9WcMxqYU8PHSj4 (Ready).

21 tests pass on Node 24: authentication, owner reservation, role boundaries, CSRF checks, session invalidation, reset expiry/single use, manual entry ownership, payment eligibility, pick persistence, exact deadline locking, database operations and rollover rules. npm audit --omit=dev reports zero vulnerabilities.

Chromium browser flows passed locally and against a protected Vercel preview with a separate Neon schema: owner setup, immediate member signup, unpaid dashboard, admin payment activation, pick/change persistence, owner role promotion and revoked sessions. Layout checks passed at 320, 393, 430, 768 and 1440 CSS pixels. WebKit iPhone signup fits with readable form controls. Preview fixture accounts were removed after verification.

Production read-only/denied-request checks confirm account service availability, empty real competition, owner email protected against public signup, admin API protection and unauthenticated admin redirects. Chromium and WebKit production home/signup checks confirm the Week 1 deadline is 10 September at 00:20 UK time and there is no document overflow at the tested widths. Safari and Chromium use slightly different locale punctuation; both show the same date and time.

No production owner password was generated or requested. Rob completes owner registration through the private setup instructions.

## Combined member navigation - 6 September 2026

- Dashboard is now the home page and retains the 32-team grid. It combines the previous home content with the competition overview and weekly deadline.
- Member navigation is Dashboard, Picks, Results and Standings. Picks includes pick history, while Standings separates active, awaiting-payment and eliminated entries.
- The account toolbar was removed. Staff use the header Admin control and the header shows Exit admin inside the admin area. The internal admin tools remain together on `/admin`.
- Password signup, reset and change flows now enforce 7-256 characters in both browser forms and the server.
- All 21 automated tests pass. Isolated Chromium checks passed at 390px for public Dashboard, Picks, member signup, unpaid and paid member Picks, owner admin entry/exit and persisted pick submission. No document overflow or browser errors were found.

## Wider desktop and mobile tab bar - 6 September 2026

- Wide desktop pages now use up to 1,650px instead of 1,320px. Signed-in member pages use up to 1,125px instead of 900px, an exact 25% increase.
- Desktop navigation uses bordered button treatments with a stronger gold active state. At 600px and below, Dashboard, Picks, Results and Standings become a fixed four-icon bottom tab bar with safe-area padding.
- Dashboard fixture cards use one 54px height. Team names fit at the supplied 920px Mac viewport, and every two-line UK kick-off time is aligned 9px from its card's right edge.
- Chromium checks passed at 390, 920, 1,440 and 1,920px. All four mobile tabs remain interactive, the footer can scroll fully above the fixed bar, and no document overflow or browser errors were found. All 21 automated tests pass.

## Pick history team badges - 6 September 2026

- Owners and admins now receive unmasked team selections in their signed-in Picks history, matching their existing permission to manage every pick in the Admin area.
- Ordinary members continue to see their own selection immediately as a team badge. Other members' selections remain locked until the relevant game kicks off.
- The account/API regression test covers owner and admin visibility alongside member privacy. An isolated browser flow confirmed both team badges for the owner, the member's own badge, the other player's lock and zero browser errors.
