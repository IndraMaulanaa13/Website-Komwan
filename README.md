# Website-Komwan

Dalam project ini kami membuat aplikasi gacha atau judi online bertujuan untuk mengetahui bagaimana sistem judi onlne sebenarnya bekerja. Sekaligus dapat mengedukasi bahwa berapapun kita menggunakan uang untuk mendapatkan keuntungan, bandar lah yang tetap mendapatkan keuntungan paling besar dan pengguna yang paling merugikan.

**Pembagian Tugas Project Website-Komwan :**  

#**Sulaiman Abhinaya Praditya_24083010041** - menggagas ide pembuatan judi online, menggagas dan merancang sistem game multiplayer dan landing page untuk 3 games, upload game ke VM Google CLoud, membantu perancangan website dari awal hingga akhir.  

#**Achmad Dany Gunawan_24083010075** - menggagas ide pembuatan judi online, menggagas dan merancang sistem game judi slot machine dan database judi online, mengembangkan game salah satu game yakni lucky slot, upload game ke VM Google Cloud, membantu perancangan website dari awal hingga akhir.  

#**Indra Maulana R.F.Y._24083010105** - menggagas ide pembuatan judi online, menggagas dan merancang game gacha kartu dan sistem game multiplayer, serta membuat loading page, upload game ke VM azure, membantu perancangan website dari awal hingga akhir.  

#**Irma liza_24083010118** - mengerjakan laporan executive summary


# BASIKAL GAMING

BASIKAL GAMING adalah portal game web vanilla HTML/CSS/JS dengan backend Node.js Express, Socket.IO, bcrypt, JWT, dan PostgreSQL. Frontend disajikan dari `public/`; backend berada di `server/`.

## Struktur Proyek

```text
public/
  index.html
  login.html
  shop.html
  Judol_Website.html
  gacha-kartu/
  cardbattle/
server/
  server.js
  storage.js
  deckUtils.js
  schema.sql
  data/
```

## Daftar Game

- Lucky Slot, halaman `Judol_Website.html`
- Gacha Kartu, folder `public/gacha-kartu/`
- Card Battle, folder `public/cardbattle/`
- Shop dan daily claim, halaman `shop.html`

## Menjalankan Lokal

```bash
cd server
npm install
npm start
```

Buka `http://localhost:3000`. Saat development tanpa `DATABASE_URL`, server memakai fallback JSON lokal di `server/data/local-store.json`.

## Production dan Azure

Untuk Azure App Service atau production lain, set environment variable berikut:

```bash
NODE_ENV=production
DATABASE_URL=postgresql://user:password@host:5432/nama_database
JWT_SECRET=isi_dengan_secret_panjang
ALLOWED_ORIGIN=https://nama-app.azurewebsites.net
```

`ALLOWED_ORIGIN` dapat berisi beberapa origin yang dipisahkan koma. Jangan deploy file `.env` atau `server/data/*.json`; pola itu sudah masuk `.gitignore`.

## Backend

API login/register menerbitkan JWT. Endpoint wallet memakai aksi server-side seperti shop exchange, gacha pull, slot spin, daily claim, dan Card Battle reward. Socket.IO memakai token dan origin allowlist.
