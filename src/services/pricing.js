// Provider Definitions
export const PROVIDERS = [
  { id: 'all', name: 'All Companies', badgeColor: '#6366f1' },
  { id: 'Anthropic', name: 'Claude (Anthropic)', badgeColor: '#d97706' },
  { id: 'OpenAI', name: 'ChatGPT (OpenAI)', badgeColor: '#10b981' },
  { id: 'Google', name: 'Gemini (Google)', badgeColor: '#3b82f6' }
];

// Cloud AI Pricing Database (per 1 Million tokens in USD)
export const CLOUD_MODELS = {
  // --- Anthropic (Claude) ---
  'claude-3-7-sonnet': {
    name: 'Claude 3.7 Sonnet',
    company: 'Anthropic',
    provider: 'Anthropic',
    inputCostPer1M: 3.00,
    outputCostPer1M: 15.00,
    badgeColor: '#d97706',
    popular: true,
    tag: 'Latest'
  },
  'claude-3-5-sonnet': {
    name: 'Claude 3.5 Sonnet',
    company: 'Anthropic',
    provider: 'Anthropic',
    inputCostPer1M: 3.00,
    outputCostPer1M: 15.00,
    badgeColor: '#d97706',
    popular: true
  },
  'claude-3-5-haiku': {
    name: 'Claude 3.5 Haiku',
    company: 'Anthropic',
    provider: 'Anthropic',
    inputCostPer1M: 0.80,
    outputCostPer1M: 4.00,
    badgeColor: '#d97706',
    tag: 'Fast'
  },
  'claude-3-opus': {
    name: 'Claude 3 Opus',
    company: 'Anthropic',
    provider: 'Anthropic',
    inputCostPer1M: 15.00,
    outputCostPer1M: 75.00,
    badgeColor: '#b45309'
  },

  // --- OpenAI (ChatGPT) ---
  'gpt-4o': {
    name: 'ChatGPT (GPT-4o)',
    company: 'OpenAI',
    provider: 'OpenAI',
    inputCostPer1M: 2.50,
    outputCostPer1M: 10.00,
    badgeColor: '#10b981',
    popular: true,
    tag: 'Flagship'
  },
  'gpt-4o-mini': {
    name: 'ChatGPT (GPT-4o mini)',
    company: 'OpenAI',
    provider: 'OpenAI',
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.60,
    badgeColor: '#10b981',
    popular: true,
    tag: 'Efficient'
  },
  'openai-o3-mini': {
    name: 'OpenAI o3-mini',
    company: 'OpenAI',
    provider: 'OpenAI',
    inputCostPer1M: 1.10,
    outputCostPer1M: 4.40,
    badgeColor: '#10b981',
    tag: 'Reasoning'
  },
  'openai-o1': {
    name: 'OpenAI o1',
    company: 'OpenAI',
    provider: 'OpenAI',
    inputCostPer1M: 15.00,
    outputCostPer1M: 60.00,
    badgeColor: '#059669',
    tag: 'Deep Think'
  },
  'gpt-4-5-preview': {
    name: 'GPT-4.5 Preview',
    company: 'OpenAI',
    provider: 'OpenAI',
    inputCostPer1M: 75.00,
    outputCostPer1M: 150.00,
    badgeColor: '#059669',
    tag: 'Research'
  },
  'gpt-4-turbo': {
    name: 'GPT-4 Turbo',
    company: 'OpenAI',
    provider: 'OpenAI',
    inputCostPer1M: 10.00,
    outputCostPer1M: 30.00,
    badgeColor: '#059669'
  },

  // --- Google (Gemini) ---
  'gemini-3-7-flash': {
    name: 'Gemini 3.7 Flash',
    company: 'Google',
    provider: 'Google',
    inputCostPer1M: 0.75,
    outputCostPer1M: 3.75,
    badgeColor: '#3b82f6',
    popular: true,
    tag: 'Latest 3.x'
  },
  'gemini-3-1-pro': {
    name: 'Gemini 3.1 Pro',
    company: 'Google',
    provider: 'Google',
    inputCostPer1M: 1.25,
    outputCostPer1M: 5.00,
    badgeColor: '#3b82f6',
    popular: true,
    tag: 'Flagship 3.x'
  },
  'gemini-3-5-flash': {
    name: 'Gemini 3.5 Flash',
    company: 'Google',
    provider: 'Google',
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.60,
    badgeColor: '#3b82f6',
    tag: 'Workhorse'
  },
  'gemini-3-5-flash-lite': {
    name: 'Gemini 3.5 Flash-Lite',
    company: 'Google',
    provider: 'Google',
    inputCostPer1M: 0.075,
    outputCostPer1M: 0.30,
    badgeColor: '#3b82f6',
    tag: 'Efficient'
  },
  'gemini-2-0-flash': {
    name: 'Gemini 2.0 Flash',
    company: 'Google',
    provider: 'Google',
    inputCostPer1M: 0.10,
    outputCostPer1M: 0.40,
    badgeColor: '#3b82f6'
  },
  'gemini-1-5-pro': {
    name: 'Gemini 1.5 Pro',
    company: 'Google',
    provider: 'Google',
    inputCostPer1M: 1.25,
    outputCostPer1M: 5.00,
    badgeColor: '#3b82f6'
  }
};

/**
 * Calculates the total cost for given input and output token counts for a model.
 */
export function calculateModelCost(promptTokens, completionTokens, modelKey, customRates = null) {
  let inputRate = 2.50;
  let outputRate = 10.00;

  if (modelKey === 'custom' && customRates) {
    inputRate = Number(customRates.inputRate) || 0;
    outputRate = Number(customRates.outputRate) || 0;
  } else if (CLOUD_MODELS[modelKey]) {
    inputRate = CLOUD_MODELS[modelKey].inputCostPer1M;
    outputRate = CLOUD_MODELS[modelKey].outputCostPer1M;
  }

  const promptCost = (promptTokens / 1_000_000) * inputRate;
  const completionCost = (completionTokens / 1_000_000) * outputRate;

  return {
    promptCost,
    completionCost,
    totalCost: promptCost + completionCost
  };
}

/**
 * Calculates cost comparison across all supported models.
 */
export function calculateAllModelCosts(promptTokens, completionTokens, customRates = null) {
  const results = {};
  for (const [key, model] of Object.entries(CLOUD_MODELS)) {
    const cost = calculateModelCost(promptTokens, completionTokens, key);
    results[key] = {
      ...model,
      ...cost
    };
  }

  if (customRates) {
    const customCost = calculateModelCost(promptTokens, completionTokens, 'custom', customRates);
    results['custom'] = {
      name: customRates.name || 'Custom Rates',
      company: 'Custom',
      provider: 'Custom',
      inputCostPer1M: customRates.inputRate,
      outputCostPer1M: customRates.outputRate,
      badgeColor: '#ec4899',
      ...customCost
    };
  }

  return results;
}
