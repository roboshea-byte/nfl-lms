# Build status

Live at https://nfl-lms.vercel.app.

4 October 2026: Round 1 Week 4 picks reopened by Rob's explicit instruction until 18:00 Europe/London (17:00 UTC). Production deployment `dpl_D5DgoxaqN4mroFmN3Dr7sV8Wzt8j` is Ready. Live API confirms the window is open and the Dashboard shows Sunday 4 October, 18:00. All 37 tests and the production build pass. The server rejects submissions, changes and clears at the exact deadline without requiring a scheduled task. The durable source is `/Users/Rob/Developer/NFL-LMS-live`.

The current production application includes feature commit `5e01922`. Vercel production deployment `dpl_ELjHsGpyQFjmLXCLZhtfVzsdQbfC` is Ready.

- Immediate email/password signup, owner/admin/member roles and server permissions implemented.
- Admin payments, manual entries, member linkage, pick overrides, roles, access controls and reset links work with the results and round tools.
- Member dashboard shows current payment status and allows picks/changes until the weekly deadline, one hour before the first kickoff.
- Every finalised NFL week has a six-hour review window before the following week unlocks. A deciding week uses the same timer before the next round starts; staff retain an early-start round control in Settings.
- Results and Standings retain completed-round entrants, picks, results, winners and eliminations through the round archive and weekly CSV/PNG exports.
- Competition-rule inputs use larger labelled controls with phone-friendly layout.
- All 31 automated tests pass. Isolated browser flows cover weekly and round review windows, early admin transition, archives and responsive layouts at 320–1,440px.
- The live production page and API are healthy, have no horizontal overflow, and continue to strip member emails and entry codes from public data. No test entrants were added to production.

Remaining user step: Rob opens the private owner setup file and chooses his password on the website. His earlier physical-iPhone clipping report still needs device confirmation; browser checks show no document overflow at 320-1440 CSS pixels.

Admin navigation follow-up: /admin now opens a dedicated management landing page. Every admin view includes direct controls for entries/payments, members/roles, picks, results, settings and overview. Initial unpaid entries display as awaiting payment/inactive, not eliminated. Chromium and WebKit navigation checks pass at 320-1440px; all 21 automated tests pass.

Role-specific admin follow-up: the owner retains account-entry linking and recent admin activity. Admin accounts now receive a simpler Members page without those two owner-only panels; their payments, member resets, picks and results tools remain available.
