# Account decisions

- Retain the existing Node, standalone HTML and Neon Postgres architecture.
- Signup has no email confirmation. Email alone never claims an existing entry.
- Signup requires separate first-name and last-name fields. The combined full name becomes the account and initial entry name.
- Reserve roboshea@gmail.com for the owner. Initial owner registration requires a private, random setup token supplied in a URL fragment. The token never grants ownership after the owner has been created.
- Passwords use salted scrypt (N=131072, r=8, p=1). Passwords must contain 7-256 characters. Sessions use opaque random cookies, HttpOnly, Secure in production, SameSite=Lax, and expire after 30 days. Store only session/reset token hashes.
- Only the owner changes roles or disables accounts. Admins manage competition data and member recovery; admins cannot reset staff or owner passwords. Role/access changes revoke existing sessions.
- Password recovery uses an organiser-created, single-use link valid for one hour. No email is sent automatically. Owner recovery requires trusted server/database access.
- Registration creates a member account without entering it into a round. Members choose **Add an entry** for the current round; every added entry starts unpaid. Admins may explicitly connect manually added entries to accounts. Accounts may hold multiple independent entries.
- Payment eligibility uses the current round/rollover ledger. Unpaid entries are excluded from the competition. Being paid does not reverse an ordinary losing pick.
- Member picks, changes and clears all lock at the same weekly deadline: first fixture kickoff minus 60 minutes. Admin overrides remain possible and are audited.
- Old organiser passphrases and personal-entry codes no longer authorise live API access.
- Existing mobile CSS fixes are preserved. Physical iPhone clipping remains awaiting confirmation from Rob.
- Home-screen installs use the short label `NFL LMS`, a standalone display mode and the original LMS football-shield icon in Apple and manifest sizes.
- A completed round waits six hours after the deciding week is final before the next round starts automatically. Staff may start it early from Settings without altering the timing of later rounds. Completed rounds remain available through Results, Standings and weekly-pick exports.
