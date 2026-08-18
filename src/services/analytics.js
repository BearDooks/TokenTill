import { calculateModelCost, calculateAllModelCosts } from './pricing.js';

/**
 * Aggregates all token usage statistics and cost savings
 */
export function computeAnalytics(chats, selectedBaseline = 'claude-3-5-sonnet', customRates = null) {
  if (!chats || chats.length === 0) {
    return {
      totalChats: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalTokens: 0,
      savingsVsSelected: 0,
      avgTokensPerChat: 0,
      avgSavingsPerChat: 0,
      dateRange: { start: null, end: null },
      modelUsage: {},
      dailyTimeline: [],
      modelComparison: {},
      topChats: []
    };
  }

  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  const modelUsage = {};
  const dailyMap = new Map(); // key: 'YYYY-MM-DD' => { promptTokens, completionTokens, chatsCount }

  // Sort chronological for timeline
  const sortedChronological = [...chats].sort((a, b) => a.timestamp - b.timestamp);

  sortedChronological.forEach(chat => {
    totalPromptTokens += chat.promptTokens;
    totalCompletionTokens += chat.completionTokens;

    // Track model distribution
    const model = chat.primaryModel || 'unknown';
    if (!modelUsage[model]) {
      modelUsage[model] = {
        name: model,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        chatCount: 0
      };
    }
    modelUsage[model].promptTokens += chat.promptTokens;
    modelUsage[model].completionTokens += chat.completionTokens;
    modelUsage[model].totalTokens += chat.totalTokens;
    modelUsage[model].chatCount += 1;

    // Track daily timeline
    const dateKey = new Date(chat.timestamp).toISOString().split('T')[0];
    if (!dailyMap.has(dateKey)) {
      dailyMap.set(dateKey, { date: dateKey, promptTokens: 0, completionTokens: 0, totalTokens: 0, chats: 0 });
    }
    const dayObj = dailyMap.get(dateKey);
    dayObj.promptTokens += chat.promptTokens;
    dayObj.completionTokens += chat.completionTokens;
    dayObj.totalTokens += chat.totalTokens;
    dayObj.chats += 1;
  });

  const totalTokens = totalPromptTokens + totalCompletionTokens;
  const totalChats = chats.length;

  // Calculate savings vs selected baseline model
  const selectedCost = calculateModelCost(totalPromptTokens, totalCompletionTokens, selectedBaseline, customRates);
  const savingsVsSelected = selectedCost.totalCost;

  // Calculate comparison across all models
  const modelComparison = calculateAllModelCosts(totalPromptTokens, totalCompletionTokens, customRates);

  // Build cumulative timeline for charts
  let runningPromptTokens = 0;
  let runningCompletionTokens = 0;
  const dailyTimeline = [];

  for (const [date, val] of dailyMap.entries()) {
    runningPromptTokens += val.promptTokens;
    runningCompletionTokens += val.completionTokens;
    
    const dayCost = calculateModelCost(val.promptTokens, val.completionTokens, selectedBaseline, customRates);
    const cumCost = calculateModelCost(runningPromptTokens, runningCompletionTokens, selectedBaseline, customRates);

    dailyTimeline.push({
      date,
      dayPromptTokens: val.promptTokens,
      dayCompletionTokens: val.completionTokens,
      dayTotalTokens: val.totalTokens,
      daySavings: dayCost.totalCost,
      cumulativePromptTokens: runningPromptTokens,
      cumulativeCompletionTokens: runningCompletionTokens,
      cumulativeTotalTokens: runningPromptTokens + runningCompletionTokens,
      cumulativeSavings: cumCost.totalCost,
      chatsCount: val.chats
    });
  }

  // Identify top token-intensive chats
  const topChats = [...chats]
    .sort((a, b) => b.totalTokens - a.totalTokens)
    .slice(0, 10)
    .map(c => {
      const cost = calculateModelCost(c.promptTokens, c.completionTokens, selectedBaseline, customRates);
      return {
        ...c,
        calculatedSavings: cost.totalCost
      };
    });

  const startTimestamp = sortedChronological[0].timestamp;
  const endTimestamp = sortedChronological[sortedChronological.length - 1].timestamp;

  return {
    totalChats,
    totalPromptTokens,
    totalCompletionTokens,
    totalTokens,
    savingsVsSelected,
    selectedCostBreakdown: selectedCost,
    avgTokensPerChat: Math.round(totalTokens / (totalChats || 1)),
    avgSavingsPerChat: savingsVsSelected / (totalChats || 1),
    dateRange: {
      start: new Date(startTimestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
      end: new Date(endTimestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
      daysSpan: Math.max(1, Math.round((endTimestamp - startTimestamp) / (86400 * 1000)))
    },
    modelUsage,
    dailyTimeline,
    modelComparison,
    topChats
  };
}
