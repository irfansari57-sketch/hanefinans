/**
 * Hane Mod Studio + Hane Digital Technology copyright bloğu.
 * FT SALMON refactor: siyah 3D neon efekt kaldırıldı, krem-tint kart +
 * salmon hairline + sade tipografi. Sağ panele ve mobil footer'a asılır.
 */

export function BrandingBlock() {
  return (
    <div className="rounded-lg border border-accent/20 bg-bg-card/40 p-3">
      {/* Sponsor rozeti */}
      <div className="mb-2 flex items-center gap-1.5">
        <span className="h-1 w-1 rounded-full bg-accent" />
        <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-accent">
          Sponsor
        </span>
      </div>

      {/* Görsel → Hane Mod Studio YouTube kanalı */}
      <a
        href="https://www.youtube.com/@hanemodstudio"
        target="_blank"
        rel="noreferrer"
        className="block overflow-hidden rounded-md border border-accent/15 transition hover:border-accent/40"
        title="Hane Mod Studio YouTube kanalı"
      >
        <img
          src="/brand/hane-mod-studio.png"
          alt="Hane Mod Studio"
          className="w-full h-auto object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
            const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
            if (fallback) fallback.style.display = 'flex';
          }}
        />
        <div
          lang="en"
          className="hidden h-16 items-center justify-center text-xs font-semibold tracking-[0.15em] text-slate-500 dark:text-slate-400"
        >
          HANE MOD STUDIO
        </div>
      </a>
      <p className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">
        Hane Mod Studio — FiveM haritaları ve showcase içerikleri
      </p>

      {/* Ince ayirici — FT gazete kolonu tarzi */}
      <div className="my-3 h-px bg-accent/15" />

      {/* Copyright — sade, editorial */}
      <a
        href="https://www.hanetechnology.com/"
        target="_blank"
        rel="noreferrer"
        className="block text-center transition hover:opacity-80"
        title="Hane Digital Technology Inc."
      >
        <p lang="en" className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600 dark:text-slate-300">
          © 2026 Hane Digital Technology Inc.
        </p>
        <p lang="en" className="mt-0.5 text-[9px] uppercase tracking-wider text-slate-500 dark:text-slate-500">
          All rights reserved
        </p>
      </a>
    </div>
  );
}
