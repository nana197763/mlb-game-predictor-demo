// server/server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";

import {
  buildStats,
  calculateWinRates,
  predictScore,
} from "./utils/data.js";

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

    if (!league || !teamA || !teamB || !date) {
      return res.status(400).json({ message: "缺少 league / teamA / teamB / date 參數" });
    }

    const stats = await buildStats({ league, teamA, teamB, date });

    // 沒有這場比賽，直接回 404
    if (stats && stats.hasMatch === false) {
      return res.status(404).json({
        message: stats.text || `找不到 ${date} ${teamA} vs ${teamB} 的對戰資料`,
      });
    }

    const winRate = calculateWinRates({ teamA, teamB, stats });

    // 預測比分（棒球 / 籃球各一套）
    const predictedScore = predictScore({ league, teamA, teamB, winRate, stats });

    const summaryZh = buildExplanationZh({
      league,
      teamA,
      teamB,
      stats,
      winRate,
      predictedScore,
    });

    const summaryEn = buildExplanationEn({
      league,
      teamA,
      teamB,
      stats,
      winRate,
      predictedScore,
    });

    const prediction = `${teamA} vs ${teamB} - ${winRate[teamA]}% / ${winRate[teamB]}%`;

    res.json({
      league,
      teamA,
      teamB,
      prediction,
      winRate: { teamA: winRate[teamA], teamB: winRate[teamB] },
      predictedScore, // { [teamA]: x, [teamB]: y }
      location: stats.location || null,
      summaryZh,
      summaryEn,
    });
  } catch (err) {
    if (err.code === "NO_STATS") {
      return res.status(404).json({
        message: "查不到足夠的戰績資料，無法預測此場比賽。",
      });
    }
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
