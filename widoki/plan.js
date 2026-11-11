// Ekran Plan: dzisiaj i kolejne dni dla obu osób, zmiana dań, porcje, kopiowanie dnia do partnera.
import { $, esc, liczba, dzisISO, dodajDni, nazwaDnia, odmiana, poniedzialek, dzienKrotko, dzienMiesiaca, zakresTygodnia } from '../narzedzia.js';
import {
  S, osoby, imie, partner, celKcal, slotyOsoby, nazwaSlotu, przepis, makroWpisu, suma, wpisyDnia, zapiszWpis,
  wariantWpisu, podgladKopii, wykonajKopie, dniZWpisami,
} from '../stan.js';
import { ustawTytul, komunikat, wroc } from '../ui.js';
import { kimJestes, przelacznikOsob, obsluzAkcje, ktoZmienil, makroTekst, wierszPosilku } from './dzien.js';

const TYGODNI_DO_PRZODU = 4;        // ile tygodni w przód pokazuje pasek tygodni (poza tymi z planem)
const L = { dzien: null, kierunek: 0 };

export function widokPlanu(dzien) {
  L.dzien = dzien || L.dzien || dzisISO();
  ustawTytul('Plan');
  const d = L.dzien;
  const pn = poniedzialek(d);
  const dzis = dzisISO();
  const pokazane = S.widokDnia === 'oboje' ? osoby().map((o) => o.id) : [S.widokDnia];
  const zWpisami = dniZWpisami();
  const tygodnie = listaTygodni(pn, zWpisami);
  const dniTygodnia = Array.from({ length: 7 }, (_, i) => dodajDni(pn, i));
  const wjazd = L.kierunek > 0 ? ' wjazd-z-prawej' : L.kierunek < 0 ? ' wjazd-z-lewej' : '';
  L.kierunek = 0;

  $('#widok').innerHTML = `
    ${kimJestes()}
    <div class="nawigacja-planu">
      <nav class="tygodnie" id="tygodnie" aria-label="Tygodnie">
        ${tygodnie.map((t) => `<a href="#/plan/${t === poniedzialek(dzis) ? dzis : t}" data-dzien="${t === poniedzialek(dzis) ? dzis : t}"
            class="tydzien-btn${t === pn ? ' wybrany' : ''}${t === poniedzialek(dzis) ? ' biezacy' : ''}"${t === pn ? ' aria-current="true"' : ''}>
            ${t === poniedzialek(dzis) ? '<small>ten tydzień</small>' : ''}${esc(zakresTygodnia(t))}</a>`).join('')}
      </nav>
      <nav class="tydzien" aria-label="Dni tygodnia">
        ${dniTygodnia.map((x) => `<a href="#/plan/${x}" data-dzien="${x}" class="dzien${x === d ? ' wybrany' : ''}${x === dzis ? ' dzis' : ''}${zWpisami.has(x) ? '' : ' pusty'}"
            ${x === d ? 'aria-current="date"' : ''}><span>${dzienKrotko(x)}</span><b>${dzienMiesiaca(x)}</b></a>`).join('')}
      </nav>
    </div>
    <div class="dzien-tytul">
      <button type="button" class="strzalka-dnia" data-przesun="-1" aria-label="Poprzedni dzień">‹</button>
      <h2>${esc(nazwaDnia(d))}</h2>
      <button type="button" class="strzalka-dnia" data-przesun="1" aria-label="Następny dzień">›</button>
    </div>
    ${przelacznikOsob()}
    <section class="karta dzien-planu${wjazd}" id="dzien-planu">
      ${pokazane.map((o) => blokOsoby(d, o)).join('')}
    </section>
    <p class="uwaga podpowiedz-swipe">Przesuń palcem w lewo lub w prawo (na komputerze: strzałki ← →), aby zmienić dzień.</p>`;
  $('#widok').onclick = (e) => akcjaPlanu(e);
  // wybrany tydzień widoczny na pasku tygodni
  const wybrany = $('#tygodnie .wybrany');
  if (wybrany) $('#tygodnie').scrollLeft = wybrany.offsetLeft - ($('#tygodnie').clientWidth - wybrany.offsetWidth) / 2;
}

/** Tygodnie na pasku: od pierwszego tygodnia z planem do kilku tygodni w przód (i zawsze wybrany tydzień). */
function listaTygodni(wybrany, zWpisami) {
  const dni = [...zWpisami].sort();
  const dzisPn = poniedzialek(dzisISO());
  let od = dni.length ? poniedzialek(dni[0]) : dzisPn;
  let doo = dodajDni(dzisPn, 7 * TYGODNI_DO_PRZODU);
  if (dni.length && poniedzialek(dni[dni.length - 1]) > doo) doo = poniedzialek(dni[dni.length - 1]);
  if (wybrany < od) od = wybrany;
  if (wybrany > doo) doo = wybrany;
  const wynik = [];
  for (let t = od; t <= doo; t = dodajDni(t, 7)) wynik.push(t);
  return wynik;
}

/** Zmiana dnia o n (strzałki, swipe). Bez dopisywania do historii – „wstecz” nie przechodzi przez każdy dzień. */
function przesunDzien(n) {
  L.kierunek = n;
  location.replace(`${location.href.split('#')[0]}#/plan/${dodajDni(L.dzien || dzisISO(), n)}`);
}
function idzDoDnia(d) {
  if (d === L.dzien) return;
  L.kierunek = d > L.dzien ? 1 : -1;
  location.replace(`${location.href.split('#')[0]}#/plan/${d}`);
}
const naPlanie = () => /^#\/plan(\/|$)/.test(location.hash);

// strzałki na klawiaturze
document.addEventListener('keydown', (e) => {
  if (!naPlanie() || e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
  if (e.key === 'ArrowLeft') { e.preventDefault(); przesunDzien(-1); }
  if (e.key === 'ArrowRight') { e.preventDefault(); przesunDzien(1); }
});

// przesuwanie palcem (swipe) – tylko wyraźny ruch w poziomie, nie na pasku tygodni
let dotyk = null;
document.addEventListener('touchstart', (e) => {
  if (!naPlanie() || e.touches.length !== 1 || e.target.closest('#tygodnie, input, textarea, select, .mnoznik')) { dotyk = null; return; }
  dotyk = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
}, { passive: true });
document.addEventListener('touchend', (e) => {
  if (!dotyk || !naPlanie()) return;
  const dx = e.changedTouches[0].clientX - dotyk.x;
  const dy = e.changedTouches[0].clientY - dotyk.y;
  const czas = Date.now() - dotyk.t;
  dotyk = null;
  if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5 || czas > 800) return;
  przesunDzien(dx < 0 ? 1 : -1);          // palec w lewo = następny dzień
}, { passive: true });

function blokOsoby(data, o) {
  const wpisy = wpisyDnia(data, o);
  const s = suma(wpisy.filter((w) => w.stan !== 'pominiety'));
  const cel = celKcal(o);
  const roznica = Math.round(s.kcal - cel);
  const wiersze = slotyOsoby(o).map((slot) => {
    const lista = wpisy.filter((w) => w.typ === 'przepis' && w.slot === slot.nr);
    if (!lista.length) {
      return `<li class="posilek brak"><div class="slot">${esc(nazwaSlotu(o, slot.nr))}</div>
        <button type="button" class="btn drugi maly" data-akcja="dodaj" data-data="${data}" data-osoba-wpisu="${o}" data-slot="${slot.nr}">+ Dodaj danie</button></li>`;
    }
    return lista.map((w) => wierszPlanu(w)).join('');
  }).join('');
  const spoza = wpisy.filter((w) => w.typ === 'spoza' || !slotyOsoby(o).some((x) => x.nr === w.slot));
  return `<div class="osoba-planu">
    <div class="naglowek-osoby"><h4>${esc(imie(o))}</h4>
      <span class="licznik-kcal ${Math.abs(roznica) > cel * 0.1 ? 'ostrz' : ''}">${Math.round(s.kcal)} / ${cel} kcal</span></div>
    <ul class="posilki">${wiersze}${spoza.map((w) => wierszPosilku(w)).join('')}</ul>
    <div class="przyciski">
      <button type="button" class="btn drugi maly" data-akcja="spoza" data-data="${data}" data-osoba-wpisu="${o}">+ Spoza planu</button>
      ${wpisy.some((w) => w.typ === 'przepis') ? `<a class="btn drugi maly" href="#/kopiuj/${data}/${o}">Skopiuj dzień do: ${esc(imie(partner(o)))}</a>` : ''}
    </div>
  </div>`;
}

function wierszPlanu(w) {
  const p = przepis(w.przepisId);
  const m = makroWpisu(w);
  return `<li class="posilek${w.stan ? ` ${w.stan}` : ''}">
    <div class="slot">${esc(nazwaSlotu(w.osoba, w.slot))}${w.stan === 'zjedzony' ? ' · zjedzony' : w.stan === 'pominiety' ? ' · pominięty' : ''}</div>
    <a class="danie" href="#/przepis/${encodeURIComponent(w.przepisId)}/${encodeURIComponent(w.id)}">
      ${p?.zdjecie ? `<img src="${esc(p.zdjecie)}" alt="" loading="lazy" width="64" height="64">` : '<div class="bez-zdj"></div>'}
      <div><div class="nazwa">${esc(p?.nazwa || 'Nieznany przepis')}</div>
        <div class="meta">${esc(makroTekst(m))}${wariantWpisu(w)?.przeliczony ? ' · przeliczony' : ''} ${ktoZmienil(w)}</div></div></a>
    <div class="akcje">
      <span class="mnoznik" aria-label="Ile porcji gotujesz">
        <button type="button" data-akcja="porcje" data-krok="-0.5" data-wpis="${w.id}" aria-label="Mniej porcji">−</button>
        <output>× ${liczba(w.porcje || 1)}</output>
        <button type="button" data-akcja="porcje" data-krok="0.5" data-wpis="${w.id}" aria-label="Więcej porcji">+</button>
      </span>
      <button type="button" class="stan-btn" data-akcja="zamien" data-wpis="${w.id}">Zmień</button>
      <button type="button" class="stan-btn" data-akcja="usun" data-wpis="${w.id}">Usuń</button>
    </div>
  </li>`;
}

async function akcjaPlanu(e) {
  const b = e.target.closest('[data-akcja="porcje"]');
  if (b) {
    const w = S.wpisy.get(b.dataset.wpis);
    w.porcje = Math.min(20, Math.max(0.5, (w.porcje || 1) + Number(b.dataset.krok)));
    await zapiszWpis(w);
    widokPlanu(L.dzien);
    return;
  }
  const dz = e.target.closest('[data-dzien]');
  if (dz) { e.preventDefault(); idzDoDnia(dz.dataset.dzien); return; }
  const pr = e.target.closest('[data-przesun]');
  if (pr) { przesunDzien(Number(pr.dataset.przesun)); return; }
  await obsluzAkcje(e, () => widokPlanu(L.dzien));
}

// ---------------------------------------------------------------- Skopiuj dzień do partnera (SPEC 6)
export function widokKopii(data, zOsoby) {
  ustawTytul('Kopiuj dzień');
  const pg = podgladKopii(data, zOsoby);
  const doO = pg.doOsoby;
  const cel = celKcal(doO);
  const opis = (p) => {
    if (!p.zrodlo) return '<span class="uwaga">bez zmian – brak pasującego dania</span>';
    if (p.sposob.typ === 'bez-zmian') {
      return `<b>${esc(przepis(p.zrodlo.przepisId)?.nazwa)}</b><div class="meta">bez zmian – to danie już jest w planie</div>`;
    }
    const sposob = p.sposob.typ === 'respo' ? `gramatura z RESPO (${esc(imie(doO))})`
      : `przeliczone z wersji: ${esc(imie(zOsoby))} (× ${liczba(p.sposob.czynnik, 2)})`;
    return `<b>${esc(przepis(p.zrodlo.przepisId)?.nazwa)}</b>
      <div class="meta">${esc(makroTekst(makroWpisu(p.wynik)))} · ${sposob}</div>
      ${p.obecne.length ? `<div class="meta zastapi">zastąpi: ${p.obecne.map((o) => esc(przepis(o.przepisId)?.nazwa)).join(', ')}</div>` : ''}`;
  };
  const zmian = pg.pozycje.filter((p) => p.wynik).length;
  $('#widok').innerHTML = `
    <section class="karta">
      <h3>${esc(nazwaDnia(data))}</h3>
      <p>Plan dnia: <b>${esc(imie(zOsoby))}</b> → <b>${esc(imie(doO))}</b></p>
      <ul class="lista-kopii">
        ${pg.pozycje.map((p) => `<li><div class="slot">${esc(nazwaSlotu(doO, p.slot.nr))}</div>${opis(p)}</li>`).join('')}
      </ul>
      ${pg.nieskopiowane.length ? `<p class="uwaga">Nie skopiowano (${esc(imie(doO))} ma ${slotyOsoby(doO).length} posiłki):
        ${pg.nieskopiowane.map((w) => esc(przepis(w.przepisId)?.nazwa)).join(', ')}</p>` : ''}
      <div class="podsumowanie-kopii ${Math.abs(pg.sumaPo.kcal - cel) > cel * 0.1 ? 'ostrz' : ''}">
        Suma dnia po skopiowaniu: <b>${Math.round(pg.sumaPo.kcal)} kcal</b> (cel ${esc(imie(doO))}: ${cel} kcal)
      </div>
      <div class="przyciski">
        <button type="button" class="btn" id="zapisz-kopie"${zmian ? '' : ' disabled'}>${zmian ? `Zapisz (${zmian} ${odmiana(zmian, 'danie', 'dania', 'dań')})` : 'Nic do zmiany'}</button>
        <button type="button" class="btn drugi" id="anuluj">Anuluj</button>
      </div>
    </section>`;
  $('#zapisz-kopie').addEventListener('click', async () => {
    await wykonajKopie(pg);
    komunikat(`Skopiowano do: ${imie(doO)}`);
    wroc(`#/plan/${data}`);
  });
  $('#anuluj').addEventListener('click', () => wroc(`#/plan/${data}`));
}
