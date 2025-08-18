// server/utils/data.js
// Node 18+ 內建 fetch，無需 node-fetch

/* ========== 共用工具 ========== */
const MLB_API = "https://statsapi.mlb.com/api/v1";

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toISO = (s) => (s.includes("/") ? s.replace(/\//g, "-") : s);
const norm = (s) => String(s || "").toLowerCase().trim();

/* in-memory 簡易快取（重啟會清空） */
const CACHE = new Map();
async function cacheGet(key, ttlMs, fetcher) {
  const now = Date.now();
  const hit = CACHE.get(key);
  if (hit && hit.exp > now) return hit.val;
  const val = await fetcher();
  CACHE.set(key, { val, exp: now + ttlMs });
  return val;
}
async function getJSON(url, ttlMs = 60_000) {
  return cacheGet(`json:${url}`, ttlMs, async () => {
    const r = await fetch(url, { headers: { accept: "application/json" } });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
    return r.json();
  });
}
async function getText(url, ttlMs = 6 * 60 * 60 * 1000) {
  return cacheGet(`text:${url}`, ttlMs, async () => {
    const r = await fetch(url, { headers: { accept: "text/plain" } });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
    return r.text();
  });
}

/* ========== MLB ========== */
function nameLike(a, b) {
  const A = norm(a), B = norm(b);
  return A === B || A.includes(B) || B.includes(A);
}
async function mlbFindTeamIdByName(name, season) {
  const data = await getJSON(`${MLB_API}/teams?sportId=1&season=${season}`);
  const hit = (data?.teams || []).find(
    (t) =>
      nameLike(t.name, name) ||
      nameLike(t.teamName, name) ||
      nameLike(t.shortName, name) ||
      nameLike(t.fileCode, name) ||
      nameLike(t.clubName, name)
  );
  if (!hit) {
    const err = new Error(`Unknown MLB team: "${name}". Use official team names.`);
    err.status = 400;
    throw err;
  }
  return { id: hit.id, name: hit.name };
}
async function mlbRecent(teamId, dateISO, n = 5) {
  const end = new Date(dateISO);
  const from = new Date(end);
  from.setDate(from.getDate() - 20);
  const data = await getJSON(
    `${MLB_API}/schedule?sportId=1&teamId=${teamId}&startDate=${ymd(from)}&endDate=${ymd(end)}`
  );
  const games = (data?.dates || []).flatMap((d) => d.games || []).filter((g) => g.status?.codedGameState === "F");
  const last = games.slice(-n);
  let w = 0, l = 0, rf = 0, ra = 0;
  for (const g of last) {
    const home = g.teams.home, away = g.teams.away;
    const isHome = String(home.team.id) === String(teamId);
    const us = isHome ? home : away, opp = isHome ? away : home;
    const usR = Number(us.score || 0), oppR = Number(opp.score || 0);
    rf += usR; ra += oppR;
    if (usR > oppR) w++; else l++;
  }
  return { games: last.length, w, l, ppgFor: last.length ? rf / last.length : 0, ppgAgainst: last.length ? ra / last.length : 0 };
}
async function mlbH2HLast3(aId, bId, dateISO) {
  const end = new Date(dateISO);
  const start = new Date(end);
  start.setDate(start.getDate() - 120);
  const data = await getJSON(
    `${MLB_API}/schedule?sportId=1&teamId=${aId}&startDate=${ymd(start)}&endDate=${ymd(end)}`
  );
  const games = (data?.dates || []).flatMap((d) => d.games || []).filter((g) => {
    const h = g.teams?.home?.team?.id, a = g.teams?.away?.team?.id;
    return g.status?.codedGameState === "F" && ((h === aId && a === bId) || (h === bId && a === aId));
  });
  const last3 = games.slice(-3);
  let aWins = 0, bWins = 0;
  for (const g of last3) {
    const home = g.teams.home, away = g.teams.away;
    const aHome = home.team.id === aId;
    const aScore = aHome ? home.score : away.score;
    const bScore = aHome ? away.score : home.score;
    if (aScore > bScore) aWins++; else bWins++;
  }
  return { count: last3.length, aWins, bWins };
}
async function buildMLBStats({ teamA, teamB, date, location }) {
  const iso = toISO(date);
  const season = iso.slice(0, 4);
  const A = await mlbFindTeamIdByName(teamA, season);
  const B = await mlbFindTeamIdByName(teamB, season);

  const [aR, bR, h2h] = await Promise.all([
    mlbRecent(A.id, iso, 5),
    mlbRecent(B.id, iso, 5),
    mlbH2HLast3(A.id, B.id, iso),
  ]);

  return [
    `MLB 真實資料（Stats API）`,
    `${teamA} 最近 5 場：${aR.w}-${aR.l}，場均得分 ${aR.ppgFor.toFixed(1)}，失分 ${aR.ppgAgainst.toFixed(1)}`,
    `${teamB} 最近 5 場：${bR.w}-${bR.l}，場均得分 ${bR.ppgFor.toFixed(1)}，失分 ${bR.ppgAgainst.toFixed(1)}`,
    `近期交手：近 ${h2h.count} 場 ${teamA} ${h2h.aWins} 勝、${teamB} ${h2h.bWins} 勝`,
    location ? `球場：${location}` : ``,
  ].filter(Boolean).join("\n");
}

/* ========== CPBL ========== */
// 年度戰績（ldkrsi/cpbl-opendata）
const CPBL_STANDINGS =
  "https://raw.githubusercontent.com/ldkrsi/cpbl-opendata/master/CPBL/standings.csv";

const CPBL_NAME_MAP = new Map([
  ["富邦悍將","富邦悍將"],["fubon guardians","富邦悍將"],["guardians","富邦悍將"],
  ["統一獅","統一獅"],["uni-lions","統一獅"],["unilions","統一獅"],["uni lions","統一獅"],
  ["中信兄弟","中信兄弟"],["ctbc brothers","中信兄弟"],["brothers","中信兄弟"],
  ["樂天桃猿","樂天桃猿"],["rakuten monkeys","樂天桃猿"],["monkeys","樂天桃猿"],["rakuten","樂天桃猿"],
  ["味全龍","味全龍"],["weichuan dragons","味全龍"],["dragons","味全龍"],
  ["台鋼雄鷹","台鋼雄鷹"],["tsg hawks","台鋼雄鷹"],["hawks","台鋼雄鷹"],["tsg","台鋼雄鷹"],
]);
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = lines.shift().split(",");
  return lines.map((line) => {
    const cells = line.split(",");
    const row = {};
    header.forEach((h, i) => (row[h.trim()] = (cells[i] ?? "").trim()));
    return row;
  });
}
async function cpblTeamStanding(teamZh) {
  const raw = await getText(CPBL_STANDINGS);
  const rows = parseCSV(raw);
  const byTeam = rows.filter((r) => r.team === teamZh);
  if (!byTeam.length) return null;
  byTeam.sort((a, b) => Number(b.year) - Number(a.year));
  const r = byTeam[0];
  return {
    year: Number(r.year),
    games: Number(r.G || r.GP || 0),
    wins: Number(r.W || 0),
    losses: Number(r.L || 0),
    ties: Number(r.T || 0),
    wpct: r.WPCT ? Number(r.WPCT) : null,
    rs: Number(r.RS || 0),
    ra: Number(r.RA || 0),
  };
}
async function buildCPBLStats({ teamA, teamB, date, location }) {
  const aZh = CPBL_NAME_MAP.get(norm(teamA));
  const bZh = CPBL_NAME_MAP.get(norm(teamB));
  if (!aZh || !bZh) {
    const miss = [!aZh ? teamA : null, !bZh ? teamB : null].filter(Boolean).join(", ");
    const err = new Error(`Unknown CPBL team: "${miss}". 可用：富邦悍將、統一獅、中信兄弟、樂天桃猿、味全龍、台鋼雄鷹`);
    err.status = 400;
    throw err;
  }
  const [aS, bS] = await Promise.all([cpblTeamStanding(aZh), cpblTeamStanding(bZh)]);
  const aLine = aS
    ? `${aZh}（${aS.year} 季）：${aS.wins}-${aS.losses}${aS.ties ? "-" + aS.ties : ""}，勝率 ${aS.wpct ?? "—"}，得 ${aS.rs}、失 ${aS.ra}（場均得分 ${(aS.rs/Math.max(1,aS.games)).toFixed(1)}、場均失分 ${(aS.ra/Math.max(1,aS.games)).toFixed(1)}）`
    : `${aZh}：找不到年度戰績`;
  const bLine = bS
    ? `${bZh}（${bS.year} 季）：${bS.wins}-${bS.losses}${bS.ties ? "-" + bS.ties : ""}，勝率 ${bS.wpct ?? "—"}，得 ${bS.rs}、失 ${bS.ra}（場均得分 ${(bS.rs/Math.max(1,bS.games)).toFixed(1)}、場均失分 ${(bS.ra/Math.max(1,bS.games)).toFixed(1)}）`
    : `${bZh}：找不到年度戰績`;

  return [
    `CPBL 真實資料（opendata standings.csv）`,
    aLine,
    bLine,
    location ? `球場：${location}` : ``,
  ].filter(Boolean).join("\n");
}

/* ========== 統一出口（server 會呼叫這個） ========== */
export async function buildStats({ league, teamA, teamB, date, location }) {
  const lg = String(league || "").toUpperCase();
  if (lg === "MLB") return buildMLBStats({ teamA, teamB, date, location });
  if (lg === "CPBL") return buildCPBLStats({ teamA, teamB, date, location });
  return `${teamA} vs ${teamB}${location ? ` @ ${location}` : ""}`;
}
