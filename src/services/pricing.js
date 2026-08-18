// Cloud AI Pricing Database (per 1 Million tokens in USD)
export const CLOUD_MODELS = {
  // Anthropic Claude
  'claude-3-7-sonnet': {
    name: 'Claude 3.7 Sonnet',
    provider: 'Anthropic',
    inputCostPer1M: 3.00,
    outputCostPer1M: 15.00,
    badgeColor: '#d97706',
    popular: true
  },
  'claude-3-5-sonnet': {
    name: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
    inputCostPer1M: 3.00,
    outputCostPer1M: 15.00,
    badgeColor: '#d97706',
    popular: true
  },
  'claude-3-5-haiku': {
    name: 'Claude 3.5 Haiku',
    provider: 'Anthropic',
    inputCostPer1M: 0.80,
    outputCostPer1M: 4.00,
    badgeColor: '#d97706'
  },
  'claude-3-opus': {
    name: 'Claude 3 Opus',
    provider: 'Anthropic',
    inputCostPer1M: 15.00,
    outputCostPer1M: 75.00,
    badgeColor: '#b45309'
  },

  // OpenAI ChatGPT
  'gpt-4o': {
    name: 'ChatGPT (GPT-4o)',
    provider: 'OpenAI',
    inputCostPer1M: 2.50,
    outputCostPer1M: 10.00,
    badgeColor: '#10b981',
    popular: true
  },
  'gpt-4o-mini': {
    name: 'ChatGPT (GPT-4o mini)',
    provider: 'OpenAI',
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.60,
    badgeColor: '#10b981',
    popular: true
  },
  'gpt-4-turbo': {
    name: 'GPT-4 Turbo',
    provider: 'OpenAI',
    inputCostPer1M: 10.00,
    outputCostPer1M: 30.00,
    badgeColor: '#059669'
  },
  'openai-o1': {
    name: 'OpenAI o1',
    provider: 'OpenAI',
    inputCostPer1M: 15.00,
    outputCostPer1M: 60.00,
    badgeColor: '#059669'
  },
  'openai-o3-mini': {
    name: 'OpenAI o3-mini',
    provider: 'OpenAI',
    inputCostPer1M: 1.10,
    outputCostPer1M: 4.40,
    badgeColor: '#10b981'
  },

  // Google Gemini
  'gemini-1-5-pro': {
    name: 'Gemini 1.5 Pro',
    provider: 'Google',
    inputCostPer1M: 1.25,
    outputCostPer1M: 5.00,
    badgeColor: '#3b82f6'
  },
  'gemini-2-0-flash': {
    name: 'Gemini 2.0 Flash',
    provider: 'Google',
    inputCostPer1M: 0.10,
    outputCostPer1M: 0.40,
    badgeColor: '#3b82f6'
  },

  // DeepSeek Cloud
  'deepseek-r1-cloud': {
    name: 'DeepSeek-R1 (API)',
    provider: 'DeepSeek',
    inputCostPer1M: 0.55,
    outputCostPer1M: 2.19,
    badgeColor: '#8b5cf6'
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
      provider: 'Custom',
      inputCostPer1M: customRates.inputRate,
      outputCostPer1M: customRates.outputRate,
      badgeColor: '#ec4899',
      ...customCost
    };
  }

  return results;
}
