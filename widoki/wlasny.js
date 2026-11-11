// Własne przepisy (SPEC 4): formularz z produktami z bazy, kcal liczone same, nowy produkt z etykiety.
import { $, $$, esc, liczba, norm, uuid } from '../narzedzia.js';
import { S, osoby, imie, ja, przepis, dodajDoIndeksu, policzNaPorcje, kolejnoscKategorii, nazwaKategorii, szukajProduktow } from '../stan.js';
import { zapisz } from '../db.js';
import { ustawTytul, komunikat, wroc } from '../ui.js';
import { RODZAJE } from './przepisy.js';

export function widokWlasnego(id) {
  const istniejacy = id ? przepis(id) : null;
  if (id && (!istniejacy || istniejacy.zrodlo !== 'wlasne')) { $('#widok').innerHTML = '<p class="pusto">Można edytować tylko własne przepisy.</p>'; return; }
  ustawTytul(istniejacy ? 'Edytuj przepis' : 'Nowy przepis');
  const autor = ja() || osoby()[0].id;
  const bazowy = istniejacy ? (istniejacy.warianty[autor] || Object.values(istniejacy.warianty)[0]) : null;
  const st = {
    skladniki: bazowy ? bazowy.skladniki.filter((s) => !s.grupa).map((s) => ({ produktId: s.produktId, nazwa: s.nazwa, gramy: s.gramy })) : [],
    zdjecie: istniejacy?.zdjecie || null,
    produkt: null,
  };
  const obie = !istniejacy || Object.keys(istniejacy.warianty).length > 1;

  $('#widok').innerHTML = `
    <form id="przepis" class="formularz" autocomplete="off" novalidate>
      <section class="karta">
        <label>Nazwa<input name="nazwa" required maxlength="100" value="${esc(istniejacy?.nazwa || '')}" placeholder="np. Owsianka mamy"></label>
        <fieldset class="rodzaje"><legend>Rodzaj posiłku</legend>
          ${RODZAJE.map((r) => `<label class="check"><input type="checkbox" name="rodzaj" value="${r}"${istniejacy?.rodzaje.includes(r) ? ' checked' : ''}> ${r}</label>`).join('')}
        </fieldset>
        <div class="siatka-3">
          <label>Porcje<input name="porcje" type="number" inputmode="numeric" min="1" max="20" step="1" value="${bazowy?.porcje || 1}"></label>
          <label>Przygotowanie (min)<input name="czasPrzygotowania" type="number" inputmode="numeric" min="0" max="600" value="${istniejacy?.czasPrzygotowania || ''}"></label>
          <label>Gotowanie (min)<input name="czasGotowania" type="number" inputmode="numeric" min="0" max="600" value="${istniejacy?.czasGotowania || ''}"></label>
        </div>
        <label>Zdjęcie (opcjonalnie)<input name="zdjecie" type="file" accept="image/*"></label>
        <div id="podglad-zdjecia">${st.zdjecie ? `<img src="${esc(st.zdjecie)}" alt="" class="miniatura">` : ''}</div>
      </section>

      <section class="karta">
        <h3>Składniki</h3>
        <ul class="skladniki" id="lista-skladnikow"></ul>
        <div class="dodaj-skladnik">
          <label>Produkt<input id="szukaj-produkt" type="search" placeholder="np. płatki owsiane"></label>
          <ul class="podpowiedzi" id="podpowiedzi"></ul>
          <div class="siatka-2">
            <label>Gramy<input id="gramy" type="number" inputmode="decimal" min="0" max="5000" step="1"></label>
            <button type="button" class="btn" id="dodaj-skladnik">Dodaj składnik</button>
          </div>
          <details class="rozwin" id="nowy-produkt"><summary>Nie ma produktu w bazie? Dodaj nowy</summary>
            <p class="uwaga">Wartości na 100 g – przepisz z etykiety. Produkt zostanie w bazie na stałe.</p>
            <label>Nazwa produktu<input id="np-nazwa" maxlength="80"></label>
            <div class="siatka-2">
              <label>kcal / 100 g<input id="np-kcal" type="number" inputmode="decimal" min="0" max="900" step="any"></label>
              <label>Białko g<input id="np-b" type="number" inputmode="decimal" min="0" max="100" step="any"></label>
              <label>Tłuszcze g<input id="np-t" type="number" inputmode="decimal" min="0" max="100" step="any"></label>
              <label>Węglowodany g<input id="np-w" type="number" inputmode="decimal" min="0" max="100" step="any"></label>
            </div>
            <label>Kategoria w sklepie<select id="np-kat">${kolejnoscKategorii().map((k) => `<option value="${k}">${esc(nazwaKategorii(k))}</option>`).join('')}</select></label>
            <button type="button" class="btn drugi" id="np-zapisz">Zapisz produkt</button>
          </details>
        </div>
        <p class="wyliczone" id="wyliczone"></p>
      </section>

      <section class="karta">
        <label>Przygotowanie – każdy krok w nowej linii<textarea name="kroki" rows="6">${esc((istniejacy?.kroki || []).join('\n'))}</textarea></label>
        <label>Wskazówki (opcjonalnie)<textarea name="wskazowki" rows="2">${esc((istniejacy?.wskazowki || []).join('\n'))}</textarea></label>
        <fieldset class="rodzaje"><legend>Gramatura</legend>
          <label class="check"><input type="radio" name="dla" value="oboje"${obie ? ' checked' : ''}> ta sama dla obojga</label>
          <label class="check"><input type="radio" name="dla" value="ja"${obie ? '' : ' checked'}> tylko dla mnie (${esc(imie(autor))}) – partnerowi aplikacja przeliczy przy kopiowaniu dnia</label>
        </fieldset>
      </section>

      <p id="blad" class="blad" hidden></p>
      <div class="przyciski">
        <button type="submit" class="btn">Zapisz przepis</button>
        <button type="button" class="btn drugi" id="anuluj">Anuluj</button>
        ${istniejacy ? '<button type="button" class="btn drugi" id="usun">Usuń przepis</button>' : ''}
      </div>
      <div id="potwierdz" class="karta" hidden><p>Usunąć przepis „${esc(istniejacy?.nazwa || '')}”? Dania z tym przepisem znikną z planu.</p>
        <div class="przyciski"><button type="button" class="btn" id="usun-tak">Usuń</button><button type="button" class="btn drugi" id="usun-nie">Anuluj</button></div></div>
    </form>`;

  const form = $('#przepis');
  const porcje = () => Math.max(1, Math.round(Number(form.elements.porcje.value) || 1));

  const rysujSkladniki = () => {
    $('#lista-skladnikow').innerHTML = st.skladniki.length ? st.skladniki.map((s, i) => `<li>
      <span>${esc(s.nazwa)}</span>
      <span class="ile"><input type="number" class="gramy-inline" data-i="${i}" value="${s.gramy}" min="0" step="1" aria-label="Gramy: ${esc(s.nazwa)}"> g
        <button type="button" class="maly-btn" data-usun="${i}" aria-label="Usuń: ${esc(s.nazwa)}">✕</button></span></li>`).join('')
      : '<li class="uwaga">Dodaj pierwszy składnik poniżej.</li>';
    const n = policzNaPorcje(st.skladniki, porcje());
    $('#wyliczone').textContent = st.skladniki.length && n
      ? `Na 1 porcję: ${n.kcal} kcal · B ${liczba(n.b)} g · T ${liczba(n.t)} g · W ${liczba(n.w)} g` : '';
  };
  rysujSkladniki();

  form.elements.porcje.addEventListener('input', rysujSkladniki);
  $('#lista-skladnikow').addEventListener('input', (e) => {
    const i = e.target.dataset.i;
    if (i == null) return;
    st.skladniki[i].gramy = Math.max(0, Number(e.target.value) || 0);
    const n = policzNaPorcje(st.skladniki, porcje());
    $('#wyliczone').textContent = n ? `Na 1 porcję: ${n.kcal} kcal · B ${liczba(n.b)} g · T ${liczba(n.t)} g · W ${liczba(n.w)} g` : '';
  });
  $('#lista-skladnikow').addEventListener('click', (e) => {
    const u = e.target.closest('[data-usun]');
    if (u) { st.skladniki.splice(Number(u.dataset.usun), 1); rysujSkladniki(); }
  });

  // wyszukiwanie produktu
  $('#szukaj-produkt').addEventListener('input', (e) => {
    st.produkt = null;
    const slowa = norm(e.target.value).split(/\s+/).filter(Boolean);
    const lista = szukajProduktow(e.target.value);
    $('#podpowiedzi').innerHTML = lista.map((p) => `<li><button type="button" data-produkt="${esc(p.id)}">${esc(p.nazwa)} <span class="uwaga">${p.na100g.kcal} kcal/100 g</span></button></li>`).join('')
      + (slowa.length && !lista.length ? '<li class="uwaga">Brak w bazie – dodaj nowy produkt poniżej.</li>' : '');
  });
  const wybierzProdukt = (p) => {
    st.produkt = p;
    $('#szukaj-produkt').value = p.nazwa;
    $('#podpowiedzi').innerHTML = '';
    const m = p.miary?.[0];
    if (m && !$('#gramy').value) $('#gramy').value = m.gramy;
    $('#gramy').focus();
  };
  $('#podpowiedzi').addEventListener('click', (e) => {
    const b = e.target.closest('[data-produkt]');
    if (b) wybierzProdukt(S.produkty.get(Number(b.dataset.produkt)) || S.produkty.get(b.dataset.produkt));
  });
  $('#dodaj-skladnik').addEventListener('click', () => {
    const g = Number($('#gramy').value);
    if (!st.produkt) return pokazBlad('Wybierz produkt z listy podpowiedzi.');
    if (!(g >= 0)) return pokazBlad('Wpisz gramy.');
    st.skladniki.push({ produktId: st.produkt.id, nazwa: st.produkt.nazwa, gramy: g });
    st.produkt = null;
    $('#szukaj-produkt').value = '';
    $('#gramy').value = '';
    ukryjBlad();
    rysujSkladniki();
    $('#szukaj-produkt').focus();
  });

  // nowy produkt z etykiety
  $('#np-zapisz').addEventListener('click', async () => {
    const nazwa = $('#np-nazwa').value.trim();
    const v = (s) => Number($(s).value);
    if (!nazwa || $('#np-kcal').value === '') return pokazBlad('Nowy produkt: wpisz nazwę i kcal na 100 g.');
    const p = { id: `p-${uuid()}`, nazwa, wlasny: true, kategoria: Number($('#np-kat').value), miary: [],
      na100g: { kcal: v('#np-kcal'), b: v('#np-b') || 0, t: v('#np-t') || 0, w: v('#np-w') || 0, blonnik: 0 },
      zmienil: ja(), zmieniono: new Date().toISOString() };
    S.produkty.set(p.id, p);
    await zapisz('produkty', p);
    $('#nowy-produkt').open = false;
    ukryjBlad();
    komunikat(`Dodano produkt: ${nazwa}`);
    wybierzProdukt(p);
  });

  // zdjęcie: zmniejszamy w telefonie do 560 px, zapisujemy razem z przepisem
  form.elements.zdjecie.addEventListener('change', async (e) => {
    const plik = e.target.files?.[0];
    if (!plik) return;
    try {
      st.zdjecie = await zmniejsz(plik, 560);
      $('#podglad-zdjecia').innerHTML = `<img src="${st.zdjecie}" alt="" class="miniatura">`;
    } catch { pokazBlad('Nie udało się wczytać zdjęcia.'); }
  });

  $('#anuluj').addEventListener('click', () => wroc('#/przepisy'));
  $('#usun')?.addEventListener('click', () => { $('#potwierdz').hidden = false; });
  $('#usun-nie')?.addEventListener('click', () => { $('#potwierdz').hidden = true; });
  $('#usun-tak')?.addEventListener('click', async () => {
    istniejacy.usuniety = true;
    istniejacy.zmieniono = new Date().toISOString();
    await zapisz('przepisy', czysty(istniejacy));
    S.przepisy.delete(String(istniejacy.id));
    komunikat('Usunięto przepis');
    location.hash = '#/przepisy';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nazwa = form.elements.nazwa.value.trim();
    if (!nazwa) return pokazBlad('Wpisz nazwę przepisu.');
    if (!st.skladniki.length) return pokazBlad('Dodaj przynajmniej jeden składnik.');
    const por = porcje();
    const skladniki = st.skladniki.map((s) => ({ produktId: s.produktId, nazwa: s.nazwa, gramy: s.gramy, miaraId: null, ilosc: null, zamienniki: [] }));
    const wariant = { porcje: por, naPorcje: policzNaPorcje(skladniki, por), skladniki };
    const dla = form.elements.dla.value;
    const p = {
      id: istniejacy?.id || `w-${uuid()}`,
      nazwa, tagi: [], zrodlo: 'wlasne', zdjecie: st.zdjecie, pomocniczy: false,
      rodzaje: $$('input[name=rodzaj]:checked', form).map((x) => x.value),
      czasPrzygotowania: Number(form.elements.czasPrzygotowania.value) || 0,
      czasGotowania: Number(form.elements.czasGotowania.value) || 0,
      kroki: form.elements.kroki.value.split('\n').map((x) => x.trim()).filter(Boolean),
      wskazowki: form.elements.wskazowki.value.split('\n').map((x) => x.trim()).filter(Boolean),
      przechowywanie: null, naglowkiKrokow: [],
      warianty: dla === 'oboje' ? Object.fromEntries(osoby().map((o) => [o.id, wariant])) : { [autor]: wariant },
      utworzono: istniejacy?.utworzono || new Date().toISOString(),
      zmienil: ja(), zmieniono: new Date().toISOString(), usuniety: false,
    };
    await zapisz('przepisy', czysty(p));
    dodajDoIndeksu(p);
    if (!S.kolekcje) S.kolekcje = [];
    komunikat(istniejacy ? 'Zapisano zmiany' : 'Dodano przepis');
    location.replace(`#/przepis/${encodeURIComponent(p.id)}`);
  });
}

const czysty = ({ _szukajNazwa, _skladniki, _szukajSkl, _czas, ...p }) => p;

function pokazBlad(t) { $('#blad').textContent = t; $('#blad').hidden = false; $('#blad').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
function ukryjBlad() { $('#blad').hidden = true; }

function zmniejsz(plik, maks) {
  return new Promise((ok, blad) => {
    const img = new Image();
    img.onload = () => {
      const skala = Math.min(1, maks / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * skala);
      c.height = Math.round(img.height * skala);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      ok(c.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = blad;
    img.src = URL.createObjectURL(plik);
  });
}
