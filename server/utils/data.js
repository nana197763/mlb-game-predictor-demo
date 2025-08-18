// server/utils/data.js
// Node 18+ 內建 fetch，無需 node-fetch
import { scrapeCPBLSchedule } from "./cpbl.js";

/* ───── 共用 ───── */
const MLB_API = "https://statsapi.mlb.com/api/v1";

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toISO = (s) => (s?.includes("/") ? s.replace(/\//g, "-") : s);
const norm = (s) => String(s || "").toLowerCase().trim();

/* 極簡快取（重啟即清） */
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

/* ───── MLB ───── */
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

/** 整季戰績（季初至指定日） */
async function mlbSeasonRecord(teamId, dateISO) {
  const end = new Date(dateISO);
  const seasonStart = new Date(end.getFullYear(), 2, 1); // 3/1 起
  const data = await getJSON(
    `${MLB_API}/schedule?sportId=1&teamId=${teamId}&startDate=${ymd(seasonStart)}&endDate=${ymd(end)}`
  );
  const games = (data?.dates || []).flatMap((d) => d.games || []).filter((g) => g.status?.codedGameState === "F");
  let w = 0, l = 0, t = 0, rs = 0, ra = 0;
  for (const g of games) {
    const home = g.teams.home, away = g.teams.away;
    const isHome = String(home.team.id) === String(teamId);
    const us = isHome ? home : away, opp = isHome ? away : home;
    const usR = Number(us.score || 0), oppR = Number(opp.score || 0);
    rs += usR; ra += oppR;
    if (usR > oppR) w++; else if (usR < oppR) l++; else t++;
  }
  return { games: games.length, wins: w, losses: l, ties: t, rs, ra };
}

/** 近期戰績（近 N 場） */
async function mlbRecent(teamId, dateISO, n = 5) {
  const end = new Date(dateISO);
  const from = new Date(end); from.setDate(from.getDate() - 20);
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

/** 近 3 場對戰 */
async function mlbH2HLast3(aId, bId, dateISO) {
  const end = new Date(dateISO);
  const start = new Date(end); start.setDate(start.getDate() - 120);
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

/** 指定日 probable 先發投手 + 場地（含主客隊 id） */
async function mlbProbables({ aId, bId, dateISO }) {
  const data = await getJSON(`${MLB_API}/schedule?sportId=1&teamId=${aId}&date=${dateISO}`, 30_000);
  const games = (data?.dates?.[0]?.games || []).filter((g) => {
    const h = g.teams?.home?.team?.id, a = g.teams?.away?.team?.id;
    return (h === aId && a === bId) || (h === bId && a === aId);
  });
  const g = games[0];
  if (!g) return { venue: null, homeTeamId: null, awayTeamId: null, home: null, away: null };
  const pHome = g?.probablePitchers?.home?.fullName || g?.probablePitchers?.home?.name;
  const pAway = g?.probablePitchers?.away?.fullName || g?.probablePitchers?.away?.name;
  return {
    venue: g?.venue?.name || null,
    homeTeamId: g?.teams?.home?.team?.id || null,
    awayTeamId: g?.teams?.away?.team?.id || null,
    home: pHome || null,
    away: pAway || null
  };
}

/** 傷兵（暫無穩定公開端點；保留空陣列） */
async function mlbInjuries(_) { return []; }

async function buildMLBStats({ teamA, teamB, date }) {
  const iso = toISO(date);
  const season = iso.slice(0, 4);
  const A = await mlbFindTeamIdByName(teamA, season);
  const B = await mlbFindTeamIdByName(teamB, season);

  const [aSeason, bSeason, aRecent, bRecent, h2h, probables, aInj, bInj] = await Promise.all([
    mlbSeasonRecord(A.id, iso),
    mlbSeasonRecord(B.id, iso),
    mlbRecent(A.id, iso, 5),
    mlbRecent(B.id, iso, 5),
    mlbH2HLast3(A.id, B.id, iso),
    mlbProbables({ aId: A.id, bId: B.id, dateISO: iso }),
    mlbInjuries(A.id),
    mlbInjuries(B.id)
  ]);

  if (!probables.homeTeamId || !probables.awayTeamId) {
    const err = new Error(`No scheduled MLB game for ${teamA} vs ${teamB} on ${iso}.`);
    err.status = 400;
    throw err;
  }

  let pitcherA = "未定", pitcherB = "未定";
  if (probables.homeTeamId === A.id) { pitcherA = probables.home || "未定"; pitcherB = probables.away || "未定"; }
  else if (probables.awayTeamId === A.id) { pitcherA = probables.away || "未定"; pitcherB = probables.home || "未定"; }

  const venueStr = probables.venue || null;

  const text = [
    `MLB 真實資料（Stats API）`,
    `${teamA} 整季：${aSeason.wins}-${aSeason.losses}${aSeason.ties ? "-" + aSeason.ties : ""}（${season}），總得 ${aSeason.rs}、總失 ${aSeason.ra}`,
    `${teamB} 整季：${bSeason.wins}-${bSeason.losses}${bSeason.ties ? "-" + bSeason.ties : ""}（${season}），總得 ${bSeason.rs}、總失 ${bSeason.ra}`,
    `${teamA} 近 5 場：${aRecent.w}-${aRecent.l}，場均得 ${aRecent.ppgFor.toFixed(1)}、失 ${aRecent.ppgAgainst.toFixed(1)}`,
    `${teamB} 近 5 場：${bRecent.w}-${bRecent.l}，場均得 ${bRecent.ppgFor.toFixed(1)}、失 ${bRecent.ppgAgainst.toFixed(1)}`,
    `近 3 場交手：${teamA} ${h2h.aWins} 勝，${teamB} ${h2h.bWins} 勝`,
    venueStr ? `球場：${venueStr}` : ``,
  ].filter(Boolean).join("\n");

  return {
    text,
    location: venueStr,
    pitchersByTeam: { [teamA]: pitcherA, [teamB]: pitcherB },
    injuriesByTeam: { [teamA]: aInj, [teamB]: bInj },
  };
}

/* ───── CPBL ───── */
// 備註：opendata 仍提供整季戰績；但球場/先發改由爬官網補足（若抓不到就視為當日無賽或無資料）
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

async function buildCPBLStats({ teamA, teamB, date }) {
  const aZh = CPBL_NAME_MAP.get(norm(teamA));
  const bZh = CPBL_NAME_MAP.get(norm(teamB));
  if (!aZh || !bZh) {
    const miss = [!aZh ? teamA : null, !bZh ? teamB : null].filter(Boolean).join(", ");
    const err = new Error(`Unknown CPBL team: "${miss}". 可用：富邦悍將、統一獅、中信兄弟、樂天桃猿、味全龍、台鋼雄鷹`);
    err.status = 400;
    throw err;
  }

  const iso = toISO(date);

  // 1) 官網爬取：必須抓到「當日這兩隊對戰的卡片」，否則回 400（不出預測）
  const scraped = await scrapeCPBLSchedule({ dateISO: iso, teamA: aZh, teamB: bZh });
  if (!scraped) {
    const err = new Error(`CPBL 官網未找到 ${iso} 的 ${aZh} vs ${bZh} 對戰或資料。`);
    err.status = 400;
    throw err;
  }

  // 2) opendata：整季戰績（顯示於摘要）
  const [aS, bS] = await Promise.all([cpblTeamStanding(aZh), cpblTeamStanding(bZh)]);
  const aLine = aS
    ? `${aZh} 整季（${aS.year}）：${aS.wins}-${aS.losses}${aS.ties ? "-" + aS.ties : ""}；總得 ${aS.rs}、總失 ${aS.ra}（場均得 ${(aS.rs/Math.max(1,aS.games)).toFixed(1)}、場均失 ${(aS.ra/Math.max(1,aS.games)).toFixed(1)}）`
    : `${aZh}：找不到年度戰績`;
  const bLine = bS
    ? `${bZh} 整季（${bS.year}）：${bS.wins}-${bS.losses}${bS.ties ? "-" + bS.ties : ""}；總得 ${bS.rs}、總失 ${bS.ra}（場均得 ${(bS.rs/Math.max(1,bS.games)).toFixed(1)}、場均失 ${(bS.ra/Math.max(1,bS.games)).toFixed(1)}）`
    : `${bZh}：找不到年度戰績`;

  const text = [
    `CPBL 官網 + opendata`,
    aLine, bLine,
    `球場：${scraped.venue || "未提供"}`,
    `先發投手：${aZh}：${scraped.pitcherA || "未定"}；${bZh}：${scraped.pitcherB || "未定"}`
  ].join("\n");

  return {
    text,
    location: scraped.venue || null,
    pitchersByTeam: { [teamA]: scraped.pitcherA || "未定", [teamB]: scraped.pitcherB || "未定" },
    injuriesByTeam: { [teamA]: [], [teamB]: [] }, // 官網傷兵無穩定欄位，先留空
  };
}

/* ───── 統一出口 ───── */
export async function buildStats({ league, teamA, teamB, date }) {
  const lg = String(league || "").toUpperCase();
  if (lg === "MLB") return buildMLBStats({ teamA, teamB, date });
  if (lg === "CPBL") return buildCPBLStats({ teamA, teamB, date });
  const err = new Error(`Unsupported league: ${league}`);
  err.status = 400;
  throw err;
}
