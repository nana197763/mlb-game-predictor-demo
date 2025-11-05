// server/utils/data.js

import { scrapeCPBLSchedule } from "./cpbl.js";

/* ───── 共用工具 ───── */
const MLB_API = "https://statsapi.mlb.com/api/v1";
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toISO = (s) => (s?.includes("/") ? s.replace(/\//g, "-") : s);
const norm = (s) => String(s || "").toLowerCase().trim();

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

/* ───── 勝率計算（通用）───── */
function calculateWinRates({ teamA, teamB, stats }) {
  const sA = stats.seasonStats?.[teamA] || {};
  const sB = stats.seasonStats?.[teamB] || {};
  const rA = stats.recentStats?.[teamA] || {};
  const rB = stats.recentStats?.[teamB] || {};
  const h2h = stats.h2hStats || {};

  const totalGamesA = sA.games || 0;
  const totalGamesB = sB.games || 0;
  const winRateA_season = totalGamesA ? sA.wins / totalGamesA : 0.5;
  const winRateB_season = totalGamesB ? sB.wins / totalGamesB : 0.5;

  const recentWinRateA = rA.w / Math.max(1, rA.games);
  const recentWinRateB = rB.w / Math.max(1, rB.games);

  const recentWeightedA = recentWinRateA * 0.4 + winRateA_season * 0.6;
  const recentWeightedB = recentWinRateB * 0.4 + winRateB_season * 0.6;

  const h2hCount = h2h.count || 0;
  const h2hWinRateA = h2hCount ? h2h.aWins / h2hCount : 0.5;
  const h2hWinRateB = h2hCount ? h2h.bWins / h2hCount : 0.5;

  const scoreA = winRateA_season * 0.3 + h2hWinRateA * 0.3 + recentWeightedA * 0.4;
  const scoreB = winRateB_season * 0.3 + h2hWinRateB * 0.3 + recentWeightedB * 0.4;

  const sum = scoreA + scoreB;
  const pctA = sum > 0 ? (scoreA * 100) / sum : 50;
  const pctB = 100 - pctA;

  return {
    [teamA]: Number(pctA.toFixed(1)),
    [teamB]: Number(pctB.toFixed(1))
  };
}

/* ───── CPBL ───── */
const CPBL_STANDINGS = "https://raw.githubusercontent.com/ldkrsi/cpbl-opendata/master/CPBL/standings.csv";
const CPBL_NAME_MAP = new Map([
  ["富邦悍將", "富邦悍將"], ["fubon guardians", "富邦悍將"], ["guardians", "富邦悍將"],
  ["統一獅", "統一獅"], ["uni-lions", "統一獅"], ["unilions", "統一獅"], ["uni lions", "統一獅"],
  ["中信兄弟", "中信兄弟"], ["ctbc brothers", "中信兄弟"], ["brothers", "中信兄弟"],
  ["樂天桃猿", "樂天桃猿"], ["rakuten monkeys", "樂天桃猿"], ["monkeys", "樂天桃猿"], ["rakuten", "樂天桃猿"],
  ["味全龍", "味全龍"], ["weichuan dragons", "味全龍"], ["dragons", "味全龍"],
  ["台鋼雄鷹", "台鋼雄鷹"], ["tsg hawks", "台鋼雄鷹"], ["hawks", "台鋼雄鷹"], ["tsg", "台鋼雄鷹"]
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
    const err = new Error(`Unknown CPBL team: "${miss}".`);
    err.status = 400;
    throw err;
  }
  const iso = toISO(date);
  const scraped = await scrapeCPBLSchedule({ dateISO: iso, teamA: aZh, teamB: bZh });
  if (!scraped) {
    const err = new Error(`No CPBL game found for ${iso} between ${aZh} and ${bZh}.`);
    err.status = 400;
    throw err;
  }

  const [aS, bS] = await Promise.all([cpblTeamStanding(aZh), cpblTeamStanding(bZh)]);
  const aLine = aS ? `${aZh} ${aS.year}：${aS.wins}-${aS.losses}${aS.ties ? "-" + aS.ties : ""}` : `${aZh}：查無戰績`;
  const bLine = bS ? `${bZh} ${bS.year}：${bS.wins}-${bS.losses}${bS.ties ? "-" + bS.ties : ""}` : `${bZh}：查無戰績`;
  const text = [
    `CPBL 官網 + opendata`,
    aLine,
    bLine,
    `球場：${scraped.venue || "N/A"}`,
    `先發投手：${aZh}：${scraped.pitcherA || "未定"}；${bZh}：${scraped.pitcherB || "未定"}`
  ].join("\n");

  return {
    text,
    location: scraped.venue || null,
    pitchersByTeam: {
      [teamA]: scraped.pitcherA || "未定",
      [teamB]: scraped.pitcherB || "未定"
    },
    injuriesByTeam: {
      [teamA]: [],
      [teamB]: []
    },
    seasonStats: {
      [teamA]: aS || {},
      [teamB]: bS || {}
    },
    recentStats: {},
    h2hStats: {}
  };
}

/* ───── 匯出 ───── */
export {
  calculateWinRates,
  buildCPBLStats
  // 如果還有 buildStats, buildMLBStats，請在此加入
};