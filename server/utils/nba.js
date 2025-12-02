// server/utils/nba.js

import * as cheerio from "cheerio";

const ESPN_BASE = "https://www.espn.com";

// --- 抓取比分頁面 ---
async function fetchESPNScoreboard({ date }) {
  const ymd = date.replace(/-/g, ""); // YYYYMMDD，例如 2025-12-02 → 20251202
  const url = `${ESPN_BASE}/nba/scoreboard/_/date/${ymd}`;

  // 用 Node 內建的 fetch 就好
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`ESPN scoreboard request failed: ${res.status}`);
  }

  const html = await res.text();
  return cheerio.load(html);
}

// --- 整理比賽資料 ---
function parseMatchups($) {
  const games = [];

  $("section.Scoreboard").each((_, el) => {
    const teams = $(el)
      .find(".ScoreCell__TeamName")
      .map((_, t) => $(t).text().trim())
      .get();

    const scores = $(el)
      .find(".ScoreCell__Score")
      .map((_, s) => parseInt($(s).text(), 10))
      .get();

    const venue = $(el).find(".Scoreboard__Venue span").text().trim();

    if (teams.length === 2 && scores.length === 2) {
      games.push({
        teamA: teams[0],
        teamB: teams[1],
        scoreA: scores[0],
        scoreB: scores[1],
        venue: venue || "未知球場",
      });
    }
  });

  return games;
}

// --- 勝率計算 ---
function calculateRecord(teamName, games) {
  let wins = 0;
  let losses = 0;

  for (const g of games) {
    if (g.teamA === teamName) {
      if (g.scoreA > g.scoreB) wins++;
      else losses++;
    } else if (g.teamB === teamName) {
      if (g.scoreB > g.scoreA) wins++;
      else losses++;
    }
  }

  return { wins, losses, games: games.length };
}

function calculateHeadToHead(teamA, teamB, games) {
  let aWins = 0;
  let bWins = 0;

  const h2hGames = games.filter(
    (g) =>
      (g.teamA === teamA && g.teamB === teamB) ||
      (g.teamA === teamB && g.teamB === teamA)
  );

  for (const g of h2hGames) {
    const aScore = g.teamA === teamA ? g.scoreA : g.scoreB;
    const bScore = g.teamA === teamA ? g.scoreB : g.scoreA;
    if (aScore > bScore) aWins++;
    else bWins++;
  }

  return { count: h2hGames.length, aWins, bWins };
}

// --- 主函式 ---
export async function buildNBAStats({ teamA, teamB, date }) {
  const $ = await fetchESPNScoreboard({ date });
  const games = parseMatchups($);

  const recentGames = games.filter(
    (g) =>
      g.teamA === teamA ||
      g.teamB === teamA ||
      g.teamA === teamB ||
      g.teamB === teamB
  );

  const seasonStats = {
    [teamA]: calculateRecord(teamA, recentGames),
    [teamB]: calculateRecord(teamB, recentGames),
  };

  const recentStats = {
    [teamA]: calculateRecord(teamA, recentGames.slice(0, 5)),
    [teamB]: calculateRecord(teamB, recentGames.slice(0, 5)),
  };

  const h2hStats = calculateHeadToHead(teamA, teamB, recentGames);

  const recent = recentGames.find(
    (g) =>
      (g.teamA === teamA && g.teamB === teamB) ||
      (g.teamA === teamB && g.teamB === teamA)
  );

  return {
    seasonStats,
    recentStats,
    h2hStats,
    location: recent?.venue || "未知球場",
    text: `NBA：${teamA} vs ${teamB}，球場 ${
      recent?.venue || "未知"
    }`,
  };
}
