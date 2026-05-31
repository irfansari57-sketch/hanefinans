/**
 * /takvim — Ekonomik takvim sayfasi (standalone).
 *
 * Kurate edilmis TR-odakli olay listesi. Tum kullanicilara acik (free + paid)
 * cunku makro takvim kamusal bilgi.
 */

import { PageHeader } from '@/components/ui/PageHeader';
import { SeoHead } from '@/components/seo/SeoHead';
import { EconomicCalendarWidget } from '@/components/domain/EconomicCalendarWidget';
import { Info } from 'lucide-react';

export function EconomicCalendarPage() {
  return (
    <>
      <SeoHead
        title="Ekonomik Takvim"
        description="TCMB, FED, ECB toplantilari; TUFE, GSYIH, NFP veri aciklamalari; Turkiye siyasi gundem ve VIOP vade sonu. Yatirim kararlarini etkileyecek tum onemli olaylar."
        path="/takvim"
      />
      <PageHeader
        title="Ekonomik Takvim"
        subtitle="TR + global merkez bankalari, veri aciklamalari, Turkiye siyasi gundemi, BIST tatil + VIOP vade"
      />

      <div className="mb-3 flex items-start gap-2 rounded-lg border border-accent/30 bg-accent/5 p-3 text-xs">
        <Info size={14} className="mt-0.5 shrink-0 text-accent" />
        <p className="text-slate-300">
          Yuksek etki (kirmizi nokta) olaylar — TCMB faiz, FED FOMC, TUFE, NFP — yatirim
          kararlarini dogrudan etkiler. Tahmini tarihler aciklamalarda belirtilir.
        </p>
      </div>

      <EconomicCalendarWidget daysAhead={60} maxItems={50} />
    </>
  );
}
