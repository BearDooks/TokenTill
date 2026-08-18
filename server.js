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
const MASK_USER_NAMES = cleanEnv(process.env.MASK_USER_NAMES, 'false').toLowerCase() === 'true';
const MASK_CHAT_TITLES = cleanEnv(process.env.MASK_CHAT_TITLES, 'false').toLowerCase() === 'true';

app.use(cors());
app.use(express.json());

// In-Memory Cache
let cachedData = null;
let lastFetchTime = null;
let isFetching = false;

// Privacy Helper: Mask User Name (e.g., "Chuck Lindblom" -> "Ch*** L******", "root@local.net" -> "ro***@l***.net")
function maskUserName(name) {
  if (!name || typeof name !== 'string') return 'Anonymous';
  if (!MASK_USER_NAMES) return name;

  // Handle email addresses
  if (name.includes('@')) {
    const [user, domain] = name.split('@');
    const maskedUser = user.length > 2 ? user.slice(0, 2) + '***' : user[0] + '***';
    const domainParts = domain.split('.');
    const maskedDomain = domainParts[0].length > 1 ? domainParts[0][0] + '***' : '***';
    const tld = domainParts.slice(1).join('.');
    return `${maskedUser}@${maskedDomain}.${tld}`;
  }

  // Handle standard names (e.g. "Chuck Lindblom" -> "Ch*** L******")
  return name
    .split(/\s+/)
    .map(word => {
      if (word.length <= 2) return word[0] + '*';
      return word.slice(0, 2) + '*'.repeat(Math.min(6, Math.max(3, word.length - 2)));
    })
    .join(' ');
}

// Privacy Helper: Mask Chat Title (keeps first word, masks the rest for privacy)
function maskChatTitle(title) {
  if (!title || typeof title !== 'string') return 'Untitled';
  if (!MASK_CHAT_TITLES) return title;

  const words = title.trim().split(/\s+/);
  if (words.length <= 1) {
    return words[0].slice(0, 4) + '••••';
  }

  // Keep first word (topic category) and mask subsequent private content
  const firstWord = words[0];
  return `${firstWord} •••••••••`;
}

// Helper: Estimate token count (~4 chars per token)
function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  return Math.max(1, Math.ceil(text.length / 3.8));
}

// Helper: Extract token counts from message object
function extractMessageTokens(msg) {
  if (!msg || typeof msg !== 'object') return { promptTokens: 0, completionTokens: 0 };

  let promptTokens = 0;
  let completionTokens = 0;

  // 1. Check msg.info (OpenWebUI / Ollama / llama.cpp standard)
  if (msg.info && typeof msg.info === 'object') {
    if (msg.info.prompt_eval_count !== undefined) promptTokens = Number(msg.info.prompt_eval_count) || 0;
    if (msg.info.eval_count !== undefined) completionTokens = Number(msg.info.eval_count) || 0;
    if (msg.info.promptEvalCount !== undefined) promptTokens = promptTokens || (Number(msg.info.promptEvalCount) || 0);
    if (msg.info.evalCount !== undefined) completionTokens = completionTokens || (Number(msg.info.evalCount) || 0);
    if (msg.info.prompt_tokens !== undefined) promptTokens = promptTokens || (Number(msg.info.prompt_tokens) || 0);
    if (msg.info.completion_tokens !== undefined) completionTokens = completionTokens || (Number(msg.info.completion_tokens) || 0);

    if (msg.info.usage && typeof msg.info.usage === 'object') {
      promptTokens = promptTokens || Number(msg.info.usage.prompt_tokens || msg.info.usage.prompt_eval_count || 0);
      completionTokens = completionTokens || Number(msg.info.usage.completion_tokens || msg.info.usage.eval_count || 0);
    }
  }

  // 2. Check msg.usage (OpenAI / LiteLLM / generic format)
  if (msg.usage && typeof msg.usage === 'object') {
    promptTokens = promptTokens || Number(msg.usage.prompt_tokens || msg.usage.prompt_eval_count || 0);
    completionTokens = completionTokens || Number(msg.usage.completion_tokens || msg.usage.eval_count || 0);
  }

  // 3. Check direct properties on msg
  if (msg.prompt_eval_count !== undefined) promptTokens = promptTokens || Number(msg.prompt_eval_count) || 0;
  if (msg.eval_count !== undefined) completionTokens = completionTokens || Number(msg.eval_count) || 0;
  if (msg.prompt_tokens !== undefined) promptTokens = promptTokens || Number(msg.prompt_tokens) || 0;
  if (msg.completion_tokens !== undefined) completionTokens = completionTokens || Number(msg.completion_tokens) || 0;

  // 4. Check msg.meta / msg.metadata
  const meta = msg.meta || msg.metadata;
  if (meta && typeof meta === 'object') {
    promptTokens = promptTokens || Number(meta.prompt_eval_count || meta.prompt_tokens || meta.usage?.prompt_tokens || 0);
    completionTokens = completionTokens || Number(meta.eval_count || meta.completion_tokens || meta.usage?.completion_tokens || 0);
  }

  // 5. Fallback estimation from content text if tokens are 0
  const role = (msg.role || '').toLowerCase();
  let text = '';
  if (typeof msg.content === 'string') {
    text = msg.content;
  } else if (Array.isArray(msg.content)) {
    text = msg.content.map(part => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && part.text) return part.text;
      return '';
    }).join(' ');
  } else if (typeof msg.text === 'string') {
    text = msg.text;
  } else if (typeof msg.response === 'string') {
    text = msg.response;
  }

  if (text && text.trim().length > 0) {
    const estimated = estimateTokens(text);
    if (role === 'user' || role === 'system') {
      if (promptTokens === 0) promptTokens = estimated;
    } else {
      if (completionTokens === 0) completionTokens = estimated;
    }
  }

  return { promptTokens, completionTokens };
}

// Helper: Parse a single chat object
function parseSingleChat(chatData, userMap = {}) {
  if (!chatData) return null;

  // Handle stringified JSON in chatData.chat (e.g. from SQLite / DB)
  let chatObj = chatData.chat;
  if (typeof chatObj === 'string') {
    try {
      chatObj = JSON.parse(chatObj);
    } catch (e) {
      chatObj = null;
    }
  }

  const id = chatData.id || (chatObj && chatObj.id) || `chat_${Math.random().toString(36).slice(2, 9)}`;
  const rawTitle = chatData.title || (chatObj && chatObj.title) || 'Untitled Conversation';
  const title = maskChatTitle(rawTitle);
  const userId = chatData.user_id || (chatObj && chatObj.user_id) || (chatData.user && chatData.user.id) || 'unknown';

  const userObj = userMap[userId] || (chatData.user ? { name: chatData.user.name, email: chatData.user.email } : null);
  const rawUserName = userObj ? userObj.name : (userId === 'unknown' ? 'Default User' : `User (${userId.slice(0, 6)})`);
  const userName = maskUserName(rawUserName);
  const userEmail = userObj ? userObj.email : '';

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

  // Extract messages - check OpenWebUI history dictionary first (full conversation tree)
  let messages = [];
  if (chatObj && chatObj.history && chatObj.history.messages && typeof chatObj.history.messages === 'object') {
    messages = Object.values(chatObj.history.messages);
  } else if (chatData.history && chatData.history.messages && typeof chatData.history.messages === 'object') {
    messages = Object.values(chatData.history.messages);
  }

  if (messages.length === 0) {
    if (chatObj && Array.isArray(chatObj.messages)) {
      messages = chatObj.messages;
    } else if (Array.isArray(chatData.messages)) {
      messages = chatData.messages;
    }
  } else if (chatObj && Array.isArray(chatObj.messages) && chatObj.messages.length > messages.length) {
    messages = chatObj.messages;
  }

  if (chatData.models && Array.isArray(chatData.models)) {
    chatData.models.forEach(m => m && modelsUsed.add(m));
  }
  if (chatObj && chatObj.models && Array.isArray(chatObj.models)) {
    chatObj.models.forEach(m => m && modelsUsed.add(m));
  }
  if (chatObj && chatObj.model) {
    modelsUsed.add(chatObj.model);
  }

  if (messages.length > 0) {
    messageCount = messages.length;
    for (const msg of messages) {
      if (msg.model) modelsUsed.add(msg.model);
      if (msg.selectedModel) modelsUsed.add(msg.selectedModel);
      if (msg.info && msg.info.model) modelsUsed.add(msg.info.model);

      const tokens = extractMessageTokens(msg);
      promptTokens += tokens.promptTokens;
      completionTokens += tokens.completionTokens;
    }
  }

  if (promptTokens === 0 && completionTokens === 0 && messages.length === 0) {
    promptTokens = 120;
    completionTokens = 280;
  }

  const modelList = Array.from(modelsUsed);
  const primaryModel = modelList[0] || 'local-model';

  return {
    id,
    title,
    userId,
    userName,
    userEmail,
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

// Fetch all chats directly from OpenWebUI API (Supports Admin All-Chats & Multi-User)
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

  // 1. Fetch Users map
  const userMap = {};
  try {
    const usersRes = await fetch(`${targetUrl}/api/v1/users/`, { headers });
    if (usersRes.ok) {
      const usersData = await usersRes.json();
      const userList = Array.isArray(usersData) ? usersData : (usersData.users || []);
      for (const u of userList) {
        if (u && u.id) {
          const rawName = u.name || u.email || 'User';
          userMap[u.id] = { id: u.id, name: maskUserName(rawName), rawName, email: u.email, role: u.role };
        }
      }
    }
  } catch (err) {
    console.warn('[OpenWebUI Users API]: Could not fetch users list:', err.message);
  }

  // 2. Try Admin All-Chats endpoint (/api/v1/chats/all/db)
  let parsedChats = [];
  let fetchedViaAdminDb = false;

  try {
    const allDbRes = await fetch(`${targetUrl}/api/v1/chats/all/db`, { headers });
    if (allDbRes.ok) {
      const allDbData = await allDbRes.json();
      if (Array.isArray(allDbData)) {
        parsedChats = allDbData.map(c => parseSingleChat(c, userMap)).filter(Boolean);
        fetchedViaAdminDb = true;
        console.log(`[OpenWebUI Sync]: Successfully fetched ${parsedChats.length} chats across all users via admin /api/v1/chats/all/db`);
      }
    }
  } catch (err) {
    console.warn('[OpenWebUI Admin API]: /api/v1/chats/all/db failed, trying fallback:', err.message);
  }

  // 3. Fallback to standard chats listing if admin DB endpoint wasn't available
  if (!fetchedViaAdminDb) {
    let chatList = [];
    try {
      const listRes = await fetch(`${targetUrl}/api/v1/chats/`, { headers });
      if (listRes.ok) {
        chatList = await listRes.json();
      } else {
        const listRes2 = await fetch(`${targetUrl}/api/chats`, { headers });
        if (listRes2.ok) {
          chatList = await listRes2.json();
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

    const batchSize = 10;
    for (let i = 0; i < chatList.length; i += batchSize) {
      const batch = chatList.slice(i, i + batchSize);
      const batchPromises = batch.map(async (chatSummary) => {
        try {
          const detailRes = await fetch(`${targetUrl}/api/v1/chats/${chatSummary.id}`, { headers });
          if (detailRes.ok) {
            const detailData = await detailRes.json();
            return parseSingleChat(detailData || chatSummary, userMap);
          }
        } catch (err) {
          // Fallback to summary
        }
        return parseSingleChat(chatSummary, userMap);
      });

      const batchResults = await Promise.all(batchPromises);
      for (const res of batchResults) {
        if (res) parsedChats.push(res);
      }
    }
  }

  // Sort newest first
  parsedChats.sort((a, b) => b.timestamp - a.timestamp);

  const usersArray = Object.values(userMap);

  return {
    chats: parsedChats,
    users: usersArray,
    totalUsers: usersArray.length
  };
}

// API Routes
app.get('/api/config', (req, res) => {
  res.json({
    isBackendConfigured: !!OPENWEBUI_API_KEY,
    openWebUiUrl: OPENWEBUI_URL,
    maskUserNames: MASK_USER_NAMES,
    maskChatTitles: MASK_CHAT_TITLES,
    hasCache: !!cachedData,
    lastFetchTime: lastFetchTime ? new Date(lastFetchTime).toISOString() : null,
    totalChatsCached: cachedData ? (cachedData.chats ? cachedData.chats.length : cachedData.length) : 0
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
        chats: cachedData.chats || cachedData,
        users: cachedData.users || []
      });
    }

    if (isFetching && cachedData) {
      return res.json({
        source: 'cache_stale',
        lastFetchTime: new Date(lastFetchTime).toISOString(),
        chats: cachedData.chats || cachedData,
        users: cachedData.users || []
      });
    }

    const data = await fetchFromOpenWebUI(req.query.url, req.query.key);
    cachedData = data;
    lastFetchTime = Date.now();
    isFetching = false;

    res.json({
      source: 'live',
      lastFetchTime: new Date(lastFetchTime).toISOString(),
      chats: data.chats,
      users: data.users
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
  console.log(`🔑 API Key Configured: ${OPENWEBUI_API_KEY ? 'YES (Loaded from .env / Docker)' : 'NO (Provide in .env or frontend)'}`);
  console.log(`🔒 Privacy Masking: Users=${MASK_USER_NAMES ? 'ON' : 'OFF'}, Chat Titles=${MASK_CHAT_TITLES ? 'ON' : 'OFF'}`);
  console.log(`=========================================`);
});
