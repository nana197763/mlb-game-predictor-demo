// server/utils/data.js
// ─────────────────────────────────────────────────────────────
// MLB：使用官方 Stats API（最近5場、近3場交手、球場/先發）
// CPBL：使用 ldkrsi/cpbl-opendata 的 standings.csv（年度戰績，真實資料）
//     ：「近期5場 / 近3場交手」保留 provider 鉤子（預設關閉，等你指定來源再開）
// Node 18+ 內建 fetch 可用
// ─────────────────────────────────────────────────────────────

/* ===================== 共用工具 ===================== */
const pad = (x) => String(x).padStart(2, "0");
const norm = (s) =>
  String(s || "").toLowerCase().replace(/[^a-z0-9 \u4e00-\u9fa5]/g, " ").replace(/\s+/g, " ").trim();
const toISO = (d) => (d.includes("/") ? d.replace(/\//g, "-") : d);
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

async function getJSON(url) {
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.json();
}
async function getText(url) {
  const r = await fetch(url, { headers: { accept: "text/plain" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.text();
}

/* ===================== MLB 真實資料 ===================== */
const MLB_API = "https://statsapi.mlb.com/api/v1";

function nameLike(a, b) {
  const na = norm(a), nb = norm(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

async function mlbFindTeamIdByName(name, season) {
  const data = await getJSON(`${MLB_API}/teams?sportId=1&season=${season}`);
  const hit = (data?.teams || []).find((t) =>
    nameLike(t.name, name) ||
    nameLike(t.teamName, name) ||
    nameLike(t.shortName, name) ||
    nameLike(t.fileCode, name) ||
    nameLike(t.clubName, name)
  );
  if (!hit) throw new Error(`MLB team not found: ${name}`);
  return { id: hit.id, name: hit.name };
}

async function mlbRecentResults(teamId, dateISO, n = 5) {
  const end = new Date(dateISO);
  const from = new Date(end);
  from.setDate(from.getDate() - 20);
  const url = `${MLB_API}/schedule?sportId=1&teamId=${teamId}&startDate=${ymd(from)}&endDate=${ymd(end)}`;
  const dates = (await getJSON(url))?.dates || [];
  const games = dates.flatMap((d) => d.games || []).filter((g) => g.status?.codedGameState === "F");
  const last = games.slice(-n);
  let wins = 0, losses = 0, runsFor = 0, runsAgainst = 0;
  for (const g of last) {
    const home = g.teams.home, away = g.teams.away;
    const isHome = String(home.team.id) === String(teamId);
    const us = isHome ? home : away, opp = isHome ? away : home;
    const usR = Number(us.score || 0), oppR = Number(opp.score || 0);
    runsFor += usR; runsAgainst += oppR;
    if (usR > oppR) wins++; else losses++;
  }
  return {
    games: last.length,
    wins, losses,
    runsFor, runsAgainst,
    ppgFor: last.length ? runsFor / last.length : 0,
    ppgAgainst: last.length ? runsAgainst / last.length : 0
  };
}

async function mlbFindMatchup({ teamAId, teamBId, dateISO }) {
  const data = await getJSON(`${MLB_API}/schedule?sportId=1&teamId=${teamAId}&date=${dateISO}`);
  const games = (data?.dates?.[0]?.games || []);
  const g = games.find((gm) => {
    const h = gm.teams?.home?.team?.id, a = gm.teams?.away?.team?.id;
    return (h === teamAId && a === teamBId) || (h === teamBId && a === teamAId);
  }) || games[0];
  if (!g) return { venue: null, probable: null };
  return {
    venue: g?.venue?.name || null,
    probable: {
      home: g?.teams?.home?.probablePitcher?.fullName || null,
      away: g?.teams?.away?.probablePitcher?.fullName || null
    }
  };
}

async function mlbHeadToHeadLast3(teamAId, teamBId, dateISO) {
  const end = new Date(dateISO);
  const start = new Date(end);
  start.setDate(start.getDate() - 120);
  const dataA = await getJSON(`${MLB_API}/schedule?sportId=1&teamId=${teamAId}&startDate=${ymd(start)}&endDate=${ymd(end)}`);
  const games = (dataA?.dates || [])
    .flatMap((d) => d.games || [])
    .filter((g) => {
      const h = g.teams?.home?.team?.id, a = g.teams?.away?.team?.id;
      return g.status?.codedGameState === "F" && ((h === teamAId && a === teamBId) || (h === teamBId && a === teamAId));
    });
  const last3 = games.slice(-3);
  let aWins = 0, bWins = 0;
  for (const g of last3) {
    const home = g.teams.home, away = g.teams.away;
    const aHome = home.team.id === teamAId;
    const aScore = aHome ? home.score : away.score;
    const bScore = aHome ? away.score : home.score;
    if (aScore > bScore) aWins++; else bWins++;
  }
  return { aWins, bWins, count: last3.length };
}

export async function buildMLBStats({ teamA, teamB, date, location }) {
  const iso = toISO(date);
  const season = iso.slice(0, 4);
  const A = await mlbFindTeamIdByName(teamA, season);
  const B = await mlbFindTeamIdByName(teamB, season);

  const [aRecent, bRecent, matchup, h2h] = await Promise.all([
    mlbRecentResults(A.id, iso, 5),
    mlbRecentResults(B.id, iso, 5),
    mlbFindMatchup({ teamAId: A.id, teamBId: B.id, dateISO: iso }),
    mlbHeadToHeadLast3(A.id, B.id, iso)
  ]);

  const venueStr = matchup.venue ? `球場：${matchup.venue}` : (location ? `球場：${location}` : "");
  const probStr = (matchup.probable?.home || matchup.probable?.away)
    ? `預計先發：主隊 ${matchup.probable.home || "TBD"}；客隊 ${matchup.probable.away || "TBD"}`
    : `預計先發：暫無`;

  return (
`MLB 真實資料（Stats API）
${teamA} 最近 5 場：${aRecent.wins} 勝 ${aRecent.losses} 敗，場均得分 ${aRecent.ppgFor.toFixed(1)}，失分 ${aRecent.ppgAgainst.toFixed(1)}
${teamB} 最近 5 場：${bRecent.wins} 勝 ${bRecent.losses} 敗，場均得分 ${bRecent.ppgFor.toFixed(1)}，失分 ${bRecent.ppgAgainst.toFixed(1)}
近期交手：近 ${h2h.count} 場 ${teamA} ${h2h.aWins} 勝、${teamB} ${h2h.bWins} 勝
${venueStr}
${probStr}`
  );
}

/* ===================== CPBL 真實資料（年度戰績） ===================== */
// 來源：ldkrsi/cpbl-opendata / CPBL/standings.csv（MIT 授權）
const CPBL_STANDINGS_RAW =
  "https://raw.githubusercontent.com/ldkrsi/cpbl-opendata/master/CPBL/standings.csv";

// 若要擴充「近期 N 場 / 近 M 場交手」，開啟 provider（預設 false）
const USE_CPBL_OFFICIAL_SCHEDULE = false; // 官網解析（等你同意指定來源後再開）
const USE_THIRDPARTY_FIXTURES   = false;  // 第三方（可能有 TOS 限制，不建議）

const CPBL_NAME_MAP = new Map([
  ["fubon guardians","富邦悍將"],["guardians","富邦悍將"],["富邦悍將","富邦悍將"],
  ["uni-lions","統一獅"],["unilions","統一獅"],["uni lions","統一獅"],["統一獅","統一獅"],
  ["ctbc brothers","中信兄弟"],["brothers","中信兄弟"],["中信兄弟","中信兄弟"],
  ["rakuten monkeys","樂天桃猿"],["monkeys","樂天桃猿"],["rakuten","樂天桃猿"],["樂天桃猿","樂天桃猿"],
  ["wei chuan dragons","味全龍"],["weichuan dragons","味全龍"],["dragons","味全龍"],["味全龍","味全龍"],
  ["tsg hawks","台鋼雄鷹"],["hawks","台鋼雄鷹"],["tsg","台鋼雄鷹"],["台鋼雄鷹","台鋼雄鷹"],
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
  const raw = await getText(CPBL_STANDINGS_RAW);
  const rows = parseCSV(raw);
  const byTeam = rows.filter((r) => r.team === teamZh);
  if (!byTeam.length) return null;
  byTeam.sort((a, b) => Number(b.year) - Number(a.year)); // 最近年度
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

// 預留：近期/交手（等你指定來源後實作）
async function cpblRecentNGames(/* teamZh, dateISO, n */) {
  if (!USE_CPBL_OFFICIAL_SCHEDULE && !USE_THIRDPARTY_FIXTURES) return null;
  return null;
}
async function cpblHeadToHead(/* aZh, bZh, dateISO, m */) {
  if (!USE_CPBL_OFFICIAL_SCHEDULE && !USE_THIRDPARTY_FIXTURES) return null;
  return null;
}
const formatRecent = (teamZh, recent) => {
  if (!recent) return "";
  const { wins, losses, runsFor, runsAgainst, games } = recent;
  const ppgF = games ? (runsFor / games).toFixed(1) : "0.0";
  const ppgA = games ? (runsAgainst / games).toFixed(1) : "0.0";
  return `${teamZh} 近期 ${games} 場：${wins} 勝 ${losses} 敗，場均得分 ${ppgF}，失分 ${ppgA}`;
};
const formatH2H = (aZh, bZh, h2h) => (h2h ? `近期交手：近 ${h2h.count} 場 ${aZh} ${h2h.aWins} 勝、${bZh} ${h2h.bWins} 勝` : "");

export async function buildCPBLStats({ teamA, teamB, date, location }) {
  const iso = toISO(date);
  const aZh = CPBL_NAME_MAP.get(norm(teamA)) || teamA;
  const bZh = CPBL_NAME_MAP.get(norm(teamB)) || teamB;

  const [aSeason, bSeason] = await Promise.all([
    cpblTeamStanding(aZh),
    cpblTeamStanding(bZh),
  ]);
  const [aRecent, bRecent] = await Promise.all([
    cpblRecentNGames(aZh, iso, 5),
    cpblRecentNGames(bZh, iso, 5),
  ]);
  const h2h = await cpblHeadToHead(aZh, bZh, iso, 3);

  const aLine = aSeason
    ? `${aZh}（${aSeason.year} 季）：${aSeason.wins} 勝 ${aSeason.losses} 敗${aSeason.ties ? " " + aSeason.ties + " 和" : ""}，勝率 ${aSeason.wpct ?? "—"}，得分 ${aSeason.rs}、失分 ${aSeason.ra}`
    : `${aZh}：找不到年度戰績`;
  const bLine = bSeason
    ? `${bZh}（${bSeason.year} 季）：${bSeason.wins} 勝 ${bSeason.losses} 敗${bSeason.ties ? " " + bSeason.ties + " 和" : ""}，勝率 ${bSeason.wpct ?? "—"}，得分 ${bSeason.rs}、失分 ${bSeason.ra}`
    : `${bZh}：找不到年度戰績`;

  const loc = location ? `球場：${location}` : "";
  const aRecentLine = formatRecent(aZh, aRecent);
  const bRecentLine = formatRecent(bZh, bRecent);
  const h2hLine = formatH2H(aZh, bZh, h2h);

  return [
    `CPBL 真實資料（年度戰績：cpbl-opendata / standings.csv）`,
    aLine,
    bLine,
    aRecentLine,
    bRecentLine,
    h2hLine,
    loc,
    `※ 如要啟用「近期/交手」，告訴我來源，我就把 provider 打開並實作。`
  ].filter(Boolean).join("\n");
}

/* ===================== 統一入口 ===================== */
export async function buildStats({ league, teamA, teamB, date, location }) {
  const lg = String(league || "").toUpperCase();
  if (lg === "MLB")  return buildMLBStats({ teamA, teamB, date, location });
  if (lg === "CPBL") return buildCPBLStats({ teamA, teamB, date, location });
  return `${teamA} vs ${teamB} @ ${location || ""}`;
}
