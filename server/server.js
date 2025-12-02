import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";

import { buildStats, calculateWinRates } from "./utils/data.js";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.set("trust proxy", 1);
app.use(rateLimit({ windowMs: 60 * 1000, max: 30 }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/api/predict", async (req, res) => {
  try {
    const { league, teamA, teamB, date } = req.body;
    const stats = await buildStats({ league, teamA, teamB, date });
    const winRate = calculateWinRates({ teamA, teamB, stats });

    const prediction = `${teamA} vs ${teamB} - ${winRate[teamA]}% / ${winRate[teamB]}%`;
    const summaryZh = `球場：${stats.location || "未知"}。\n${teamA} 勝率 ${winRate[teamA]}%，${teamB} 勝率 ${winRate[teamB]}%。`;
    const summaryEn = `Stadium: ${stats.location || "Unknown"}.\n${teamA}: ${winRate[teamA]}%. ${teamB}: ${winRate[teamB]}%.`;

    res.json({
      teamA,
      teamB,
      prediction,
      winRate: { teamA: winRate[teamA], teamB: winRate[teamB] },
      location: stats.location,
      summaryZh,
      summaryEn,
    });
  } catch (err) {
    res.status(500).json({ message: err.message || "Server error" });
  }
});

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
}); 
