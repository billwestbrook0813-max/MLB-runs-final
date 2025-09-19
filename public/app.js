
// ---- Config ----
const STATS_BASE = 'https://statsapi.mlb.com/api';

function dateInPSTISO(d = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
  return fmt.format(d);
}
const TODAY_ISO = dateInPSTISO();

async function fetchSchedule(dateISO){
  const url = `${STATS_BASE}/v1/schedule?sportId=1&date=${dateISO}`;
  const r = await fetch(url);
  const j = await r.json();
  return j.dates?.[0]?.games || [];
}

async function loadAll(){
  let games = await fetchSchedule(TODAY_ISO);
  if (!games.length) {
    const t = new Date(); t.setDate(t.getDate()+1);
    games = await fetchSchedule(dateInPSTISO(t));
    document.body.insertAdjacentHTML('afterbegin','<p>Showing next slate</p>');
  }
  document.getElementById('gamesList').innerHTML = games.map(g =>
    `<div>${g.teams.away.team.name} @ ${g.teams.home.team.name}</div>`).join('');
}
loadAll();
