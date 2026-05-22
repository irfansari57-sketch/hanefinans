import { describe, it, expect } from 'vitest';
import {
  normalizeSession,
  sessionSubtitle,
  expectedSessionForTrTime,
  isSessionInWindow,
  injectSessionSubtitle,
} from './briefingWindow';

describe('normalizeSession', () => {
  it('"midday" ve "evening" geçerli', () => {
    expect(normalizeSession('midday')).toBe('midday');
    expect(normalizeSession('evening')).toBe('evening');
  });
  it('"morning" veya geçersiz → morning', () => {
    expect(normalizeSession('morning')).toBe('morning');
    expect(normalizeSession(null)).toBe('morning');
    expect(normalizeSession(undefined)).toBe('morning');
    expect(normalizeSession('garbage')).toBe('morning');
  });
});

describe('sessionSubtitle', () => {
  it('her session için Markdown italic alt başlık döner', () => {
    expect(sessionSubtitle('morning')).toMatch(/Sabah Raporu/);
    expect(sessionSubtitle('midday')).toMatch(/Öğle Güncellemesi/);
    expect(sessionSubtitle('evening')).toMatch(/Kapanış Raporu/);
  });
});

describe('expectedSessionForTrTime', () => {
  // TR = UTC+3
  // TR 08:00 = UTC 05:00
  // TR 13:00 = UTC 10:00
  // TR 18:00 = UTC 15:00

  const mkUtc = (utcHour: number) => new Date(Date.UTC(2026, 4, 22, utcHour, 30, 0));

  it('TR 07:30 → morning', () => {
    expect(expectedSessionForTrTime(mkUtc(4))).toBe('morning'); // 04:30 UTC → 07:30 TR
  });
  it('TR 11:30 → morning (üst sınır içi)', () => {
    expect(expectedSessionForTrTime(mkUtc(8))).toBe('morning'); // 08:30 UTC → 11:30 TR
  });
  it('TR 12:30 → midday', () => {
    expect(expectedSessionForTrTime(mkUtc(9))).toBe('midday'); // 09:30 UTC → 12:30 TR
  });
  it('TR 15:30 → midday', () => {
    expect(expectedSessionForTrTime(mkUtc(12))).toBe('midday'); // 12:30 UTC → 15:30 TR
  });
  it('TR 18:30 → evening', () => {
    expect(expectedSessionForTrTime(mkUtc(15))).toBe('evening'); // 15:30 UTC → 18:30 TR
  });
  it('TR 21:30 → evening (üst sınır içi)', () => {
    expect(expectedSessionForTrTime(mkUtc(18))).toBe('evening'); // 18:30 UTC → 21:30 TR
  });
  it('TR 23:30 → null (mesai dışı)', () => {
    expect(expectedSessionForTrTime(mkUtc(20))).toBe(null); // 20:30 UTC → 23:30 TR
  });
  it('TR 04:00 → null (mesai dışı, gece)', () => {
    expect(expectedSessionForTrTime(mkUtc(1))).toBe(null); // 01:30 UTC → 04:30 TR
  });
});

describe('isSessionInWindow', () => {
  const mkUtc = (utcHour: number) => new Date(Date.UTC(2026, 4, 22, utcHour, 30, 0));

  it('sabah cron sabah penceresinde fired ise true', () => {
    expect(isSessionInWindow('morning', mkUtc(5))).toBe(true); // 08:30 TR
  });
  it('sabah cron AKŞAM (18:30 TR) fired ise false — kritik bug fix', () => {
    expect(isSessionInWindow('morning', mkUtc(15))).toBe(false);
  });
  it('öğle cron öğle penceresinde fired ise true', () => {
    expect(isSessionInWindow('midday', mkUtc(10))).toBe(true); // 13:30 TR
  });
  it('öğle cron akşam fired ise false', () => {
    expect(isSessionInWindow('midday', mkUtc(15))).toBe(false);
  });
  it('akşam cron akşam fired ise true', () => {
    expect(isSessionInWindow('evening', mkUtc(15))).toBe(true); // 18:30 TR
  });
  it('mesai dışı saatte hiçbir session geçerli değil', () => {
    expect(isSessionInWindow('morning', mkUtc(22))).toBe(false);
    expect(isSessionInWindow('midday', mkUtc(22))).toBe(false);
    expect(isSessionInWindow('evening', mkUtc(22))).toBe(false);
  });
});

describe('injectSessionSubtitle', () => {
  it('brifing başlığının ALTINA subtitle yerleştirir (Hane Finans önce kalır)', () => {
    const briefing =
      '📊 *Hane Finans Brifingi*\n_22 Mayıs 2026 Cuma_\n\n🇹🇷 *TÜRKİYE*\nBIST 100: 13.808';
    const out = injectSessionSubtitle(briefing, 'morning');
    const lines = out.split('\n');
    expect(lines[0]).toContain('Hane Finans Brifingi');
    expect(lines[1]).toContain('22 Mayıs');
    expect(lines[2]).toContain('Sabah Raporu');
  });

  it('format bozulduysa fallback olarak en üste prepend eder', () => {
    const garbage = 'rastgele içerik';
    const out = injectSessionSubtitle(garbage, 'evening');
    expect(out.startsWith('🌆')).toBe(true);
  });

  it('Telegram preview için "Hane Finans Brifingi" hep ilk satır', () => {
    const briefing = '📊 *Hane Finans Brifingi*\n_test tarih_\n\nBIST içerik';
    for (const session of ['morning', 'midday', 'evening'] as const) {
      const out = injectSessionSubtitle(briefing, session);
      expect(out.split('\n')[0]).toContain('Hane Finans Brifingi');
    }
  });
});
