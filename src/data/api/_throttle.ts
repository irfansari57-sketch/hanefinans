/**
 * Yahoo Finance (ve benzeri rate-limit'li API'ler) icin global throttle helper.
 *
 * Neden:
 *   Yahoo `/api/yahoo/*` proxy'sine Panel acilisinda 30+ paralel istek gidiyor
 *   (macro spot fetch'leri + sparkline + crypto + XUTUM + BIST snapshot vs).
 *   Yahoo cluster'i 6+ concurrent request'i 429 ile geri ceviriyor. Sonuc:
 *   Chart'lar bos, sparkline bos, VAKBN gibi hisse period degerleri "—".
 *
 * Cozum:
 *   - Semaphore: max N concurrent fetch (Yahoo icin 4 iyi bir denge)
 *   - Jitter: her istekten once 0-150ms random gecikme — burst engelle
 *   - Retry: 429 alinca 1s + jitter backoff, max 2 deneme
 */

interface ThrottleOpts {
  /** Max concurrent inflight — default 4 */
  concurrency?: number;
  /** Rastgele jitter max ms — default 150 */
  jitterMs?: number;
  /** 429 alinca kac kere retry — default 2 */
  maxRetries?: number;
  /** Retry base backoff ms — default 1000 */
  backoffBaseMs?: number;
}

/**
 * Semaphore-based throttle: N slot ile paralel fetch kilitle.
 * Kilit slot'u alinamazsa promise queue'ya girer, biri release edince alir.
 */
function createSemaphore(max: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  return {
    async acquire(): Promise<void> {
      if (active < max) { active++; return; }
      return new Promise<void>((resolve) => { queue.push(resolve); });
    },
    release() {
      active--;
      const next = queue.shift();
      if (next) { active++; next(); }
    },
  };
}

// Global semaphore — tum throttledFetch cagrilari ayni pool'u paylasir.
const YAHOO_SEM = createSemaphore(4);

function jitter(maxMs: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.floor(Math.random() * maxMs)));
}

/**
 * Throttled fetch: normal fetch signature + otomatik queue + retry.
 * Rate-limit'e karsi Yahoo 429 chain'ini engellemek icin kullanilir.
 */
export async function throttledFetch(input: RequestInfo | URL, init?: RequestInit, opts?: ThrottleOpts): Promise<Response> {
  const jitterMs = opts?.jitterMs ?? 150;
  const maxRetries = opts?.maxRetries ?? 2;
  const backoffBaseMs = opts?.backoffBaseMs ?? 1000;

  await YAHOO_SEM.acquire();
  try {
    // Ilk fetch oncesi kucuk jitter — burst'i dagit
    if (jitterMs > 0) await jitter(jitterMs);

    let attempt = 0;
    let lastResp: Response | null = null;
    while (attempt <= maxRetries) {
      const resp = await fetch(input, init);
      lastResp = resp;

      // 429 veya 503 → backoff + retry
      if ((resp.status === 429 || resp.status === 503) && attempt < maxRetries) {
        // Consume body ki connection release olsun
        try { await resp.text(); } catch { /* ignore */ }
        // Exponential backoff + jitter: 1s, 2s, 4s...
        const wait = backoffBaseMs * Math.pow(2, attempt) + Math.floor(Math.random() * 500);
        await new Promise((r) => setTimeout(r, wait));
        attempt++;
        continue;
      }
      return resp;
    }
    // maxRetries asilirsa son 429 response'i don
    return lastResp!;
  } finally {
    YAHOO_SEM.release();
  }
}
