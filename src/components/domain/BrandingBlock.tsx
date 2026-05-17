/**
 * Hane Mod Studio görseli + 3D parlama efektli "© 2026 HANE DIGITAL TECHNOLOGY INC."
 * Desktop sidebar ve mobile alt blokta aynı şekilde kullanılır.
 */

export function BrandingBlock() {
  return (
    <div>
      {/* Görsel → Hane Mod Studio YouTube kanalı */}
      <a
        href="https://www.youtube.com/@hanemodstudio"
        target="_blank"
        rel="noreferrer"
        className="block overflow-hidden rounded-lg border border-border bg-gradient-to-br from-slate-900 via-slate-800 to-black transition hover:border-accent/40 hover:shadow-lg hover:shadow-accent/10"
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
          className="hidden h-20 items-center justify-center text-xs font-black tracking-[0.2em] text-slate-300"
          style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}
        >
          HANE MOD STUDIO
        </div>
      </a>

      {/* 3D katmanlı şirket adı + © → hanetechnology.com — parlama efektli arka plan */}
      <a
        href="https://www.hanetechnology.com/"
        target="_blank"
        rel="noreferrer"
        className="group brand-shine-bg mt-3 block rounded-lg px-3 py-3.5"
        title="Hane Digital Technology Inc."
      >
        <h3
          lang="en"
          className="text-center text-[14px] font-black tracking-wider transition group-hover:brightness-125"
          style={{
            color: '#e2e8f0',
            textShadow: [
              '0 1px 0 #1e293b',
              '0 2px 0 #1a253a',
              '0 3px 0 #16213a',
              '0 4px 0 #131e36',
              '0 5px 0 #0f1a32',
              '0 6px 4px rgba(0,0,0,0.6)',
              '0 0 12px rgba(34, 211, 238, 0.25)',
            ].join(', '),
            letterSpacing: '0.05em',
            lineHeight: '1.2',
          }}
        >
          © 2026 HANE DIGITAL<br />TECHNOLOGY INC.
        </h3>
        <p lang="en" className="mt-1.5 text-center text-[10px] text-slate-400 transition group-hover:text-slate-300">
          All rights reserved.
        </p>
      </a>
    </div>
  );
}
