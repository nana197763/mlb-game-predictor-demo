// server/utils/data.js
import { buildMLBStats } from "./mlb.js";
import { buildCPBLStats } from "./cpbl.js";
import { buildNBAStats } from "./nba.js";

/* ------------------------------------------------------
   勝率計算
------------------------------------------------------ */
function calculateWinRates({ teamA, teamB, stats }) {
  const sA = stats.seasonStats?.[teamA] || {};
  const sB = stats.seasonStats?.[teamB] || {};

  const rA = stats.recentStats?.[teamA] || {};
  const rB = stats.recentStats?.[teamB] || {};

  const h2h = stats.h2hStats || {};

  const seasonRateA = sA.games ? sA.wins / sA.games : 0.5;
  const seasonRateB = sB.games ? sB.wins / sB.games : 0.5;

  const recentWinsA = rA.w ?? rA.wins ?? 0;
  const recentWinsB = rB.w ?? rB.wins ?? 0;

  const recentRateA = rA.games ? recentWinsA / rA.games : 0.5;
  const recentRateB = rB.games ? recentWinsB / rB.games : 0.5;

  const weightedA = seasonRateA * 0.6 + recentRateA * 0.4;
  const weightedB = seasonRateB * 0.6 + recentRateB * 0.4;

  const hCount = h2h.count || 0;
  const hRateA = hCount ? h2h.aWins / hCount : 0.5;
  const hRateB = hCount ? h2h.bWins / hCount : 0.5;

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

/* ------------------------------------------------------
   比分預測
------------------------------------------------------ */
function predictScore({ league, teamA, teamB, winRate }) {
  const pA = (winRate[teamA] ?? 50) / 100;
  const pB = (winRate[teamB] ?? 50) / 100;
  const sumP = pA + pB || 1;

  const wA = pA / sumP;
  const wB = pB / sumP;

  let baseTotal;

  if (league === "MLB") baseTotal = 8.6;
  else if (league === "CPBL") baseTotal = 11.4;
  else if (league === "NBA") baseTotal = 227;
  else baseTotal = 10;

  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }

  function applyVar(score) {
    if (league === "MLB") return Math.round(score + rand(-2, 2));
    if (league === "CPBL") return Math.round(score + rand(-3, 3));
    if (league === "NBA") return Math.round(score + rand(-8, 8));
    return Math.round(score);
  }

  let sA = applyVar(baseTotal * wA);
  let sB = applyVar(baseTotal * wB);

  if (league !== "NBA") {
    sA = Math.max(0, sA);
    sB = Math.max(0, sB);
  }

  if (sA === sB) {
    if (wA > wB) sA++;
    else sB++;
  }

  const total = sA + sB;
  const line = Math.round(baseTotal);

  const overUnder = total > line
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

/* ------------------------------------------------------
   stats 組合器
------------------------------------------------------ */
async function buildStats({ league, ...rest }) {
  if (league === "MLB") return buildMLBStats(rest);
  if (league === "CPBL") return buildCPBLStats(rest);
  if (league === "NBA") return buildNBAStats(rest);
  throw new Error(`Unsupported league: ${league}`);
}

/* ------------------------------------------------------
   自動說明欄（中文）
------------------------------------------------------ */
function buildAutoDescriptionZh({ league, teamA, teamB, stats, winRate, predictedScore }) {
  const lines = [];

  lines.push(`${league} 預測：${teamA} 勝率 ${winRate[teamA]}%，${teamB} ${winRate[teamB]}%。`);
  lines.push(`預測比數：${teamA} ${predictedScore[teamA]} : ${predictedScore[teamB]} ${teamB}`);

  if (stats.location) {
    lines.push(`比賽場地：${stats.location}（主場：${stats.homeTeam || "未知"}）。`);
  }

  const p = stats.pitchersByTeam || {};
  if (p[teamA] || p[teamB]) {
    lines.push(`預計先發投手：${teamA} ${p[teamA] || "未定"}；${teamB} ${p[teamB] || "未定"}`);
  }

  if (stats.recentStats) {
    const a = stats.recentStats[teamA];
    const b = stats.recentStats[teamB];

    if (a) {
      const aW = a.w ?? a.wins ?? 0;
      const aL = a.l ?? a.losses ?? a.games - aW;
      const bW = b.w ?? b.wins ?? 0;
      const bL = b.l ?? b.losses ?? b.games - bW;

      lines.push(`近期戰績：${teamA} ${aW}-${aL}；${teamB} ${bW}-${bL}`);
    }
  }

  if (stats.h2hStats?.count) {
    const h = stats.h2hStats;
    lines.push(`對戰紀錄：${teamA} ${h.aWins} 勝，${teamB} ${h.bWins} 勝（${h.count} 場）`);
  }

  return lines.join("\n");
}

/* ------------------------------------------------------
   自動說明欄（英文）
------------------------------------------------------ */
function buildAutoDescriptionEn({ league, teamA, teamB, stats, winRate, predictedScore }) {
  const lines = [];

  lines.push(`${league} prediction: ${teamA} ${winRate[teamA]}%, ${teamB} ${winRate[teamB]}%.`);
  lines.push(`Expected score: ${predictedScore[teamA]} - ${predictedScore[teamB]}`);

  if (stats.location) {
    lines.push(`Venue: ${stats.location}, home: ${stats.homeTeam || "unknown"}`);
  }

  const p = stats.pitchersByTeam || {};
  if (p[teamA] || p[teamB]) {
    lines.push(`Probable pitchers: ${teamA} ${p[teamA] || "TBD"}; ${teamB} ${p[teamB] || "TBD"}`);
  }

  if (stats.recentStats) {
    const a = stats.recentStats[teamA];
    const b = stats.recentStats[teamB];

    if (a) {
      const aW = a.w ?? a.wins ?? 0;
      const aL = a.l ?? a.losses ?? a.games - aW;
      const bW = b.w ?? b.wins ?? 0;
      const bL = b.l ?? b.losses ?? b.games - bW;

      lines.push(`Last 10: ${teamA} ${aW}-${aL}, ${teamB} ${bW}-${bL}`);
    }
  }

  if (stats.h2hStats?.count) {
    const h = stats.h2hStats;
    lines.push(`Head-to-head: ${teamA} ${h.aWins} W, ${teamB} ${h.bWins} W`);
  }

  return lines.join("\n");
}

/* ------------------------------------------------------
   最終 export（⚠️ 無重複、乾淨）
------------------------------------------------------ */
export {
  buildStats,
  calculateWinRates,
  predictScore,
  buildAutoDescriptionZh,
  buildAutoDescriptionEn,
};
