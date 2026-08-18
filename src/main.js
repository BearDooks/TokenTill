import { createIcons, icons } from 'lucide';
import { Chart, registerables } from 'chart.js';
import confetti from 'canvas-confetti';
import { CLOUD_MODELS, calculateModelCost, calculateAllModelCosts } from './services/pricing.js';
import { parseExportJson } from './services/openwebui.js';
import { computeAnalytics } from './services/analytics.js';

Chart.register(...registerables);

// Application State
let appState = {
  allChats: [], // Complete master history from OpenWebUI
  chats: [],    // Filtered by active time range
  timeRange: 'all', // 'all' | 'today' | '7d' | '30d' | 'custom'
  companyFilter: 'all', // 'all' | 'Anthropic' | 'OpenAI' | 'Google'
  customStartDate: '',
  customEndDate: '',
  selectedBaseline: 'claude-3-7-sonnet',
  customRates: {
    name: 'Custom Model',
    inputRate: 3.00,
    outputRate: 15.00
  },
  serverUrl: localStorage.getItem('owui_url') || 'http://localhost:3000',
  apiKey: localStorage.getItem('owui_key') || '',
  searchTerm: '',
  modelFilter: 'all',
  isBackendConfigured: false,
  lastSyncTime: null
};

// Chart instances
let savingsTimelineChart = null;
let modelDistributionChart = null;
let cloudCostBarChart = null;
let dailyTokensBarChart = null;

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  initLucideIcons();
  initTimeRangeDefaults();
  initEventListeners();
  renderModelPills();
  
  // Check backend configuration on startup
  await checkBackendStatusAndLoad();
});

function initLucideIcons() {
  createIcons({ icons });
}

function initTimeRangeDefaults() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - (30 * 86400 * 1000));
  
  const endInput = document.getElementById('input-date-end');
  const startInput = document.getElementById('input-date-start');

  const formatDate = (d) => d.toISOString().split('T')[0];

  if (endInput && startInput) {
    endInput.value = formatDate(now);
    startInput.value = formatDate(thirtyDaysAgo);
    appState.customEndDate = endInput.value;
    appState.customStartDate = startInput.value;
  }
}

function initEventListeners() {
  // Sync Now Button
  const syncBtn = document.getElementById('btn-sync-now');
  syncBtn.addEventListener('click', async () => {
    await fetchTokenData(true);
  });

  // Time Range Filter Buttons
  const timeButtons = document.querySelectorAll('#time-range-buttons .time-pill-btn');
  const customControls = document.getElementById('custom-date-controls');

  timeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      timeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const range = btn.getAttribute('data-range');
      appState.timeRange = range;

      if (range === 'custom') {
        customControls.classList.add('active');
      } else {
        customControls.classList.remove('active');
        applyTimeFilter();
      }
    });
  });

  // Company Filter Buttons (Claude, ChatGPT, Gemini)
  const companyButtons = document.querySelectorAll('#company-filter-buttons .time-pill-btn');
  companyButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      companyButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      appState.companyFilter = btn.getAttribute('data-company');
      renderModelPills();
    });
  });

  // Apply Custom Date Range
  const applyCustomBtn = document.getElementById('btn-apply-custom-date');
  if (applyCustomBtn) {
    applyCustomBtn.addEventListener('click', () => {
      const startVal = document.getElementById('input-date-start').value;
      const endVal = document.getElementById('input-date-end').value;

      if (!startVal || !endVal) {
        alert('Please pick both a Start Date and End Date.');
        return;
      }

      appState.customStartDate = startVal;
      appState.customEndDate = endVal;
      applyTimeFilter();
    });
  }

  // Manual Connection Form (Fallback if not in .env)
  const form = document.getElementById('connection-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const url = document.getElementById('input-server-url').value.trim();
      const key = document.getElementById('input-api-key').value.trim();

      appState.serverUrl = url;
      appState.apiKey = key;
      localStorage.setItem('owui_url', url);
      if (key) localStorage.setItem('owui_key', key);

      await fetchTokenData(true, url, key);
    });
  }

  // Export JSON Import
  const fileInput = document.getElementById('file-export-input');
  fileInput.addEventListener('change', handleFileImport);

  // Search & Filter in Table
  const searchInput = document.getElementById('input-chat-search');
  searchInput.addEventListener('input', (e) => {
    appState.searchTerm = e.target.value.toLowerCase();
    renderTable();
  });

  const modelFilter = document.getElementById('select-model-filter');
  modelFilter.addEventListener('change', (e) => {
    appState.modelFilter = e.target.value;
    renderTable();
  });

  // Custom Pricing Modal
  const openModalBtn = document.getElementById('btn-open-custom-modal');
  const closeModalBtn = document.getElementById('btn-close-modal');
  const modal = document.getElementById('modal-custom-pricing');
  const customForm = document.getElementById('form-custom-pricing');

  openModalBtn.addEventListener('click', () => {
    document.getElementById('custom-model-name').value = appState.customRates.name;
    document.getElementById('custom-input-rate').value = appState.customRates.inputRate;
    document.getElementById('custom-output-rate').value = appState.customRates.outputRate;
    modal.classList.add('active');
  });

  closeModalBtn.addEventListener('click', () => {
    modal.classList.remove('active');
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('active');
  });

  customForm.addEventListener('submit', (e) => {
    e.preventDefault();
    appState.customRates = {
      name: document.getElementById('custom-model-name').value.trim() || 'Custom Model',
      inputRate: parseFloat(document.getElementById('custom-input-rate').value) || 0,
      outputRate: parseFloat(document.getElementById('custom-output-rate').value) || 0
    };
    appState.selectedBaseline = 'custom';
    modal.classList.remove('active');
    renderModelPills();
    updateDashboard();
  });
}

/**
 * Filter Master History by Time Range
 */
function applyTimeFilter() {
  const master = appState.allChats;
  const range = appState.timeRange;
  const indicator = document.getElementById('active-range-indicator');

  if (!master || master.length === 0) {
    appState.chats = [];
    if (indicator) indicator.textContent = 'No data loaded';
    updateDashboard();
    return;
  }

  const now = Date.now();
  let filtered = [];
  let label = '';

  if (range === 'all') {
    filtered = [...master];
    label = `Showing all ${filtered.length} conversations (All Time)`;
  } else if (range === 'today') {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startMs = startOfToday.getTime();
    filtered = master.filter(c => c.timestamp >= startMs);
    label = `Showing ${filtered.length} conversation(s) from Today`;
  } else if (range === '7d') {
    const cutoff = now - (7 * 86400 * 1000);
    filtered = master.filter(c => c.timestamp >= cutoff);
    label = `Showing ${filtered.length} conversation(s) from the Last 7 Days`;
  } else if (range === '30d') {
    const cutoff = now - (30 * 86400 * 1000);
    filtered = master.filter(c => c.timestamp >= cutoff);
    label = `Showing ${filtered.length} conversation(s) from the Last 30 Days`;
  } else if (range === 'custom') {
    const startMs = appState.customStartDate ? new Date(appState.customStartDate + 'T00:00:00').getTime() : 0;
    const endMs = appState.customEndDate ? new Date(appState.customEndDate + 'T23:59:59').getTime() : Infinity;
    filtered = master.filter(c => c.timestamp >= startMs && c.timestamp <= endMs);
    label = `Showing ${filtered.length} conversation(s) between ${appState.customStartDate} and ${appState.customEndDate}`;
  }

  appState.chats = filtered;
  if (indicator) indicator.textContent = label;
  updateDashboard();
}

/**
 * Check backend configuration status & auto-load
 */
async function checkBackendStatusAndLoad() {
  const configuredView = document.getElementById('backend-configured-view');
  const unconfiguredView = document.getElementById('backend-unconfigured-view');
  const targetUrlSpan = document.getElementById('target-instance-url');

  try {
    updateConnectionBadge('syncing', 'Checking Backend...');
    const res = await fetch('/api/config');
    if (res.ok) {
      const config = await res.json();
      appState.isBackendConfigured = config.isBackendConfigured;
      
      if (config.openWebUiUrl) {
        targetUrlSpan.textContent = config.openWebUiUrl;
      }

      if (config.isBackendConfigured) {
        configuredView.style.display = 'block';
        unconfiguredView.style.display = 'none';
        updateConnectionBadge('connected', 'Self-Hosted Active');
        
        // Auto-fetch data immediately
        await fetchTokenData(false);
        return;
      }
    }
  } catch (err) {
    console.warn('Backend /api/config check error:', err);
  }

  // If backend not configured with env vars, show manual form or check localStorage
  configuredView.style.display = 'none';
  unconfiguredView.style.display = 'block';
  updateConnectionBadge('disconnected', 'API Key Required');

  const storedUrl = localStorage.getItem('owui_url');
  const storedKey = localStorage.getItem('owui_key');
  if (storedUrl && storedKey) {
    await fetchTokenData(false, storedUrl, storedKey);
  } else {
    updateDashboard();
  }
}

/**
 * Fetch token data from backend endpoint
 */
async function fetchTokenData(forceRefresh = false, overrideUrl = null, overrideKey = null) {
  const syncBtnText = document.getElementById('sync-button-text');
  const syncIcon = document.getElementById('sync-icon');
  const syncContainer = document.getElementById('sync-container');
  const syncFill = document.getElementById('sync-progress-fill');
  const syncMsg = document.getElementById('sync-status-msg');
  const syncPercent = document.getElementById('sync-percent-text');
  const lastSyncSpan = document.getElementById('last-sync-time');

  try {
    syncBtnText.textContent = 'Syncing...';
    if (syncIcon) syncIcon.classList.add('lucide-spin');
    syncContainer.style.display = 'block';
    syncFill.style.width = '30%';
    syncMsg.textContent = 'Connecting to OpenWebUI instance...';
    syncPercent.textContent = '30%';

    let queryParams = [];
    if (forceRefresh) queryParams.push('refresh=true');
    if (overrideUrl) queryParams.push(`url=${encodeURIComponent(overrideUrl)}`);
    if (overrideKey) queryParams.push(`key=${encodeURIComponent(overrideKey)}`);
    
    const queryString = queryParams.length ? `?${queryParams.join('&')}` : '';

    syncFill.style.width = '60%';
    syncMsg.textContent = 'Retrieving chats and calculating tokens...';
    syncPercent.textContent = '60%';

    const response = await fetch(`/api/tokens${queryString}`);
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Server responded with ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    appState.allChats = data.chats || [];
    appState.lastSyncTime = data.lastFetchTime ? new Date(data.lastFetchTime) : new Date();

    syncFill.style.width = '100%';
    syncMsg.textContent = `Completed! Synced ${appState.allChats.length} total chat sessions.`;
    syncPercent.textContent = '100%';

    if (lastSyncSpan) {
      lastSyncSpan.textContent = appState.lastSyncTime.toLocaleTimeString();
    }

    updateConnectionBadge('connected', `Live (${appState.allChats.length} chats)`);
    
    // Apply currently selected time filter
    applyTimeFilter();

    if (forceRefresh) {
      triggerCelebration();
    }

    setTimeout(() => {
      syncContainer.style.display = 'none';
    }, 1800);
  } catch (err) {
    console.error('Fetch error:', err);
    updateConnectionBadge('disconnected', 'Sync Error');
    syncContainer.style.display = 'none';
    alert(`Failed to sync from OpenWebUI: ${err.message}\n\nMake sure your OpenWebUI instance is reachable and your API key is valid.`);
  } finally {
    syncBtnText.textContent = 'Sync Now';
    if (syncIcon) syncIcon.classList.remove('lucide-spin');
  }
}

/**
 * Handle OpenWebUI Export JSON Import
 */
function handleFileImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const parsedChats = parseExportJson(event.target.result);
      if (parsedChats.length === 0) {
        alert('No conversations found in the uploaded JSON file.');
        return;
      }

      appState.allChats = parsedChats;
      updateConnectionBadge('connected', `Imported (${parsedChats.length} chats)`);
      applyTimeFilter();
      triggerCelebration();
    } catch (err) {
      alert(`Failed to parse OpenWebUI export JSON: ${err.message}`);
    }
  };
  reader.readAsText(file);
}

function updateConnectionBadge(status, label) {
  const badge = document.getElementById('connection-badge');
  const text = document.getElementById('connection-status-text');

  badge.className = `status-badge ${status}`;
  text.textContent = label;
}

/**
 * Render Baseline Model Pills filtered by selected company
 */
function renderModelPills() {
  const container = document.getElementById('model-pills-container');
  container.innerHTML = '';

  const currentTotalPrompt = appState.chats.reduce((acc, c) => acc + c.promptTokens, 0);
  const currentTotalComp = appState.chats.reduce((acc, c) => acc + c.completionTokens, 0);

  const allModels = { ...CLOUD_MODELS };
  if (appState.customRates) {
    allModels['custom'] = {
      name: appState.customRates.name || 'Custom Rates',
      company: 'Custom',
      provider: 'Custom',
      inputCostPer1M: appState.customRates.inputRate,
      outputCostPer1M: appState.customRates.outputRate
    };
  }

  const selectedCompany = appState.companyFilter;

  for (const [key, model] of Object.entries(allModels)) {
    // Filter by company unless 'all'
    if (selectedCompany !== 'all' && model.company !== selectedCompany && model.company !== 'Custom') {
      continue;
    }

    const isSelected = appState.selectedBaseline === key;
    const cost = calculateModelCost(currentTotalPrompt, currentTotalComp, key, appState.customRates);

    const tagBadge = model.tag 
      ? `<span style="font-size:0.65rem; background:rgba(99,102,241,0.25); border: 1px solid rgba(99,102,241,0.4); padding:1px 6px; border-radius:4px; color:#c7d2fe;">${model.tag}</span>` 
      : (model.popular ? '<span style="font-size:0.65rem; background:rgba(16,185,129,0.25); border: 1px solid rgba(16,185,129,0.4); padding:1px 6px; border-radius:4px; color:#6ee7b7;">POPULAR</span>' : '');

    const pill = document.createElement('div');
    pill.className = `model-pill-btn ${isSelected ? 'selected' : ''}`;
    pill.innerHTML = `
      <div class="model-pill-name">
        <span>${model.name}</span>
        ${tagBadge}
      </div>
      <div class="model-pill-rates">$${model.inputCostPer1M.toFixed(2)} in / $${model.outputCostPer1M.toFixed(2)} out per 1M</div>
      <div class="model-pill-savings">$${cost.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Saved</div>
    `;

    pill.addEventListener('click', () => {
      appState.selectedBaseline = key;
      renderModelPills();
      updateDashboard();
    });

    container.appendChild(pill);
  }
}

/**
 * Master Update Function for Dashboard
 */
function updateDashboard() {
  const analytics = computeAnalytics(appState.chats, appState.selectedBaseline, appState.customRates);

  // Update Top Stats
  const statSaved = document.getElementById('stat-total-saved');
  const statBaseline = document.getElementById('stat-baseline-label');
  const statTokens = document.getElementById('stat-total-tokens');
  const statTokenSplit = document.getElementById('stat-token-split');
  const statChats = document.getElementById('stat-total-chats');
  const statAvgTokens = document.getElementById('stat-avg-tokens');
  const statAvgSavings = document.getElementById('stat-avg-savings');
  const statDateSpan = document.getElementById('stat-date-span');

  const baselineName = (appState.selectedBaseline === 'custom')
    ? (appState.customRates.name || 'Custom')
    : (CLOUD_MODELS[appState.selectedBaseline]?.name || 'Baseline');

  statSaved.textContent = `$${analytics.savingsVsSelected.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  statBaseline.textContent = `vs ${baselineName}`;

  statTokens.textContent = analytics.totalTokens.toLocaleString();
  statTokenSplit.textContent = `Prompt: ${analytics.totalPromptTokens.toLocaleString()} | Output: ${analytics.totalCompletionTokens.toLocaleString()}`;

  statChats.textContent = analytics.totalChats.toLocaleString();
  statAvgTokens.textContent = `Avg ${analytics.avgTokensPerChat.toLocaleString()} tokens / session`;

  statAvgSavings.textContent = `$${analytics.avgSavingsPerChat.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}`;
  if (analytics.dateRange.start && analytics.dateRange.end) {
    statDateSpan.textContent = `${analytics.dateRange.start} – ${analytics.dateRange.end} (${analytics.dateRange.daysSpan} days)`;
  } else {
    statDateSpan.textContent = 'No chats in range';
  }

  // Update Model Filter options
  updateModelFilterDropdown(analytics.modelUsage);

  // Render Charts
  renderCharts(analytics);

  // Render Table
  renderTable();

  // Re-render pills with updated token counts
  renderModelPills();

  initLucideIcons();
}

function updateModelFilterDropdown(modelUsage) {
  const select = document.getElementById('select-model-filter');
  const currentVal = select.value;
  select.innerHTML = '<option value="all">All Models</option>';

  for (const modelKey of Object.keys(modelUsage)) {
    const opt = document.createElement('option');
    opt.value = modelKey;
    opt.textContent = `${modelKey} (${modelUsage[modelKey].chatCount})`;
    if (modelKey === currentVal) opt.selected = true;
    select.appendChild(opt);
  }
}

/**
 * Render Chart.js Visualizations with Glass Theme
 */
function renderCharts(analytics) {
  const chartColors = {
    indigo: '#6366f1',
    purple: '#a855f7',
    cyan: '#06b6d4',
    emerald: '#10b981',
    amber: '#f59e0b',
    rose: '#f43f5e',
    grid: 'rgba(255, 255, 255, 0.06)',
    text: '#94a3b8'
  };

  // 1. Savings Timeline Chart
  const ctxTimeline = document.getElementById('chart-savings-timeline').getContext('2d');
  if (savingsTimelineChart) savingsTimelineChart.destroy();

  const timelineLabels = analytics.dailyTimeline.map(d => d.date.slice(5));
  const timelineData = analytics.dailyTimeline.map(d => Number(d.cumulativeSavings.toFixed(2)));

  const gradientSavings = ctxTimeline.createLinearGradient(0, 0, 0, 300);
  gradientSavings.addColorStop(0, 'rgba(52, 211, 153, 0.35)');
  gradientSavings.addColorStop(1, 'rgba(52, 211, 153, 0.0)');

  savingsTimelineChart = new Chart(ctxTimeline, {
    type: 'line',
    data: {
      labels: timelineLabels.length ? timelineLabels : ['No Data in Range'],
      datasets: [{
        label: 'Cumulative Savings ($)',
        data: timelineData.length ? timelineData : [0],
        borderColor: '#34d399',
        backgroundColor: gradientSavings,
        fill: true,
        tension: 0.35,
        pointRadius: timelineData.length === 1 ? 4 : 2,
        pointHoverRadius: 5,
        pointBackgroundColor: '#10b981',
        borderWidth: 2.5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.9)',
          borderColor: 'rgba(255, 255, 255, 0.15)',
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label: (ctx) => `Saved: $${ctx.raw.toFixed(2)}`
          }
        }
      },
      scales: {
        x: {
          grid: { color: chartColors.grid },
          ticks: { color: chartColors.text, font: { size: 10 } }
        },
        y: {
          grid: { color: chartColors.grid },
          ticks: {
            color: chartColors.text,
            font: { size: 10 },
            callback: (v) => `$${v}`
          }
        }
      }
    }
  });

  // 2. Model Token Distribution (Doughnut)
  const ctxModel = document.getElementById('chart-model-distribution').getContext('2d');
  if (modelDistributionChart) modelDistributionChart.destroy();

  const modelLabels = Object.keys(analytics.modelUsage);
  const modelTokens = modelLabels.map(m => analytics.modelUsage[m].totalTokens);
  const palette = ['#6366f1', '#a855f7', '#06b6d4', '#10b981', '#f59e0b', '#f43f5e', '#3b82f6'];

  modelDistributionChart = new Chart(ctxModel, {
    type: 'doughnut',
    data: {
      labels: modelLabels.length ? modelLabels : ['No Data in Range'],
      datasets: [{
        data: modelTokens.length ? modelTokens : [1],
        backgroundColor: palette.slice(0, Math.max(1, modelLabels.length)),
        borderColor: '#07090e',
        borderWidth: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: chartColors.text,
            boxWidth: 12,
            font: { size: 11 }
          }
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.9)',
          borderColor: 'rgba(255, 255, 255, 0.15)',
          borderWidth: 1,
          callbacks: {
            label: (ctx) => `${ctx.label}: ${ctx.raw.toLocaleString()} tokens`
          }
        }
      },
      cutout: '70%'
    }
  });

  // 3. Cloud Provider Cost Comparison (Bar)
  const ctxCloudCost = document.getElementById('chart-cloud-cost-bar').getContext('2d');
  if (cloudCostBarChart) cloudCostBarChart.destroy();

  const comparisonEntries = Object.entries(analytics.modelComparison).slice(0, 6);
  const compLabels = ['Local AI (Self-Hosted)', ...comparisonEntries.map(([k, v]) => v.name)];
  const compValues = [0, ...comparisonEntries.map(([k, v]) => Number(v.totalCost.toFixed(2)))];
  const compColors = [
    '#34d399',
    ...comparisonEntries.map(([k, v]) => v.badgeColor || '#6366f1')
  ];

  cloudCostBarChart = new Chart(ctxCloudCost, {
    type: 'bar',
    data: {
      labels: compLabels,
      datasets: [{
        data: compValues,
        backgroundColor: compColors,
        borderRadius: 6,
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.9)',
          borderColor: 'rgba(255, 255, 255, 0.15)',
          borderWidth: 1,
          callbacks: {
            label: (ctx) => `Est. Cost: $${ctx.raw.toFixed(2)}`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: chartColors.text, font: { size: 10 }, maxRotation: 25 }
        },
        y: {
          grid: { color: chartColors.grid },
          ticks: {
            color: chartColors.text,
            font: { size: 10 },
            callback: (v) => `$${v}`
          }
        }
      }
    }
  });

  // 4. Daily Token Activity (Stacked Bar)
  const ctxDaily = document.getElementById('chart-daily-tokens-bar').getContext('2d');
  if (dailyTokensBarChart) dailyTokensBarChart.destroy();

  const dailyLabels = analytics.dailyTimeline.map(d => d.date.slice(5));
  const promptTokensData = analytics.dailyTimeline.map(d => d.dayPromptTokens);
  const completionTokensData = analytics.dailyTimeline.map(d => d.dayCompletionTokens);

  dailyTokensBarChart = new Chart(ctxDaily, {
    type: 'bar',
    data: {
      labels: dailyLabels.length ? dailyLabels : ['No Activity'],
      datasets: [
        {
          label: 'Prompt (Input)',
          data: promptTokensData.length ? promptTokensData : [0],
          backgroundColor: 'rgba(99, 102, 241, 0.8)',
          borderRadius: 4
        },
        {
          label: 'Output (Completion)',
          data: completionTokensData.length ? completionTokensData : [0],
          backgroundColor: 'rgba(6, 182, 212, 0.8)',
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: { color: chartColors.text, boxWidth: 12, font: { size: 11 } }
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.9)',
          borderColor: 'rgba(255, 255, 255, 0.15)',
          borderWidth: 1,
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${ctx.raw.toLocaleString()} tokens`
          }
        }
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          ticks: { color: chartColors.text, font: { size: 10 } }
        },
        y: {
          stacked: true,
          grid: { color: chartColors.grid },
          ticks: {
            color: chartColors.text,
            font: { size: 10 },
            callback: (v) => (v >= 1000 ? `${(v/1000).toFixed(0)}k` : v)
          }
        }
      }
    }
  });
}

/**
 * Render Chat Table with Search and Model Filters
 */
function renderTable() {
  const tbody = document.getElementById('chats-table-body');
  
  let filtered = appState.chats;

  if (appState.searchTerm) {
    filtered = filtered.filter(c => 
      c.title.toLowerCase().includes(appState.searchTerm) ||
      (c.primaryModel && c.primaryModel.toLowerCase().includes(appState.searchTerm))
    );
  }

  if (appState.modelFilter !== 'all') {
    filtered = filtered.filter(c => c.primaryModel === appState.modelFilter);
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state">
          <div class="empty-icon">
            <i data-lucide="inbox" style="width: 32px; height: 32px;"></i>
          </div>
          <div>${appState.allChats.length === 0 ? 'No token records loaded yet. Connect your OpenWebUI API or configure .env.' : 'No conversations found in the selected time period or search filter.'}</div>
        </td>
      </tr>
    `;
    initLucideIcons();
    return;
  }

  const rowsHtml = filtered.slice(0, 100).map(chat => {
    const cost = calculateModelCost(chat.promptTokens, chat.completionTokens, appState.selectedBaseline, appState.customRates);
    const dateFormatted = new Date(chat.timestamp).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    return `
      <tr>
        <td style="font-weight: 500; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          ${escapeHtml(chat.title)}
        </td>
        <td><span class="model-tag">${escapeHtml(chat.primaryModel)}</span></td>
        <td class="token-mono" style="color: #a5b4fc;">${chat.promptTokens.toLocaleString()}</td>
        <td class="token-mono" style="color: #67e8f9;">${chat.completionTokens.toLocaleString()}</td>
        <td class="token-mono" style="font-weight: 600;">${chat.totalTokens.toLocaleString()}</td>
        <td class="money-saved-tag">+$${cost.totalCost.toFixed(3)}</td>
        <td style="color: var(--text-muted); font-size: 0.78rem;">${dateFormatted}</td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = rowsHtml;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m]));
}

function triggerCelebration() {
  try {
    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.8 },
      colors: ['#6366f1', '#a855f7', '#34d399', '#38bdf8']
    });
  } catch (e) {
    // Ignore if not supported
  }
}
