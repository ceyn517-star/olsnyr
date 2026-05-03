# Railway Volume Setup Guide

## Volume Oluşturma ve Dosya Yükleme

### Adım 1: Railway Dashboard'da Volume Oluştur

1. Railway Dashboard'a git: https://railway.com/project/03a56943-dd53-416a-a3d1-a0af90819c30
2. **olsnyr** servisine tıkla
3. **Volumes** sekmesine git
4. **"Add Volume"** butonuna tıkla
5. Mount Path: `/data` olarak ayarla
6. **Create**'e tıkla

### Adım 2: Lokalden Dosyaları Yükle

PowerShell'de çalıştır:

```powershell
# Dosyaları listele
Get-ChildItem *.sql, *.txt | Select-Object Name, @{Name="SizeMB";Expression={[math]::Round($_.Length/1MB,2)}}

# Railway'e bağlan ve dosyaları kopyala
railway connect

# SSH ile bağlan
cd /data

# Her dosyayı tek tek yükle
# (Not: Railway CLI ile direkt upload sınırlı, bu yüzden Git LFS veya URL kullanacağız)
```

### Adım 3: Railway CLI ile Upload

```bash
# Terminalde çalıştır:
railway up

# Sonra SSH ile:
railway ssh
cd /data

# Dosyaları URL'den indir:
curl -L "https://raw.githubusercontent.com/ceyn517-star/olsnyr/main/zagros.sql" -o zagros.sql
# ... diğer dosyalar
```

### Adım 4: Railway.toml Yapılandırması

```toml
[deploy]
startCommand = "node server.js"
healthcheckPath = "/api/health"
restartPolicyType = "ON_FAILURE"

[volumes]
"/data" = "data"
```

## Alternatif: Git LFS ile Yükleme

### Git LFS Kurulumu:

```bash
# Git LFS'i aktif et
git lfs track "*.sql"
git lfs track "*.txt"

# Dosyaları ekle
git add .gitattributes
git add *.sql
git add *.txt

# Commit ve push
git commit -m "Add SQL database files via Git LFS"
git push origin main
```

## Railway'de Git LFS ile Deploy:

Railway otomatik olarak Git LFS dosyalarını çekecektir.

## Kontrol:

Volume oluşturulduktan sonra:

```bash
railway ssh
ls -la /data
```

Dosyalar görünmelidir.
