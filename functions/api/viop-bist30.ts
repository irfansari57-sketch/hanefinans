/**
 * Deprecated: BIST 30 Vadeli kartı kaldırıldı.
 * VIOP için ücretsiz güvenilir veri kaynağı bulunamadı (CF Worker IP'leri
 * Türk finans sitelerinden bloklu, TradingView ticker formatları sembolü
 * tanımıyor). BIST 30 SPOT kartı yeterli kabul edildi.
 *
 * Bu endpoint frontend'den artık çağrılmıyor; dosya silinemediği için
 * (mount permission) deprecated stub olarak duruyor.
 */

export const onRequest: PagesFunction = async () => {
  return new Response(JSON.stringify({ ok: false, deprecated: true, message: 'BIST 30 Vadeli kaldırıldı — BIST 30 SPOT kullanılıyor' }), {
    status: 410,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' },
  });
};
