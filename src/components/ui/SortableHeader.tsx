import { ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SortableHeaderProps<K extends string> {
  /** Görünür başlık (örn: "1 Hafta %") */
  label: string;
  /** Bu kolonun sıralama anahtarı */
  sortKey: K;
  /**
   * Aktif sıralama anahtarı (parent'ın state'i).
   * String — K'dan farklı olabilir (null/empty durumlar icin esnek bırakıldı).
   */
  activeKey: string;
  /** Sıralama yönü */
  dir: 'asc' | 'desc';
  /** Başlığa tıklayınca tetiklenir — aynı kolon yeniden tıklanırsa parent yönü tersine çevirir */
  onClick: (key: K) => void;
  /** Hücre hizalama (varsayılan sağa) */
  align?: 'left' | 'right' | 'center';
  className?: string;
}

/**
 * Paylaşılır sıralanabilir tablo başlığı. Fonlar sayfasındaki pattern'i izler:
 * - Aktif kolon accent renkte + ▲/▼ ok
 * - Pasif kolon nötr + ArrowUpDown opak ikon (tıklanabilir görünür)
 *
 * Parent'ta state şöyle:
 *   const [sortKey, setSortKey] = useState<MyKey>('default');
 *   const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
 *   const setSort = (k: MyKey) => {
 *     if (k === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
 *     else { setSortKey(k); setSortDir('desc'); }
 *   };
 */
export function SortableHeader<K extends string>({
  label,
  sortKey,
  activeKey,
  dir,
  onClick,
  align = 'right',
  className,
}: SortableHeaderProps<K>) {
  const active = activeKey === sortKey;
  return (
    <th
      className={cn(
        'cursor-pointer select-none whitespace-nowrap px-2 py-2.5 text-[10px] uppercase tracking-wider transition hover:text-slate-200',
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
        active ? 'text-accent' : 'text-slate-500',
        className,
      )}
      onClick={() => onClick(sortKey)}
    >
      <span className={cn('inline-flex items-center gap-1', align === 'right' && 'justify-end', align === 'center' && 'justify-center')}>
        {label}
        {active ? (
          <span className="text-[9px]">{dir === 'asc' ? '▲' : '▼'}</span>
        ) : (
          <ArrowUpDown size={10} className="opacity-30" />
        )}
      </span>
    </th>
  );
}
