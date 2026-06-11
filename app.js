// === Market Dashboard App ===

const INDICES = [
  { key: 'GSPC', symbol: '^GSPC', name: 'S&P 500' },
  { key: 'NDX', symbol: '^NDX', name: 'NASDAQ 100' },
  { key: 'CSI300', symbol: '000300.SS', name: '沪深300' },
  { key: 'CSI500', symbol: '000905.SS', name: '中证500' },
];

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes
let refreshTimer = null;
let previousPrices = {};

// === Helpers ===

function formatPrice(price, currency) {
  if (price == null || isNaN(price)) return '—';
  const opts = {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  };
  if (currency === 'CNY' || currency === 'CNH') {
    return price.toLocaleString('zh-CN', opts);
  }
  return price.toLocaleString('en-US', opts);
}

function formatChange(value) {
  if (value == null || isNaN(value)) return '—';
  const sign = value >= 0 ? '+' : '';
  return sign + value.toFixed(2);
}

function formatPct(pct) {
  if (pct == null || isNaN(pct)) return '—';
  const sign = pct >= 0 ? '+' : '';
  return sign + pct.toFixed(2) + '%';
}

function formatVolume(vol) {
  if (!vol) return '';
  if (vol >= 1e9) return (vol / 1e9).toFixed(1) + 'B';
  if (vol >= 1e6) return (vol / 1e6).toFixed(1) + 'M';
  if (vol >= 1e3) return (vol / 1e3).toFixed(1) + 'K';
  return vol.toLocaleString();
}

function formatTime(date) {
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// === Sparkline Renderer ===

function drawSparkline(canvasId, prices, isUp) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !prices || prices.length < 2) return;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const pad = 2;

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  // Build points
  const points = prices.map((p, i) => ({
    x: pad + (i / (prices.length - 1)) * (w - pad * 2),
    y: pad + (1 - (p - min) / range) * (h - pad * 2),
  }));

  // Gradient fill
  const color = isUp ? '#3fb950' : '#f85149';
  const colorAlpha = isUp ? 'rgba(63, 185, 80, 0.08)' : 'rgba(248, 81, 73, 0.08)';

  // Fill area
  ctx.beginPath();
  ctx.moveTo(points[0].x, h);
  points.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(points[points.length - 1].x, h);
  ctx.closePath();

  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, isUp ? 'rgba(63, 185, 80, 0.15)' : 'rgba(248, 81, 73, 0.15)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = gradient;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // End dot
  const last = points[points.length - 1];
  ctx.beginPath();
  ctx.arc(last.x, last.y, 3, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(last.x, last.y, 5, 0, Math.PI * 2);
  ctx.fillStyle = isUp ? 'rgba(63, 185, 80, 0.3)' : 'rgba(248, 81, 73, 0.3)';
  ctx.fill();
}

// === Data Fetching ===

async function fetchQuotes() {
  const symbols = INDICES.map(i => i.symbol).join(',');
  try {
    const resp = await fetch(`/api/quote?symbols=${encodeURIComponent(symbols)}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch (e) {
    console.error('Fetch error:', e);
    return null;
  }
}

function updateCard(indexDef, data) {
  const { key } = indexDef;
  const card = document.getElementById(`card-${key}`);
  if (!card) return;

  if (!data || data.error) {
    card.classList.add('error');
    card.classList.remove('loading');
    const priceEl = document.getElementById(`price-${key}`);
    if (priceEl) priceEl.textContent = '数据获取失败';
    return;
  }

  card.classList.remove('loading', 'error');

  const isUp = data.change >= 0;
  card.classList.toggle('up', isUp);
  card.classList.toggle('down', !isUp);

  // Price
  const priceEl = document.getElementById(`price-${key}`);
  const oldPrice = previousPrices[key];
  const newPriceStr = formatPrice(data.price, data.currency);

  if (priceEl) {
    priceEl.textContent = newPriceStr;
    // Flash effect on price change
    if (oldPrice != null && oldPrice !== data.price) {
      priceEl.classList.remove('price-flash-up', 'price-flash-down');
      void priceEl.offsetWidth; // reflow
      priceEl.classList.add(data.price > oldPrice ? 'price-flash-up' : 'price-flash-down');
    }
  }
  previousPrices[key] = data.price;

  // Currency
  const currEl = document.getElementById(`currency-${key}`);
  if (currEl) currEl.textContent = data.currency || '';

  // Change value
  const chgVal = document.getElementById(`change-value-${key}`);
  if (chgVal) chgVal.textContent = formatChange(data.change);

  // Change percent
  const chgPct = document.getElementById(`change-pct-${key}`);
  if (chgPct) chgPct.textContent = formatPct(data.changePercent);

  // Sparkline
  drawSparkline(`spark-${key}`, data.prices, isUp);

  // Range
  const rangeEl = document.getElementById(`range-${key}`);
  if (rangeEl && data.dayLow && data.dayHigh) {
    rangeEl.textContent = `${data.dayLow.toFixed(2)} – ${data.dayHigh.toFixed(2)}`;
  }

  // Volume
  const volEl = document.getElementById(`vol-${key}`);
  if (volEl && data.volume) {
    volEl.textContent = `Vol ${formatVolume(data.volume)}`;
  }
}

function updateMarketState(data) {
  const stateEl = document.getElementById('market-state');
  if (!stateEl) return;

  // Check US market state
  const usData = data['^GSPC'];
  const state = usData?.marketState || 'UNKNOWN';

  const stateMap = {
    'REGULAR': { text: '交易中 Trading', cls: 'open' },
    'PRE': { text: '盘前 Pre-Market', cls: 'pre' },
    'POST': { text: '盘后 Post-Market', cls: 'post' },
    'PREPRE': { text: '休市 Closed', cls: 'closed' },
    'POSTPOST': { text: '休市 Closed', cls: 'closed' },
    'CLOSED': { text: '休市 Closed', cls: 'closed' },
  };

  const info = stateMap[state] || { text: state, cls: 'closed' };
  stateEl.textContent = info.text;
  stateEl.className = 'market-state ' + info.cls;
}

async function refresh() {
  const btn = document.getElementById('refresh-btn');
  const lastUpdateEl = document.getElementById('last-update');

  if (btn) btn.classList.add('spinning');

  const data = await fetchQuotes();
  if (data) {
    INDICES.forEach(idx => updateCard(idx, data[idx.symbol]));
    updateMarketState(data);
    if (lastUpdateEl) {
      lastUpdateEl.textContent = `更新于 ${formatTime(new Date())}`;
    }
  }

  if (btn) {
    setTimeout(() => btn.classList.remove('spinning'), 500);
  }
}

// === Init ===

document.addEventListener('DOMContentLoaded', () => {
  // Mark all cards as loading
  INDICES.forEach(idx => {
    const card = document.getElementById(`card-${idx.key}`);
    if (card) card.classList.add('loading');
  });

  // Initial fetch
  refresh();

  // Auto-refresh every 5 minutes
  refreshTimer = setInterval(refresh, REFRESH_INTERVAL);

  // Manual refresh button
  const btn = document.getElementById('refresh-btn');
  if (btn) {
    btn.addEventListener('click', () => {
      clearInterval(refreshTimer);
      refresh();
      refreshTimer = setInterval(refresh, REFRESH_INTERVAL);
    });
  }

  // Resize sparklines on window resize
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(refresh, 200);
  });
});
