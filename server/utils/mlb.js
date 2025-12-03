// server/utils/mlb.js
import fetch from "node-fetch";

const ESPN = "https://site.web.api.espn.com/apis/site/v2/sports/baseball/mlb";

/* 取得 MLB 賽程（可查當天或未來） */
async function fetchMLBSchedule(date) {
  const url = `${ESPN}/scoreboard?dates=${date}`;
  const res = await fetch(url);
  return res.json();
}

/* 查詢 MLB 球隊整季戰績（Standing） */
async function fetchMLBStandings() {
  const url = `${ESPN}/standings`;
  const res = await fetch(url);
  return res.json();
}

/* 解析站績到乾淨格式 */
function parseTeamRecord(teamName, standingsJson) {
  const groups = standingsJson.children;
  for (const g of groups) {
    for (const t of g.standings.entries) {
      const name = t.team.displayName;
      if (name.toLowerCase() === teamName.toLowerCase()) {
        return {
          wins: t.stats.find(s => s.name === "wins")?.value ?? 0,
          losses: t.stats.find(s => s.name === "losses")?.value ?? 0,
          games: t.stats.find(s => s.name === "gamesPlayed")?.value ?? 1
        };
      }
    }
  }
  return null;
}

/* 抓 MLB 近 10 場 */
async function fetchRecent10(teamId) {
  const url = `${ESPN}/teams/${teamId}/schedule?limit=10`;
  const res = await fetch(url);
  const json = await res.json();

  let wins = 0;
  let losses = 0;

  for (const g of json.events || []) {
    if (!g.competitions?.[0]) continue;
    const comp = g.competitions[0];
    const team = comp.competitors.find(c => c.id === String(teamId));
    if (!team) continue;

    if (team.winner) wins++;
    else losses++;
  }

  return { w: wins, l: losses, games: wins + losses };
}

/* 抓 MLB 先發投手（ESPN 有完整先發資訊） */
function extractPitchers(game) {
  const comp = game.competitions?.[0];
  if (!comp) return { home: null, away: null };

  const h = comp.competitors.find(c => c.homeAway === "home");
  const a = comp.competitors.find(c => c.homeAway === "away");

  return {
    [h.team.displayName]: h.probables?.[0]?.athlete?.displayName || "未公布",
    [a.team.displayName]: a.probables?.[0]?.athlete?.displayName || "未公布",
  };
}

/* ─────────── 主函式 ─────────── */
export async function buildMLBStats({ teamA, teamB, date }) {
  const schedule = await fetchMLBSchedule(date);

  // 找比賽
  let game = null;
  for (const e of schedule.events || []) {
    const teams = e.competitions?.[0]?.competitors || [];

    const names = teams.map(t => t.team.displayName);
    if (
      names.includes(teamA) &&
      names.includes(teamB)
    ) {
      game = e;
      break;
    }
  }

  if (!game) {
    return {
      error: true,
      text: `找不到 MLB ${date} ${teamA} vs ${teamB} 的比賽資料。`
    };
  }

  /* 先發投手 */
  const pitchers = extractPitchers(game);

  /* 整季戰績 */
  const standings = await fetchMLBStandings();
  const recA = parseTeamRecord(teamA, standings);
  const recB = parseTeamRecord(teamB, standings);

  /* teamId */
  const comp = game.competitions?.[0];
  const tA = comp.competitors.find(t => t.team.displayName === teamA);
  const tB = comp.competitors.find(t => t.team.displayName === teamB);

  /* 近況（10 場） */
  const recentA = await fetchRecent10(tA.id);
  const recentB = await fetchRecent10(tB.id);

  return {
    seasonStats: {
      [teamA]: recA,
      [teamB]: recB
    },
    recentStats: {
      [teamA]: recentA,
      [teamB]: recentB,
    },
    h2hStats: { count: 0, aWins: 0, bWins: 0 },
    pitchersByTeam: pitchers,
    location: game.competitions[0]?.venue?.fullName ?? "未知球場",
    text: `MLB 比賽資料：${teamA} vs ${teamB}`
  };
}
