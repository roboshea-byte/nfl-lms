# NFL LMS admin walkthrough

A 113-second, 1080p Remotion walkthrough for competition owners and administrators. It uses screenshots captured from the actual NFL LMS app and adds only cursor movement, click highlights and written instructions. There is no narration or audio track.

The walkthrough covers registration, extra entries, assigning admins, entry payments, pick overrides, results, announcements, rollovers and the searchable Admin guide.

## Capture the current app

Start the isolated accounts demo from the repository root:

```bash
PORT=3100 node scripts/dev.js --demo
```

Then capture the real pages from this directory:

```bash
npm run capture
```

The capture uses only temporary in-memory accounts and competition data. It does not read or change the live database.

## Preview

```bash
npm install
npm run studio
```

## Render

```bash
npm run render
```

The MP4 is written to `output/nfl-lms-admin-guide.mp4`.
