 
// server/utils/predict.js

export function calculateWinRate({ teamA, teamB, stats }) {
  const result = {
    teamA,
    teamB,
    prediction: `${teamA} 4 - 5 ${teamB}`,
    winRate: { teamA: 50, teamB: 50 },
    summaryZh: '',
    summaryEn: ''
  };

  const seasonStats = stats.seasonStats || {};
  const recentStats = stats.recentStats || {};
  const h2hStats = stats.h2hStats || {};
  const pitcherA = stats.pitchersByTeam?.[teamA] || "未定";
  const pitcherB = stats.pitchersByTeam?.[teamB] || "未定";

  // --- 一. 總成績區塊 (30%) ---
  const seasonA = seasonStats[teamA] || { wins: 0, losses: 0, games: 0 };
  const seasonB = seasonStats[teamB] || { wins: 0, losses: 0, games: 0 };

  const gamesA = seasonA.games || 0;
  const gamesB = seasonB.games || 0;

  // 分段勝率估計
  const weight1 = 0.3;
  const recent10Weight = 0.4, recent20Weight = 0.3, olderWeight = 0.3;
  const recentA = recentStats[teamA] || {};
  const recentB = recentStats[teamB] || {};

  const wrA = recentA.w || 0, grA = recentA.games || 0;
  const wrB = recentB.w || 0, grB = recentB.games || 0;

  const winRateA = grA ? wrA / grA : 0.5;
  const winRateB = grB ? wrB / grB : 0.5;

  const seasonWinRateA = gamesA ? seasonA.wins / gamesA : 0.5;
  const seasonWinRateB = gamesB ? seasonB.wins / gamesB : 0.5;

  const seasonScoreA = seasonWinRateA * olderWeight + winRateA * (recent10Weight + recent20Weight);
  const seasonScoreB = seasonWinRateB * olderWeight + winRateB * (recent10Weight + recent20Weight);

  // --- 二. 對戰成績 (30%) ---
  const h2h = h2hStats || { count: 0, aWins: 0, bWins: 0 };
  const h2hTotal = h2h.count || 0;
  const h2hScoreA = h2hTotal ? (h2h.aWins / h2hTotal) : 0.5;
  const h2hScoreB = h2hTotal ? (h2h.bWins / h2hTotal) : 0.5;

  const weight2 = 0.3;

  // --- 三. 投手戰力 (40%) ---
  const weight3 = 0.4;

  const pitcherScoreA = pitcherA !== "未定" ? 0.55 : 0.5;
  const pitcherScoreB = pitcherB !== "未定" ? 0.55 : 0.5;

  // --- 加總加權分數 ---
  const scoreA = seasonScoreA * weight1 + h2hScoreA * weight2 + pitcherScoreA * weight3;
  const scoreB = seasonScoreB * weight1 + h2hScoreB * weight2 + pitcherScoreB * weight3;

  // 正規化成勝率（加總約 100）
  const total = scoreA + scoreB;
  const pctA = total ? (scoreA / total) * 100 : 50;
  const pctB = total ? (scoreB / total) * 100 : 50;

  result.winRate = {
    teamA: Math.round(pctA * 10) / 10,
    teamB: Math.round(pctB * 10) / 10
  };

  // 預測比分（簡單推估）
  result.prediction = result.winRate.teamA > result.winRate.teamB
    ? `${teamA} 5 - 3 ${teamB}`
    : `${teamA} 4 - 6 ${teamB}`;

  // 中英摘要（簡略）
  result.summaryZh = `${teamA} 勝率 ${result.winRate.teamA}%、${teamB} 勝率 ${result.winRate.teamB}%。依據整季戰績、近期戰績、對戰結果與先發投手進行預估。`
  result.summaryEn = `Estimated win rate: ${teamA} ${result.winRate.teamA}%, ${teamB} ${result.winRate.teamB}%. Based on season record, recent form, H2H and starting pitcher.`;

  return result;
}
export { calculateWinRate as predictWinRate };

