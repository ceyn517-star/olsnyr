# Railway SQL Upload Script
# PowerShell ile Railway Volume'a dosya yükleme

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "RAILWAY SQL DOSYA YÜKLEME SCRIPTI" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Dosyaları listele
$sqlFiles = @(
    "za.sql",
    "zagros.sql", 
    "zagros1.sql",
    "zagros2.sql",
    "zagros3.sql",
    "zagros4.sql",
    "zagros5.sql",
    "zagros6.sql",
    "zagrs.sql"
)

$txtFiles = @("dcıdsorgudata.txt")

Write-Host "YÜKLENECEK DOSYALAR:" -ForegroundColor Yellow
Write-Host ""

foreach ($file in $sqlFiles) {
    if (Test-Path $file) {
        $size = (Get-Item $file).Length / 1MB
        Write-Host "  ✅ $file - $([math]::Round($size, 2)) MB" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $file - BULUNAMADI" -ForegroundColor Red
    }
}

foreach ($file in $txtFiles) {
    if (Test-Path $file) {
        $size = (Get-Item $file).Length / 1MB
        Write-Host "  ✅ $file - $([math]::Round($size, 2)) MB" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $file - BULUNAMADI" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "YÜKLEME SEÇENEKLERI:" -ForegroundColor Yellow
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Git LFS + GitHub (Önerilen)" -ForegroundColor Green
Write-Host "   - Dosyalar GitHub'a yüklenir" -ForegroundColor Gray
Write-Host "   - Railway otomatik çeker" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Railway Dashboard Manuel Upload" -ForegroundColor Yellow
Write-Host "   - Dashboard'dan dosya upload" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Şu Anki Durum (Google Drive)" -ForegroundColor Cyan
Write-Host "   - Dosyalar şu anda indiriliyor" -ForegroundColor Gray
Write-Host "   - Bazıları başarısız olabilir" -ForegroundColor Gray
Write-Host ""

$choice = Read-Host "Seçiminiz (1/2/3)"

switch ($choice) {
    "1" {
        Write-Host ""
        Write-Host "Git LFS Kurulumu başlatılıyor..." -ForegroundColor Cyan
        Write-Host ""
        
        # Git LFS kontrol
        $gitLfs = Get-Command git-lfs -ErrorAction SilentlyContinue
        if (-not $gitLfs) {
            Write-Host "Git LFS bulunamadı. Yükleniyor..." -ForegroundColor Yellow
            git lfs install
        }
        
        # Git LFS track
        git lfs track "*.sql"
        git lfs track "*.txt"
        
        # Dosyaları ekle
        git add .gitattributes
        
        foreach ($file in $sqlFiles + $txtFiles) {
            if (Test-Path $file) {
                git add $file
                Write-Host "  ✅ $file eklendi" -ForegroundColor Green
            }
        }
        
        # Commit
        git commit -m "Add SQL database files via Git LFS"
        
        Write-Host ""
        Write-Host "GitHub'a push için hazır." -ForegroundColor Yellow
        $push = Read-Host "Şimdi push yapılsın mı? (E/H)"
        
        if ($push -eq "E" -or $push -eq "e") {
            git push origin main
            Write-Host "✅ Dosyalar GitHub'a yüklendi!" -ForegroundColor Green
            Write-Host "Railway otomatik olarak çekecek." -ForegroundColor Cyan
        }
    }
    
    "2" {
        Write-Host ""
        Write-Host "Railway Dashboard Manuel Upload" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Adımlar:" -ForegroundColor Yellow
        Write-Host "1. https://railway.com/dashboard git" -ForegroundColor White
        Write-Host "2. olsnyr projesini seç" -ForegroundColor White
        Write-Host "3. 'Volumes' sekmesine tıkla" -ForegroundColor White
        Write-Host "4. 'Add Volume' butonuna tıkla" -ForegroundColor White
        Write-Host "5. Mount Path: /data gir" -ForegroundColor White
        Write-Host "6. 'Create' butonuna tıkla" -ForegroundColor White
        Write-Host ""
        Write-Host "Volume oluşturulduktan sonra:" -ForegroundColor Yellow
        Write-Host "1. Volume üzerine tıkla" -ForegroundColor White
        Write-Host "2. 'Shell' veya 'Console' aç" -ForegroundColor White
        Write-Host "3. cd /data" -ForegroundColor White
        Write-Host "4. curl -L [URL] -o zagros.sql" -ForegroundColor White
        Write-Host ""
        
        Start-Process "https://railway.com/project/03a56943-dd53-416a-a3d1-a0af90819c30"
    }
    
    "3" {
        Write-Host ""
        Write-Host "Şu anki durum korunuyor..." -ForegroundColor Cyan
        Write-Host "Google Drive'dan indirme devam ediyor." -ForegroundColor Gray
        Write-Host ""
        Write-Host "Not: Bazı dosyalar indirilemeyebilir." -ForegroundColor Yellow
        Write-Host "Başarısız olursa Option 1 veya 2 kullanın." -ForegroundColor Yellow
    }
    
    default {
        Write-Host "Geçersiz seçim!" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "SCRIPT TAMAMLANDI" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Cyan

Pause
