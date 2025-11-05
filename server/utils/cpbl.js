// server/utils/cpbl.js
import * as cheerio from "cheerio";

/* ───── 基本設定 ───── */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0 Safari/537.36";

const TEAM_ALIASES = new Map([
  ["富邦悍將", ["富邦", "Fubon", "Guardians", "悍將"]],
  ["統一獅", ["統一", "Uni-Lions", "Uni Lions", "統一7-ELEVEn獅", "統一7-ELEVEn", "獅"]],
  ["中信兄弟", ["兄弟", "Brothers", "中信"]],
  ["樂天桃猿", ["樂天", "Rakuten", "Monkeys", "桃猿"]],
  ["味全龍", ["味全", "Dragons", "龍"]],
  ["台鋼雄鷹", ["台鋼", "TSG", "Hawks", "雄鷹"]],
]);

const STADIUM_HINTS = [
  "天母", "新莊", "桃園", "台南", "洲際", "澄清湖", "嘉義市", "斗六",
  "花蓮", "台東", "羅東", "台中", "台北", "屏東"
];

const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, "").trim();
function nameLike(text, canonical) {
  const t = norm(text);
  const c = norm(canonical);
  if (t.includes(c)) return true;
  const alias = TEAM_ALIASES.get(canonical) || [];
  return alias.some((a) => t.includes(norm(a)));
}
function candidateURLs(iso) {
  const [y, m] = iso.split("-");
  return [
    `https://www.cpbl.com.tw/schedule/index?date=${iso}`,
    `https://www.cpbl.com.tw/schedule/index?year=${y}&month=${m}`,
    `https://www.cpbl.com.tw/schedule`
  ];
}
function blockText($, el) {
  return $(el).text().replace(/\s+/g, " ").replace(/\u00a0/g, " ").trim();
}

function extractVenueAndPitchers(text, teamA, teamB) {
  let venue = null;
  for (const hint of STADIUM_HINTS) {
    if (text.includes(hint)) {
      venue = hint;
      break;
    }
  }

  const pitcherByTeam = {};

  const reParen = /先發[（(]([^）)]+)[)）]\s*[:：]\s*([^\s，,；;]+)/g;
  let m;
  while ((m = reParen.exec(text))) {
    const team = m[1].trim();
    const name = m[2].trim();
    pitcherByTeam[team] = name;
  }

  if (!pitcherByTeam[teamA] && !pitcherByTeam[teamB]) {
    const vs = /先發投手[:：]\s*([^\s，,；;]+)\s*(?:vs|VS|對|對上)\s*([^\s，,；;]+)/.exec(text);
    if (vs) {
      pitcherByTeam[teamA] = vs[1].trim();
      pitcherByTeam[teamB] = vs[2].trim();
    }
  }

  for (const canonical of TEAM_ALIASES.keys()) {
    for (const k of Object.keys(pitcherByTeam)) {
      if (nameLike(k, canonical) && canonical !== k) {
        pitcherByTeam[canonical] = pitcherByTeam[k];
      }
    }
  }

  const aName = pitcherByTeam[teamA] || null;
  const bName = pitcherByTeam[teamB] || null;

  return { venue, pitcherA: aName, pitcherB: bName };
}

export async function scrapeCPBLSchedule({ dateISO, teamA, teamB }) {
  const tried = [];
  const urls = candidateURLs(dateISO);

  for (const url of urls) {
    tried.push(url);
    try {
      const r = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" } });
      if (!r.ok) continue;
      const html = await r.text();
      const $ = cheerio.load(html);
      const rows = $("tr, .schedule-item, .GameBox, .game-item, li, article, section, div").toArray();

      for (const row of rows) {
        const txt = blockText($, row);
        if (!txt) continue;

        if (txt.includes(dateISO) || urls.indexOf(url) === 0) {
          if (nameLike(txt, teamA) && nameLike(txt, teamB)) {
            const info = extractVenueAndPitchers(txt, teamA, teamB);
            return { ...info, urlsTried: tried };
          }
        }
      }
    } catch (_) {
      continue;
    }
  }

  return null;
}

/* ───── CPBL 勝率模擬邏輯 ───── */
export async function buildCPBLStats({ teamA, teamB, date }) {
  const dateISO = date.replace(/\//g, "-");
  const schedule = await scrapeCPBLSchedule({ dateISO, teamA, teamB });

  const seasonStats = {
    [teamA]: { wins: 35, losses: 25, games: 60 },
    [teamB]: { wins: 30, losses: 30, games: 60 },
  };

  const recentStats = {
    [teamA]: { w: 6, l: 4, games: 10 },
    [teamB]: { w: 4, l: 6, games: 10 },
  };

  const h2hStats = {
    count: 5,
    aWins: 3,
    bWins: 2,
  };

  const pitchersByTeam = {
    [teamA]: schedule?.pitcherA || "未定",
    [teamB]: schedule?.pitcherB || "未定",
  };

  return {
    seasonStats,
    recentStats,
    h2hStats,
    pitchersByTeam,
    location: schedule?.venue || null,
    text: `CPBL 比賽資料：${teamA} vs ${teamB}，球場 ${schedule?.venue || "未知"}。`,
  };
}
