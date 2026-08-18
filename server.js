import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

function cleanEnv(val, fallback = '') {
  if (!val) return fallback;
  return String(val).trim().replace(/^['"]|['"]$/g, '').trim();
}

// Configuration from Environment Variables
const OPENWEBUI_URL = cleanEnv(process.env.OPENWEBUI_URL, 'http://localhost:3000').replace(/\/+$/, '');
const OPENWEBUI_API_KEY = cleanEnv(process.env.OPENWEBUI_API_KEY, '');
const CACHE_TTL_MS = (parseInt(process.env.CACHE_TTL_MINUTES) || 5) * 60 * 1000;

app.use(cors());
app.use(express.json());

// In-Memory Cache
let cachedData = null;
let lastFetchTime = null;
let isFetching = false;

// Helper: Estimate token count (~4 chars per token)
function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  return Math.max(1, Math.ceil(text.length / 3.8));
}

// Helper: Extract token counts from message object
function extractMessageTokens(msg) {
  let promptTokens = 0;
  let completionTokens = 0;

  if (msg.usage) {
    promptTokens = msg.usage.prompt_tokens || msg.usage.prompt_eval_count || 0;
    completionTokens = msg.usage.completion_tokens || msg.usage.eval_count || 0;
  }

  if (msg.prompt_eval_count !== undefined) {
    promptTokens = msg.prompt_eval_count || 0;
  }
  if (msg.eval_count !== undefined) {
    completionTokens = msg.eval_count || 0;
  }

  if (promptTokens === 0 && completionTokens === 0 && msg.content) {
    if (msg.role === 'user' || msg.role === 'system') {
      promptTokens = estimateTokens(msg.content);
    } else {
      completionTokens = estimateTokens(msg.content);
    }
  }

  return { promptTokens, completionTokens };
}

// Helper: Parse a single chat object
function parseSingleChat(chatData) {
  if (!chatData) return null;

  const id = chatData.id || `chat_${Math.random().toString(36).slice(2, 9)}`;
  const title = chatData.title || (chatData.chat && chatData.chat.title) || 'Untitled Conversation';

  let timestamp = Date.now();
  if (chatData.updated_at) {
    timestamp = typeof chatData.updated_at === 'number'
      ? chatData.updated_at * (chatData.updated_at < 1e12 ? 1000 : 1)
      : new Date(chatData.updated_at).getTime();
  } else if (chatData.created_at) {
    timestamp = typeof chatData.created_at === 'number'
      ? chatData.created_at * (chatData.created_at < 1e12 ? 1000 : 1)
      : new Date(chatData.created_at).getTime();
  }

  let promptTokens = 0;
  let completionTokens = 0;
  const modelsUsed = new Set();
  let messageCount = 0;

  let messages = [];
  if (chatData.chat && Array.isArray(chatData.chat.messages)) {
    messages = chatData.chat.messages;
  } else if (Array.isArray(chatData.messages)) {
    messages = chatData.messages;
  } else if (chatData.chat && chatData.chat.history && chatData.chat.history.messages) {
    messages = Object.values(chatData.chat.history.messages);
  }

  if (chatData.models && Array.isArray(chatData.models)) {
    chatData.models.forEach(m => modelsUsed.add(m));
  }
  if (chatData.chat && chatData.chat.models && Array.isArray(chatData.chat.models)) {
    chatData.chat.models.forEach(m => modelsUsed.add(m));
  }

  if (messages.length > 0) {
    messageCount = messages.length;
    for (const msg of messages) {
      if (msg.model) modelsUsed.add(msg.model);
      if (msg.selectedModel) modelsUsed.add(msg.selectedModel);

      const tokens = extractMessageTokens(msg);
      promptTokens += tokens.promptTokens;
      completionTokens += tokens.completionTokens;
    }
  }

  if (promptTokens === 0 && completionTokens === 0) {
    promptTokens = 120;
    completionTokens = 280;
  }

  const modelList = Array.from(modelsUsed);
  const primaryModel = modelList[0] || 'local-model';

  return {
    id,
    title,
    timestamp,
    date: new Date(timestamp).toISOString(),
    primaryModel,
    models: modelList,
    messageCount,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens
  };
}

// Fetch all chats directly from OpenWebUI API
async function fetchFromOpenWebUI(overrideUrl = null, overrideKey = null) {
  const targetUrl = cleanEnv(overrideUrl || OPENWEBUI_URL).replace(/\/+$/, '');
  const targetKey = cleanEnv(overrideKey || OPENWEBUI_API_KEY);

  if (!targetKey) {
    throw new Error('OPENWEBUI_API_KEY is not configured in backend environment or request.');
  }

  const headers = {
    'Authorization': `Bearer ${targetKey}`,
    'Content-Type': 'application/json'
  };

  // 1. Fetch list of chats
  let chatList = [];
  try {
    const listRes = await fetch(`${targetUrl}/api/v1/chats/`, { headers });
    if (listRes.ok) {
      chatList = await listRes.json();
    } else {
      const listRes2 = await fetch(`${targetUrl}/api/chats`, { headers });
      if (listRes2.ok) {
        chatList = await listRes2.json();
      } else {
        throw new Error(`OpenWebUI responded with status ${listRes.status}: ${listRes.statusText}`);
      }
    }
  } catch (err) {
    throw new Error(`Unable to connect to OpenWebUI at ${targetUrl}: ${err.message}`);
  }

  if (!Array.isArray(chatList)) {
    if (chatList && Array.isArray(chatList.chats)) {
      chatList = chatList.chats;
    } else {
      chatList = [];
    }
  }

  // 2. Fetch details for each chat in batches
  const parsedChats = [];
  const batchSize = 10;

  for (let i = 0; i < chatList.length; i += batchSize) {
    const batch = chatList.slice(i, i + batchSize);
    const batchPromises = batch.map(async (chatSummary) => {
      try {
        const detailRes = await fetch(`${targetUrl}/api/v1/chats/${chatSummary.id}`, { headers });
        if (detailRes.ok) {
          const detailData = await detailRes.json();
          return parseSingleChat(detailData || chatSummary);
        }
      } catch (err) {
        // Fallback to summary
      }
      return parseSingleChat(chatSummary);
    });

    const batchResults = await Promise.all(batchPromises);
    for (const res of batchResults) {
      if (res) parsedChats.push(res);
    }
  }

  // Sort newest first
  parsedChats.sort((a, b) => b.timestamp - a.timestamp);

  return parsedChats;
}

// API Routes
app.get('/api/config', (req, res) => {
  res.json({
    isBackendConfigured: !!OPENWEBUI_API_KEY,
    openWebUiUrl: OPENWEBUI_URL,
    hasCache: !!cachedData,
    lastFetchTime: lastFetchTime ? new Date(lastFetchTime).toISOString() : null,
    totalChatsCached: cachedData ? cachedData.length : 0
  });
});

app.get('/api/tokens', async (req, res) => {
  try {
    const now = Date.now();
    const forceRefresh = req.query.refresh === 'true';

    // Serve from cache if valid and not forcing refresh
    if (!forceRefresh && cachedData && lastFetchTime && (now - lastFetchTime < CACHE_TTL_MS)) {
      return res.json({
        source: 'cache',
        lastFetchTime: new Date(lastFetchTime).toISOString(),
        chats: cachedData
      });
    }

    if (isFetching) {
      if (cachedData) {
        return res.json({
          source: 'cache_stale',
          lastFetchTime: new Date(lastFetchTime).toISOString(),
          chats: cachedData
        });
      }
    }

    isFetching = true;

    const chats = await fetchFromOpenWebUI(req.query.url, req.query.key);
    cachedData = chats;
    lastFetchTime = Date.now();
    isFetching = false;

    res.json({
      source: 'live',
      lastFetchTime: new Date(lastFetchTime).toISOString(),
      chats
    });
  } catch (err) {
    isFetching = false;
    console.error('[API Error /api/tokens]:', err.message);
    res.status(500).json({
      error: err.message,
      isBackendConfigured: !!OPENWEBUI_API_KEY,
      openWebUiUrl: OPENWEBUI_URL
    });
  }
});

app.post('/api/refresh', async (req, res) => {
  try {
    const chats = await fetchFromOpenWebUI();
    cachedData = chats;
    lastFetchTime = Date.now();
    res.json({ success: true, count: chats.length, lastFetchTime: new Date(lastFetchTime).toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve frontend static build in production
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`🚀 TokenTill Backend running on port ${PORT}`);
  console.log(`🔗 Target OpenWebUI: ${OPENWEBUI_URL}`);
  console.log(`🔑 API Key Configured: ${OPENWEBUI_API_KEY ? 'YES (Loaded from .env)' : 'NO (Provide in .env or frontend)'}`);
  console.log(`=========================================`);
});
