// server/utils/nba.js
// 使用 balldontlie.io API 取得真實 NBA 資料
// 官方文件：https://www.balldontlie.io/api/v1/

const API_BASE = "https://www.balldontlie.io/api/v1";

/* ───── 工具函式 ───── */
async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} - ${url}`);
  return res.json();
}

function normalizeName(name) {
  return name.toLowerCase().replace(/\s+/g, "");
}

/**
 * 找到符合隊名的 teamId
 */
async function findTeamIdByName(teamName) {
  const data = await getJSON(`${API_BASE}/teams`);
  const match = data.data.find((t) =>
    normalizeName(t.full_name).includes(normalizeName(teamName)) ||
    normalizeName(teamName).includes(normalizeName(t.full_name))
  );
  return match ? match.id : null;
}

/**
 * 抓取指定球隊的近期比賽（過去 20 場）
 */
async function fetchRecentGames(teamId) {
  const data = await getJSON(`${API_BASE}/games?team_ids[]=${teamId}&per_page=20`);
  return data.data;
}

/**
 * 計算戰績統計
 */
function calculateRecord(games, teamId) {
  let wins = 0;
  let losses = 0;

  for (const g of games) {
    const teamScore = g.home_team.id === teamId ? g.home_team_score : g.visitor_team_score;
    const oppScore = g.home_team.id === teamId ? g.visitor_team_score : g.home_team_score;
    if (teamScore > oppScore) wins++;
    else losses++;
  }
  return { wins, losses, games: games.length };
}

/**
 * 計算兩隊交手戰績
 */
function calculateHeadToHead(allGames, teamAId, teamBId) {
  const h2hGames = allGames.filter(
    (g) =>
      (g.home_team.id === teamAId && g.visitor_team.id === teamBId) ||
      (g.home_team.id === teamBId && g.visitor_team.id === teamAId)
  );

  let aWins = 0;
  let bWins = 0;
  for (const g of h2hGames) {
    const home = g.home_team.id;
    const away = g.visitor_team.id;
    if (g.home_team_score > g.visitor_team_score) {
      if (home === teamAId) aWins++;
      else bWins++;
    } else {
      if (away === teamAId) aWins++;
      else bWins++;
    }
  }

  return { count: h2hGames.length, aWins, bWins };
}

/**
 * buildNBAStats
 * 主要回傳：
 * - seasonStats
 * - recentStats
 * - h2hStats
 * - location (球場)
 */
export async function buildNBAStats({ teamA, teamB, date }) {
  // 找到兩隊 ID
  const [teamAId, teamBId] = await Promise.all([
    findTeamIdByName(teamA),
    findTeamIdByName(teamB),
  ]);

  if (!teamAId || !teamBId) {
    throw new Error(`找不到隊伍 ID (${teamA}, ${teamB})`);
  }

  // 抓取比賽資料
  const [gamesA, gamesB] = await Promise.all([
    fetchRecentGames(teamAId),
    fetchRecentGames(teamBId),
  ]);

  // 整季戰績（balldontlie 不提供整季總表，用近期比賽估算）
  const seasonStats = {
    [teamA]: calculateRecord(gamesA, teamAId),
    [teamB]: calculateRecord(gamesB, teamBId),
  };

  // 近期戰績（最近 10 場）
  const recentStats = {
    [teamA]: calculateRecord(gamesA.slice(0, 10), teamAId),
    [teamB]: calculateRecord(gamesB.slice(0, 10), teamBId),
  };

  // 對戰紀錄
  const allGames = [...gamesA, ...gamesB];
  const h2hStats = calculateHeadToHead(allGames, teamAId, teamBId);

  // 找最近一場對戰（用於球場）
  const recentH2H = allGames.find(
    (g) =>
      (g.home_team.id === teamAId && g.visitor_team.id === teamBId) ||
      (g.home_team.id === teamBId && g.visitor_team.id === teamAId)
  );

  const location = recentH2H
    ? `${recentH2H.home_team.full_name} 主場`
    : "未知球場";

  return {
    seasonStats,
    recentStats,
    h2hStats,
    location,
    text: `NBA 比賽資料：${teamA} vs ${teamB}，球場 ${location}`,
  };
}
