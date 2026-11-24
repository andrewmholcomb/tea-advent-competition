# Deploy Tea Advent Competition to Railway

This project is a single-service React + Express application. The React site is built into the Docker image and served by Express; the API and website therefore share one origin. Accounts, tea days, answer keys, and guesses are stored in SQLite.

## Before deploying

- Use a **private GitHub repository** for the source code.
- Use the Railway **Hobby** plan for the period when the competition is active.
- Run one application replica. This version uses SQLite on a single attached volume and is not configured for horizontal scaling.
- Attach the persistent volume before creating participant accounts or tea days.

## 1. Put the project in GitHub

Extract `tea-advent-competition.zip`. Open the inner `tea-advent-competition` folder (the folder containing `Dockerfile`, `package.json`, `server/`, and `client/`) in a terminal.

Create a new **private** repository on GitHub, then run the following commands from that folder. Replace the repository URL with your own HTTPS GitHub repository URL.

```bash
git init -b main
git add .
git commit -m "Initial Tea Advent Competition application"
git remote add origin https://github.com/YOUR-USERNAME/tea-advent-competition.git
git push -u origin main
```

The `.gitignore` excludes `.env`, local database files, and installed dependencies. Do not commit passwords, invitation codes, or a live database.

## 2. Create a Railway project

1. Create/sign in to a Railway account at <https://railway.com/>.
2. Select the Hobby plan if you are ready to make the site public.
3. Create a new project and choose **Deploy from GitHub Repo**.
4. Connect GitHub and select your private `tea-advent-competition` repository.
5. Railway should detect the root-level file named `Dockerfile` and build the application from it.

The repository root must contain `Dockerfile`, `package.json`, `server/`, and `client/`. If the deployed source has an extra enclosing folder above those files, set the repository/root directory correctly or move the project contents to the repository root.

## 3. Add the persistent volume before using the app

In the Railway project, open the application service and add a volume. Set its mount path to:

```text
/app/data
```

The application will store its database at `/app/data/tea-competition.db` when `DATABASE_PATH` is set as shown below.

**Do this before creating the host account, participant accounts, tea days, or guesses.** Without the volume, the database would be written to the service's temporary filesystem and would not survive a redeploy.

## 4. Set service variables

In the application service's Variables section, add:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `3001` |
| `DATABASE_PATH` | `/app/data/tea-competition.db` |
| `COOKIE_SECRET` | A randomly generated secret, at least 32 characters |
| `COMPETITION_CODE` | A private invitation code you will share with participants |
| `ADMIN_USERNAME` | Your host username (3–32 letters, numbers, `.`, `_`, or `-`) |
| `ADMIN_PASSWORD` | A strong, unique host password (8–100 characters) |
| `ADMIN_DISPLAY_NAME` | e.g. `Competition Host` |

Generate a high-entropy cookie secret in a terminal with Node.js:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Use the output as `COOKIE_SECRET`. Keep all of these values private. Do not put them in GitHub, in the public website, or in a message to participants (except the invitation code).

The server creates or refreshes the administrator account from `ADMIN_USERNAME` and `ADMIN_PASSWORD` each time it starts. Keep these values stable; changing `ADMIN_PASSWORD` in Railway and redeploying resets the host account password to the new value.

## 5. Deploy and create the public URL

1. Trigger/retry the deployment after the volume and variables are configured.
2. Check the deployment logs for a successful startup.
3. In the service's **Settings → Networking → Public Networking**, choose **Generate Domain**. Railway provides a public `*.up.railway.app` URL and automatically provisions HTTPS.
4. Open the generated URL. The health endpoint should return `{"ok":true}` when you visit `<your-domain>/api/health`.

A custom domain is optional. You can use the generated Railway domain for a short competition.

## 6. Set up the competition

1. Open the site and sign in using `ADMIN_USERNAME` and `ADMIN_PASSWORD`.
2. Create each tea day. Each day requires exactly six clue names and a private correct In/Not in answer for each clue.
3. Share the public website URL and `COMPETITION_CODE` with participants.
4. Participants select **Join competition**, create their own username/display name/password, and submit six choices per day.
5. At the cutoff, use **Close submissions**. This prevents participants from changing guesses.
6. Use **Reveal answers** after the tasting. The correct answers and scores become visible, and the cumulative leaderboard is recalculated.

Scoring is per clue: correct = +1, incorrect = -1, and No decision = 0. A day therefore ranges from -6 to +6. A participant who does not submit for a revealed day receives no score for that day rather than an automatic zero or penalty.

## 7. Backups and operating notes

- In the service's **Settings → Backups** area, enable daily volume backups. Railway documents daily backups as retained for six days; weekly and monthly schedules have longer retention. Consider making a manual backup before the competition and before any significant change.
- Keep one replica. Do not add a second application instance while using this SQLite database.
- This first version does not include password-reset email or a participant-facing password recovery flow. Participants should save their login details. The host should keep the admin credentials securely.
- The application does not need email, a separate database service, or a custom domain for the stated competition use case.

## 8. After the competition

Before shutting the service down, make a final backup and preserve the final results/database if you want an archive. To stop ongoing hosting charges, remove the application service and its attached volume, then review the Railway plan/subscription and downgrade or cancel it as appropriate. Deleting only the GitHub repository does not remove Railway resources.

## Official Railway references

- [Pricing](https://railway.com/pricing)
- [Deploying from a GitHub repository and persistent storage](https://docs.railway.com/services)
- [Dockerfile detection](https://docs.railway.com/builds/dockerfiles)
- [Public domains and HTTPS](https://docs.railway.com/networking/public-networking)
- [Volume backups](https://docs.railway.com/volumes/backups)
