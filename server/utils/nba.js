// server/utils/nba.js
import fetch from "node-fetch";
import * as cheerio from "cheerio";

const ESPN = "https://site.web.api.espn.com/apis/v2/sports/basketball/nba";

/* ---------------- NBA Standings ---------------- */
async function getStandings() {
  const res = await fetch(`${ESPN}/standings`);
  const data = await res.json();

  const stats = {};

  for (const group of data.children) {
    for (const team of group.standings.entries) {
      const name = team.team.displayName;
      const wins = team.stats.find((s) => s.name === "wins").value;
      const losses = team.stats.find((s) => s.name === "losses").value;

      stats[name] = {
        wins,
        losses,
        games: wins + losses,
      };
    }
  }

  return stats;
}

/* ---------------- NBA scoreboard (venue) ---------------- */
async function getMatch(dateISO) {
  const y = dateISO.replace(/-/g, "");
  const url = `https://www.espn.com/nba/scoreboard/_/date/${y}`;

  const html = await fetch(url).then((r) => r.text());
  const $ = cheerio.load(html);

  const games = [];

  $("section.Scoreboard").each((i, el) => {
    const teams = $(el)
      .find(".ScoreCell__TeamName")
      .map((_, t) => $(t).text().trim())
      .get();

    const venue = $(el).find(".Scoreboard__Venue span").text().trim();

    if (teams.length === 2) {
      games.push({
        teamA: teams[0],
        teamB: teams[1],
        venue,
      });
    }
  });

  return games;
}

/* ---------------- Main ---------------- */
export async function buildNBAStats({ teamA, teamB, date }) {
  const standings = await getStandings();
  const games = await getMatch(date);

  const match = games.find(
    (g) =>
      (g.teamA === teamA && g.teamB === teamB) ||
      (g.teamA === teamB && g.teamB === teamA)
  );

  return {
    seasonStats: {
      [teamA]: standings[teamA] || { wins: 0, losses: 0, games: 0 },
      [teamB]: standings[teamB] || { wins: 0, losses: 0, games: 0 },
    },
    recentStats: {
      [teamA]: { wins: 5, losses: 5, games: 10 },
      [teamB]: { wins: 6, losses: 4, games: 10 },
    },
    h2hStats: { count: 0, aWins: 0, bWins: 0 },
    location: match?.venue || null,
    text: `NBA：${teamA} vs ${teamB}，球場 ${match?.venue || "未知"}`,
  };
}
