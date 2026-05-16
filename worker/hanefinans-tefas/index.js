/**
 * hanefinans-tefas Worker
 *
 * Cloudflare Worker — TEFAS API'sinden tüm fonların gün sonu NAV + dönemsel getiri verisini çeker,
 * Cloudflare KV'ya yazar. Frontend bu Worker'ın HTTP endpoint'inden okur.
 *
 * Bindings (Dashboard → Settings → Bindings):
 *   - FUNDS_KV       (KV Namespace)
 *   - TRIGGER_SECRET (Plaintext Variable, opsiyonel) — /trigger endpoint için
 *
 * Cron Triggers:
 *   - "0 16 * * 1-5"   — UTC 16:00 = TR 19:00 (BIST kapandıktan sonra, Pzt-Cum)
 *
 * Custom Domain (opsiyonel):
 *   - funds.hanefinans.net  — frontend buradan çeker
 */

const TEFAS_URL = 'https://www.tefas.gov.tr/api/DB/BindHistoryInfo';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  'Origin': 'https://www.tefas.gov.tr',
  'Referer': 'https://www.tefas.gov.tr/TarihselVeriler.aspx',
  'X-Requested-With': 'XMLHttpRequest',
};

function fmtDate(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

function getBusinessDay(d, maxBack = 7) {
  const x = new Date(d);
  for (let i = 0; i < maxBack; i++) {
    const day = x.getDay();
    if (day !== 0 && day !== 6) return x;
    x.setDate(x.getDate() - 1);
  }
  return x;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Tek bir tarih için TEFAS POST — retry destekli */
async function fetchTefasDay(dateStr, retries = 3) {
  const body = `fontip=YAT&bastarih=${encodeURIComponent(dateStr)}&bittarih=${encodeURIComponent(dateStr)}&fonkod=&fongrup=`;
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(TEFAS_URL, { method: 'POST', headers: HEADERS, body });
      if (r.ok) {
        const j = await r.json();
        return j.data || [];
      }
      console.log(`TEFAS HTTP ${r.status} for ${dateStr}, retry ${i + 1}`);
    } catch (e) {
      console.log(`TEFAS error for ${dateStr}: ${e.message}, retry ${i + 1}`);
    }
    await sleep(800 * (i + 1));
  }
  return [];
}

/** Bir anchor tarihi için 5 iş günü geri sayarak boş yanıt alınmasını engelle */
async function fetchSnapshotForAnchor(targetDate) {
  let d = getBusinessDay(targetDate);
  for (let i = 0; i < 5; i++) {
    const dateStr = fmtDate(d);
    const rows = await fetchTefasDay(dateStr);
    if (rows.length > 0) {
      return { date: dateStr, rows };
    }
    d.setDate(d.getDate() - 1);
    d = getBusinessDay(d);
  }
  return { date: null, rows: [] };
}

/** Anchor tarihler için snapshot al, fund map oluştur (code → row) */
async function buildSnapshots() {
  const today = new Date();
  const anchors = {
    latest: today,
    '1w':  new Date(today.getTime() - 8 * 86400_000),
    '1m':  new Date(today.getTime() - 31 * 86400_000),
    '3m':  new Date(today.getTime() - 92 * 86400_000),
    '6m':  new Date(today.getTime() - 183 * 86400_000),
    '1y':  new Date(today.getTime() - 366 * 86400_000),
    ytd:   new Date(today.getFullYear(), 0, 2),
  };

  const out = {};
  for (const [key, dt] of Object.entries(anchors)) {
    console.log(`Fetching anchor: ${key} = ${fmtDate(dt)}`);
    const snap = await fetchSnapshotForAnchor(dt);
    const map = {};
    for (const r of snap.rows) {
      if (r.FONKODU) map[String(r.FONKODU)] = r;
    }
    out[key] = { date: snap.date, map, count: Object.keys(map).length };
    console.log(`  → ${out[key].count} funds @ ${snap.date}`);
    await sleep(700); // nezaket aralığı
  }
  return out;
}

/** Snapshot'lardan birleştirilmiş frontend-friendly JSON üret */
function buildFundList(snapshots) {
  const latest = snapshots.latest?.map ?? {};
  const funds = [];

  for (const [code, row] of Object.entries(latest)) {
    const nav = parseFloat(row.FIYAT) || 0;
    if (nav <= 0) continue;

    const periodReturn = (key) => {
      const past = snapshots[key]?.map?.[code];
      if (!past) return null;
      const pastNav = parseFloat(past.FIYAT) || 0;
      if (pastNav <= 0) return null;
      return Math.round(((nav - pastNav) / pastNav) * 100 * 100) / 100; // 2 ondalık
    };

    funds.push({
      code,
      name: String(row.FONUNVAN || '').trim(),
      nav,
      date: snapshots.latest.date,
      marketCap: parseFloat(row.PORTFOYBUYUKLUK || 0) || null,
      investorCount: parseInt(row.KISISAYISI || 0) || null,
      shareCount: parseFloat(row.TEDPAYSAYISI || 0) || null,
      returns: {
        '1w':  periodReturn('1w'),
        '1m':  periodReturn('1m'),
        '3m':  periodReturn('3m'),
        '6m':  periodReturn('6m'),
        '1y':  periodReturn('1y'),
        ytd:   periodReturn('ytd'),
      },
    });
  }

  funds.sort((a, b) => a.code.localeCompare(b.code));

  return {
    updatedAt: new Date().toISOString(),
    latestDate: snapshots.latest?.date ?? null,
    anchors: Object.fromEntries(
      Object.entries(snapshots).map(([k, v]) => [k, { date: v.date, count: v.count }]),
    ),
    count: funds.length,
    funds,
  };
}

async function runFetch(env) {
  const snapshots = await buildSnapshots();
  const result = buildFundList(snapshots);
  await env.FUNDS_KV.put('tefas:latest', JSON.stringify(result));
  return result;
}

export default {
  // 1) Scheduled cron — günde 1 kez otomatik çalışır
  async scheduled(event, env, ctx) {
    console.log('=== TEFAS scheduled fetch starting ===');
    try {
      const result = await runFetch(env);
      console.log(`✅ Stored ${result.count} funds`);
    } catch (e) {
      console.error('❌ scheduled error:', e.message);
    }
  },

  // 2) HTTP endpoint — frontend buradan okur
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    // Manuel tetikleyici — secret korumalı, FIRE-AND-FORGET
    if (url.pathname === '/trigger') {
      if (!env.TRIGGER_SECRET) {
        return new Response(JSON.stringify({ ok: false, error: 'TRIGGER_SECRET binding yok' }), {
          status: 500, headers: { 'Content-Type': 'application/json', ...cors },
        });
      }
      const secret = url.searchParams.get('secret');
      if (secret !== env.TRIGGER_SECRET) {
        return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
          status: 401, headers: { 'Content-Type': 'application/json', ...cors },
        });
      }

      // İşlemi arka plana at — tarayıcı timeout vermeden cevap dön
      ctx.waitUntil((async () => {
        try {
          const result = await runFetch(env);
          await env.FUNDS_KV.put('tefas:last_run', JSON.stringify({
            ok: true,
            count: result.count,
            latestDate: result.latestDate,
            finishedAt: new Date().toISOString(),
          }));
          console.log(`✅ Trigger tamamlandı: ${result.count} fon`);
        } catch (e) {
          await env.FUNDS_KV.put('tefas:last_run', JSON.stringify({
            ok: false,
            error: e.message,
            finishedAt: new Date().toISOString(),
          }));
          console.error('❌ Trigger hatası:', e.message);
        }
      })());

      return new Response(JSON.stringify({
        ok: true,
        status: 'started',
        message: 'TEFAS fetch arka planda başladı (~30-60 sn). Durum için /status, veri için / endpoint\'lerini kullan.',
      }), {
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    // Status endpoint — son trigger durumunu göster
    if (url.pathname === '/status') {
      const last = await env.FUNDS_KV.get('tefas:last_run');
      if (!last) {
        return new Response(JSON.stringify({ ok: false, message: 'Henüz trigger çalışmadı' }), {
          status: 404, headers: { 'Content-Type': 'application/json', ...cors },
        });
      }
      return new Response(last, {
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    // Default → cached JSON
    const cached = await env.FUNDS_KV.get('tefas:latest');
    if (!cached) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'Veri henüz yok. /trigger?secret=YOUR_SECRET ile manuel tetikleyebilirsin veya cron çalışmasını bekle.',
      }), {
        status: 404, headers: { 'Content-Type': 'application/json', ...cors },
      });
    }
    return new Response(cached, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300, s-maxage=300',
        ...cors,
      },
    });
  },
};
