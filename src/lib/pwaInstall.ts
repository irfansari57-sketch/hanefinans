/**
 * PWA install singleton — beforeinstallprompt event'ini app seviyesinde
 * yakalar, paylaşımlı state olarak sunar.
 *
 * Neden gerekli? Banner ve Settings sayfası gibi farklı yerlerden install
 * tetiklenebilir; event ise tarayıcıdan tek seferlik gelir.
 *
 * Kullanım:
 *   - main.tsx: init() çağır (bir kez)
 *   - Component: subscribe(setState) ile state değişikliklerini dinle
 *   - Tıklamada: tryInstall() çağır
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface PwaInstallState {
  /** beforeinstallprompt event'i yakalandı mı (Chromium tarafında) */
  canInstallNative: boolean;
  /** Tarayıcı/cihaz iOS Safari mi (manual install gerekir) */
  isIos: boolean;
  /** PWA zaten standalone modunda çalışıyor mu */
  isStandalone: boolean;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let initialized = false;

const listeners = new Set<(s: PwaInstallState) => void>();

function detectIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua) && !/crios|fxios|edgios/.test(ua);
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if ((navigator as Navigator & { standalone?: boolean }).standalone) return true;
  return window.matchMedia('(display-mode: standalone)').matches;
}

function emit() {
  const state: PwaInstallState = {
    canInstallNative: deferredPrompt !== null,
    isIos: detectIos(),
    isStandalone: detectStandalone(),
  };
  listeners.forEach((cb) => {
    try { cb(state); } catch { /* */ }
  });
}

/** Uygulama başlangıcında bir kez çağır (main.tsx). */
export function initPwaInstall() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    emit();
  });
  // Install gerçekleşince event temizle
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    emit();
  });
}

/** Mevcut state — component'in initial state'i için. */
export function getPwaInstallState(): PwaInstallState {
  return {
    canInstallNative: deferredPrompt !== null,
    isIos: detectIos(),
    isStandalone: detectStandalone(),
  };
}

/** State değişiklikleri için abone ol. unsubscribe fonksiyonu döner. */
export function subscribePwaInstall(cb: (s: PwaInstallState) => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/**
 * Install diyaloğunu tetikle. Chromium'da native prompt açar, dönüş
 * 'accepted' | 'dismissed' | 'unavailable' olur. iOS'ta unavailable döner
 * (manuel adımlar UI'da gösterilmeli).
 */
export async function tryInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) return 'unavailable';
  try {
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    // Native prompt bir kere kullanılabilir
    deferredPrompt = null;
    emit();
    return choice.outcome;
  } catch {
    return 'unavailable';
  }
}
