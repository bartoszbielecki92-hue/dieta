// Zakładka Przepisy: lista z wyszukiwarką i filtrami oraz ekran pojedynczego przepisu.
import { $, $$, esc, pogrubienia, norm, liczba, gramy, odmiana } from '../narzedzia.js';
import { S, osoby, imie, przepis as pobierzPrzepis, wariantWpisu, zapiszWpis, nazwaSlotu } from '../stan.js';
import { ustawTytul } from '../ui.js';

export const RODZAJE = ['śniadanie', 'obiad', 'kolacja', 'przekąska'];
const NA_STRONE = 40;

const L = {
  filtry: { q: '', rodzaj: '', kcalOd: '', kcalDo: '', czas: '', kolekcja: '', zrodlo: '', sort: 'nazwa' },
  pokazane: NA_STRONE,
  przewin: null,                 // pozycja listy do przywrócenia po powrocie z przepisu
  porcje: {},                    // rid -> { [osoba]: n, razem: { [osoba]: n } }
  tryb: {},                      // rid -> 'bartosz' | 'katarzyna' | 'razem'
};

const wariant = (p, o = S.osoba) => p.warianty[o];

/** Dopasowanie do wyszukiwania: null = nie pasuje, '' = pasuje nazwą, 'x' = pasuje składnikiem x. */
export function dopasowanie(p, slowa) {
  if (!slowa.length) return '';
  if (slowa.every((s) => p._szukajNazwa.includes(s))) return '';
  if (!slowa.every((s) => p._szukajNazwa.includes(s) || p._szukajSkl.some((x) => x.includes(s)))) return null;
  const i = p._szukajSkl.findIndex((x) => slowa.some((s) => !p._szukajNazwa.includes(s) && x.includes(s)));
  return p._skladniki[i] || '';
}
export const slowaZapytania = (q) => norm(q).split(/\s+/).filter(Boolean);

// ------------------------------------------------------------------ lista
function filtruj() {
  const f = L.filtry;
  const slowa = slowaZapytania(f.q);
  const kOd = f.kcalOd === '' ? null : Number(f.kcalOd);
  const kDo = f.kcalDo === '' ? null : Number(f.kcalDo);
  const wynik = [];
  for (const p of S.przepisy.values()) {
    if (p.pomocniczy && !slowa.length) continue;            // "Ciasto do naleśników" itp. tylko w wyszukiwaniu
    if (f.rodzaj && !p.rodzaje.includes(f.rodzaj)) continue;
    if (f.kolekcja && !(p.tagi || []).includes(f.kolekcja)) continue;
    if (f.zrodlo && p.zrodlo !== f.zrodlo) continue;
    if (f.czas && p._czas > Number(f.czas)) continue;
    if (kOd != null || kDo != null) {
      const k = wariant(p)?.naPorcje.kcal;
      if (k == null || (kOd != null && k < kOd) || (kDo != null && k > kDo)) continue;
    }
    const trafienie = dopasowanie(p, slowa);
    if (trafienie === null) continue;
    wynik.push({ p, trafienie });
  }
  const kc = (x) => wariant(x.p)?.naPorcje.kcal ?? Infinity;
  const porownaj = {
    nazwa: (a, b) => a.p.nazwa.localeCompare(b.p.nazwa, 'pl'),
    kcal: (a, b) => kc(a) - kc(b),
    czas: (a, b) => a.p._czas - b.p._czas || a.p.nazwa.localeCompare(b.p.nazwa, 'pl'),
  }[f.sort];
  wynik.sort((a, b) => (a.trafienie ? 1 : 0) - (b.trafienie ? 1 : 0) || porownaj(a, b));
  return wynik;
}

function ileDodatkowych() {
  const f = L.filtry;
  return [f.kcalOd, f.kcalDo, f.czas, f.kolekcja, f.zrodlo].filter((x) => x !== '').length + (f.sort !== 'nazwa' ? 1 : 0);
}

export function widokListy() {
  ustawTytul('Przepisy');
  const f = L.filtry;
  const opcja = (v, t, akt) => `<option value="${esc(v)}"${v === akt ? ' selected' : ''}>${esc(t)}</option>`;
  $('#widok').innerHTML = `
    <div class="wiersz-szukaj">
      <div class="szukaj">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
        <input id="q" type="search" placeholder="Szukaj po nazwie lub składniku" value="${esc(f.q)}"
               autocomplete="off" enterkeyhint="search" aria-label="Szukaj przepisu">
      </div>
      <a class="btn maly" href="#/nowy-przepis" aria-label="Dodaj własny przepis">+ Własny</a>
    </div>
    <div class="chipy" role="group" aria-label="Rodzaj posiłku">
      ${['', ...RODZAJE].map((r) => `<button type="button" class="chip" data-rodzaj="${r}" aria-pressed="${f.rodzaj === r}">${r ? r[0].toUpperCase() + r.slice(1) : 'Wszystkie'}</button>`).join('')}
    </div>
    <details class="filtry-wiecej"${ileDodatkowych() ? ' open' : ''}>
      <summary></summary>
      <div class="filtry-siatka">
        <label>kcal od (${esc(imie(S.osoba))})<input id="kcalOd" type="number" inputmode="numeric" min="0" step="50" value="${esc(f.kcalOd)}" placeholder="np. 300"></label>
        <label>kcal do<input id="kcalDo" type="number" inputmode="numeric" min="0" step="50" value="${esc(f.kcalDo)}" placeholder="np. 600"></label>
        <label>Czas przygotowania<select id="czas">
          ${opcja('', 'dowolny', f.czas)}${opcja('10', 'do 10 min', f.czas)}${opcja('15', 'do 15 min', f.czas)}${opcja('30', 'do 30 min', f.czas)}${opcja('45', 'do 45 min', f.czas)}
        </select></label>
        <label>Kolekcja<select id="kolekcja">
          ${opcja('', 'wszystkie', f.kolekcja)}${S.kolekcje.map((k) => opcja(k, k, f.kolekcja)).join('')}
        </select></label>
        <label>Źródło<select id="zrodlo">
          ${opcja('', 'wszystkie', f.zrodlo)}${opcja('respo', 'RESPO', f.zrodlo)}${opcja('wlasne', 'własne', f.zrodlo)}
        </select></label>
        <label>Sortuj<select id="sort">
          ${opcja('nazwa', 'po nazwie', f.sort)}${opcja('kcal', 'po kcal (rosnąco)', f.sort)}${opcja('czas', 'po czasie', f.sort)}
        </select></label>
      </div>
    </details>
    <div class="licznik"><span id="ile"></span><button type="button" class="link-btn" id="wyczysc" hidden>Wyczyść filtry</button></div>
    <ul class="lista" id="lista"></ul>`;

  $('#q').addEventListener('input', (e) => { f.q = e.target.value; odswiezListe(true); });
  for (const id of ['kcalOd', 'kcalDo', 'czas', 'kolekcja', 'zrodlo', 'sort']) {
    $(`#${id}`).addEventListener('input', (e) => { f[id] = e.target.value; odswiezListe(true); });
  }
  $('.chipy').addEventListener('click', (e) => {
    const c = e.target.closest('[data-rodzaj]');
    if (!c) return;
    f.rodzaj = c.dataset.rodzaj;
    $$('[data-rodzaj]').forEach((x) => x.setAttribute('aria-pressed', x === c));
    odswiezListe(true);
  });
  $('#wyczysc').addEventListener('click', () => {
    Object.assign(L.filtry, { q: '', rodzaj: '', kcalOd: '', kcalDo: '', czas: '', kolekcja: '', zrodlo: '', sort: 'nazwa' });
    widokListy();
  });
  $('#lista').addEventListener('click', (e) => {
    if (e.target.closest('a.wiersz')) L.przewin = { y: window.scrollY, pokazane: L.pokazane };
  });

  const powrot = L.przewin;
  L.przewin = null;
  if (powrot) L.pokazane = powrot.pokazane;
  odswiezListe(!powrot);
  if (powrot) requestAnimationFrame(() => window.scrollTo(0, powrot.y));
}

let obserwator;
function odswiezListe(odNowa) {
  if (odNowa) L.pokazane = NA_STRONE;
  const wynik = filtruj();
  const f = L.filtry;
  const n = ileDodatkowych();
  $('.filtry-wiecej summary').textContent = `Więcej filtrów i sortowanie${n ? ` (${n})` : ''}`;
  $('#ile').textContent = `${wynik.length} ${odmiana(wynik.length, 'przepis', 'przepisy', 'przepisów')}` +
    (f.rodzaj === 'śniadanie' || f.rodzaj === 'kolacja' ? ' · RESPO ma wspólną pulę śniadań i kolacji' : '');
  $('#wyczysc').hidden = !(f.q || f.rodzaj || n);
  const lista = $('#lista');
  if (!wynik.length) {
    lista.innerHTML = '<li class="pusto">Nic nie pasuje. Zmień wyszukiwanie albo filtry.</li>';
    return;
  }
  lista.innerHTML = wynik.slice(0, L.pokazane).map((x) => wierszPrzepisu(x.p, { trafienie: x.trafienie })).join('') +
    (wynik.length > L.pokazane ? '<li id="wiecej" class="pusto">Ładuję kolejne…</li>' : '');
  obserwator?.disconnect();
  const w = $('#wiecej');
  if (w) {
    obserwator = new IntersectionObserver((e) => {
      if (e[0].isIntersecting) { L.pokazane += NA_STRONE; odswiezListe(false); }
    }, { rootMargin: '600px' });
    obserwator.observe(w);
  }
}

/** Wiersz przepisu (używany też przy wyborze dania). */
export function wierszPrzepisu(p, { trafienie = '', osoba: o = S.osoba, href, dodatek = '' } = {}) {
  const w = p.warianty[o];
  const inna = !w && Object.entries(p.warianty)[0];
  const kc = w ? `<span class="kcal">${w.naPorcje.kcal} kcal</span>`
    : `<span>${esc(imie(o))}: brak wersji${inna ? ` · ${esc(imie(inna[0]))}: ${inna[1].naPorcje.kcal} kcal` : ''}</span>`;
  const porcje = w && w.porcje > 1 ? `<span>${w.porcje} porcje</span>` : '';
  const czas = p._czas ? `<span>${p._czas} min</span>` : '';
  return `<li><a class="wiersz" href="${href ?? `#/przepis/${encodeURIComponent(p.id)}`}">
    ${p.zdjecie ? `<img src="${esc(p.zdjecie)}" alt="" loading="lazy" decoding="async" width="76" height="76">` : '<div class="bez-zdj"></div>'}
    <div class="tresc">
      <div class="nazwa">${esc(p.nazwa)}</div>
      <div class="meta">${kc}${czas}${porcje}${dodatek}</div>
      ${trafienie ? `<div class="meta">zawiera: ${esc(trafienie)}</div>` : ''}
      ${p.zrodlo === 'wlasne' ? '<span class="tag">własny</span>' : ''}${p.pomocniczy ? '<span class="tag pom">składnik innych przepisów</span>' : ''}${(p.tagi || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}
    </div></a></li>`;
}

// ------------------------------------------------------------------ przepis
export function widokPrzepisu(id, wpisId) {
  const p = pobierzPrzepis(id);
  const wpis = wpisId ? S.wpisy.get(wpisId) : null;
  if (!p) {
    ustawTytul('Przepis');
    $('#widok').innerHTML = '<p class="pusto">Nie znalazłem tego przepisu.</p>';
    return;
  }
  ustawTytul(p.nazwa);

  // warianty do pokazania: z wpisu planu (może być przeliczony) albo z RESPO
  const warianty = { ...p.warianty };
  if (wpis && wariantWpisu(wpis)) warianty[wpis.osoba] = wariantWpisu(wpis);
  const ktore = osoby().map((o) => o.id).filter((o) => warianty[o]);

  let tryb = wpis ? wpis.osoba : L.tryb[p.id];
  if (!tryb || (tryb !== 'razem' && !warianty[tryb]) || (tryb === 'razem' && ktore.length < 2)) {
    tryb = warianty[S.osoba] ? S.osoba : ktore[0];
  }
  L.porcje[p.id] ??= { razem: {} };
  const por = wpis ? { [wpis.osoba]: wpis.porcje || 1, razem: {} } : L.porcje[p.id];
  for (const o of ktore) { por[o] ??= warianty[o].porcje; por.razem[o] ??= 1; }

  const brakujaca = osoby().find((o) => !warianty[o.id]);
  const edycjaWlasnego = p.zrodlo === 'wlasne' ? `<a class="btn drugi" href="#/nowy-przepis/${encodeURIComponent(p.id)}">Edytuj przepis</a>` : '';
  $('#widok').innerHTML = `
    <article class="przepis">
      ${p.zdjecie ? `<div class="hero"><img src="${esc(p.zdjecie)}" alt="${esc(p.nazwa)}"></div>` : ''}
      <h2>${esc(p.nazwa)}</h2>
      <div class="info">
        ${p.czasPrzygotowania ? `<span>Przygotowanie: ${p.czasPrzygotowania} min</span>` : ''}
        ${p.czasGotowania ? `<span>Gotowanie: ${p.czasGotowania} min</span>` : ''}
        ${p.rodzaje.length ? `<span>${esc(p.rodzaje.join(', '))}</span>` : ''}
      </div>
      <div>${p.zrodlo === 'wlasne' ? '<span class="tag">własny</span>' : ''}${p.pomocniczy ? '<span class="tag pom">składnik innych przepisów</span>' : ''}${(p.tagi || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
      ${wpis ? `<p class="uwaga" style="margin-top:8px">Z planu: ${esc(imie(wpis.osoba))}, ${esc(wpis.data)}, ${esc(nazwaSlotu(wpis.osoba, wpis.slot))}</p>` : ''}
      ${edycjaWlasnego}

      <section class="karta">
        ${wpis ? '' : `<div class="segment" role="group" aria-label="Czyja wersja przepisu">
          ${osoby().map((o) => `<button type="button" data-tryb="${o.id}" aria-pressed="${tryb === o.id}"${warianty[o.id] ? '' : ' disabled'}>${esc(o.imie)}</button>`).join('')}
          <button type="button" data-tryb="razem" aria-pressed="${tryb === 'razem'}"${ktore.length < 2 ? ' disabled' : ''}>Razem</button>
        </div>`}
        ${!wpis && brakujaca ? `<p class="uwaga">${esc(brakujaca.imie)}: RESPO nie ma tej wersji przepisu. Przy kopiowaniu dnia do partnera aplikacja przeliczy gramatury.</p>` : ''}
        ${warianty[tryb]?.przeliczony ? `<p class="uwaga">Gramatury przeliczone z wersji: ${esc(imie(warianty[tryb].przeliczony.z))} (× ${liczba(warianty[tryb].przeliczony.czynnik, 2)}).</p>` : ''}
        <div id="makro"></div>
      </section>

      <section class="karta">
        <h3>Składniki</h3>
        <div id="porcje"></div>
        <ul class="skladniki" id="skladniki"></ul>
      </section>

      ${p.kroki.length ? `<section class="karta"><h3>Przygotowanie</h3><ol class="kroki">${p.kroki.map((k) => `<li>${pogrubienia(k)}</li>`).join('')}</ol></section>` : ''}
      ${p.wskazowki?.length ? `<section class="karta"><h3>Wskazówki</h3><ul class="wskazowki">${p.wskazowki.map((k) => `<li>${pogrubienia(k)}</li>`).join('')}</ul></section>` : ''}
      ${p.przechowywanie ? `<section class="karta"><h3>Przechowywanie</h3><p>${pogrubienia(p.przechowywanie)}</p></section>` : ''}
      <p class="uwaga" style="margin-top:14px">Źródło: ${p.zrodlo === 'wlasne' ? 'własny przepis' : 'RESPO'}${ktore.map((o) => warianty[o].planOd ? ` · ${esc(imie(o))}: plan od ${esc(warianty[o].planOd)}` : '').join('')}</p>
    </article>`;

  const rysuj = () => {
    $('#makro').innerHTML = makroHtml(warianty, tryb, ktore);
    $('#porcje').innerHTML = porcjeHtml(warianty, tryb, ktore, por, Boolean(wpis));
    $('#skladniki').innerHTML = skladnikiHtml(warianty, tryb, ktore, por);
  };
  rysuj();

  $('.segment')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tryb]');
    if (!b || b.disabled) return;
    tryb = L.tryb[p.id] = b.dataset.tryb;
    $$('[data-tryb]').forEach((x) => x.setAttribute('aria-pressed', x === b));
    rysuj();
  });
  $('#porcje').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-krok]');
    if (!b) return;
    const o = b.dataset.dla;
    const cel = tryb === 'razem' ? por.razem : por;
    cel[o] = Math.min(20, Math.max(0.5, cel[o] + Number(b.dataset.krok)));
    if (wpis) { wpis.porcje = cel[o]; await zapiszWpis(wpis); }
    rysuj();
  });
}

function makroHtml(warianty, tryb, ktore) {
  const kafle = (n) => `<div class="makro">
      <div class="k"><b>${n.kcal}</b><span>kcal</span></div>
      <div class="b"><b>${liczba(n.b)} g</b><span>białko</span></div>
      <div class="t"><b>${liczba(n.t)} g</b><span>tłuszcze</span></div>
      <div class="w"><b>${liczba(n.w)} g</b><span>węglowodany</span></div></div>`;
  if (tryb !== 'razem') return `<p class="uwaga">Na 1 porcję – ${esc(imie(tryb))}</p>${kafle(warianty[tryb].naPorcje)}`;
  return ktore.map((o) => `<p class="uwaga" style="margin-top:8px">Na 1 porcję – ${esc(imie(o))}</p>${kafle(warianty[o].naPorcje)}`).join('');
}

function steruj(o, n, etykieta) {
  return `<div class="porcje"><span>${etykieta}</span><div class="steruj">
    <button type="button" data-dla="${o}" data-krok="-0.5" aria-label="Mniej porcji">−</button>
    <output aria-live="polite">${liczba(n)}</output>
    <button type="button" data-dla="${o}" data-krok="0.5" aria-label="Więcej porcji">+</button></div></div>`;
}

function porcjeHtml(warianty, tryb, ktore, por, zPlanu) {
  if (tryb !== 'razem') {
    const w = warianty[tryb];
    return steruj(tryb, por[tryb], zPlanu ? `Ile porcji gotujesz (${esc(imie(tryb))})` : `Ile porcji (${esc(imie(tryb))})`) +
      (zPlanu ? '<p class="uwaga">Zmiana porcji zapisuje się w planie i na liście zakupów. Licznik kcal liczy tylko 1 porcję.</p>'
        : w.porcje > 1 ? `<p class="uwaga">Przepis jest na ${w.porcje} porcje. Kalorie powyżej są na 1 porcję.</p>` : '');
  }
  return ktore.map((o) => steruj(o, por.razem[o], `Porcje: ${esc(imie(o))}`)).join('') +
    '<p class="uwaga">Składniki zsumowane dla obojga – każda porcja w gramaturze danej osoby.</p>';
}

export function miaraTekst(s, mnoznik = 1) {
  if (!s.miaraId || !s.ilosc) return '';
  const n = S.baza.miary[s.miaraId];
  return n ? `${liczba(s.ilosc * mnoznik)} × ${n}` : '';
}

function zamiennikiHtml(zam, m) {
  if (!zam?.length) return '';
  return `<details class="zam"><summary>Zamienniki (${zam.length})</summary><ul>
    ${zam.map((z) => `<li>${esc(z.nazwa)} – ${gramy(z.gramy * m)}${miaraTekst(z, m) ? ` (${esc(miaraTekst(z, m))})` : ''}</li>`).join('')}</ul></details>`;
}

function linkBazowy(s) {
  return s.przepisBazowy && S.przepisy.has(String(s.przepisBazowy))
    ? ` <a href="#/przepis/${encodeURIComponent(s.przepisBazowy)}">(przepis)</a>` : '';
}

function skladnikiHtml(warianty, tryb, ktore, por) {
  if (tryb !== 'razem') {
    const w = warianty[tryb];
    const n = por[tryb];
    const m = n / w.porcje;                                   // gramy w danych są na cały przepis
    return w.skladniki.map((s) => {
      if (s.grupa) return `<li class="grupa">${esc(s.grupa)}</li>`;
      const naPorcje = s.gramy / w.porcje;
      const rozpis = n !== 1 && s.gramy ? ` <span class="miara">(${liczba(n)} × ${gramy(naPorcje)})</span>` : '';
      const miara = miaraTekst(s, m);
      return `<li><span>${esc(s.nazwa)}${linkBazowy(s)}</span><span class="ile">${s.gramy ? gramy(s.gramy * m) : 'do smaku'}</span>
        ${miara ? `<span class="miara">${esc(miara)}</span>` : ''}${rozpis}
        ${zamiennikiHtml(s.zamienniki, m)}</li>`;
    }).join('');
  }
  const wiersze = new Map();
  for (const o of ktore) {
    const w = warianty[o];
    const m = por.razem[o] / w.porcje;
    for (const s of w.skladniki) {
      const klucz = s.grupa ? `g:${s.grupa}` : s.produktId ?? `n:${s.nazwa}`;
      if (!wiersze.has(klucz)) wiersze.set(klucz, { s, czesci: {} });
      if (!s.grupa) wiersze.get(klucz).czesci[o] = s.gramy * m;
    }
  }
  return [...wiersze.values()].map(({ s, czesci }) => {
    if (s.grupa) return `<li class="grupa">${esc(s.grupa)}</li>`;
    const sum = Object.values(czesci).reduce((a, b) => a + b, 0);
    const rozpis = ktore.map((o) => `${esc(imie(o))}: ${czesci[o] != null ? gramy(czesci[o]) : '—'}`).join(' · ');
    return `<li><span>${esc(s.nazwa)}${linkBazowy(s)}</span><span class="ile">${sum ? gramy(sum) : 'do smaku'}</span>
      <span class="osoby-g">${rozpis}</span></li>`;
  }).join('');
}
