@echo off
chcp 65001 >nul
echo ======================================
echo RAILWAY VOLUME SETUP SCRIPT
echo ======================================
echo.
echo Bu script Railway volume kurulumu için hazırlanmıştır.
echo.
echo YAPILACAKLAR:
echo 1. Railway Dashboard'a git: https://railway.com/dashboard
echo 2. olsnyr projesini seç
echo 3. Volumes sekmesine git
echo 4. "Add Volume" butonuna tıkla
echo 5. Mount Path: /data olarak ayarla
echo 6. Create'e tıkla
echo.
echo Manuel adımlar tamamlandıktan sonra ENTER'a bas...
pause >nul

echo.
echo Railway CLI ile bağlantı kontrol ediliyor...
railway status

echo.
echo Volume listesi kontrol ediliyor...
railway volume list

echo.
echo ======================================
echo KURULUM TAMAMLANDI
echo ======================================
echo.
echo SQL dosyalarını yüklemek için:
echo 1. Railway Dashboard ^> olsnyr ^> Volumes
echo 2. Shell/Terminal aç
echo 3. cd /data
echo 4. curl -L [DOSYA_LINKI] -o zagros.sql
echo.
pause
