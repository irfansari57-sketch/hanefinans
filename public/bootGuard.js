/**
 * Boot guard — giris (entry) script/CSS yuklenemezse otomatik kurtarma.
 *
 * Senaryo (15 Eki 2026, canlida gozlendi): tarayici bir deployment'in index.html'ini
 * aldi, asset'leri isterken production baska bir deployment'a gecti → /assets/index-*.js
 * bulunamadi, Pages SPA fallback olarak index.html (text/html) dondu → "Failed to load
 * module script: MIME type text/html". Bu asamada uygulama kodu HIC calismadigi icin
 * React tarafindaki chunk-retry / ErrorBoundary devreye giremez. Bu dosya module
 * script'ten ONCE yuklenir ve script/link hatasini yakalayip sayfayi taze HTML ile
 * yeniden yukler (SW + cache temizleyerek). Sonsuz dongu korumasi: 2 dk icinde max 3.
 */
(function () {
  try {
    var KEY = 'iq.bootRetry';
    function recent() {
      try { return JSON.parse(sessionStorage.getItem(KEY) || '[]').filter(function (t) { return Date.now() - t < 120000; }); } catch (e) { return []; }
    }
    var recovering = false;
    function recover(reason) {
      if (recovering) return;
      var r = recent();
      if (r.length >= 3) return; // kullanici manuel yenilesin
      recovering = true;
      r.push(Date.now());
      try { sessionStorage.setItem(KEY, JSON.stringify(r)); } catch (e) { /* */ }
      var done = function () {
        var u = new URL(window.location.href);
        u.searchParams.set('_r', String(Date.now()));
        window.location.replace(u.toString());
      };
      var p = Promise.resolve();
      if ('serviceWorker' in navigator) p = p.then(function () { return navigator.serviceWorker.getRegistrations(); }).then(function (rs) { return Promise.all(rs.map(function (x) { return x.unregister(); })); }).catch(function () {});
      if ('caches' in window) p = p.then(function () { return caches.keys(); }).then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }).catch(function () {});
      // Deployment gecisi birkac saniye surebilir — kisa bekle
      p.then(function () { setTimeout(done, 1500); });
      if (window.console) console.warn('[bootGuard] entry asset failed (' + reason + '), reloading');
    }
    window.addEventListener('error', function (e) {
      var t = e && e.target;
      if (!t || t === window) return;
      var tag = (t.tagName || '').toUpperCase();
      var src = t.src || t.href || '';
      if ((tag === 'SCRIPT' || tag === 'LINK') && src.indexOf('/assets/') !== -1) recover(src);
    }, true);
  } catch (e) { /* sessiz */ }
})();
