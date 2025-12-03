// server/utils/data.js
import { buildMLBStats } from "./mlb.js";
import { buildCPBLStats } from "./cpbl.js";
import { buildNBAStats } from "./nba.js";

/* -------------------------------------------------------------
   勝率計算（全聯盟共用）
------------------------------------------------------------- */
export function calculateWinRates({ teamA, teamB, stats }) {
  const sA = stats.seasonStats?.[teamA] || {};
  const sB = stats.seasonStats?.[teamB] || {};

  const rA = stats.recentStats?.[teamA] || {};
  const rB = stats.recentStats?.[teamB] || {};

  const h2h = stats.h2hStats || {};

  const seasonRateA = sA.games ? (sA.wins ?? 0) / sA.games : 0.5;
  const seasonRateB = sB.games ? (sB.wins ?? 0) / sB.games : 0.5;

  const recentRateA = rA.games ? (rA.w ?? rA.wins ?? 0) / rA.games : 0.5;
  const recentRateB = rB.games ? (rB.w ?? rB.wins ?? 0) / rB.games : 0.5;

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

/* -------------------------------------------------------------
   比分預測（含大小分）
------------------------------------------------------------- */
export function predictScore({ league, teamA, teamB, winRate }) {
  const pA = winRate[teamA] / 100;
  const pB = winRate[teamB] / 100;
  const sumP = pA + pB || 1;
  const wA = pA / sumP;
  const wB = pB / sumP;

  let baseTotal =
    league === "MLB" ? 8.6 :
    league === "CPBL" ? 11.4 :
    league === "NBA" ? 227 :
    10;

  const rand = (min, max) => Math.random() * (max - min) + min;

  function applyVariance(score) {
    if (league === "MLB") return Math.round(score + rand(-2, 2));
    if (league === "CPBL") return Math.round(score + rand(-3, 3));
    if (league === "NBA") return Math.round(score + rand(-8, 8));
    return Math.round(score);
  }

  let rawA = baseTotal * wA;
  let rawB = baseTotal * wB;

  let sA = applyVariance(rawA);
  let sB = applyVariance(rawB);

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
  const overUnder =
    total > line
      ? `預測大分（Total ${total} > Line ${line}）`
      : `預測小分（Total ${total} < Line ${line}）`;

  return { [teamA]: sA, [teamB]: sB, total, line, overUnder };
}

/* -------------------------------------------------------------
   buildStats — （依聯盟調用對應爬蟲）
------------------------------------------------------------- */
export async function buildStats({ league, ...rest }) {
  if (league === "MLB") return buildMLBStats(rest);
  if (league === "CPBL") return buildCPBLStats(rest);
  if (league === "NBA") return buildNBAStats(rest);
  throw new Error(`Unsupported league: ${league}`);
}

/* -------------------------------------------------------------
   中文說明（全聯盟加強完整版）
------------------------------------------------------------- */
export function buildAutoDescriptionZh({ league, teamA, teamB, stats, winRate, predictedScore }) {
  const lines = [];

  /* ---------- 基本資訊 ---------- */
  lines.push(`${league} 預測：${teamA} 勝率 ${winRate[teamA]}%，${teamB} 勝率 ${winRate[teamB]}%。`);
  lines.push(`預測比數：${teamA} ${predictedScore[teamA]} : ${predictedScore[teamB]} ${teamB}。`);
  lines.push(`比賽場地：${stats.location || "未知球場"}。`);

  /* ---------- CPBL ---------- */
  if (league === "CPBL") {
    const p = stats.pitchersByTeam || {};
    lines.push(`先發投手：${teamA} ${p[teamA]}；${teamB} ${p[teamB]}。`);

    const rA = stats.recentStats?.[teamA];
    const rB = stats.recentStats?.[teamB];
    if (rA?.w != null) lines.push(`近期 10 場：${teamA} ${rA.w}-${rA.l}；${teamB} ${rB.w}-${rB.l}。`);

    if (stats.h2hStats?.count > 0) {
      const h = stats.h2hStats;
      lines.push(`對戰紀錄：${teamA} ${h.aWins} 勝；${teamB} ${h.bWins} 勝`);
    }
  }

  /* ---------- MLB ---------- */
  if (league === "MLB") {
    const p = stats.pitchersByTeam || {};
    lines.push(`先發投手：${teamA} ${p[teamA]}；${teamB} ${p[teamB]}。`);

    const sA = stats.seasonStats?.[teamA] || {};
    const sB = stats.seasonStats?.[teamB] || {};

    lines.push(`投手成績：${teamA} ERA ${sA.era} / WHIP ${sA.whip}；${teamB} ERA ${sB.era} / WHIP ${sB.whip}。`);
    lines.push(`打擊成績：${teamA} AVG ${sA.avg} / OPS ${sA.ops}；${teamB} AVG ${sB.avg} / OPS ${sB.ops}。`);

    const rA = stats.recentStats?.[teamA];
    const rB = stats.recentStats?.[teamB];
    if (rA?.w != null) lines.push(`近期：${teamA} ${rA.w}-${rA.l}；${teamB} ${rB.w}-${rB.l}。`);
  }

  /* ---------- NBA ---------- */
  if (league === "NBA") {
    const advA = stats.advStats?.[teamA] || {};
    const advB = stats.advStats?.[teamB] || {};

    lines.push(`平均得分：${teamA} ${advA.pts}；${teamB} ${advB.pts}。`);
    lines.push(`Pace 節奏：${teamA} ${advA.pace}；${teamB} ${advB.pace}。`);

    const haA = stats.homeAwayStats?.[teamA];
    const haB = stats.homeAwayStats?.[teamB];
    if (haA?.homeW != null)
      lines.push(`主客場：${teamA} 主場 ${haA.homeW}-${haA.homeL}；${teamB} 主場 ${haB.homeW}-${haB.homeL}`);

    const rA = stats.recentStats?.[teamA];
    const rB = stats.recentStats?.[teamB];
    if (rA?.w != null) lines.push(`近 10 場：${teamA} ${rA.w}-${rA.l}；${teamB} ${rB.w}-${rB.l}。`);

    /* 傷兵列表 */
    if (stats.injury?.length) {
      lines.push(`傷兵名單：`);
      stats.injury.forEach((p) => {
        lines.push(`- ${p.player} (${p.team})：${p.status}`);
      });
    }
  }

  return lines.join("\n");
}

/* -------------------------------------------------------------
   英文版（簡版）
------------------------------------------------------------- */
export function buildAutoDescriptionEn({ league, teamA, teamB, stats, winRate, predictedScore }) {
  return `${league} prediction:
${teamA} ${winRate[teamA]}% vs ${teamB} ${winRate[teamB]}%
Score: ${predictedScore[teamA]} - ${predictedScore[teamB]}
Venue: ${stats.location || "Unknown"}`;
}

/* -------------------------------------------------------------
   統一 export
------------------------------------------------------------- */
export default {
  buildStats,
  calculateWinRates,
  predictScore,
  buildAutoDescriptionZh,
  buildAutoDescriptionEn,
};
