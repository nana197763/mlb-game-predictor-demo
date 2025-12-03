// server/utils/mlb.js
import fetch from "node-fetch";
import * as cheerio from "cheerio";

const ESPN_BASE = "https://www.espn.com";

async function fetchESPNScoreboard({ date }) {
  const ymd = date.replace(/-/g, "");
  const url = `${ESPN_BASE}/mlb/scoreboard/_/date/${ymd}`;
  const html = await fetch(url).then((res) => res.text());
  return cheerio.load(html);
}

function parseMatchups($) {
  const games = [];

  $("section.Scoreboard").each((_, el) => {
    const teams = $(el)
      .find(".ScoreCell__TeamName")
      .map((_, t) => $(t).text().trim())
      .get();

    const venue = $(el).find(".Scoreboard__Venue span").text().trim();

    if (teams.length === 2) {
      games.push({
        teamA: teams[0],
        teamB: teams[1],
        venue: venue || "未知球場",
      });
    }
  });

  return games;
}

/** 假的 team rating，之後你可以改成用 MLB 戰績 API / 爬蟲 */
function dummyTeamRates(teamName) {
  const code = [...teamName].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const base = 0.45 + (code % 20) / 200; // 0.45 ~ 0.55
  const recent = base + ((code % 7) - 3) / 100;
  return {
    seasonWinRate: Math.max(0.35, Math.min(0.65, base)),
    recentWinRate: Math.max(0.3, Math.min(0.7, recent)),
  };
}

/* ───── MLB 統計 ───── */
export async function buildMLBStats({ teamA, teamB, date }) {
  const $ = await fetchESPNScoreboard({ date });
  const games = parseMatchups($);

  const matchup = games.find(
    (g) =>
      (g.teamA === teamA && g.teamB === teamB) ||
      (g.teamA === teamB && g.teamB === teamA)
  );

  if (!matchup) {
    return {
      hasMatch: false,
      date,
      seasonStats: {},
      recentStats: {},
      h2hStats: { count: 0, aWins: 0, bWins: 0 },
      pitchersByTeam: {},
      teamDetails: {},
      location: null,
      text: `找不到 ${date} ${teamA} vs ${teamB} 的 MLB 比賽資料。`,
    };
  }

  const rateA = dummyTeamRates(teamA);
  const rateB = dummyTeamRates(teamB);

  const seasonStats = {
    [teamA]: {
      wins: Math.round(rateA.seasonWinRate * 100),
      losses: 100 - Math.round(rateA.seasonWinRate * 100),
      games: 100,
    },
    [teamB]: {
      wins: Math.round(rateB.seasonWinRate * 100),
      losses: 100 - Math.round(rateB.seasonWinRate * 100),
      games: 100,
    },
  };

  const recentStats = {
    [teamA]: {
      wins: Math.round(rateA.recentWinRate * 10),
      losses: 10 - Math.round(rateA.recentWinRate * 10),
      games: 10,
    },
    [teamB]: {
      wins: Math.round(rateB.recentWinRate * 10),
      losses: 10 - Math.round(rateB.recentWinRate * 10),
      games: 10,
    },
  };

  const h2hStats = {
    count: 3,
    aWins: 2,
    bWins: 1,
  };

  const pitchersByTeam = {
    [teamA]: "Probable Starter A", // 之後可以從 ESPN 詳細頁抓
    [teamB]: "Probable Starter B",
  };

  const teamDetails = {
    [teamA]: {
      seasonWinRate: rateA.seasonWinRate,
      recentWinRate: rateA.recentWinRate,
      h2hWinRate: h2hStats.count ? h2hStats.aWins / h2hStats.count : 0.5,
      starterRating: 0.6,
      homeAdvantage: 0.5, // 假設 teamA 主場，有需要再改
    },
    [teamB]: {
      seasonWinRate: rateB.seasonWinRate,
      recentWinRate: rateB.recentWinRate,
      h2hWinRate: h2hStats.count ? h2hStats.bWins / h2hStats.count : 0.5,
      starterRating: 0.5,
      homeAdvantage: 0,
    },
  };

  return {
    hasMatch: true,
    date,
    seasonStats,
    recentStats,
    h2hStats,
    pitchersByTeam,
    teamDetails,
    location: matchup.venue || null,
    homeTeam: teamA, // 先假設 teamA 主場
    text: `MLB 比賽資料：${teamA} vs ${teamB}，球場 ${matchup.venue || "未知"}。`,
  };
}
