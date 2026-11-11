// Połączenie z Supabase bez dodatkowych bibliotek: logowanie, zapytania do bazy, pliki (przepisy, zdjęcia).
// Sesja (bilet logowania) jest trzymana w pamięci tej aplikacji w telefonie – hasło nigdzie się nie zapisuje.
import { CHMURA } from './konfiguracja.js';

export const trybChmury = () => Boolean(CHMURA.url && CHMURA.klucz);

const KLUCZ_SESJI = 'dieta-sesja';
let sesja = czytajSesje();

function czytajSesje() {
  try { return JSON.parse(localStorage.getItem(KLUCZ_SESJI)); } catch { return null; }
}
function zapiszSesje(s) {
  sesja = s;
  try { if (s) localStorage.setItem(KLUCZ_SESJI, JSON.stringify(s)); else localStorage.removeItem(KLUCZ_SESJI); } catch { /* tryb prywatny */ }
}

export const zalogowany = () => Boolean(sesja?.refresh_token);
export const uzytkownik = () => sesja?.user || null;

export class BladChmury extends Error {
  constructor(wiadomosc, status = 0) { super(wiadomosc); this.status = status; }
}

const TLUMACZENIA = {
  'Invalid login credentials': 'Zły e-mail lub hasło.',
  'Email not confirmed': 'Ten e-mail nie jest jeszcze potwierdzony.',
};

async function auth(rodzaj, dane) {
  let r;
  try {
    r = await fetch(`${CHMURA.url}/auth/v1/token?grant_type=${rodzaj}`, {
      method: 'POST',
      headers: { apikey: CHMURA.klucz, 'Content-Type': 'application/json' },
      body: JSON.stringify(dane),
    });
  } catch {
    throw new BladChmury('Brak połączenia z internetem.', 0);
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const tekst = j.error_description || j.msg || j.message || '';
    throw new BladChmury(TLUMACZENIA[tekst] || tekst || `Błąd logowania (${r.status}).`, r.status);
  }
  zapiszSesje({
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600),
    user: { id: j.user?.id, email: j.user?.email },
  });
  return sesja;
}

export const zaloguj = (email, haslo) => auth('password', { email, password: haslo });

export function wyloguj() {
  const t = sesja?.access_token;
  zapiszSesje(null);
  if (t) fetch(`${CHMURA.url}/auth/v1/logout`, { method: 'POST', headers: { apikey: CHMURA.klucz, Authorization: `Bearer ${t}` } }).catch(() => {});
}

let odswiezanie = null;
async function bilet() {
  if (!sesja) throw new BladChmury('Nie jesteś zalogowany.', 401);
  if (sesja.expires_at - 60 > Date.now() / 1000) return sesja.access_token;
  odswiezanie ||= auth('refresh_token', { refresh_token: sesja.refresh_token })
    .catch((e) => {
      // 400/401 = logowanie wygasło albo zostało cofnięte; brak sieci (0) nie wylogowuje
      if (e.status === 400 || e.status === 401) { zapiszSesje(null); window.dispatchEvent(new Event('dieta-wylogowano')); }
      throw e;
    })
    .finally(() => { odswiezanie = null; });
  return (await odswiezanie).access_token;
}

/** Zapytanie do Supabase jako zalogowany użytkownik. Zwraca Response (rzuca BladChmury przy błędzie). */
export async function zapytanie(sciezka, opcje = {}) {
  const t = await bilet();
  let r;
  try {
    r = await fetch(`${CHMURA.url}${sciezka}`, {
      ...opcje,
      headers: { apikey: CHMURA.klucz, Authorization: `Bearer ${t}`, ...(opcje.headers || {}) },
    });
  } catch {
    throw new BladChmury('Brak połączenia z internetem.', 0);
  }
  if (!r.ok) {
    const tekst = await r.text().catch(() => '');
    throw new BladChmury(`Serwer: ${r.status} ${tekst.slice(0, 200)}`, r.status);
  }
  return r;
}

/** Plik z prywatnego schowka „dane” (baza.json, wersja.json, img/…). */
export const pobierzPlik = (sciezka) => zapytanie(`/storage/v1/object/authenticated/dane/${sciezka}`, { cache: 'no-store' });

/** Która osoba z planu odpowiada zalogowanemu kontu (tabela domownicy). null = konto bez dostępu. */
export async function mojaOsoba() {
  const r = await zapytanie(`/rest/v1/domownicy?select=osoba&user_id=eq.${encodeURIComponent(uzytkownik().id)}`);
  const w = await r.json();
  return w[0]?.osoba || null;
}
