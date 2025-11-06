// server/utils/nba.js
const BASE_URL = "https://www.balldontlie.io/api/v1";

// 簡單快取機制（可共用）
const CACHE = new Map();
async function getJSON(url, ttlMs = 60000) {
  const now = Date.now();
  const hit = CACHE.get(url);
  if (hit && hit.exp > now) return hit.val;
  const res = await fetch(url);
  const data = await res.json();
  CACHE.set(url, { val: data, exp: now + ttlMs });
  return data;
}

// 根據球隊 ID 抓取近況
async function getRecentStats(teamId) {
  const games = await getJSON(`${BASE_URL}/games?team_ids[]=${teamId}&per_page=10`);
  let w = 0, l = 0;
  for (const g of games.data) {
    const isWin = (g.home_team.id === teamId && g.home_team_score > g.visitor_team_score) ||
                  (g.visitor_team.id === teamId && g.visitor_team_score > g.home_team_score);
    if (isWin) w++; else l++;
  }
  return { w, l, games: games.data.length };
}

// 主函式：建立 NBA 的預測資料
export async function buildNBAStats({ teamA, teamB, date }) {
  const teams = await getJSON(`${BASE_URL}/teams`);
  const teamMap = new Map(teams.data.map(t => [t.full_name, t]));

  const idA = teamMap.get(teamA)?.id;
  const idB = teamMap.get(teamB)?.id;
  if (!idA || !idB) throw new Error("找不到對應球隊 ID");

  const seasonStats = {
    [teamA]: { wins: 45, losses: 30, games: 75 },  // 可替換為真實 API，暫時模擬
    [teamB]: { wins: 40, losses: 35, games: 75 },
  };

  const recentStats = {
    [teamA]: await getRecentStats(idA),
    [teamB]: await getRecentStats(idB),
  };

  const h2hStats = {
    count: 5,
    aWins: 3,
    bWins: 2,
  };

  return {
    seasonStats,
    recentStats,
    h2hStats,
    pitchersByTeam: {},
    location: null,
    text: `NBA 比賽資料：${teamA} vs ${teamB}。`,
  };
}
