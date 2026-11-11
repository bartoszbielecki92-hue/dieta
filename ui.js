// Elementy wspólne interfejsu: tytuł, przycisk wstecz, przełącznik osób, okienko potwierdzeń.
import { $, esc } from './narzedzia.js';

export function ustawTytul(t) {
  $('#tytul').textContent = t;
  document.title = t === 'Dzisiaj' || t === 'Dieta' ? 'Dieta' : `${t} – Dieta`;
}

export function ustawWstecz(widoczny) {
  let b = $('.gora .wstecz');
  if (!b) {
    b = document.createElement('button');
    b.className = 'wstecz';
    b.type = 'button';
    b.setAttribute('aria-label', 'Wróć');
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
    b.addEventListener('click', wroc);
    $('.gora').prepend(b);
  }
  b.hidden = !widoczny;
}

// ---------------------------------------------------------------- nawigacja
// Aplikacja sama pamięta, z którego ekranu weszło się na ekran podrzędny (wybór dania, przepis, lista…),
// i tam wraca – nie polegamy na historii przeglądarki, która w Safari na iPhonie zachowuje się inaczej.
// Pamięta też pozycję przewinięcia, żeby po powrocie być w tym samym miejscu planu.
export const PODEKRANY = new Set(['przepis', 'wybierz', 'spoza', 'kopiuj', 'lista', 'nowy-przepis']);
const nav = { rodzic: {}, pozycje: {} };
export const ekranZ = (hash) => (String(hash || '').replace(/^#\/?/, '') || 'dzisiaj').split('/')[0];
const hashZ = (url) => { try { return new URL(url).hash || '#/dzisiaj'; } catch { return '#/dzisiaj'; } };

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
// wysokość górnego paska – potrzebna, żeby pasek tygodni w Planie przyklejał się tuż pod nim
const gora = document.querySelector('.gora');
if (gora && 'ResizeObserver' in window) {
  new ResizeObserver(() => document.documentElement.style.setProperty('--gora-h', `${gora.offsetHeight}px`)).observe(gora);
}
let zaplanowane = false;
window.addEventListener('scroll', () => {
  if (zaplanowane) return;
  zaplanowane = true;
  requestAnimationFrame(() => { nav.pozycje[location.hash || '#/dzisiaj'] = window.scrollY; zaplanowane = false; });
}, { passive: true });

/** Wywoływane przy zmianie adresu, przed narysowaniem ekranu. Zwraca pozycję do przywrócenia albo 0. */
export function zmianaTrasy(staryUrl, nowyUrl) {
  const stary = hashZ(staryUrl), nowy = hashZ(nowyUrl);
  if (PODEKRANY.has(ekranZ(nowy)) && stary !== nowy && nav.rodzic[stary] !== nowy) nav.rodzic[nowy] = stary;
  const powrot = PODEKRANY.has(ekranZ(stary)) && nav.rodzic[stary] === nowy;
  return powrot ? (nav.pozycje[nowy] || 0) : 0;
}

/** Powrót do ekranu, z którego się przyszło (przycisk ‹, po zapisaniu wyboru, Anuluj). */
export function wroc(domyslnie) {
  const tutaj = location.hash;
  const zwykle = { przepis: '#/przepisy', 'nowy-przepis': '#/przepisy', lista: '#/zakupy', wybierz: '#/plan', kopiuj: '#/plan', spoza: '#/dzisiaj' };
  const cel = nav.rodzic[tutaj] || (typeof domyslnie === 'string' ? domyslnie : zwykle[ekranZ(tutaj)] || '#/dzisiaj');
  const bazowy = location.href.split('#')[0];
  if (nav.rodzic[tutaj] && history.length > 1) {      // cofamy tylko wtedy, gdy wiemy, że poprzedni ekran był w aplikacji
    history.back();
    // jeśli przeglądarka nie cofnęła albo cofnęła gdzie indziej – idziemy tam, skąd użytkownik przyszedł
    setTimeout(() => { if (location.hash !== cel) location.replace(bazowy + cel); }, 350);
  } else {
    location.replace(bazowy + cel);
  }
}

/** Segment wyboru: [{id, etykieta}] */
export function segment(opcje, aktywna, atrybut, etykieta = '') {
  return `<div class="segment" role="group"${etykieta ? ` aria-label="${esc(etykieta)}"` : ''}>
    ${opcje.map((o) => `<button type="button" data-${atrybut}="${esc(o.id)}" aria-pressed="${o.id === aktywna}"${o.wylaczona ? ' disabled' : ''}>${esc(o.etykieta)}</button>`).join('')}
  </div>`;
}

/** Krótki komunikat na dole ekranu (np. „Zapisano”). */
export function komunikat(tekst) {
  let el = $('#komunikat');
  if (!el) {
    el = document.createElement('div');
    el.id = 'komunikat';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  el.textContent = tekst;
  el.classList.add('widoczny');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('widoczny'), 2200);
}
