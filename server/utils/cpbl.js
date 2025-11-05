// server/utils/cpbl.js
// 從 CPBL 官網抓指定日期的賽程，解析球場與先發投手（如頁面提供）
// Node 18+ 內建 fetch；需安裝 cheerio：npm --prefix server i cheerio
import * as cheerio from "cheerio";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0 Safari/537.36";

const TEAM_ALIASES = new Map([
  // 正名 → 一組常見別名（比對時會寬鬆包含）
  ["富邦悍將", ["富邦", "Fubon", "Guardians", "悍將"]],
  ["統一獅", ["統一", "Uni-Lions", "Uni Lions", "統一7-ELEVEn獅", "統一7-ELEVEn", "獅"]],
  ["中信兄弟", ["兄弟", "Brothers", "中信"]],
  ["樂天桃猿", ["樂天", "Rakuten", "Monkeys", "桃猿"]],
  ["味全龍", ["味全", "Dragons", "龍"]],
  ["台鋼雄鷹", ["台鋼", "TSG", "Hawks", "雄鷹"]],
]);

// 常見球場／地點關鍵詞（不完整，逐步擴充即可）
const STADIUM_HINTS = [
  "天母", "新莊", "桃園", "台南", "洲際", "澄清湖", "嘉義市", "斗六",
  "花蓮", "台東", "羅東", "台中", "斗六", "台北", "屏東"
];

const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, "").trim();

function nameLike(text, canonical) {
  // 同時檢查正名與別名
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

/**
 * 從一個 <tr> 或 <div> 中抽取卡片文字（單行）
 */
function blockText($, el) {
  return $(el).text().replace(/\s+/g, " ").replace(/\u00a0/g, " ").trim();
}

/**
 * 從文字中嘗試抽出球場（地點/球場欄）與先發投手
 * 先發格式常見：
 *   - 先發(味全龍)：羅戌
 *   - 先發(台鋼雄鷹)：艾邁特
 *   - 先發投手：張三 vs 李四
 */
function extractVenueAndPitchers(text, teamA, teamB) {
  let venue = null;

  // 1) 球場/地點 關鍵詞
  for (const hint of STADIUM_HINTS) {
    if (text.includes(hint)) {
      // 避免抓到非地名的相同詞，保留最短命中即可
      venue = hint;
      break;
    }
  }

  const pitcherByTeam = {};

  // 2a) 形式：先發(味全龍)：羅戌
  //    捕捉所有 "先發(XXX)：YYY"
  const reParen = /先發[（(]([^）)]+)[)）]\s*[:：]\s*([^\s，,；;]+)/g;
  let m;
  while ((m = reParen.exec(text))) {
    const team = m[1].trim();
    const name = m[2].trim();
    pitcherByTeam[team] = name;
  }

  // 2b) 形式：先發投手：A vs B
  if (!pitcherByTeam[teamA] && !pitcherByTeam[teamB]) {
    const vs = /先發投手[:：]\s*([^\s，,；;]+)\s*(?:vs|VS|對|對上)\s*([^\s，,；;]+)/.exec(text);
    if (vs) {
      // 無從判斷哪個先發屬於哪隊，先做 A/B 對應
      pitcherByTeam[teamA] = vs[1].trim();
      pitcherByTeam[teamB] = vs[2].trim();
    }
  }

  // 3) 嘗試把別名對應成正名（只在 2a 找到類似 "先發(統一7-ELEVEn獅)" 時需要）
  for (const canonical of TEAM_ALIASES.keys()) {
    for (const k of Object.keys(pitcherByTeam)) {
      if (nameLike(k, canonical) && canonical !== k) {
        pitcherByTeam[canonical] = pitcherByTeam[k];
      }
    }
  }

  // 回傳依照 teamA / teamB 的對應名稱
  const aName = pitcherByTeam[teamA] || null;
  const bName = pitcherByTeam[teamB] || null;

  return { venue, pitcherA: aName, pitcherB: bName };
}

/**
 * 從 CPBL 官網抓指定日期、指定對戰的資訊
 * @param {{ dateISO: string, teamA: string, teamB: string }} args
 * @returns {Promise<{ venue: string|null, pitcherA: string|null, pitcherB: string|null, urlsTried: string[] }|null>}
 */
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

      // 盡量寬鬆：列舉可能的 row/block
      const rows = $("tr, .schedule-item, .GameBox, .game-item, li, article, section, div").toArray();

      for (const row of rows) {
        const txt = blockText($, row);
        if (!txt) continue;

        // 試著過濾日期（如果頁面是月曆，通常同頁含多日）
        if (txt.includes(dateISO) || urls.indexOf(url) === 0 /* date= 頁通常單日 */) {
          // 要求同一區塊同時包含兩隊名稱（寬鬆比對）
          if (nameLike(txt, teamA) && nameLike(txt, teamB)) {
            const info = extractVenueAndPitchers(txt, teamA, teamB);
            return { ...info, urlsTried: tried };
          }
        }
      }
    } catch (_) {
      // 失敗就換下一個 URL
      continue;
    }
  }

  return null; // 沒找到這場或官網改版
}
