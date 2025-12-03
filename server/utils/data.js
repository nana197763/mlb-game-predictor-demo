// server/utils/data.js
import { buildMLBStats } from "./mlb.js";
import { buildCPBLStats } from "./cpbl.js";
import { buildNBAStats } from "./nba.js";

/** 勝率計算（沿用你原本的邏輯） */
function calculateWinRates({ teamA, teamB, stats }) {
  const sA = stats.seasonStats?.[teamA] || {};
  const sB = stats.seasonStats?.[teamB] || {};
  const rA = stats.recentStats?.[teamA] || {};
  const rB = stats.recentStats?.[teamB] || {};
  const h2h = stats.h2hStats || {};

  const totalGamesA = sA.games || sA.GP || 0;
  const totalGamesB = sB.games || sB.GP || 0;

  const winRateA_season = totalGamesA
    ? (sA.wins ?? sA.W ?? 0) / totalGamesA
    : 0.5;
  const winRateB_season = totalGamesB
    ? (sB.wins ?? sB.W ?? 0) / totalGamesB
    : 0.5;

  const recentGamesA = rA.games || rA.GP || 0;
  const recentGamesB = rB.games || rB.GP || 0;

  const recentWinRateA = recentGamesA
    ? (rA.wins ?? rA.W ?? rA.w ?? 0) / recentGamesA
    : winRateA_season;

  const recentWinRateB = recentGamesB
    ? (rB.wins ?? rB.W ?? rB.w ?? 0) / recentGamesB
    : winRateB_season;

  const recentWeightedA = recentWinRateA * 0.4 + winRateA_season * 0.6;
  const recentWeightedB = recentWinRateB * 0.4 + winRateB_season * 0.6;

  const h2hCount = h2h.count || 0;
  const h2hWinRateA = h2hCount ? h2h.aWins / h2hCount : 0.5;
  const h2hWinRateB = h2hCount ? h2h.bWins / h2hCount : 0.5;

  const scoreA =
    winRateA_season * 0.3 + h2hWinRateA * 0.3 + recentWeightedA * 0.4;
  const scoreB =
    winRateB_season * 0.3 + h2hWinRateB * 0.3 + recentWeightedB * 0.4;

  const sum = scoreA + scoreB;
  const pctA = sum > 0 ? (scoreA * 100) / sum : 50;
  const pctB = 100 - pctA;

  return {
    [teamA]: Number(pctA.toFixed(1)),
    [teamB]: Number(pctB.toFixed(1)),
  };
}

/** 🔥 新增：依聯盟 + 勝率 → 預測比分 */
/** 🔥 高級比分預測：依聯盟特性 + 勝率 + pace 調整 */
function predictScore({ league, teamA, teamB, winRate }) {
  const pA = (winRate[teamA] ?? 50) / 100;
  const pB = (winRate[teamB] ?? 50) / 100;
  const sumP = pA + pB || 1;
  const wA = pA / sumP;
  const wB = pB / sumP;

  let baseTotal;

  /* -------------------------------
     聯盟平均總分（真實比賽水準）
  -------------------------------- */
  if (league === "MLB") {
    baseTotal = 8.6;   // MLB 真實平均總分（2023-2024）
  } else if (league === "CPBL") {
    baseTotal = 11.4;  // CPBL 常年偏高
  } else if (league === "NBA") {
    baseTotal = 227;   // NBA 2024-2025 平均 Pace
  } else {
    baseTotal = 10;
  }

  /* -------------------------------
     聯盟得分分布修正
  -------------------------------- */
  function applyVariance(score, league) {
    if (league === "MLB") {
      return Math.round(score + randRange(-2, 2));
    }
    if (league === "CPBL") {
      return Math.round(score + randRange(-3, 3));
    }
    if (league === "NBA") {
      return Math.round(score + randRange(-8, 8));
    }
    return Math.round(score);
  }

  function randRange(min, max) {
    return Math.random() * (max - min) + min;
  }

  let rawA = baseTotal * wA;
  let rawB = baseTotal * wB;

  let sA = applyVariance(rawA, league);
  let sB = applyVariance(rawB, league);

  /* -------------------------------
     分數必要限制
  -------------------------------- */
  if (league !== "NBA") {
    sA = Math.max(0, sA);
    sB = Math.max(0, sB);
  }

  // 避免平手 → 讓勝率高者贏
  if (sA === sB) {
    if (wA > wB) sA += 1;
    else sB += 1;
  }

  /* -------------------------------
     大小分預測
  -------------------------------- */
  const total = sA + sB;
  const line = Math.round(baseTotal * (league === "NBA" ? 1 : 1)); // 可日後自動抓 Vegas

  const overUnder =
    total > line
      ? `預測大分（Total: ${total} > Line: ${line}）`
      : `預測小分（Total: ${total} < Line: ${line}）`;

  return {
    [teamA]: sA,
    [teamB]: sB,
    total,
    line,
    overUnder,
  };
}


/** 依聯盟組裝 stats（沿用你原本邏輯） */
async function buildStats({ league, ...rest }) {
  if (league === "MLB") return buildMLBStats(rest);
  if (league === "CPBL") return buildCPBLStats(rest);
  if (league === "NBA") return buildNBAStats(rest);
  throw new Error(`Unsupported league: ${league}`);
}

export {
  buildStats,
  buildMLBStats,
  buildCPBLStats,
  buildNBAStats,
  calculateWinRates,
  predictScore,   // ⚠️ 記得 export 出去
};
