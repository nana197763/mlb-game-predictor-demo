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
  buildAutoDescriptionZh,
  buildAutoDescriptionEn,
} from "./utils/data.js";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 10000;

/* ---------------- Middleware ---------------- */
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.set("trust proxy", 1);
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 30,
  })
);

/* ---------------- Static Files ---------------- */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "../client/dist");

app.use(express.static(publicDir));

app.get("/health", (_req, res) => res.json({ ok: true }));

/* ===========================================================
   🔥 Prediction API（比賽偵測 + 隊徽 + 傷兵）
   =========================================================== */
app.post("/api/predict", async (req, res) => {
  try {
    const { league, teamA, teamB, date } = req.body;

    /* ---------------- 比賽資料（含球場 & 先發）---------------- */
    const stats = await buildStats({ league, teamA, teamB, date });

    if (!stats || !stats.hasMatch) {
      return res.status(404).json({
        message: `官方賽程中找不到 ${date} 的 ${teamA} vs ${teamB}`,
      });
    }

    /* ---------------- 勝率計算 ---------------- */
    const winRate = calculateWinRates({ teamA, teamB, stats });

    /* ---------------- 比分預測 ---------------- */
    const scores = predictScore({ league, teamA, teamB, winRate });

    /* ---------------- 自動描述（中英） ---------------- */
    const autoZh = buildAutoDescriptionZh({
      league,
      teamA,
      teamB,
      stats,
      winRate,
      predictedScore: scores,
    });

    const autoEn = buildAutoDescriptionEn({
      league,
      teamA,
      teamB,
      stats,
      winRate,
      predictedScore: scores,
    });

    /* ---------------- 回傳資料（加強版） ---------------- */
    res.json({
      league,
      teamA,
      teamB,
      date,

      /* ---- 基本 ---- */
      location: stats.location,
      homeTeam: stats.homeTeam,

      /* ---- 隊徽（MLB/NBA 有，CPBL 我也能加） ---- */
      logoA: stats.logoA || null,
      logoB: stats.logoB || null,

      /* ---- 傷兵（NBA） ---- */
      injury: stats.injury || [],

      /* ---- 先發投手（CPBL/MLB） ---- */
      pitchers: stats.pitchersByTeam || {},

      /* ---- MLB 投手/打擊數據 ---- */
      seasonStats: stats.seasonStats,
      recentStats: stats.recentStats,

      /* ---- NBA 高級數據 ---- */
      advStats: stats.advStats || {},
      homeAwayStats: stats.homeAwayStats || {},

      /* ---- 勝率 + 比分 ---- */
      winRate,
      predictedScore: scores,

      /* ---- 自動產生的說明 ---- */
      summaryZh: autoZh,
      summaryEn: autoEn,

      /* ---- 用於 Debug / 文字輸出 ---- */
      rawStatsText: stats.text ?? null,
    });

  } catch (err) {
    console.error("❌ Prediction Error:", err);
    res.status(500).json({ message: err.message || "Server error" });
  }
});

/* ===========================================================
   🔥 Fallback (Express 5)
   =========================================================== */
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  return res.sendFile(path.join(publicDir, "index.html"));
});

/* ===========================================================
   🔥 Start Server
   =========================================================== */
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
