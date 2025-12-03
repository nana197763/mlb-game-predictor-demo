import * as cheerio from "cheerio";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0 Safari/537.36";

const TEAM_MAP = {
  "富邦悍將": ["富邦", "悍將"],
  "統一獅": ["統一", "獅"],
  "樂天桃猿": ["樂天", "桃猿"],
  "味全龍": ["味全", "龍"],
  "中信兄弟": ["中信", "兄弟"],
  "台鋼雄鷹": ["台鋼", "雄鷹"],
};

function matchTeam(text, target) {
  const lower = text.toLowerCase();
  if (lower.includes(target.toLowerCase())) return true;
  for (const a of TEAM_MAP[target] || []) {
    if (lower.includes(a.toLowerCase())) return true;
  }
  return false;
}

/* 抓 CPBL 賽程（中職官網 HTML） */
async function fetchCPBLSchedule(dateISO) {
  const url = `https://www.cpbl.com.tw/schedule/index?date=${dateISO}`;
  const r = await fetch(url, { headers: { "user-agent": UA } });
  const html = await r.text();
  return cheerio.load(html);
}

/* 提取場地與先發（如果有） */
function parseSchedule($, teamA, teamB) {
  const rows = $("tr").toArray();
  for (const row of rows) {
    const text = $(row).text().replace(/\s+/g, " ").trim();

    if (!matchTeam(text, teamA) || !matchTeam(text, teamB)) continue;

    // 場地
    const venue = text.match(/(台中|新莊|桃園|天母|台南|花蓮|澄清湖|嘉義|羅東|斗六)/)?.[1] || null;

    // 先發
    const pitcherA =
      text.match(new RegExp(`${teamA}[^先]*先發[:：]([^\\s]+)`))?.[1] || null;
    const pitcherB =
      text.match(new RegExp(`${teamB}[^先]*先發[:：]([^\\s]+)`))?.[1] || null;

    return { venue, pitcherA, pitcherB };
  }

  return null;
}

/* 假的整季 & 近期戰績（這裡你之後要串 API） */
function dummyStats() {
  return {
    wins: Math.floor(Math.random() * 40 + 20),
    losses: Math.floor(Math.random() * 40 + 20),
    games: 60,
  };
}

export async function buildCPBLStats({ teamA, teamB, date }) {
  const dateISO = date.replace(/\//g, "-");

  const $ = await fetchCPBLSchedule(dateISO);
  const parsed = parseSchedule($, teamA, teamB);

  return {
    seasonStats: {
      [teamA]: dummyStats(),
      [teamB]: dummyStats(),
    },
    recentStats: {
      [teamA]: { w: 6, l: 4, games: 10 },
      [teamB]: { w: 4, l: 6, games: 10 },
    },
    h2hStats: { count: 3, aWins: 2, bWins: 1 },
    pitchersByTeam: {
      [teamA]: parsed?.pitcherA || "未公布",
      [teamB]: parsed?.pitcherB || "未公布",
    },
    location: parsed?.venue || "未知球場",
    text: `CPBL 比賽資料：${teamA} vs ${teamB}`,
  };
}
