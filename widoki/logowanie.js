// Ekran logowania (tylko w wersji z chmurą). Konta zakłada się w Supabase – w aplikacji nie ma rejestracji.
import { $, esc } from '../narzedzia.js';
import { zaloguj, wyloguj, mojaOsoba } from '../chmura.js';
import { ustawTytul } from '../ui.js';

/** Pokazuje formularz i czeka na udane logowanie. Zwraca osobę z planu ('bartosz' / 'katarzyna'). */
export function ekranLogowania(komunikat = '') {
  ustawTytul('Dieta');
  document.body.classList.add('bez-nawigacji');
  $('#widok').innerHTML = `
    <section class="karta logowanie">
      <h2>Zaloguj się</h2>
      <p class="uwaga">Plan, listy i przepisy są dostępne tylko dla Was dwojga.</p>
      <form id="logowanie" class="formularz" autocomplete="on">
        <label>E-mail<input name="email" type="email" autocomplete="username" inputmode="email" required autocapitalize="off" spellcheck="false"></label>
        <label>Hasło<input name="haslo" type="password" autocomplete="current-password" required></label>
        <p id="blad" class="blad"${komunikat ? '' : ' hidden'}>${esc(komunikat)}</p>
        <button type="submit" class="btn">Zaloguj</button>
      </form>
    </section>`;
  return new Promise((gotowe) => {
    const form = $('#logowanie');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button');
      const blad = (t) => { $('#blad').textContent = t; $('#blad').hidden = false; btn.disabled = false; btn.textContent = 'Zaloguj'; };
      btn.disabled = true; btn.textContent = 'Loguję…';
      try {
        await zaloguj(form.elements.email.value.trim(), form.elements.haslo.value);
        const osoba = await mojaOsoba();
        if (!osoba) { wyloguj(); return blad('To konto nie ma dostępu do planu. Dopisz je w Supabase (plik 2_domownicy.sql).'); }
        document.body.classList.remove('bez-nawigacji');
        gotowe(osoba);
      } catch (err) {
        blad(err.message);
      }
    });
    form.elements.email.focus();
  });
}
