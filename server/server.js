import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";
import OpenAI from "openai";
import { getMLBStats, getCPBLStats } from "./utils/data.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 🟢 預測 API
app.post("/api/predict", async (req, res) => {
  try {
    const { league, teamA, teamB, date, location, pitcherA, pitcherB, injuriesA, injuriesB } = req.body;

    let stats = "";
    if (league === "MLB") {
      stats = await getMLBStats(teamA, teamB);
    } else if (league === "CPBL") {
      stats = await getCPBLStats(teamA, teamB);
    }

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
- ${teamA} 傷兵：${injuriesA?.join(", ") || "無"}
- ${teamB} 傷兵：${injuriesB?.join(", ") || "無"}

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
注意：winRate 兩邊加總需≈100（允許±0.5 誤差）。`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "你是一個專業的棒球比賽預測助理，會綜合數據、投手狀況與傷兵資訊，輸出 JSON 格式結果。" },
        { role: "user", content: userContent },
      ],
      temperature: 0.7,
    });

    let text = completion.choices[0].message?.content || "{}";
    let json = {};

    try {
      json = JSON.parse(text);
    } catch (e) {
      console.error("❌ JSON parse error:", e);
      return res.status(500).json({ error: "Invalid AI response", raw: text });
    }

    res.json(json);

  } catch (error) {
    console.error("❌ Error in /api/predict:", error);
    res.status(500).json({ error: "Prediction failed" });
  }
});

// 🟢 健康檢查
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// 🟢 SPA fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(
