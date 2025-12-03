import fetch from "node-fetch";

const ESPN = "https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba";

/* 抓賽程 */
async function fetchNBASchedule(date) {
  const url = `${ESPN}/scoreboard?dates=${date}`;
  const res = await fetch(url);
  return res.json();
}

/* 抓戰績（Standing） */
async function fetchNBAStandings() {
  const url = `${ESPN}/standings`;
  const res = await fetch(url);
  return res.json();
}

/* 解析勝負 */
function parseRecord(teamName, standings) {
  for (const group of standings.children) {
    for (const t of group.standings.entries) {
      if (t.team.displayName.toLowerCase() === teamName.toLowerCase()) {
        return {
          wins: t.stats.find(s => s.name === "wins")?.value ?? 0,
          losses: t.stats.find(s => s.name === "losses")?.value ?? 0,
          games: t.stats.find(s => s.name === "gamesPlayed")?.value ?? 1,
        };
      }
    }
  }
  return { wins: 0, losses: 0, games: 1 };
}

/* 近 10 場 */
async function fetchRecent10(teamId) {
  const url = `${ESPN}/teams/${teamId}/schedule?limit=10`;
  const res = await fetch(url);
  const json = await res.json();

  let wins = 0;
  let losses = 0;

  for (const g of json.events || []) {
    const comp = g.competitions?.[0];
    const t = comp?.competitors?.find(c => c.id === String(teamId));
    if (!t) continue;

    if (t.winner) wins++;
    else losses++;
  }

  return { wins, losses, games: wins + losses };
}

/* 主函式 */
export async function buildNBAStats({ teamA, teamB, date }) {
  const scoreboard = await fetchNBASchedule(date);

  // 找比賽
  let game = null;
  for (const e of scoreboard.events || []) {
    const teams = e.competitions?.[0]?.competitors || [];
    const names = teams.map(t => t.team.displayName);

    if (names.includes(teamA) && names.includes(teamB)) {
      game = e;
      break;
    }
  }

  if (!game) {
    return {
      error: true,
      text: `找不到 NBA ${date} ${teamA} vs ${teamB} 比賽資料。`
    };
  }

  const standings = await fetchNBAStandings();

  const comp = game.competitions?.[0];
  const tA = comp.competitors.find(t => t.team.displayName === teamA);
  const tB = comp.competitors.find(t => t.team.displayName === teamB);

  const recA = parseRecord(teamA, standings);
  const recB = parseRecord(teamB, standings);

  const recentA = await fetchRecent10(tA.id);
  const recentB = await fetchRecent10(tB.id);

  return {
    seasonStats: {
      [teamA]: recA,
      [teamB]: recB,
    },
    recentStats: {
      [teamA]: { w: recentA.wins, l: recentA.losses, games: recentA.games },
      [teamB]: { w: recentB.wins, l: recentB.losses, games: recentB.games },
    },
    h2hStats: { count: 0, aWins: 0, bWins: 0 },
    pitchersByTeam: {}, // NBA 無投手
    location: comp?.venue?.fullName || "未知球場",
    text: `NBA 賽程資料：${teamA} vs ${teamB}`,
  };
}
