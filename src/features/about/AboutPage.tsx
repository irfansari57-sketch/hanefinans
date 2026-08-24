/**
 * Hakkında — InvestliQ marka koruma + SEO sayfası.
 *
 * Amaç: Google aramalarında "InvestliQ" markasının tam eşleşme sinyalini
 * güçlendirmek. H1, meta description, JSON-LD ve FAQ ile marka otoritesi
 * kurulması. Rakip isim anmadan pozitif pozisyonlama.
 */

import { Link } from 'react-router-dom';
import {
  Sparkles, TrendingUp, PiggyBank, Shield, ChartBar, Users,
  Mail, ExternalLink, CheckCircle2,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { SeoHead } from '@/components/seo/SeoHead';

export function AboutPage() {
  return (
    <>
      <SeoHead
        title="InvestliQ Nedir? — Türkiye'nin Akıllı Yatırım Veri Platformu"
        description="InvestliQ, Türkiye yatırımcıları için BIST hisseleri, TEFAS fonları, döviz, emtia ve kripto verilerini tek panelde sunan yerli finansal veri platformudur. BIST 100/30 endeks entegrasyonu, TEFAS bağlantısı ve Türkçe finansal okuryazarlık içeriğiyle Türkiye piyasasına odaklıdır."
        path="/hakkinda"
      />

      <PageHeader
        title="InvestliQ Nedir?"
        subtitle="Türkiye yatırımcıları için akıllı finansal veri platformu"
      />

      {/* Marka differentiation kartı — Google için tam eşleşme sinyal */}
      <section className="glass-card mb-4 p-6 border-2 border-accent/30">
        <div className="flex items-start gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
            <Sparkles size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-100 mb-2">
              InvestliQ — Türkiye'nin Akıllı Finansal Veri Platformu
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              <strong className="text-accent">InvestliQ</strong>, BIST hisseleri, TEFAS
              yatırım fonları, döviz kurları, kıymetli madenler ve kripto para verilerini
              tek arayüzde birleştiren, Türkiye yatırımcıları için tasarlanmış yerli bir
              finansal veri platformudur.
            </p>
            <p className="mt-2 text-xs text-slate-400 leading-relaxed">
              BIST 100/30 endeks feed'i, TEFAS resmi açık fon listesi, TCMB politika
              faizi ve TÜİK enflasyon verisi gibi Türkiye piyasasına özel kaynakları
              tek panelde sunar.
            </p>
          </div>
        </div>
      </section>

      {/* Ne yapar? */}
      <section className="glass-card mb-4 p-5">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-100">
          <ChartBar size={20} className="text-accent" /> InvestliQ Ne Yapar?
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Feature
            icon={<TrendingUp size={16} />}
            title="BIST Hisseleri"
            desc="600+ BIST hissesi için canlı fiyat, teknik analiz, MA 5/8/13, sektörel karşılaştırma ve haftalık/aylık/yıllık dönem getirileri."
          />
          <Feature
            icon={<PiggyBank size={16} />}
            title="TEFAS Fon Verileri"
            desc="2000+ yatırım fonu için günlük NAV, dönem performansları, TEFAS açık/kapalı durum tespiti ve yan yana fon karşılaştırma."
          />
          <Feature
            icon={<Shield size={16} />}
            title="Risk Profili ve Portföy Önerisi"
            desc="7 soruluk anketle kişisel risk profilini belirle, SPK yasal kapsamda uygun TEFAS fonları listele."
          />
          <Feature
            icon={<Sparkles size={16} />}
            title="Kişisel Portföy Yönetimi"
            desc="Pozisyonlarını ve işlem geçmişini kaydet, günlük K/Z takibi, portföy sağlık skoru (0-100)."
          />
          <Feature
            icon={<ChartBar size={16} />}
            title="Ekonomik Takvim"
            desc="TÜFE, TCMB PPK, FOMC, temel makro veri açıklamalarına 1 saat önce bildirim."
          />
          <Feature
            icon={<Users size={16} />}
            title="Finansal Okuryazarlık"
            desc="Borsa temelleri, fon seçimi, teknik analiz, risk yönetimi, BES ve mevduat hesaplayıcılar."
          />
        </div>
      </section>

      {/* Neden InvestliQ? */}
      <section className="glass-card mb-4 p-5">
        <h2 className="mb-3 text-lg font-bold text-slate-100">Neden InvestliQ?</h2>
        <ul className="space-y-2 text-sm text-slate-300">
          <Why text="Tamamen Türkçe — sektör, kategori, terim ve arayüz Türkiye'ye özel." />
          <Why text="BIST-öncelikli veri yapısı — BIST 100/30 endekslerinden hisse detayına kadar entegre." />
          <Why text="TEFAS bağlantısı — hangi fon TEFAS'ta açık, hangisi Serbest Fon (SPK Nitelikli Yatırımcı gerekli), tek bakışta." />
          <Why text="Ücretsiz kullanım — üye ol, tüm özellikleri sınırsız kullan." />
          <Why text="Yatırım tavsiyesi vermez — SPK mevzuatı çerçevesinde sadece veri ve bilgi sunar." />
          <Why text="Kişisel veri güvenliği — KVKK uyumlu, veriler yalnızca kullanıcının kendi kullanımı için saklanır." />
        </ul>
      </section>

      {/* SSS — Aramalarda çıkacak sorular */}
      <section className="glass-card mb-4 p-5">
        <h2 className="mb-4 text-lg font-bold text-slate-100">Sık Sorulan Sorular</h2>
        <div className="space-y-4">
          <Faq
            q="InvestliQ nedir?"
            a="InvestliQ, Türkiye yatırımcıları için tasarlanmış akıllı finansal veri platformudur. BIST hisseleri, TEFAS fonları, döviz, emtia, kripto ve BIST endeksleri hakkında canlı veri, analiz, portföy takibi ve risk profili yönetimi sunar."
          />
          <Faq
            q="InvestliQ'i benzer platformlardan ayıran nedir?"
            a="InvestliQ yerli bir platform olup Türkiye piyasasına özel entegrasyonlar sunar: BIST 100/30 endeks feed'i, TEFAS resmi açık fon listesi, TCMB politika faizi, TÜİK enflasyon takvimi, KAP haberleri, Türkçe finansal okuryazarlık içerikleri ve BES hesaplayıcı gibi Türkiye'ye özgü araçlar."
          />
          <Faq
            q="InvestliQ ücretli mi?"
            a="Hayır, InvestliQ şu an ücretsiz kullanılabiliyor. Kayıt ol, tüm özelliklere sınırsız erişim sağla. Anonim ziyaretçiler kısıtlı içerik görebilir."
          />
          <Faq
            q="InvestliQ güvenli mi?"
            a="Evet. InvestliQ, KVKK uyumlu veri saklama, HTTPS, Turnstile bot koruması ve JWT tabanlı oturum yönetimi kullanır. Kişisel veriler sadece kullanıcının kendi kullanımı için tutulur, üçüncü taraflarla paylaşılmaz."
          />
          <Faq
            q="Yatırım tavsiyesi veriyor mu?"
            a="Hayır. InvestliQ, SPK mevzuatına uygun olarak yatırım tavsiyesi vermez. Sunulan tüm veri, analiz ve öneriler bilgilendirme amaçlıdır — yatırım kararlarınızı SPK lisanslı bir yatırım kuruluşuyla görüşerek verin."
          />
          <Faq
            q="Hangi verileri kullanır?"
            a="InvestliQ; İş Yatırım BIST endeks feed'i, Takasbank TEFAS resmi açık fon listesi, TCMB politika faizi, TÜİK enflasyon verisi, Yahoo Finance uluslararası piyasalar ve resmi haber kaynaklarını kullanır. Kaynak şeffaflığı için her veri satırında güncelleme tarihi görünür."
          />
        </div>
      </section>

      {/* İletişim + CTA */}
      <section className="glass-card p-5">
        <h2 className="mb-3 text-lg font-bold text-slate-100">İletişim</h2>
        <p className="text-sm text-slate-300 mb-3">
          Soru, öneri veya iş birliği için:
        </p>
        <div className="flex flex-wrap gap-3">
          <a
            href="mailto:destek@investliq.com"
            className="inline-flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent hover:bg-accent/20"
          >
            <Mail size={14} /> destek@investliq.com
          </a>
          <Link
            to="/uyelik"
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg hover:bg-accent/90"
          >
            Ücretsiz Kayıt Ol <ExternalLink size={14} />
          </Link>
        </div>
        <p className="mt-4 text-[10px] text-slate-500">
          InvestliQ © 2026 — Türkiye yatırımcıları için akıllı finansal veri platformu.
          KVKK ve SPK mevzuatına uygundur. Yatırım tavsiyesi vermez.
        </p>
      </section>
    </>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg-card p-3">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-100">
        <span className="text-accent">{icon}</span>
        {title}
      </div>
      <p className="text-xs text-slate-400 leading-relaxed">{desc}</p>
    </div>
  );
}

function Why({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2">
      <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-400" />
      <span>{text}</span>
    </li>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div className="border-l-2 border-accent/40 pl-3">
      <h3 className="text-sm font-semibold text-slate-100 mb-1">{q}</h3>
      <p className="text-xs text-slate-400 leading-relaxed">{a}</p>
    </div>
  );
}
