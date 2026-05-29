/**
 * Cloudflare Pages Function — Doğal dil sorgudan filter spec üretir.
 *
 * POST /api/ai/screener
 * Body: { query: string, dataset?: 'stocks' | 'funds' }
 * Response: { ok: true, spec: ScreenerSpec, explanation: string, model: string }
 *
 * Kullanıcının "BIST'te son 1 ayda %5+ getirili bankacılık hisseleri" gibi
 * doğal dil sorgusunu yapılandırılmış filtre objesine çevirir.
 * Frontend bu filtreyi lokal hisse/fon datasine uygular — hızlı, ucuz.
 */

interface Env {
  ANTHROPIC_API_KEY?: string;
}

type Op = '>' | '>=' | '<' | '<=' | '=' | '!=' | 'includes' | 'in';

interface ScreenerFilter {
  field: string;
  op: Op;
  value: number | string | string[];
}

interface ScreenerSpec {
  dataset: 'stocks' | 'funds';
  filters: ScreenerFilter[];
  sort?: { field: string; dir: 'asc' | 'desc' };
  limit: number;
  explanation: string;
}

interface AnthropicResponse {
  content: Array<{ text: string; type: string }>;
}

const STOCK_FIELDS = `
HİSSE ALANLARI (dataset='stocks'):
- symbol (string): hisse kodu (örn: GARAN, THYAO)
- name (string): şirket adı
- sector (string): sektör (örn: "Bankacılık", "Holding", "Ulaşım", "Savunma", "Otomotiv")
- price (number): güncel fiyat (TL)
- changePct (number): bugün % değişim
- r1g (number): bugün % değişim (changePct ile aynı, alias)
- r1h (number): 1 haftalık % değişim
- r1a (number): 1 aylık % değişim
- r3a (number): 3 aylık % değişim
- r6a (number): 6 aylık % değişim
- r1y (number): 1 yıllık % değişim
`;

const FUND_FIELDS = `
FON ALANLARI (dataset='funds'):
- code (string): fon kodu
- name (string): fon adı
- category (string): "Katılım" | "Hisse Senedi" | "Borçlanma Araçları" | "Karma" | "Değişken" | "Kıymetli Madenler" | "Para Piyasası" | "Fon Sepeti" | "Serbest"
- day (number): bugün %
- week (number): 1 hafta %
- month (number): 1 ay %
- threeMonth (number): 3 ay %
- sixMonth (number): 6 ay %
- ytd (number): yıl başından bugüne %
- year (number): 1 yıl %
`;

const SYSTEM_PROMPT = `Sen Türk yatırımcısı için doğal dil sorgularını yapılandırılmış filtreye çeviren bir yardımcısın.

Kullanıcı Türkçe finansal sorgular yazar (örn. "son 1 ayda %5+ getirili bankacılık hisseleri", "katılım fonları arasında 1 yıl en iyi 10").

Görevin: sorguyu analiz et, hisse mi fon mu olduğuna karar ver, filtreleri çıkar ve JSON döndür.

${STOCK_FIELDS}

${FUND_FIELDS}

KURALLAR:
1) "dataset" mutlaka 'stocks' veya 'funds'. Belirsizse hisse varsay.
2) Operatörler: '>', '>=', '<', '<=', '=', '!=', 'includes' (string contains), 'in' (string array içinde).
3) Sektör/kategori için 'includes' veya '=' kullan. Türkçe ve İngilizce eşanlamlıları tanı (bank/bankacılık, holding, savunma/defense, otomotiv vb.).
4) "En iyi/en yüksek" → sort dir='desc'. "En düşük/en kötü" → sort dir='asc'.
5) "top N", "en iyi N" → limit=N. Belirtilmemişse hisse için 20, fon için 10.
6) Sayısal değerleri normalize et: "%5" → 5, "%5'ten fazla" → > 5, "%5+" → >= 5.
7) explanation alanına Türkçe kısa özet (max 100 karakter).

ÇIKTI: SADECE geçerli JSON, başka metin yok. Örnek:
{"dataset":"stocks","filters":[{"field":"sector","op":"includes","value":"Bankacılık"},{"field":"r1a","op":">=","value":5}],"sort":{"field":"r1a","dir":"desc"},"limit":20,"explanation":"Son 1 ayda %5+ getirili bankacılık hisseleri"}`;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ ok: false, error: 'ANTHROPIC_API_KEY not set' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: { query?: string; dataset?: 'stocks' | 'funds' };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const userQuery = (body.query ?? '').trim();
  if (!userQuery) {
    return new Response(JSON.stringify({ ok: false, error: 'query zorunlu' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Çok uzun sorguları kes (prompt injection + maliyet kontrolü)
  const safeQuery = userQuery.slice(0, 500);
  const datasetHint = body.dataset ? `\n\n(Kullanıcı ipucu: dataset='${body.dataset}' olmalı.)` : '';

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: `Sorgu: "${safeQuery}"${datasetHint}\n\nJSON döndür:` },
        ],
      }),
    });

    if (!r.ok) {
      const errText = await r.text();
      return new Response(JSON.stringify({ ok: false, error: `Anthropic ${r.status}: ${errText.slice(0, 200)}` }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const aiRes = await r.json() as AnthropicResponse;
    const raw = aiRes.content?.[0]?.text?.trim() ?? '';

    // JSON çıkar — bazen ```json bloklarıyla gelir, temizle
    let jsonText = raw;
    const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlock) jsonText = codeBlock[1].trim();
    // İlk { ve son } arasını al
    const firstBrace = jsonText.indexOf('{');
    const lastBrace = jsonText.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      jsonText = jsonText.slice(firstBrace, lastBrace + 1);
    }

    let spec: ScreenerSpec;
    try {
      spec = JSON.parse(jsonText) as ScreenerSpec;
    } catch (e) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'LLM JSON parse hatası',
        raw: raw.slice(0, 300),
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Güvenlik: spec sanity check
    if (!spec.dataset || !Array.isArray(spec.filters)) {
      return new Response(JSON.stringify({ ok: false, error: 'Geçersiz spec yapısı', spec }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (spec.dataset !== 'stocks' && spec.dataset !== 'funds') {
      spec.dataset = 'stocks';
    }
    if (!spec.limit || spec.limit > 100) spec.limit = spec.dataset === 'stocks' ? 20 : 10;

    return new Response(JSON.stringify({
      ok: true,
      spec,
      model: 'claude-haiku-4-5',
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({
      ok: false,
      error: `Network error: ${(e as Error).message}`,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
