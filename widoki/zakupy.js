// Listy zakupów: wiele list naraz, widok według składnika i według przepisu, stany pozycji, Kopiuj do Notatek.
import { $, $$, esc, liczba, gramy, dzisISO, dodajDni, nazwaDnia, zakresDat, uuid, odmiana } from '../narzedzia.js';
import {
  S, osoby, imie, ja, ustaw, przepis, nazwaSlotu, zapiszWpis, zapiszListe, daniaListy, skladnikiListy,
  kolejnoscKategorii, nazwaKategorii, kategoriaProduktu, BEZ_KATEGORII, makroWpisu, wariantWpisu,
} from '../stan.js';
import { ustawTytul, komunikat, wroc } from '../ui.js';
import { makroTekst } from './dzien.js';
import { miaraTekst } from './przepisy.js';

const STANY = { mam: 'mam w domu', koszyk: 'w koszyku' };
const L = { widok: {}, otwarte: new Set() };   // widok: id listy -> 'skladnik' | 'przepis'; otwarte: rozwinięte składniki dań

// ---------------------------------------------------------------- lista list
export function widokZakupow() {
  ustawTytul('Zakupy');
  const listy = [...S.listy.values()].filter((l) => !l.usuniety).sort((a, b) => b.od.localeCompare(a.od));
  const aktywne = listy.filter((l) => !l.zarchiwizowana);
  const archiwum = listy.filter((l) => l.zarchiwizowana);
  const od = dzisISO(), doo = dodajDni(od, 2);
  const wiersz = (l) => {
    const sk = skladnikiListy(l);
    const zostalo = sk.filter((x) => !l.stany?.[x.klucz]).length + (l.reczne || []).filter((r) => !r.stan && !r.usuniety).length;
    return `<li><a class="wiersz-listy" href="#/lista/${l.id}">
      <b>${esc(l.nazwa)}</b><span class="uwaga">${esc(zakresDat(l.od, l.do))} · do kupienia: ${zostalo}</span></a></li>`;
  };
  $('#widok').innerHTML = `
    <section class="karta"><h3>Nowa lista</h3>
      <form id="nowa" class="formularz siatka-2">
        <label>Od<input type="date" name="od" value="${od}" required></label>
        <label>Do<input type="date" name="do" value="${doo}" required></label>
        <button type="submit" class="btn">Utwórz listę</button>
      </form>
    </section>
    <section class="karta"><h3>Listy</h3>
      ${aktywne.length ? `<ul class="listy">${aktywne.map(wiersz).join('')}</ul>` : '<p class="uwaga">Nie masz jeszcze żadnej listy.</p>'}
      ${archiwum.length ? `<details class="rozwin"><summary>Archiwum (${archiwum.length})</summary><ul class="listy">${archiwum.map(wiersz).join('')}</ul></details>` : ''}
    </section>`;
  $('#nowa').addEventListener('submit', async (e) => {
    e.preventDefault();
    let a = e.target.elements.od.value, b = e.target.elements.do.value;
    if (b < a) [a, b] = [b, a];
    const l = await zapiszListe({ nazwa: zakresDat(a, b), od: a, do: b, stany: {}, reczne: [], zarchiwizowana: false, usuniety: false,
      utworzono: new Date().toISOString() });
    location.hash = `#/lista/${l.id}`;
  });
}

// ---------------------------------------------------------------- jedna lista
export function widokListyZakupow(id) {
  const l = S.listy.get(id);
  if (!l || l.usuniety) { ustawTytul('Lista'); $('#widok').innerHTML = '<p class="pusto">Nie znalazłem tej listy.</p>'; return; }
  ustawTytul(l.nazwa);
  const tryb = L.widok[id] || 'skladnik';
  $('#widok').innerHTML = `
    <div class="naglowek-listy">
      <form id="nazwa-listy" class="nazwa-listy"><input name="nazwa" value="${esc(l.nazwa)}" aria-label="Nazwa listy" maxlength="60"></form>
      <span class="uwaga">${esc(zakresDat(l.od, l.do))}</span>
    </div>
    <div class="segment" role="group" aria-label="Widok listy">
      <button type="button" data-tryb-listy="skladnik" aria-pressed="${tryb === 'skladnik'}">Według składnika</button>
      <button type="button" data-tryb-listy="przepis" aria-pressed="${tryb === 'przepis'}">Według przepisu</button>
    </div>
    <div id="tresc"></div>
    <div class="przyciski dol-listy">
      <button type="button" class="btn drugi maly" data-akcja-listy="archiwizuj">${l.zarchiwizowana ? 'Przywróć z archiwum' : 'Archiwizuj'}</button>
      <button type="button" class="btn drugi maly" data-akcja-listy="usun">Usuń listę</button>
    </div>
    <div id="potwierdz-usun" class="karta" hidden>
      <p>Usunąć listę „${esc(l.nazwa)}”? Plan posiłków się nie zmieni.</p>
      <div class="przyciski"><button type="button" class="btn" data-akcja-listy="usun-tak">Usuń</button>
        <button type="button" class="btn drugi" data-akcja-listy="usun-nie">Anuluj</button></div>
    </div>`;
  rysujTresc(l, tryb);

  $('#nazwa-listy').addEventListener('change', async (e) => {
    const n = e.target.value.trim();
    if (!n) { e.target.value = l.nazwa; return; }
    l.nazwa = n; await zapiszListe(l); ustawTytul(n); komunikat('Zmieniono nazwę');
  });
  $('#nazwa-listy').addEventListener('submit', (e) => { e.preventDefault(); e.target.elements.nazwa.blur(); });

  $('#widok').onclick = async (e) => {
    const t = e.target;
    const tl = t.closest('[data-tryb-listy]');
    if (tl) { L.widok[id] = tl.dataset.trybListy; $$('[data-tryb-listy]').forEach((x) => x.setAttribute('aria-pressed', x === tl)); rysujTresc(l, L.widok[id]); return; }
    const st = t.closest('[data-stan]');
    if (st) {
      const klucz = st.dataset.klucz;
      const reczna = (l.reczne || []).find((r) => r.id === klucz);
      if (reczna) reczna.stan = reczna.stan === st.dataset.stan ? null : st.dataset.stan;
      else { l.stany ||= {}; l.stany[klucz] = l.stany[klucz] === st.dataset.stan ? undefined : st.dataset.stan; if (!l.stany[klucz]) delete l.stany[klucz]; }
      await zapiszListe(l);
      rysujTresc(l, 'skladnik');
      return;
    }
    const mn = t.closest('[data-mnoznik]');
    if (mn) {
      const w = S.wpisy.get(mn.dataset.wpis);
      w.porcje = Math.min(20, Math.max(0.5, (w.porcje || 1) + Number(mn.dataset.mnoznik)));
      await zapiszWpis(w);
      rysujTresc(l, 'przepis');
      return;
    }
    const ud = t.closest('[data-usun-danie]');
    if (ud) { const p = $(`#potw-${CSS.escape(ud.dataset.usunDanie)}`); p.hidden = !p.hidden; return; }
    const un = t.closest('[data-usun-nie]');
    if (un) { $(`#potw-${CSS.escape(un.dataset.usunNie)}`).hidden = true; return; }
    const ut = t.closest('[data-usun-tak]');
    if (ut) {
      const w = S.wpisy.get(ut.dataset.usunTak);
      w.usuniety = true;
      await zapiszWpis(w);
      komunikat(`Usunięto z planu: ${przepis(w.przepisId)?.nazwa || 'danie'}`);
      rysujTresc(l, 'przepis');
      return;
    }
    const usunR = t.closest('[data-usun-reczna]');
    if (usunR) {
      const r = l.reczne.find((x) => x.id === usunR.dataset.usunReczna);
      r.usuniety = true; await zapiszListe(l); rysujTresc(l, 'skladnik'); return;
    }
    const a = t.closest('[data-akcja-listy]');
    if (!a) return;
    switch (a.dataset.akcjaListy) {
      case 'kopiuj': return kopiujDoNotatek(l);
      case 'archiwizuj': l.zarchiwizowana = !l.zarchiwizowana; await zapiszListe(l); komunikat(l.zarchiwizowana ? 'Przeniesiono do archiwum' : 'Przywrócono'); return widokListyZakupow(id);
      case 'usun': $('#potwierdz-usun').hidden = false; $('#potwierdz-usun').scrollIntoView({ behavior: 'smooth' }); return;
      case 'usun-nie': $('#potwierdz-usun').hidden = true; return;
      case 'usun-tak': l.usuniety = true; await zapiszListe(l); komunikat('Usunięto listę'); location.hash = '#/zakupy'; return;
      default:
    }
  };
  $('#widok').onchange = async (e) => {
    const sel = e.target.closest('[data-kategoria-produktu]');
    if (!sel) return;
    const kat = Number(sel.value);
    await ustaw({ kategorieProduktow: { ...(S.ustawienia.kategorieProduktow || {}), [sel.dataset.kategoriaProduktu]: kat } });
    komunikat(`Przypisano: ${nazwaKategorii(kat)}`);
    rysujTresc(l, 'skladnik');
  };
}

function rysujTresc(l, tryb) {
  const y = window.scrollY;
  $('#tresc').innerHTML = tryb === 'przepis' ? widokPrzepisow(l) : widokSkladnikow(l);
  window.scrollTo(0, y);
  // pamiętamy, które dania mają rozwinięte składniki (żeby nie zwijały się po zmianie mnożnika)
  $$('#tresc details[data-wpis]').forEach((d) => d.addEventListener('toggle', () => {
    if (d.open) L.otwarte.add(d.dataset.wpis); else L.otwarte.delete(d.dataset.wpis);
  }));
  if (tryb !== 'przepis') {
    $('#dopisz').addEventListener('submit', async (e) => {
      e.preventDefault();
      const nazwa = e.target.elements.nazwa.value.trim();
      if (!nazwa) return;
      l.reczne ||= [];
      l.reczne.push({ id: `r:${uuid()}`, nazwa, kategoria: Number(e.target.elements.kategoria.value), stan: null, usuniety: false });
      await zapiszListe(l);
      rysujTresc(l, 'skladnik');
      komunikat(`Dopisano: ${nazwa}`);
      $('#dopisz input[name=nazwa]').focus();
    });
  }
}

/** Pozycje do wyświetlenia (składniki + ręczne), pogrupowane w kolejności sklepu. */
function pozycje(l) {
  const sk = skladnikiListy(l).map((x) => ({ ...x, stan: l.stany?.[x.klucz] || null, reczna: false }));
  const r = (l.reczne || []).filter((x) => !x.usuniety).map((x) => ({ klucz: x.id, nazwa: x.nazwa, gramy: null, kategoria: x.kategoria ?? BEZ_KATEGORII, stan: x.stan, reczna: true }));
  const grupy = new Map([...kolejnoscKategorii(), BEZ_KATEGORII].map((k) => [k, []]));
  for (const x of [...sk, ...r]) (grupy.get(x.kategoria) || grupy.get(BEZ_KATEGORII)).push(x);
  for (const g of grupy.values()) g.sort((a, b) => a.nazwa.localeCompare(b.nazwa, 'pl'));
  return grupy;
}

function ilosc(x) {
  if (x.gramy == null) return '';
  if (!x.gramy) return 'do smaku';
  const miara = x.produktId != null ? S.produkty.get(x.produktId)?.miary?.find((m) => [1, 9, 5, 11, 14, 17].includes(m.miaraId)) : null;
  const ile = miara ? x.gramy / miara.gramy : 0;
  return `${gramy(x.gramy)}${miara && ile >= 0.5 ? ` <span class="uwaga">(≈ ${liczba(Math.round(ile * 2) / 2)} × ${esc(miara.nazwa)})</span>` : ''}`;
}

function widokSkladnikow(l) {
  const grupy = pozycje(l);
  const wszystkie = [...grupy.values()].flat();
  const doKupienia = wszystkie.filter((x) => !x.stan).length;
  const dan = daniaListy(l).length;
  if (!wszystkie.length) {
    return `<p class="pusto">W tych dniach nie ma dań w planie.</p>${formularzDopisz()}`;
  }
  return `
    <div class="licznik"><span>Do kupienia: <b>${doKupienia}</b> z ${wszystkie.length} · z ${dan} ${odmiana(dan, 'dania', 'dań', 'dań')}</span>
      <button type="button" class="btn maly" data-akcja-listy="kopiuj">Kopiuj do Notatek</button></div>
    ${[...grupy.entries()].filter(([, g]) => g.length).map(([k, g]) => `
      <section class="karta kategoria">
        <h3>${esc(nazwaKategorii(k))}</h3>
        <ul class="pozycje">${g.map((x) => `
          <li class="pozycja${x.stan ? ` ${x.stan}` : ''}">
            <div class="opis"><span class="nazwa">${esc(x.nazwa)}</span><span class="ile">${ilosc(x)}</span></div>
            <div class="akcje">
              <button type="button" class="stan-btn zjedz" data-stan="koszyk" data-klucz="${esc(x.klucz)}" aria-pressed="${x.stan === 'koszyk'}">✓ W koszyku</button>
              <button type="button" class="stan-btn" data-stan="mam" data-klucz="${esc(x.klucz)}" aria-pressed="${x.stan === 'mam'}">Mam w domu</button>
              ${x.reczna ? `<button type="button" class="maly-btn" data-usun-reczna="${esc(x.klucz)}">Usuń</button>` : ''}
              ${k === BEZ_KATEGORII && !x.reczna ? `<select data-kategoria-produktu="${x.produktId}" aria-label="Kategoria dla: ${esc(x.nazwa)}">
                <option value="">Przypisz kategorię…</option>${kolejnoscKategorii().map((id) => `<option value="${id}">${esc(nazwaKategorii(id))}</option>`).join('')}</select>` : ''}
            </div>
          </li>`).join('')}</ul>
      </section>`).join('')}
    ${formularzDopisz()}`;
}

function formularzDopisz() {
  return `<section class="karta"><h3>Dopisz pozycję</h3>
    <form id="dopisz" class="formularz siatka-2" autocomplete="off">
      <label>Nazwa<input name="nazwa" placeholder="np. płyn do naczyń" maxlength="60" required></label>
      <label>Kategoria<select name="kategoria">${kolejnoscKategorii().map((id) => `<option value="${id}">${esc(nazwaKategorii(id))}</option>`).join('')}</select></label>
      <button type="submit" class="btn">Dopisz</button>
    </form></section>`;
}

function widokPrzepisow(l) {
  const dania = daniaListy(l);
  if (!dania.length) return '<p class="pusto">W tych dniach nie ma dań w planie.</p>';
  const dni = [...new Set(dania.map((w) => w.data))];
  return `<p class="uwaga">Mnożnik to liczba porcji, które gotujesz (np. ×3 dla trzech osób). Zmienia ilości na liście i w przepisie, ale nie licznik kcal.</p>
    ${dni.map((d) => `<section class="karta"><h3>${esc(nazwaDnia(d))}</h3>
      ${osoby().map((o) => {
        const lista = dania.filter((w) => w.data === d && w.osoba === o.id);
        if (!lista.length) return '';
        return `<h4 class="osoba-listy">${esc(o.imie)}</h4><ul class="posilki">${lista.map((w) => {
          const p = przepis(w.przepisId);
          return `<li class="posilek"><div class="slot">${esc(nazwaSlotu(w.osoba, w.slot))}</div>
            <div class="wiersz-dania">
              <a class="danie" href="#/przepis/${encodeURIComponent(w.przepisId)}/${encodeURIComponent(w.id)}">
                ${p?.zdjecie ? `<img src="${esc(p.zdjecie)}" alt="" loading="lazy" width="48" height="48">` : ''}
                <div><div class="nazwa">${esc(p?.nazwa || '?')}</div><div class="meta">${esc(makroTekst(makroWpisu(w)))}</div></div></a>
              <span class="mnoznik">
                <button type="button" data-mnoznik="-0.5" data-wpis="${w.id}" aria-label="Mniej porcji">−</button>
                <output>× ${liczba(w.porcje || 1)}</output>
                <button type="button" data-mnoznik="0.5" data-wpis="${w.id}" aria-label="Więcej porcji">+</button>
              </span>
            </div>
            <div class="pod-daniem">
              ${skladnikiDania(w)}
              <button type="button" class="maly-btn" data-usun-danie="${w.id}">Usuń z planu</button>
            </div>
            <div class="potwierdz-danie" id="potw-${w.id}" hidden>
              <span>Usunąć „${esc(p?.nazwa || '?')}” z planu (${esc(imie(w.osoba))}, ${esc(nazwaDnia(w.data, { zDniem: false }))})?</span>
              <button type="button" class="btn maly" data-usun-tak="${w.id}">Usuń</button>
              <button type="button" class="btn drugi maly" data-usun-nie="${w.id}">Anuluj</button>
            </div></li>`;
        }).join('')}</ul>`;
      }).join('')}</section>`).join('')}`;
}

/** Rozwijana lista składników jednego dania, przeliczona na mnożnik porcji. */
function skladnikiDania(w) {
  const war = wariantWpisu(w);
  if (!war?.skladniki?.length) return '';
  const m = (w.porcje || 1) / war.porcje;
  const ile = war.skladniki.filter((x) => !x.grupa).length;
  return `<details class="skladniki-dania" data-wpis="${w.id}"${L.otwarte.has(w.id) ? ' open' : ''}>
    <summary>Składniki (${ile})</summary>
    <ul>${war.skladniki.map((x) => {
      if (x.grupa) return `<li class="grupa">${esc(x.grupa)}</li>`;
      const nazwa = S.produkty.get(x.produktId)?.nazwa || x.nazwa;
      const mt = miaraTekst(x, m);
      return `<li><span>${esc(nazwa)}</span><span class="ile">${x.gramy ? gramy(x.gramy * m) : 'do smaku'}${mt ? ` <span class="uwaga">(${esc(mt)})</span>` : ''}</span></li>`;
    }).join('')}</ul>
  </details>`;
}

// ---------------------------------------------------------------- Kopiuj do Notatek (tylko brakujące, w kolejności sklepu)
// Kopiujemy same pozycje, po jednej w linii (tekst sformatowany i zwykły).
// Uwaga: nie używamy tu żadnego „await” przed kopiowaniem – Safari pozwala kopiować tylko od razu po dotknięciu.
function kopiujDoNotatek(l) {
  const grupy = [...pozycje(l)].map(([k, g]) => [k, g.filter((x) => !x.stan)]).filter(([, g]) => g.length);
  if (!grupy.length) { komunikat('Wszystko kupione – nie ma czego kopiować'); return; }
  // Bez nagłówków działów i bez punktorów: w Notatkach wystarczy „Zaznacz wszystko” + ikona listy kontrolnej,
  // żeby każda pozycja dostała kółko do odhaczania. Kolejność nadal według działów sklepu.
  const linie = grupy.flatMap(([, g]) => g.map((x) => `${x.nazwa}${x.gramy ? ` – ${gramy(x.gramy)}` : ''}`));
  const tekst = linie.join('\n');
  const html = linie.map((t) => `<div>${esc(t)}</div>`).join('');

  if (window.isSecureContext && navigator.clipboard?.write && window.ClipboardItem) {
    const item = new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([tekst], { type: 'text/plain' }) });
    navigator.clipboard.write([item]).then(() => komunikat('Skopiowano – wklej w Notatkach'),
      () => (kopiujStarymSposobem(html, tekst) ? komunikat('Skopiowano – wklej w Notatkach') : komunikat('Nie udało się skopiować')));
    return;
  }
  komunikat(kopiujStarymSposobem(html, tekst) ? 'Skopiowano – wklej w Notatkach' : 'Nie udało się skopiować');
}

/** Kopiowanie przez zaznaczenie ukrytego fragmentu strony – działa także bez HTTPS (adres http://192.168…). */
function kopiujStarymSposobem(html, tekst) {
  const el = document.createElement('div');
  el.innerHTML = html;
  el.contentEditable = 'true';
  Object.assign(el.style, { position: 'fixed', top: '0', left: '-9999px', opacity: '0', whiteSpace: 'pre-wrap' });
  document.body.append(el);
  const zaznaczenie = window.getSelection();
  const zakres = document.createRange();
  zakres.selectNodeContents(el);
  zaznaczenie.removeAllRanges();
  zaznaczenie.addRange(zakres);
  const naKopie = (e) => {          // podajemy oba formaty: sformatowany i zwykły tekst
    e.clipboardData.setData('text/html', html);
    e.clipboardData.setData('text/plain', tekst);
    e.preventDefault();
  };
  document.addEventListener('copy', naKopie);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  document.removeEventListener('copy', naKopie);
  zaznaczenie.removeAllRanges();
  el.remove();
  return ok;
}
