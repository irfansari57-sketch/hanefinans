/**
 * /assets/* koruması (15 Eki 2026) — SPA fallback zehirlenmesine karşı.
 *
 * Canlıda gözlenen kök neden: deployment geçişi sırasında henüz var olmayan bir
 * hashed asset istendiğinde Pages SPA fallback olarak index.html'i 200 ile döndü;
 * `_headers`'taki `/assets/*` kuralı yol bazlı eşleştiği için o HTML yanıtına da
 * `max-age=31536000, immutable` uygulandı → edge VE tarayıcı HTTP cache'i bir yıl
 * boyunca JS URL'sinde HTML sakladı ("MIME type text/html" hatası, hard reload
 * dahil hiçbir istemci kurtarması işe yaramadı).
 *
 * Bu fonksiyon asset isteğini statik katmana iletir; yanıt HTML ise (dosya yok)
 * 404 + no-store döner, böylece hiçbir cache zehirlenmez ve bootGuard/chunk-retry
 * temiz bir hata görür. Gerçek asset'ler değişmeden geçer (immutable başlıkla).
 */
interface Env { ASSETS: { fetch: (req: Request) => Promise<Response> } }

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const res = await env.ASSETS.fetch(request);
  const ct = res.headers.get('content-type') ?? '';
  if (res.ok && /text\/html/i.test(ct)) {
    return new Response('Not found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Asset-Guard': 'spa-fallback-blocked' },
    });
  }
  return res;
};
