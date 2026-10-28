/**
 * FundClusterBubbleChart — Portföy Ağı "Tür kümeleri" modeli (D, 28 Eki 2026, kullanıcı kararı).
 *
 * Her varlık türü (Yabancı Hisse, BIST Hisse, Fon/BYF, Repo, Döviz…) ayrı bir kesikli daire (küme);
 * küme içinde balonlar circle-packing ile dizilir (alan ∝ fondaki ağırlık). Kümeler merkezdeki fon
 * balonunun etrafına yerleşir; ağır küme merkeze yakın ve büyük. Küme etiketi tür toplamını yazar.
 * Tıklama → üst bileşen yan paneli açar (E+I korunur). Veri: KAP Portföy Dağılım Raporu (API `items`).
 *
 * Yerleşim deterministiktir (rastgelelik yok): aynı veri → aynı çizim.
 */
import { useMemo } from 'react';
import { cn } from '@/lib/utils';

export type ClusterItem = { kod: string; ad: string; sektor: string; agirlik: number; eskiAgirlik: number; fark: number; yabanci: boolean; yeni?: boolean };

const GROUP_STYLE: Record<string, { color: string; order: number }> = {
  'Yabancı Hisse': { color: 'rgb(var(--c-accent))', order: 0 },
  'Hisse (BIST)': { color: 'rgb(var(--c-success))', order: 1 },
  'Yatırım Fonu / BYF': { color: '#A78BFA', order: 2 },
  'Yabancı Fon': { color: '#C4B5FD', order: 3 },
  'Repo / Taahhütlü': { color: '#F59E0B', order: 4 },
  'Borçlanma Aracı': { color: '#FBBF24', order: 5 },
  'Kira Sertifikası': { color: '#FCD34D', order: 6 },
  'Kıymetli Maden': { color: '#FDE68A', order: 7 },
  'Döviz': { color: '#94A3B8', order: 8 },
  'Mevduat / Katılım': { color: '#CBD5E1', order: 9 },
  'Türev': { color: '#F472B6', order: 10 },
  'Diğer': { color: '#64748B', order: 11 },
};
const styleOf = (sektor: string) => GROUP_STYLE[sektor] ?? GROUP_STYLE['Diğer'];

type Placed = { x: number; y: number; r: number };

/** Sarmal (spiral) greedy paketleme — büyükten küçüğe, merkeze en yakın boş yer. */
function packCircles(radii: number[], gap = 4): Placed[] {
  const placed: Placed[] = [];
  for (const r of radii) {
    if (placed.length === 0) { placed.push({ x: 0, y: 0, r }); continue; }
    let best: Placed | null = null;
    let d = 0;
    while (!best && d < 2000) {
      const steps = Math.max(12, Math.floor(d / 4));
      for (let s = 0; s < steps; s++) {
        const a = (s / steps) * 2 * Math.PI;
        const x = d * Math.cos(a), y = d * Math.sin(a);
        if (placed.every((p) => Math.hypot(x - p.x, y - p.y) >= r + p.r + gap)) {
          if (!best || Math.hypot(x, y) < Math.hypot(best.x, best.y)) best = { x, y, r };
        }
      }
      d += 3;
    }
    placed.push(best ?? { x: 0, y: 0, r });
  }
  // kütle merkezini sıfırla
  const cx = placed.reduce((a, p) => a + p.x, 0) / placed.length;
  const cy = placed.reduce((a, p) => a + p.y, 0) / placed.length;
  return placed.map((p) => ({ x: p.x - cx, y: p.y - cy, r: p.r }));
}

export function FundClusterBubbleChart({
  fundCode, oneYearReturn, items, selected, onSelect, maxItems = 40,
}: {
  fundCode: string;
  oneYearReturn: number | null | undefined;
  items: ClusterItem[];
  selected?: string | null;
  onSelect?: (kod: string) => void;
  maxItems?: number;
}) {
  const layout = useMemo(() => {
    const all = [...items].filter((x) => x.agirlik > 0).sort((a, b) => b.agirlik - a.agirlik);
    const shown = all.slice(0, maxItems);
    const rest = all.slice(maxItems).reduce((a, x) => a + x.agirlik, 0);
    if (shown.length === 0) return null;
    const maxW = shown[0].agirlik;
    const R_MIN = 13, R_MAX = 54;
    const radius = (w: number) => R_MIN + Math.sqrt(w / maxW) * (R_MAX - R_MIN);

    // gruplar
    const byGroup = new Map<string, ClusterItem[]>();
    for (const it of shown) { const g = it.sektor || 'Diğer'; (byGroup.get(g) ?? byGroup.set(g, []).get(g)!).push(it); }
    const groups = [...byGroup.entries()].map(([name, its]) => {
      const packed = packCircles(its.map((x) => radius(x.agirlik)));
      const hull = Math.max(...packed.map((p) => Math.hypot(p.x, p.y) + p.r)) + 12;
      const total = its.reduce((a, x) => a + x.agirlik, 0);
      return { name, items: its, packed, hull, total, cx: 0, cy: 0 };
    }).sort((a, b) => b.total - a.total);

    // küme konumları: ağırlığa göre açı sırası, merkezden uzaklık = CENTER_R + boşluk + hull
    const CENTER_R = 64;
    const n = groups.length;
    groups.forEach((g, i) => {
      // en ağır küme sağda (0 rad), diğerleri saat yönünde eşit aralıklı
      const ang = (i / n) * 2 * Math.PI;
      const dist = CENTER_R + 28 + g.hull;
      g.cx = Math.cos(ang) * dist; g.cy = Math.sin(ang) * dist;
    });
    // çakışma giderme (küme-küme ve küme-merkez), 60 iterasyon basit itme
    for (let iter = 0; iter < 60; iter++) {
      let moved = false;
      for (let i = 0; i < n; i++) {
        const a = groups[i];
        // merkezle
        const dc = Math.hypot(a.cx, a.cy), minC = CENTER_R + 20 + a.hull;
        if (dc < minC) { const k = (minC - dc) / (dc || 1); a.cx += a.cx * k || minC; a.cy += a.cy * k; moved = true; }
        for (let j = i + 1; j < n; j++) {
          const b = groups[j];
          const dx = b.cx - a.cx, dy = b.cy - a.cy, d = Math.hypot(dx, dy) || 0.01, min = a.hull + b.hull + 14;
          if (d < min) {
            const push = (min - d) / 2, ux = dx / d, uy = dy / d;
            a.cx -= ux * push; a.cy -= uy * push; b.cx += ux * push; b.cy += uy * push; moved = true;
          }
        }
      }
      if (!moved) break;
    }
    // sınırlar → viewBox
    let minX = -CENTER_R - 10, minY = -CENTER_R - 10, maxX = CENTER_R + 10, maxY = CENTER_R + 10;
    for (const g of groups) {
      minX = Math.min(minX, g.cx - g.hull - 8); maxX = Math.max(maxX, g.cx + g.hull + 8);
      minY = Math.min(minY, g.cy - g.hull - 26); maxY = Math.max(maxY, g.cy + g.hull + 8);
    }
    return { groups, shown, rest, CENTER_R, box: { x: minX, y: minY, w: maxX - minX, h: maxY - minY }, hasFark: shown.some((x) => x.eskiAgirlik !== x.agirlik) };
  }, [items, maxItems]);

  if (!layout) return null;
  const { groups, CENTER_R, box, hasFark, shown, rest } = layout;
  const centerPos = (oneYearReturn ?? 0) >= 0;
  const centerColor = centerPos ? 'rgb(var(--c-success))' : 'rgb(var(--c-danger))';
  const fmt = (v: number, d = 1) => `%${v.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
  const shownTotal = shown.reduce((a, x) => a + x.agirlik, 0);

  return (
    <div className="flex flex-col items-center gap-3">
      <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} className="h-auto w-full max-w-[760px]" role="img"
        aria-label={`${fundCode} portföy ağı — ${groups.length} varlık türü kümesi, ${shown.length} varlık; balon alanı ağırlıkla orantılı`}>
        {/* bağlantılar merkez → küme */}
        {groups.map((g) => (
          <line key={`l-${g.name}`} x1={0} y1={0} x2={g.cx} y2={g.cy} style={{ stroke: styleOf(g.name).color }} strokeOpacity={0.28} strokeWidth={Math.max(0.8, (g.total / 100) * 6)} />
        ))}
        {/* küme halkaları + etiket */}
        {groups.map((g) => {
          const col = styleOf(g.name).color;
          return (
            <g key={`g-${g.name}`}>
              <circle cx={g.cx} cy={g.cy} r={g.hull} style={{ fill: col, stroke: col }} fillOpacity={0.045} strokeOpacity={0.4} strokeDasharray="4 4" strokeWidth={1.2} />
              <text x={g.cx} y={g.cy - g.hull - 8} textAnchor="middle" style={{ fill: col }} fontSize="11" fontWeight="700" fontFamily="Inter, system-ui">
                {g.name} · {fmt(g.total)}
              </text>
            </g>
          );
        })}
        {/* merkez */}
        <circle cx={0} cy={0} r={CENTER_R + 8} style={{ fill: centerColor }} fillOpacity={0.08} />
        <circle cx={0} cy={0} r={CENTER_R} style={{ fill: centerColor, stroke: centerColor }} fillOpacity={0.14} strokeWidth={2.5} />
        <text x={0} y={-12} textAnchor="middle" style={{ fill: 'rgb(var(--c-text-1))' }} fontSize="17" fontWeight="800" fontFamily="Inter, system-ui">{fundCode}</text>
        {Number.isFinite(oneYearReturn ?? NaN) && (
          <>
            <text x={0} y={8} textAnchor="middle" style={{ fill: centerColor }} fontSize="16" fontWeight="800" fontFamily="JetBrains Mono, monospace">{centerPos ? '+' : ''}{(oneYearReturn ?? 0).toFixed(2)}%</text>
            <text x={0} y={21} textAnchor="middle" style={{ fill: 'rgb(var(--c-text-3))' }} fontSize="8.5" fontFamily="Inter, system-ui">1Y getiri</text>
          </>
        )}
        <text x={0} y={36} textAnchor="middle" style={{ fill: 'rgb(var(--c-text-2))' }} fontSize="8.5" fontFamily="Inter, system-ui">
          {shown.length} varlık: {fmt(shownTotal)}{rest > 0.05 ? ` · diğer ${fmt(rest)}` : ''}
        </text>
        {/* balonlar */}
        {groups.map((g) => g.items.map((it, i) => {
          const p = g.packed[i]; const bx = g.cx + p.x, by = g.cy + p.y, r = p.r;
          const col = styleOf(g.name).color;
          const big = r >= 32, mid = r >= 20;
          const isSel = selected === it.kod;
          const sign = it.fark > 0 ? '+' : '';
          const farkCol = it.fark > 0.05 ? 'rgb(var(--c-success))' : it.fark < -0.05 ? 'rgb(var(--c-danger))' : 'rgb(var(--c-text-3))';
          return (
            <g key={`b-${g.name}-${it.kod}`} onClick={onSelect ? () => onSelect(it.kod) : undefined} style={onSelect ? { cursor: 'pointer' } : undefined} opacity={selected && !isSel ? 0.4 : 1}>
              <title>{`${it.kod}${it.ad && it.ad !== it.kod ? ' — ' + it.ad : ''}\n${g.name}\nAğırlık: %${it.agirlik.toFixed(2)}${hasFark ? `\nÖnceki: %${it.eskiAgirlik.toFixed(2)} · Fark: ${sign}${it.fark.toFixed(2)} puan` : ''}`}</title>
              <circle cx={bx} cy={by} r={r} style={{ fill: col, stroke: isSel ? 'rgb(var(--c-accent))' : col }} fillOpacity={isSel ? 0.3 : 0.13} strokeWidth={isSel ? 3 : big ? 1.8 : 1.3} />
              {mid ? (
                <>
                  <text x={bx} y={by - (big ? 8 : 4)} textAnchor="middle" style={{ fill: 'rgb(var(--c-text-1))' }} fontSize={big ? 11 : 9} fontWeight="700" fontFamily="Inter, system-ui">{it.kod}</text>
                  <text x={bx} y={by + (big ? 7 : 7)} textAnchor="middle" style={{ fill: 'rgb(var(--c-text-1))' }} fontSize={big ? 13 : 10} fontWeight="800" fontFamily="JetBrains Mono, monospace">{fmt(it.agirlik, big ? 2 : 1)}</text>
                  {big && hasFark && !it.yeni && (
                    <text x={bx} y={by + 20} textAnchor="middle" style={{ fill: farkCol }} fontSize="8.5" fontWeight="600" fontFamily="JetBrains Mono, monospace">{sign}{it.fark.toFixed(2)}</text>
                  )}
                  {big && it.yeni && (
                    <text x={bx} y={by + 20} textAnchor="middle" style={{ fill: 'rgb(var(--c-success))' }} fontSize="8" fontWeight="700" fontFamily="Inter, system-ui">YENİ</text>
                  )}
                </>
              ) : (
                <text x={bx} y={by + 3} textAnchor="middle" style={{ fill: 'rgb(var(--c-text-2))' }} fontSize={r >= 15 ? 7.5 : 6.5} fontWeight="700" fontFamily="Inter, system-ui">{it.kod}</text>
              )}
            </g>
          );
        }))}
      </svg>
      {/* lejant */}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] text-fg-2">
        {groups.map((g) => (
          <span key={`lg-${g.name}`} className={cn('inline-flex items-center gap-1.5')}>
            <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: styleOf(g.name).color }} />
            {g.name} <b className="font-mono text-fg">{fmt(g.total)}</b> <span className="text-fg-3">· {g.items.length}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
