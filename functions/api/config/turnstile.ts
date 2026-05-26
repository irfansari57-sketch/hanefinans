/**
 * Public Turnstile site key — runtime'da backend env'den okur.
 * Vite build-time env (VITE_TURNSTILE_SITE_KEY) Cloudflare Pages'de
 * bazi durumlarda inject edilmiyor; bu endpoint runtime fallback.
 * Site key public bir degerdir (browserda zaten gorunur), gizli degildir.
 */

interface Env {
  VITE_TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
}

export const onRequestGet: PagesFunction<Env> = ({ env }) => {
  const siteKey = env.VITE_TURNSTILE_SITE_KEY || env.TURNSTILE_SITE_KEY || '';
  return new Response(
    JSON.stringify({ siteKey }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300', // 5dk edge cache
      },
    },
  );
};
