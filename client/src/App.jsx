import React, { useEffect, useMemo, useState } from "react";

/* ──────── 聯盟隊伍設定 ──────── */

// CPBL 中文隊名
const CPBL_TEAMS = ["富邦悍將", "統一獅", "中信兄弟", "樂天桃猿", "味全龍", "台鋼雄鷹"];

// NBA 隊伍清單
const NBA_TEAMS = [
  "Atlanta Hawks", "Boston Celtics", "Brooklyn Nets", "Charlotte Hornets", "Chicago Bulls",
  "Cleveland Cavaliers", "Dallas Mavericks", "Denver Nuggets", "Detroit Pistons", "Golden State Warriors",
  "Houston Rockets", "Indiana Pacers", "Los Angeles Clippers", "Los Angeles Lakers", "Memphis Grizzlies",
  "Miami Heat", "Milwaukee Bucks", "Minnesota Timberwolves", "New Orleans Pelicans", "New York Knicks",
  "Oklahoma City Thunder", "Orlando Magic", "Philadelphia 76ers", "Phoenix Suns", "Portland Trail Blazers",
  "Sacramento Kings", "San Antonio Spurs", "Toronto Raptors", "Utah Jazz", "Washington Wizards"
];

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

/* ──────── 隊伍下拉選單元件 ──────── */
function TeamSelect({ league, label, value, onChange, mlbTeams, disabled }) {
  let options = [];
  if (league === "MLB") {
    options = mlbTeams;
  } else if (league === "CPBL") {
    options = CPBL_TEAMS.map((n) => ({ id: n, name: n, label: n }));
  } else if (league === "NBA") {
    options = NBA_TEAMS.map((n) => ({ id: n, name: n, label: n }));
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
      // 切換到 CPBL 或 NBA 時清空 MLB 隊伍
      setMlbTeams([]);
    }
  }, [league]);

  // 預測按鈕
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

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-100">
      <div className="w-full max-w-2xl bg-white shadow-xl rounded-2xl p-6">
        <h1 className="text-2xl font-bold mb-1">MLB / CPBL / NBA AI 比賽預測</h1>
        <p className="text-sm text-gray-500 mb-5">
          Prediction（含季戰績・近況・對戰・球員狀態・球場自動判定）
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

          {err && <p className="mt-3 text-red-600 text-sm">{err}</p>}
        </div>

        {/* 預測結果 */}
        {result && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow border p-5">
              <p className="text-sm text-gray-500">Prediction / 預測結果</p>
              <p className="text-2xl font-semibold mt-1">{result.prediction}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl shadow border p-5">
                <p className="text-xs uppercase tracking-wide text-gray-500">Team A</p>
                <p className="text-lg font-medium">{result.teamA}</p>
                <p className="text-3xl font-bold mt-1">{result.winRate?.teamA}%</p>
              </div>
              <div className="bg-white rounded-xl shadow border p-5">
                <p className="text-xs uppercase tracking-wide text-gray-500">Team B</p>
                <p className="text-lg font-medium">{result.teamB}</p>
                <p className="text-3xl font-bold mt-1">{result.winRate?.teamB}%</p>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow border p-5">
              <p className="text-sm text-gray-500">中文重點 / Chinese Summary</p>
              <p className="mt-1 leading-relaxed whitespace-pre-line">{result.summaryZh}</p>
            </div>

            <div className="bg-white rounded-xl shadow border p-5">
              <p className="text-sm text-gray-500">English Summary</p>
              <p className="mt-1 leading-relaxed whitespace-pre-line">{result.summaryEn}</p>
            </div>

            <p className="text-xs text-gray-400">
              ※ 球場/先發/傷兵/球員狀態由系統自動判定；若官方資料無對應賽事，將不產生預測。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
