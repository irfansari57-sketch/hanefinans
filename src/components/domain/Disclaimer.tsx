/**
 * Yatırım tavsiyesi disclaimer + KVKK beyanı tek kaynak metin.
 * Sidebar (collapse), ilk-giriş modal, mobile footer'da kullanılır.
 */

export const DISCLAIMER_TITLE = 'Yatırım Tavsiyesi Değildir';

/** Kısa form — collapsed durumda ve ilk paragraf olarak kullanılır */
export const DISCLAIMER_SHORT = `Sermaye piyasalarında yapacağınız işlemler sonucunda kar elde edebileceğiniz gibi zarar riskiniz de bulunmaktadır. Bu nedenle, işlem yapmaya karar vermeden önce, piyasada karşılaşabileceğiniz riskleri anlamanız, mali durumunuzu ve kısıtlarınızı dikkate alarak karar vermeniz gerekmektedir.`;

/** Tam form — modal ve expanded sidebar'da kullanılır */
export const DISCLAIMER_FULL_PARAGRAPHS = [
  DISCLAIMER_SHORT,
  `Bu internet sitesindeki tüm sayfalarda veya bağlı sosyal medya hesaplarında yer alan ücretsiz temel/teknik analiz sonucu ortaya çıkan hisse senedi hedef fiyatları, model portföyler, hisse önerileri ve açıklamalar kesinlikle yatırım danışmanlığı kapsamında değildir. Yatırım danışmanlığı hizmeti, SPK tarafından yetkilendirilmiş kuruluşlar tarafından kişilerin risk ve getiri tercihleri dikkate alınarak kişiye özel sunulmaktadır. Bu alanda yetkilendirilmiş kurumlar www.spk.gov.tr adresinde bulunabilir.`,
  `Üye olan herkes "Kişisel Verilerin Korunması Kanunu" beyanımızı okumuş ve kabul etmiştir. Açılacak herhangi hukuki bir dava neticesinde platformumuz yetkili merciler ile gerekli uzlaşmayı sağlayacaktır, lakin zorunlu şartlar ve resmi kurumlar dışında hiçbir yerde Kişisel Verilerinizin paylaşılmayacağını da beyan ederiz.`,
  `Hane Finans bir yatırım kuruluşu değildir. Burada gördükleriniz herhangi bir varlık için alım/satım yönlendirici nitelikte tavsiye veya yorum niteliğinde paylaşımlar değildir; sadece yatırımcıların kendisini geliştirmesi ve bu piyasada bilinçli yatırımcıların çoğalması maksadıyla bazı banka ve aracı kurumların raporlarını ve hedef fiyatlarını paylaşmaktadır.`,
  `Finansal okuryazarlığa katkı sunmak, neye/neden yatırım yapıldığını tam manasıyla okuyabilmek için işin profesyonellerinin bakış açılarını, değerleme modellerini ve bir şirketi değerlerken dikkate aldıkları kriterleri göz önünde bulundurabilirsiniz; lakin yalnızca bu raporlar veya analizlere güvenerek yatırım yapmak sizi maddi kayıplara uğratabilir. Bu bilgiler/paylaşımlar kurum ve banka raporları olmakla birlikte Hane Finans kesinlikle alım/satım için tavsiye veya yorum yapmamaktadır ve tavsiye niteliği taşımamaktadır.`,
];

export function DisclaimerBody({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? 'space-y-2 text-[11px] leading-snug text-slate-300' : 'space-y-3 text-sm leading-relaxed text-slate-300'}>
      {DISCLAIMER_FULL_PARAGRAPHS.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  );
}
