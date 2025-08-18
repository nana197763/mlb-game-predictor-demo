 
// server/utils/cpbl.js
// 目的：從「CPBL 官網」嘗試抓取指定日期與對戰的「球場 & 先發投手（如有）」。
// 注意：官網可能改版。這份程式會嘗試多個候選頁面與選擇器，失敗時回傳 null。

import * as cheerio from "cheerio";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36";

// 盡量保守：嘗試幾個可能頁面（可能某些是 302/Query 版本）
// 如果你知道官網穩定的排程網址，可以把最準的放第一順位。
function candidateURLs(iso) {
  const [y, m, d] = iso.split("-");
  return [
    // 1) 日期參數版（常見）
    `https://www.cpbl.com.tw/schedule/index?date=${iso}`,
    // 2) 月視圖 + 篩出當日
    `https://www.cpbl.com.tw/schedule/index?year=${y}&month=${m}`,
    // 3) 舊版備援（如有）
    `https://www.cpbl.com.tw/schedule`
  ];
}

// 嘗試從一張「比賽卡」裡面解析有用的字串
function parseGameCardText($card) {
  const text = $card.text().replace(/\s+/g, " ").trim();
  return text;
}

// 嘗試由文字中抓取「球場」與「先發投手」
function extractVenueAndProbables(text) {
  let venue = null;
  // 常見寫法：球場、地點、場地
  const venueMatch = text.match(/(球場|地點|場地)[:：]\s*([^\s，,；;]+)/);
  if (venueMatch) venue = venueMatch[2];

  // 先發投手：可能出現「先發投手：A vs B」或列為兩行
  let pitcherA = null, pitcherB = null;

  // 形式一：先發投手：王小明 vs 李大中
  const p1 = text.match(/先發投手[:：]\s*([^\s，,；;]+)\s*(?:vs|VS|對|對上)\s*([^\s，,；;]+)/);
  if (p1) {
    pitcherA = p1[1];
    pitcherB = p1[2];
  }

  // 形式二：主隊先發：XXX、客隊先發：YYY
  if (!pitcherA || !pitcherB) {
    const homeP = text.match(/(主隊|主場).{0,6}先發[:：]\s*([^\s，,；;]+)/);
    const awayP = text.match(/(客隊|客場).{0,6}先發[:：]\s*([^\s，,；;]+)/);
    if (homeP) pitcherA = pitcherA || homeP[2];
    if (awayP) pitcherB = pitcherB || awayP[2];
  }

  return { venue, pitcherA, pitcherB };
}

function nameLike(s, target) {
  const a = String(s || "").toLowerCase();
  const b = String(target || "").toLowerCase();
  return a.includes(b) || b.includes(a) || a === b;
}

/**
 * 嘗試從 CPBL 官網找到指定日期 teamA vs teamB 的卡片，回傳 venue / probables
 * @returns {Promise<{ venue: string|null, pitcherA: string|null, pitcherB: string|null }|null>}
 */
export async function scrapeCPBLSchedule({ dateISO, teamA, teamB }) {
  const urls = candidateURLs(dateISO);

  for (const url of urls) {
    try {
      const r = await fetch(url, {
        headers: { "user-agent": UA, accept: "text/html" },
      });
      if (!r.ok) continue;
      const html = await r.text();
      const $ = cheerio.load(html);

      // 嘗試找出一張「包含 A 和 B 隊名的卡片」
      // 這裡用寬鬆點的規則：尋找包含兩隊名字的塊元素（div, li, article）
      const blocks = $("div,li,article,section").toArray();
      for (const el of blocks) {
        const $el = $(el);
        const text = $el.text().replace(/\s+/g, " ").trim();
        if (!text) continue;

        // 先確認是否包含日期（避免抓到其它日期資料）
        if (!text.includes(dateISO)) {
          // 某些月視圖可能沒有完整日期字串，就不強制
        }

        // 同時包含 teamA 與 teamB 字樣（用含糊比對）
        if (nameLike(text, teamA) && nameLike(text, teamB)) {
          const cardText = parseGameCardText($el);
          const { venue, pitcherA, pitcherB } = extractVenueAndProbables(cardText);
          return { venue: venue || null, pitcherA: pitcherA || null, pitcherB: pitcherB || null };
        }
      }
    } catch (e) {
      // 某個 URL 失敗就試下一個
      continue;
    }
  }

  return null;
}
