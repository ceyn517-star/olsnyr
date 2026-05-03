import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔍 LOCAL VERİ TARAMASI BAŞLATILIYOR...\n');

// Tüm SQL ve veritabanı dosyalarını bul
const sqlFiles = [];
const dbFiles = [];
const txtFiles = [];
const jsonFiles = [];

function scanDirectory(dir, depth = 0) {
  const maxDepth = 3;
  if (depth > maxDepth) return;
  
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        scanDirectory(fullPath, depth + 1);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        const lowerName = entry.name.toLowerCase();
        const baseName = path.basename(entry.name, ext).toLowerCase();
        
        // SQL dosyaları - TÜM .sql uzantılı dosyalar
        if (ext === '.sql') {
          const stats = fs.statSync(fullPath);
          sqlFiles.push({
            name: entry.name,
            path: fullPath,
            size: stats.size,
            sizeMB: (stats.size / 1024 / 1024).toFixed(2)
          });
        }
        // SQLite/DB dosyaları
        else if (ext === '.db' || ext === '.sqlite' || ext === '.sqlite3' || ext === '.db3') {
          const stats = fs.statSync(fullPath);
          dbFiles.push({
            name: entry.name,
            path: fullPath,
            size: stats.size,
            sizeMB: (stats.size / 1024 / 1024).toFixed(2)
          });
        }
        // TXT dosyaları - discord, data, id, z/za/zagros ile başlayanlar
        else if (ext === '.txt') {
          const isDataFile = lowerName.includes('discord') || 
                            lowerName.includes('data') || 
                            lowerName.includes('id') ||
                            lowerName.includes('sorgu') ||
                            /^z[a-z0-9]*/.test(baseName) ||
                            baseName.startsWith('zagros') ||
                            baseName.startsWith('dc');
          
          if (isDataFile) {
            const stats = fs.statSync(fullPath);
            txtFiles.push({
              name: entry.name,
              path: fullPath,
              size: stats.size,
              sizeMB: (stats.size / 1024 / 1024).toFixed(2),
              sizeKB: (stats.size / 1024).toFixed(2)
            });
          }
        }
        // JSON veri dosyaları
        else if (ext === '.json' && (lowerName.includes('data') || lowerName.includes('discord'))) {
          const stats = fs.statSync(fullPath);
          jsonFiles.push({
            name: entry.name,
            path: fullPath,
            size: stats.size,
            sizeMB: (stats.size / 1024 / 1024).toFixed(2)
          });
        }
      }
    }
  } catch (err) {
    console.log(`❌ Klasör okuma hatası ${dir}: ${err.message}`);
  }
}

// Taramayı başlat
scanDirectory(__dirname);

// Sonuçları göster
console.log('========================================');
console.log('📊 TARAMA SONUÇLARI');
console.log('========================================\n');

let totalSize = 0;

// SQL dosyaları
console.log(`📄 SQL DOSYALARI (${sqlFiles.length} adet):`);
if (sqlFiles.length > 0) {
  sqlFiles.sort((a, b) => a.name.localeCompare(b.name));
  sqlFiles.forEach((f, i) => {
    totalSize += parseFloat(f.sizeMB);
    console.log(`  ${i + 1}. ${f.name} (${f.sizeMB} MB)`);
  });
} else {
  console.log('  ❌ SQL dosyası bulunamadı');
}
console.log('');

// DB dosyaları
console.log(`🗄️  DB/SQLITE DOSYALARI (${dbFiles.length} adet):`);
if (dbFiles.length > 0) {
  dbFiles.forEach((f, i) => {
    totalSize += parseFloat(f.sizeMB);
    console.log(`  ${i + 1}. ${f.name} (${f.sizeMB} MB)`);
  });
} else {
  console.log('  ❌ DB dosyası bulunamadı');
}
console.log('');

// TXT dosyaları
console.log(`📝 TXT DOSYALARI (${txtFiles.length} adet):`);
if (txtFiles.length > 0) {
  txtFiles.forEach((f, i) => {
    const size = parseFloat(f.sizeMB) > 1 ? `${f.sizeMB} MB` : `${f.sizeKB} KB`;
    if (parseFloat(f.sizeMB) > 1) totalSize += parseFloat(f.sizeMB);
    console.log(`  ${i + 1}. ${f.name} (${size})`);
  });
} else {
  console.log('  ❌ TXT dosyası bulunamadı');
}
console.log('');

// JSON dosyaları
console.log(`📋 JSON DOSYALARI (${jsonFiles.length} adet):`);
if (jsonFiles.length > 0) {
  jsonFiles.forEach((f, i) => {
    totalSize += parseFloat(f.sizeMB);
    console.log(`  ${i + 1}. ${f.name} (${f.sizeMB} MB)`);
  });
} else {
  console.log('  ❌ JSON dosyası bulunamadı');
}
console.log('');

// Özet
const totalFiles = sqlFiles.length + dbFiles.length + txtFiles.length + jsonFiles.length;
console.log('========================================');
console.log('📦 ÖZET:');
console.log(`   Toplam Dosya: ${totalFiles} adet`);
console.log(`   Toplam Boyut: ${totalSize.toFixed(2)} MB`);
console.log('========================================');

// Dosya listelerini kaydet
const report = {
  scanDate: new Date().toISOString(),
  sqlFiles: sqlFiles.map(f => f.name),
  dbFiles: dbFiles.map(f => f.name),
  txtFiles: txtFiles.map(f => f.name),
  jsonFiles: jsonFiles.map(f => f.name),
  summary: {
    totalFiles,
    totalSql: sqlFiles.length,
    totalDb: dbFiles.length,
    totalTxt: txtFiles.length,
    totalJson: jsonFiles.length,
    totalSizeMB: parseFloat(totalSize.toFixed(2))
  }
};

fs.writeFileSync('data_scan_report.json', JSON.stringify(report, null, 2));
console.log('\n✅ Rapor kaydedildi: data_scan_report.json');
