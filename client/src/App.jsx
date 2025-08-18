import React, { useEffect, useMemo, useState } from "react";
import "./App.css";

const CPBL_TEAMS = ["富邦悍將", "統一獅", "中信兄弟", "樂天桃猿", "味全龍", "台鋼雄鷹"];

function TeamSelect({ league, label, value, onChange, mlbTeams, disabled }) {
  const options = league === "MLB" ? mlbTeams : CPBL_TEAMS.map(n => ({ id: n, name: n }));
  return (
    <div className="form-row">
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled || !options.length}>
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
  const [pitcherA, setPitcherA] = useState("");
  const [pitcherB, setPitcherB] = useState("");
  const [injuriesA, setInjuriesA] = useState("");
  const [injuriesB, setInjuriesB] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // MLB teams from official API
  const [mlbTeams, setMlbTeams] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(false);

  const dateLimits = useMemo(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    return { min: `${yyyy - 1}-01-01`, max: `${yyyy + 1}-12-31` };
  }, []);

  // 切換聯盟時載入 MLB 清單 & 清空隊名
  useEffect(() => {
    setTeamA("");
    setTeamB("");
    setResult(null);
    setErr("");

    if (league === "MLB" && mlbTeams.length === 0) {
      (async () => {
        try {
          setLoadingTeams(true);
          const resp = await fetch("https://statsapi.mlb.com/api/v1/teams?sportId=1");
          const data = await resp.json();
          const teams = (data?.teams || [])
            .filter((t) => t.active)
            .map((t) => ({ id: t.id, name: t.name }))
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
    setErr("");
    setResult(null);

    if (!teamA || !teamB || !date || !location) {
      setErr("請完整輸入：隊伍 A / 隊伍 B / 日期 / 球場");
      return;
    }
    if (teamA === teamB) {
      setErr("兩隊不可相同");
      return;
    }

    const body = {
      league,
      teamA,
      teamB,
      date,
      location,
      pitcherA,
      pitcherB,
      injuriesA: injuriesA ? injuriesA.split(",").map((s) => s.trim()).filter(Boolean) : [],
      injuriesB: injuriesB ? injuriesB.split(",").map((s) => s.trim()).filter(Boolean) : [],
    };

    setLoading(true);
    try {
      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data?.message || "預測失敗");
        return;
      }
      setResult(data);
    } catch (e) {
      console.error(e);
      setErr("連線失敗，請稍後再試");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <h1>⚾ MLB / CPBL AI 比賽預測</h1>

      <form onSubmit={(e) => e.preventDefault()}>
        <div className="form-row">
          <label>聯盟 / League</label>
          <select value={league} onChange={(e) => setLeague(e.target.value)}>
            <option value="MLB">MLB</option>
            <option value="CPBL">CPBL</option>
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

        <div className="form-row">
          <label>日期 / Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} min={dateLimits.min} max={dateLimits.max} />
        </div>

        <div className="form-row">
          <label>球場 / Stadium</label>
          <input placeholder={league === "MLB" ? "Yankee Stadium" : "台南棒球場"} value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>

        <div className="form-row">
          <label>先發投手 A</label>
          <input placeholder={league === "MLB" ? "e.g. Gerrit Cole" : "例如：江國豪"} value={pitcherA} onChange={(e) => setPitcherA(e.target.value)} />
        </div>
        <div className="form-row">
          <label>先發投手 B</label>
          <input placeholder={league === "MLB" ? "e.g. Chris Sale" : "例如：潘威倫"} value={pitcherB} onChange={(e) => setPitcherB(e.target.value)} />
        </div>

        <div className="form-row">
          <label>傷兵 A（以逗號分隔）</label>
          <input placeholder="球員1, 球員2" value={injuriesA} onChange={(e) => setInjuriesA(e.target.value)} />
        </div>
        <div className="form-row">
          <label>傷兵 B（以逗號分隔）</label>
          <input placeholder="球員1, 球員2" value={injuriesB} onChange={(e) => setInjuriesB(e.target.value)} />
        </div>

        <button type="button" onClick={handlePredict} disabled={loading || (league === "MLB" && loadingTeams)}>
          {loading ? "預測中…" : "開始預測 / Predict"}
        </button>
      </form>

      {err && <p className="error">{err}</p>}

      {result && (
        <div className="result">
          <h2>📊 預測結果</h2>
          <p className="prediction">{result.prediction}</p>

          <div className="grid">
            <div>
              <div className="muted">Team A</div>
              <div className="big">{result.teamA}</div>
              <div className="big">{result.winRate?.teamA}%</div>
            </div>
            <div>
              <div className="muted">Team B</div>
              <div className="big">{result.teamB}</div>
              <div className="big">{result.winRate?.teamB}%</div>
            </div>
          </div>

          <div className="muted">中文重點</div>
          <p>{result.summaryZh}</p>

          <div className="muted">English Summary</div>
          <p>{result.summaryEn}</p>
        </div>
      )}
    </div>
  );
}
