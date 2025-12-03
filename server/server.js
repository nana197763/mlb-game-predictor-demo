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
   🔥 Prediction API
   =========================================================== */
app.post("/api/predict", async (req, res) => {
  try {
    const { league, teamA, teamB, date } = req.body;

    const stats = await buildStats({ league, teamA, teamB, date });

    if (!stats) {
      return res.status(404).json({
        message: `找不到 ${league} 在 ${date} 的 ${teamA} vs ${teamB} 比賽資料`,
      });
    }

    const winRate = calculateWinRates({ teamA, teamB, stats });
    const scores = predictScore({ league, teamA, teamB, winRate });

    /* ---------------- 自動說明欄（中英） ---------------- */
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

    res.json({
      league,
      teamA,
      teamB,
      date,

      winRate,
      predictedScore: scores,
      location: stats.location || null,

      summaryZh: autoZh,
      summaryEn: autoEn,

      rawStatsText: stats.text ?? null,
    });
  } catch (err) {
    console.error("❌ Prediction Error:", err);
    res.status(500).json({ message: err.message || "Server error" });
  }
});

/* ===========================================================
   🔥 Express 5 Fallback Route (修正 path-to-regexp 錯誤)
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
