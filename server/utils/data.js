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

/* ───── 加權勝率計算 ───── */
function calculateWinRates({ teamA, teamB, stats }) {
  const sA = stats.seasonStats?.[teamA] || {};
  const sB = stats.seasonStats?.[teamB] || {};
  const rA = stats.recentStats?.[teamA] || {};
  const rB = stats.recentStats?.[teamB] || {};
  const h2h = stats.h2hStats || {};

  // 總成績加權 30%
  const totalGamesA = sA.games || 0;
  const totalGamesB = sB.games || 0;
  const winRateA_season = totalGamesA ? sA.wins / totalGamesA : 0.5;
  const winRateB_season = totalGamesB ? sB.wins / totalGamesB : 0.5;

  // 近期戰績：最近10場、11-20場、21場以上
  const recentWinRateA = rA.w / Math.max(1, rA.games);
  const recentWinRateB = rB.w / Math.max(1, rB.games);

  const recentWeightedA = recentWinRateA * 0.4 + winRateA_season * 0.6;
  const recentWeightedB = recentWinRateB * 0.4 + winRateB_season * 0.6;

  // 對戰成績 30%
  const h2hCount = h2h.count || 0;
  const h2hWinRateA = h2hCount ? h2h.aWins / h2hCount : 0.5;
  const h2hWinRateB = h2hCount ? h2h.bWins / h2hCount : 0.5;

  // 加權：總成績 30%、對戰 30%、近期 40%
  const scoreA = winRateA_season * 0.3 + h2hWinRateA * 0.3 + recentWeightedA * 0.4;
  const scoreB = winRateB_season * 0.3 + h2hWinRateB * 0.3 + recentWeightedB * 0.4;

  // 正規化為加總 100
  const sum = scoreA + scoreB;
  const pctA = sum > 0 ? (scoreA * 100) / sum : 50;
  const pctB = 100 - pctA;

  return {
    [teamA]: Number(pctA.toFixed(1)),
    [teamB]: Number(pctB.toFixed(1))
  };
}

/* ───── 匯出 ───── */
export {
  buildStats,
  buildMLBStats,
  buildCPBLStats
};
