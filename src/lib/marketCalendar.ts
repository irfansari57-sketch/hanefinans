/**
 * BIST market calendar — trading hours + 2026 holiday list.
 *
 * Backend snapshot.ts artik `asOf: 'YYYY-MM-DD'` doner (Is Yatirim feed'inden
 * son islem gunu). Frontend, piyasa kapaliysa (hafta sonu / tatil / saat disi)
 * kullaniciya bu Cuma kapanisini gosterdigini soyleyecek. Bu modul, "piyasa
 * acik mi?" karari + "asOf" gunu icin readable label sunar.
 */

/** BIST tatilleri 2026 (kaynak: borsaistanbul.com/official-holidays). */
const BIST_HOLIDAYS_2026 = new Set<string>([
  '2026-01-01', // Yilbasi
  '2026-03-20', // Ramazan Bayrami arefe (yarim gun) — gun sayilmasi opsiyonel
  '2026-03-21', // Ramazan Bayrami 1
  '2026-03-22', // Ramazan Bayrami 2
  '2026-03-23', // Ramazan Bayrami 3
  '2026-04-23', // Ulusal Egemenlik
  '2026-05-01', // Isci Bayrami
  '2026-05-19', // Genclik ve Spor Bayrami
  '2026-05-27', // Kurban Bayrami arefe (yarim gun)
  '2026-05-28', // Kurban Bayrami 1
  '2026-05-29', // Kurban Bayrami 2
  '2026-05-30', // Kurban Bayrami 3
  '2026-05-31', // Kurban Bayrami 4
  '2026-07-15', // Demokrasi ve Milli Birlik
  '2026-08-30', // Zafer Bayrami
  '2026-10-29', // Cumhuriyet Bayrami
]);

/**
 * Verilen tarihi 'Europe/Istanbul' takvimine cevirip YYYY-MM-DD doner.
 * `Date` her yerde UTC saklanir; biz TR icin yerel takvim gunune bakacagiz.
 */
function toIstanbulDateString(d: Date): string {
  // Intl ile guvenli — DST yok ama timezone offset'i dogru hesaplar.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(d); // 'YYYY-MM-DD'
}

/** Istanbul saatine gore [hour, minute] doner. */
function getIstanbulHourMinute(d: Date): { hour: number; minute: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Istanbul',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const weekdayStr = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekday = map[weekdayStr] ?? 1;
  return { hour, minute, weekday };
}

export function isBistHoliday(date: Date = new Date()): boolean {
  return BIST_HOLIDAYS_2026.has(toIstanbulDateString(date));
}

export function isWeekend(date: Date = new Date()): boolean {
  const { weekday } = getIstanbulHourMinute(date);
  return weekday === 0 || weekday === 6; // Pazar / Cumartesi
}

/**
 * BIST islem saatleri (10:00-18:00 TR, Pzt-Cum, tatil disi).
 * Hafta sonu / tatil / saat disi -> false.
 */
export function isBistOpen(date: Date = new Date()): boolean {
  if (isWeekend(date)) return false;
  if (isBistHoliday(date)) return false;
  const { hour, minute } = getIstanbulHourMinute(date);
  const minutes = hour * 60 + minute;
  // 10:00 (600) - 18:00 (1080) — final bitisi 18:00 dahil degil, defansif olarak 18:05
  return minutes >= 600 && minutes <= 1085;
}

/**
 * `asOf` (YYYY-MM-DD) -> kullaniciya gosterilecek kisa Turkce label.
 * Ornek: '2026-06-18' -> 'Cuma 18 Haz'
 */
export function asOfLabel(asOf: string): string | null {
  if (!asOf || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return null;
  // Local timezone'da parse etmek icin elle parcala (yoksa UTC parse hatali olur)
  const [y, m, d] = asOf.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return null;
  const weekday = dt.toLocaleDateString('tr-TR', { weekday: 'long' });
  const day = dt.getDate();
  const month = dt.toLocaleDateString('tr-TR', { month: 'short' }).replace('.', '');
  // 'Cuma' -> 'Cuma', 'Pazartesi' -> 'Pzt' gibi kisaltma istiyorsak yapilabilir.
  // Simdilik tam isim — kullanici takip etsin.
  const cap = weekday.charAt(0).toLocaleUpperCase('tr-TR') + weekday.slice(1);
  return `${cap} ${day} ${month}`;
}
