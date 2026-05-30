/**
 * /takvim — Ekonomik takvim sayfası (standalone).
 *
 * TradingView widget + kısa açıklama. Tüm kullanıcılara açık (free + paid).
 * Premium hisseyi paywall'a koyduk; takvim ücretsiz olmalı — hisse alımına
 * neden olacak makro kararı (FED faizi vb.) herkesin görmesi gereken kamusal bilgi.
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
        description="Türkiye + global makro veri açıklamaları, merkez bankası faiz kararları, enflasyon, istihdam — gerçek zamanlı ekonomik takvim."
        path="/takvim"
      />
      <PageHeader
        title="Ekonomik Takvim"
        subtitle="TR + global makro veri açıklamaları, merkez bankası kararları, etki ölçeği"
      />

      <div className="mb-3 flex items-start gap-2 rounded-lg border border-accent/30 bg-accent/5 p-3 text-xs">
        <Info size={14} className="mt-0.5 shrink-0 text-accent" />
        <p className="text-slate-300">
          Önemli ekonomik veriler yatırım kararlarını doğrudan etkiler.
          Yıldızlı (yüksek etki) olaylar — TCMB faiz, FED kararı, TÜFE, NFP — özellikle takip et.
        </p>
      </div>

      <EconomicCalendarWidget height={720} importance="0,1" countries="tr,us,eu,de,gb,jp" />

      <p className="mt-3 text-[10px] text-slate-500">
        Veri kaynağı: TradingView. Saatler UTC+3 (TR) bazlıdır.
      </p>
    </>
  );
}
