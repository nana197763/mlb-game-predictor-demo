import React, { useEffect, useMemo, useState } from "react";

/* ───────────────────────────────
   CPBL 中文隊名
─────────────────────────────── */
const CPBL_TEAMS = ["富邦悍將", "統一獅", "中信兄弟", "樂天桃猿", "味全龍", "台鋼雄鷹"];

/* ───────────────────────────────
   NBA 英中對照 + 隊伍列表
─────────────────────────────── */
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
  "Washington Wizards": "華盛頓巫師",
};

const NBA_TEAMS = Object.keys(NBA_ZH);

/* ───────────────────────────────
   MLB 英中對照
─────────────────────────────── */
const MLB_ZH = {
  "Arizona Diamondbacks": "亞利桑那響尾蛇",
  "Atlanta Braves": "亞特蘭大勇士",
  "Baltimore Orioles": "巴爾的摩金鶯",
  "Boston Red Sox": "波士頓紅襪",
  "Chicago Cubs": "芝加哥小熊",
  "Chicago White Sox": "芝加哥白襪",
  "Cincinnati Reds": "辛辛那提紅人",
  "Cleveland Guardians": "克里夫蘭守護者",
  "Colorado Rockies": "科羅拉多落磯山",
  "Detroit Tigers": "底特律老虎",
  "Houston Astros": "休士頓太空人",
  "Kansas City Royals": "堪薩斯皇家",
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
  "Washington Nationals": "華盛頓國民",
};

/* ───────────────────────────────
   隊徽：本地備用 or API 提供（通常來自 stats）
─────────────────────────────── */
const TEAM_LOGOS = {
  // MLB + NBA + CPBL 若 API 也會補，就會自動覆蓋
  "Los Angeles Lakers": "https://a.espncdn.com/i/teamlogos/nba/500/lal.png",
  "Golden State Warriors": "https://a.espncdn.com/i/teamlogos/nba/500/gs.png",
  "Los Angeles Dodgers": "https://a.espncdn.com/i/teamlogos/mlb/500/lad.png",
  "New York Yankees": "https://a.espncdn.com/i/teamlogos/mlb/500/nyy.png",
};

/* ───────────────────────────────
   隊伍下拉 component
─────────────────────────────── */
function TeamSelect({ league, label, value, onChange, mlbTeams }) {
  let options = [];

  if (league === "MLB") {
    options = mlbTeams.map((t) => ({
      id: t.id,
      name: t.name,
      label: `${t.name}（${MLB_ZH[t.name] ?? t.name}）`,
    }));
  } else if (league === "CPBL") {
    options = CPBL_TEAMS.map((n) => ({ id: n, name: n, label: n }));
  } else if (league === "NBA") {
    options = NBA_TEAMS.map((n) => ({
      id: n,
      name: n,
      label: `${n}（${NBA_ZH[n]}）`,
    }));
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium">{label}</label>
      <select
        className="border rounded-xl px-3 py-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">選擇隊伍…</option>
        {options.map((t) => (
          <option key={t.id} value={t.name}>
            {t.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ───────────────────────────────
   主畫面
─────────────────────────────── */
export default function App() {
  const [league, setLeague] = useState("MLB");
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [date, setDate] = useState("");
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const [mlbTeams, setMlbTeams] = useState([]);

  /* 日期限制 */
  const dateLimits = useMemo(() => {
    const now = new Date();
    return {
      min: `${now.getFullYear() - 1}-01-01`,
      max: `${now.getFullYear() + 1}-12-31`,
    };
  }, []);

  /* MLB 隊伍載入 */
  useEffect(() => {
    if (league !== "MLB") return;

    (async () => {
      try {
        const resp = await fetch(
          "https://statsapi.mlb.com/api/v1/teams?sportId=1"
        );
        const data = await resp.json();
        const teams = data.teams
          .filter((t) => t.active)
          .map((t) => ({
            id: t.id,
            name: t.name,
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setMlbTeams(teams);
      } catch {
        setMlbTeams([]);
      }
    })();
  }, [league]);

  /* 預測 */
  async function handlePredict() {
    setErr("");
    setResult(null);

    if (!teamA || !teamB || !date) {
      setErr("請完成所有欄位");
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
        body: JSON.stringify({ league, teamA, teamB, date }),
      });
      const data = await res.json();

      if (!res.ok) {
        setErr(data.message || "預測失敗");
        setLoading(false);
        return;
      }

      setResult(data);
    } catch {
      setErr("連線失敗");
    } finally {
      setLoading(false);
    }
  }

  /* 取得隊徽 */
  function getLogo(team) {
    return result?.logos?.[team] || TEAM_LOGOS[team] || "";
  }

  return (
    <div className="min-h-screen p-6 bg-gray-100 flex justify-center">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-lg p-6">
        <h1 className="text-2xl font-bold mb-2">
          MLB / CPBL / NBA AI 比賽預測
        </h1>
        <p className="text-sm text-gray-500 mb-4">
          依據真實賽程、先發、近況、對戰、球場、自動預測比分＋大小分
        </p>

        {/* 表單 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="text-sm font-medium">聯盟</label>
            <select
              className="w-full border rounded-xl px-3 py-2"
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
            label="隊伍 A"
            value={teamA}
            mlbTeams={mlbTeams}
            onChange={setTeamA}
          />

          <TeamSelect
            league={league}
            label="隊伍 B"
            value={teamB}
            mlbTeams={mlbTeams}
            onChange={setTeamB}
          />

          <div>
            <label className="text-sm font-medium">日期</label>
            <input
              type="date"
              className="w-full border rounded-xl px-3 py-2"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min={dateLimits.min}
              max={dateLimits.max}
            />
          </div>
        </div>

        <button
          onClick={handlePredict}
          disabled={loading}
          className="w-full py-3 bg-black text-white rounded-xl text-lg"
        >
          {loading ? "預測中…" : "開始預測"}
        </button>

        {err && <p className="text-red-500 mt-3">{err}</p>}

        {/* 預測結果 */}
        {result && (
          <div className="mt-8 space-y-4">

            {/* 比分 UI */}
            <div className="text-center bg-gray-50 p-4 rounded-xl shadow">
              <p className="text-sm text-gray-500 mb-2">預測比分</p>
              <p className="text-4xl font-bold">
                {result.predictedScore[teamA]} :{" "}
                {result.predictedScore[teamB]}
              </p>
              <p className="text-sm text-gray-600 mt-1">
                {result.predictedScore.overUnder}
              </p>
            </div>

            {/* 勝率 */}
            <div className="grid grid-cols-2 gap-4">
              {[teamA, teamB].map((team) => (
                <div
                  key={team}
                  className="p-4 border rounded-xl shadow text-center"
                >
                  {getLogo(team) && (
                    <img
                      src={getLogo(team)}
                      alt=""
                      className="h-14 mx-auto mb-2"
                    />
                  )}
                  <p className="text-lg font-semibold">{team}</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {result.winRate[team]}%
                  </p>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full"
                      style={{ width: `${result.winRate[team]}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>

            {/* 中文 Summary */}
            <div className="p-4 border rounded-xl shadow bg-white">
              <p className="text-sm text-gray-500 mb-1">中文說明</p>
              <pre className="whitespace-pre-wrap text-sm">
                {result.summaryZh}
              </pre>
            </div>

            {/* 英文 Summary */}
            <div className="p-4 border rounded-xl shadow bg-white">
              <p className="text-sm text-gray-500 mb-1">English Summary</p>
              <pre className="whitespace-pre-wrap text-sm">
                {result.summaryEn}
              </pre>
            </div>

            {/* 傷兵列表 */}
            {result.injuries && (
              <div className="p-4 border rounded-xl shadow bg-white">
                <p className="text-sm text-gray-500 mb-2">傷兵列表</p>

                {Object.keys(result.injuries).map((team) => (
                  <div key={team} className="mb-3">
                    <p className="font-semibold">{team}</p>
                    <ul className="list-disc ml-5 text-sm text-gray-700">
                      {result.injuries[team].map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
