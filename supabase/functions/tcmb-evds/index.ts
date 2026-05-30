// Hane Finans — TCMB EVDS proxy & cache
// Çağrı: invoke('tcmb-evds')  → güncel Politika Faizi + TÜFE yıllık değişim
// Secret gerekli: TCMB_API_KEY
//
// EVDS seri kodları:
//   TP.TUFE1YI.T1   — TÜFE Yıllık değişim (%) (örnek; doğrulamayı dashboardda yap)
//   TP.PY.P01.M01   — TCMB Bir Hafta Vadeli Repo Faiz Oranı (politika faizi)
//   Daha fazla seri için: https://evds2.tcmb.gov.tr → Veri Tabloları
//
// NOT: Seri kodları zaman zaman değişir. Çalışmazsa Dashboard → "Seri arama" ile doğrula.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, handleCors, jsonResponse } from '../_shared/cors.ts';

const EVDS_BASE = 'https://evds2.tcmb.gov.tr/service/evds';

interface EvdsResponse {
  items?: Array<Record<string, string | number>>;
  totalCount?: number;
}

async function fetchSeries(seriesCode: string, apiKey: string): Promise<number | null> {
  // Son 30 gün
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 30);
  const fmt = (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;

  const url =
    `${EVDS_BASE}/series=${encodeURIComponent(seriesCode)}` +
    `&startDate=${fmt(start)}&endDate=${fmt(end)}` +
    `&type=json&aggregationTypes=last&formulas=0&frequency=5`;

  const r = await fetch(url, { headers: { key: apiKey } });
  if (!r.ok) return null;
  const j = (await r.json()) as EvdsResponse;
  const items = j.items ?? [];
  if (items.length === 0) return null;
  // Son non-null değeri bul
  const valueKey = Object.keys(items[0]).find((k) => k !== 'Tarih' && k !== 'YEARWEEK');
  if (!valueKey) return null;
  for (let i = items.length - 1; i >= 0; i--) {
    const v = items[i][valueKey];
    if (v != null && v !== '') {
      const n = typeof v === 'number' ? v : parseFloat(String(v));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const tcmbKey = Deno.env.get('TCMB_API_KEY');
  if (!tcmbKey) return jsonResponse({ error: 'TCMB_API_KEY tanımlı değil' }, 500);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(supabaseUrl, serviceRoleKey);

  // Seri kodları — EVDS Dashboard'tan doğrulayarak gerektiğinde güncelleyin
  const POLICY = 'TP.PY.P01.M01';
  const CPI_YOY = 'TP.TUFE1YI.T1';

  const [policy, cpi] = await Promise.all([fetchSeries(POLICY, tcmbKey), fetchSeries(CPI_YOY, tcmbKey)]);

  const updates: Array<Record<string, unknown>> = [];
  const now = new Date().toISOString();

  if (policy != null) {
    updates.push({
      key: 'tcmb_policy_rate',
      label: 'Politika Faizi',
      value: policy,
      unit: '%',
      source: 'tcmb',
      fetched_at: now,
    });
  }
  if (cpi != null) {
    updates.push({
      key: 'tcmb_cpi_yoy',
      label: 'TÜFE (Yıllık)',
      value: cpi,
      unit: '%',
      source: 'tcmb',
      fetched_at: now,
    });
  }

  if (updates.length > 0) {
    const { error } = await sb.from('macro_series').upsert(updates, { onConflict: 'key' });
    if (error) return jsonResponse({ error: error.message }, 500);
  }

  return jsonResponse({ ok: true, updated: updates });
});
