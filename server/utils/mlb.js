// server/utils/mlb.js
import fetch from "node-fetch";

/* -------------------------------------------------------
   MLB：取得賽事、先發投手、球場、近況、對戰、打擊/投球數據
-------------------------------------------------------- */

export async function buildMLBStats({ teamA, teamB, date }) {
  try {
    const scheduleUrl = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}`;
    const scheduleResp = await fetch(scheduleUrl);
    const scheduleData = await scheduleResp.json();

    const games = scheduleData?.dates?.[0]?.games || [];
    const game = games.find(
      (g) =>
        g.teams?.away?.team?.name === teamA &&
        g.teams?.home?.team?.name === teamB
    ) || games.find(
      (g) =>
        g.teams?.away?.team?.name === teamB &&
        g.teams?.home?.team?.name === teamA
    );

    // ❌ 無比賽 → 回傳 null
    if (!game) return null;

    const home = game.teams.home.team.name;
    const away = game.teams.away.team.name;
    const venue = game.venue?.name || "未知球場";

    /* -------------------------------------------------------
       取得先發投手（probablePitcher）
    -------------------------------------------------------- */
    const pitchersByTeam = {};

    const getPitcherName = (teamData) => {
      const p = teamData?.probablePitcher;
      if (!p) return "未公布";
      return p.fullName || "未公布";
    };

    pitchersByTeam[home] = getPitcherName(game.teams.home);
    pitchersByTeam[away] = getPitcherName(game.teams.away);

    /* -------------------------------------------------------
       球隊近況（最近10場）
    -------------------------------------------------------- */
    async function getRecent(teamName) {
      try {
        const standingsRes = await fetch(
          `https://statsapi.mlb.com/api/v1/teams?season=2024&sportId=1`
        );
        const standings = await standingsRes.json();
        const team = standings.teams.find((t) => t.name === teamName);
        if (!team) return null;

        const last10Url = `https://statsapi.mlb.com/api/v1/teams/${team.id}/stats?group=standings&stats=lastTen`;
        const last10Res = await fetch(last10Url);
        const last10 = await last10Res.json();

        const record = last10.stats?.[0]?.splits?.[0]?.stat || null;
        return record ? {
          games: 10,
          w: record.wins,
          l: record.losses
        } : null;
      } catch {
        return null;
      }
    }

    const recentStats = {
      [home]: await getRecent(home),
      [away]: await getRecent(away)
    };

    /* -------------------------------------------------------
       對戰紀錄 head-to-head
    -------------------------------------------------------- */
    async function getH2H() {
      try {
        const h2hUrl = `https://statsapi.mlb.com/api/v1/teams/${game.teams.home.team.id}/stats?stats=vsTeam&group=hitting`;
        const res = await fetch(h2hUrl);
        const data = await res.json();

        const vs = data.stats?.[0]?.splits?.find(
          (s) => s.opponent?.name === away
        );

        if (!vs)
          return { count: 0, aWins: 0, bWins: 0 };

        return {
          count: vs.stat.gamesPlayed,
          aWins: vs.stat.wins,
          bWins: vs.stat.losses
        };
      } catch {
        return { count: 0, aWins: 0, bWins: 0 };
      }
    }

    const h2hStats = await getH2H();

    /* -------------------------------------------------------
       投手 ERA / 打擊 AVG（用 advanced stats）
    -------------------------------------------------------- */

    async function getTeamStats(teamId) {
      try {
        const battingRes = await fetch(
          `https://statsapi.mlb.com/api/v1/teams/${teamId}/stats?stats=season&group=hitting`
        );
        const batting = await battingRes.json();
        const b = batting.stats?.[0]?.splits?.[0]?.stat || {};

        const pitchingRes = await fetch(
          `https://statsapi.mlb.com/api/v1/teams/${teamId}/stats?stats=season&group=pitching`
        );
        const pitching = await pitchingRes.json();
        const p = pitching.stats?.[0]?.splits?.[0]?.stat || {};

        return {
          avg: b.avg,
          ops: b.ops,
          era: p.era,
          whip: p.whip,
        };
      } catch {
        return {};
      }
    }

    const homeStats = await getTeamStats(game.teams.home.team.id);
    const awayStats = await getTeamStats(game.teams.away.team.id);

    return {
      league: "MLB",
      homeTeam: home,
      awayTeam: away,
      location: venue,
      pitchersByTeam,
      seasonStats: {
        [home]: homeStats,
        [away]: awayStats,
      },
      recentStats,
      h2hStats,
    };
  } catch (err) {
    console.error("MLB stats error:", err);
    return null;
  }
}
