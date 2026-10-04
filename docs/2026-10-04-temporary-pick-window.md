# Temporary Week 4 pick window

Rob requested reopening this week's picks until 18:00 UK time, and confirmed the exception after the earlier Week 4 kick-offs were highlighted. There was one active entry outstanding.

- Scope: Round 1, Week 4 only.
- Authorised window: 4 October 2026, from 17:24 to 18:00 Europe/London.
- Exact server closure: `2026-10-04T17:00:00.000Z`.
- Implementation: shared `weekPickException` and `weekDeadline` rules in `lib/logic.js`, used by the browser and authenticated pick endpoint.
- Existing picks whose games have started remain fixed. New picks must concern unstarted games. Payment, round eligibility, previous-week review and used-team checks remain enforced.
- Every accepted exception submission records the temporary deadline alongside its week and team in the normal audit log.
- API `pickWindow` reports the authoritative deadline and open/closed status. Its status participates in the content revision so polling detects closure.
- Tests: all 37 pass, including exact boundary rejection for submissions, changes and clears; started-game protection; unaffected later weeks and rounds; matching browser/server clocks. Production build and diff checks pass.
- Release: `dpl_D5DgoxaqN4mroFmN3Dr7sV8Wzt8j`, Ready at `https://nfl-lms.vercel.app`.
- Live verification at 17:28 UK: API reports Week 4 open, closing at 17:00 UTC; Dashboard shows Sunday 4 October 18:00, a one-off extension and one outstanding entry.
- Local source and output: `/Users/Rob/Developer/NFL-LMS-live`.
- Obsidian mirror: `/Users/Rob/Desktop/OBS Racing Intel/OBS Racing Intel/WIKI/30 Projects/NFL Last Man Standing/2026-10-04-pick-deadline`.

Expiry is enforced on every request using the server clock. It survives restarts and deployment because the exact absolute deadline is part of the shared source. A cleanup job or later manual lock is unnecessary.
