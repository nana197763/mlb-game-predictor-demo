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

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const limiter = rateLimit({ windowMs: 60 * 1000, max: 30 });
app.use(limiter);

// 靜態檔與 SPA fallback
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));

app.get("/health", (_req, res) => res.json({ ok: true }));

/* ───── Utils ───── */
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
  const baseA = 45, baseB = 55;
  const adj = location?.toLowerCase?.().includes(teamB.toLowerCase()) ? 3 : 0;
  const teamAPct = Math.max(0, Math.min(100, baseA - adj));
  const teamBPct = Math.max(0, Math.min(100, baseB + adj));
  const pred = `${teamA} 4 - 5 ${teamB}`;
  return {
    teamA, teamB, location,
    prediction: pred,
    winRate: { teamA: teamAPct, teamB: teamBPct },
    summaryZh: `（備援）依啟發式評估，${teamB} 小幅領先，預測 5-4 勝 ${teamA}`,
    summaryEn: `(Fallback) Heuristic suggests a slight edge to ${teamB}, predicted 5-4 over ${teamA}.`
  };
}

/* ───── Predict ───── */
app.post("/api/predict", async (req, res) => {
  const parsed = PredictRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
  }

  const { teamA, teamB, date, location, league = "MLB" } = parsed.data;

  // 日期 guard（-1 ~ +1 年）
  const d = new Date(date), now = new Date();
  const min = new Date(now.getFullYear() - 1, 0, 1);
  const max = new Date(now.getFullYear() + 1, 11, 31);
  if (!(d >= min && d <= max)) {
    return res.status(400).json({ error: "Invalid input", message: "Date out of supported range." });
  }

  // 取得真實資料（含：季戰績/近況/交手/球場/先發/傷兵）
  let statsBundle;
  try {
    statsBundle = await buildStats({ league, teamA, teamB, date, location });
  } catch (err) {
    if (err?.status === 400) {
      return res.status(400).json({ error: "Invalid input", message: err.message });
    }
    console.error("[predict] data source failure:", err);
    return res.status(500).json({ error: "Data source failed", message: err.message });
  }

  const pitcherALine = statsBundle.pitchersByTeam?.[teamA] || "未定";
  const pitcherBLine = statsBundle.pitchersByTeam?.[teamB] || "未定";
  const injuriesALine = (statsBundle.injuriesByTeam?.[teamA] || []).join(", ") || "無";
  const injuriesBLine = (statsBundle.injuriesByTeam?.[teamB] || []).join(", ") || "無";

  const userContent = `
【比賽資訊 / Game Info】
- 聯盟 League: ${league}
- 日期 Date: ${date}
- 球場 Stadium: ${location}
- 對戰 Matchup: ${teamA} vs ${teamB}

【數據摘要 / Data Summary】
${statsBundle.text}

【先發投手 / Probable Starters】
- ${teamA}: ${pitcherALine}
- ${teamB}: ${pitcherBLine}

【傷兵 / Injuries】
- ${teamA}: ${injuriesALine}
- ${teamB}: ${injuriesBLine}

請只回覆 JSON（不得包含任何多餘文字或程式碼圍欄）。格式如下：
{
  "teamA": "${teamA}",
  "teamB": "${teamB}",
  "location": "${location}",
  "prediction": "例如 \\"${teamA} 4 - 6 ${teamB}\\"（務必含兩隊名稱與比分）",
  "winRate": { "teamA": 百分比數字, "teamB": 百分比數字 },
  "summaryZh": "中文摘要：整季戰績、近期表現、近三場交手、先發投手對位與影響、傷兵名單影響、球場因素，最後簡短結論。",
  "summaryEn": "English summary covering season record, recent form, last H2H, probable starters impact, injuries, venue, and conclusion."
}
要求：
- 勝率兩隊加總≈100（允許±0.5）；
- 比分須合理（棒球常見 2–7 分），並與投手/近況一致；
- 嚴格 JSON，鍵名與型別須符合；`.trim();

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
        temperature: 0.6,
        top_p: 0.9,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a disciplined baseball prediction analyst. Always return STRICT JSON only. Use season record, recent form, last H2H, venue, probable starters and injuries to estimate a plausible score and win rates."
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
      // 勝率加總 ≈ 100
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
        return res.json(validated.data);
      }
    }

    return res.json(heuristicFallback({ teamA, teamB, location }));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Prediction failed", message: err.message });
  }
});

// SPA fallback（避免吃掉 /api/*）
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  return res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`✅ API listening on http://localhost:${PORT}`);
});
