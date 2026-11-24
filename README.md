# Tea Advent Competition

A mobile-friendly, multi-user tea guessing game. Participants make six independent predictions for each tea day. The host manages the answer key and controls when submissions close and answers are revealed.

## Scoring rules

Each ingredient is scored independently:

| Participant's choice | Ingredient is in the brew | Ingredient is not in the brew |
|---|---:|---:|
| In | +1 | -1 |
| Not in | -1 | +1 |
| No decision | 0 | 0 |

There are six clues per tea day, so a daily score ranges from **-6 to +6**. The overall leaderboard adds the scores from revealed days. A participant who did not submit for a revealed day receives no score for that day (shown as a dash on the leaderboard; it does not add or subtract points).

## Included features

- Participant registration with a shared competition invitation code and individual accounts.
- Username/password sign-in; each participant's guesses are private.
- Six ingredient clues per tea day, each with **In**, **Not in**, and **No decision** choices.
- Participants may update their guesses while a day is open.
- Host-only setup for the tea title, date, six ingredient names, and correct In/Not in answer.
- Host-controlled status changes: **Open → Closed → Revealed**. Closing prevents further edits; revealing publishes the answer key and results.
- Individual daily scores and an overall leaderboard.
- Responsive layout for phones and desktop browsers.
- SQLite storage for accounts, calendar days, and submissions.

## Run locally

Requirements: Node.js 20 or newer and npm.

1. Copy `.env.example` to `.env`.
2. Set `COOKIE_SECRET` to a long random value (at least 32 characters), choose a private `COMPETITION_CODE`, and set `ADMIN_USERNAME` and `ADMIN_PASSWORD`.
3. Install dependencies and start the development servers:

   ```bash
   npm install
   npm --prefix client install
   npm run dev
   ```

4. Open <http://localhost:5173>.
5. Sign in as the host using `ADMIN_USERNAME` and `ADMIN_PASSWORD`. Create the tea days and enter the six clues/answer key for each day.
6. Share the website address and `COMPETITION_CODE` with participants. Participants create their own accounts.

The application server runs on port 3001 in development. Vite proxies `/api` requests to it.

## Railway deployment guide

For a step-by-step deployment walkthrough using Railway, see [RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md).

## Production deployment

This application is designed to run as one Node/Docker web service with a **persistent disk or volume** for the SQLite database. Do not deploy it to an ephemeral filesystem: the database file must survive restarts and new deployments.

1. Build and run the included `Dockerfile` on a host that supports persistent volumes.
2. Mount the persistent volume at `/app/data`.
3. Configure these environment variables in the hosting service:

   - `NODE_ENV=production`
   - `PORT=3001` (or the port required by the host)
   - `DATABASE_PATH=/app/data/tea-competition.db`
   - `COOKIE_SECRET` (a long random secret, at least 32 characters)
   - `COMPETITION_CODE` (share this only with invited participants)
   - `ADMIN_USERNAME`
   - `ADMIN_PASSWORD`
   - `ADMIN_DISPLAY_NAME` (optional)

4. Deploy and use the public HTTPS URL as the competition website.

The administrator account is created or refreshed from the `ADMIN_*` environment variables at server startup. Keep those credentials private. Back up the persistent database file periodically.

## Daily host workflow

1. Add a tea day. Enter a day number, optional tasting date, display title, six clue names, and whether each clue is actually in the brew.
2. Participants submit their six choices. Their answers remain private.
3. Select **Close submissions** when guesses should no longer be changed.
4. Select **Reveal answers** after the tasting. The correct answer key and participant scores become visible, and the leaderboard updates.

A day moves forward only: Open → Closed → Revealed. This makes the reveal an explicit host action and prevents post-reveal changes.

## Notes / current scope

- The number of calendar days is flexible; create as many numbered days as needed.
- Each tea day has exactly six clue entries.
- This first version has no email/password recovery flow. Participants should remember their username and password; the host can manage account recovery at the database level if needed.
- The host can preview submissions and scoring from the admin panel before revealing, but participants cannot see the answer key or other participants' guesses before reveal.
