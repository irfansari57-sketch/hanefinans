import { describe, it, expect } from 'vitest';
import { buildChartEvents, classifyEvent } from './chartEvents';
import type { NewsItem } from '@/data/types';

const mk = (title: string, daysAgo: number, extra: Partial<NewsItem> = {}): NewsItem => ({
  id: title, source: 'KAP', symbols: ['THYAO'], importance: 5, title, summary: '',
  publishedAt: new Date(Date.now() - daysAgo * 86400_000).toISOString(), ...extra,
});

describe('chartEvents', () => {
  it('temettü / bedelsiz / geri alım / bilanço / KAP sınıflanır, alakasız haber atlanır', () => {
    expect(classifyEvent(mk('THYAO temettü ödemesi 12 TL', 1))?.kind).toBe('temettu');
    expect(classifyEvent(mk('Bedelsiz sermaye artırımı %200', 1))?.kind).toBe('bedelsiz');
    expect(classifyEvent(mk('Pay geri alım programı başladı', 1))?.kind).toBe('geri-alim');
    expect(classifyEvent(mk('3. çeyrek bilanço: net kar 2 mlr', 1))?.kind).toBe('bilanco');
    expect(classifyEvent(mk('KAP: yeni uçak siparişi', 1))?.kind).toBe('kap');
    expect(classifyEvent(mk('Borsa güne yükselişle başladı', 1))).toBeNull();
  });
  it('kritik haber her zaman kritik etiketi alır', () => {
    expect(classifyEvent(mk('X şirketi konkordato', 1, { critical: true, criticalReason: 'Konkordato' }))?.label).toBe('Kritik · Konkordato');
  });
  it('aynı gün aynı tür tek olay; kronolojik numaralanır; max uygulanır', () => {
    const news = [
      mk('Temettü 1', 10), mk('Temettü tekrar', 10), mk('Bedelsiz %100', 30), mk('KAP: sözleşme imzalandı', 5),
      ...Array.from({ length: 10 }, (_, i) => mk(`KAP: ihale ${i}`, 40 + i)),
    ];
    const ev = buildChartEvents(news, { max: 5 });
    expect(ev.length).toBe(5);
    expect(ev.map((e) => e.n)).toEqual([1, 2, 3, 4, 5]);
    for (let i = 1; i < ev.length; i++) expect(ev[i].date).toBeGreaterThanOrEqual(ev[i - 1].date);
    expect(ev.filter((e) => e.kind === 'temettu').length).toBe(1);
    // öncelik: temettü/bedelsiz KAP'tan önce tutulur
    expect(ev.some((e) => e.kind === 'bedelsiz')).toBe(true);
  });
  it('pencere dışı olaylar atılır', () => {
    const ev = buildChartEvents([mk('Temettü', 400), mk('Temettü', 3)], { from: Date.now() - 365 * 86400_000 });
    expect(ev.length).toBe(1);
  });
});
