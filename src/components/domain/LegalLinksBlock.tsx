import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';

/**
 * Yasal sayfaların hızlı erişim bloğu — sidebar'ın en üstüne yerleştirilir.
 * KVKK, Mesafeli Satış, Üyelik, İade, Çerezler tek tıkla.
 */

const LINKS = [
  { to: '/legal/kvkk', label: 'KVKK Aydınlatma' },
  { to: '/legal/mesafeli-satis-sozlesmesi', label: 'Mesafeli Satış Sözleşmesi' },
  { to: '/legal/uyelik-sozlesmesi', label: 'Üyelik Sözleşmesi' },
  { to: '/legal/iade-politikasi', label: 'İade Politikası' },
  { to: '/legal/cerez-politikasi', label: 'Çerez Politikası' },
];

export function LegalLinksBlock() {
  return (
    <div className="rounded-lg border border-border bg-bg-soft/40 p-2.5">
      <div className="mb-1.5 flex items-center gap-1.5 px-1">
        <FileText size={11} className="text-accent" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Yasal Bilgilendirme</span>
      </div>
      <ul className="space-y-0.5">
        {LINKS.map((l) => (
          <li key={l.to}>
            <Link
              to={l.to}
              className="block rounded px-2 py-1 text-[11px] text-slate-400 transition hover:bg-bg-card hover:text-accent"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
