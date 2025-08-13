import React, { useState } from "react";

export default function App() {
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");
  const [league, setLeague] = useState("MLB");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handlePredict = async () => {
    if (!teamA || !teamB || !date || !location) {
      alert("請完整輸入所有資料 / Please fill all fields");
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamA, teamB, date, location, league })
      });
      const data = await res.json();
      setResult(data);
    } catch (e) {
      console.error(e);
      alert("Prediction failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-white shadow-lg rounded-2xl p-6">
        <h1 className="text-2xl font-bold mb-4">MLB / CPBL 比賽預測</h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            className="border rounded p-2"
            placeholder="隊伍 A / Team A"
            value={teamA}
            onChange={(e) => setTeamA(e.target.value)}
          />
          <input
            className="border rounded p-2"
            placeholder="隊伍 B / Team B"
            value={teamB}
            onChange={(e) => setTeamB(e.target.value)}
          />
          <input
            type="date"
            className="border rounded p-2"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <input
            className="border rounded p-2"
            placeholder="球場 / Location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
          <select
            className="border rounded p-2"
            value={league}
            onChange={(e) => setLeague(e.target.value)}
          >
            <option value="MLB">MLB</option>
            <option value="CPBL">CPBL</option>
          </select>
        </div>

        <button
          onClick={handlePredict}
          className="mt-4 w-full bg-black text-white py-2.5 rounded-xl disabled:opacity-60"
          disabled={loading}
        >
          {loading ? "預測中… / Predicting…" : "開始預測 / Predict"}
        </button>

        {result && (
          <div className="mt-6 space-y-3">
            {result.error && (
              <div className="text-red-600 text-sm">{String(result.message || result.error)}</div>
            )}

            {result.prediction && (
              <div className="p-4 bg-gray-50 rounded-xl">
                <div className="text-sm text-gray-500">Prediction</div>
                <div className="text-xl font-semibold">{result.prediction}</div>
              </div>
            )}

            {result.winRate && (
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 bg-gray-50 rounded-xl">
                  <div className="text-sm text-gray-500">{result.teamA || teamA}</div>
                  <div className="text-2xl font-bold">{result.winRate.teamA}%</div>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl">
                  <div className="text-sm text-gray-500">{result.teamB || teamB}</div>
                  <div className="text-2xl font-bold">{result.winRate.teamB}%</div>
                </div>
              </div>
            )}

            {result.summaryZh && (
              <div className="p-4 bg-gray-50 rounded-xl">
                <div className="text-sm text-gray-500">中文重點</div>
                <div className="text-base">{result.summaryZh}</div>
              </div>
            )}

            {result.summaryEn && (
              <div className="p-4 bg-gray-50 rounded-xl">
                <div className="text-sm text-gray-500">English Summary</div>
                <div className="text-base">{result.summaryEn}</div>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 text-xs text-gray-500">
          ⚠️ 聲明：此示範僅用示意數據與 AI 輔助，不代表真實賭盤或專業建議。
        </div>
      </div>
    </div>
  );
}
