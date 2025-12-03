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

  // 整季勝率
  const seasonRateA = sA.games ? sA.wins / sA.games : 0.5;
  const seasonRateB = sB.games ? sB.wins / sB.games : 0.5;

  // 近期（10 場）
  const recentWinsA = rA.w ?? rA.wins ?? 0;
  const recentWinsB = rB.w ?? rB.wins ?? 0;

  const recentRateA = rA.games ? recentWinsA / rA.games : 0.5;
  const recentRateB = rB.games ? recentWinsB / rB.games : 0.5;

  const weightedA = seasonRateA * 0.6 + recentRateA * 0.4;
  const weightedB = seasonRateB * 0.6 + recentRateB * 0.4;

  // 對戰
  const hCount = h2h.count || 0;
  const hRateA = hCount ? h2h.aWins / hCount : 0.5;
  const hRateB = hCount ? h2h.bWins / hCount : 0.5;

  // 總分
  const scoreA = weightedA * 0.7 + hRateA * 0.3;
  const scoreB = weightedB * 0.7 + hRateB * 0.3;

  const sum = scoreA + scoreB;
  const pctA = (scoreA / sum) * 100;
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

export function buildAutoDescriptionZh({ league, teamA, teamB, stats, winRate, predictedScore }) {
  const lines = [];

  lines.push(`${league} 預測：${teamA} 勝率 ${winRate[teamA]}%，${teamB} 勝率 ${winRate[teamB]}%。`);

  if (predictedScore) {
    lines.push(`預測比數：${teamA} ${predictedScore[teamA]} : ${predictedScore[teamB]} ${teamB}。`);
  }

  if (stats.location) {
    const home = stats.homeTeam || "未知";
    lines.push(`比賽場地：${stats.location}（主場：${home}）。`);
  }

  const p = stats.pitchersByTeam || {};
  if (p[teamA] || p[teamB]) {
    lines.push(`預計先發投手：${teamA} ${p[teamA] || "未定"}，${teamB} ${p[teamB] || "未定"}。`);
  }

  if (stats.recentStats) {
    const a = stats.recentStats[teamA];
    const b = stats.recentStats[teamB];
    if (a?.w != null || a?.wins != null) {
      const aW = a.w ?? a.wins ?? 0;
      const bW = b.w ?? b.wins ?? 0;
      const aL = a.l ?? a.losses ?? a.games - aW;
      const bL = b.l ?? b.losses ?? b.games - bW;
      lines.push(`近期表現：${teamA} ${aW} 勝 ${aL} 敗；${teamB} ${bW} 勝 ${bL} 敗。`);
    }
  }

  if (stats.h2hStats?.count > 0) {
    const h = stats.h2hStats;
    lines.push(`本季對戰：${teamA} ${h.aWins} 勝，${teamB} ${h.bWins} 勝（${h.count} 場）。`);
  }

  if (winRate[teamA] > winRate[teamB]) lines.push(`綜合分析：較看好 **${teamA}**。`);
  else if (winRate[teamA] < winRate[teamB]) lines.push(`綜合分析：較看好 **${teamB}**。`);
  else lines.push(`綜合分析：兩隊實力接近。`);

  return lines.join("\n");
}

export function buildAutoDescriptionEn({ league, teamA, teamB, stats, winRate, predictedScore }) {
  const lines = [];

  lines.push(`${league} prediction: ${teamA} ${winRate[teamA]}%, ${teamB} ${winRate[teamB]}%.`);

  if (predictedScore) {
    lines.push(`Expected score: ${teamA} ${predictedScore[teamA]} - ${predictedScore[teamB]} ${teamB}.`);
  }

  if (stats.location) {
    const home = stats.homeTeam || "unknown";
    lines.push(`Venue: ${stats.location}, home team: ${home}.`);
  }

  const p = stats.pitchersByTeam || {};
  if (p[teamA] || p[teamB]) {
    lines.push(
      `Probable pitchers: ${teamA} ${p[teamA] || "TBD"}, ${teamB} ${p[teamB] || "TBD"}.`
    );
  }

  if (stats.recentStats) {
    const a = stats.recentStats[teamA];
    const b = stats.recentStats[teamB];
    if (a?.w != null || a?.wins != null) {
      const aW = a.w ?? a.wins ?? 0;
      const bW = b.w ?? b.wins ?? 0;
      const aL = a.l ?? a.losses ?? a.games - aW;
      const bL = b.l ?? b.losses ?? b.games - bW;
      lines.push(`Last 10: ${teamA} ${aW}-${aL}, ${teamB} ${bW}-${bL}.`);
    }
  }

  if (stats.h2hStats?.count > 0) {
    const h = stats.h2hStats;
    lines.push(`Head-to-head: ${teamA} ${h.aWins} W, ${teamB} ${h.bWins} W.`);
  }

  if (winRate[teamA] > winRate[teamB]) lines.push(`${teamA} slightly favored.`);
  else if (winRate[teamA] < winRate[teamB]) lines.push(`${teamB} slightly favored.`);
  else lines.push(`Even matchup.`);

  return lines.join("\n");
}
export {
  buildStats,
  calculateWinRates,
  predictScore,
  buildAutoDescriptionZh,
  buildAutoDescriptionEn,
};
