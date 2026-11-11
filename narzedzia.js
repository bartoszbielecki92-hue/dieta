// Drobne narzędzia wspólne dla wszystkich ekranów.

export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const pogrubienia = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
export const norm = (s) => String(s || '').toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '');

export const liczba = (x, max = 1) => Number(x).toLocaleString('pl-PL', { maximumFractionDigits: max });
export const gramy = (g) => (g == null ? '' : `${liczba(g < 10 ? Math.round(g * 10) / 10 : Math.round(g))} g`);
export const kcal = (k) => (k == null ? '? kcal' : `${Math.round(k)} kcal`);

export function odmiana(n, jeden, kilka, wiele) {
  if (n === 1) return jeden;
  const r10 = n % 10, r100 = n % 100;
  return r10 >= 2 && r10 <= 4 && (r100 < 12 || r100 > 14) ? kilka : wiele;
}

export const pamiec = {
  czytaj(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  zapisz(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* np. tryb prywatny */ } },
};

export const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  }));

// ---------------------------------------------------------------- daty (zawsze czas lokalny, format RRRR-MM-DD)
export function dzisISO() { return isoZ(new Date()); }
export function isoZ(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function zIso(iso) { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); }
export function dodajDni(iso, n) { const d = zIso(iso); d.setDate(d.getDate() + n); return isoZ(d); }
export function poniedzialek(iso) { const d = zIso(iso); const dz = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dz); return isoZ(d); }

const DNI = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
const DNI_KROTKO = ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'sb'];
const MIESIACE = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września',
  'października', 'listopada', 'grudnia'];

export function nazwaDnia(iso, { zDniem = true } = {}) {
  const d = zIso(iso);
  const dzis = dzisISO();
  const rel = iso === dzis ? 'Dzisiaj' : iso === dodajDni(dzis, 1) ? 'Jutro' : iso === dodajDni(dzis, -1) ? 'Wczoraj' : null;
  const tekst = `${d.getDate()} ${MIESIACE[d.getMonth()]}`;
  if (!zDniem) return tekst;
  const dzien = DNI[d.getDay()];
  return rel ? `${rel}, ${dzien} ${tekst}` : `${dzien[0].toUpperCase()}${dzien.slice(1)}, ${tekst}`;
}
export function dzienKrotko(iso) { return DNI_KROTKO[zIso(iso).getDay()]; }
export function dzienMiesiaca(iso) { return zIso(iso).getDate(); }

export function zakresDat(od, doo) {
  const a = zIso(od), b = zIso(doo);
  if (od === doo) return nazwaDnia(od, { zDniem: false });
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}–${b.getDate()} ${MIESIACE[b.getMonth()]}`;
  return `${a.getDate()} ${MIESIACE[a.getMonth()]} – ${b.getDate()} ${MIESIACE[b.getMonth()]}`;
}

const MIESIACE_KROTKO = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
/** "26 paź – 1 lis" albo "2–8 lis" */
export function zakresTygodnia(poniedzialekIso) {
  const a = zIso(poniedzialekIso), b = zIso(dodajDni(poniedzialekIso, 6));
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${b.getDate()} ${MIESIACE_KROTKO[b.getMonth()]}`
    : `${a.getDate()} ${MIESIACE_KROTKO[a.getMonth()]} – ${b.getDate()} ${MIESIACE_KROTKO[b.getMonth()]}`;
}
