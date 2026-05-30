import { toast } from '@/components/ui/Toast';

/**
 * Optimistic delete + Geri Al helper'ı.
 *
 * Pattern: state hemen güncellenir (kullanıcı 0ms tepki görür), toast 5 saniye
 * "Geri Al" gösterilir. Tıklarsa `restore()` çalıştırılır.
 *
 * Kullanım:
 *   optimisticDelete({
 *     itemLabel: `GARAN`,
 *     scope: 'Takip Listesi',
 *     onDelete: () => watchlist.remove('GARAN'),  // anında çalıştırılır
 *     onUndo:   () => watchlist.add('GARAN'),     // toast butonuna basılırsa
 *   });
 *
 *   Sunucu sync hatası varsa caller `onDelete` içinde try/catch + rollback yapar.
 *   Çoğu yerel (Zustand/Dexie) işlem için hata olası değil → basit pattern yeter.
 */
export function optimisticDelete(opts: {
  /** Silinen şeyin etiketi (örn. "GARAN", "AFA fonu") */
  itemLabel: string;
  /** Kapsam — toast başlığında görünür (örn. "Takip Listesi") */
  scope: string;
  /** Anında çalışan silme operasyonu (state mutation) */
  onDelete: () => void;
  /** Toast'ta Geri Al'a basılırsa çalışacak restore */
  onUndo: () => void;
  /** Toast TTL (ms), default 5000 — undo penceresi */
  ttlMs?: number;
}) {
  // 1) State'i hemen güncelle
  opts.onDelete();
  // 2) Geri Al toast'unu göster
  toast.info(
    `${opts.scope}`,
    `${opts.itemLabel} çıkarıldı`,
    {
      ttlMs: opts.ttlMs ?? 5000,
      action: {
        label: 'Geri Al',
        onClick: () => {
          try {
            opts.onUndo();
            toast.success('Geri alındı', `${opts.itemLabel} eklendi`);
          } catch {
            toast.error('Geri alınamadı', 'Tekrar dene veya manuel ekle');
          }
        },
      },
    },
  );
}

/**
 * Optimistic add + sunucu hatası durumunda otomatik rollback.
 *
 * Kullanım:
 *   await optimisticAdd({
 *     itemLabel: 'AFA',
 *     scope: 'Fon Takibi',
 *     onAdd:    () => state.add(item),
 *     persist:  () => repo.save(item),  // async, hata fırlatabilir
 *     onRollback: () => state.remove(item),
 *   });
 */
export async function optimisticAdd(opts: {
  itemLabel: string;
  scope: string;
  onAdd: () => void;
  persist: () => Promise<unknown>;
  onRollback: () => void;
}): Promise<void> {
  // 1) State'i hemen güncelle
  opts.onAdd();
  // 2) Arka planda persist et
  try {
    await opts.persist();
    // Success toast opsiyonel; çoğu zaman UI'da zaten görünür değişiklik var
  } catch {
    // Persist başarısızsa state'i geri al + kullanıcıyı bilgilendir
    opts.onRollback();
    toast.error(`${opts.scope}`, `${opts.itemLabel} eklenemedi, tekrar dene`);
  }
}
