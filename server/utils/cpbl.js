// server/utils/cpbl.js
import fetch from "node-fetch";

/* -------------------------------------------------------
   CPBL：官方賽程 + 先發 + 球場 + 近況 + 對戰
-------------------------------------------------------- */

export async function buildCPBLStats({ teamA, teamB, date }) {
  try {
    const scheduleUrl = `https://stats.cpbl.com.tw/api/schedule?date=${date}`;
    const res = await fetch(scheduleUrl);
    const data = await res.json();

    const games = data?.data || [];
    const game = games.find(
      (g) => g.home === teamA && g.away === teamB
    ) || games.find(
      (g) => g.home === teamB && g.away === teamA
    );

    if (!game) return null;

    const home = game.home;
    const away = game.away;
    const venue = game.site || "未知球場";

    /* -------------------------------------------------------
       近況（10場）
    -------------------------------------------------------- */
    async function getRecent(team) {
      try {
        const url = `https://stats.cpbl.com.tw/api/team_last10?team=${encodeURIComponent(team)}`;
        const r = await fetch(url);
        const d = await r.json();

        return {
          games: 10,
          w: d.wins,
          l: d.losses,
        };
      } catch {
        return null;
      }
    }

    /* -------------------------------------------------------
       對戰紀錄
    -------------------------------------------------------- */
    async function getH2H() {
      try {
        const url = `https://stats.cpbl.com.tw/api/vs?teamA=${home}&teamB=${away}`;
        const r = await fetch(url);
        const d = await r.json();

        return {
          count: d.games,
          aWins: d.home_wins,
          bWins: d.away_wins,
        };
      } catch {
        return { count: 0, aWins: 0, bWins: 0 };
      }
    }

    /* -------------------------------------------------------
       先發投手
    -------------------------------------------------------- */
    const pitchersByTeam = {
      [home]: game.home_pitcher || "未公布",
      [away]: game.away_pitcher || "未公布",
    };

    return {
      league: "CPBL",
      homeTeam: home,
      awayTeam: away,
      location: venue,

      recentStats: {
        [home]: await getRecent(home),
        [away]: await getRecent(away),
      },

      pitchersByTeam,
      h2hStats: await getH2H(),
    };
  } catch (err) {
    console.error("CPBL stats error:", err);
    return null;
  }
}
