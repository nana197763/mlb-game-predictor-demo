import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import { PredictRequestSchema, PredictResponseSchema } from "./utils/schema.js";

// ⬇⬇ 新增：用來定位 public 目錄
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Basic rate limit to avoid accidental key burn
const limiter = rateLimit({ windowMs: 60 * 1000, max: 30 });
app.use(limiter);

/**
 * UTIL: Safe JSON extract if model wraps in code fences etc.
 */
function safeParseModelJSON(text) {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch (e) {
    return null;
  }
}

/**
 * TEMP data builder — replace with real feeds later
 */
function buildStubStats(teamA, teamB) {
  return `
${teamA} 最近 5 場：3 勝 2 敗，場均得分 4.9，失分 4.2
${teamB} 最近 5 場：4 勝 1 敗，場均得分 5.8，失分 3.7
近期交手：${teamB} 對 ${teamA} 近 3 場 3 勝 0 敗
投手先發：${teamA} 先發 ERA 3.95；${teamB} 先發 ERA 3.20
球場因子：主場對打者 +3%（示意）
`;
}

/**
 * Fallback deterministic estimate (when model fails)
 */
function heuristicFallback({ teamA, teamB, location }) {
  const baseA = 45;
  const baseB = 55;
  const adj = location.toLowerCase().includes(teamB.toLowerCase()) ? 3 : 0;
  const teamAPct = Math.max(0, Math.min(100, baseA - adj));
  const teamBPct = Math.max(0, Math.min(100, baseB + adj));
  const pred = `${teamA} 4 - 5 ${teamB}`;
  return {
    teamA,
    teamB,
    location,
    prediction: pred,
    winRate: { teamA: teamAPct, teamB: teamBPct },
    summaryZh: `（備援）依啟發式評估，${teamB} 小幅領先，預測 5-4 勝 ${teamA}`,
    summaryEn: `(Fallback) Heuristic suggests a slight edge to ${teamB}, predicted 5-4 over ${teamA}.`
  };
}

// ⬇⬇ 新增：托管前端（Build 後會把 client/dist 複製到 server/public）
const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));
// SPA fallback（除了 /api，其餘路徑都回 index.html）
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  return res.sendFile(path.join(publicDir, "index.html"));
});

app.post("/api/predict", async (req, res) => {
  const parsed = PredictRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
  }
  const { teamA, teamB, date, location, league = "MLB" } = parsed.data;

  const stats = buildStubStats(teamA, teamB);

  const userContent = `
聯盟：${league}
比賽日期：${date}
球場：${location}
對戰：${teamA} vs ${teamB}
數據：
${stats}

請只回覆 JSON（不得包含其他文字或註解），鍵名如下：
{
  "teamA": "${teamA}",
  "teamB": "${teamB}",
  "location": "${location}",
  "prediction": "例如 \"${teamA} 4 - 6 ${teamB}\"，務必包含兩隊名稱與比分",
  "winRate": { "teamA": 百分比數字, "teamB": 百分比數字 },
  "summaryZh": "用中文的簡短預測重點（含原因，如投手對決、近況）",
  "summaryEn": "English one-liner summary"
}
注意：winRate 兩邊加總需≈100（允許±0.5 誤差）。`;

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.5,
        messages: [
          { role: "system", content: "You are a disciplined baseball prediction analyst. Always return STRICT JSON only." },
          { role: "user", content: userContent }
        ]
      })
    });

    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`OpenAI HTTP ${resp.status}: ${txt}`);
    }

    const data = await resp.json();
    const raw = data?.choices?.[0]?.message?.content || "";
    let parsedJSON = safeParseModelJSON(raw);

    if (parsedJSON) {
      if (parsedJSON?.winRate) {
        const a = Number(parsedJSON.winRate.teamA) || 0;
        const b = Number(parsedJSON.winRate.teamB) || 0;
        const sum = a + b;
        if (sum > 0 && Math.abs(sum - 100) > 0.6) {
          parsedJSON.winRate.teamA = Number((a * 100 / sum).toFixed(1));
          parsedJSON.winRate.teamB = Number((b * 100 / sum).toFixed(1));
        }
      }
      const validated = PredictResponseSchema.safeParse(parsedJSON);
      if (validated.success) return res.json(validated.data);
    }

    return res.json(heuristicFallback({ teamA, teamB, location }));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Prediction failed", message: err.message });
  }
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`✅ API listening on http://localhost:${PORT}`);
});
