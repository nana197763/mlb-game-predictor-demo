// server/utils/nba.js
// 使用 RapidAPI - api-nba-v1 取得真實 NBA 資料

const API_BASE = "https://api-nba-v1.p.rapidapi.com";

const headers = {
  "x-rapidapi-key": "c215a160420346985a936754d0757649", // 你的 API Key
  "x-rapidapi-host": "api-nba-v1.p.rapidapi.com"
};

/* -------- 通用 fetch JSON 工具 -------- */
async function getJSON(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} - ${url}`);
  const json = await res.json();
  return json;
}

/* -------- 根據隊名查隊伍 ID -------- */
async function findTeamIdByName(name) {
  const data = await getJSON(`${API_BASE}/teams`);
  const list = data?.response || [];

  const norm = (s) => s.toLowerCase().replace(/\s+/g, "");

  return list.find(
    (t) =>
      norm(t.name).includes(norm(name)) ||
      norm(name).includes(norm(t.name)) ||
      norm(t.nickname).includes(norm(name))
  )?.id || null;
}

/* -------- 抓取近期比賽（10–20場） -------- */
async function fetchRecentGames(teamId) {
  const year = new Date().getFullYear();

  const data = await getJSON(`${API_BASE}/games?team=${teamId}&season=${year}`);
  return data?.response || [];
}

/* -------- 計算近期與整季戰績 -------- */
function calculateRecord(games, teamId) {
  let wins = 0;
  let losses = 0;

  for (const g of games) {
    const isHome = g.teams.home.id === teamId;
    const teamScore = isHome ? g.scores.home.points : g.scores.visitors.points;
    const oppScore = isHome ? g.scores.visitors.points : g.scores.home.points;

    if (teamScore > oppScore) wins++;
    else losses++;
  }

  return { wins, losses, games: games.length };
}

/* -------- 計算兩隊交手紀錄 -------- */
function calculateHeadToHead(gamesA, gamesB, teamAId, teamBId) {
  const all = [...gamesA, ...gamesB];
  const h2h = all.filter(
    (g) =>
      (g.teams.home.id === teamAId && g.teams.visitors.id === teamBId) ||
      (g.teams.home.id === teamBId && g.teams.visitors.id === teamAId)
  );

  let aWins = 0;
  let bWins = 0;

  for (const g of h2h) {
    const homeScore = g.scores.home.points;
    const awayScore = g.scores.visitors.points;

    if (homeScore > awayScore) {
      if (g.teams.home.id === teamAId) aWins++;
      else bWins++;
    } else {
      if (g.teams.visitors.id === teamAId) aWins++;
      else bWins++;
    }
  }

  return { count: h2h.length, aWins, bWins };
}

/* -------- buildNBAStats 主函式 -------- */
export async function buildNBAStats({ teamA, teamB, date }) {
  // 取得隊伍 ID
  const [teamAId, teamBId] = await Promise.all([
    findTeamIdByName(teamA),
    findTeamIdByName(teamB),
  ]);

  if (!teamAId || !teamBId) {
    throw new Error(`找不到隊伍：${teamA} 或 ${teamB}`);
  }

  // 取得比賽資料
  const [gamesA, gamesB] = await Promise.all([
    fetchRecentGames(teamAId),
    fetchRecentGames(teamBId),
  ]);

  // 整季 & 近期
  const seasonStats = {
    [teamA]: calculateRecord(gamesA, teamAId),
    [teamB]: calculateRecord(gamesB, teamBId),
  };

  const recentStats = {
    [teamA]: calculateRecord(gamesA.slice(0, 10), teamAId),
    [teamB]: calculateRecord(gamesB.slice(0, 10), teamBId),
  };

  // 對戰紀錄
  const h2hStats = calculateHeadToHead(gamesA, gamesB, teamAId, teamBId);

  // 判定球場（找最近一場對戰）
  const recentH2H = gamesA.find(
    (g) =>
      (g.teams.home.id === teamAId && g.teams.visitors.id === teamBId) ||
      (g.teams.home.id === teamBId && g.teams.visitors.id === teamAId)
  );

  const location = recentH2H
    ? `${recentH2H.teams.home.name} 主場`
    : "未知球場";

  // 回傳資料
  return {
    seasonStats,
    recentStats,
    h2hStats,
    location,
    text: `NBA 資料：${teamA} vs ${teamB}，球場 ${location}`,
  };
}
