# MLB Vintage Slate — Totals & Projections

A one-page site with a vintage baseball look that:
- Shows total runs scored for today's MLB slate
- Projects slate total using: scored runs + remaining from **live totals** + **pregame totals** for not-started games
- Lists today's games with probable starters, ERA, and W-L
- Highlights live games and updates automatically

## Quick Start (Render Web Service)
1. **Create a new Web Service** on Render, link this repo or upload the ZIP.
2. Set **Build Command**: `npm install`
3. Set **Start Command**: `npm start`
4. Add environment variable **ODDS_API_KEY** with your The Odds API key.
5. Deploy. The app serves static files and proxies Odds API to avoid CORS.

## Local
```bash
npm install
export ODDS_API_KEY=your_key_here
npm start
```

## How projection is computed
Let:
- `S` = sum of actual runs from all games (final + in-progress)
- For each **live** game `g`: `remaining_g = max(live_total_g - current_runs_g, 0)`
- For each **not-started** game `g`: `pregame_g = market-implied over/under total`
- **Final** games contribute only to `S`

**Projected Slate Total = S + Σ remaining_g (live) + Σ pregame_g (not-started)**

We de-vig each book's Over/Under prices to estimate the market-implied total, then take a median across books (fallback to average). If live totals are missing, we fallback to pregame totals for that game.

## Data sources
- **Scores / schedule / pitchers**: Public MLB Stats API (no key)
- **Totals (pregame/live)**: The Odds API (requires key)

## Notes
- Team name matching uses a mapping + fuzzy normalize (e.g., "D-backs" → "Diamondbacks"). You can extend `TEAM_ALIASES` in `app.js` if a book’s naming differs.
- Styling is plain CSS—easy to rebrand. See `style.css`.


---

## Environment Variable (Required)

Set your Odds API key:

### Local
Create a `.env` file or export in your shell:
```
ODDS_API_KEY=faf98aaa418e76d8e5e14822cfe4ccb9
# or
export ODDS_API_KEY=faf98aaa418e76d8e5e14822cfe4ccb9
```

### Render
In your service **Environment** tab, add:
```
Key: ODDS_API_KEY
Value: faf98aaa418e76d8e5e14822cfe4ccb9
```

> Tip: Avoid committing `.env` to public repos.
