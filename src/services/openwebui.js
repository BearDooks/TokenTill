/**
 * OpenWebUI Client Service
 * Connects to OpenWebUI instances, retrieves chats & tokens,
 * and parses local token consumption metrics.
 */

/**
 * Normalizes OpenWebUI URL (removes trailing slashes, ensures http/https)
 */
export function normalizeUrl(url) {
  if (!url) return '';
  let trimmed = url.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = 'http://' + trimmed;
  }
  return trimmed;
}

/**
 * Estimate token count from text (~4 characters per token average)
 */
export function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  // Approximation: average 4 chars per token in English/code
  return Math.max(1, Math.ceil(text.length / 3.8));
}

/**
 * Extract token counts from OpenWebUI message object
 */
export function extractMessageTokens(msg) {
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

/**
 * Test connectivity with OpenWebUI
 */
export async function testConnection(baseUrl, apiKey) {
  const cleanUrl = normalizeUrl(baseUrl);
  const headers = {
    'Authorization': `Bearer ${apiKey.trim()}`,
    'Content-Type': 'application/json'
  };

  const endpointsToTry = [
    `${cleanUrl}/api/v1/chats/`,
    `${cleanUrl}/api/v1/chats`,
    `${cleanUrl}/api/v1/models`,
    `${cleanUrl}/api/models`,
    `${cleanUrl}/api/chats`
  ];

  let lastError = null;
  for (const endpoint of endpointsToTry) {
    try {
      const res = await fetch(endpoint, { headers, mode: 'cors' });
      if (res.status === 401 || res.status === 403) {
        throw new Error('Authentication failed. Please check your API key / token.');
      }
      if (res.ok) {
        return { success: true, endpoint };
      }
    } catch (err) {
      lastError = err;
      if (err.message && err.message.includes('Authentication')) {
        throw err;
      }
    }
  }

  // If fetch failed completely (usually CORS or unreachable)
  if (lastError && lastError.name === 'TypeError' && lastError.message.includes('Failed to fetch')) {
    throw new Error('Network / CORS error: Unable to reach OpenWebUI. If running on another port or host, please check CORS settings or load via OpenWebUI Export JSON.');
  }

  throw lastError || new Error('Could not connect to OpenWebUI instance. Please check your URL and Token.');
}

/**
 * Fetch all chats and extract token metrics
 */
export async function fetchAllChatsAndTokens(baseUrl, apiKey, onProgress = () => {}) {
  const cleanUrl = normalizeUrl(baseUrl);
  const headers = {
    'Authorization': `Bearer ${apiKey.trim()}`,
    'Content-Type': 'application/json'
  };

  onProgress({ stage: 'listing', message: 'Retrieving chat list...', percent: 10 });

  // 1. Fetch chat list
  let chatList = [];
  try {
    const res = await fetch(`${cleanUrl}/api/v1/chats/`, { headers });
    if (res.ok) {
      chatList = await res.json();
    } else {
      const res2 = await fetch(`${cleanUrl}/api/chats`, { headers });
      if (res2.ok) chatList = await res2.json();
    }
  } catch (err) {
    throw new Error(`Failed to list chats: ${err.message}`);
  }

  if (!Array.isArray(chatList)) {
    if (chatList && Array.isArray(chatList.chats)) {
      chatList = chatList.chats;
    } else {
      chatList = [];
    }
  }

  onProgress({
    stage: 'processing',
    message: `Found ${chatList.length} chat sessions. Fetching token records...`,
    percent: 25,
    total: chatList.length,
    current: 0
  });

  const parsedChats = [];
  const batchSize = 6;

  for (let i = 0; i < chatList.length; i += batchSize) {
    const batch = chatList.slice(i, i + batchSize);
    const batchPromises = batch.map(async (chatSummary) => {
      try {
        const detailRes = await fetch(`${cleanUrl}/api/v1/chats/${chatSummary.id}`, { headers });
        if (detailRes.ok) {
          const detailData = await detailRes.json();
          return parseSingleChat(detailData || chatSummary);
        }
      } catch (err) {
        console.warn(`Could not fetch details for chat ${chatSummary.id}`, err);
      }
      return parseSingleChat(chatSummary);
    });

    const results = await Promise.all(batchPromises);
    for (const r of results) {
      if (r) parsedChats.push(r);
    }

    const currentCount = Math.min(i + batchSize, chatList.length);
    const percent = Math.round(25 + (currentCount / (chatList.length || 1)) * 70);
    onProgress({
      stage: 'processing',
      message: `Analyzing conversation ${currentCount} / ${chatList.length}...`,
      percent,
      total: chatList.length,
      current: currentCount
    });
  }

  onProgress({ stage: 'completed', message: 'Token data compiled successfully!', percent: 100 });
  return parsedChats;
}

/**
 * Parse an individual chat object (either from API or exported JSON)
 */
export function parseSingleChat(chatData) {
  if (!chatData) return null;

  const id = chatData.id || `chat_${Math.random().toString(36).slice(2, 9)}`;
  const title = chatData.title || (chatData.chat && chatData.chat.title) || 'Untitled Conversation';
  
  // Date calculation
  let timestamp = Date.now();
  if (chatData.updated_at) {
    timestamp = typeof chatData.updated_at === 'number' ? chatData.updated_at * (chatData.updated_at < 1e12 ? 1000 : 1) : new Date(chatData.updated_at).getTime();
  } else if (chatData.created_at) {
    timestamp = typeof chatData.created_at === 'number' ? chatData.created_at * (chatData.created_at < 1e12 ? 1000 : 1) : new Date(chatData.created_at).getTime();
  }

  let promptTokens = 0;
  let completionTokens = 0;
  let modelsUsed = new Set();
  let messageCount = 0;

  // Handle stringified JSON in chatData.chat (e.g. from SQLite / DB)
  let chatObj = chatData.chat;
  if (typeof chatObj === 'string') {
    try {
      chatObj = JSON.parse(chatObj);
    } catch (e) {
      chatObj = null;
    }
  }

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

  // Also check models
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

  // If still 0 tokens and no messages, make default estimation
  if (promptTokens === 0 && completionTokens === 0 && messages.length === 0) {
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

/**
 * Parse an OpenWebUI JSON export file content
 */
export function parseExportJson(jsonContent) {
  let data;
  if (typeof jsonContent === 'string') {
    data = JSON.parse(jsonContent);
  } else {
    data = jsonContent;
  }

  let chatArray = [];
  if (Array.isArray(data)) {
    chatArray = data;
  } else if (data && Array.isArray(data.chats)) {
    chatArray = data.chats;
  } else if (data && typeof data === 'object') {
    // Single chat object or key-value dictionary
    chatArray = Object.values(data);
  }

  const results = [];
  for (const item of chatArray) {
    if (item && (item.id || item.title || item.chat || item.messages)) {
      const parsed = parseSingleChat(item);
      if (parsed) results.push(parsed);
    }
  }

  return results;
}
