// server/utils/nba.js
import fetch from "node-fetch";

/* -------------------------------------------------------
   NBA：使用官方 API（data.nba.net） + ESPN 傷兵
-------------------------------------------------------- */

function getSeasonYear(date) {
  const y = Number(date.split("-")[0]);
  // NBA 賽季 = 每年 10 月開始 → 隔年 6 月結束
  return y; 
}

export async function buildNBAStats({ teamA, teamB, date }) {
  try {
    const seasonYear = getSeasonYear(date);

    /* -------------------------------------------------------
       1) 讀取 NBA 官方賽程
       ------------------------------------------------------- */
    const scheduleUrl = `https://data.nba.net/data/10s/prod/v1/${seasonYear}/schedule.json`;
    const schedule = await fetch(scheduleUrl).then((r) => r.json());

    const games = schedule?.league?.standard || [];

    // 找符合日期的比賽（UTC → local）
    const game = games.find(g => {
      const d = g.startDateEastern; // 20231115
      const yyyy = d.substring(0, 4);
      const mm = d.substring(4, 6);
      const dd = d.substring(6, 8);
      const formatted = `${yyyy}-${mm}-${dd}`;

      return formatted === date &&
        (
          (g.hTeam?.triCode === getTriCode(teamA) && g.vTeam?.triCode === getTriCode(teamB)) ||
          (g.hTeam?.triCode === getTriCode(teamB) && g.vTeam?.triCode === getTriCode(teamA))
        );
    });

    if (!game) return null; // 找不到比賽

    const homeId = game.hTeam.teamId;
    const awayId = game.vTeam.teamId;

    const homeTri = game.hTeam.triCode;
    const awayTri = game.vTeam.triCode;

    const home = getTeamFullName(homeTri);
    const away = getTeamFullName(awayTri);

    /* -------------------------------------------------------
       2) 球場（Arena）
       ------------------------------------------------------- */
    const location = game.arena?.name || "Unknown Arena";

    /* -------------------------------------------------------
       3) 近 10 場戰績（NBA 官方 API）
       ------------------------------------------------------- */
    async function getLast10(teamId) {
      const url = `https://data.nba.net/data/10s/prod/v1/${seasonYear}/teams/${teamId}/schedule.json`;
      const data = await fetch(url).then(r => r.json());

      const recent = data.league.standard
        .filter(g => g.isGameActivated === false && g.statusNum === 3) // 已完賽
        .slice(-10);

      let w = 0, l = 0;
      for (const g of recent) {
        const isHome = g.hTeam.teamId === teamId;
        const my = isHome ? g.hTeam.score : g.vTeam.score;
        const op = isHome ? g.vTeam.score : g.hTeam.score;
        if (my > op) w++;
        else l++;
      }
      return { games: recent.length, w, l };
    }

    const recentStats = {
      [home]: await getLast10(homeId),
      [away]: await getLast10(awayId),
    };

    /* -------------------------------------------------------
       4) 進階數據：PACE / PTS（官方 stats）
       ------------------------------------------------------- */
    async function getAdvancedStats(teamId) {
      try {
        const url = `https://data.nba.net/data/10s/prod/v1/${seasonYear}/teams/${teamId}/leaders.json`;
        const data = await fetch(url).then(r => r.json());

        return {
          pts: data.league?.standard?.ppg?.value || "?",
          pace: data.league?.standard?.pace?.value || "?"
        };
      } catch {
        return { pts: "?", pace: "?" };
      }
    }

    const advStats = {
      [home]: await getAdvancedStats(homeId),
      [away]: await getAdvancedStats(awayId),
    };

    /* -------------------------------------------------------
       5) 對戰紀錄（H2H）
       ------------------------------------------------------- */
    async function getH2H() {
      const url = `https://data.nba.net/data/10s/prod/v1/${seasonYear}/games.json`;
      const data = await fetch(url).then(r => r.json());

      const all = data.league.standard.filter(g =>
        (g.hTeam.teamId === homeId && g.vTeam.teamId === awayId) ||
        (g.hTeam.teamId === awayId && g.vTeam.teamId === homeId)
      );

      let aWins = 0, bWins = 0;
      for (const g of all) {
        if (g.hTeam.score > g.vTeam.score) {
          if (g.hTeam.teamId === homeId) aWins++;
          else bWins++;
        } else {
          if (g.vTeam.teamId === homeId) aWins++;
          else bWins++;
        }
      }

      return { count: all.length, aWins, bWins };
    }

    const h2hStats = await getH2H();

    /* -------------------------------------------------------
       6) 傷兵（ESPN）
       ------------------------------------------------------- */
    async function getInjury(teamTri) {
      const code = teamTri.toLowerCase();
      try {
        const html = await fetch(`https://www.espn.com/nba/team/injuries/_/name/${code}`)
          .then(r => r.text());

        const result = [...html.matchAll(/AnchorLink">(.+?)<\/a>.*?<td>(Out.*?)<\/td>/gs)];
        return result.map(r => ({ player: r[1], status: r[2] }));
      } catch {
        return [];
      }
    }

    const injuries = {
      [home]: await getInjury(homeTri),
      [away]: await getInjury(awayTri),
    };

    /* -------------------------------------------------------
       7) 球隊 Logo
       ------------------------------------------------------- */
    const logos = {
      [home]: `https://cdn.nba.com/logos/nba/${homeId}/primary/L/logo.svg`,
      [away]: `https://cdn.nba.com/logos/nba/${awayId}/primary/L/logo.svg`,
    };

    /* -------------------------------------------------------
       8) 返還資料（格式符合 data.js）
       ------------------------------------------------------- */
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
      text: `${home} vs ${away} NBA stats loaded.`,
    };

  } catch (err) {
    console.error("NBA Official API Error:", err);
    return null;
  }
}

/* -------------------------------------------------------
   工具：隊伍英文縮寫 / 全名
-------------------------------------------------------- */

function getTriCode(name) {
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
    "Washington Wizards": "WAS"
  };
  return map[name] || null;
}

function getTeamFullName(tri) {
  const map = {
    ATL: "Atlanta Hawks",
    BOS: "Boston Celtics",
    BKN: "Brooklyn Nets",
    CHA: "Charlotte Hornets",
    CHI: "Chicago Bulls",
    CLE: "Cleveland Cavaliers",
    DAL: "Dallas Mavericks",
    DEN: "Denver Nuggets",
    DET: "Detroit Pistons",
    GSW: "Golden State Warriors",
    HOU: "Houston Rockets",
    IND: "Indiana Pacers",
    LAC: "Los Angeles Clippers",
    LAL: "Los Angeles Lakers",
    MEM: "Memphis Grizzlies",
    MIA: "Miami Heat",
    MIL: "Milwaukee Bucks",
    MIN: "Minnesota Timberwolves",
    NOP: "New Orleans Pelicans",
    NYK: "New York Knicks",
    OKC: "Oklahoma City Thunder",
    ORL: "Orlando Magic",
    PHI: "Philadelphia 76ers",
    PHX: "Phoenix Suns",
    POR: "Portland Trail Blazers",
    SAC: "Sacramento Kings",
    SAS: "San Antonio Spurs",
    TOR: "Toronto Raptors",
    UTA: "Utah Jazz",
    WAS: "Washington Wizards"
  };
  return map[tri] || "Unknown Team";
}
