import React, { useEffect, useMemo, useState } from "react";

/* ──────── 聯盟隊伍設定 ──────── */

// CPBL 中文隊名
const CPBL_TEAMS = ["富邦悍將", "統一獅", "中信兄弟", "樂天桃猿", "味全龍", "台鋼雄鷹"];

// NBA 隊伍清單（英文）
const NBA_TEAMS = [
  "Atlanta Hawks", "Boston Celtics", "Brooklyn Nets", "Charlotte Hornets", "Chicago Bulls",
  "Cleveland Cavaliers", "Dallas Mavericks", "Denver Nuggets", "Detroit Pistons", "Golden State Warriors",
  "Houston Rockets", "Indiana Pacers", "Los Angeles Clippers", "Los Angeles Lakers", "Memphis Grizzlies",
  "Miami Heat", "Milwaukee Bucks", "Minnesota Timberwolves", "New Orleans Pelicans", "New York Knicks",
  "Oklahoma City Thunder", "Orlando Magic", "Philadelphia 76ers", "Phoenix Suns", "Portland Trail Blazers",
  "Sacramento Kings", "San Antonio Spurs", "Toronto Raptors", "Utah Jazz", "Washington Wizards"
];

// NBA 英中對照
const NBA_ZH = {
  "Atlanta Hawks": "亞特蘭大老鷹",
  "Boston Celtics": "波士頓塞爾提克",
  "Brooklyn Nets": "布魯克林籃網",
  "Charlotte Hornets": "夏洛特黃蜂",
  "Chicago Bulls": "芝加哥公牛",
  "Cleveland Cavaliers": "克里夫蘭騎士",
  "Dallas Mavericks": "達拉斯獨行俠",
  "Denver Nuggets": "丹佛金塊",
  "Detroit Pistons": "底特律活塞",
  "Golden State Warriors": "金州勇士",
  "Houston Rockets": "休士頓火箭",
  "Indiana Pacers": "印第安納溜馬",
  "Los Angeles Clippers": "洛杉磯快艇",
  "Los Angeles Lakers": "洛杉磯湖人",
  "Memphis Grizzlies": "曼菲斯灰熊",
  "Miami Heat": "邁阿密熱火",
  "Milwaukee Bucks": "密爾瓦基公鹿",
  "Minnesota Timberwolves": "明尼蘇達灰狼",
  "New Orleans Pelicans": "紐奧良鵜鶘",
  "New York Knicks": "紐約尼克",
  "Oklahoma City Thunder": "奧克拉荷馬雷霆",
  "Orlando Magic": "奧蘭多魔術",
  "Philadelphia 76ers": "費城 76 人",
  "Phoenix Suns": "鳳凰城太陽",
  "Portland Trail Blazers": "波特蘭拓荒者",
  "Sacramento Kings": "沙加緬度國王",
  "San Antonio Spurs": "聖安東尼奧馬刺",
  "Toronto Raptors": "多倫多暴龍",
  "Utah Jazz": "猶他爵士",
  "Washington Wizards": "華盛頓巫師"
};

// MLB 英中對照
const MLB_ZH = {
  "Arizona Diamondbacks": "亞歷桑那響尾蛇",
  "Atlanta Braves": "亞特蘭大勇士",
  "Baltimore Orioles": "巴爾的摩金鶯",
  "Boston Red Sox": "波士頓紅襪",
  "Chicago Cubs": "芝加哥小熊",
  "Chicago White Sox": "芝加哥白襪",
  "Cincinnati Reds": "辛辛那提紅人",
  "Cleveland Guardians": "克里夫蘭守護者",
  "Colorado Rockies": "科羅拉多落磯",
  "Detroit Tigers": "底特律老虎",
  "Houston Astros": "休士頓太空人",
  "Kansas City Royals": "堪薩斯市皇家",
  "Los Angeles Angels": "洛杉磯天使",
  "Los Angeles Dodgers": "洛杉磯道奇",
  "Miami Marlins": "邁阿密馬林魚",
  "Milwaukee Brewers": "密爾瓦基釀酒人",
  "Minnesota Twins": "明尼蘇達雙城",
  "New York Mets": "紐約大都會",
  "New York Yankees": "紐約洋基",
  "Oakland Athletics": "奧克蘭運動家",
  "Philadelphia Phillies": "費城費城人",
  "Pittsburgh Pirates": "匹茲堡海盜",
  "San Diego Padres": "聖地牙哥教士",
  "San Francisco Giants": "舊金山巨人",
  "Seattle Mariners": "西雅圖水手",
  "St. Louis Cardinals": "聖路易紅雀",
  "Tampa Bay Rays": "坦帕灣光芒",
  "Texas Rangers": "德州遊騎兵",
  "Toronto Blue Jays": "多倫多藍鳥",
  "Washington Nationals": "華盛頓國民"
};

/* ──────── 隊徽 URL 產生（簡單版，沒對到就用文字頭像） ──────── */
function getTeamLogoUrl(league, teamName) {
  // fallback：用 ui-avatars 當假隊徽，不會壞圖
  const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(
    teamName
  )}&background=111827&color=ffffff&bold=true`;

  // NBA：用 ESPN 三碼代號
  if (league === "NBA") {
    const codeMap = {
      "Atlanta Hawks": "atl",
      "Boston Celtics": "bos",
      "Brooklyn Nets": "bkn",
      "Charlotte Hornets": "cha",
      "Chicago Bulls": "chi",
      "Cleveland Cavaliers": "cle",
      "Dallas Mavericks": "dal",
      "Denver Nuggets": "den",
      "Detroit Pistons": "det",
      "Golden State Warriors": "gsw",
      "Houston Rockets": "hou",
      "Indiana Pacers": "ind",
      "Los Angeles Clippers": "lac",
      "Los Angeles Lakers": "lal",
      "Memphis Grizzlies": "mem",
      "Miami Heat": "mia",
      "Milwaukee Bucks": "mil",
      "Minnesota Timberwolves": "min",
      "New Orleans Pelicans": "no",
      "New York Knicks": "ny",
      "Oklahoma City Thunder": "okc",
      "Orlando Magic": "orl",
      "Philadelphia 76ers": "phi",
      "Phoenix Suns": "phx",
      "Portland Trail Blazers": "por",
      "Sacramento Kings": "sac",
      "San Antonio Spurs": "sa",
      "Toronto Raptors": "tor",
      "Utah Jazz": "utah",
      "Washington Wizards": "wsh"
    };
    const code = codeMap[teamName];
    if (!code) return fallback;
    return `https://a.espncdn.com/i/teamlogos/nba/500/${code}.png`;
  }

  // MLB：一樣用 ESPN 三碼代號（簡單版）
  if (league === "MLB") {
    const codeMap = {
      "Arizona Diamondbacks": "ari",
      "Atlanta Braves": "atl",
      "Baltimore Orioles": "bal",
      "Boston Red Sox": "bos",
      "Chicago Cubs": "chc",
      "Chicago White Sox": "cws",
      "Cincinnati Reds": "cin",
      "Cleveland Guardians": "cle",
      "Colorado Rockies": "col",
      "Detroit Tigers": "det",
      "Houston Astros": "hou",
      "Kansas City Royals": "kc",
      "Los Angeles Angels": "laa",
      "Los Angeles Dodgers": "la",
      "Miami Marlins": "mia",
      "Milwaukee Brewers": "mil",
      "Minnesota Twins": "min",
      "New York Mets": "nym",
      "New York Yankees": "nyy",
      "Oakland Athletics": "oak",
      "Philadelphia Phillies": "phi",
      "Pittsburgh Pirates": "pit",
      "San Diego Padres": "sd",
      "San Francisco Giants": "sf",
      "Seattle Mariners": "sea",
      "St. Louis Cardinals": "stl",
      "Tampa Bay Rays": "tb",
      "Texas Rangers": "tex",
      "Toronto Blue Jays": "tor",
      "Washington Nationals": "wsh"
    };
    const code = codeMap[teamName];
    if (!code) return fallback;
    return `https://a.espncdn.com/i/teamlogos/mlb/500/${code}.png`;
  }

  // CPBL：你之後可以自己改成官方 LOGO CDN
  if (league === "CPBL") {
    const cpblMap = {
      "富邦悍將": "https://ui-avatars.com/api/?name=富邦&background=1d4ed8&color=ffffff",
      "統一獅": "https://ui-avatars.com/api/?name=統一&background=ea580c&color=ffffff",
      "中信兄弟": "https://ui-avatars.com/api/?name=兄弟&background=facc15&color=000000",
      "樂天桃猿": "https://ui-avatars.com/api/?name=樂天&background=be123c&color=ffffff",
      "味全龍": "https://ui-avatars.com/api/?name=味全&background=dc2626&color=ffffff",
      "台鋼雄鷹": "https://ui-avatars.com/api/?name=台鋼&background=047857&color=ffffff"
    };
    return cpblMap[teamName] || fallback;
  }

  return fallback;
}

/* ──────── 顯示用隊名（都換成中文） ──────── */
function getDisplayName(league, englishNameOrChinese) {
  if (league === "MLB") {
    return MLB_ZH[englishNameOrChinese] || englishNameOrChinese;
  }
  if (league === "NBA") {
    return NBA_ZH[englishNameOrChinese] || englishNameOrChinese;
  }
  // CPBL 本來就中文
  return englishNameOrChinese;
}

/* ──────── 隊伍下拉選單元件 ──────── */
function TeamSelect({ league, label, value, onChange, mlbTeams, disabled }) {
  let options = [];

  if (league === "MLB") {
    options = mlbTeams;
  } else if (league === "CPBL") {
    options = CPBL_TEAMS.map((n) => ({ id: n, name: n, label: n }));
  } else if (league === "NBA") {
    options = NBA_TEAMS.map((n) => ({
      id: n,
      name: n,
      label: `${n}（${NBA_ZH[n] || "未知"}）`
    }));
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm text-gray-700 font-medium">{label}</label>
      <select
        className="border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black/20"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || !options.length}
      >
        <option value="">
          {league === "MLB"
            ? "Select MLB team…"
            : league === "NBA"
            ? "Select NBA team…"
            : "選擇中職球隊…"}
        </option>
        {options.map((t) => (
          <option key={t.id} value={t.name}>
            {t.label || t.name}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ──────── 主畫面 ──────── */
export default function App() {
  const [league, setLeague] = useState("MLB");
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [date, setDate] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [mlbTeams, setMlbTeams] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(false);

  const dateLimits = useMemo(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    return { min: `${yyyy - 1}-01-01`, max: `${yyyy + 1}-12-31` };
  }, []);

  // 聯盟切換時重置選項
  useEffect(() => {
    setTeamA("");
    setTeamB("");
    setResult(null);
    setErr("");

    if (league === "MLB") {
      (async () => {
        try {
          setLoadingTeams(true);
          const resp = await fetch("https://statsapi.mlb.com/api/v1/teams?sportId=1");
          const data = await resp.json();
          const teams = (data?.teams || [])
            .filter((t) => t.active)
            .map((t) => {
              const zh = MLB_ZH[t.name] || t.name;
              return { id: t.id, name: t.name, label: `${t.name}（${zh}）` };
            })
            .sort((a, b) => a.name.localeCompare(b.name));
          setMlbTeams(teams);
        } catch {
          setMlbTeams([]);
        } finally {
          setLoadingTeams(false);
        }
      })();
    } else {
      // 切到 CPBL / NBA 就清掉 MLB teams
      setMlbTeams([]);
    }
  }, [league]);

  /* ──────── 點擊預測 ──────── */
  const handlePredict = async () => {
    setErr("");
    setResult(null);

    if (!league || !teamA || !teamB || !date) {
      setErr("請完整輸入：聯盟 / 隊伍 A / 隊伍 B / 日期");
      return;
    }
    if (teamA === teamB) {
      setErr("兩隊不可相同");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ league, teamA, teamB, date })
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data?.message || "預測失敗（可能是日期/對戰不正確或沒有比賽）");
        return;
      }
      setResult(data);
    } catch {
      setErr("連線失敗，請稍後再試");
    } finally {
      setLoading(false);
    }
  };

  /* ────────────── UI ────────────── */
  const hasResult = !!result;
  const predictedScore = result?.predictedScore || null;

  // 顯示用隊名（中文）
  const displayTeamA = hasResult ? getDisplayName(result.league, result.teamA) : "";
  const displayTeamB = hasResult ? getDisplayName(result.league, result.teamB) : "";

  // 隊徽
  const logoA = hasResult ? getTeamLogoUrl(result.league, result.teamA) : "";
  const logoB = hasResult ? getTeamLogoUrl(result.league, result.teamB) : "";

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-100">
      <div className="w-full max-w-2xl bg-white shadow-xl rounded-2xl p-6">
        <h1 className="text-2xl font-bold mb-1">MLB / CPBL / NBA AI 比賽預測</h1>
        <p className="text-sm text-gray-500 mb-5">
          Prediction（含戰績・近況・對戰・球員狀態・球場自動判定，僅供娛樂）
        </p>

        {/* 表單區 */}
        <div className="bg-white rounded-2xl border shadow-sm p-5 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 聯盟選擇 */}
            <div className="flex flex-col gap-1">
              <label className="text-sm text-gray-700 font-medium">聯盟 / League</label>
              <select
                className="border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black/20"
                value={league}
                onChange={(e) => setLeague(e.target.value)}
              >
                <option value="MLB">美國職棒 MLB</option>
                <option value="CPBL">中華職棒 CPBL</option>
                <option value="NBA">美國職籃 NBA</option>
              </select>
            </div>

            <TeamSelect
              league={league}
              label="隊伍 A / Team A"
              value={teamA}
              onChange={setTeamA}
              mlbTeams={mlbTeams}
              disabled={league === "MLB" && loadingTeams}
            />
            <TeamSelect
              league={league}
              label="隊伍 B / Team B"
              value={teamB}
              onChange={setTeamB}
              mlbTeams={mlbTeams}
              disabled={league === "MLB" && loadingTeams}
            />

            {/* 日期 */}
            <div className="flex flex-col gap-1">
              <label className="text-sm text-gray-700 font-medium">日期 / Date</label>
              <input
                type="date"
                className="border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black/20"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={dateLimits.min}
                max={dateLimits.max}
              />
            </div>

            {/* 球場顯示 */}
            <div className="flex flex-col gap-1">
              <label className="text-sm text-gray-700 font-medium">球場 / Stadium</label>
              <input
                className="border rounded-xl px-3 py-2 bg-gray-100 text-gray-600"
                value={result?.location || "系統自動判定（依官方賽程）"}
                readOnly
              />
            </div>
          </div>

          <button
            className="mt-4 w-full bg-black text-white rounded-xl py-2 disabled:opacity-60"
            onClick={handlePredict}
            disabled={loading || (league === "MLB" && loadingTeams)}
          >
            {loading ? "預測中…" : "開始預測 / Predict"}
          </button>

          {err && <p className="mt-3 text-red-600 text-sm whitespace-pre-line">{err}</p>}
        </div>

        {/* 預測結果 */}
        {hasResult && (
          <div className="space-y-4">
            {/* 大比分卡：左右大隊徽 + 中間比分 */}
            {predictedScore && typeof predictedScore[result.teamA] === "number" && (
              <div className="bg-white rounded-2xl shadow border p-5">
                <p className="text-sm text-gray-500 mb-2 text-center">
                  Predicted Score / 預測比分
                </p>
                <div className="flex items-center justify-between gap-4">
                  {/* 左邊隊徽 + 名稱 */}
                  <div className="flex flex-col items-center flex-1">
                    <img
                      src={logoA}
                      alt={displayTeamA}
                      className="w-16 h-16 rounded-full object-contain border border-gray-200 mb-2 bg-white"
                    />
                    <p className="text-sm text-gray-500">Team A</p>
                    <p className="text-base font-medium">{displayTeamA}</p>
                  </div>

                  {/* 中間比分 */}
                  <div className="flex flex-col items-center px-4">
                    <p className="text-xs tracking-widest text-gray-400 uppercase">
                      Final Prediction
                    </p>
                    <p className="text-4xl font-extrabold mt-1">
                      {predictedScore[result.teamA]} : {predictedScore[result.teamB]}
                    </p>
                    <p className="mt-2 text-xs text-gray-500">
                      Total: {predictedScore.total} ｜ Line: {predictedScore.line}
                    </p>
                    {predictedScore.overUnder && (
                      <p className="text-xs text-emerald-700 mt-1">
                        {predictedScore.overUnder}
                      </p>
                    )}
                  </div>

                  {/* 右邊隊徽 + 名稱 */}
                  <div className="flex flex-col items-center flex-1">
                    <img
                      src={logoB}
                      alt={displayTeamB}
                      className="w-16 h-16 rounded-full object-contain border border-gray-200 mb-2 bg-white"
                    />
                    <p className="text-sm text-gray-500">Team B</p>
                    <p className="text-base font-medium">{displayTeamB}</p>
                  </div>
                </div>
              </div>
            )}

            {/* 勝率卡：上小隊徽 + 中文名字 + 勝率 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl shadow border p-5 text-center">
                <img
                  src={logoA}
                  alt={displayTeamA}
                  className="w-10 h-10 rounded-full object-contain border border-gray-200 mx-auto mb-2 bg-white"
                />
                <p className="text-xs text-gray-500 uppercase">Team A</p>
                <p className="text-base font-medium">{displayTeamA}</p>
                <p className="text-3xl font-bold mt-1">
                  {result.winRate?.teamA}%
                </p>
              </div>

              <div className="bg-white rounded-xl shadow border p-5 text-center">
                <img
                  src={logoB}
                  alt={displayTeamB}
                  className="w-10 h-10 rounded-full object-contain border border-gray-200 mx-auto mb-2 bg-white"
                />
                <p className="text-xs text-gray-500 uppercase">Team B</p>
                <p className="text-base font-medium">{displayTeamB}</p>
                <p className="text-3xl font-bold mt-1">
                  {result.winRate?.teamB}%
                </p>
              </div>
            </div>

            {/* 中文說明 */}
            <div className="bg-white rounded-xl shadow border p-5">
              <p className="text-sm text-gray-500">中文重點 / Chinese Summary</p>
              <p className="mt-1 leading-relaxed whitespace-pre-line">
                {result.summaryZh}
              </p>
            </div>

            {/* 英文說明（裡面也會帶中文隊名，後端已處理） */}
            <div className="bg-white rounded-xl shadow border p-5">
              <p className="text-sm text-gray-500">English Summary</p>
              <p className="mt-1 leading-relaxed whitespace-pre-line">
                {result.summaryEn}
              </p>
            </div>

            <p className="text-xs text-gray-400">
              ※ 資料來源：官方戰績 / 賽程；球場、先發、近況、對戰紀錄由系統自動判定。  
              僅供娛樂，請勿作為實際投注依據。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
