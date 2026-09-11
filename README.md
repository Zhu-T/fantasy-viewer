# Fantasy Viewer

One page that shows **your matchup in every ESPN fantasy football league you're in**, and keeps refreshing while NFL games are being played.

- Leagues are auto-discovered from your ESPN account (no league IDs to type).
- Each card shows your team vs. your opponent: live score, live projection, players still to play, and W/L/T once final. Expand a card to see both starting lineups with per-player points and game status.
- Polls every 30s while any NFL game is in progress, every minute right before kickoff, and every 5 minutes otherwise. Polling pauses when the tab is hidden.
- Step back through earlier weeks with the week control in the header.

## Run it

**One click (Windows):** double-click `start.bat`. It installs dependencies on first run, builds when the source has changed, starts the server (minimized) and opens http://localhost:3000. Run `create-shortcut.bat` once to get a **Fantasy Viewer** shortcut with the app icon on your Desktop; `stop.bat` shuts the server down. Set `FV_PORT` to change the port; `start.bat --rebuild` forces a fresh build.

**Manual / development:**

```bash
npm install
npx playwright install chromium   # one-time, for the ESPN login window
npm run dev
```

Open http://localhost:3000 and click **Sign in to ESPN**. A Chromium window opens on this machine; log in to ESPN there. The window closes itself once it sees your session cookies, and the page loads your leagues. The login profile is persisted, so you rarely have to do this again.

## Install as an app (PWA)

The site is a Progressive Web App: web manifest, icons, and a service worker that keeps the last scores available offline.

- **Desktop Chrome/Edge:** an "Install" banner appears under the header (or use the install icon in the address bar).
- **iPhone/iPad:** open in Safari → Share → **Add to Home Screen**.
- **Android:** Chrome → menu → **Install app** / **Add to Home screen**.

Installing needs a secure context: `http://localhost` works out of the box. To install from a phone, expose the server over HTTPS (e.g. `next dev --experimental-https`, a Tailscale/Cloudflare tunnel, or a reverse proxy with a cert) — a plain `http://192.168.x.x` LAN address won't offer the install prompt or register the service worker.

The service worker (`public/sw.js`) is only registered in production builds (`npm run build && npm start`); in `npm run dev` it stays off so it doesn't interfere with hot reload.

## How it works

ESPN's fantasy API is undocumented and private leagues need the `espn_s2` + `SWID` cookies, so everything talks to ESPN from the Next.js server, never from the browser.

| Piece | File | Notes |
| --- | --- | --- |
| Cookie harvesting | `src/lib/espn/auth.ts` | Playwright opens `fantasy.espn.com` on a persistent profile, waits for `espn_s2`/`SWID`, saves them to `data/espn-cookies.json`. Any 401/403 from ESPN flips the UI back to "Sign in". |
| League discovery | `src/lib/espn/fan.ts` | `fan.api.espn.com/apis/v2/fans/{SWID}` lists the fantasy teams your account owns. Cached in `data/leagues.json` for 6h; **Rescan leagues** forces a refresh. |
| Matchup data | `src/lib/espn/league.ts` | Reads `lm-api-reads.fantasy.espn.com` (`mTeam`, `mMatchupScore`, `mScoreboard`, `mRoster`, …) and reduces it to your matchup for the week. |
| NFL game state | `src/lib/espn/nfl.ts` | Public `site.api.espn.com` scoreboard → which pro teams are pre/in/post so we can show "Q3 4:12", "Yet to play", byes, and decide the refresh cadence. |
| Aggregation | `src/lib/espn/aggregate.ts` | Fetches all leagues in parallel (`Promise.allSettled`), 15s in-memory cache, returns `nextRefreshMs` for the client. |
| UI | `src/app/page.tsx`, `src/components/*` | SWR polling with an adaptive `refreshInterval`. |
| PWA | `src/app/manifest.ts`, `public/sw.js`, `src/components/PwaSetup.tsx`, `public/icons/` | Manifest, service worker (cache-first static assets, network-first page + `/api/matchups` with offline fallback), install banner / iOS hint. |

### API

- `GET /api/matchups[?week=N]` – all your matchups (+ per-league errors, auth state, `nextRefreshMs`)
- `GET /api/auth/status` – `{ hasCookies, authOk, harvesting, lastError }`
- `POST /api/auth/login` – open the ESPN login window (returns immediately; poll status)
- `POST /api/auth/logout` – forget saved cookies
- `POST /api/leagues/refresh` – re-run league discovery

## Configuration (`.env.local`, all optional)

```
ESPN_SEASON=2026                 # defaults to the current season
LEAGUE_IDS=12345678,87654321     # extra league IDs if discovery misses one
ESPN_PROFILE_DIR=C:/tmp/profile  # where the Playwright login profile lives
```

`data/` (cookies, discovered leagues) and `.env.local` are git-ignored.
