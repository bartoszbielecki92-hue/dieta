// Ekran Dzisiaj: pasek dni, liczniki kcal obu osób, posiłki z odhaczaniem, posiłki spoza planu.
import { $, esc, liczba, kcal, dzisISO, dodajDni, poniedzialek, nazwaDnia, dzienKrotko, dzienMiesiaca, zIso } from '../narzedzia.js';
import {
  S, osoby, imie, ja, ustaw, celKcal, slotyOsoby, nazwaSlotu, przepis, makroWpisu, suma, wpisyDnia, dniZWpisami,
  zapiszWpis, wariantWpisu,
} from '../stan.js';
import { ustawTytul, komunikat } from '../ui.js';
import { pamiec } from '../narzedzia.js';

const L = { data: null };

export function widokDnia(data) {
  L.data = data || L.data || dzisISO();
  ustawTytul(L.data === dzisISO() ? 'Dzisiaj' : nazwaDnia(L.data).split(',')[0]);
  const widok = S.widokDnia;
  const pokazane = widok === 'oboje' ? osoby().map((o) => o.id) : [widok];
  $('#widok').innerHTML = `
    ${kimJestes()}
    ${pasekDni(L.data, `#/dzisiaj/`)}
    <h2 class="data-dnia">${esc(nazwaDnia(L.data))}</h2>
    ${przelacznikOsob()}
    ${pokazane.map((o) => kartaOsoby(L.data, o)).join('')}`;
  $('#widok').onclick = (e) => obsluzAkcje(e, () => widokDnia(L.data));
}

// ---------------------------------------------------------------- elementy wspólne z ekranem Plan
export function kimJestes() {
  if (ja()) return '';
  return `<section class="karta wyroznienie"><h3>Kim jesteś na tym telefonie?</h3>
    <p class="uwaga">Dzięki temu przy każdej zmianie w planie będzie widać, kto ją zrobił.</p>
    <div class="przyciski">${osoby().map((o) => `<button type="button" class="btn" data-ja="${o.id}">${esc(o.imie)}</button>`).join('')}</div>
  </section>`;
}

export function przelacznikOsob() {
  const opcje = [{ id: 'oboje', etykieta: 'Oboje' }, ...osoby().map((o) => ({ id: o.id, etykieta: o.imie }))];
  return `<div class="segment" role="group" aria-label="Czyj plan pokazać">
    ${opcje.map((o) => `<button type="button" data-widok-dnia="${o.id}" aria-pressed="${S.widokDnia === o.id}">${esc(o.etykieta)}</button>`).join('')}
  </div>`;
}

export function pasekDni(data, prefiks) {
  const pn = poniedzialek(data);
  const dzis = dzisISO();
  const zWpisami = dniZWpisami();
  const dni = Array.from({ length: 7 }, (_, i) => dodajDni(pn, i));
  return `<nav class="tydzien" aria-label="Dni tygodnia">
    <a href="${prefiks}${dodajDni(pn, -7)}" class="strzalka" aria-label="Poprzedni tydzień">‹</a>
    ${dni.map((d) => `<a href="${prefiks}${d}" class="dzien${d === data ? ' wybrany' : ''}${d === dzis ? ' dzis' : ''}${zWpisami.has(d) ? '' : ' pusty'}"
        ${d === data ? 'aria-current="date"' : ''}><span>${dzienKrotko(d)}</span><b>${dzienMiesiaca(d)}</b></a>`).join('')}
    <a href="${prefiks}${dodajDni(pn, 7)}" class="strzalka" aria-label="Następny tydzień">›</a>
  </nav>`;
}

export function ktoZmienil(w) {
  if (!w.zrodlo || w.zrodlo === 'respo' || !w.zmienil) return '';
  const kiedy = w.zmieniono ? new Date(w.zmieniono).toLocaleString('pl-PL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  return `<span class="kto" title="Ostatnia zmiana: ${esc(imie(w.zmienil))} ${esc(kiedy)}">✎ ${esc(imie(w.zmienil))}</span>`;
}

export function makroTekst(m) {
  if (m.kcal == null) return 'brak kcal';
  return `${Math.round(m.kcal)} kcal${m.b != null ? ` · B ${liczba(m.b, 0)} · T ${liczba(m.t, 0)} · W ${liczba(m.w, 0)}` : ''}`;
}

// ---------------------------------------------------------------- karta osoby
function kartaOsoby(data, o) {
  const wpisy = wpisyDnia(data, o);
  const zjedzone = suma(wpisy.filter((w) => w.stan === 'zjedzony'));
  const plan = suma(wpisy.filter((w) => w.stan !== 'pominiety'));
  const cel = celKcal(o);
  const proc = Math.min(100, (100 * zjedzone.kcal) / cel);
  const naSloty = new Map(slotyOsoby(o).map((s) => [s.nr, []]));
  const inne = [];
  for (const w of wpisy) (w.typ === 'przepis' && naSloty.has(w.slot) ? naSloty.get(w.slot) : inne).push(w);

  const sloty = [...naSloty.entries()].map(([nr, lista]) => lista.length
    ? lista.map((w) => wierszPosilku(w)).join('')
    : `<li class="posilek brak"><div class="slot">${esc(nazwaSlotu(o, nr))}</div>
        <button type="button" class="btn drugi maly" data-akcja="dodaj" data-data="${data}" data-osoba-wpisu="${o}" data-slot="${nr}">+ Dodaj danie</button></li>`).join('');

  return `<section class="karta osoba-dnia">
    <div class="naglowek-osoby">
      <h3>${esc(imie(o))}</h3>
      <span class="licznik-kcal"><b>${Math.round(zjedzone.kcal)}</b> z ${cel} kcal</span>
    </div>
    <div class="pasek" role="progressbar" aria-valuemin="0" aria-valuemax="${cel}" aria-valuenow="${Math.round(zjedzone.kcal)}"
         aria-label="Zjedzone kcal: ${esc(imie(o))}"><div style="width:${proc}%"></div></div>
    <p class="uwaga makro-dnia">Zjedzone: B ${liczba(zjedzone.b, 0)} g · T ${liczba(zjedzone.t, 0)} g · W ${liczba(zjedzone.w, 0)} g
      <br>Plan dnia: ${Math.round(plan.kcal)} kcal · B ${liczba(plan.b, 0)} · T ${liczba(plan.t, 0)} · W ${liczba(plan.w, 0)}${plan.nieznane ? ` (+${plan.nieznane} bez kcal)` : ''}</p>
    <ul class="posilki">${sloty}
      ${inne.length ? `<li class="podtytul">Poza planem</li>${inne.map((w) => wierszPosilku(w)).join('')}` : ''}
    </ul>
    <button type="button" class="btn drugi" data-akcja="spoza" data-data="${data}" data-osoba-wpisu="${o}">+ Posiłek spoza planu</button>
  </section>`;
}

export function wierszPosilku(w, { plan = false } = {}) {
  const m = makroWpisu(w);
  const stan = w.stan ? ` ${w.stan}` : '';
  if (w.typ === 'spoza') {
    const produkt = w.produktId ? S.produkty.get(w.produktId) : null;
    return `<li class="posilek spoza${stan}">
      <div class="danie"><div class="ikona-spoza" aria-hidden="true">+</div><div>
        <div class="nazwa">${esc(w.nazwa || produkt?.nazwa || 'Posiłek')}</div>
        <div class="meta">${produkt ? `${liczba(w.gramy)} g · ` : ''}${esc(makroTekst(m))} ${ktoZmienil(w)}</div></div></div>
      <div class="akcje"><button type="button" class="maly-btn" data-akcja="usun" data-wpis="${w.id}">Usuń</button></div></li>`;
  }
  const p = przepis(w.przepisId);
  const war = wariantWpisu(w);
  return `<li class="posilek${stan}">
    <div class="slot">${esc(nazwaSlotu(w.osoba, w.slot))}${w.porcje && w.porcje !== 1 ? ` · <b>gotujesz × ${liczba(w.porcje)}</b>` : ''}</div>
    <a class="danie" href="#/przepis/${encodeURIComponent(w.przepisId)}/${encodeURIComponent(w.id)}">
      ${p?.zdjecie ? `<img src="${esc(p.zdjecie)}" alt="" loading="lazy" width="64" height="64">` : '<div class="bez-zdj"></div>'}
      <div><div class="nazwa">${esc(p?.nazwa || 'Nieznany przepis')}</div>
        <div class="meta">${esc(makroTekst(m))}${war?.przeliczony ? ' · przeliczony' : ''} ${ktoZmienil(w)}</div></div></a>
    ${w.notatka ? `<p class="notatka">${esc(w.notatka)}</p>` : ''}
    ${plan ? '' : `<div class="akcje">
      <button type="button" class="stan-btn zjedz" data-akcja="zjedzony" data-wpis="${w.id}" aria-pressed="${w.stan === 'zjedzony'}">✓ Zjedzony</button>
      <button type="button" class="stan-btn" data-akcja="pominiety" data-wpis="${w.id}" aria-pressed="${w.stan === 'pominiety'}">Pomiń</button>
      <button type="button" class="stan-btn" data-akcja="zamien" data-wpis="${w.id}">Zamień</button>
    </div>`}
  </li>`;
}

// ---------------------------------------------------------------- akcje (wspólne dla Dzisiaj i Plan)
export async function obsluzAkcje(e, odswiez) {
  const jaBtn = e.target.closest('[data-ja]');
  if (jaBtn) { await ustaw({ ja: jaBtn.dataset.ja }); S.osoba = jaBtn.dataset.ja; pamiec.zapisz('osoba', S.osoba); odswiez(); return true; }
  const wd = e.target.closest('[data-widok-dnia]');
  if (wd) { S.widokDnia = wd.dataset.widokDnia; pamiec.zapisz('widokDnia', S.widokDnia); odswiez(); return true; }
  const b = e.target.closest('[data-akcja]');
  if (!b) return false;
  const w = b.dataset.wpis ? S.wpisy.get(b.dataset.wpis) : null;
  switch (b.dataset.akcja) {
    case 'zjedzony':
    case 'pominiety':
      w.stan = w.stan === b.dataset.akcja ? null : b.dataset.akcja;
      await zapiszWpis(w);
      odswiez();
      break;
    case 'zamien':
      location.hash = `#/wybierz/${encodeURIComponent(w.id)}`;
      break;
    case 'dodaj':
      location.hash = `#/wybierz/nowy/${b.dataset.data}/${b.dataset.osobaWpisu}/${b.dataset.slot}`;
      break;
    case 'spoza':
      location.hash = `#/spoza/${b.dataset.data}/${b.dataset.osobaWpisu}`;
      break;
    case 'usun':
      w.usuniety = true;
      await zapiszWpis(w);
      komunikat('Usunięto z planu');
      odswiez();
      break;
    default:
      return false;
  }
  return true;
}

export { zIso };
