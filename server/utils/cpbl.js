// --- 加入這段在檔案最後 ---
// 匯出 CPBL 資料建構邏輯
export async function buildCPBLStats({ teamA, teamB, date }) {
  const dateISO = date.replace(/\//g, "-");
  const schedule = await scrapeCPBLSchedule({ dateISO, teamA, teamB });

  // 臨時模擬戰績數據（未來可改為實際 API）
  const seasonStats = {
    [teamA]: { wins: 35, losses: 25, games: 60 },
    [teamB]: { wins: 30, losses: 30, games: 60 },
  };

  const recentStats = {
    [teamA]: { w: 6, l: 4, games: 10 },
    [teamB]: { w: 4, l: 6, games: 10 },
  };

  const h2hStats = {
    count: 5,
    aWins: 3,
    bWins: 2,
  };

  const pitchersByTeam = {
    [teamA]: schedule?.pitcherA || "未定",
    [teamB]: schedule?.pitcherB || "未定",
  };

  return {
    seasonStats,
    recentStats,
    h2hStats,
    pitchersByTeam,
    location: schedule?.venue || null,
    text: `CPBL 比賽資料：${teamA} vs ${teamB}，球場 ${schedule?.venue || "未知"}。`,
  };
}
