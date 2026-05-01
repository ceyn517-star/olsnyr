#!/usr/bin/env node

// PostgreSQL veritabanı setup script'i
import pg from 'pg';
import fs from 'fs';
import path from 'path';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:HlvHKqvReutNpUaGNkZJQjOCbcoYJjVP@switchback.proxy.rlwy.net:36836/railway';

async function setupDatabase() {
  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('[Setup] Veritabanı bağlantısı kuruluyor...');

    // Zagros veritabanını oluştur
    await pool.query('CREATE DATABASE IF NOT EXISTS zagros');
    console.log('[Setup] ✓ Zagros veritabanı oluşturuldu');

    // Zagros veritabanına bağlan
    const zagrosPool = new pg.Pool({
      connectionString: DATABASE_URL.replace('/railway', '/zagros'),
      ssl: { rejectUnauthorized: false }
    });

    // Kullanıcı tablosunu oluştur
    await zagrosPool.query(`
      CREATE TABLE IF NOT EXISTS users (
        discord_id VARCHAR(20) PRIMARY KEY,
        username VARCHAR(100),
        email VARCHAR(255),
        avatar_hash VARCHAR(100),
        registration_ip VARCHAR(45),
        last_ip VARCHAR(45),
        phone VARCHAR(20),
        connections TEXT,
        source VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('[Setup] ✓ users tablosu oluşturuldu');

    // Guild tablosunu oluştur
    await zagrosPool.query(`
      CREATE TABLE IF NOT EXISTS guilds (
        id VARCHAR(20) PRIMARY KEY,
        name VARCHAR(200),
        icon_hash VARCHAR(100),
        banner_hash VARCHAR(100),
        member_count INTEGER,
        owner_id VARCHAR(20),
        source VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('[Setup] ✓ guilds tablosu oluşturuldu');

    // SQL dosyalarını dönüştür ve yükle
    const dataDir = './data';
    const sqlFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.sql'));

    for (const sqlFile of sqlFiles) {
      console.log(`[Setup] ${sqlFile} dönüştürülüyor...`);
      const sqlPath = path.join(dataDir, sqlFile);
      let content = fs.readFileSync(sqlPath, 'utf8');

      // MySQL syntax'ini PostgreSQL'e çevir
      content = content
        .replace(/`/g, '"')  // Backticks -> çift tırnak
        .replace(/INTO\s+`(\w+)`/g, 'INTO "$1"')  // Table names
        .replace(/INSERT\s+INTO/g, 'INSERT INTO')
        .replace(/VALUES\s*\(/g, 'VALUES (')
        .replace(/\\'/g, "''")  // Escape single quotes
        .replace(/\\n/g, '\\n')  // Handle newlines
        .replace(/USE\s+\w+;/g, '')  // Remove USE statements
        .replace(/--.*$/gm, '')  // Remove comments
        .replace(/;\s*$/gm, ';');  // Ensure semicolons

      // SQL statement'larını ayır ve çalıştır
      const statements = content
        .split(/;\s*\n/)
        .filter(stmt => stmt.trim() && !stmt.trim().startsWith('--'))
        .map(stmt => stmt.trim());

      for (const statement of statements) {
        if (statement && statement.length > 10) {
          try {
            await zagrosPool.query(statement);
          } catch (err) {
            console.warn(`[Setup] Statement skipped: ${err.message}`);
          }
        }
      }

      console.log(`[Setup] ✓ ${sqlFile} yüklendi`);
    }

    await zagrosPool.end();
    await pool.end();

    console.log('[Setup] ✅ Veritabanı kurulumu tamamlandı!');
    console.log('[Setup] Artık SQL dosyaları PostgreSQL formatında zagros veritabanında');

  } catch (error) {
    console.error('[Setup] Hata:', error.message);
    process.exit(1);
  }
}

setupDatabase();
