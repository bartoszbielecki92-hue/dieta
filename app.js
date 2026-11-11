// Aplikacja dietetyczna dla pary – start i nawigacja między ekranami.
import { $, $$, esc, pamiec } from './narzedzia.js';
import { wczytajWszystko } from './db.js';
import { S, przygotuj, osoby, ustaw } from './stan.js';
import { trybChmury, zalogowany } from './chmura.js';
import { uruchomSynchronizacje, poSynchronizacji } from './synchronizacja.js';
import { ekranLogowania } from './widoki/logowanie.js';
import { ustawTytul, ustawWstecz, zmianaTrasy, PODEKRANY } from './ui.js';
import { zarejestrujSW } from './offline.js';
import { widokListy, widokPrzepisu } from './widoki/przepisy.js';
import { widokDnia } from './widoki/dzien.js';
import { widokPlanu, widokKopii } from './widoki/plan.js';
import { widokWyboru, widokSpoza } from './widoki/wybor.js';
import { widokUstawien } from './widoki/ustawienia.js';
import { widokZakupow, widokListyZakupow } from './widoki/zakupy.js';
import { widokWlasnego } from './widoki/wlasny.js';

async function start() {
  const widok = $('#widok');
  let nowaOsoba = null;
  if (trybChmury() && !zalogowany()) nowaOsoba = await ekranLogowania();
  try {
    przygotuj(await wczytajWszystko((t) => { widok.innerHTML = `<p class="ladowanie">${esc(t)}</p>`; }));
  } catch (e) {
    widok.innerHTML = `<div class="blad">${esc(e.message)}</div>`;
    console.error(e);
    return;
  }
  if (nowaOsoba) {
    if (!S.ustawienia.ja) { await ustaw({ ja: nowaOsoba }); S.osoba = nowaOsoba; }
  }
  rysujOsoby();
  window.addEventListener('hashchange', (e) => {
    const pozycja = zmianaTrasy(e.oldURL, e.newURL);
    trasa();
    window.scrollTo(0, 0);
    if (pozycja) requestAnimationFrame(() => window.scrollTo(0, pozycja));
  });
  trasa();
  zarejestrujSW();
  if (trybChmury()) {
    poSynchronizacji((ile) => { if (ile) odswiezEkran(); });
    window.addEventListener('dieta-wylogowano', () => location.reload());
    uruchomSynchronizacje();
  }
}

// Po pobraniu zmian partnera rysujemy ekran od nowa – ale nie wtedy, gdy ktoś właśnie coś wpisuje.
let czekaNaOdswiezenie = false;
function odswiezEkran() {
  const aktywny = document.activeElement;
  const ekran = (location.hash.replace(/^#\/?/, '') || 'dzisiaj').split('/')[0];
  if (aktywny?.matches?.('input, textarea, select') || ['nowy-przepis', 'spoza', 'wybierz'].includes(ekran)) {
    czekaNaOdswiezenie = true;
    return;
  }
  czekaNaOdswiezenie = false;
  const y = window.scrollY;
  trasa();
  window.scrollTo(0, y);
}
document.addEventListener('focusout', () => { if (czekaNaOdswiezenie) setTimeout(odswiezEkran, 300); });

// przełącznik u góry: czyje kcal pokazuje zakładka Przepisy
function rysujOsoby() {
  $('#wybor-osoby').innerHTML = osoby().map((o) =>
    `<button type="button" data-osoba="${esc(o.id)}" aria-pressed="${o.id === S.osoba}">${esc(o.imie)}</button>`).join('');
}
$('#wybor-osoby').addEventListener('click', (e) => {
  const b = e.target.closest('[data-osoba]');
  if (!b) return;
  S.osoba = b.dataset.osoba;
  pamiec.zapisz('osoba', S.osoba);
  rysujOsoby();
  trasa();
});

const ZAKLADKI = { dzisiaj: 'dzisiaj', plan: 'plan', kopiuj: 'plan', przepisy: 'przepisy', przepis: 'przepisy', 'nowy-przepis': 'przepisy', zakupy: 'zakupy', lista: 'zakupy' };

function trasa() {
  const [ekran = 'dzisiaj', ...reszta] = (location.hash.replace(/^#\/?/, '') || 'dzisiaj').split('/').map(decodeURIComponent);
  const widok = $('#widok');
  widok.onclick = null;
  widok.onchange = null;
  $$('.dol a').forEach((a) => (a.dataset.tab === ZAKLADKI[ekran] ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  ustawWstecz(PODEKRANY.has(ekran));
  $('#wybor-osoby').hidden = !(ekran === 'przepisy' || (ekran === 'przepis' && !reszta[1]));
  rysujOsoby();

  try {
    switch (ekran) {
      case 'dzisiaj': return widokDnia(reszta[0]);
      case 'plan': return widokPlanu(reszta[0]);
      case 'kopiuj': return widokKopii(reszta[0], reszta[1]);
      case 'przepisy': return widokListy();
      case 'przepis': return widokPrzepisu(reszta[0], reszta[1]);
      case 'wybierz': return widokWyboru(reszta);
      case 'spoza': return widokSpoza(reszta[0], reszta[1]);
      case 'ustawienia':
      case 'o-danych': return widokUstawien();
      case 'zakupy': return widokZakupow();
      case 'lista': return widokListyZakupow(reszta[0]);
      case 'nowy-przepis': return widokWlasnego(reszta[0]);
      default: return widokDnia();
    }
  } catch (e) {
    console.error(e);
    widok.innerHTML = `<div class="blad">Coś poszło nie tak: ${esc(e.message)}</div>`;
  }
}

function wkrotce(tytul, opis) {
  ustawTytul(tytul);
  $('#widok').innerHTML = `<div class="wkrotce">
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
    <h2>Wkrótce</h2><p>${esc(opis)}</p></div>`;
}

start();
