import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import { PredictRequestSchema, PredictResponseSchema } from "./utils/schema.js";
import { buildStats } from "./utils/data.js";
import { predictWinRate } from "./utils/predict.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

app.set("trust proxy", 1);
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const limiter = rateLimit({ windowMs: 60 * 1000, max: 30 });
app.use(limiter);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/api/predict", async (req, res) => {
  const parsed = PredictRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
  }

  const { teamA, teamB, date, league = "MLB" } = parsed.data;
  if (!league || !teamA || !teamB || !date) {
    return res.status(400).json({ error: "Invalid input", message: "需要聯盟、隊伍 A、隊伍 B、日期。" });
  }
  if (teamA === teamB) {
    return res.status(400).json({ error: "Invalid input", message: "兩隊不可相同。" });
  }

  const d = new Date(date), now = new Date();
  const min = new Date(now.getFullYear() - 1, 0, 1);
  const max = new Date(now.getFullYear() + 1, 11, 31);
  if (!(d >= min && d <= max)) {
    return res.status(400).json({ error: "Invalid input", message: "日期超出支援範圍。" });
  }

  let statsBundle;
  try {
    statsBundle = await buildStats({ league, teamA, teamB, date });
  } catch (err) {
    if (err?.status === 400) {
      return res.status(400).json({ error: "Invalid input", message: err.message });
    }
    console.error("[predict] data source failure:", err);
    return res.status(500).json({ error: "Data source failed", message: err.message });
  }

  try {
    const result = predictWinRate({ teamA, teamB, league, date, stats: statsBundle });
    const validated = PredictResponseSchema.safeParse(result);
    if (!validated.success) {
      console.error("Validation failed", validated.error);
      return res.status(500).json({ error: "Invalid model result" });
    }
    return res.json(validated.data);
  } catch (err) {
    console.error("Prediction model failed", err);
    return res.status(500).json({ error: "Prediction failed", message: err.message });
  }
});

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  return res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`✅ API listening on http://localhost:${PORT}`);
});
export async function buildStats({ league, ...rest }) {
  if (league === "MLB") {
    return await buildMLBStats(rest);
  } else if (league === "CPBL") {
    return await buildCPBLStats(rest);
  } else {
    const err = new Error(`Unsupported league: ${league}`);
    err.status = 400;
    throw err;
  }
}
