// Wybór dania do planu (Zamień / Dodaj) oraz formularz posiłku spoza planu.
import { $, $$, esc, liczba, norm } from '../narzedzia.js';
import { S, imie, nazwaSlotu, rodzajSlotu, przepis, makroWpisu, zapiszWpis, sredniaSlotu, szukajProduktow } from '../stan.js';
import { ustawTytul, komunikat, wroc } from '../ui.js';
import { RODZAJE, wierszPrzepisu, dopasowanie, slowaZapytania } from './przepisy.js';

const NA_STRONE = 40;
const SORT = {};                    // zapamiętane sortowanie (do zamknięcia aplikacji)

/** #/wybierz/<wpisId>  albo  #/wybierz/nowy/<data>/<osoba>/<slot> */
export function widokWyboru(czesci) {
  let wpis, data, o, slot;
  if (czesci[0] === 'nowy') {
    [, data, o, slot] = czesci;
    slot = Number(slot);
  } else {
    wpis = S.wpisy.get(czesci[0]);
    if (!wpis) { $('#widok').innerHTML = '<p class="pusto">Nie znalazłem tego posiłku.</p>'; return; }
    ({ data, osoba: o, slot } = wpis);
  }
  ustawTytul(wpis ? 'Zamień danie' : 'Dodaj danie');
  const obecne = wpis ? przepis(wpis.przepisId) : null;
  const cel = wpis ? (makroWpisu(wpis).kcal ?? sredniaSlotu(o, slot)) : sredniaSlotu(o, slot);
  const stan = { q: '', rodzaj: rodzajSlotu(o, slot) || '', pokazane: NA_STRONE, sort: SORT.wybor || 'kcal' };

  $('#widok').innerHTML = `
    <p class="uwaga">${esc(imie(o))} · ${esc(data)} · ${esc(nazwaSlotu(o, slot))}${obecne ? `<br>Teraz: <b>${esc(obecne.nazwa)}</b>` : ''}
      </p>
    <div class="szukaj">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
      <input id="q" type="search" placeholder="Szukaj po nazwie lub składniku" autocomplete="off" aria-label="Szukaj dania">
    </div>
    <div class="chipy" role="group" aria-label="Rodzaj posiłku">
      ${['', ...RODZAJE].map((r) => `<button type="button" class="chip" data-rodzaj="${r}" aria-pressed="${stan.rodzaj === r}">${r ? r[0].toUpperCase() + r.slice(1) : 'Wszystkie'}</button>`).join('')}
    </div>
    <div class="licznik"><span id="ile"></span>
      <label class="sortuj">Sortuj <select id="sort" aria-label="Sortowanie">
        <option value="kcal">najbliżej ${Math.round(cel)} kcal</option>
        <option value="czas">najszybsze</option>
        <option value="nazwa">po nazwie</option>
      </select></label></div>
    <ul class="lista" id="lista"></ul>`;

  const rysuj = () => {
    const slowa = slowaZapytania(stan.q);
    const wynik = [];
    for (const p of S.przepisy.values()) {
      const w = p.warianty[o];
      if (!w || p.pomocniczy || (obecne && p === obecne)) continue;      // bez dania, które właśnie zamieniamy
      if (stan.rodzaj && !p.rodzaje.includes(stan.rodzaj)) continue;
      const traf = dopasowanie(p, slowa);
      if (traf === null) continue;
      wynik.push({ p, traf, d: Math.abs(w.naPorcje.kcal - cel) });
    }
    const czas = (p) => p._czas || Infinity;           // bez podanego czasu – na koniec
    const porownaj = {
      kcal: (a, b) => a.d - b.d,
      czas: (a, b) => czas(a.p) - czas(b.p) || a.d - b.d,
      nazwa: (a, b) => a.p.nazwa.localeCompare(b.p.nazwa, 'pl'),
    }[stan.sort];
    wynik.sort(porownaj);
    $('#ile').textContent = `${wynik.length} dań z wersją dla: ${imie(o)}`;
    $('#lista').innerHTML = wynik.slice(0, stan.pokazane).map(({ p, traf }) => {
      const roznica = Math.round(p.warianty[o].naPorcje.kcal - cel);
      return wierszPrzepisu(p, { osoba: o, trafienie: traf, href: `#/wybierz-ok/${encodeURIComponent(p.id)}`,
        dodatek: `<span>${roznica >= 0 ? '+' : ''}${roznica} kcal</span>` });
    }).join('') + (wynik.length > stan.pokazane ? '<li><button type="button" class="btn drugi" id="wiecej">Pokaż więcej</button></li>' : '');
  };
  $('#sort').value = stan.sort;
  rysuj();

  $('#sort').addEventListener('change', (e) => { stan.sort = SORT.wybor = e.target.value; stan.pokazane = NA_STRONE; rysuj(); });
  $('#q').addEventListener('input', (e) => { stan.q = e.target.value; stan.pokazane = NA_STRONE; rysuj(); });
  $('.chipy').addEventListener('click', (e) => {
    const c = e.target.closest('[data-rodzaj]');
    if (!c) return;
    stan.rodzaj = c.dataset.rodzaj;
    $$('[data-rodzaj]').forEach((x) => x.setAttribute('aria-pressed', x === c));
    rysuj();
  });
  $('#lista').addEventListener('click', async (e) => {
    if (e.target.id === 'wiecej') { stan.pokazane += NA_STRONE; rysuj(); return; }
    const a = e.target.closest('a.wiersz');
    if (!a) return;
    e.preventDefault();
    const id = decodeURIComponent(a.getAttribute('href').split('/').pop());
    if (wpis) {
      Object.assign(wpis, { przepisId: Number(id) || id, stan: null });
      delete wpis.wariant;                              // nowy przepis = wersja osoby z RESPO
      await zapiszWpis(wpis);
    } else {
      await zapiszWpis({ data, osoba: o, slot, typ: 'przepis', przepisId: Number(id) || id, porcje: 1, stan: null, usuniety: false });
    }
    komunikat(`Zapisano: ${przepis(id)?.nazwa}`);
    wroc();
  });
}

// ---------------------------------------------------------------- posiłek spoza planu (SPEC 5)
export function widokSpoza(data, o) {
  ustawTytul('Posiłek spoza planu');
  const stan = { tryb: 'szybko', produkt: null };
  $('#widok').innerHTML = `
    <p class="uwaga">${esc(imie(o))} · ${esc(data)}</p>
    <div class="segment" role="group" aria-label="Sposób dodania">
      <button type="button" data-tryb="szybko" aria-pressed="true">Szybko</button>
      <button type="button" data-tryb="dokladnie" aria-pressed="false">Dokładnie</button>
    </div>
    <form id="formularz" class="karta formularz" autocomplete="off">
      <div data-pole="szybko">
        <label>Nazwa<input id="nazwa" type="text" placeholder="np. baton z automatu" maxlength="80"></label>
        <label>kcal (z opakowania, można pominąć)<input id="kcal" type="number" inputmode="numeric" min="0" max="5000" step="1"></label>
      </div>
      <div data-pole="dokladnie" hidden>
        <label>Produkt z bazy<input id="szukaj-produkt" type="search" placeholder="np. banan, skyr, orzechy"></label>
        <ul class="podpowiedzi" id="podpowiedzi"></ul>
        <p id="wybrany" class="uwaga"></p>
        <label>Gramy<input id="gramy" type="number" inputmode="decimal" min="1" max="5000" step="1"></label>
        <p id="wyliczone" class="wyliczone"></p>
      </div>
      <p id="blad" class="blad" hidden></p>
      <div class="przyciski">
        <button type="submit" class="btn">Zapisz jako zjedzony</button>
        <button type="button" class="btn drugi" id="anuluj">Anuluj</button>
      </div>
    </form>`;

  const przelicz = () => {
    const g = Number($('#gramy').value);
    const n = stan.produkt?.na100g;
    $('#wyliczone').textContent = n && g ? `${Math.round((n.kcal * g) / 100)} kcal · B ${liczba((n.b * g) / 100, 0)} · T ${liczba((n.t * g) / 100, 0)} · W ${liczba((n.w * g) / 100, 0)}` : '';
  };
  $('.segment').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tryb]');
    if (!b) return;
    stan.tryb = b.dataset.tryb;
    $$('[data-tryb]').forEach((x) => x.setAttribute('aria-pressed', x === b));
    $$('[data-pole]').forEach((x) => { x.hidden = x.dataset.pole !== stan.tryb; });
  });
  $('#szukaj-produkt').addEventListener('input', (e) => {
    const lista = szukajProduktow(e.target.value);
    $('#podpowiedzi').innerHTML = lista.map((p) => `<li><button type="button" data-produkt="${p.id}">${esc(p.nazwa)} <span class="uwaga">${p.na100g.kcal} kcal/100 g</span></button></li>`).join('');
  });
  $('#podpowiedzi').addEventListener('click', (e) => {
    const b = e.target.closest('[data-produkt]');
    if (!b) return;
    stan.produkt = S.produkty.get(Number(b.dataset.produkt)) || S.produkty.get(b.dataset.produkt);
    $('#wybrany').textContent = `Wybrano: ${stan.produkt.nazwa}`;
    $('#podpowiedzi').innerHTML = '';
    $('#szukaj-produkt').value = stan.produkt.nazwa;
    const miara = stan.produkt.miary?.[0];
    if (miara && !$('#gramy').value) $('#gramy').value = miara.gramy;
    przelicz();
    $('#gramy').focus();
  });
  $('#gramy').addEventListener('input', przelicz);
  $('#anuluj').addEventListener('click', () => wroc());
  $('#formularz').addEventListener('submit', async (e) => {
    e.preventDefault();
    const blad = (t) => { $('#blad').textContent = t; $('#blad').hidden = false; };
    const wpis = { data, osoba: o, slot: 0, typ: 'spoza', stan: 'zjedzony', usuniety: false };
    if (stan.tryb === 'szybko') {
      const nazwa = $('#nazwa').value.trim();
      if (!nazwa) return blad('Wpisz nazwę posiłku.');
      const k = $('#kcal').value;
      Object.assign(wpis, { nazwa, kcal: k === '' ? null : Math.round(Number(k)) });
    } else {
      const g = Number($('#gramy').value);
      if (!stan.produkt) return blad('Wybierz produkt z listy.');
      if (!g || g <= 0) return blad('Wpisz gramy.');
      Object.assign(wpis, { produktId: stan.produkt.id, gramy: g, nazwa: stan.produkt.nazwa });
    }
    await zapiszWpis(wpis);
    komunikat('Dodano posiłek');
    wroc();
  });
  $('#nazwa').focus();
}
