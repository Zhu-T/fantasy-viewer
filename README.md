# Fantasy Viewer

One page that shows **your matchup in every ESPN fantasy football league you're in**, and keeps refreshing while NFL games are being played.

- Leagues are auto-discovered from your ESPN account (no league IDs to type).
- Each card shows your team vs. your opponent: live score, live projection, players still to play, and W/L/T once final. Expand a card to see both starting lineups with per-player points and game status.
- Polls every 30s while any NFL game is in progress, every minute right before kickoff, and every 5 minutes otherwise. Polling pauses when the tab is hidden.
- Step back through earlier weeks with the week control in the header.

## Run it

```bash
npm install
npx playwright install chromium   # one-time, for the ESPN login window
npm run dev
```

Open http://localhost:3000 and click **Sign in to ESPN**. A Chromium window opens on this machine; log in to ESPN there. The window closes itself once it sees your session cookies, and the page loads your leagues. The login profile is persisted, so you rarely have to do this again.

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
