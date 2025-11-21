import { scrapeCPBLSchedule, buildCPBLStats } from "./cpbl.js";
import { buildMLBStats } from "./mlb.js";
import { buildNBAStats } from "./nba.js"; // ✅ 使用 nba.js

/* ───── 工具 ───── */
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/* ───── 資料快取 ───── */
const CACHE = new Map();
async function cacheGet(key, ttlMs, fetcher) {
  const now = Date.now();
  const hit = CACHE.get(key);
  if (hit && hit.exp > now) return hit.val;
  const val = await fetcher();
  CACHE.set(key, { val, exp: now + ttlMs });
  return val;
}
async function getJSON(url, ttlMs = 60000) {
  return cacheGet(`json:${url}`, ttlMs, async () => {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return res.json();
  });
}

/* ───── 勝率模型 ───── */
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

  const recentWinRateA = rA.wins / Math.max(1, rA.games);
  const recentWinRateB = rB.wins / Math.max(1, rB.games);
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
    [teamB]: Number(pctB.toFixed(1)),
  };
}

/* ───── 主輸出 ───── */
async function buildStats({ league, ...rest }) {
  if (league === "MLB") return await buildMLBStats(rest);
  if (league === "CPBL") return await buildCPBLStats(rest);
  if (league === "NBA") return await buildNBAStats(rest);
  const err = new Error(`Unsupported league: ${league}`);
  err.status = 400;
  throw err;
}

export {
  buildStats,
  buildMLBStats,
  buildCPBLStats,
  buildNBAStats,
  calculateWinRates,
  getJSON,
  ymd,
};
