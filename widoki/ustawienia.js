// Ustawienia: kto używa telefonu, cele kcal, suplementacja i zalecenia, dane i offline, kopia zapasowa.
import { $, esc, liczba, pogrubienia, odmiana } from '../narzedzia.js';
import { S, osoby, imie, ja, ustaw, celKcal, kolejnoscKategorii, nazwaKategorii, dodajDoIndeksu, WSPOLNE_USTAWIENIA } from '../stan.js';
import { zapisz } from '../db.js';
import { trybChmury, uzytkownik, wyloguj } from '../chmura.js';
import { sync, synchronizuj, poSynchronizacji } from '../synchronizacja.js';
import { ustawTytul, komunikat } from '../ui.js';
import { zdjecia, offlineMozliwy, pobierzZdjecia, pasek } from '../offline.js';
import { pamiec } from '../narzedzia.js';

export async function widokUstawien() {
  ustawTytul('Ustawienia');
  const b = S.baza;
  let trwale = null, miejsce = null;
  try { trwale = await navigator.storage?.persisted?.(); } catch { /* brak API */ }
  try { miejsce = await navigator.storage?.estimate?.(); } catch { /* brak API */ }
  const aktywne = [...S.wpisy.values()].filter((w) => !w.usuniety).length;

  $('#widok').innerHTML = `
    ${trybChmury() ? `<section class="karta"><h3>Konto i synchronizacja</h3>
      <p>Zalogowano: <b>${esc(uzytkownik()?.email || '')}</b></p>
      <p id="sync-stan" class="uwaga">${esc(opisSync())}</p>
      <div class="przyciski">
        <button type="button" class="btn drugi" id="sync-teraz">Synchronizuj teraz</button>
        <button type="button" class="btn drugi" id="wyloguj">Wyloguj</button>
      </div>
      <div id="potwierdz-wyloguj" class="karta" hidden>
        <p>${sync.czeka ? `<b>Uwaga:</b> ${sync.czeka} ${odmiana(sync.czeka, 'zmiana czeka', 'zmiany czekają', 'zmian czeka')} na wysłanie – połącz się z internetem przed wylogowaniem. ` : ''}Wylogować? Dane zostaną w telefonie, ale do ich otwarcia trzeba będzie zalogować się ponownie.</p>
        <div class="przyciski"><button type="button" class="btn" id="wyloguj-tak">Wyloguj</button>
          <button type="button" class="btn drugi" id="wyloguj-nie">Anuluj</button></div>
      </div>
    </section>` : ''}

    <section class="karta"><h3>Kto używa tego telefonu?</h3>
      <div class="segment" role="group" aria-label="Kto używa tego telefonu">
        ${osoby().map((o) => `<button type="button" data-ja="${o.id}" aria-pressed="${ja() === o.id}">${esc(o.imie)}</button>`).join('')}
      </div>
      <p class="uwaga">Przy zmianach w planie zapisuje się, kto je zrobił.</p>
    </section>

    <section class="karta"><h3>Dzienna kaloryczność</h3>
      <form id="cele" class="formularz">
        ${osoby().map((o) => `<label>${esc(o.imie)} (z RESPO: ${o.kcal} kcal)
          <input type="number" inputmode="numeric" min="800" max="6000" step="10" name="${o.id}" value="${celKcal(o.id)}"></label>`).join('')}
        <button type="submit" class="btn">Zapisz</button>
      </form>
    </section>

    <section class="karta"><h3>Kolejność kategorii w sklepie</h3>
      <p class="uwaga">Tak będą ułożone pozycje na liście zakupów.</p>
      <ol class="kategorie" id="kategorie">${kolejnoscKategorii().map((id, i, t) => `<li><span>${esc(nazwaKategorii(id))}</span>
        <span class="przesun"><button type="button" data-kat="${id}" data-kier="-1" aria-label="Wyżej: ${esc(nazwaKategorii(id))}"${i === 0 ? ' disabled' : ''}>↑</button>
        <button type="button" data-kat="${id}" data-kier="1" aria-label="Niżej: ${esc(nazwaKategorii(id))}"${i === t.length - 1 ? ' disabled' : ''}>↓</button></span></li>`).join('')}</ol>
    </section>

    ${osoby().map((o) => `<section class="karta"><h3>${esc(o.imie)}: suplementacja i zalecenia</h3>
      ${(o.suplementy || []).map((s) => `<details class="rozwin"><summary>${esc(s.nazwa)}</summary>
        ${s.stosowanie ? `<p><b>Stosowanie:</b> ${pogrubienia(s.stosowanie)}</p>` : ''}<p>${pogrubienia(s.opis)}</p></details>`).join('') || '<p class="uwaga">Brak.</p>'}
      ${(o.zalecenia || []).map((z) => `<details class="rozwin"><summary>${esc(z.naglowek)}</summary>${blokiHtml(z.bloki)}</details>`).join('')}
    </section>`).join('')}

    <section class="karta"><h3>Dane</h3>
      <table class="tabela">
        <tr><td>Baza przepisów z</td><td>${esc(b.utworzono)}</td></tr>
        <tr><td>Przepisy</td><td>${S.przepisy.size}</td></tr>
        <tr><td>Produkty</td><td>${S.produkty.size}</td></tr>
        <tr><td>Posiłki w planie</td><td>${aktywne}</td></tr>
        <tr><td>Serwer</td><td>${b.serwerDostepny ? 'dostępny' : 'niedostępny (offline)'}</td></tr>
      </table>
      <button type="button" class="btn drugi" id="eksport">Eksportuj wszystko do pliku</button>
      <p class="uwaga">Kopia planu, list zakupów, własnych przepisów i ustawień. Na iPhonie zapisz ją w „Plikach” na iCloud Drive.</p>
      <label class="btn drugi plik-btn">Wczytaj kopię z pliku<input type="file" id="wczytaj" accept="application/json,.json" hidden></label>
      <p class="uwaga">Dołącza zmiany z pliku kopii (np. ze starej wersji aplikacji). Przy tym samym posiłku zostaje nowsza zmiana.</p>
    </section>

    <section class="karta"><h3>Praca bez internetu</h3>
      ${offlineMozliwy() ? `
        <p>Zdjęcia zapisane w telefonie: <b id="zdj-ile"></b></p>
        <div class="pasek"><div id="zdj-pasek"></div></div>
        <button class="btn drugi" id="zdj-pobierz" type="button">Pobierz wszystkie zdjęcia teraz</button>
        <p class="uwaga">Pamięć trwała: ${trwale ? 'tak' : 'nie (przeglądarka może kiedyś wyczyścić dane)'}${miejsce ? ` · zajęte ${liczba(miejsce.usage / 1e6, 0)} MB` : ''}</p>`
      : `<p>Przepisy i plan są zapisane w pamięci przeglądarki, ale pełny tryb offline (otwieranie bez serwera)
         wymaga bezpiecznego połączenia HTTPS (wersja opublikowana w internecie).</p>`}
    </section>`;

  if (offlineMozliwy()) {
    pasek();
    $('#zdj-pobierz').addEventListener('click', () => pobierzZdjecia(true));
  }
  $('#widok').onclick = async (e) => {
    const kat = e.target.closest('[data-kat]');
    if (kat) {
      const k = kolejnoscKategorii();
      const i = k.indexOf(Number(kat.dataset.kat)), j = i + Number(kat.dataset.kier);
      if (j < 0 || j >= k.length) return;
      [k[i], k[j]] = [k[j], k[i]];
      await ustaw({ kolejnoscKategorii: k });
      const y = window.scrollY;
      await widokUstawien();
      window.scrollTo(0, y);
      document.querySelector(`[data-kat="${kat.dataset.kat}"][data-kier="${kat.dataset.kier}"]`)?.focus();
      return;
    }
    const b2 = e.target.closest('[data-ja]');
    if (b2) {
      await ustaw({ ja: b2.dataset.ja });
      S.osoba = b2.dataset.ja; pamiec.zapisz('osoba', S.osoba);
      komunikat(`Ten telefon: ${imie(b2.dataset.ja)}`);
      widokUstawien();
    }
  };
  $('#cele').addEventListener('submit', async (e) => {
    e.preventDefault();
    const cele = {};
    for (const o of osoby()) {
      const v = Number(e.target.elements[o.id].value);
      if (v >= 800 && v <= 6000) cele[o.id] = Math.round(v);
    }
    await ustaw({ cele });
    komunikat('Zapisano kaloryczność');
  });
  $('#eksport').addEventListener('click', eksportuj);
  $('#wczytaj').addEventListener('change', (e) => wczytajKopie(e.target.files?.[0]));
  if (trybChmury()) {
    $('#sync-teraz').addEventListener('click', async () => {
      $('#sync-stan').textContent = 'Synchronizuję…';
      await synchronizuj();
      komunikat(sync.blad ? 'Nie udało się – sprawdź internet' : 'Zsynchronizowano');
    });
    $('#wyloguj').addEventListener('click', () => { $('#potwierdz-wyloguj').hidden = false; });
    $('#wyloguj-nie').addEventListener('click', () => { $('#potwierdz-wyloguj').hidden = true; });
    $('#wyloguj-tak').addEventListener('click', () => { wyloguj(); location.reload(); });
  }
}

function opisSync() {
  if (sync.trwa) return 'Synchronizuję…';
  const czeka = sync.czeka ? ` · do wysłania: ${sync.czeka}` : '';
  if (sync.blad === 'offline') return `Brak internetu – zmiany wyślą się później${czeka}`;
  if (sync.blad) return `Błąd synchronizacji: ${sync.blad}`;
  if (sync.ostatnio) return `Zsynchronizowano o ${sync.ostatnio.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}${czeka}`;
  return `Jeszcze nie zsynchronizowano${czeka}`;
}
poSynchronizacji(() => { const el = $('#sync-stan'); if (el) el.textContent = opisSync(); });

/** Wczytanie pliku z „Eksportuj wszystko”: dołącza rekordy, przy konflikcie zostaje nowsza zmiana. */
async function wczytajKopie(plik) {
  if (!plik) return;
  let dane;
  try { dane = JSON.parse(await plik.text()); } catch { komunikat('To nie jest plik kopii'); return; }
  if (dane?.aplikacja !== 'dieta-app') { komunikat('To nie jest plik kopii tej aplikacji'); return; }
  const nowszy = (a, b) => !b || new Date(a.zmieniono || 0) > new Date(b.zmieniono || 0);
  let ile = 0;
  const wpisy = (dane.wpisy || []).filter((w) => nowszy(w, S.wpisy.get(w.id)));
  const listy = (dane.listy || []).filter((l) => nowszy(l, S.listy.get(l.id)));
  const przepisy = (dane.wlasnePrzepisy || []).filter((p) => nowszy(p, S.przepisy.get(String(p.id))));
  const produkty = (dane.wlasneProdukty || []).filter((p) => nowszy(p, S.produkty.get(p.id)));
  if (wpisy.length) { await zapisz('wpisy', wpisy); wpisy.forEach((w) => S.wpisy.set(w.id, w)); }
  if (listy.length) { await zapisz('listy', listy); listy.forEach((l) => S.listy.set(l.id, l)); }
  if (produkty.length) { await zapisz('produkty', produkty); produkty.forEach((p) => S.produkty.set(p.id, p)); }
  if (przepisy.length) { await zapisz('przepisy', przepisy); przepisy.forEach((p) => (p.usuniety ? null : dodajDoIndeksu({ ...p }))); }
  ile = wpisy.length + listy.length + przepisy.length + produkty.length;
  const wspolne = Object.fromEntries(WSPOLNE_USTAWIENIA.filter((k) => dane.ustawienia?.[k] !== undefined && S.ustawienia[k] === undefined)
    .map((k) => [k, dane.ustawienia[k]]));
  if (Object.keys(wspolne).length) { await ustaw(wspolne); ile++; }
  komunikat(ile ? `Wczytano zmiany: ${ile}` : 'Nic nowego w tym pliku');
  widokUstawien();
}

function blokiHtml(bloki) {
  let html = '', lista = false;
  for (const b of bloki || []) {
    if (b.typ === 'li' && !lista) { html += '<ul>'; lista = true; }
    if (b.typ !== 'li' && lista) { html += '</ul>'; lista = false; }
    html += b.typ === 'h' ? `<h4>${pogrubienia(b.tekst)}</h4>` : b.typ === 'li' ? `<li>${pogrubienia(b.tekst)}</li>` : `<p>${pogrubienia(b.tekst)}</p>`;
  }
  return html + (lista ? '</ul>' : '');
}

function eksportuj() {
  const dane = {
    aplikacja: 'dieta-app', wersja: 1, utworzono: new Date().toISOString(),
    ustawienia: S.ustawienia,
    wpisy: [...S.wpisy.values()],
    listy: [...S.listy.values()],
    wlasnePrzepisy: [...S.przepisy.values()].filter((p) => p.zrodlo === 'wlasne').map(({ _szukajNazwa, _skladniki, _szukajSkl, _czas, ...p }) => p),
    wlasneProdukty: [...S.produkty.values()].filter((p) => p.wlasny),
  };
  const plik = new Blob([JSON.stringify(dane, null, 1)], { type: 'application/json' });
  const nazwa = `dieta-kopia-${new Date().toISOString().slice(0, 10)}.json`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(plik);
  a.download = nazwa;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  komunikat(`Zapisano kopię: ${dane.wpisy.length} ${odmiana(dane.wpisy.length, 'wpis', 'wpisy', 'wpisów')}`);
}
