
 // server/utils/mlb.js
export async function buildMLBStats({ teamA, teamB, date }) {
  return {
    seasonStats: {
      [teamA]: { wins: 60, losses: 40, games: 100 },
      [teamB]: { wins: 50, losses: 50, games: 100 }
    },
    recentStats: {
      [teamA]: { w: 6, l: 4, games: 10 },
      [teamB]: { w: 5, l: 5, games: 10 }
    },
    h2hStats: {
      count: 5,
      aWins: 3,
      bWins: 2
    },
    pitchersByTeam: {
      [teamA]: "先發投手A",
      [teamB]: "先發投手B"
    }
  };
}
