import fetch from "node-fetch";

/* -------------------------------------------------------
   官方 NBA stats API header（必要，不然 403）
-------------------------------------------------------- */
const NBA_HEADERS = {
  "Host": "stats.nba.com",
  "Connection": "keep-alive",
  "x-nba-stats-origin": "stats",
  "x-nba-stats-token": "true",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Referer": "https://www.nba.com/",
  "Accept-Language": "en-US,en;q=0.9",
};

/* -------------------------------------------------------
   查整季賽程（等同 nba_api 的 LeagueSchedule）
   來源：
   https://stats.nba.com/stats/leagueSchedule?LeagueID=00&Season=2025-26
-------------------------------------------------------- */
async function getSeasonSchedule(season) {
  const url = `https://stats.nba.com/stats/leagueSchedule?LeagueID=00&Season=${season}`;

  const res = await fetch(url, { headers: NBA_HEADERS });
  const data = await res.json();

  const games = data?.leagueSchedule?.gameDates?.flatMap((d) => d?.games) ?? [];
  return games;
}

/* -------------------------------------------------------
   日期格式：YYYY-MM-DD → YYYYMMDD
-------------------------------------------------------- */
function toCompact(date) {
  return date.replace(/-/g, "");
}

/* -------------------------------------------------------
   team 名稱 → triCode
-------------------------------------------------------- */
const TEAM_NAME_TO_TRI = {
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

/* -------------------------------------------------------
   主函式：buildNBAStats（A 版本：整季查詢）
-------------------------------------------------------- */
export async function buildNBAStats({ teamA, teamB, date }) {
  try {
    const triA = TEAM_NAME_TO_TRI[teamA];
    const triB = TEAM_NAME_TO_TRI[teamB];

    if (!triA || !triB) return null;

    /* ---- season 判定 ---- */
    const year = Number(date.split("-")[0]);
    const month = Number(date.split("-")[1]);

    // NBA 賽季從 10 月開始 → 如果日期在 2025/01/xx → 賽季是 2024-25
    const season =
      month >= 10 ? `${year}-${(year + 1).toString().slice(2)}` : `${year - 1}-${year.toString().slice(2)}`;

    const fullSchedule = await getSeasonSchedule(season);

    const targetDate = toCompact(date);

    /* ---- 找當天的所有比賽 ---- */
    const dayGames = fullSchedule.filter((g) => g.gameDate === targetDate);

    if (!dayGames.length) return null;

    /* ---- 找是否為指定兩隊的比賽 ---- */
    const game =
      dayGames.find(
        (g) =>
          (g.homeTeam?.teamTricode === triA && g.awayTeam?.teamTricode === triB) ||
          (g.homeTeam?.teamTricode === triB && g.awayTeam?.teamTricode === triA)
      ) || null;

    if (!game) return null;

    /* ---- 整理資料回傳給前端 ---- */
    const homeTri = game.homeTeam.teamTricode;
    const awayTri = game.awayTeam.teamTricode;

    return {
      league: "NBA",
      homeTeam: game.homeTeam.teamName,
      awayTeam: game.awayTeam.teamName,
      location: game.arenaName || "Unknown Arena",

      logos: {
        [game.homeTeam.teamName]: `https://cdn.nba.com/logos/nba/${game.homeTeam.teamId}/primary/L/logo.svg`,
        [game.awayTeam.teamName]: `https://cdn.nba.com/logos/nba/${game.awayTeam.teamId}/primary/L/logo.svg`,
      },

      /* A 版本只做完整賽程，以下留空避免 server crash */
      recentStats: {},
      advStats: {},
      h2hStats: {},
      injuries: {},

      seasonStats: {},
      text: `Game Found: ${game.gameCode}`,
    };
  } catch (err) {
    console.error("NBA Season Schedule Error:", err);
    return null;
  }
}
