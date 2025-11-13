// server/utils/nba.js
// 使用 RapidAPI 的 NBA Stats API 取得真實 NBA 比賽資料
// 金鑰來自：c215a160420346985a936754d0757649

import axios from "axios";

const API_KEY = "c215a160420346985a936754d0757649";
const API_HOST = "api-nba-v1.p.rapidapi.com";
const BASE_URL = `https://${API_HOST}`;

const headers = {
  "X-RapidAPI-Key": API_KEY,
  "X-RapidAPI-Host": API_HOST,
};

function normalizeName(name) {
  return name.toLowerCase().replace(/\s+/g, "");
}

async function getAllTeams() {
  const res = await axios.get(`${BASE_URL}/teams`, { headers });
  return res.data.response;
}

async function findTeamIdByName(name) {
  const teams = await getAllTeams();
  const match = teams.find((t) =>
    normalizeName(t.name).includes(normalizeName(name)) ||
    normalizeName(t.nickname).includes(normalizeName(name)) ||
    normalizeName(t.code) === normalizeName(name)
  );
  return match ? match.id : null;
}

async function fetchLastGames(teamId) {
  const res = await axios.get(`${BASE_URL}/games`, {
    headers,
    params: {
      team: teamId,
      season: 2024,
      last: 10,
    },
  });
  return res.data.response;
}

function calcWinLoss(games, teamId) {
  let wins = 0, losses = 0;
  for (const g of games) {
    const isHome = g.teams.home.id === teamId;
    const teamScore = isHome ? g.scores.home.points : g.scores.visitors.points;
    const oppScore = isHome ? g.scores.visitors.points : g.scores.home.points;
    if (teamScore > oppScore) wins++;
    else losses++;
  }
  return { wins, losses, total: games.length };
}

async function fetchHeadToHead(teamAId, teamBId) {
  const res = await axios.get(`${BASE_URL}/games`, {
    headers,
    params: {
      h2h: `${teamAId}-${teamBId}`,
      season: 2024,
    },
  });
  return res.data.response;
}

function calcH2H(games, teamAId) {
  let aWins = 0, bWins = 0;
  for (const g of games) {
    const isHomeA = g.teams.home.id === teamAId;
    const teamAScore = isHomeA ? g.scores.home.points : g.scores.visitors.points;
    const teamBScore = isHomeA ? g.scores.visitors.points : g.scores.home.points;
    if (teamAScore > teamBScore) aWins++;
    else bWins++;
  }
  return { games: games.length, aWins, bWins };
}

export async function buildNBAStats({ teamA, teamB }) {
  const [teamAId, teamBId] = await Promise.all([
    findTeamIdByName(teamA),
    findTeamIdByName(teamB),
  ]);
  if (!teamAId || !teamBId) throw new Error("找不到隊伍 ID");

  const [lastA, lastB, h2h] = await Promise.all([
    fetchLastGames(teamAId),
    fetchLastGames(teamBId),
    fetchHeadToHead(teamAId, teamBId),
  ]);

  const recentStats = {
    [teamA]: calcWinLoss(lastA, teamAId),
    [teamB]: calcWinLoss(lastB, teamBId),
  };

  const h2hStats = calcH2H(h2h, teamAId);
  const location = h2h[0]?.teams.home.name + " 主場" || "未知球場";

  return {
    recentStats,
    h2hStats,
    location,
    text: `${teamA} 對 ${teamB}，預測場地：${location}`,
  };
}
