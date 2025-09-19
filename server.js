
import express from 'express';
import fetch from 'node-fetch';
import compression from 'compression';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const ODDS_API_KEY = process.env.ODDS_API_KEY;

if (!ODDS_API_KEY) {
  console.error("Missing ODDS_API_KEY environment variable.");
  console.error("Set it locally with: export ODDS_API_KEY=your_key_here");
  console.error("On Render, add it in the service's Environment tab.");
  process.exit(1);
}

app.use(compression());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

async function callOddsAPI(endpoint, params) {
  const url = new URL(`https://api.the-odds-api.com/v4/${endpoint}`);
  url.searchParams.set('apiKey', ODDS_API_KEY);
  for (const [k,v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url.href);
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`OddsAPI error ${r.status}: ${txt}`);
  }
  return r.json();
}

app.get('/api/odds', async (req, res) => {
  try {
    const data = await callOddsAPI('sports/baseball_mlb/odds', {
      regions: 'us',
      markets: 'totals,alternate_totals',
      oddsFormat: 'american',
      dateFormat: 'iso'
    });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/odds-live', async (req, res) => {
  try {
    const data = await callOddsAPI('sports/baseball_mlb/odds', {
      regions: 'us',
      markets: 'totals',
      oddsFormat: 'american',
      dateFormat: 'iso',
      live: 'true'
    });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
