import { Helmet } from 'react-helmet-async';

/**
 * Sayfa başı SEO meta'larını set eden helper component.
 *
 * Helmet, çağrıldığı yerde document.title ve meta tag'lerini günceller —
 * SPA navigasyonunda her sayfa kendi başlığını çağırır, eskileri otomatik
 * temizlenir.
 *
 * Default değerler index.html'de set edilmiştir; bu component sadece sayfa
 * bazlı override yapar.
 */
interface SeoHeadProps {
  /** Sayfa başlığı — sonuna "| InvestLiq" otomatik eklenir. */
  title: string;
  /** Meta description (~150 karakter ideal). */
  description?: string;
  /** Sayfa için özel OG image URL (varsayılan: site-wide og-image.png). */
  image?: string;
  /** Canonical URL — path verirsen domain otomatik eklenir. */
  path?: string;
  /** Search engine'leri uzak tut (settings, history vb. private sayfalar). */
  noindex?: boolean;
}

const SITE_NAME = 'InvestLiq';
const SITE_URL = 'https://investliq.com';
const DEFAULT_IMAGE = `${SITE_URL}/og-image.png`;

export function SeoHead({
  title,
  description,
  image,
  path,
  noindex,
}: SeoHeadProps) {
  const fullTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
  const ogImage = image ?? DEFAULT_IMAGE;
  const canonical = path ? `${SITE_URL}${path.startsWith('/') ? path : '/' + path}` : undefined;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      {description && <meta name="description" content={description} />}
      {canonical && <link rel="canonical" href={canonical} />}
      {noindex && <meta name="robots" content="noindex, nofollow" />}

      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      {description && <meta property="og:description" content={description} />}
      <meta property="og:image" content={ogImage} />
      {canonical && <meta property="og:url" content={canonical} />}
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={SITE_NAME} />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      {description && <meta name="twitter:description" content={description} />}
      <meta name="twitter:image" content={ogImage} />
    </Helmet>
  );
}
