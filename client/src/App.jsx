import React, { useEffect, useMemo, useState } from "react";

const CPBL_TEAMS = ["富邦悍將", "統一獅", "中信兄弟", "樂天桃猿", "味全龍", "台鋼雄鷹"];

function TeamSelect({ league, label, value, onChange, mlbTeams, disabled }) {
  const options = league === "MLB" ? mlbTeams : CPBL_TEAMS.map(n => ({ id: n, name: n }));
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm text-gray-600">{label}</label>
      <select
        className="border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black/20"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || !options.length}
      >
        <option value="">{league === "MLB" ? "Select MLB team…" : "選擇中職球隊…"}</option>
        {options.map((t) => (
          <option key={t.id} value={t.name}>{t.name}</option>
        ))}
      </select>
    </div>
  );
}

export default function App() {
  const [league, setLeague] = useState("MLB");
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // MLB teams
  const [mlbTeams, setMlbTeams] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(false);

  const dateLimits = useMemo(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    return { min: `${yyyy - 1}-01-01`, max: `${yyyy + 1}-12-31` };
  }, []);

  useEffect(() => {
    setTeamA(""); setTeamB(""); setResult(null); setErr("");
    if (league === "MLB" && mlbTeams.length === 0) {
      (async () => {
        try {
          setLoadingTeams(true);
          const resp = await fetch("https://statsapi.mlb.com/api/v1/teams?sportId=1");
          const data = await resp.json();
          const teams = (data?.teams || [])
            .filter((t) => t.active)
            .map((t) => ({ id: t.id, name: `${t.name} / ${t.teamName}` })) // 中英混排（官方多為英文）
            .sort((a, b) => a.name.localeCompare(b.name));
          setMlbTeams(teams);
        } catch (e) {
          console.error("Load MLB teams failed:", e);
          setMlbTeams([]);
        } finally {
          setLoadingTeams(false);
        }
      })();
    }
  }, [league]); // eslint-disable-line

  const handlePredict = async () => {
    setErr(""); setResult(null);
    if (!teamA || !teamB || !date || !location) {
      setErr("請完整輸入：隊伍 A / 隊伍 B / 日期 / 球場  —  Please fill all fields.");
      return;
    }
    if (teamA === teamB) {
      setErr("兩隊不可相同 / Teams must be different.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ league, teamA, teamB, date, location }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data?.message || "預測失敗 / Prediction failed"); return; }
      setResult(data);
    } catch (e) {
      console.error(e);
      setErr("連線失敗 / Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-100">
      <div className="w-full max-w-3xl">
        {/* 表單卡片 */}
        <div className="bg-white shadow-lg rounded-2xl p-6">
          <h1 className="text-2xl font-bold mb-4">MLB / CPBL AI 比賽預測 · Game Predictor</h1>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm text-gray-600">聯盟 / League</label>
              <select
                className="border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black/20"
                value={league} onChange={(e) => setLeague(e.target.value)}
              >
                <option value="MLB">美國職棒 MLB</option>
                <option value="CPBL">中華職棒 CPBL</option>
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

            <div className="flex flex-col gap-1">
              <label className="text-sm text-gray-600">日期 / Date</label>
              <input
                type="date"
                className="border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black/20"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={dateLimits.min} max={dateLimits.max}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm text-gray-600">球場 / Stadium</label>
              <input
                className="border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black/20"
                placeholder={league === "MLB" ? "Yankee Stadium" : "台南棒球場"}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
          </div>

          <button
            className="mt-4 w-full bg-black text-white rounded-xl py-3 text-base font-medium disabled:opacity-60"
            onClick={handlePredict}
            disabled={loading || (league === "MLB" && loadingTeams)}
          >
            {loading ? "預測中… / Predicting…" : "開始預測 / Predict"}
          </button>

          {err && <p className="mt-3 text-red-600 text-sm">{err}</p>}
        </div>

        {/* 結果卡片 */}
        {result && (
          <div className="mt-6 space-y-4">
            <div className="bg-white rounded-2xl shadow border p-6">
              <p className="text-sm text-gray-500">Prediction / 預測比分</p>
              <p className="text-2xl font-semibold mt-1">{result.prediction}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl shadow border p-6">
                <p className="text-xs uppercase tracking-wide text-gray-500">Team A</p>
                <p className="text-lg font-medium">{result.teamA}</p>
                <p className="text-3xl font-bold mt-1">{result.winRate?.teamA}%</p>
              </div>
              <div className="bg-white rounded-2xl shadow border p-6">
                <p className="text-xs uppercase tracking-wide text-gray-500">Team B</p>
                <p className="text-lg font-medium">{result.teamB}</p>
                <p className="text-3xl font-bold mt-1">{result.winRate?.teamB}%</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow border p-6">
              <p className="text-sm text-gray-500">中文重點 / Chinese Summary</p>
              <p className="mt-1 leading-relaxed">{result.summaryZh}</p>
            </div>

            <div className="bg-white rounded-2xl shadow border p-6">
              <p className="text-sm text-gray-500">English Summary</p>
              <p className="mt-1 leading-relaxed">{result.summaryEn}</p>
            </div>

            <p className="text-xs text-gray-500">
              ※ MLB 隊名來自官方清單；CPBL 請從下拉選擇六隊之一。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
