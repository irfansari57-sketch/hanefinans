/**
 * Canary endpoint — Pages Functions runtime'ının sağlıklı çalıştığını doğrular.
 * Hiçbir external fetch yapmaz, sadece JSON döner. Eğer bu 502 verirse,
 * Pages deploy katmanında bir sorun var demektir, kod tarafında değil.
 */
export const onRequest: PagesFunction = async () => {
  return new Response(JSON.stringify({
    ok: true,
    service: 'hanefinans-pages',
    ts: new Date().toISOString(),
    runtime: 'cloudflare-pages-functions',
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  });
};
