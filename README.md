<div align="center">

# 💰 TokenTill

### *Self-Hosted OpenWebUI Token Analytics & AI Cost Savings Intelligence*

[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](docker-compose.yml)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=nodedotjs&logoColor=white)](package.json)
[![OpenWebUI](https://img.shields.io/badge/OpenWebUI-Compatible-6366F1)](https://github.com/open-webui/open-webui)
[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE)
[![Style: Glassmorphic](https://img.shields.io/badge/Style-Glassmorphism-a855f7)](#-design--ui)

<p align="center">
  <b>TokenTill</b> is a modern, self-hosted web application that connects to your <a href="https://github.com/open-webui/open-webui">OpenWebUI</a> instance, calculates your prompt and completion token consumption across all models, and visualizes exactly how much money you save by running local AI vs. proprietary cloud models like <b>ChatGPT (OpenAI)</b> and <b>Claude (Anthropic)</b>.
</p>

</div>

---

## 🌟 Highlights & Features

- 💎 **Modern Glassmorphism UI**: Multi-layered frosted glass panels (`backdrop-filter: blur(20px)`), ambient neon light orbs, and crisp typography.
- 🛑 **Strict Zero-Lift Hover Effect**: Completely stationary layout—hover states use gentle frosted border illumination and color glow transitions without any box lifting or `translateY` elevation.
- ⚡ **Backend Environment Persistence**: Store your OpenWebUI URL and API key in `.env` so all devices on your local network connect immediately without re-entering credentials.
- 📅 **Dynamic Time Period Filters**: Instantly toggle between **All Time**, **Today**, **Last 7 Days**, **Last 30 Days**, or pick a **Custom Date Range** with calendar pickers.
- 📊 **Multi-Cloud Model Pricing Engine**: Compare your local savings ($0 cost) in real-time against:
  - **Anthropic**: Claude 3.7 Sonnet, Claude 3.5 Sonnet, Claude 3.5 Haiku, Claude 3 Opus
  - **OpenAI**: ChatGPT (GPT-4o), GPT-4o mini, GPT-4 Turbo, OpenAI o1, OpenAI o3-mini
  - **Google**: Gemini 1.5 Pro, Gemini 2.0 Flash
  - **DeepSeek Cloud**: DeepSeek-R1 API
  - **Custom Rates**: Configure your own custom prompt and completion $/1M token rates.
- 📈 **Interactive Visual Analytics (Chart.js)**:
  - **Cumulative Savings Timeline**: Area chart tracking your dollar savings over time.
  - **Local Model Distribution**: Doughnut breakdown showing token share per local model (e.g. Llama 3, DeepSeek-R1, Qwen 2.5, Gemma).
  - **Cloud Cost Comparison**: Bar chart comparing local $0 vs equivalent cloud API expenses.
  - **Daily Activity**: Stacked bar chart showing daily input vs output token volume.
- 🔍 **Searchable & Filterable Chat History**: Search conversation topics, filter by model, inspect exact input/output tokens, and see calculated savings per query.
- 📦 **Docker & Proxmox Ready**: Minimal production multi-stage `Dockerfile` and `docker-compose.yml` for 1-command deployment.
- 🔒 **100% Private & Local**: Zero external telemetry. All calculations run strictly on your server.

---

## 🚀 Quick Start with Docker Compose

The fastest way to deploy **TokenTill** in your home lab or server:

### 1. Clone the repository
```bash
git clone https://github.com/your-username/ai-token-use.git tokentill
cd tokentill
```

### 2. Configure Environment Variables
Copy the example configuration file:
```bash
cp .env.example .env
```

Edit `.env` with your OpenWebUI URL and API Key:
```env
# URL to your OpenWebUI instance (e.g. https://ai.yourdomain.com or http://192.168.1.50:3000)
OPENWEBUI_URL=https://ai.yourdomain.com

# OpenWebUI API Key (Settings -> Account -> API Keys)
OPENWEBUI_API_KEY=sk-your-api-key-here

# Server Port (Default: 3001)
PORT=3001

# In-memory Cache Duration in minutes
CACHE_TTL_MINUTES=5
```

> **How to get your OpenWebUI API Key:**
> 1. Open your OpenWebUI interface.
> 2. Go to **Settings** > **Account**.
> 3. Under **API Keys**, generate and copy your key.

### 3. Launch with Docker Compose
```bash
docker compose up -d --build
```

Open **`http://localhost:3001`** (or `http://<your-server-ip>:3001`) in your browser!

---

## 🛠️ Running with Node.js

If you prefer running directly with Node (v18+ or v20+ recommended):

```bash
# 1. Install dependencies
npm install

# 2. Build the production frontend
npm run build

# 3. Start the backend server
npm start
```

### Development Mode (with Hot-Reload):
```bash
# Run the Vite dev server on port 5173
npm run dev
```

---

## ⚙️ Configuration Reference

All settings can be configured via environment variables in `docker-compose.yml` or a `.env` file in the root directory:

| Variable | Default | Description |
| :--- | :--- | :--- |
| `OPENWEBUI_URL` | `http://localhost:3000` | Full URL to your OpenWebUI server (http/https). |
| `OPENWEBUI_API_KEY` | *(empty)* | Admin or user Bearer API token generated in OpenWebUI account settings. Kept securely on the server and never exposed to the client. |
| `PORT` | `3001` | Port on which the TokenTill server listens. |
| `CACHE_TTL_MINUTES` | `5` | How long token analytics are cached in memory before fetching updates. |
| `MASK_USER_NAMES` | `false` | When `true`, masks user names for privacy (e.g. `Chuck Lindblom` becomes `Ch*** Li******`). Users remain distinctly filterable. |
| `MASK_CHAT_TITLES` | `false` | When `true`, masks conversation titles keeping only the first topic word (e.g. `compression •••••••••`). |

---

## 🔒 Security & Privacy Architecture

TokenTill is designed from the ground up for privacy and self-hosted environments:

1. **Zero Client-Side Key Exposure**:
   - The `OPENWEBUI_API_KEY` is loaded strictly on the Node.js backend server (via Docker environment variables or `.env`).
   - The backend never sends or echoes the API key to client browsers or frontend bundles.
   - When the backend is preconfigured, all frontend API key input fields and local storage entries are permanently disabled and cleared.

2. **Server-Side Privacy Masking**:
   - When `MASK_USER_NAMES=true` or `MASK_CHAT_TITLES=true` are enabled, data is sanitized **on the backend before transmitting over the wire**.
   - Raw private user names or sensitive prompt titles never reach the client's browser, preventing inspection via browser DevTools.
   - Preserves user attribution and distinct sorting/filtering capabilities while protecting individual privacy.

---

## 🏗️ Architecture & How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                       TokenTill App                         │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │            Modern Glassmorphism UI (Frontend)          │  │
│  │  • Realtime Metrics & Savings Dashboard               │  │
│  │  • Chart.js Interactive Visualizations                │  │
│  │  • Time Period Filters (Today / 7D / 30D / Custom)    │  │
│  │  • Multi-User Admin Sync & Filtering Dropdown         │  │
│  │  • Cloud Baseline Matrix (Claude, ChatGPT, Gemini)     │  │
│  └──────────────────────────┬────────────────────────────┘  │
│                             │ REST API (/api/tokens)        │
│  ┌──────────────────────────▼────────────────────────────┐  │
│  │               Node.js / Express Backend                │  │
│  │  • Reads .env credentials securely (Zero Key Leakage) │  │
│  │  • In-Memory TTL Cache (prevents spamming OpenWebUI)  │  │
│  │  • Privacy Masker (MASK_USER_NAMES / MASK_CHAT_TITLES)│  │
│  │  • Multi-User Chat Parser & Token Evaluator           │  │
│  └──────────────────────────┬────────────────────────────┘  │
└─────────────────────────────┼───────────────────────────────┘
                              │ Server-Side Bearer Token Auth
                              ▼
               ┌──────────────────────────────┐
               │    OpenWebUI API Server      │
               │ (/api/v1/chats/all/db, users)│
               └──────────────────────────────┘
```

---

## 💡 Troubleshooting & Tips

<details>
<summary><b>Docker container cannot connect to OpenWebUI running on the same host</b></summary>

If OpenWebUI is running on `http://localhost:3000` on the same machine as Docker, Docker containers cannot reach `localhost` directly. Change `OPENWEBUI_URL` in your `.env` to:
- **Linux/Docker Host:** `http://172.17.0.1:3000` or your LAN IP (e.g. `http://192.168.1.100:3000`).
- **Windows / Mac Docker Desktop:** `http://host.docker.internal:3000`.
</details>

<details>
<summary><b>Chats show up, but token usage was 0 on older messages</b></summary>

Older versions of Ollama / OpenWebUI occasionally do not record `prompt_eval_count` on legacy responses. TokenTill includes a smart heuristic fallback (~3.8 characters per token) to accurately estimate token volume for legacy messages.
</details>

---

## 📄 License

Distributed under the **MIT License**. See [LICENSE](LICENSE) for more details.
