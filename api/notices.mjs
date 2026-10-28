const BASE = 'https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1/';
const ENDPOINTS = [
  { path: 'getAPTLttotPblancDetail', type: 'APT' },
  { path: 'getRemndrLttotPblancDetail', type: '무순위·잔여세대' }
];

function koreaDate(daysAgo = 0) {
  const shifted = new Date(Date.now() - daysAgo * 86400000);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(shifted);
  const part = type => parts.find(value => value.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

async function loadPage(endpoint, key, fromDate, page) {
  const url = new URL(BASE + endpoint.path);
  url.searchParams.set('serviceKey', key);
  url.searchParams.set('page', String(page));
  url.searchParams.set('perPage', '100');
  url.searchParams.set('returnType', 'JSON');
  url.searchParams.set('cond[RCRIT_PBLANC_DE::GTE]', fromDate);
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`upstream_status_${response.status}`);
  const body = await response.json();
  if (!Array.isArray(body.data)) throw new Error('upstream_payload');
  return body.data;
}

async function loadEndpoint(endpoint, key, fromDate) {
  const items = [];
  let truncated = false;
  for (let page = 1; page <= 10; page++) {
    const rows = await loadPage(endpoint, key, fromDate, page);
    items.push(...rows.map(item => ({ type: endpoint.type, item })));
    if (rows.length < 100) break;
    if (page === 10) truncated = true;
  }
  return { items, truncated };
}

export default {
  async fetch(request) {
    if (request.method !== 'GET') {
      return Response.json({ error: 'Method not allowed' }, { status: 405, headers: { Allow: 'GET' } });
    }
    const key = process.env.home?.trim().replace(/^['"]|['"]$/g, '');
    if (!key) {
      return Response.json({ error: 'API key is not configured' }, { status: 503 });
    }
    try {
      const batches = await Promise.allSettled(
        ENDPOINTS.map(endpoint => loadEndpoint(endpoint, key, koreaDate(90)))
      );
      const good = batches.filter(batch => batch.status === 'fulfilled').map(batch => batch.value);
      if (!good.length) throw new Error('All upstream APIs failed');
      return Response.json({
        source: 'vercel',
        updatedAt: new Date().toISOString(),
        items: good.flatMap(batch => batch.items),
        partial: good.length < ENDPOINTS.length || good.some(batch => batch.truncated)
      }, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } });
    } catch {
      return Response.json({ error: 'Could not load notices' }, { status: 502 });
    }
  }
};
