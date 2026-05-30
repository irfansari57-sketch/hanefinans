import type { NewsItem, SentimentMention, Sentiment } from './types';

const POSITIVE = [
  'yükseliş', 'yükseldi', 'yükselir', 'artış', 'arttı', 'kazandı', 'kazanç', 'rekor',
  'büyüme', 'büyüdü', 'genişleme', 'iyileşme', 'iyi', 'olumlu', 'pozitif',
  'sözleşme', 'anlaşma', 'imzaladı', 'imzalandı', 'yatırım', 'satın aldı',
  'patladı', 'sıçradı', 'tavan', 'rally', 'bullish',
];
const NEGATIVE = [
  'düşüş', 'düştü', 'düşer', 'azaldı', 'kayıp', 'zarar', 'iflas', 'taban',
  'küçüldü', 'olumsuz', 'negatif', 'kötü', 'kriz', 'çakıldı', 'çöktü',
  'erteleme', 'iptal', 'soruşturma', 'ceza', 'dava', 'bearish',
];

function scoreText(text: string): { score: number; sentiment: Sentiment } {
  const lower = text.toLowerCase();
  let pos = 0;
  let neg = 0;
  for (const w of POSITIVE) if (lower.includes(w)) pos++;
  for (const w of NEGATIVE) if (lower.includes(w)) neg++;
  const score = pos - neg;
  if (score >= 2) return { score, sentiment: 'positive' };
  if (score <= -2) return { score, sentiment: 'negative' };
  return { score, sentiment: 'neutral' };
}

/**
 * Mevcut haber akışından sembol başına bahis sayısını ve duygu yönünü çıkarır.
 * Reddit alternatifi: GNews / KAP / mock kaynak fark etmez, ne varsa onun üstünden çalışır.
 */
export function deriveSentimentFromNews(news: NewsItem[]): SentimentMention[] {
  const map = new Map<string, { count: number; posTotal: number; negTotal: number; texts: string[] }>();

  for (const item of news) {
    const blob = `${item.title} ${item.summary}`;
    const { score } = scoreText(blob);
    for (const symbol of item.symbols) {
      const entry = map.get(symbol) ?? { count: 0, posTotal: 0, negTotal: 0, texts: [] };
      entry.count += 1;
      if (score > 0) entry.posTotal += score;
      else if (score < 0) entry.negTotal += -score;
      entry.texts.push(blob);
      map.set(symbol, entry);
    }
  }

  const results: SentimentMention[] = [];
  for (const [symbol, e] of map.entries()) {
    const net = e.posTotal - e.negTotal;
    const sentiment: Sentiment = net >= 2 ? 'positive' : net <= -2 ? 'negative' : 'neutral';
    results.push({ symbol, count: e.count, sentiment });
  }

  return results.sort((a, b) => b.count - a.count);
}
