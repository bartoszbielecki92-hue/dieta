// Stan aplikacji w pamięci + logika: kalorie, plan dni, przeliczanie przepisów dla partnera.
import { norm, uuid, pamiec } from './narzedzia.js';
import { zapisz, zapiszUstawienia, dodajDoKolejki } from './db.js';

export const S = {
  baza: null,
  przepisy: new Map(),        // id (string) -> przepis
  produkty: new Map(),        // id -> produkt
  wpisy: new Map(),           // id -> wpis planu
  listy: new Map(),           // id -> lista zakupów
  ustawienia: {},             // ja (kto używa tego telefonu), cele kcal, kolejność kategorii
  osoba: pamiec.czytaj('osoba', null),       // czyje kcal pokazuje zakładka Przepisy
  widokDnia: pamiec.czytaj('widokDnia', 'oboje'),
};

// ---------------------------------------------------------------- start
export function przygotuj(baza) {
  S.baza = baza;
  S.ustawienia = baza.ustawienia || {};
  S.produkty = new Map(baza.produkty.filter((p) => !p.usuniety).map((p) => [p.id, p]));
  S.przepisy = new Map();
  for (const p of baza.przepisy) if (!p.usuniety) dodajDoIndeksu(p);
  S.wpisy = new Map(baza.wpisy.map((w) => [w.id, w]));
  S.listy = new Map(baza.listy.map((l) => [l.id, l]));
  S.kolekcje = [...new Set(baza.przepisy.flatMap((p) => p.tagi || []))].sort((a, b) => a.localeCompare(b, 'pl'));
  if (!osoby().some((o) => o.id === S.osoba)) S.osoba = S.ustawienia.ja || osoby()[0].id;
}

export function dodajDoIndeksu(p) {
  const skladniki = new Set();
  for (const w of Object.values(p.warianty)) for (const s of w.skladniki) if (s.nazwa) skladniki.add(s.nazwa);
  p._szukajNazwa = norm(`${p.nazwa} ${(p.tagi || []).join(' ')}`);
  p._skladniki = [...skladniki];
  p._szukajSkl = p._skladniki.map(norm);
  p._czas = (p.czasPrzygotowania || 0) + (p.czasGotowania || 0);
  S.przepisy.set(String(p.id), p);
}

// ---------------------------------------------------------------- osoby
export const osoby = () => S.baza.osoby;
export const osoba = (id) => S.baza.osoby.find((o) => o.id === id);
export const imie = (id) => osoba(id)?.imie ?? id;
export const partner = (id) => S.baza.osoby.find((o) => o.id !== id)?.id;
export const celKcal = (id) => S.ustawienia.cele?.[id] ?? osoba(id)?.kcal;
export const ja = () => S.ustawienia.ja || null;

// Ustawienia wspólne dla obu telefonów (synchronizowane). Reszta (np. „kto używa telefonu”) zostaje w telefonie.
export const WSPOLNE_USTAWIENIA = ['cele', 'kolejnoscKategorii', 'kategorieProduktow'];

export async function ustaw(zmiany, { zSerwera = false } = {}) {
  Object.assign(S.ustawienia, zmiany);
  const wspolne = !zSerwera && Object.keys(zmiany).some((k) => WSPOLNE_USTAWIENIA.includes(k));
  if (wspolne) S.ustawienia._wspolneZmieniono = new Date().toISOString();
  await zapiszUstawienia(S.ustawienia);
  if (wspolne) await dodajDoKolejki(['ustawienia:wspolne']);
}

export function slotyOsoby(id) { return osoba(id)?.posilki || []; }
export function nazwaSlotu(id, slot) {
  const s = slotyOsoby(id).find((x) => x.nr === slot);
  return s ? `Posiłek ${slot} · ${s.rodzaj}${s.pora && !s.pora.startsWith('dowolna') ? ` · ${s.pora}` : ''}` : `Posiłek ${slot}`;
}

// ---------------------------------------------------------------- przepisy i kalorie
export const przepis = (id) => S.przepisy.get(String(id));

/** Wariant przepisu dla wpisu: przeliczony (zapisany we wpisie) albo wersja osoby z RESPO. */
export function wariantWpisu(w) {
  if (w.typ !== 'przepis') return null;
  return w.wariant || przepis(w.przepisId)?.warianty[w.osoba] || null;
}

/** kcal i B/T/W jednej porcji osoby (mnożnik porcji nie zmienia licznika – SPEC 7). */
export function makroWpisu(w) {
  if (w.typ === 'spoza') {
    if (w.produktId && w.gramy) {
      const n = S.produkty.get(w.produktId)?.na100g;
      if (n) return { kcal: (n.kcal * w.gramy) / 100, b: (n.b * w.gramy) / 100, t: (n.t * w.gramy) / 100, w: (n.w * w.gramy) / 100 };
    }
    return { kcal: w.kcal ?? null, b: null, t: null, w: null };
  }
  const n = wariantWpisu(w)?.naPorcje;
  return n ? { kcal: n.kcal, b: n.b, t: n.t, w: n.w } : { kcal: null, b: null, t: null, w: null };
}

export function suma(lista) {
  const s = { kcal: 0, b: 0, t: 0, w: 0, nieznane: 0 };
  for (const w of lista) {
    const m = makroWpisu(w);
    if (m.kcal == null) { s.nieznane++; continue; }
    s.kcal += m.kcal; s.b += m.b || 0; s.t += m.t || 0; s.w += m.w || 0;
  }
  return s;
}

// ---------------------------------------------------------------- plan dni
export function wpisyDnia(data, osobaId) {
  return [...S.wpisy.values()]
    .filter((w) => !w.usuniety && w.data === data && (!osobaId || w.osoba === osobaId) && (w.typ !== 'przepis' || przepis(w.przepisId)))
    .sort((a, b) => (a.slot || 99) - (b.slot || 99) || (a.kolejnosc || 0) - (b.kolejnosc || 0) || String(a.zmieniono).localeCompare(String(b.zmieniono)));
}

export function dniZWpisami() {
  const d = new Set();
  for (const w of S.wpisy.values()) if (!w.usuniety) d.add(w.data);
  return d;
}

/** Zapisuje wpis (nowy albo zmieniony): uzupełnia kto i kiedy zmienił. */
export async function zapiszWpis(w) {
  w.id ||= uuid();
  w.zmienil = ja() || w.osoba;
  w.zmieniono = new Date().toISOString();
  w.zrodlo = w.zrodlo === 'respo' ? 'respo-zmieniony' : (w.zrodlo || 'app');
  S.wpisy.set(w.id, w);
  await zapisz('wpisy', w);
  return w;
}

export async function zapiszWpisy(lista) {
  const kto = ja();
  const kiedy = new Date().toISOString();
  for (const w of lista) {
    w.id ||= uuid();
    w.zmienil = kto || w.osoba;
    w.zmieniono = kiedy;
    w.zrodlo = w.zrodlo === 'respo' ? 'respo-zmieniony' : (w.zrodlo || 'app');
    S.wpisy.set(w.id, w);
  }
  await zapisz('wpisy', lista);
}

/** Średnie kcal, jakie osoba jada w danym posiłku (z jej planu) – cel przy zamianie i przeliczaniu. */
export function sredniaSlotu(osobaId, slot) {
  const k = [];
  for (const w of S.wpisy.values()) {
    if (w.usuniety || w.osoba !== osobaId || w.slot !== slot || w.typ !== 'przepis') continue;
    const m = makroWpisu(w).kcal;
    if (m != null) k.push(m);
  }
  if (k.length) return k.reduce((a, b) => a + b, 0) / k.length;
  const sloty = slotyOsoby(osobaId).length || 4;
  return celKcal(osobaId) / sloty;
}

// ---------------------------------------------------------------- przeliczanie dla partnera (SPEC 6)
const MIARY_SZTUKOWE = new Set([1, 2, 3, 5, 9, 11, 14, 17]);   // sztuka, łyżeczka, łyżka, plaster, kromka, opakowanie, ząbek, kostka

/** Zaokrąglanie "po ludzku". */
export function ludzkieGramy(g) {
  if (g <= 0) return g;
  if (g < 5) return Math.round(g * 2) / 2;
  if (g < 50) return Math.round(g);
  if (g < 200) return Math.round(g / 5) * 5;
  return Math.round(g / 10) * 10;
}

function skalujSkladnik(s, czynnik) {
  const wynik = { ...s };
  if (s.grupa) return wynik;
  if (s.miaraId && s.ilosc && MIARY_SZTUKOWE.has(s.miaraId)) {
    const naJednostke = s.gramy / s.ilosc;
    const ilosc = Math.max(0.5, Math.round(s.ilosc * czynnik * 2) / 2);   // całe albo połówki
    wynik.ilosc = ilosc;
    wynik.gramy = Math.round(ilosc * naJednostke * 10) / 10;
  } else {
    wynik.gramy = ludzkieGramy(s.gramy * czynnik);
    if (s.ilosc) wynik.ilosc = Math.round(s.ilosc * czynnik * 10) / 10;
  }
  if (s.zamienniki) wynik.zamienniki = s.zamienniki.map((z) => skalujSkladnik(z, czynnik));
  return wynik;
}

/** Wartości na porcję policzone ze składników (po przeliczeniu). */
export function policzNaPorcje(skladniki, porcje) {
  const s = { kcal: 0, b: 0, t: 0, w: 0, blonnik: 0 };
  for (const x of skladniki) {
    if (x.grupa) continue;
    const n = S.produkty.get(x.produktId)?.na100g;
    if (!n) return null;
    for (const [k, z] of [['kcal', 'kcal'], ['b', 'b'], ['t', 't'], ['w', 'w'], ['blonnik', 'blonnik']]) s[k] += ((n[z] || 0) * x.gramy) / 100;
  }
  const r = (v, d = 0) => Math.round((v / porcje) * 10 ** d) / 10 ** d;
  return { kcal: r(s.kcal), b: r(s.b), t: r(s.t), w: r(s.w), blonnik: r(s.blonnik, 1) };
}

export function przeliczWariant(wariant, czynnik, zOsoby) {
  const skladniki = wariant.skladniki.map((s) => skalujSkladnik(s, czynnik));
  const naPorcje = policzNaPorcje(skladniki, wariant.porcje)
    || Object.fromEntries(Object.entries(wariant.naPorcje).map(([k, v]) => [k, v == null ? v : Math.round(v * czynnik)]));
  return { porcje: wariant.porcje, naPorcje, skladniki, przeliczony: { z: zOsoby, czynnik: Math.round(czynnik * 100) / 100 } };
}

/**
 * Podgląd "Skopiuj dzień do partnera".
 * Dopasowanie po rodzaju posiłku (śniadanie → śniadanie…); gramatury: wersja partnera z RESPO,
 * a gdy jej nie ma – przeliczenie: docelowe kcal posiłku partnera / kcal posiłku źródłowego.
 */
export function podgladKopii(data, zOsoby) {
  const doOsoby = partner(zOsoby);
  const zrodlowe = wpisyDnia(data, zOsoby).filter((w) => w.typ === 'przepis' && w.slot);
  const docelowe = wpisyDnia(data, doOsoby);
  const wolne = [...zrodlowe];
  const pozycje = [];
  for (const slot of slotyOsoby(doOsoby)) {
    const idx = wolne.findIndex((w) => rodzajSlotu(zOsoby, w.slot) === slot.rodzaj);
    const obecne = docelowe.filter((w) => w.slot === slot.nr && w.typ === 'przepis');
    if (idx < 0) { pozycje.push({ slot, zrodlo: null, obecne, wynik: null }); continue; }
    const zr = wolne.splice(idx, 1)[0];
    const p = przepis(zr.przepisId);
    if (p?.warianty[doOsoby] && obecne.length === 1 && String(obecne[0].przepisId) === String(zr.przepisId) && !obecne[0].wariant) {
      pozycje.push({ slot, zrodlo: zr, obecne, wynik: null, sposob: { typ: 'bez-zmian' } });   // to samo danie już jest
      continue;
    }
    let wariant = null, sposob;
    if (p?.warianty[doOsoby]) {
      sposob = { typ: 'respo' };
    } else {
      const wz = wariantWpisu(zr);
      const kcalZr = wz?.naPorcje.kcal;
      const cel = obecne.length ? makroWpisu(obecne[0]).kcal : null;
      const docelowe2 = cel ?? sredniaSlotu(doOsoby, slot.nr);
      const czynnik = kcalZr ? docelowe2 / kcalZr : 1;
      wariant = wz ? przeliczWariant(wz, czynnik, zOsoby) : null;
      sposob = { typ: 'przeliczony', czynnik };
    }
    const wynik = { data, osoba: doOsoby, slot: slot.nr, typ: 'przepis', przepisId: zr.przepisId, porcje: 1, stan: null };
    if (wariant) wynik.wariant = wariant;
    pozycje.push({ slot, zrodlo: zr, obecne, wynik, sposob });
  }
  const pozostale = docelowe.filter((w) => !pozycje.some((p) => p.wynik && p.obecne.includes(w)));
  const poKopii = [...pozostale, ...pozycje.filter((p) => p.wynik).map((p) => p.wynik)];
  return { doOsoby, pozycje, nieskopiowane: wolne, sumaPo: suma(poKopii.filter((w) => w.stan !== 'pominiety')) };
}

export function rodzajSlotu(osobaId, slot) { return slotyOsoby(osobaId).find((s) => s.nr === slot)?.rodzaj; }

export async function wykonajKopie(podglad) {
  const zmiany = [];
  for (const p of podglad.pozycje) {
    if (!p.wynik) continue;
    for (const o of p.obecne) zmiany.push({ ...o, usuniety: true });
    zmiany.push({ ...p.wynik, id: uuid(), zrodlo: 'kopia' });
  }
  await zapiszWpisy(zmiany);
  return zmiany.length;
}

// ---------------------------------------------------------------- listy zakupów (SPEC 8)
export const BEZ_KATEGORII = 0;

export function kolejnoscKategorii() {
  const domyslna = S.baza.kategorie.map((k) => k.id);
  const wynik = (S.ustawienia.kolejnoscKategorii || []).filter((id) => domyslna.includes(id));
  // nowa kategoria (np. dodana w imporcie) trafia za swoją poprzedniczkę z domyślnej kolejności
  domyslna.forEach((id, i) => {
    if (wynik.includes(id)) return;
    const przed = wynik.indexOf(domyslna[i - 1]);
    wynik.splice(przed + 1, 0, id);
  });
  return wynik;
}
export const nazwaKategorii = (id) => S.baza.kategorie.find((k) => k.id === id)?.nazwa || 'Bez kategorii';

export function kategoriaProduktu(id) {
  return S.ustawienia.kategorieProduktow?.[id] ?? S.produkty.get(id)?.kategoria ?? BEZ_KATEGORII;
}

export async function zapiszListe(l) {
  l.id ||= uuid();
  l.zmienil = ja() || osoby()[0].id;
  l.zmieniono = new Date().toISOString();
  S.listy.set(l.id, l);
  await zapisz('listy', l);
  return l;
}

/** Wpisy planu (dania) z zakresu dat listy – bez pominiętych. */
export function daniaListy(l) {
  return [...S.wpisy.values()]
    .filter((w) => !w.usuniety && w.typ === 'przepis' && w.data >= l.od && w.data <= l.do && w.stan !== 'pominiety' && przepis(w.przepisId))
    .sort((a, b) => a.data.localeCompare(b.data) || a.osoba.localeCompare(b.osoba) || (a.slot || 0) - (b.slot || 0));
}

/** Składniki zsumowane z mnożnikami: [{klucz, produktId, nazwa, gramy, kategoria, zrodla: [...] }] */
export function skladnikiListy(l) {
  const mapa = new Map();
  for (const w of daniaListy(l)) {
    const war = wariantWpisu(w);
    if (!war) continue;
    const m = (w.porcje || 1) / war.porcje;
    for (const s of war.skladniki) {
      if (s.grupa) continue;
      const klucz = s.produktId != null ? `p:${s.produktId}` : `n:${norm(s.nazwa)}`;
      if (!mapa.has(klucz)) {
        mapa.set(klucz, { klucz, produktId: s.produktId, nazwa: S.produkty.get(s.produktId)?.nazwa || s.nazwa,
          gramy: 0, kategoria: s.produktId != null ? kategoriaProduktu(s.produktId) : BEZ_KATEGORII, zrodla: [] });
      }
      const x = mapa.get(klucz);
      x.gramy += (s.gramy || 0) * m;
      x.zrodla.push({ wpisId: w.id, gramy: (s.gramy || 0) * m });
    }
  }
  return [...mapa.values()];
}

/** Wyszukiwanie produktów z sensowną kolejnością: dokładna nazwa, potem początek nazwy, potem całe słowa, potem reszta. */
export function szukajProduktow(tekst, limit = 8) {
  const q = norm(tekst).trim();
  const slowa = q.split(/\s+/).filter(Boolean);
  if (!slowa.length) return [];
  const wynik = [];
  for (const p of S.produkty.values()) {
    if (!p.na100g) continue;
    const n = norm(p.nazwa);
    if (!slowa.every((s) => n.includes(s))) continue;
    const slowaNazwy = n.split(/[\s,()]+/);
    const ocena = (n === q ? 0 : n.startsWith(q) ? 1 : 2)
      + (slowa.every((s) => slowaNazwy.includes(s)) ? 0 : 2)
      + n.length / 1000;
    wynik.push({ p, ocena });
  }
  return wynik.sort((a, b) => a.ocena - b.ocena).slice(0, limit).map((x) => x.p);
}
