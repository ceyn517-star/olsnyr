# Railway SQL Dosya Yükleme Scripti
# PowerShell ile Railway'e dosya yükleme

$files = @(
    "za.sql",
    "zagros.sql",
    "zagros1.sql",
    "zagros2.sql", 
    "zagros3.sql",
    "zagros4.sql",
    "zagros5.sql",
    "zagros6.sql",
    "zagrs.sql",
    "dcıdsorgudata.txt"
)

Write-Host "Railway'e dosya yukleme basliyor..." -ForegroundColor Green

foreach ($file in $files) {
    if (Test-Path $file) {
        $size = (Get-Item $file).Length / 1MB
        Write-Host "Yukleniyor: $file ($([math]::Round($size,2)) MB)" -ForegroundColor Yellow
        
        # Railway CLI ile yükle
        railway add --volume /data/$file
    } else {
        Write-Host "Dosya bulunamadi: $file" -ForegroundColor Red
    }
}

Write-Host "Tamamlandi!" -ForegroundColor Green
