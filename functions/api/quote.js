// Cloudflare Pages Function: proxy Yahoo Finance API
// Usage: /api/quote?symbols=^GSPC,^NDX,000300.SS,000905.SS

export async function onRequestGet(context) {
  const { searchParams } = new URL(context.request.url);
  const symbols = searchParams.get('symbols') || '^GSPC,^NDX,000300.SS,000905.SS';

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };

  try {
    const symbolList = symbols.split(',').map(s => s.trim());
    const results = {};

    // Fetch all symbols in parallel
    const promises = symbolList.map(async (symbol) => {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d&includePrePost=false`;
      try {
        const resp = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });
        if (!resp.ok) {
          return { symbol, error: `HTTP ${resp.status}` };
        }
        const data = await resp.json();
        const result = data.chart?.result?.[0];
        if (!result) {
          return { symbol, error: 'No data' };
        }

        const meta = result.meta;
        const timestamps = result.timestamp || [];
        const closes = result.indicators?.quote?.[0]?.close || [];
        const opens = result.indicators?.quote?.[0]?.open || [];
        const highs = result.indicators?.quote?.[0]?.high || [];
        const lows = result.indicators?.quote?.[0]?.low || [];

        // Get intraday prices for sparkline (filter out nulls)
        const prices = closes
          .map((c, i) => c !== null ? { t: timestamps[i], c } : null)
          .filter(Boolean);

        // Current price info
        const currentPrice = meta.regularMarketPrice;

        // Use the second-to-last valid close as "previous close" for accurate daily change.
        // chartPreviousClose is unreliable with range>1d (it returns the close before the range, not yesterday).
        const validCloses = closes.filter(c => c !== null);
        let previousClose;
        if (validCloses.length >= 2) {
          previousClose = validCloses[validCloses.length - 2];
        } else {
          previousClose = meta.chartPreviousClose || meta.previousClose;
        }

        // Calculate change
        const change = currentPrice - previousClose;
        const changePercent = previousClose ? (change / previousClose) * 100 : 0;

        return {
          symbol,
          shortName: meta.shortName || symbol,
          exchangeName: meta.exchangeName || '',
          currency: meta.currency || 'USD',
          price: currentPrice,
          previousClose,
          change: Math.round(change * 100) / 100,
          changePercent: Math.round(changePercent * 100) / 100,
          dayHigh: meta.regularMarketDayHigh || null,
          dayLow: meta.regularMarketDayLow || null,
          volume: meta.regularMarketVolume || null,
          marketState: meta.marketState || 'UNKNOWN',
          prices: prices.map(p => p.c), // Just close prices for sparkline
        };
      } catch (e) {
        return { symbol, error: e.message };
      }
    });

    const data = await Promise.all(promises);
    for (const item of data) {
      results[item.symbol] = item;
    }

    return new Response(JSON.stringify(results), { headers: corsHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
