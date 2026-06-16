# BASIKAL GAMING Server

Backend BASIKAL GAMING memakai Express 4, Socket.IO 4, bcrypt, JWT, dan PostgreSQL dengan fallback JSON lokal untuk development. Server menangani auth, wallet, daily claim, shop exchange, gacha debit, slot spin, dan multiplayer Card Battle.

## Cara Jalankan Lokal

1. Install Node.js.
2. Buka terminal di folder `server/`.

```bash
cd server
npm install
npm start
```

3. Server berjalan di `http://localhost:3000`.
4. Buka frontend dari route root server, lalu login dan pilih game.

## Database

Server memilih penyimpanan otomatis:

- Jika `DATABASE_URL` ada, server memakai PostgreSQL.
- Jika `DATABASE_URL` kosong saat development, server memakai `server/data/local-store.json`.
- Jika `NODE_ENV=production`, `DATABASE_URL`, `JWT_SECRET`, dan `ALLOWED_ORIGIN` wajib diisi.

Cek mode penyimpanan:

```bash
curl http://localhost:3000/api/health
```

Respons production yang aman:

```json
{
  "success": true,
  "storage": "postgres",
  "databaseConfigured": true
}
```

## Azure App Service

1. Gunakan runtime Node.js 18 atau lebih baru.
2. Deploy folder `server/` sebagai aplikasi Node.
3. Set App Settings:

```bash
NODE_ENV=production
PORT=8080
DATABASE_URL=postgresql://user:password@host:5432/nama_database
JWT_SECRET=isi_dengan_secret_panjang
ALLOWED_ORIGIN=https://nama-app.azurewebsites.net
```

4. Jalankan `npm start`.

## Konfigurasi

| Variabel | Default | Keterangan |
|---|---|---|
| `PORT` | `3000` | Port HTTP server. |
| `NODE_ENV` | `development` | Set `production` di Azure atau VM. |
| `DATABASE_URL` | kosong | PostgreSQL connection string. Wajib di production. |
| `JWT_SECRET` | dev fallback | Secret token login. Wajib di production. |
| `JWT_EXPIRES_IN` | `7d` | Masa berlaku token JWT. |
| `ALLOWED_ORIGIN` | localhost dev | Allowlist origin Socket.IO, pisahkan dengan koma. Wajib di production. |
| `ADMIN_USERNAME` | kosong | Username pertama yang akan diset sebagai admin saat register. |
| `ALLOW_LOCAL_DB_FALLBACK` | aktif di development | Jangan aktifkan di production kecuali benar-benar untuk testing. |

## Arsitektur

- Express menyajikan frontend dari folder `public/`.
- API auth dan wallet memakai JWT Bearer token.
- Wallet memakai endpoint aksi server-side, bukan update saldo mentah dari client.
- Card Battle multiplayer memakai Socket.IO dan deck utility bersama di `server/deckUtils.js`.
