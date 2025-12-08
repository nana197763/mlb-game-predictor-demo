import fetch from "node-fetch";

/* -------------------------------------------------------
   NBA :: 使用 NBA.com Graph API（官方、可查未來賽程）
-------------------------------------------------------- */

const NBA_GRAPHQL = "https://nba.com/graphql";

/* -------------------------------------------------------
   GraphQL POST
-------------------------------------------------------- */
async function gql(query, variables = {}) {
  const res = await fetch(NBA_GRAPHQL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });

  return res.json();
}

/* -------------------------------------------------------
   查詢：某日比賽列表
-------------------------------------------------------- */
async function getGamesByDate(date) {
  const query = `
    query GamesByDate($date: String!) {
      gamesByDate(date: $date) {
        gameId
        gameTimeUTC
        homeTeam { teamId name tricode }
        awayTeam { teamId name tricode }
        venue { name }
      }
    }
  `;

  const d = await gql(query, { date });
  return d?.data?.gamesByDate || [];
}

/* -------------------------------------------------------
   查詢：最近十場
-------------------------------------------------------- */
async function getLast10(teamId) {
  const query = `
    query Last10($teamId: ID!) {
      teamRecentGames(teamId: $teamId, last: 10) {
        homeTeam { teamId score }
        awayTeam { teamId score }
      }
    }
  `;

  const d = await gql(query, { teamId });
  const list = d?.data?.teamRecentGames || [];

  let w = 0, l = 0;
  for (const g of list) {
    const isHome = g.homeTeam.teamId === teamId;
    const my = isHome ? g.homeTeam.score : g.awayTeam.score;
    const op = isHome ? g.awayTeam.score : g.homeTeam.score;
    if (my > op) w++;
    else l++;
  }

  return { games: list.length, w, l };
}

/* -------------------------------------------------------
   查詢：進階數據（PACE / ORTG / DRTG / PPG / Net）
-------------------------------------------------------- */
async function getAdvanced(teamId) {
  const query = `
    query Adv($teamId: ID!) {
      teamStats(teamId: $teamId) {
        pace
        ortg
        drtg
        netRating
        ppg
        papg
      }
    }
  `;

  const d = await gql(query, { teamId });
  return d?.data?.teamStats || {};
}

/* -------------------------------------------------------
   查詢：對戰紀錄（H2H）
-------------------------------------------------------- */
async function getH2H(homeId, awayId) {
  const query = `
    query H2H($home: ID!, $away: ID!) {
      headToHead(homeTeamId: $home, awayTeamId: $away) {
        games {
          homeTeam { teamId score }
          awayTeam { teamId score }
        }
      }
    }
  `;

  const d = await gql(query, { home: homeId, away: awayId });
  const games = d?.data?.headToHead?.games || [];

  let aWins = 0, bWins = 0;
  for (const g of games) {
    if (g.homeTeam.score > g.awayTeam.score) aWins++;
    else bWins++;
  }

  return { count: games.length, aWins, bWins };
}

/* -------------------------------------------------------
   傷兵（ESPN）
-------------------------------------------------------- */
async function getInjury(tri) {
  try {
    const html = await fetch(
      `https://www.espn.com/nba/team/injuries/_/name/${tri.toLowerCase()}`
    ).then((r) => r.text());

    const rows = [...html.matchAll(/AnchorLink">(.+?)<\/a>.*?<td>(Out.*?)<\/td>/gs)];
    return rows.map((r) => ({ player: r[1], status: r[2] }));
  } catch {
    return [];
  }
}

/* -------------------------------------------------------
   隊名 → TRI Code
-------------------------------------------------------- */
function mapNameToTri(name) {
  const map = {
    "Atlanta Hawks": "ATL",
    "Boston Celtics": "BOS",
    "Brooklyn Nets": "BKN",
    "Charlotte Hornets": "CHA",
    "Chicago Bulls": "CHI",
    "Cleveland Cavaliers": "CLE",
    "Dallas Mavericks": "DAL",
    "Denver Nuggets": "DEN",
    "Detroit Pistons": "DET",
    "Golden State Warriors": "GSW",
    "Houston Rockets": "HOU",
    "Indiana Pacers": "IND",
    "Los Angeles Clippers": "LAC",
    "Los Angeles Lakers": "LAL",
    "Memphis Grizzlies": "MEM",
    "Miami Heat": "MIA",
    "Milwaukee Bucks": "MIL",
    "Minnesota Timberwolves": "MIN",
    "New Orleans Pelicans": "NOP",
    "New York Knicks": "NYK",
    "Oklahoma City Thunder": "OKC",
    "Orlando Magic": "ORL",
    "Philadelphia 76ers": "PHI",
    "Phoenix Suns": "PHX",
    "Portland Trail Blazers": "POR",
    "Sacramento Kings": "SAC",
    "San Antonio Spurs": "SAS",
    "Toronto Raptors": "TOR",
    "Utah Jazz": "UTA",
    "Washington Wizards": "WAS",
  };
  return map[name] || null;
}

/* -------------------------------------------------------
   主函式：整合輸出格式（完全符合 data.js）
-------------------------------------------------------- */
export async function buildNBAStats({ teamA, teamB, date }) {
  try {
    const triA = mapNameToTri(teamA);
    const triB = mapNameToTri(teamB);

    const games = await getGamesByDate(date);

    const game = games.find(
      (g) =>
        (g.homeTeam.tricode === triA && g.awayTeam.tricode === triB) ||
        (g.homeTeam.tricode === triB && g.awayTeam.tricode === triA)
    );

    if (!game) return null;

    const home = game.homeTeam.name;
    const away = game.awayTeam.name;

    const homeId = game.homeTeam.teamId;
    const awayId = game.awayTeam.teamId;

    const location = game.venue?.name ?? "Unknown Arena";

    const recentStats = {
      [home]: await getLast10(homeId),
      [away]: await getLast10(awayId),
    };

    const advStats = {
      [home]: await getAdvanced(homeId),
      [away]: await getAdvanced(awayId),
    };

    const h2hStats = await getH2H(homeId, awayId);

    const injuries = {
      [home]: await getInjury(game.homeTeam.tricode),
      [away]: await getInjury(game.awayTeam.tricode),
    };

    const logos = {
      [home]: `https://cdn.nba.com/logos/nba/${homeId}/primary/L/logo.svg`,
      [away]: `https://cdn.nba.com/logos/nba/${awayId}/primary/L/logo.svg`,
    };

    return {
      league: "NBA",
      homeTeam: home,
      awayTeam: away,
      location,
      recentStats,
      h2hStats,
      advStats,
      injuries,
      logos,
      seasonStats: {},
      text: "NBA Official Graph API Ready",
    };
  } catch (err) {
    console.error("NBA Graph API Error:", err);
    return null;
  }
}
