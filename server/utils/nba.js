// server/utils/nba.js
import fetch from "node-fetch";

/* -------------------------------------------------------
   NBA.com GraphQL — 可抓未來賽程
-------------------------------------------------------- */
const GRAPHQL_URL = "https://nba.prod.playflow.io/graphql";

async function nbaGraphQL(body) {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "content-type":"application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

/* -------------------------------------------------------
   1) 取得完整賽程（含未來）
-------------------------------------------------------- */
async function loadSchedule() {
  const query = {
    operationName: "leagueSchedule",
    variables: {},
    query: `
      query leagueSchedule {
        schedule {
          games {
            gameId
            gameDateTime
            homeTeam { teamId teamName teamTricode }
            awayTeam { teamId teamName teamTricode }
            venue { venueName }
          }
        }
      }
    `
  };
  const json = await nbaGraphQL(query);
  return json?.data?.schedule?.games || [];
}

/* -------------------------------------------------------
   2) 取得 standings：主/客場戰績
-------------------------------------------------------- */
async function loadStandings() {
  const q = {
    operationName:"standings",
    variables:{ leagueId: 00, season: "2024" },
    query: `
      query standings($leagueId:Int,$season:String) {
        standings(leagueId:$leagueId, season:$season) {
          teamId
          homeRecord { wins losses }
          awayRecord { wins losses }
        }
      }
    `
  };
  const res = await nbaGraphQL(q);
  return res?.data?.standings || [];
}

/* -------------------------------------------------------
   3) 取得 NBA 官方進階數據（pace / ortg / drtg / net）
-------------------------------------------------------- */
async function loadAdvancedStats() {
  const q = {
    operationName: "leagueStatsTeams",
    variables: { leagueId: 00, season: "2024" },
    query: `
      query leagueStatsTeams($leagueId:Int,$season:String) {
        teamStats(leagueId:$leagueId, season:$season) {
          teamId
          pace
          offRating
          defRating
          netRating
          ppg
          papg
        }
      }
    `
  };
  const res = await nbaGraphQL(q);
  return res?.data?.teamStats || [];
}

/* -------------------------------------------------------
   4) 取得單隊 schedule → last 10
-------------------------------------------------------- */
async function getLast10(teamId) {
  try {
    const url = `https://data.nba.net/data/10s/prod/v1/2024/teams/${teamId}/schedule.json`;
    const data = await fetch(url).then(r => r.json());

    const games = data.league.standard.filter(g => g.statusNum === 3); // 已完賽
    const last10 = games.slice(-10);

    let w = 0, l = 0;
    last10.forEach(g => {
      const home = g.hTeam.teamId;
      const my = (home === teamId) ? g.hTeam.score : g.vTeam.score;
      const op = (home === teamId) ? g.vTeam.score : g.hTeam.score;
      if (my > op) w++; else l++;
    });

    return { games: last10.length, w, l };
  } catch {
    return { games: null, w: null, l: null };
  }
}

/* -------------------------------------------------------
   5) H2H 對戰紀錄（NBA 官方）
-------------------------------------------------------- */
async function getH2H(homeId, awayId) {
  try {
    const url = `https://data.nba.net/data/10s/prod/v1/2024/games.json`;
    const data = await fetch(url).then(r => r.json());

    const all = data.league.standard.filter(
      g =>
        (g.hTeam.teamId === homeId && g.vTeam.teamId === awayId) ||
        (g.hTeam.teamId === awayId && g.vTeam.teamId === homeId)
    );

    let aWins = 0, bWins = 0;
    for (const g of all) {
      const h = g.hTeam.score;
      const v = g.vTeam.score;
      if (g.hTeam.teamId === homeId) {
        if (h > v) aWins++; else bWins++;
      } else {
        if (v > h) aWins++; else bWins++;
      }
    }

    return { count: all.length, aWins, bWins };
  } catch {
    return { count: 0, aWins: 0, bWins: 0 };
  }
}

/* -------------------------------------------------------
   6) 傷兵（ESPN）
-------------------------------------------------------- */
async function getInjury(teamTri) {
  try {
    const html = await fetch(
      `https://www.espn.com/nba/team/injuries/_/name/${teamTri.toLowerCase()}`
    ).then(r => r.text());

    const rows = [...html.matchAll(/AnchorLink">(.+?)<\/a>.*?<td>(.+?)<\/td>/gs)];
    return rows.map(r => ({
      player: r[1],
      status: r[2]
    }));
  } catch {
    return [];
  }
}

/* -------------------------------------------------------
   主函式：完全強化版 buildNBAStats
-------------------------------------------------------- */
export async function buildNBAStats({ teamA, teamB, date }) {
  try {
    const triA = getTriCode(teamA);
    const triB = getTriCode(teamB);
    if (!triA || !triB) return null;

    /* 讀取所有資料 */
    const [schedule, standings, adv] = await Promise.all([
      loadSchedule(),
      loadStandings(),
      loadAdvancedStats()
    ]);

    /* 找當天比賽 */
    const game = schedule.find(g => {
      const d = g.gameDateTime.substring(0, 10);
      return (
        d === date &&
        (
          (g.homeTeam.teamTricode === triA && g.awayTeam.teamTricode === triB) ||
          (g.homeTeam.teamTricode === triB && g.awayTeam.teamTricode === triA)
        )
      );
    });

    if (!game) return null;

    /* 整理基本資訊 */
    const home = game.homeTeam.teamName;
    const away = game.awayTeam.teamName;
    const homeId = game.homeTeam.teamId;
    const awayId = game.awayTeam.teamId;
    const location = game.venue?.venueName || "Unknown Arena";

    /* 近況 */
    const recentStats = {
      [home]: await getLast10(homeId),
      [away]: await getLast10(awayId)
    };

    /* 進階 stats */
    const advHome = adv.find(t => t.teamId === homeId) || {};
    const advAway = adv.find(t => t.teamId === awayId) || {};

    const advStats = {
      [home]: {
        pts: advHome.ppg,
        papg: advHome.papg,
        pace: advHome.pace,
        ortg: advHome.offRating,
        drtg: advHome.defRating,
        net: advHome.netRating
      },
      [away]: {
        pts: advAway.ppg,
        papg: advAway.papg,
        pace: advAway.pace,
        ortg: advAway.offRating,
        drtg: advAway.defRating,
        net: advAway.netRating
      }
    };

    /* 主客場 */
    const hs = standings.find(s => s.teamId == homeId);
    const as = standings.find(s => s.teamId == awayId);
    const homeAwayStats = {
      [home]: {
        homeW: hs?.homeRecord?.wins ?? null,
        homeL: hs?.homeRecord?.losses ?? null,
        awayW: hs?.awayRecord?.wins ?? null,
        awayL: hs?.awayRecord?.losses ?? null,
      },
      [away]: {
        homeW: as?.homeRecord?.wins ?? null,
        homeL: as?.homeRecord?.losses ?? null,
        awayW: as?.awayRecord?.wins ?? null,
        awayL: as?.awayRecord?.losses ?? null,
      }
    };

    /* 對戰 */
    const h2hStats = await getH2H(homeId, awayId);

    /* 傷兵 */
    const injuries = {
      [home]: await getInjury(triA),
      [away]: await getInjury(triB)
    };

    /* Logo */
    const logos = {
      [home]: `https://cdn.nba.com/logos/nba/${homeId}/primary/L/logo.svg`,
      [away]: `https://cdn.nba.com/logos/nba/${awayId}/primary/L/logo.svg`
    };

    /* 最終格式（100% 相容 data.js） */
    return {
      league: "NBA",
      homeTeam: home,
      awayTeam: away,
      location,

      recentStats,
      h2hStats,
      advStats,
      homeAwayStats,
      injuries,
      logos,

      seasonStats: {},
      text: `${home} vs ${away} NBA stats loaded.`
    };
  } catch (err) {
    console.error("NBA Enhanced Error:", err);
    return null;
  }
}

/* -------------------------------------------------------
   TriCode / FullName（你原本的保留）
-------------------------------------------------------- */

function getTriCode(name) {
  const map = {
    "Atlanta Hawks": "ATL", "Boston Celtics": "BOS", "Brooklyn Nets": "BKN",
    "Charlotte Hornets": "CHA", "Chicago Bulls": "CHI", "Cleveland Cavaliers": "CLE",
    "Dallas Mavericks": "DAL", "Denver Nuggets": "DEN", "Detroit Pistons": "DET",
    "Golden State Warriors": "GSW", "Houston Rockets": "HOU", "Indiana Pacers": "IND",
    "Los Angeles Clippers": "LAC", "Los Angeles Lakers": "LAL",
    "Memphis Grizzlies": "MEM", "Miami Heat": "MIA", "Milwaukee Bucks": "MIL",
    "Minnesota Timberwolves": "MIN", "New Orleans Pelicans": "NOP",
    "New York Knicks": "NYK", "Oklahoma City Thunder": "OKC", "Orlando Magic": "ORL",
    "Philadelphia 76ers": "PHI", "Phoenix Suns": "PHX",
    "Portland Trail Blazers": "POR", "Sacramento Kings": "SAC",
    "San Antonio Spurs": "SAS", "Toronto Raptors": "TOR",
    "Utah Jazz": "UTA", "Washington Wizards": "WAS"
  };
  return map[name] || null;
}

function getTeamFullName(tri) {
  const map = {
    ATL: "Atlanta Hawks", BOS: "Boston Celtics", BKN: "Brooklyn Nets",
    CHA: "Charlotte Hornets", CHI: "Chicago Bulls", CLE: "Cleveland Cavaliers",
    DAL: "Dallas Mavericks", DEN: "Denver Nuggets", DET: "Detroit Pistons",
    GSW: "Golden State Warriors", HOU: "Houston Rockets", IND: "Indiana Pacers",
    LAC: "Los Angeles Clippers", LAL: "Los Angeles Lakers", MEM: "Memphis Grizzlies",
    MIA: "Miami Heat", MIL: "Milwaukee Bucks", MIN: "Minnesota Timberwolves",
    NOP: "New Orleans Pelicans", NYK: "New York Knicks", OKC: "Oklahoma City Thunder",
    ORL: "Orlando Magic", PHI: "Philadelphia 76ers", PHX: "Phoenix Suns",
    POR: "Portland Trail Blazers", SAC: "Sacramento Kings",
    SAS: "San Antonio Spurs", TOR: "Toronto Raptors", UTA: "Utah Jazz",
    WAS: "Washington Wizards"
  };
  return map[tri] || "Unknown Team";
}
