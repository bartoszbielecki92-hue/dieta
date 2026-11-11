// Synchronizacja z chmurą: wysyła zmiany z tego telefonu i pobiera zmiany z drugiego.
// Zasada: przy tym samym rekordzie wygrywa nowsza zmiana (pole „zmieniono”). Działa też po długim czasie offline –
// zmiany czekają w kolejce i wysyłają się, gdy wróci internet.
import { trybChmury, zalogowany, zapytanie } from './chmura.js';
import { kolejka, odznaczWyslane, pobierzRekordy, zapisz, czytajMeta, zapiszMeta, zapiszUstawienia } from './db.js';
import { S, dodajDoIndeksu, WSPOLNE_USTAWIENIA } from './stan.js';

export const sync = { trwa: false, ostatnio: null, czeka: 0, blad: null };
const sluchacze = new Set();
/** f(liczbaPobranychZmian) – wywoływane po każdej synchronizacji (np. żeby odświeżyć ekran). */
export const poSynchronizacji = (f) => sluchacze.add(f);

let biezaca = null, jeszczeRaz = false;

export function synchronizuj() {
  if (!trybChmury() || !zalogowany()) return Promise.resolve(0);
  if (biezaca) { jeszczeRaz = true; return biezaca; }
  biezaca = (async () => {
    let pobrane = 0;
    sync.trwa = true;
    try {
      do {
        jeszczeRaz = false;
        await wyslij();
        pobrane += await pobierz();
      } while (jeszczeRaz);
      sync.blad = null;
      sync.ostatnio = new Date();
    } catch (e) {
      sync.blad = e.status === 0 ? 'offline' : e.message;
      if (e.status !== 0) console.warn('Synchronizacja:', e);
    } finally {
      sync.czeka = (await kolejka()).length;
      sync.trwa = false;
      biezaca = null;
    }
    for (const f of sluchacze) { try { f(pobrane); } catch (e) { console.error(e); } }
    return pobrane;
  })();
  return biezaca;
}

// ---------------------------------------------------------------- wysyłanie
async function wyslij() {
  const klucze = await kolejka();
  sync.czeka = klucze.length;
  if (!klucze.length) return;
  const wiersze = [];
  const wersje = {};
  const wgMagazynu = {};
  for (const k of klucze) {
    const [m, ...r] = k.split(':');
    (wgMagazynu[m] ||= []).push(r.join(':'));
  }
  for (const [m, idki] of Object.entries(wgMagazynu)) {
    if (m === 'ustawienia') {
      const dane = Object.fromEntries(WSPOLNE_USTAWIENIA.filter((k) => S.ustawienia[k] !== undefined).map((k) => [k, S.ustawienia[k]]));
      const zmieniono = S.ustawienia._wspolneZmieniono || new Date().toISOString();
      wiersze.push({ magazyn: 'ustawienia', id: 'wspolne', dane, usuniety: false, zmieniono });
      wersje['ustawienia:wspolne'] = zmieniono;
      continue;
    }
    const rekordy = await pobierzRekordy(m, idki);
    rekordy.forEach((rec, i) => {
      const klucz = `${m}:${idki[i]}`;
      if (!rec) { wersje[klucz] = undefined; return; }
      const zmieniono = rec.zmieniono || new Date().toISOString();
      wiersze.push({ magazyn: m, id: String(rec.id), dane: rec, usuniety: Boolean(rec.usuniety), zmieniono });
      wersje[klucz] = rec.zmieniono;
    });
  }
  for (let i = 0; i < wiersze.length; i += 200) {
    await zapytanie('/rest/v1/rekordy?on_conflict=magazyn,id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(wiersze.slice(i, i + 200)),
    });
  }
  await odznaczWyslane(wersje);
}

// ---------------------------------------------------------------- pobieranie
const NA_RAZ = 500;

async function pobierz() {
  const ostatni = await czytajMeta('syncOd');
  // 30 s zapasu: zapis, który zaczął się wcześniej, a skończył później, też zostanie pobrany (powtórki nie szkodzą)
  let od = ostatni ? new Date(new Date(ostatni).getTime() - 30000).toISOString() : '1970-01-01T00:00:00Z';
  let najnowszy = ostatni;
  let zmiany = 0;
  for (;;) {
    const r = await zapytanie(`/rest/v1/rekordy?select=magazyn,id,dane,zmieniono,serwer_czas`
      + `&serwer_czas=gt.${encodeURIComponent(od)}&order=serwer_czas.asc&limit=${NA_RAZ}`);
    const wiersze = await r.json();
    zmiany += await zastosuj(wiersze);
    if (wiersze.length) najnowszy = wiersze[wiersze.length - 1].serwer_czas;
    if (wiersze.length < NA_RAZ) break;
    od = najnowszy;
  }
  if (najnowszy && najnowszy !== ostatni) await zapiszMeta('syncOd', najnowszy);
  return zmiany;
}

const nowsze = (a, b) => new Date(a).getTime() > new Date(b || 0).getTime();

async function zastosuj(wiersze) {
  let zmiany = 0;
  const wgMagazynu = {};
  for (const w of wiersze) (wgMagazynu[w.magazyn] ||= []).push(w);

  for (const [m, lista] of Object.entries(wgMagazynu)) {
    if (m === 'ustawienia') {
      const w = lista[lista.length - 1];
      if (!nowsze(w.zmieniono, S.ustawienia._wspolneZmieniono)) continue;
      Object.assign(S.ustawienia, w.dane, { _wspolneZmieniono: w.zmieniono });
      await zapiszUstawienia(S.ustawienia);
      zmiany++;
      continue;
    }
    if (!['wpisy', 'listy', 'przepisy', 'produkty'].includes(m)) continue;
    const lokalne = await pobierzRekordy(m, lista.map((w) => w.id));
    const doZapisu = lista.filter((w, i) => !lokalne[i] || nowsze(w.zmieniono, lokalne[i].zmieniono)).map((w) => w.dane);
    if (!doZapisu.length) continue;
    await zapisz(m, doZapisu, { zSerwera: true });
    for (const rec of doZapisu) {
      if (m === 'wpisy') S.wpisy.set(rec.id, rec);
      else if (m === 'listy') S.listy.set(rec.id, rec);
      else if (m === 'produkty') { if (rec.usuniety) S.produkty.delete(rec.id); else S.produkty.set(rec.id, rec); }
      else if (rec.usuniety) S.przepisy.delete(String(rec.id));
      else dodajDoIndeksu({ ...rec });
    }
    zmiany += doZapisu.length;
  }
  return zmiany;
}

// ---------------------------------------------------------------- kiedy synchronizować
let czasomierz = null;
export function uruchomSynchronizacje() {
  if (!trybChmury()) return;
  synchronizuj();
  // po każdej zmianie w telefonie – chwilę później (kilka szybkich zmian idzie razem)
  window.addEventListener('dieta-zmiana', () => { clearTimeout(czasomierz); czasomierz = setTimeout(synchronizuj, 1500); });
  window.addEventListener('online', () => synchronizuj());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') synchronizuj(); });
  // co 30 s, gdy aplikacja jest na ekranie – żeby widzieć zmiany partnera
  setInterval(() => { if (document.visibilityState === 'visible' && navigator.onLine) synchronizuj(); }, 30000);
}
