import { useState, useEffect } from 'react';
import { Youtube, X, ChevronUp, ChevronDown, ExternalLink, GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * YouTube'un 3.taraf embed politikası TR'de "Bu video kullanılamıyor" hatası veriyor.
 * Bu yüzden iframe yerine kürate edilmiş **arama linkleri** sunuyoruz — tıklayınca
 * YouTube yeni sekmede açılır, sorunsuz oynatır.
 */

const VISIBLE_KEY = 'fa.youtube.visible.v1';

interface Resource {
  title: string;
  description: string;
  url: string;
}

const RESOURCES: Resource[] = [
  {
    title: 'BIST Eğitim — Akademist',
    description: 'Borsa İstanbul resmi eğitim videoları',
    url: 'https://www.youtube.com/results?search_query=borsa+istanbul+akademist+e%C4%9Fitim',
  },
  {
    title: 'Teknik Analiz 101',
    description: 'RSI, MACD, Bollinger, Fibonacci — Türkçe',
    url: 'https://www.youtube.com/results?search_query=teknik+analiz+t%C3%BCrk%C3%A7e+e%C4%9Fitim',
  },
  {
    title: 'Yatırım Fonları Rehberi',
    description: 'TEFAS, fon seçimi, portföy çeşitlendirme',
    url: 'https://www.youtube.com/results?search_query=yat%C4%B1r%C4%B1m+fonu+e%C4%9Fitim+t%C3%BCrk%C3%A7e+TEFAS',
  },
  {
    title: 'Finansal Okuryazarlık',
    description: 'Bütçe, tasarruf, yatırım planı',
    url: 'https://www.youtube.com/results?search_query=finansal+okuryazarl%C4%B1k+e%C4%9Fitim+t%C3%BCrk%C3%A7e',
  },
  {
    title: 'Kripto Para Başlangıç',
    description: 'Bitcoin, Ethereum, cüzdan, borsa kullanımı',
    url: 'https://www.youtube.com/results?search_query=kripto+para+ba%C5%9Flang%C4%B1%C3%A7+t%C3%BCrk%C3%A7e',
  },
  {
    title: 'Temettü Stratejisi',
    description: 'Pasif gelir için temettü hisseleri',
    url: 'https://www.youtube.com/results?search_query=temett%C3%BC+hisse+t%C3%BCrk%C3%A7e+strateji',
  },
  {
    title: 'Risk Yönetimi',
    description: 'Stop-loss, pozisyon büyüklüğü, koruma',
    url: 'https://www.youtube.com/results?search_query=risk+y%C3%B6netimi+yat%C4%B1r%C4%B1m+t%C3%BCrk%C3%A7e',
  },
];

export function YoutubeWidget() {
  const [visible, setVisible] = useState<boolean>(() => {
    try { return localStorage.getItem(VISIBLE_KEY) !== '0'; } catch { return true; }
  });
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(VISIBLE_KEY, visible ? '1' : '0'); } catch {}
  }, [visible]);

  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        className="fixed bottom-3 left-3 z-30 hidden md:inline-flex items-center gap-2 rounded-full border border-border bg-bg-card/90 backdrop-blur-md px-3 py-2 text-xs text-slate-300 shadow-xl hover:border-accent/40"
        title="Eğitim videolarını aç"
      >
        <Youtube size={14} className="text-danger" />
        Eğitim
      </button>
    );
  }

  return (
    <div className="fixed bottom-3 left-3 z-30 hidden md:block">
      <div className={cn('w-72 overflow-hidden rounded-xl border border-border bg-bg-card/95 backdrop-blur-md shadow-2xl')}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-gradient-to-r from-danger/10 to-transparent px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <Youtube size={14} className="shrink-0 text-danger" />
            <span className="text-xs font-semibold text-slate-100">Finansal Okuryazarlık</span>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              onClick={() => setCollapsed((v) => !v)}
              className="rounded p-1 text-slate-400 hover:bg-bg-soft hover:text-slate-200"
              title={collapsed ? 'Genişlet' : 'Daralt'}
            >
              {collapsed ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
            <button
              onClick={() => setVisible(false)}
              className="rounded p-1 text-slate-400 hover:bg-bg-soft hover:text-danger"
              title="Kapat"
            >
              <X size={11} />
            </button>
          </div>
        </div>

        {!collapsed && (
          <>
            <div className="max-h-72 space-y-1.5 overflow-y-auto p-2.5">
              <p className="px-1 pb-1 text-[10px] text-slate-500">
                💡 Konuya tıkla → YouTube'da en güncel videolar açılır
              </p>
              {RESOURCES.map((r) => (
                <a
                  key={r.title}
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-start gap-2 rounded-lg border border-border bg-bg-soft p-2 transition hover:border-danger/40 hover:bg-bg-card"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-danger/15 text-danger group-hover:bg-danger/25">
                    <GraduationCap size={12} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 text-[11px] font-medium text-slate-100">
                      <span className="truncate">{r.title}</span>
                      <ExternalLink size={9} className="shrink-0 opacity-0 transition group-hover:opacity-60" />
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-[10px] text-slate-500">{r.description}</p>
                  </div>
                </a>
              ))}
            </div>
            <div className="border-t border-border bg-bg-soft px-2.5 py-1.5 text-center">
              <a
                href="https://www.youtube.com/results?search_query=borsa+yat%C4%B1r%C4%B1m+t%C3%BCrk%C3%A7e"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[10px] text-accent hover:underline"
              >
                Tümü için YouTube'da ara <ExternalLink size={9} />
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
