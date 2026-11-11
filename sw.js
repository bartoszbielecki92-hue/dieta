// Service worker – pozwala otworzyć aplikację bez internetu.
// - pliki aplikacji: najpierw sieć (żeby widzieć nowe wersje), a bez sieci – kopia z telefonu
// - zdjęcia: najpierw kopia z telefonu, a jeśli jej nie ma – sieć (i zapis kopii)
// - dane (data/*): zawsze z sieci; offline aplikacja bierze je z IndexedDB (db.js)
const WERSJA = 'v9';
const POWLOKA = `powloka-${WERSJA}`;
const ZDJECIA = 'zdjecia';
const PLIKI = ['./', 'index.html', 'app.js', 'db.js', 'stan.js', 'ui.js', 'narzedzia.js', 'offline.js',
  'konfiguracja.js', 'chmura.js', 'synchronizacja.js', 'widoki/logowanie.js',
  'widoki/przepisy.js', 'widoki/dzien.js', 'widoki/plan.js', 'widoki/wybor.js', 'widoki/ustawienia.js', 'widoki/zakupy.js', 'widoki/wlasny.js',
  'styles.css', 'manifest.json', 'ikony/ikona-180.png', 'ikony/ikona-192.png', 'ikony/ikona-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(POWLOKA).then((c) => c.addAll(PLIKI)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('powloka-') && k !== POWLOKA) await caches.delete(k);
    await self.clients.claim();
  })());
});

function zLimitemCzasu(obietnica, ms) {
  return Promise.race([obietnica, new Promise((_, nie) => setTimeout(() => nie(new Error('timeout')), ms))]);
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.includes('/data/')) return;                     // dane obsługuje IndexedDB

  if (url.pathname.includes('/img/')) {
    e.respondWith((async () => {
      const cache = await caches.open(ZDJECIA);
      const kopia = await cache.match(e.request, { ignoreSearch: true });
      if (kopia) return kopia;
      try {
        const r = await fetch(e.request);
        if (r.ok) cache.put(e.request, r.clone());
        return r;
      } catch {
        return new Response('', { status: 404 });                  // brak zdjęcia offline – bez błędu
      }
    })());
    return;
  }

  e.respondWith((async () => {
    const cache = await caches.open(POWLOKA);
    try {
      const r = await zLimitemCzasu(fetch(e.request), 4000);
      if (r.ok) cache.put(e.request, r.clone());
      return r;
    } catch {
      return (await cache.match(e.request, { ignoreSearch: true }))
        || (e.request.mode === 'navigate' ? cache.match('index.html') : Response.error());
    }
  })());
});
