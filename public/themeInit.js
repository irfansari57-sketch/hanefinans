/**
 * Theme init — FOUC engelle.
 *
 * localStorage'dan tema okur, HTML root'una class olarak yapistirir.
 * Inline yerine external dosya: CSP enforce mode'da inline script izinli degil.
 * Bu dosya `public/` altinda → build sonrasi root path'te (/themeInit.js) servis edilir.
 *
 * Default: light. Saklananlardan biri 'dark' veya 'light' degilse default'a duser.
 */
(function () {
  try {
    var t = localStorage.getItem('fa.theme');
    var theme = (t === 'dark' || t === 'light') ? t : 'light';
    var r = document.documentElement;
    r.classList.remove('light', 'dark');
    r.classList.add(theme);
  } catch (e) { /* sessizce */ }
})();
