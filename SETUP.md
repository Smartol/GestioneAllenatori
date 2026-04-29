# Guida all'attivazione — GS Calendario

## Cosa ti serve
- Un account GitHub (gratuito) → github.com
- Un account Supabase (gratuito) → supabase.com
- Un account Vercel (gratuito) → vercel.com
- Node.js installato sul tuo computer → nodejs.org (versione 18+)

---

## PASSO 1 — Crea il progetto su Supabase

1. Vai su https://supabase.com e crea un account
2. Clicca **New project**
3. Dai un nome (es. "gs-calendario"), scegli una password per il database, seleziona la regione **West EU (Ireland)**
4. Attendi ~2 minuti che il progetto si avvii

### Configura il database
5. Nel menu a sinistra clicca **SQL Editor**
6. Clicca **New query**
7. Copia e incolla tutto il contenuto del file `supabase/schema.sql`
8. Clicca **Run** (▶)
   → Dovresti vedere "Success. No rows returned"

### Crea il bucket per le immagini
9. Nel menu a sinistra clicca **Storage**
10. Clicca **New bucket**
11. Nome: `note-images`, lascia **Public** su OFF
12. Clicca **Save**

### Recupera le credenziali
13. Nel menu a sinistra clicca **Project Settings** → **API**
14. Copia questi due valori (ti serviranno dopo):
    - **Project URL** (es. https://xyzxyz.supabase.co)
    - **anon public** key (stringa lunga)

---

## PASSO 2 — Carica il codice su GitHub

1. Vai su https://github.com e crea un account (se non ce l'hai)
2. Clicca **New repository**, chiamalo `gs-calendario`, lascialo **Private**, clicca **Create**
3. Sul tuo computer, apri il terminale nella cartella del progetto (`gs-calendario`)
4. Esegui questi comandi:

```bash
git init
git add .
git commit -m "primo commit"
git branch -M main
git remote add origin https://github.com/TUO_USERNAME/gs-calendario.git
git push -u origin main
```
(sostituisci TUO_USERNAME con il tuo nome utente GitHub)

---

## PASSO 3 — Configura le variabili d'ambiente

1. Nella cartella del progetto, crea il file `.env.local` (copia da `.env.example`)
2. Inserisci i valori copiati da Supabase:

```
VITE_SUPABASE_URL=https://xyzxyz.supabase.co
VITE_SUPABASE_ANON_KEY=la-tua-anon-key
```

---

## PASSO 4 — Pubblica su Vercel

1. Vai su https://vercel.com e crea un account (puoi accedere con GitHub)
2. Clicca **Add New Project**
3. Seleziona il repository `gs-calendario` dalla lista
4. Nella sezione **Environment Variables** aggiungi:
   - `VITE_SUPABASE_URL` → il tuo Project URL
   - `VITE_SUPABASE_ANON_KEY` → la tua anon key
5. Clicca **Deploy**
6. Dopo ~1 minuto Vercel ti darà un URL tipo `gs-calendario.vercel.app`
   → L'app è online!

---

## PASSO 5 — Crea il primo amministratore

1. Torna su Supabase → **Authentication** → **Users**
2. Clicca **Invite user**
3. Inserisci la tua email e clicca **Send invite**
4. Controlla l'email e clicca il link per impostare la password
5. Ora aggiungi il tuo profilo come admin. Vai su **SQL Editor** e lancia:

```sql
-- Sostituisci l'UUID con quello che vedi in Authentication → Users
INSERT INTO public.profiles (id, full_name, role)
VALUES ('uuid-del-tuo-utente', 'Il Tuo Nome', 'admin');
```

---

## PASSO 6 — Invita gli altri utenti

Da dentro l'app (sezione Gestione → Allenatori) potrai invitare gli altri allenatori.
Oppure direttamente da Supabase → Authentication → Invite user.

---

## Test in locale (opzionale, prima del deploy)

```bash
cd gs-calendario
npm install
npm run dev
```
Apri http://localhost:5173

---

## Riepilogo costi
| Servizio | Piano | Costo |
|----------|-------|-------|
| Supabase | Free | 0€ |
| Vercel   | Hobby | 0€ |
| GitHub   | Free | 0€ |
| **Totale** | | **0€** |

Il piano gratuito di Supabase supporta fino a 50.000 utenti autenticati
e 1GB di storage per le immagini — più che sufficiente per una società sportiva.
