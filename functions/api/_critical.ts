/**
 * Kritik finansal bildirim tespiti — /api/news ve /api/stocks/:symbol/news paylaşır.
 *
 * Yatırımcıyı birebir ilgilendiren, fiyatı anında etkileyen olaylar.
 * Eşleşme bulunursa importance=10, critical=true.
 *
 * 13 Eki 2026 notu: "X, tedbir iddialarına ilişkin açıklama yaptı" gibi
 * yalanlama/açıklama başlıkları da yakalanır; NEGATION_PATTERNS ile bunlar
 * kritik sayılmaz (ama importance yine yüksek kalır).
 */

// 15 Eki 2026: 'Kritik' = yatırımcı için RİSK olayı. Bedelsiz, pay geri alımı,
// halka arz ve önemli nitelikte işlem kritik DEĞİL (nötr/olumlu kurumsal olaylar);
// kırmızı rozet enflasyonu yaratıyordu.
export const CRITICAL_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\b(konkordato)\b/i, reason: 'Konkordato' },
  { re: /\b(iflas(?:\s+erteleme)?|iflas\s+istedi|iflas\s+basvurusu|iflas\s+başvuru|iflas\s+kararı|iflas\s+karari)\b/i, reason: 'İflas' },
  { re: /\b(kayy[ıi]m|kayyum\s+atan)\b/i, reason: 'Kayyım' },
  { re: /\b(tedbir\s+karar|ihtiyati\s+tedbir|tedbirli\s+pazar)\b/i, reason: 'Tedbir' },
  { re: /\b(haciz\s+karar|haczedild)\b/i, reason: 'Haciz' },
  { re: /\b(delisting|borsadan\s+çıkar|kottan\s+çıkar|borsadan\s+cikar|kottan\s+cikar)\b/i, reason: 'Borsadan Çıkarma' },
  { re: /\b(spk\s+(?:ceza|para\s+cezas|idari\s+para)|sermaye\s+piyasası\s+kurulu\s+ceza)\b/i, reason: 'SPK Cezası' },
  { re: /\b(muvazaa|manip[üu]lasyon\s+iddia|insider\s+trading|içeriden\s+öğrenen|iceriden\s+ogrenen)\b/i, reason: 'Manipülasyon' },
  { re: /\b(profit\s+warning|kar\s+uyarı|kar\s+uyari|rekor\s+zarar|dönem\s+zararı|donem\s+zarari)\b/i, reason: 'Kar Uyarısı' },
];

/** Yalanlama / "iddialara ilişkin açıklama" kalıpları — kritik rozeti verilmez. */
const NEGATION_PATTERNS: RegExp[] = [
  /\b(iddialar[ıi]na\s+ili[şs]kin|iddialar[ıi]\s+yalanlad|yalanlama|asılsız|asilsiz|do[ğg]ru\s+de[ğg]il|söz\s+konusu\s+de[ğg]il|soz\s+konusu\s+degil)\b/i,
];

export function detectCritical(title: string, summary: string): { critical: boolean; reason?: string } {
  const text = `${title} ${summary}`;
  for (const { re, reason } of CRITICAL_PATTERNS) {
    if (re.test(text)) {
      if (NEGATION_PATTERNS.some((n) => n.test(title))) return { critical: false, reason };
      return { critical: true, reason };
    }
  }
  return { critical: false };
}

/** Google News RSS başlıkları " - Kaynak" ile biter; ayır. */
export function splitGoogleTitle(title: string): { title: string; source?: string } {
  const m = title.match(/^(.*)\s[-–]\s([^-–]{2,40})$/);
  if (!m) return { title };
  return { title: m[1].trim(), source: m[2].trim() };
}

/** XML entity + CDATA + tag temizliği (news/index.ts ile aynı). */
export function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, '')
    .trim();
}

export function extractXmlTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? decodeXml(m[1]) : null;
}
