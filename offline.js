// Tryb offline: rejestracja service workera i zapisywanie wszystkich zdjęć w telefonie.
import { $ } from './narzedzia.js';
import { S } from './stan.js';
import { trybChmury, zalogowany, pobierzPlik } from './chmura.js';

export const zdjecia = { gotowe: 0, razem: 0, trwa: false };
export const offlineMozliwy = () => 'serviceWorker' in navigator && window.isSecureContext;

export async function zarejestrujSW() {
  if (!offlineMozliwy()) return;
  try {
    await navigator.serviceWorker.register('sw.js');
    await navigator.serviceWorker.ready;
    try { await navigator.storage?.persist?.(); } catch { /* opcjonalne */ }
    pobierzZdjecia(false);
  } catch (e) {
    console.warn('Service worker niedostępny:', e);
  }
}

export async function pobierzZdjecia(recznie) {
  if (zdjecia.trwa || !('caches' in window)) return;
  const adresy = [...S.przepisy.values()].map((p) => p.zdjecie).filter((a) => a && !a.startsWith('data:'));
  const cache = await caches.open('zdjecia');
  const mam = new Set((await cache.keys()).map((r) => new URL(r.url).pathname));
  const brak = adresy.filter((a) => !mam.has(new URL(a, location.href).pathname));
  Object.assign(zdjecia, { razem: adresy.length, gotowe: adresy.length - brak.length, trwa: true });
  pasek();
  if (!brak.length || (!recznie && !navigator.onLine)) { zdjecia.trwa = false; pasek(); return; }
  let i = 0;
  const pracownik = async () => {
    while (i < brak.length) {
      const a = brak[i++];
      try {
        if (trybChmury()) {
          // zdjęcia leżą w prywatnym schowku – pobieramy z biletem logowania i zapisujemy pod adresem aplikacji
          if (!zalogowany()) break;
          const r = await pobierzPlik(a);
          const typ = r.headers.get('content-type') || 'image/jpeg';
          await cache.put(new URL(a, location.href).href, new Response(await r.blob(), { headers: { 'Content-Type': typ } }));
          zdjecia.gotowe++;
        } else {
          const r = await fetch(a);
          if (r.ok) { await cache.put(a, r); zdjecia.gotowe++; }
        }
      } catch { /* spróbujemy następnym razem */ }
      pasek();
    }
  };
  await Promise.all([pracownik(), pracownik(), pracownik()]);     // 3 naraz – nie obciąża sieci
  zdjecia.trwa = false;
  pasek();
}

export function pasek() {
  const ile = $('#zdj-ile'), p = $('#zdj-pasek'), btn = $('#zdj-pobierz');
  if (!ile) return;
  const { gotowe, razem, trwa } = zdjecia;
  ile.textContent = `${gotowe} z ${razem}`;
  p.style.width = `${razem ? (100 * gotowe) / razem : 0}%`;
  btn.disabled = trwa || (razem && gotowe >= razem);
  btn.textContent = trwa ? 'Pobieram…' : gotowe >= razem && razem ? 'Wszystkie zdjęcia są w telefonie' : 'Pobierz wszystkie zdjęcia teraz';
}
