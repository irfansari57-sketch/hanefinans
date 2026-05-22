import '@testing-library/jest-dom/vitest';

// JSDOM yetersiz kalan API'lar için minimal shim'ler
// matchMedia — usePinnedSection ve responsive hook'lar kullanıyor
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// IntersectionObserver — lazy load gözleminde kullanılır
if (typeof globalThis !== 'undefined' && !('IntersectionObserver' in globalThis)) {
  class IO {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  (globalThis as unknown as { IntersectionObserver: typeof IO }).IntersectionObserver = IO;
}
