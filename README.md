# MLB/CPBL AI Predictor

React + Tailwind (Vite) frontend, Node + Express backend. The backend calls OpenAI to produce a JSON prediction based on simple placeholder stats.

## Quick Start (Local)

1. `cp .env.example .env` and set `OPENAI_API_KEY`.
2. `npm i`
3. `npm run dev`

Frontend: http://localhost:5173 (proxies /api)  
Backend:  http://localhost:5000 (POST /api/predict)

## Production

- Build frontend: `npm run build`
- Start server: `npm start`


---

## ☁️ Cloud Deploy

### Option A — Render (one-container Docker)
1. Fork or upload this repo to GitHub.
2. Go to Render → **New +** → **Web Service** → **Build & deploy from a Git repo**.
3. Pick your repo. Render detects the `Dockerfile` automatically.
4. Set **Environment Variables**: `OPENAI_API_KEY=sk-...` (required).
5. Deploy. Render will build the client, copy it into `server/public`, and serve on the same port.

### Option B — Split: Vercel (frontend) + Render/Railway (backend)
1. Deploy backend (this repo) to Render/Railway. Note the public URL, e.g. `https://your-backend.onrender.com`.
2. In Vercel, create a **New Project** → Import this repo → set **Build Command** to `npm --prefix client run build` and **Output Dir** `client/dist` (or use included `vercel.json`).
3. In Vercel **Environment Variables**, set `VITE_API_BASE` to your backend URL.
4. Redeploy. The frontend will call `${VITE_API_BASE}/api/predict` in production.

### Railway (one-container)
- Create a new project from repo → **Variables**: add `OPENAI_API_KEY`.
- Railway builds Dockerfile by default → deploys → use generated domain.
