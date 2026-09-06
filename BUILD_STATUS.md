# Build status

Live at https://nfl-lms.vercel.app.

Production application commit: 44793c3. Deployment dpl_6yDKwwov4SdJHb9WcMxqYU8PHSj4 is Ready.

- Immediate email/password signup, owner/admin/member roles and server permissions implemented.
- Admin payments, manual entries, member linkage, pick overrides, roles, access controls and reset links work with the existing results/round tools.
- Member dashboard shows current payment status and allows picks/changes until the weekly deadline, one hour before the first kickoff.
- 21 automated tests pass on Node 24. Production dependency audit reports zero vulnerabilities.
- Local and deployed isolated-preview browser flows passed: owner setup, signup, payment activation, saved/changed picks, role promotion and session revocation.
- Production Chromium and WebKit checks passed for home, deadline, signup, phone widths and unauthenticated admin redirects. Public owner-email registration without the private token is rejected.
- Preview test accounts were removed. No test entrants were added to production.

Remaining user step: Rob opens the private owner setup file and chooses his password on the website. His earlier physical-iPhone clipping report still needs device confirmation; browser checks show no document overflow at 320-1440 CSS pixels.

Admin navigation follow-up: /admin now opens a dedicated management landing page. Every admin view includes direct controls for entries/payments, members/roles, picks, results, settings and overview. Initial unpaid entries display as awaiting payment/inactive, not eliminated. Chromium and WebKit navigation checks pass at 320-1440px; all 21 automated tests pass.
