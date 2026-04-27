# Zagros OSINT Tool

Discord OSINT aracı - kullanıcı bilgilerini çoklu kaynaklardan sorgular.

## Özellikler

- **Discord ID Sorgu** — TXT, SQL ve FindCord API ile detaylı profil
- **Email Sorgu** — HaveIBeenPwned, Gravatar, EmailRep, GitHub
- **IP Sorgu** — Geoip konum + harita görüntüleme
- **Sunucu Sorgu** — Guild üyeleri, konum haritası
- **Admin Panel** — Ziyaretçi takibi, abonelik yönetimi

## Kurulum

```bash
npm install
node server.js
```

Server başlarken SQL/TXT veri dosyaları yoksa otomatik olarak Google Drive'dan indirilir.

## Ortam Değişkenleri (opsiyonel)

| Değişken | Açıklama | Varsayılan |
|----------|----------|------------|
| `PORT` | Server portu | `5178` |
| `HOST` | Bind adresi | `127.0.0.1` |
| `ZAGROS_PASSWORD` | Admin şifresi | `zagros31ceyn` |
| `ADMIN_ID` | Admin kullanıcı adı | `admin` |
| `ADMIN_PASSWORD` | Admin panel şifresi | `admin123` |

## Deployment

Railway, Render veya herhangi bir Node.js platformunda çalışır.
Veri dosyaları ilk çalıştırmada otomatik indirilir.
