# Codex prompt: NFL Last Man Standing on Vercel + Postgres

Copy everything below the line into Codex, run from the root of the `nfl-lms` repo (https://github.com/roboshea-byte/nfl-lms). The repo already contains the finished single-file app (`index.html`), which is the exact look and behaviour to keep.

---

You are working in the `nfl-lms` repository. It currently contains a finished single-file web app, `index.html`, for running an NFL Last Man Standing competition for the 2026 season. The app is complete and the design is final. Your job is to turn it into a Vercel-hosted app backed by Postgres so that paid players can enter their own picks via a personal link, without a login system, while keeping the app looking and behaving EXACTLY as it does now. Do not redesign anything. Do not change colours, fonts, spacing, copy, layout, tab names or component styling. Reuse the existing HTML, CSS and JavaScript wherever possible; refactor rather than rewrite.

## 1. Read the existing app first

Open `index.html` and study it fully before writing any code. Key facts about it:

- It is one file: CSS in `<style>`, then `<script>` blocks. The first script defines `const SCHEDULE = {...}`, the full 2026 NFL regular season (32 teams with colours and ESPN logo URLs, 272 games across 18 weeks with ISO kick-off times and ESPN game ids). Keep this data exactly as is.
- Then a `<script id="lms-state" type="application/json">` tag holding embedded state (currently `null`).
- Then the app script. It begins with a shared rules engine `createLMSLogic(SCHEDULE)` returning: `gamesByWeek, teamGame, teamResult, weekSettled, weekHasResults, currentRound, roundEndWeek, defaultWeek, isPickLost, computeRound, usedTeams, aliveAtWeek, isAliveForWeek, kickoff, weekFirstKickoff`. Every function takes the state object `S` as its first argument so it can also run in Node. Extract this into `lib/logic.js` (CommonJS export plus a browser global) and use the same file on the server. Do not change its behaviour.
- The state object shape is:
  ```
  S = {
    settings: { fee:20, tieRule:'loss'|'survive', wipeoutResetTeams:false, missedPick:'eliminate'|'survive' },
    entries: [ { id, name, label, email, paid, created } ],
    picks:   { [entryId]: { [week]: 'KC' } },        // team abbreviation per week
    results: { [espnGameId]: { hs, as, final } },     // home score, away score, final flag
    rounds:  [ { n:1, startWeek:1, endWeek:null, winnerIds:null } ],
    ui:      { view, week },
    updatedAt
  }
  ```
- The app has these modes already: local file (full edit, localStorage), `HOSTED` (Claude artifact viewer) and `STATIC` (a baked copy on a plain web host, read-only viewers, admin toggle via the padlock, "Download live page"). Keep those code paths working but add a new `REMOTE` mode that takes priority whenever `/api/state` responds.
- Views (tabs): Home, Dashboard, Picks, Results, Pick History, Entries, Settings. Read-only viewers (`body.ro`) never see Entries or Settings, and elements with class `edit` are hidden.
- Picks of other players are hidden from viewers until that game has kicked off (`visiblePick` returns `'HIDDEN'`, rendered as a padlock). The rules engine already tolerates the string `'HIDDEN'` in `S.picks`.
- Logos are hotlinked from ESPN (`a.espncdn.com`). Fonts are Oswald and Inter from Google Fonts. SheetJS is loaded from cdnjs for spreadsheet import and the import template. Keep all of that.

## 2. Competition rules (already implemented, do not alter)

- £20 per entry (configurable in Settings). One person can hold several entries, distinguished by a label. Pot = entries x fee.
- Each entry picks one NFL team per week to win their game. Win = through. Loss = out. Tie = out by default (setting). No pick when the week settles = out by default (setting).
- Each team can be used only once per round by an entry.
- A week is "settled" when every game in it has a final result. Missed-pick eliminations and the wipeout check happen only when the week settles; a lost pick eliminates as soon as that game is final.
- Wipeout: if every remaining player loses in the same week, everyone comes back in, including players eliminated in earlier weeks. Used teams still count by default (setting to reset them).
- Winner: exactly one player survives a settled week. If more than one is still in after Week 18, the pot is shared. After a winner, the admin can start a new round from the next week; that resets everyone to "in" and clears used teams.

## 3. Target architecture

- Vercel project deployed from this GitHub repo. Static `index.html` at the root. Serverless functions under `api/` (Node 20, CommonJS or ESM, your choice, but keep it dependency-light).
- Database: Postgres via the Vercel Marketplace (Neon). Use the `@neondatabase/serverless` driver (or `pg` if you prefer) reading the connection string from `DATABASE_URL` / `POSTGRES_URL` (support both names, Neon's Vercel integration sets `DATABASE_URL`).
- Admin authentication: a single passphrase in the env var `ADMIN_KEY`. The admin page asks for it once, stores it in localStorage, and sends it as the `x-admin-key` header. Compare with a constant-time comparison. There are no user accounts of any kind.
- Player authentication: each entry has a random 10-character URL-safe `code`. The player's personal link is `https://<domain>/play/<code>`. The code is the only credential. Codes are generated server-side when an entry is created and are never included in public responses.

### 3.1 Schema

Create `db/schema.sql` and a small `api/_db.js` helper that runs it idempotently on first request (`CREATE TABLE IF NOT EXISTS`), so the admin does not need to run migrations by hand.

```
settings (id int primary key default 1, data jsonb not null, updated_at timestamptz default now())
rounds   (n int primary key, start_week int not null, end_week int, winner_ids jsonb)
entries  (id text primary key, code text unique not null, name text not null, label text default '',
          email text default '', paid boolean default false, created_at timestamptz default now())
picks    (entry_id text references entries(id) on delete cascade, week int not null, team text not null,
          made_at timestamptz default now(), primary key (entry_id, week))
results  (game_id text primary key, hs int, as_ int, final boolean default false, updated_at timestamptz default now())
```

Seed `settings` row 1 with the defaults above and `rounds` with `(1, 1, null, null)` if empty.

### 3.2 API

All responses are JSON. Include `serverTime` (ISO) in every response so the client can lock deadlines against the server clock, not the phone's.

- `GET /api/state` (public). Returns `{ settings, entries, picks, results, rounds, updatedAt, serverTime, admin:false }`. Entries are stripped to `{ id, name, label, paid }`. Any pick whose game has not kicked off yet (compare `SCHEDULE` game date with server time) is returned as the string `'HIDDEN'`. With a valid `x-admin-key` header, return everything unstripped, all picks visible, plus `admin:true` and each entry's `code`.
- `GET /api/me?code=...`. Returns `{ entry:{id,name,label,paid}, picks:{week:team}, state:<public state as above>, serverTime }`. Unknown code returns 404 with `{ error:'unknown_code' }`.
- `POST /api/pick` body `{ code, week, team }` (`team: null` clears the pick). Validate on the server, in this order, returning 400 with an `error` code and a plain-English `message`:
  1. `unknown_code` - no entry with that code.
  2. `unpaid` - `entry.paid` is false ("You're not marked as paid yet, contact the organiser").
  3. `bad_week` - week outside the current round (`rounds` last row: `start_week` to `end_week || 18`).
  4. `eliminated` - `isAliveForWeek(S, computeRound(S), week, entry.id)` is false.
  5. `locked` - the entry's existing pick for that week has already kicked off, OR the week's first game has kicked off and the entry has no pick yet (once the week starts you can't make a fresh pick), OR the chosen team's game has already kicked off.
  6. `bye` - the team is not playing that week.
  7. `used` - `usedTeams(S, entry.id, round, comp, week)` contains the team.
  Then upsert into `picks` and return the same payload as `/api/me`.
- `POST /api/admin/pick` body `{ entryId, week, team|null }`, admin only, no validation beyond existence (the organiser can override anything).
- `POST /api/admin/state` body `{ settings, entries, results, rounds }`, admin only. Upserts everything in one transaction. Entries not present in the body are deleted (cascading their picks). New entries (no `code` on the server) get a code generated. Returns the full admin state.
- `POST /api/admin/results/fetch` body `{ week }`, admin only. Server-side fetch of `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=<w>&dates=2026`, map events to `results` rows (`hs`, `as`, `final = status.type.completed`), skip games in `pre` state. This mirrors the existing client `fetchWeekResults` and replaces it in remote mode so results are shared instantly.
- Set `Cache-Control: no-store` on all API responses.

Build the state object for the rules engine on the server exactly as the client does: `S = { settings, entries, picks, results, rounds }` loaded from the tables, `picks` keyed by entry id then week.

### 3.3 Routing

`vercel.json`:
```
{ "rewrites": [ { "source": "/play/:code", "destination": "/index.html" } ] }
```
`api/*.js` files map to `/api/*` automatically; use `api/admin/pick.js`, `api/admin/state.js`, `api/admin/results/fetch.js` for the nested routes.

## 4. Client changes (inside index.html, same look)

Detect remote mode on load: if `location.protocol` is http(s) and `fetch('/api/state')` succeeds, set `REMOTE = true` and use the server state as `S`. In REMOTE mode:

- Viewers are read-only exactly like the existing `STATIC` mode (same `body.ro` behaviour, same hidden tabs, same padlocked picks). Poll `/api/state` every 45 seconds and re-render if `updatedAt` changed.
- The padlock in the header prompts for the admin passphrase (a small modal in the app's existing modal style, not `prompt()`), verifies it with `GET /api/state`, and stores it in localStorage. Admin mode then shows the full app. All writes go to the API: `save()` debounces a `POST /api/admin/state` (500 ms); `makePick`/`clearPick` call `/api/admin/pick`; the Results tab's "Fetch live scores from ESPN" calls `/api/admin/results/fetch`. Replace the gold "Publish"/"Download" header tile with a "✓ Live" tile (same `.stat.pub` styling) that briefly shows "Saving…" while a write is in flight and "Save failed" in red if one fails.
- Entries tab, admin only: add a "Personal link" column showing the code, a "Copy link" button, and a "Copy invite" button that copies a ready-made WhatsApp message: "You're in the NFL Last Man Standing. Your personal pick link is <link>. Pick one team to win each week before kick-off. Each team can only be used once. Good luck!". Unpaid entries show the link greyed out with a note that the player can't pick until marked paid.
- Picks tab, admin only: above the table add a "Not picked yet" strip listing the eligible entries without a pick for the selected week, with a "Copy chase message" button that copies "Week N picks close <first kick-off in UK time>. Still waiting on: <names>. Use your personal link to pick." Reuse the existing `.avatars` / `.av` chips.
- Keep the existing local-file, HOSTED and STATIC modes intact for anyone opening the file directly.

## 5. Player page (`/play/<code>`)

When the URL is `/play/<code>` (also accept `?c=<code>`), render a dedicated player view instead of the tabs. Same header brand, same palette and components, no nav bar, mobile-first (this will mostly be used on phones, so make the body `zoom` 1 below 900 px wide and keep the existing 1.2 above it). Contents:

1. A card: "Hi <name>" with the entry label, a status pill (In / Out wk N / Winner), the current pot, and a strip of already-used team logos.
2. Week selector using the existing `.weeks` buttons, showing only weeks in the current round from the first unsettled week onward; weeks whose first game has kicked off are shown locked.
3. "Your pick" panel for the selected week: the chosen team with its logo and fixture, kick-off in UK time, a live countdown ("Locks in 2d 4h 12m"), and a "Change pick" button if not locked.
4. The team grid using the existing `.teamgrid` / `.tcard` styling with the same greying rules (used, bye, final/kicked off), plus a confirmation step: tapping a team highlights it and shows a "Confirm <team>" button; only confirming calls `POST /api/pick`. Show the server's `message` on error using the existing toast.
5. "Your season so far": their picks per week with W/L/T colouring using the existing `.hcell` styling.
6. A small "View standings" link to `/`.

Unknown or unpaid codes show a friendly message in the same card style.

## 6. Repo layout after your changes

```
index.html            the app (unchanged look)
lib/logic.js          shared rules engine, required by api/* and inlined into index.html at build time
lib/schedule.json     the SCHEDULE object extracted from index.html
api/state.js, api/me.js, api/pick.js
api/admin/pick.js, api/admin/state.js, api/admin/results/fetch.js
api/_db.js            connection + schema bootstrap
db/schema.sql
vercel.json
package.json          scripts: "build" (inline lib/logic.js and lib/schedule.json into index.html), "test"
README.md             update with the Vercel setup steps below
```

If you inline at build time, commit the built `index.html` too so Vercel can serve it without a build step, or configure the build command in `vercel.json`. Either is fine; say which you chose in the README.

## 7. Vercel and Postgres setup (document this in the README, in this order)

1. In Vercel: Add New > Project > Import `roboshea-byte/nfl-lms`. Framework preset "Other". Root directory `/`. Deploy once (it will fail API calls until the database exists, that's expected).
2. In the project: Storage > Create Database > Neon (Postgres), free plan, region closest to London (eu-west-2 or fra1). Connect it to the project; this injects `DATABASE_URL` (and `POSTGRES_URL`) into all environments.
3. Settings > Environment Variables: add `ADMIN_KEY` with a passphrase of the organiser's choosing, for Production, Preview and Development.
4. Deployments > Redeploy so the new env vars are picked up. Open the site; the schema is created on first API call.
5. Open the site, click the padlock, enter the passphrase, add entries on the Entries tab (or import the spreadsheet), mark them paid, copy each personal link and send it.
6. Optional: Settings > Domains to attach a custom domain.
7. Local development: `vercel dev` with a `.env.local` containing `DATABASE_URL` and `ADMIN_KEY` (pull them with `vercel env pull`).

## 8. Tests and acceptance

Write a Node test (`npm test`) that runs the API handlers against a test database or an in-memory stub of the DB helper and checks:

- `/api/pick` rejects unknown code, unpaid entry, used team, bye team, eliminated entry, and any pick after kick-off, each with the right `error` code.
- A pick before kick-off is saved and returned by `/api/me`; `/api/state` returns it as `'HIDDEN'` until kick-off, and as the team afterwards (mock the clock).
- Admin state upsert generates codes for new entries and deletes removed entries plus their picks.
- Wipeout and winner detection still behave as in `lib/logic.js` (reuse the engine, don't reimplement).

Then check by hand in a browser that: the public page looks identical to the current `index.html`; the padlock unlocks admin with the passphrase; a player link on a phone-sized viewport lets you pick, confirm, change, and is locked after kick-off; the Picks tab shows the chase list; results fetched from ESPN appear for viewers within 45 seconds.

Work in small commits with clear messages. If anything in this brief conflicts with what the existing `index.html` does, the existing behaviour wins unless the brief explicitly says to change it.
