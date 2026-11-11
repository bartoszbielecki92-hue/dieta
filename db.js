// Lokalna baza w przeglądarce (IndexedDB) – dzięki niej wszystko działa bez internetu.
//
// Magazyny:
//   meta      – wersja bazy przepisów, osoby, kategorie, miary; ustawienia tego urządzenia
//   przepisy  – przepisy (z importu RESPO, później też własne)
//   produkty  – baza produktów
//   wpisy     – plan dni: posiłki obu osób, odhaczenia, posiłki spoza planu
//   listy     – listy zakupów
// Każdy wpis i lista mają pola: id, zmienil (kto), zmieniono (kiedy), usuniety – pod synchronizację (etap 5).
// Każda zmiana zapisana przez zapisz() trafia też do „kolejki” (meta/doWyslania), którą synchronizacja wysyła do chmury.
import { trybChmury, pobierzPlik } from './chmura.js';

const NAZWA = 'dieta-app';
const WERSJA_SCHEMATU = 2;

let polaczenie;
function otworz() {
  if (polaczenie) return polaczenie;
  polaczenie = new Promise((ok, blad) => {
    const req = indexedDB.open(NAZWA, WERSJA_SCHEMATU);
    req.onupgradeneeded = () => {
      const db = req.result;
      const jest = (n) => db.objectStoreNames.contains(n);
      if (!jest('meta')) db.createObjectStore('meta');
      if (!jest('przepisy')) db.createObjectStore('przepisy', { keyPath: 'id' });
      if (!jest('produkty')) db.createObjectStore('produkty', { keyPath: 'id' });
      if (!jest('wpisy')) db.createObjectStore('wpisy', { keyPath: 'id' }).createIndex('data', 'data');
      if (!jest('listy')) db.createObjectStore('listy', { keyPath: 'id' });
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => blad(req.error);
  });
  return polaczenie;
}

const zadanie = (req) => new Promise((ok, blad) => { req.onsuccess = () => ok(req.result); req.onerror = () => blad(req.error); });
const koniec = (tx) => new Promise((ok, blad) => { tx.oncomplete = () => ok(); tx.onerror = tx.onabort = () => blad(tx.error); });

async function zapiszBaze(db, baza) {
  const tx = db.transaction(['meta', 'przepisy', 'produkty', 'wpisy'], 'readwrite');
  const przepisy = tx.objectStore('przepisy');
  const produkty = tx.objectStore('produkty');
  // własne przepisy (zrodlo 'wlasne') zostają – podmieniamy tylko te z RESPO
  const stare = await zadanie(przepisy.getAll());
  for (const p of stare) if (p.zrodlo !== 'wlasne') przepisy.delete(p.id);
  const stareProdukty = await zadanie(produkty.getAll());
  for (const p of stareProdukty) if (!p.wlasny) produkty.delete(p.id);
  for (const p of baza.przepisy) przepisy.put(p);
  for (const p of baza.produkty) produkty.put(p);
  // plan z RESPO dopisujemy tylko tam, gdzie nie ma jeszcze wpisu (zmiany w aplikacji nigdy nie są nadpisywane)
  const wpisy = tx.objectStore('wpisy');
  for (const w of baza.planRespo || []) {
    const jest = await zadanie(wpisy.getKey(w.id));
    if (jest === undefined) wpisy.put(w);
  }
  const { przepisy: _a, produkty: _b, planRespo: _c, ...meta } = baza;
  tx.objectStore('meta').put(meta, 'baza');
  await koniec(tx);
}

async function wersjaNaSerwerze() {
  try {
    const r = trybChmury() ? await pobierzPlik('wersja.json') : await fetch('data/wersja.json', { cache: 'no-store' });
    return r.ok ? (await r.json()).wersja : null;
  } catch {
    return null;                        // brak połączenia – normalne offline
  }
}

async function pobierzBaze(wersja) {
  if (trybChmury()) return (await pobierzPlik('baza.json')).json();
  const r = await fetch(`data/baza.json?v=${wersja}`);
  if (!r.ok) throw new Error(`Serwer zwrócił błąd ${r.status} przy pobieraniu bazy.`);
  return r.json();
}

/** Zwraca { wersja, utworzono, osoby, kategorie, miary, przepisy, produkty, wpisy, listy, ustawienia, zrodlo, serwerDostepny } */
export async function wczytajWszystko(status = () => {}) {
  const db = await otworz();
  const lokalna = await zadanie(db.transaction('meta').objectStore('meta').get('baza'));
  const zdalna = await wersjaNaSerwerze();
  let zrodlo = 'telefon';

  if (zdalna && (!lokalna || lokalna.wersja !== zdalna)) {
    status(lokalna ? 'Pobieram nowszą bazę przepisów…' : 'Pierwsze uruchomienie: pobieram bazę przepisów…');
    await zapiszBaze(db, await pobierzBaze(zdalna));
    zrodlo = 'serwer';
  } else if (!lokalna) {
    throw new Error(trybChmury()
      ? 'W telefonie nie ma jeszcze bazy przepisów. Za pierwszym razem aplikację trzeba otworzyć z internetem.'
      : 'W telefonie nie ma jeszcze bazy przepisów, a serwer jest niedostępny. ' +
        'Za pierwszym razem aplikację trzeba otworzyć przy działającym serwerze.');
  }

  const tx = db.transaction(['meta', 'przepisy', 'produkty', 'wpisy', 'listy']);
  const [meta, ustawienia, przepisy, produkty, wpisy, listy] = await Promise.all([
    zadanie(tx.objectStore('meta').get('baza')),
    zadanie(tx.objectStore('meta').get('ustawienia')),
    zadanie(tx.objectStore('przepisy').getAll()),
    zadanie(tx.objectStore('produkty').getAll()),
    zadanie(tx.objectStore('wpisy').getAll()),
    zadanie(tx.objectStore('listy').getAll()),
  ]);
  return { ...meta, przepisy, produkty, wpisy, listy, ustawienia: ustawienia || {}, zrodlo, serwerDostepny: Boolean(zdalna) };
}

// ---------------------------------------------------------------- zapis i kolejka do wysłania
export const SYNCHRONIZOWANE = ['wpisy', 'listy', 'przepisy', 'produkty'];
const doKolejki = (magazyn, r) => SYNCHRONIZOWANE.includes(magazyn)
  && (magazyn !== 'przepisy' || r.zrodlo === 'wlasne') && (magazyn !== 'produkty' || r.wlasny);

/** Zapisuje rekordy w magazynie (put). zSerwera = rekordy przyszły z chmury (nie wysyłamy ich z powrotem). */
export async function zapisz(magazyn, rekordy, { zSerwera = false } = {}) {
  const lista = [].concat(rekordy);
  const db = await otworz();
  const tx = db.transaction([magazyn, 'meta'], 'readwrite');
  const st = tx.objectStore(magazyn);
  for (const r of lista) st.put(r);
  const nowe = zSerwera ? [] : lista.filter((r) => doKolejki(magazyn, r)).map((r) => `${magazyn}:${r.id}`);
  if (nowe.length) {
    const meta = tx.objectStore('meta');
    const k = (await zadanie(meta.get('doWyslania'))) || {};
    for (const n of nowe) k[n] = true;
    meta.put(k, 'doWyslania');
  }
  await koniec(tx);
  if (nowe.length) window.dispatchEvent(new Event('dieta-zmiana'));
}

/** Dopisuje klucze „magazyn:id” do kolejki (np. wspólne ustawienia). */
export async function dodajDoKolejki(klucze) {
  const db = await otworz();
  const tx = db.transaction('meta', 'readwrite');
  const meta = tx.objectStore('meta');
  const k = (await zadanie(meta.get('doWyslania'))) || {};
  for (const n of klucze) k[n] = true;
  meta.put(k, 'doWyslania');
  await koniec(tx);
  window.dispatchEvent(new Event('dieta-zmiana'));
}

export async function kolejka() {
  const db = await otworz();
  return Object.keys((await zadanie(db.transaction('meta').objectStore('meta').get('doWyslania'))) || {});
}

/** Usuwa z kolejki wysłane klucze – chyba że rekord zmienił się w trakcie wysyłania (wersje: klucz -> zmieniono). */
export async function odznaczWyslane(wersje) {
  const db = await otworz();
  const magazyny = [...new Set(Object.keys(wersje).map((k) => k.split(':')[0]).filter((m) => SYNCHRONIZOWANE.includes(m)))];
  const tx = db.transaction(['meta', ...magazyny], 'readwrite');
  const meta = tx.objectStore('meta');
  const k = (await zadanie(meta.get('doWyslania'))) || {};
  for (const [klucz, zmieniono] of Object.entries(wersje)) {
    const [m, ...reszta] = klucz.split(':');
    if (magazyny.includes(m)) {
      const teraz = await zadanie(tx.objectStore(m).get(idZ(reszta.join(':'))));
      if (teraz && teraz.zmieniono !== zmieniono) continue;
    }
    delete k[klucz];
  }
  meta.put(k, 'doWyslania');
  await koniec(tx);
}

/** Klucze w IndexedDB bywają liczbami (np. przepisy z RESPO) – w kolejce są tekstem. */
const idZ = (s) => (/^\d+$/.test(s) ? Number(s) : s);

export async function pobierzRekordy(magazyn, idki) {
  const db = await otworz();
  const st = db.transaction(magazyn).objectStore(magazyn);
  return Promise.all(idki.map(async (id) => (await zadanie(st.get(idZ(id)))) ?? (await zadanie(st.get(String(id))))));
}

export async function czytajMeta(klucz) {
  const db = await otworz();
  return zadanie(db.transaction('meta').objectStore('meta').get(klucz));
}
export async function zapiszMeta(klucz, wartosc) {
  const db = await otworz();
  const tx = db.transaction('meta', 'readwrite');
  tx.objectStore('meta').put(wartosc, klucz);
  await koniec(tx);
}


export async function zapiszUstawienia(ustawienia) {
  const db = await otworz();
  const tx = db.transaction('meta', 'readwrite');
  tx.objectStore('meta').put(ustawienia, 'ustawienia');
  await koniec(tx);
}
