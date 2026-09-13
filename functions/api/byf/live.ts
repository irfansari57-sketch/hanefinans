/**
 * /api/byf/live — Canli BIST BYF (Borsa Yatirim Fonu) verisi.
 *
 * Kaynak: fintables.com/fonlar/borsa-yatirim-fonlari (SSR HTML).
 * Yahoo Finance BIST BYF ticker'larini tanimiyor (404), Is Yatirim CF Worker
 * IP'lerinden bloklu. Fintables HTML SSR ile veriyi tam basiyor, biz de
 * server-side fetch ile alip parse ediyoruz.
 *
 * Response: 27+ BYF + fiyat + gunluk % + hafta/ay/YBB/yil getirileri.
 * Edge cache: 15 dk piyasa acikken, 4 saat kapaliyken.
 */

interface Env {}

interface ByfFund {
  code: string;
  category: string;
  price: number | null;
  changePct: number | null;
  volume: string | null;
  totalValue: string | null;
  returns: {
    '1w': number | null;
    '1m': number | null;
    '3m': number | null;
    '6m': number | null;
    ytd: number | null;
    '1y': number | null;
    '3y': number | null;
    '5y': number | null;
  };
  lastUpdate: string | null;
}

function parseNum(s: string): number | null {
  if (!s || s === 'N/A' || s === '--' || s === '-') return null;
  // TR format: "41,18" -> 41.18, "1.234,56" -> 1234.56
  const cleaned = s.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Fintables RSC payload'ini parse et.
 * Format: self.__next_f.push([1, "...{\"code\":\"APBDL.F\",\"yield_1m\":5.43,...}..."])
 * JSON escape'lerini un-escape ederek her fon objesini yakalar.
 */
function parseFintablesRSC(html: string): ByfFund[] {
  const funds: ByfFund[] = [];
  // RSC push satirlarini bul
  const rscMatches = html.match(/self\.__next_f\.push\(\[1,\s*"([\s\S]*?)"\]\)/g);
  if (!rscMatches) return funds;

  for (const rscBlock of rscMatches) {
    // JSON string'i un-escape et
    const raw = rscBlock
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '\n')
      .replace(/\\\\/g, '\\');

    // Her fund objesini yakala — {"code":"XXX.F",...,"yield_1y":..,"yield_3y":..,"yield_5y":..,"latest_record__fund_aum":..}
    const fundRegex = /\{"code":"([A-Z0-9]{3,6})\.F","management_company_id":"[^"]*","title":"([^"]+)","type":"([^"]+)","yield_1m":([^,]+),"yield_3m":([^,]+),"yield_6m":([^,]+),"yield_ytd":([^,]+),"yield_1y":([^,]+),"yield_3y":([^,]+),"yield_5y":([^,]+),"latest_record__fund_aum":(-?[\d.]+|null)\}/g;

    let m;
    while ((m = fundRegex.exec(raw)) !== null) {
      const parseYield = (s: string) => (s === 'null' ? null : parseFloat(s));
      const parseAum = (s: string) => (s === 'null' ? null : parseFloat(s));
      const aum = parseAum(m[11]);
      funds.push({
        code: m[1],
        category: m[3],
        price: null, // RSC'de fiyat yok, ayri API'den gelir
        changePct: null,
        volume: null,
        totalValue: aum != null ? aum.toLocaleString('tr-TR', { maximumFractionDigits: 0 }) : null,
        returns: {
          '1w': null,
          '1m':  parseYield(m[4]),
          '3m':  parseYield(m[5]),
          '6m':  parseYield(m[6]),
          ytd:   parseYield(m[7]),
          '1y':  parseYield(m[8]),
          '3y':  parseYield(m[9]),
          '5y':  parseYield(m[10]),
        },
        lastUpdate: null,
      });
    }
  }
  return funds;
}

/**
 * Eski parser (fallback) — Fintables innerText format.
 */
function parseFintablesText(text: string): ByfFund[] {
  const funds: ByfFund[] = [];
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  // Fon satirini yakala — pattern: "N", "CODE.F", ...
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Sira numarasi ise sonraki satir fon kodu
    if (/^\d{1,3}$/.test(line) && i + 1 < lines.length) {
      const codeMatch = lines[i + 1].match(/^([A-Z0-9]{3,6})\.F$/);
      if (!codeMatch) continue;

      const code = codeMatch[1];
      // Toplama alanini bul: next 20-30 lines contain the values
      const chunk = lines.slice(i + 2, i + 25);
      // "18:05:00" son islem saati
      const timeMatch = chunk[0]?.match(/^\d{2}:\d{2}(:\d{2})?$/) || chunk[0] === '--';
      const lastUpdate = timeMatch ? chunk[0] : null;

      // Kategori genelde time'dan sonra gelir, "G" veya rakam gelmeden once
      const category = chunk[1] && !/^[G%\d,.-]/.test(chunk[1]) ? chunk[1] : null;

      // Fiyat, degisim% ve getirileri sirayla topla (G/%/rakam pattern)
      const numbers: string[] = [];
      for (const c of chunk) {
        if (c === 'G' || c === '%') continue;
        if (c === 'N/A' || c === '-' || c === '--') { numbers.push('N/A'); continue; }
        if (/^-?[\d.,]+$/.test(c) || c.includes('bin') || c.includes('mn') || c.includes('mr')) {
          numbers.push(c);
        }
      }

      const price      = parseNum(numbers[0] || '');
      const changePct  = parseNum(numbers[1] || '');
      const volume     = numbers[2] || null;
      const totalValue = numbers[3] || null;
      const r1w  = parseNum(numbers[4] || '');
      const r1m  = parseNum(numbers[5] || '');
      const r3m  = parseNum(numbers[6] || '');
      const r6m  = parseNum(numbers[7] || '');
      const rytd = parseNum(numbers[8] || '');
      const r1y  = parseNum(numbers[9] || '');
      const r3y  = parseNum(numbers[10] || '');
      const r5y  = parseNum(numbers[11] || '');

      funds.push({
        code,
        category: category ?? 'BYF',
        price,
        changePct,
        volume,
        totalValue,
        returns: {
          '1w': r1w, '1m': r1m, '3m': r3m, '6m': r6m,
          ytd: rytd, '1y': r1y, '3y': r3y, '5y': r5y,
        },
        lastUpdate,
      });

      i += 20;
    }
  }
  return funds;
}

export const onRequest: PagesFunction<Env> = async ({ request }) => {
  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';
  const debug = url.searchParams.get('debug') === '1';

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(request.url, request);

  if (!force && !debug) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
  }

  try {
    const r = await fetch('https://fintables.com/fonlar/borsa-yatirim-fonlari', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
      },
    });

    if (!r.ok) {
      return new Response(JSON.stringify({ ok: false, error: `Fintables HTTP ${r.status}` }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const html = await r.text();

    // Once RSC parse dene (Fintables Next.js RSC ile embed ediyor)
    let funds = parseFintablesRSC(html);

    // Fallback: innerText parse (RSC bulunmazsa)
    if (funds.length === 0) {
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, '\n')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"');
      funds = parseFintablesText(text);
    }

    if (debug) {
      return new Response(JSON.stringify({
        ok: true,
        htmlSize: html.length,
        parser: funds.length > 0 ? 'rsc-or-text' : 'both-failed',
        fundCount: funds.length,
        sample: funds.slice(0, 3),
      }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (funds.length === 0) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'BYF parse basarisiz — HTML formati degismis olabilir',
        htmlPreview: text.slice(0, 500),
      }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }

    const body = {
      ok: true,
      source: 'fintables.com',
      attribution: 'Veri kaynağı: fintables.com — bilgilendirme amaçlıdır.',
      updatedAt: new Date().toISOString(),
      count: funds.length,
      funds,
    };

    const now = new Date();
    const utcH = now.getUTCHours();
    const isWeekday = now.getUTCDay() >= 1 && now.getUTCDay() <= 5;
    const marketOpen = isWeekday && utcH >= 6 && utcH <= 16;
    const ttl = marketOpen ? 900 : 14400;

    const resp = new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${ttl}, s-maxage=${ttl}`,
      },
    });

    if (!force && funds.length > 0) {
      cache.put(cacheKey, resp.clone()).catch(() => { /* noop */ });
    }
    return resp;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
