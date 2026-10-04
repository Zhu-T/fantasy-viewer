# Fantasy Viewer

One page that shows **your matchup in every ESPN fantasy football league you're in, all at once**, and keeps refreshing while NFL games are being played. Deploys to Vercel; anyone can use it with their own leagues.

- **Public leagues need no login:** paste a league ID (or the league URL) and pick your team.
- **Private leagues** need your ESPN cookies; connecting them also finds all your leagues automatically.
- Each matchup shows both teams, live score, projection, players still to play, and the result once final. The team that's ahead gets an amber bar.
- Lineups show each player's live stat line (yards, TDs, interceptions, fumbles, kicks, D/ST), **On Field** and **Red Zone** tags during live drives, and the last player on each team to score in green with the points gained.
- The week you're viewing is in the URL (`?week=4`), so reloads and shared links keep it.
- **League pages:** click a league name to see every matchup in that league for the week.
- **Show all lineups** opens every lineup on the page at once, FantasyCast style: both starting lineups mirrored by position, with live points, projections and game status. Each matchup can also be opened on its own.
- Polls every 15s while any NFL game is in progress, every minute right before kickoff, and every 5 minutes otherwise. Polling pauses when the tab is hidden.
- Step back through earlier weeks with the week control in the header.

## Deploy to Vercel

1. Push this repo to GitHub and import it at [vercel.com/new](https://vercel.com/new) (framework preset: Next.js, no other settings).
2. Under **Settings → Environment Variables**, add `SESSION_SECRET`: a long random string (`openssl rand -base64 32`). Changing it later signs everyone out.
3. Deploy, open the URL and add a league.

## Adding leagues

**Public leagues:** ESPN's API serves a league to anyone if the commissioner turned on *League Settings → Make League Viewable to Public*. Paste the league ID or URL, pick your team, done. Nothing sensitive is stored.

**Private leagues (most leagues):** ESPN refuses anonymous requests, so the app needs your login cookies. ESPN has no public login API, so the app uses the two cookies every ESPN fantasy tool relies on:

1. Log in at [espn.com/fantasy](https://www.espn.com/fantasy/) on a computer.
2. DevTools (F12) → **Application** (Chrome/Edge) or **Storage** (Firefox) → **Cookies** → `https://fantasy.espn.com`.
3. Paste `espn_s2` and `SWID` into the form. You can also paste a whole cookie string; the form picks the two values out.

The server checks them against ESPN, then stores them **only in your browser**, AES-256-GCM encrypted in an HttpOnly cookie (`fv_session`). Nothing is written server-side. Once connected, every league on your account appears automatically. **Disconnect** forgets the cookies (leagues you added by ID stay); **Forget everything** clears the session entirely. `espn_s2` usually lasts about a year; when ESPN stops accepting it, the page shows a reconnect banner and keeps showing your public leagues.

Leagues added by ID and leagues found through your account show up together; manage both under **Leagues** in the header.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. `SESSION_SECRET` is optional in development (a built-in dev key is used); `npm run build`/`npm start` require it, e.g. in `.env.local`.

## Install as an app (PWA)

The site is a Progressive Web App: web manifest, icons, and a service worker that keeps the last scores available offline.

- **Desktop Chrome/Edge:** an "Install" banner appears under the header (or use the install icon in the address bar).
- **iPhone/iPad:** open in Safari → Share → **Add to Home Screen**.
- **Android:** Chrome → menu → **Install app** / **Add to Home screen**.

Installing needs a secure context; the Vercel URL is HTTPS, and `http://localhost` works for local use.

The service worker (`public/sw.js`) is only registered in production builds (`npm run build && npm start`); in `npm run dev` it stays off so it doesn't interfere with hot reload.

## How it works

ESPN's fantasy API is undocumented and private leagues need the `espn_s2` + `SWID` cookies, so everything talks to ESPN from the Next.js server (Vercel functions), never from the browser.

| Piece | File | Notes |
| --- | --- | --- |
| Session | `src/lib/espn/auth.ts` | The `fv_session` cookie (encrypted with `SESSION_SECRET`) holds the leagues added by ID with your chosen team, plus optional ESPN cookies. |
| League discovery | `src/lib/espn/fan.ts` | With cookies, `fan.api.espn.com/apis/v2/fans/{SWID}` lists the fantasy teams your account owns (cached in memory for 6h; **Rescan** forces a refresh). Merged with the leagues added by ID. |
| Matchup data | `src/lib/espn/league.ts` | Reads `lm-api-reads.fantasy.espn.com` (anonymously for public leagues) (`mTeam`, `mMatchupScore`, `mScoreboard`, `mRoster`, …) and reduces it to your matchup for the week. |
| NFL game state | `src/lib/espn/nfl.ts` | Public `site.api.espn.com` scoreboard → which pro teams are pre/in/post so we can show "Q3 4:12", "Yet to play", byes, and decide the refresh cadence. |
| Aggregation | `src/lib/espn/aggregate.ts` | Fetches all leagues in parallel (`Promise.allSettled`), 10s in-memory cache per session (keyed by a hash of the cookies and saved leagues, never the SWID alone), returns `nextRefreshMs` for the client. |
| UI | `src/app/page.tsx`, `src/components/*` | SWR polling with an adaptive `refreshInterval`; "Show all lineups" remembered per browser. League pages live at `/league/[id]`. |
| PWA | `src/app/manifest.ts`, `public/sw.js`, `src/components/PwaSetup.tsx`, `public/icons/` | Manifest, service worker (cache-first static assets, network-first page + `/api/matchups` with offline fallback), install banner / iOS hint. |

Caches live in each warm function instance's memory, so they're best-effort on Vercel: a cold start just means one extra round of ESPN requests.

### API

All routes act on the caller's own session cookie.

- `GET /api/league?id=<leagueId>[&week=N]`: every matchup in one league
- `GET /api/matchups[?week=N]`: all your matchups (+ per-league errors, `configured`, `cookieState`, `nextRefreshMs`)
- `GET /api/auth/status`: `{ hasCookies, leagues }`
- `GET /api/leagues/lookup?league=<id or URL>`: league name + teams for the team picker (403 with `needsCookies` for private leagues)
- `POST /api/leagues` `{ leagues: [{ leagueId, teamId, leagueName?, teamName? }] }`: replace the leagues added by ID
- `POST /api/auth/login` `{ espn_s2, SWID }`: validate with ESPN and add the cookies to the session
- `POST /api/auth/logout` `{ all? }`: forget the cookies (`all: true` also forgets the leagues)
- `POST /api/leagues/refresh`: re-run league discovery

## Configuration

```
SESSION_SECRET=...   # required in production
ESPN_SEASON=2026     # optional; defaults to the current NFL season
```
