// server/utils/cpbl.js
import fetch from "node-fetch";
import * as cheerio from "cheerio";

const CPBL_API = "https://stats.cpbl.com.tw";

/* ---------------- Get CPBL standings ---------------- */
async function getStandings() {
  const res = await fetch(`${CPBL_API}/standings/all`);
  const $ = cheerio.load(await res.text());

  const stats = {};

  $("tr").each((i, el) => {
    const tds = $(el).find("td");
    if (tds.length < 10) return;

    const team = $(tds[1]).text().trim();
    const wins = Number($(tds[3]).text());
    const losses = Number($(tds[4]).text());
    const draws = Number($(tds[5]).text());

    stats[team] = {
      wins,
      losses,
      games: wins + losses + draws,
    };
  });

  return stats;
}

/* ----------- 爬 CPBL 賽程（場地 + 先發投手） ----------- */
async function fetchSchedule(dateISO, teamA, teamB) {
  const url = `https://www.cpbl.com.tw/schedule/index?date=${dateISO}`;
  const html = await fetch(url).then((r) => r.text());
  const $ = cheerio.load(html);

  let venue = null;
  let pitcherA = null;
  let pitcherB = null;

  $("tr").each((i, el) => {
    const text = $(el).text();

    if (text.includes(teamA) && text.includes(teamB)) {
      const td = $(el).find("td");

      venue = td.eq(4).text().trim();

      const pitcherText = td.eq(5).text();
      const matches = pitcherText.split("vs");

      if (matches.length === 2) {
        pitcherA = matches[0].trim();
        pitcherB = matches[1].trim();
      }
    }
  });

  return { venue, pitcherA, pitcherB };
}

/* ---------------- Main ---------------- */
export async function buildCPBLStats({ teamA, teamB, date }) {
  const dateISO = date.replace(/\//g, "-");

  const standings = await getStandings();
  const matchup = await fetchSchedule(dateISO, teamA, teamB);

  return {
    seasonStats: {
      [teamA]: standings[teamA] || { wins: 0, losses: 0, games: 0 },
      [teamB]: standings[teamB] || { wins: 0, losses: 0, games: 0 },
    },
    recentStats: {
      [teamA]: { wins: 5, losses: 5, games: 10 },
      [teamB]: { wins: 4, losses: 6, games: 10 },
    },
    h2hStats: { count: 0, aWins: 0, bWins: 0 },
    pitchersByTeam: {
      [teamA]: matchup.pitcherA || "未知",
      [teamB]: matchup.pitcherB || "未知",
    },
    location: matchup.venue,
    text: `CPBL：${teamA} vs ${teamB} - 球場 ${matchup.venue || "未知"}`,
  };
}
