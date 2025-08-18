import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import { PredictRequestSchema, PredictResponseSchema } from "./utils/schema.js";
import { buildStats } from "./utils/data.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

// ───────────────── middleware ─────────────────
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const limiter = rateLimit({ windowMs: 60 * 1000, max: 30 });
app.use(limiter);

// 靜態檔與 SPA fallback
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));

// 健康檢查
app.get("/health", (_req, res) => res.json({ ok: true }));

// ───────────────── utilities ─────────────────
function safeParseModelJSON(text) {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function heuristicFallback({ teamA, teamB, location }) {
  const baseA = 45;
  const baseB = 55;
  const adj = location?.toLowerCase?.().includes(teamB.toLowerCase()) ? 3 : 0;
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

// ───────────────── route: predict ─────────────────
app.post("/api/predict", async (req, res) => {
  // 1) 驗證基本欄位
  const parsed = PredictRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
  }

  const {
    teamA,
    teamB,
    date,
    location,
    league = "MLB",
    pitcherA,
    pitcherB,
    injuriesA = [],
    injuriesB = []
  } = parsed.data;

  // 額外日期保護：允許 -1 年到 +1 年
  const d = new Date(date);
  const now = new Date();
  const min = new Date(now.getFullYear() - 1, 0, 1);
  const max = new Date(now.getFullYear() + 1, 11, 31);
  if (!(d >= min && d <= max)) {
    return res.status(400).json({ error: "Invalid input", message: "Date out of supported range." });
  }

  // 2) 先取得真實資料（MLB/CPBL）
  let stats;
  try {
    stats = await buildStats({ league, teamA, teamB, date, location });
  } catch (err) {
    // data.js 內對於未知隊名會丟 status=400
    if (err?.status === 400) {
      return res.status(400).json({ error: "Invalid input", message: err.message });
    }
    console.error("[predict] data source failure:", err);
    return res.status(500).json({ error: "Data source failed", message: err.message });
  }

  // 3) 組合 prompt（加入投手與傷兵）
  const userContent = `
聯盟：${league}
比賽日期：${date}
球場：${location}
對戰：${teamA} vs ${teamB}

數據：
${stats}

先發投手：
- ${teamA} 先發投手：${pitcherA || "待定"}
- ${teamB} 先發投手：${pitcherB || "待定"}

傷兵名單：
- ${teamA} 傷兵：${Array.isArray(injuriesA) ? (injuriesA.join(", ") || "無") : "無"}
- ${teamB} 傷兵：${Array.isArray(injuriesB) ? (injuriesB.join(", ") || "無") : "無"}

請只回覆 JSON（不得包含其他文字或註解），鍵名如下：
{
  "teamA": "${teamA}",
  "teamB": "${teamB}",
  "location": "${location}",
  "prediction": "例如 \\"${teamA} 4 - 6 ${teamB}\\"，務必包含兩隊名稱與比分",
  "winRate": { "teamA": 百分比數字, "teamB": 百分比數字 },
  "summaryZh": "用中文的簡短預測重點（含原因，如投手對決、近況、傷兵）",
  "summaryEn": "English one-liner summary"
}
注意：winRate 兩邊加總需≈100（允許±0.5 誤差）。`.trim();

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

    // Node 18+ 有內建 fetch
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.6,
        top_p: 0.9,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a disciplined baseball prediction analyst. Always return STRICT JSON only. Use provided per-game scoring and allowing, recent form, head-to-head, venue and pitchers/injury info to estimate a plausible baseball score."
          },
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
      // 讓勝率加總 ≈ 100
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
      if (validated.success) {
        console.log("[predict] using MODEL response");
        return res.json(validated.data);
      }
    }

    console.warn("[predict] using FALLBACK");
    return res.json(heuristicFallback({ teamA, teamB, location }));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Prediction failed", message: err.message });
  }
});

// SPA fallback（放在最後，避免吃掉 /api/*）
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  return res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`✅ API listening on http://localhost:${PORT}`);
});
