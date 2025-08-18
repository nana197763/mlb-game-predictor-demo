

// MLB 官方 Stats API
export async function getMLBGameData(team, opponent, date, stadium) {
  try {
    const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}`;
    const resp = await fetch(url);
    const data = await resp.json();

    return {
      source: "MLB Stats API",
      games: data.dates?.[0]?.games || [],
    };
  } catch (err) {
    console.error("MLB API error:", err);
    return { error: "MLB fetch failed" };
  }
}

// CPBL OpenData (GitHub repo)
export async function getCPBLGameData(team, opponent, date, stadium) {
  try {
    const url = `https://raw.githubusercontent.com/ldkrsi/cpbl-opendata/master/data/2025/games.json`;
    const resp = await fetch(url);
    const data = await resp.json();

    // 簡單過濾日期
    const games = data.filter((g) => g.date === date);

    return {
      source: "CPBL OpenData",
      games,
    };
  } catch (err) {
    console.error("CPBL API error:", err);
    return { error: "CPBL fetch failed" };
  }
}
