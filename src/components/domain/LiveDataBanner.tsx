import { Radio } from 'lucide-react';

/**
 * Canlı veri kaynakları özet kutusu — sidebar'ın en başında.
 * Önceden her sayfada ayrı bilgi banner'ı vardı; tek yerde topluyoruz.
 */
export function LiveDataBanner() {
  return (
    <div className="rounded-lg border border-success/30 bg-success/5 p-2.5">
      <div className="flex items-center gap-1.5">
        <span className="relative inline-flex">
          <span className="absolute inline-flex h-2 w-2 rounded-full bg-success opacity-75 animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-success">Canlı Veri</span>
      </div>
      <ul className="mt-1.5 space-y-1 text-[10px] leading-relaxed text-slate-300">
        <li className="flex items-start gap-1.5">
          <Radio size={9} className="mt-0.5 shrink-0 text-success" />
          <span><strong>Hisseler:</strong> 60 sn'de bir Yahoo Finance — fiyat değişimleri yeşil/kırmızı parlar</span>
        </li>
        <li className="flex items-start gap-1.5">
          <Radio size={9} className="mt-0.5 shrink-0 text-success" />
          <span><strong>Fonlar:</strong> Saatlik TEFAS GitHub Actions feed</span>
        </li>
        <li className="flex items-start gap-1.5">
          <Radio size={9} className="mt-0.5 shrink-0 text-success" />
          <span><strong>Döviz/Kripto/Emtia:</strong> 2-5 dk auto-refresh</span>
        </li>
      </ul>
    </div>
  );
}
