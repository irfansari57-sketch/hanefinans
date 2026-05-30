// TCMB EVDS — Vite dev proxy üzerinden (Hafta 2'de gerçek backend).
// Anahtar Vite tarafında header'a injekte edilir; frontend görmez.

import type { MacroIndicator } from '../types';

interface EvdsItem {
  Tarih?: string;
  [key: string]: string | number | undefined;
}

interface EvdsResponse {
  items?: EvdsItem[];
  totalCount?: number;
}

async function fetchSeries(seriesCode: string): Promise<{ value: number; date: string } | null> {
  // Son 60 günü tarama — TCMB serileri çoğu zaman birkaç günlük gecikmeli
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 60);
  const fmt = (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;

  // Vite proxy: /api/tcmb → https://evds2.tcmb.gov.tr/service/evds
  const path =
    `/api/tcmb/series=${encodeURIComponent(seriesCode)}` +
    `&startDate=${fmt(start)}&endDate=${fmt(end)}` +
    `&type=json&aggregationTypes=last&formulas=0`;

  try {
    const r = await fetch(path);
    if (!r.ok) return null;
    const j = (await r.json()) as EvdsResponse;
    const items = j.items ?? [];
    if (items.length === 0) return null;
    // Son non-null değeri bul
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      for (const [k, v] of Object.entries(item)) {
        if (k === 'Tarih' || k === 'YEARWEEK' || v == null || v === '') continue;
        const n = typeof v === 'number' ? v : parseFloat(String(v));
        if (Number.isFinite(n)) {
          return { value: n, date: String(item.Tarih ?? '') };
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function loadTcmbMacro(): Promise<MacroIndicator[]> {
  const nowIso = new Date().toISOString();

  // Seri kodları — EVDS dashboard'tan doğrulayıp güncellemek mümkün
  const queries: Array<{ code: string; label: string; key: MacroIndicator['key']; unit?: string }> = [
    { code: 'TP.AB.A02',     label: 'Politika Faizi', key: 'Politika Faizi', unit: '%' },
    { code: 'TP.TUFE1YI.T1', label: 'TÜFE (Yıllık)',  key: 'Politika Faizi' /* placeholder */, unit: '%' },
  ];

  const results: MacroIndicator[] = [];
  for (const q of queries) {
    const res = await fetchSeries(q.code);
    if (res) {
      results.push({
        key: q.key,
        label: q.label,
        value: res.value,
        unit: q.unit,
        source: 'live',
        subLabel: 'TCMB',
        updatedAt: nowIso,
      });
    }
  }
  return results;
}

/** İstenen seri kodu için tek değer döndürür (debug / esnek kullanım). */
export async function fetchTcmbValue(seriesCode: string): Promise<number | null> {
  const r = await fetchSeries(seriesCode);
  return r?.value ?? null;
}
