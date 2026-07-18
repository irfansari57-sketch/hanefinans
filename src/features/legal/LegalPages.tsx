import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';

/**
 * Yasal sayfa şablonları — Hane Dijital Teknoloji A.Ş. için Türkiye e-ticaret
 * mevzuatına uyumlu temel metinler. Avukatla finalize edilmelidir.
 */

const COMPANY = {
  legalName: 'Hane Dijital Teknoloji A.Ş.',
  brand: 'InvestLiq',
  website: 'investliq.com',
  supportEmail: 'destek@investliq.com',
  address: 'İstanbul, Türkiye', // TODO: tam adres ekle
  mersis: '', // TODO: MERSİS numarası
  taxNumber: '', // TODO: VKN
};

function LegalLayout({ title, lastUpdated, children }: { title: string; lastUpdated: string; children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => navigate(-1)} className="btn-ghost mb-3">
        <ArrowLeft size={14} /> Geri
      </button>
      <PageHeader
        title={title}
        subtitle={`${COMPANY.legalName} • Son güncelleme: ${lastUpdated}`}
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-soft px-2.5 py-1 text-xs text-slate-400">
            <FileText size={12} /> Yasal Metin
          </span>
        }
      />
      <article className="card prose-legal max-w-4xl p-6 sm:p-8 space-y-5 text-sm leading-relaxed text-slate-300">
        {children}
        <hr className="my-6 border-border" />
        <footer className="text-xs text-slate-500">
          <p>
            <strong className="text-slate-400">{COMPANY.legalName}</strong>
            {COMPANY.address && <> • {COMPANY.address}</>}
            {COMPANY.taxNumber && <> • VKN: {COMPANY.taxNumber}</>}
            {COMPANY.mersis && <> • MERSİS: {COMPANY.mersis}</>}
          </p>
          <p className="mt-1">
            İletişim: <a href={`mailto:${COMPANY.supportEmail}`} className="text-accent hover:underline">{COMPANY.supportEmail}</a>
          </p>
        </footer>
      </article>
    </>
  );
}

function H2({ children }: { children: ReactNode }) {
  return <h2 className="mt-6 text-base font-semibold text-slate-100">{children}</h2>;
}

function P({ children }: { children: ReactNode }) {
  return <p>{children}</p>;
}

// ============================================================
// 1. KVKK AYDINLATMA METNİ
// ============================================================
export function KvkkPage() {
  return (
    <LegalLayout title="KVKK Aydınlatma Metni" lastUpdated="17 Mayıs 2026">
      <P>
        6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") kapsamında, {COMPANY.legalName} (sıfatıyla
        "Veri Sorumlusu") olarak kişisel verilerinizin işlenmesine ilişkin aşağıdaki bilgilendirmeyi sunarız.
      </P>

      <H2>1. Veri Sorumlusunun Kimliği</H2>
      <P>
        {COMPANY.legalName} ({COMPANY.brand} platformu) — {COMPANY.website}
        <br />
        İletişim: {COMPANY.supportEmail}
      </P>

      <H2>2. İşlenen Kişisel Veri Kategorileri</H2>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>Kimlik Bilgisi:</strong> Ad, soyad</li>
        <li><strong>İletişim Bilgisi:</strong> E-posta adresi</li>
        <li><strong>İşlem Bilgisi:</strong> Üyelik bilgileri, kullanım kayıtları, oturum bilgileri</li>
        <li><strong>Finansal Bilgi:</strong> Üyelik ödemesi için kart sahibi adı (kart numarası saklanmaz, Iyzico tokenizasyonu ile yönetilir)</li>
        <li><strong>İşlem Güvenliği:</strong> IP adresi, tarayıcı bilgisi, log kayıtları</li>
      </ul>

      <H2>3. Kişisel Verilerin İşlenme Amaçları</H2>
      <ul className="list-disc pl-6 space-y-1">
        <li>Üyelik hesabının oluşturulması ve yönetimi</li>
        <li>Üyelik ücreti tahsilatı, fatura düzenleme ve muhasebe yükümlülüklerinin yerine getirilmesi</li>
        <li>Hizmetin sunulması, geliştirilmesi ve iyileştirilmesi</li>
        <li>Kullanıcı destek talepleri yanıtlama</li>
        <li>Yasal yükümlülüklerin yerine getirilmesi (vergi mevzuatı, e-fatura, e-arşiv)</li>
        <li>Hukuki uyuşmazlıklarda delil olarak kullanılması</li>
      </ul>

      <H2>4. Verilerin Aktarıldığı Taraflar</H2>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>Iyzico Ödeme Hizmetleri A.Ş.</strong> — ödeme işlemleri</li>
        <li><strong>Cloudflare, Inc.</strong> — barındırma ve içerik dağıtım altyapısı</li>
        <li><strong>Yetkili kamu kurumları</strong> — yasal talepler doğrultusunda (GİB, mahkemeler, vb.)</li>
        <li><strong>E-fatura sağlayıcımız</strong> — fatura düzenleme</li>
      </ul>

      <H2>5. Kişisel Veri Toplamanın Yöntemi ve Hukuki Sebebi</H2>
      <P>
        Kişisel verileriniz; üyelik kaydı, ödeme işlemi, web sitesi kullanımı sırasında elektronik
        ortamda otomatik veya kısmen otomatik yöntemlerle toplanır. KVKK m.5/2(c) "sözleşmenin
        kurulması ve ifası için gerekli olması" ve KVKK m.5/2(ç) "veri sorumlusunun yasal
        yükümlülüğünü yerine getirebilmesi için zorunlu olması" hukuki sebeplerine dayanır.
      </P>

      <H2>6. Veri Sahibinin Hakları (KVKK m.11)</H2>
      <P>Veri sahibi olarak şunları talep etme hakkınız bulunur:</P>
      <ul className="list-disc pl-6 space-y-1">
        <li>Kişisel verilerinizin işlenip işlenmediğini öğrenme</li>
        <li>İşlenmişse buna ilişkin bilgi talep etme</li>
        <li>İşlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme</li>
        <li>Yurt içinde/dışında aktarıldığı üçüncü kişileri bilme</li>
        <li>Eksik veya yanlış işlenmesi halinde düzeltilmesini isteme</li>
        <li>KVKK m.7'de öngörülen şartlar çerçevesinde silinmesini/yok edilmesini isteme</li>
        <li>İşlemeye itiraz etme</li>
      </ul>
      <P>
        Bu hakların kullanımı için {COMPANY.supportEmail} adresine başvurabilirsiniz. Talepleriniz en
        geç 30 gün içinde sonuçlandırılır.
      </P>

      <H2>7. Verilerin Saklanma Süresi</H2>
      <P>
        Üyelik kaydınız aktif olduğu süre boyunca + üyelik sonlandıktan sonra yasal saklama
        sürelerince (Türk Ticaret Kanunu m.82 uyarınca 10 yıl, vergi mevzuatı kapsamında 5 yıl).
      </P>
    </LegalLayout>
  );
}

// ============================================================
// 2. MESAFELİ SATIŞ SÖZLEŞMESİ
// ============================================================
export function MesafeliPage() {
  return (
    <LegalLayout title="Mesafeli Satış Sözleşmesi" lastUpdated="17 Mayıs 2026">
      <H2>1. Taraflar</H2>
      <P>
        <strong>Satıcı:</strong> {COMPANY.legalName} ({COMPANY.brand}) — {COMPANY.website}
        <br />
        <strong>Alıcı:</strong> Web sitemiz üzerinden hizmet satın alan üye (gerçek/tüzel kişi)
      </P>

      <H2>2. Sözleşmenin Konusu</H2>
      <P>
        İşbu sözleşmenin konusu, Alıcı'nın {COMPANY.website} adresinden elektronik ortamda
        sipariş verdiği <strong>InvestLiq dijital üyelik hizmetleri</strong> (PRO ve ELITE
        planları) ile ilgili olarak 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli
        Sözleşmeler Yönetmeliği hükümleri çerçevesinde tarafların hak ve yükümlülüklerinin
        belirlenmesidir.
      </P>

      <H2>3. Hizmet Bilgileri</H2>
      <P>
        Satın alınan hizmet, InvestLiq web platformunda sunulan finansal analiz, BIST/ABD/Kripto
        verisi takibi, AI destekli analiz ve diğer üyelik özelliklerini içerir. Detaylı özellikler
        ve fiyatlar üyelik sayfasında belirtilmiştir.
      </P>

      <H2>4. Ödeme</H2>
      <P>
        Ödemeler kredi/banka kartı ile <strong>Iyzico Ödeme Hizmetleri A.Ş.</strong> alt yapısı
        üzerinden alınır. Tüm fiyatlar Türk Lirası (TRY) cinsindendir ve KDV dahildir.
        Aylık abonelikler her ay otomatik olarak yenilenir; yıllık abonelikler yıl sonunda yenilenir.
      </P>

      <H2>5. Cayma Hakkı</H2>
      <P>
        Mesafeli Sözleşmeler Yönetmeliği m.15/1(ğ) uyarınca <strong>cayma hakkı kullanılamayacak
        haller</strong> kapsamına giren elektronik ortamda anında ifa edilen dijital içerik
        hizmetlerinde, Alıcı'nın hizmet sunumunun başlaması için onay vermesi ile cayma hakkı sona
        erer. Üyelik aktivasyonundan sonra cayma hakkı kullanılamaz; ancak Alıcı dilediği zaman
        aboneliğini sonlandırabilir (sonraki yenileme yapılmaz).
      </P>

      <H2>6. İade ve İptal Politikası</H2>
      <P>
        Yıllık ödeme yapan kullanıcılar, ödeme tarihinden itibaren <strong>14 gün içinde</strong>
        ve hizmeti hiç kullanmamış olmaları koşuluyla iade talep edebilir. Detay için
        İade Politikası sayfamıza bakınız.
      </P>

      <H2>7. Uyuşmazlık ve Yetkili Mahkeme</H2>
      <P>
        Tüketici işlemleri için Tüketici Hakem Heyetleri ve Tüketici Mahkemeleri görevlidir.
        Diğer uyuşmazlıklarda İstanbul Mahkemeleri ve İcra Daireleri yetkilidir.
      </P>

      <H2>8. Yürürlük</H2>
      <P>
        Alıcı, ödeme adımında bu sözleşmeyi okuduğunu ve kabul ettiğini beyan eder. Sözleşme
        elektronik ortamda onaylandığı anda yürürlüğe girer.
      </P>
    </LegalLayout>
  );
}

// ============================================================
// 3. ÜYELİK SÖZLEŞMESİ (Hizmet Kullanım Şartları)
// ============================================================
export function UyelikSozlesmesiPage() {
  return (
    <LegalLayout title="Üyelik Sözleşmesi" lastUpdated="17 Mayıs 2026">
      <H2>1. Taraflar ve Tanımlar</H2>
      <P>
        Bu sözleşme, {COMPANY.legalName} ("Platform Sahibi") ile {COMPANY.website} adresinde üyelik
        oluşturan kullanıcı ("Üye") arasında akdedilmiştir.
      </P>

      <H2>2. Hizmetin Kapsamı</H2>
      <P>
        InvestLiq; BIST, ABD borsaları, kripto para, döviz, emtia ve TEFAS yatırım fonları için
        veri görüntüleme, teknik analiz, AI destekli içerik üretimi ve eğitim materyalleri sunan bir
        dijital platformdur. <strong>InvestLiq bir yatırım danışmanlığı kuruluşu değildir.</strong>
        Sermaye Piyasası Kurulu (SPK) tarafından yetkilendirilmemiştir.
      </P>

      <H2>3. Yatırım Tavsiyesi Olmadığına Dair Beyan</H2>
      <P>
        Platformda paylaşılan hiçbir içerik, fiyat hedefi, model portföy, analiz veya yorum yatırım
        tavsiyesi niteliği taşımaz. SPK mevzuatı kapsamında yatırım danışmanlığı; yetkili
        kuruluşlar tarafından kişiye özel sunulan bir hizmettir. Tüm yatırım kararları ve sonuçları
        Üye'nin kendi sorumluluğundadır.
      </P>

      <H2>4. Üyelik Türleri ve Ücretleri</H2>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>Ücretsiz:</strong> Temel özellikler — sınırsız</li>
        <li><strong>PRO:</strong> Genişletilmiş analiz, multi-timeframe, heat map (aylık/yıllık)</li>
        <li><strong>ELITE:</strong> PRO + AI destekli analizler, öncelikli destek (aylık/yıllık)</li>
      </ul>
      <P>
        Güncel ücretler üyelik sayfasında yayınlanır. Platform Sahibi fiyat değişikliği hakkını saklı
        tutar; mevcut abonelerin dönemleri korunur.
      </P>

      <H2>5. Üyenin Yükümlülükleri</H2>
      <ul className="list-disc pl-6 space-y-1">
        <li>Doğru, eksiksiz ve güncel bilgi vermek</li>
        <li>Hesap güvenliği için şifre gizliliğini korumak</li>
        <li>Platformu yasal amaçlar dışında kullanmamak</li>
        <li>İçerikleri ticari amaçla çoğaltmamak veya yeniden yayımlamamak</li>
        <li>Sistemin işleyişini bozacak otomasyon/bot kullanmamak</li>
      </ul>

      <H2>6. Platform Sahibi'nin Hak ve Yükümlülükleri</H2>
      <P>
        Platform Sahibi, hizmetin kesintisiz çalışması için makul çabayı gösterir; ancak teknik
        nedenlerle kısa süreli kesintiler yaşanabileceği üye tarafından kabul edilir. Platform
        Sahibi, gerekli görmesi halinde içerikleri ve özellikleri önceden bildirmeksizin
        değiştirebilir.
      </P>

      <H2>7. Sözleşmenin Sona Ermesi</H2>
      <P>
        Üye dilediği zaman aboneliğini iptal edebilir. Platform Sahibi, kötüye kullanım, sahte
        bilgi veya yasal ihlal tespiti durumunda hesabı tek taraflı kapatma hakkına sahiptir.
      </P>

      <H2>8. Fikri Mülkiyet</H2>
      <P>
        Platformda yer alan tüm logolar, içerikler, kod tabanı, analiz metinleri {COMPANY.legalName}'ye
        aittir. İzinsiz kopyalanması veya çoğaltılması yasaktır.
      </P>
    </LegalLayout>
  );
}

// ============================================================
// 4. İADE POLİTİKASI
// ============================================================
export function IadePolitikasiPage() {
  return (
    <LegalLayout title="İptal ve İade Politikası" lastUpdated="17 Mayıs 2026">
      <H2>1. Üyelik İptali</H2>
      <P>
        Tüm üyelikler (PRO/ELITE) Ayarlar sayfasından kendi inisiyatifinizle dilediğiniz zaman
        iptal edilebilir. İptal sonrası mevcut dönem sonuna kadar üyelik haklarınızı kullanmaya
        devam edersiniz; <strong>otomatik yenileme durdurulur</strong>.
      </P>

      <H2>2. İade Koşulları</H2>
      <P>
        Mesafeli Sözleşmeler Yönetmeliği m.15/1(ğ) uyarınca dijital içerik hizmetlerinde, hizmet
        sunumunun başlaması ile cayma hakkı kullanılamaz. Buna rağmen aşağıdaki <strong>iyi niyet
        iade politikamızı</strong> uyguluyoruz:
      </P>
      <ul className="list-disc pl-6 space-y-1">
        <li>
          <strong>Yıllık abonelik:</strong> Ödeme tarihinden itibaren 14 gün içinde ve premium
          özellikleri 10 günden az kullanmışsanız tam iade
        </li>
        <li>
          <strong>Aylık abonelik:</strong> İlk 3 gün içinde kullanılmamış üyelik için tam iade.
          Sonraki yenileme dönemlerinde kullanım başladığı için iade yapılmaz; sadece yenileme
          durdurulur
        </li>
        <li>
          <strong>Teknik arıza nedeniyle hizmet alamama:</strong> Kanıtlanabilir 24 saatten uzun
          kesinti halinde orantılı iade
        </li>
      </ul>

      <H2>3. İade Talebi Süreci</H2>
      <ol className="list-decimal pl-6 space-y-1">
        <li>{COMPANY.supportEmail} adresine talep emaili gönderin</li>
        <li>Konuya "İade Talebi - [Kullanıcı email]" yazın</li>
        <li>Mesajda: ödeme tarihi, kullanılan kart (ilk 6 son 4 hane), iade sebebi</li>
        <li>5 iş günü içinde değerlendirip yanıt veririz</li>
        <li>Onaylanan iadeler 7-14 iş günü içinde ödendiği karta yapılır (Iyzico aracılığıyla)</li>
      </ol>

      <H2>4. İade Yapılamayan Durumlar</H2>
      <ul className="list-disc pl-6 space-y-1">
        <li>Hesap askıya alma/kapama (kötüye kullanım nedeniyle)</li>
        <li>Üyelik sona erdikten sonra yapılan iade talepleri</li>
        <li>AI analiz kotasının tüketilmesi (kullanıldı sayılır)</li>
        <li>Promo/indirim kodu ile alınan üyelikler (kampanya şartlarına bakılır)</li>
      </ul>

      <H2>5. Tüketici Hakem Heyeti</H2>
      <P>
        Uzlaşamadığımız durumlarda 6502 sayılı Tüketicinin Korunması Hakkında Kanun kapsamında
        İlçe/İl Tüketici Hakem Heyeti'ne veya Tüketici Mahkemesi'ne başvurabilirsiniz.
      </P>
    </LegalLayout>
  );
}

// ============================================================
// 5. ÇEREZ POLİTİKASI
// ============================================================
export function CerezPolitikasiPage() {
  return (
    <LegalLayout title="Çerez Politikası" lastUpdated="17 Mayıs 2026">
      <H2>1. Çerez Nedir?</H2>
      <P>
        Çerezler (cookies), bir web sitesini ziyaret ettiğinizde tarayıcınız tarafından
        cihazınızda saklanan küçük metin dosyalarıdır. Sitenin sizi hatırlamasına ve
        tercihlerinizi uygulamasına yardımcı olur.
      </P>

      <H2>2. Kullandığımız Çerez Türleri</H2>
      <ul className="list-disc pl-6 space-y-2">
        <li>
          <strong>Zorunlu Çerezler:</strong> Oturum yönetimi, güvenlik ve temel işlevsellik için
          gerekli. Onayınız olmadan da kullanılır.
          <br />
          <span className="text-xs text-slate-500">Örn: fa.auth.session.v1 (oturum), fa.disclaimer.acceptedAt.v1 (KVKK onayı)</span>
        </li>
        <li>
          <strong>İşlevsel Çerezler:</strong> Watchlist, tema, dil gibi tercihlerinizi hatırlar.
          <br />
          <span className="text-xs text-slate-500">Örn: fa.watchlist.v1, fa.pricing.v1</span>
        </li>
        <li>
          <strong>Analitik Çerezler:</strong> Anonim kullanım istatistikleri (sayfa görüntülemeleri,
          performans metrikleri). Şu an üçüncü taraf analitik kullanmıyoruz.
        </li>
        <li>
          <strong>Üçüncü Taraf Çerezleri:</strong> Iyzico ödeme sayfası ve YouTube embed gibi
          gömülü içerikler kendi çerezlerini ayarlayabilir.
        </li>
      </ul>

      <H2>3. Çerezleri Kontrol Etme</H2>
      <P>
        Tarayıcı ayarlarınızdan çerezleri silebilir veya engelleyebilirsiniz. Ancak zorunlu
        çerezleri devre dışı bırakırsanız sitenin temel işlevleri çalışmayabilir (oturum açma,
        ödeme, vb.).
      </P>
      <ul className="list-disc pl-6 space-y-1">
        <li><a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noreferrer" className="text-accent hover:underline">Chrome</a></li>
        <li><a href="https://support.mozilla.org/tr/kb/cerezleri-silme" target="_blank" rel="noreferrer" className="text-accent hover:underline">Firefox</a></li>
        <li><a href="https://support.apple.com/tr-tr/HT201265" target="_blank" rel="noreferrer" className="text-accent hover:underline">Safari</a></li>
        <li><a href="https://support.microsoft.com/tr-tr/microsoft-edge" target="_blank" rel="noreferrer" className="text-accent hover:underline">Microsoft Edge</a></li>
      </ul>

      <H2>4. Veri Saklama Süresi</H2>
      <P>
        Oturum çerezleri tarayıcı kapatılınca silinir. Tercih çerezleri 1 yıla kadar saklanır.
        Manuel olarak temizleyebilirsiniz (Ayarlar → "Önbellek + watchlist sıfırla").
      </P>

      <H2>5. İletişim</H2>
      <P>
        Çerez kullanımıyla ilgili sorularınız için {COMPANY.supportEmail} adresine yazabilirsiniz.
      </P>
    </LegalLayout>
  );
}
