// server/server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";

import { buildStats, calculateWinRates, predictScore } from "./utils/data.js";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.set("trust proxy", 1);
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 30,
  })
);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));

app.get("/health", (_req, res) => res.json({ ok: true }));

/**
 * 中文說明
 */
function buildExplanationZh({ league, teamA, teamB, stats, winRate, predictedScore }) {
  const tdA = stats.teamDetails?.[teamA] || {};
  const tdB = stats.teamDetails?.[teamB] || {};
  const pitchers = stats.pitchersByTeam || {};
  const location = stats.location || "未知球場";
  const homeTeam = stats.homeTeam;

  const lines = [];

  lines.push(
    `${league} 預測：${teamA} 勝率 ${winRate[teamA]}%，${teamB} 勝率 ${winRate[teamB]}%。`
  );

  if (predictedScore && predictedScore[teamA] != null && predictedScore[teamB] != null) {
    lines.push(
      `預測比數：${teamA} ${predictedScore[teamA]} : ${predictedScore[teamB]} ${teamB}（僅供娛樂參考）。`
    );
  }

  if (pitchers[teamA] || pitchers[teamB]) {
    lines.push(
      `預計先發投手：${teamA} ${pitchers[teamA] || "未定"}，${teamB} ${pitchers[teamB] || "未定"}。`
    );
  }

  if (tdA.recentWinRate != null && tdB.recentWinRate != null) {
    lines.push(
      `${teamA} 近期勝率約 ${(tdA.recentWinRate * 100).toFixed(1)}%，` +
      `${teamB} 約 ${(tdB.recentWinRate * 100).toFixed(1)}%。`
    );
  }

  if (stats.h2hStats?.count) {
    lines.push(
      `本季對戰：${teamA} ${stats.h2hStats.aWins} 勝，${teamB} ${stats.h2hStats.bWins} 勝（共 ${stats.h2hStats.count} 場）。`
    );
  }

  if (location) {
    lines.push(
      `比賽場地：${location}${homeTeam ? `，主場球隊為 ${homeTeam}。` : "。"}`
    );
  }

  return lines.join("\n");
}

/**
 * 英文簡短說明（可之後再強化）
 */
function buildExplanationEn({ league, teamA, teamB, stats, winRate, predictedScore }) {
  const location = stats.location || "Unknown stadium";
  const homeTeam = stats.homeTeam;

  let line = `${league} prediction: ${teamA} win prob ${winRate[teamA]}%, ${teamB} ${winRate[teamB]}%.`;

  if (predictedScore && predictedScore[teamA] != null && predictedScore[teamB] != null) {
    line += ` Expected score: ${teamA} ${predictedScore[teamA]} - ${predictedScore[teamB]} ${teamB}.`;
  }

  line += ` Venue: ${location}`;
  if (homeTeam) line += `, home team: ${homeTeam}.`;

  return line;
}

app.post("/api/predict", async (req, res) => {
  try {
    const { league, teamA, teamB, date } = req.body;
    const stats = await buildStats({ league, teamA, teamB, date });

    // 若沒找到比賽（stats 為 null），直接回錯誤
    if (!stats) {
      return res.status(404).json({
        message: `找不到 ${league} 在 ${date} 的 ${teamA} vs ${teamB} 比賽資料`,
      });
    }

    const winRate = calculateWinRates({ teamA, teamB, stats });
    const scores = predictScore({ league, teamA, teamB, winRate });

    const prediction = `${teamA} vs ${teamB} - 勝率 ${winRate[teamA]}% / ${winRate[teamB]}%`;
    const scoreLine = `${scores[teamA]} : ${scores[teamB]}`;

    const summaryZh =
      `球場：${stats.location || "未知"}。\n` +
      `${teamA} 勝率 ${winRate[teamA]}%，${teamB} 勝率 ${winRate[teamB]}%。\n` +
      `預測比分：${teamA} ${scores[teamA]} 比 ${scores[teamB]} ${teamB}。`;

    const summaryEn =
      `Stadium: ${stats.location || "Unknown"}.\n` +
      `${teamA}: ${winRate[teamA]}%, ${teamB}: ${winRate[teamB]}%.\n` +
      `Predicted score: ${teamA} ${scores[teamA]} - ${scores[teamB]} ${teamB}.`;

    res.json({
      teamA,
      teamB,
      league,
      prediction,
      winRate: { teamA: winRate[teamA], teamB: winRate[teamB] },
      predictedScore: scores, // ✅ 給前端用
      location: stats.location,
      summaryZh,
      summaryEn,
      rawStatsText: stats.text ?? null, // 你在 cpbl/mlb/nba 裡寫的說明欄也一起回
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || "Server error" });
  }
});


// Express 5 不支援 app.get("*")
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) {
    return next();
  }
  res.sendFile(path.join(publicDir, "index.html"));
});


app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
