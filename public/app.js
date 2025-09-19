
// ---- Config ----
const STATS_BASE = 'https://statsapi.mlb.com/api';
const DATE_TZ = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year:'numeric', month:'2-digit', day:'2-digit' });
const TODAY_ISO = new Date().toISOString().slice(0,10);

// Odds API will be proxied by server.js to avoid CORS; adjust if you host elsewhere
const ODDS_PREGAME_URL = '/api/odds';
const ODDS_LIVE_URL = '/api/odds-live';

// Common aliases: OddsAPI team names → MLB Stats API names
const TEAM_ALIASES = {
  'Arizona Diamondbacks': ['Arizona Diamondbacks','ARI','Arizona D-Backs','Arizona Dbacks'],
  'Atlanta Braves': ['Atlanta Braves','ATL'],
  'Baltimore Orioles': ['Baltimore Orioles','BAL'],
  'Boston Red Sox': ['Boston Red Sox','BOS'],
  'Chicago Cubs': ['Chicago Cubs','CHC'],
  'Chicago White Sox': ['Chicago White Sox','CWS','Chi White Sox'],
  'Cincinnati Reds': ['Cincinnati Reds','CIN'],
  'Cleveland Guardians': ['Cleveland Guardians','CLE'],
  'Colorado Rockies': ['Colorado Rockies','COL'],
  'Detroit Tigers': ['Detroit Tigers','DET'],
  'Houston Astros': ['Houston Astros','HOU'],
  'Kansas City Royals': ['Kansas City Royals','KC','KCR'],
  'Los Angeles Angels': ['Los Angeles Angels','LAA','LA Angels'],
  'Los Angeles Dodgers': ['Los Angeles Dodgers','LAD','LA Dodgers'],
  'Miami Marlins': ['Miami Marlins','MIA'],
  'Milwaukee Brewers': ['Milwaukee Brewers','MIL'],
  'Minnesota Twins': ['Minnesota Twins','MIN'],
  'New York Mets': ['New York Mets','NYM','NY Mets'],
  'New York Yankees': ['New York Yankees','NYY','NY Yankees'],
  'Oakland Athletics': ['Oakland Athletics','OAK','Oakland A's','Athletics'],
  'Philadelphia Phillies': ['Philadelphia Phillies','PHI'],
  'Pittsburgh Pirates': ['Pittsburgh Pirates','PIT'],
  'San Diego Padres': ['San Diego Padres','SD','SDP'],
  'San Francisco Giants': ['San Francisco Giants','SF','SFG'],
  'Seattle Mariners': ['Seattle Mariners','SEA'],
  'St. Louis Cardinals': ['St. Louis Cardinals','STL'],
  'Tampa Bay Rays': ['Tampa Bay Rays','TB','TBR'],
  'Texas Rangers': ['Texas Rangers','TEX'],
  'Toronto Blue Jays': ['Toronto Blue Jays','TOR'],
  'Washington Nationals': ['Washington Nationals','WSH','WAS']
};

function normalize(s){ return s.toLowerCase().replace(/[^a-z]/g,''); }
function teamMatch(mlbName, bookName){
  const nBook = normalize(bookName);
  const aliases = TEAM_ALIASES[mlbName] || [mlbName];
  return aliases.some(a => normalize(a) === nBook);
}

// ---- UI setup ----
document.getElementById('today').textContent = new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });
document.getElementById('refreshBtn').addEventListener('click', () => loadAll(true));

const elRunsScored = document.getElementById('runsScored');
const elProjected = document.getElementById('projectedTotal');
const elGamesList = document.getElementById('gamesList');
const elFinalCount = document.getElementById('finalCount');
const elLiveCount  = document.getElementById('liveCount');
const elNSCount    = document.getElementById('nsCount');

// ---- Data fetchers ----
async function fetchSchedule(dateISO){
  const url = `${STATS_BASE}/v1/schedule?sportId=1&date=${dateISO}&hydrate=probablePitcher(note,name,stats(type=season,group=pitching))`;
  const r = await fetch(url);
  if(!r.ok) throw new Error('Schedule fetch failed');
  const j = await r.json();
  return j.dates?.[0]?.games || [];
}

async function fetchLinescore(gamePk){
  const r = await fetch(`${STATS_BASE}/v1.1/game/${gamePk}/feed/live`);
  if(!r.ok) throw new Error('Live feed failed');
  const j = await r.json();
  const gs = j.liveData?.linescore;
  const status = j.gameData?.status?.detailedState || j.gameData?.status?.abstractGameState;
  const home = gs?.teams?.home?.runs ?? 0;
  const away = gs?.teams?.away?.runs ?? 0;
  return { total: (home+away)||0, status };
}

async function fetchOddsPregame(){
  const r = await fetch(ODDS_PREGAME_URL);
  if(!r.ok) return [];
  return r.json();
}

async function fetchOddsLive(){
  const r = await fetch(ODDS_LIVE_URL);
  if(!r.ok) return [];
  return r.json();
}

// ---- Odds helpers ----
function americanToProb(odds){
  const o = Number(odds);
  if (isNaN(o)) return null;
  return o >= 0 ? 100/(o+100) : (-o)/((-o)+100);
}
function devigPair(pOverRaw, pUnderRaw){
  const denom = pOverRaw + pUnderRaw;
  if (denom === 0) return [0.5,0.5];
  const pOver = pOverRaw/denom;
  return [pOver, 1-pOver];
}
function impliedTotalFromMarket(market){
  // market: { key:'totals', outcomes:[{name:'Over', price: -110, point: 8.5}, {name:'Under', price: -110, point: 8.5}] }
  if (!market?.outcomes || market.outcomes.length < 2) return null;
  const over = market.outcomes.find(o=>o.name==='Over');
  const under = market.outcomes.find(o=>o.name==='Under');
  if (!over || !under || over.point !== under.point) return null;
  const pOraw = americanToProb(over.price);
  const pUraw = americanToProb(under.price);
  if (pOraw==null||pUraw==null) return null;
  const [pOver] = devigPair(pOraw,pUraw);
  // For symmetric totals, the median is near the posted point. Small skew adjust:
  const skew = (pOver - 0.5); // positive → market leans over
  return (over.point || 0) + skew * 0.2; // gentle adjust
}
function median(arr){
  const a = arr.filter(x=>Number.isFinite(x)).sort((x,y)=>x-y);
  if (!a.length) return null;
  const m = Math.floor(a.length/2);
  return a.length%2 ? a[m] : (a[m-1]+a[m])/2;
}

function collectGameTotals(oddsData, homeTeam, awayTeam){
  // Aggregate across books, choose best totals market
  const totals = [];
  for (const book of oddsData){
    const ev = book;
    const ht = ev.home_team, at = ev.away_team;
    if (!(teamMatch(homeTeam, ht) && teamMatch(awayTeam, at))) continue;
    const market = ev.bookmakers?.[0]?.markets?.find(m=>m.key==='totals');
    if (!market) continue;
    const t = impliedTotalFromMarket(market);
    if (Number.isFinite(t)) totals.push(t);
  }
  return median(totals);
}

// ---- Main logic ----
async function loadAll(force=false){
  try{
    document.body.style.cursor='wait';
    const [games, oddsPre, oddsLive] = await Promise.all([
      fetchSchedule(TODAY_ISO),
      fetchOddsPregame().catch(()=>[]),
      fetchOddsLive().catch(()=>[])
    ]);

    // Build a quick lookup for odds by matchup
    const preData = oddsPre || [];
    const liveData = oddsLive || [];

    let scoredSum = 0;
    let projectedExtra = 0;

    let cntFinal=0, cntLive=0, cntNS=0;
    elGamesList.innerHTML = '';

    for (const g of games){
      const gamePk = g.gamePk;
      const status = g.status?.abstractGameState; // Preview / Live / Final
      const detailed = g.status?.detailedState || status;
      const homeTeam = g.teams?.home?.team?.name;
      const awayTeam = g.teams?.away?.team?.name;

      // Linescore and actual runs
      let actual = 0;
      try{
        const ls = await fetchLinescore(gamePk);
        actual = ls.total;
      }catch(_){} // ignore

      scoredSum += actual;

      // Probable pitchers + season stats (ERA, W-L)
      function parsePitcher(side){
        const pp = g.teams?.[side]?.probablePitcher;
        if (!pp) return null;
        const stats = pp?.stats?.find(s=>s.group?.displayName==='pitching' && s.type?.displayName==='season');
        const era = stats?.stats?.era;
        const wins = stats?.stats?.wins;
        const losses = stats?.stats?.losses;
        return { name: pp.fullName, era, wins, losses };
      }
      const hp = parsePitcher('home');
      const ap = parsePitcher('away');

      // Projection contribution
      let rowNote = '';
      if (status === 'Live'){
        cntLive++;
        // find live total across books
        const liveTotal = collectGameTotals(liveData, homeTeam, awayTeam) ?? collectGameTotals(preData, homeTeam, awayTeam);
        const remaining = Math.max((liveTotal ?? 0) - actual, 0);
        projectedExtra += remaining;
        rowNote = `Live total≈ ${liveTotal?.toFixed?.(1) ?? '—'} | remaining≈ ${remaining.toFixed(1)}`;
      } else if (status === 'Final'){
        cntFinal++;
        // No extra beyond scored
        rowNote = `Final`;
      } else {
        cntNS++;
        const preTotal = collectGameTotals(preData, homeTeam, awayTeam);
        projectedExtra += (preTotal ?? 0);
        rowNote = `Pregame total≈ ${preTotal?.toFixed?.(1) ?? '—'}`;
      }

      // Render game card
      const gameEl = document.createElement('div');
      gameEl.className = 'game ' + (status?.toLowerCase?.() || '');
      gameEl.innerHTML = `
        <div class="row teams"><span>${awayTeam}</span><span>@</span><span>${homeTeam}</span></div>
        <div class="row status"><span>${detailed}</span><span class="book-total">${rowNote}</span></div>
        <div class="pitchers">
          <div><strong>Away SP:</strong> ${ap? `${ap.name} — ERA ${ap.era ?? '—'} (${ap.wins ?? '—'}-${ap.losses ?? '—'})` : 'TBD'}</div>
          <div><strong>Home SP:</strong> ${hp? `${hp.name} — ERA ${hp.era ?? '—'} (${hp.wins ?? '—'}-${hp.losses ?? '—'})` : 'TBD'}</div>
        </div>
      `;
      elGamesList.appendChild(gameEl);
    }

    const projected = scoredSum + projectedExtra;

    elRunsScored.textContent = Math.round(scoredSum);
    elProjected.textContent  = Number.isFinite(projected) ? projected.toFixed(1) : '—';
    elFinalCount.textContent = cntFinal;
    elLiveCount.textContent  = cntLive;
    elNSCount.textContent    = cntNS;

  }catch(err){
    console.error(err);
    elProjected.textContent = '—';
  } finally {
    document.body.style.cursor='default';
  }
}

// Auto-refresh every 60s
loadAll();
setInterval(loadAll, 60000);
