import { describe, it, expect } from 'vitest';
import { formatMoney, formatNumber, formatCompact, formatPct } from './format';

describe('formatPct', () => {
  it('pozitif yüzde için + işareti ekler', () => {
    expect(formatPct(3.14)).toBe('+3.14%');
  });
  it('negatif yüzde olduğu gibi gelir', () => {
    expect(formatPct(-2.5)).toBe('-2.50%');
  });
  it('fraction digits parametresine uyar', () => {
    expect(formatPct(1.23456, 1)).toBe('+1.2%');
  });
});

describe('formatNumber', () => {
  it('Türkçe ondalık ayırıcısı virgül kullanır', () => {
    expect(formatNumber(1234.56)).toBe('1.234,56');
  });
  it('fractionDigits parametresine uyar', () => {
    expect(formatNumber(10, 0)).toBe('10');
  });
});

describe('formatCompact', () => {
  it('milyon değerleri kompakt formatta gösterir', () => {
    const out = formatCompact(1_500_000);
    // Türkçe locale'de "1,5 Mn" ya da benzeri olabilir → sadece numerik kısmı doğrula
    expect(out).toMatch(/1[,.]5/);
  });
});

describe('formatMoney', () => {
  it('TRY varsayılan olarak ₺ sembolü ekler', () => {
    const out = formatMoney(100);
    expect(out).toMatch(/₺/);
    expect(out).toMatch(/100/);
  });
  it('USD geçilirse $ sembolü ile gösterir', () => {
    const out = formatMoney(50, 'USD');
    // Türkçe locale + USD → "50,00 $" veya "$50,00" varyantı
    expect(out).toMatch(/\$/);
  });
});
