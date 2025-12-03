// server/utils/data.js
import { buildMLBStats } from "./mlb.js";
import { buildCPBLStats } from "./cpbl.js";
import { buildNBAStats } from "./nba.js";

/** 安全勝率：沒資料就 0.5 */
function safeRate(wins, games) {
  if (!games || games <= 0) return 0.5;
  return wins / games;
}

/**
 * 統一勝率計算：
 * 季賽 30% + 近期 30% + 對戰 15% + 先發 20% + 主場 5%
 * teamDetails 可以覆蓋掉原本的 seasonStats / recentStats
 */
function calculateWinRates({ teamA, teamB, stats }) {
  const teamDetails = stats.teamDetails || {};
  const tdA = teamDetails[teamA] || {};
  const tdB = teamDetails[teamB] || {};

  const sA = stats.seasonStats?.[teamA] || {};
  const sB = stats.seasonStats?.[teamB] || {};
  const rA = stats.recentStats?.[teamA] || {};
  const rB = stats.recentStats?.[teamB] || {};
  const h2h = stats.h2hStats || {};

  const seasonWinRateA = tdA.seasonWinRate ?? safeRate(sA.wins, sA.games);
  const seasonWinRateB = tdB.seasonWinRate ?? safeRate(sB.wins, sB.games);

  const recentWinRateA = tdA.recentWinRate ?? safeRate(rA.wins, rA.games);
  const recentWinRateB = tdB.recentWinRate ?? safeRate(rB.wins, rB.games);

  const h2hCount = h2h.count || 0;
  const h2hWinRateA =
    tdA.h2hWinRate ?? (h2hCount ? h2h.aWins / h2hCount : 0.5);
  const h2hWinRateB =
    tdB.h2hWinRate ?? (h2hCount ? h2h.bWins / h2hCount : 0.5);

  const starterRatingA = tdA.starterRating ?? 0.5;
  const starterRatingB = tdB.starterRating ?? 0.5;

  const homeAdvantageA = tdA.homeAdvantage ?? 0;
  const homeAdvantageB = tdB.homeAdvantage ?? 0;

  const scoreA =
    seasonWinRateA * 0.3 +
    recentWinRateA * 0.3 +
    h2hWinRateA * 0.15 +
    starterRatingA * 0.2 +
    homeAdvantageA * 0.05;

  const scoreB =
    seasonWinRateB * 0.3 +
    recentWinRateB * 0.3 +
    h2hWinRateB * 0.15 +
    starterRatingB * 0.2 +
    homeAdvantageB * 0.05;

  const sum = scoreA + scoreB;
  if (!sum) {
    const err = new Error("NO_STATS");
    err.code = "NO_STATS";
    throw err;
  }

  const pctA = Number(((scoreA / sum) * 100).toFixed(1));
  const pctB = Number((100 - pctA).toFixed(1));

  return {
    [teamA]: pctA,
    [teamB]: pctB,
  };
}

/**
 * 預測比分：
 * - CPBL / MLB：預測總分 8.5～10 左右
 * - NBA：預測總分 215～235 左右
 */
function predictScore({ league, teamA, teamB, winRate }) {
  const pA = winRate[teamA];
  if (pA == null) return null;

  if (league === "CPBL" || league === "MLB") {
    const baseTotal = league === "CPBL" ? 10 : 8.8;
    const diff = (pA / 100 - 0.5) * 4; // -2 ~ +2 分左右

    let runsA = baseTotal / 2 + diff / 2;
    let runsB = baseTotal - runsA;

    runsA = Math.max(1, Math.round(runsA));
    runsB = Math.max(0, Math.round(runsB));

    return {
      [teamA]: runsA,
      [teamB]: runsB,
    };
  }

  if (league === "NBA") {
    const baseTotal = 225;
    const diff = (pA / 100 - 0.5) * 20; // -10 ~ +10 分

    let ptsA = baseTotal / 2 + diff / 2;
    let ptsB = baseTotal - ptsA;

    ptsA = Math.max(80, Math.round(ptsA));
    ptsB = Math.max(80, Math.round(ptsB));

    return {
      [teamA]: ptsA,
      [teamB]: ptsB,
    };
  }

  return null;
}

/** 根據聯盟分派給對應的 stats builder */
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
  predictScore,
};
