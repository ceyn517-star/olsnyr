/**
 * Zagros Data Importer
 * SQL dumps + TXT dosyasını PostgreSQL veritabanına aktarır
 * 
 * Kullanım:
 *   DATABASE_URL=postgresql://user:pass@host:5432/dbname node import_data.js
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL ortam değişkeni gerekli!');
  console.error('Örnek: DATABASE_URL=postgresql://user:pass@host:5432/dbname node import_data.js');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1')
    ? false
    : { rejectUnauthorized: false }
});

// Data directory
const DATA_DIR = __dirname;

// ============= SCHEMA =============
async function createSchema() {
  console.log('📦 Tablo yapısı oluşturuluyor...');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      discord_id VARCHAR(20) NOT NULL,
      username VARCHAR(100),
      discriminator VARCHAR(10),
      email VARCHAR(255),
      avatar_hash VARCHAR(255),
      registration_ip VARCHAR(45),
      last_ip VARCHAR(45),
      phone VARCHAR(30),
      bio TEXT,
      premium VARCHAR(20),
      verified VARCHAR(10),
      connections JSONB DEFAULT '[]',
      source VARCHAR(100),
      created_at TIMESTAMP,
      last_login TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_guilds (
      id SERIAL PRIMARY KEY,
      discord_id VARCHAR(20) NOT NULL,
      guild_id VARCHAR(20) NOT NULL,
      source VARCHAR(100)
    );

    CREATE TABLE IF NOT EXISTS query_logs (
      id SERIAL PRIMARY KEY,
      discord_id VARCHAR(20),
      email VARCHAR(255),
      ip VARCHAR(45),
      username VARCHAR(100),
      avatar_hash VARCHAR(255),
      connections JSONB DEFAULT '[]',
      response_data JSONB,
      source VARCHAR(100)
    );

    CREATE TABLE IF NOT EXISTS guild_cache (
      guild_id VARCHAR(20) PRIMARY KEY,
      name VARCHAR(255),
      icon VARCHAR(255),
      banner VARCHAR(255),
      description TEXT,
      updated_at TIMESTAMP DEFAULT NOW()
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_users_discord_id ON users(discord_id);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_reg_ip ON users(registration_ip);
    CREATE INDEX IF NOT EXISTS idx_users_last_ip ON users(last_ip);
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_user_guilds_discord_id ON user_guilds(discord_id);
    CREATE INDEX IF NOT EXISTS idx_user_guilds_guild_id ON user_guilds(guild_id);
    CREATE INDEX IF NOT EXISTS idx_query_logs_discord_id ON query_logs(discord_id);
    CREATE INDEX IF NOT EXISTS idx_query_logs_email ON query_logs(email);
    CREATE INDEX IF NOT EXISTS idx_query_logs_ip ON query_logs(ip);
  `);
  console.log('✅ Tablolar oluşturuldu');
}

// ============= HELPERS =============
function decodeBase64Maybe(val) {
  if (!val || typeof val !== 'string') return val;
  if (val.includes('@') || val.includes(' ')) return val;
  if (/^[A-Za-z0-9+/]+=*$/.test(val) && val.length > 10) {
    try {
      const decoded = Buffer.from(val, 'base64').toString('utf8');
      if (decoded.includes('@') && decoded.includes('.')) return decoded;
    } catch {}
  }
  return val;
}

function safeJsonParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}

function parseConnections(raw) {
  if (!raw || raw === '[]' || raw === 'null') return [];
  const parsed = safeJsonParse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    return Object.entries(parsed).map(([app, detail]) => {
      let connId = '', nick = '';
      if (typeof detail === 'string') nick = detail;
      else if (typeof detail === 'object' && detail !== null) {
        const entries = Object.entries(detail);
        if (entries.length > 0) { connId = String(entries[0][0]); nick = String(entries[0][1]); }
      }
      return { app, id: connId, name: nick };
    });
  }
  return [];
}

// ============= IMPORT TXT (JSON) =============
async function importTxtFile() {
  const txtPath = path.join(DATA_DIR, 'dcıdsorgudata.txt');
  if (!fs.existsSync(txtPath)) {
    const alt = path.join(DATA_DIR, 'dcidsorgudata.txt');
    if (!fs.existsSync(alt)) { console.log('⚠️ TXT dosyası bulunamadı'); return 0; }
  }
  const filePath = fs.existsSync(path.join(DATA_DIR, 'dcıdsorgudata.txt'))
    ? path.join(DATA_DIR, 'dcıdsorgudata.txt')
    : path.join(DATA_DIR, 'dcidsorgudata.txt');

  console.log(`\n📄 TXT dosyası okunuyor: ${path.basename(filePath)}`);
  
  let data;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    data = JSON.parse(content);
  } catch (err) {
    console.error('❌ TXT parse hatası:', err.message);
    return 0;
  }

  const users = data.users || data;
  if (!Array.isArray(users)) {
    console.error('❌ TXT formatı beklenmiyor');
    return 0;
  }

  console.log(`   ${users.length} kullanıcı bulundu`);
  let count = 0;
  const batchSize = 500;

  for (let i = 0; i < users.length; i += batchSize) {
    const batch = users.slice(i, i + batchSize);
    const values = [];
    const params = [];
    let paramIdx = 1;

    for (const u of batch) {
      values.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`);
      params.push(
        u.discord_id || null,
        u.username || null,
        u.discriminator || null,
        u.email || null,
        u.avatar_hash || null,
        u.registration_ip || null,
        u.last_ip || null,
        'txt',
        u.created_at || null,
        u.last_login || null
      );
    }

    if (values.length > 0) {
      await pool.query(
        `INSERT INTO users (discord_id, username, discriminator, email, avatar_hash, registration_ip, last_ip, source, created_at, last_login) VALUES ${values.join(',')}`,
        params
      );
      count += batch.length;
    }

    if ((i + batchSize) % 2000 === 0 || i + batchSize >= users.length) {
      process.stdout.write(`\r   ${Math.min(i + batchSize, users.length)}/${users.length} aktarıldı`);
    }
  }

  console.log(`\n✅ TXT: ${count} kayıt aktarıldı`);
  return count;
}

// ============= IMPORT SQL DUMP =============
async function importSqlFile(sqlPath) {
  if (!fs.existsSync(sqlPath)) return 0;
  const fileName = path.basename(sqlPath);
  console.log(`\n📂 SQL dosyası işleniyor: ${fileName}`);

  const rs = fs.createReadStream(sqlPath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: rs, crlfDelay: Infinity });

  let usersCount = 0;
  let queryLogsCount = 0;
  let detailCount = 0;
  let currentTable = null;
  let batch = [];
  const batchSize = 200;

  for await (const line of rl) {
    // Detect INSERT INTO table
    if (line.startsWith('INSERT INTO')) {
      if (line.includes('`users`') && !line.includes('`users_detail`')) {
        currentTable = 'users';
      } else if (line.includes('`users_detail`')) {
        currentTable = 'users_detail';
      } else if (line.includes('`query_logs`')) {
        currentTable = 'query_logs';
      } else {
        currentTable = null;
        continue;
      }
    }

    if (!currentTable) continue;

    // ===== USERS TABLE =====
    if (currentTable === 'users') {
      // Extract tuples: (id, 'discord_id', 'username', ...)
      const tuples = [...line.matchAll(/\((\d+),\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)'/g)];
      
      if (tuples.length === 0) {
        // Alternative: extract all quoted values
        const allVals = [...line.matchAll(/'([^']*)'/g)].map(m => m[1]);
        if (allVals.length >= 6 && /^\d{10,20}$/.test(allVals[0])) {
          const discord_id = allVals[0];
          const username = allVals[1] || null;
          const discriminator = allVals[2] || null;
          let email = allVals[3] || null;
          if (email) email = decodeBase64Maybe(email);
          const avatar_hash = allVals[4] || null;
          
          // Find IPs
          let reg_ip = null, last_ip = null;
          for (let vi = allVals.length - 1; vi >= 5; vi--) {
            if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(allVals[vi])) {
              if (!last_ip) last_ip = allVals[vi];
              else if (!reg_ip) reg_ip = allVals[vi];
            }
          }

          batch.push({ discord_id, username, discriminator, email, avatar_hash, reg_ip: reg_ip || last_ip, last_ip, source: fileName });
        }
      } else {
        for (const t of tuples) {
          const discord_id = t[2];
          const username = t[3];
          const discriminator = t[4];
          let email = t[5];
          if (email) email = decodeBase64Maybe(email);
          const avatar_hash = t[6];
          batch.push({ discord_id, username, discriminator, email, avatar_hash, reg_ip: null, last_ip: null, source: fileName });
        }
      }

      if (batch.length >= batchSize) {
        await flushUsersBatch(batch);
        usersCount += batch.length;
        batch = [];
        process.stdout.write(`\r   users: ${usersCount}`);
      }
    }

    // ===== USERS_DETAIL TABLE =====
    if (currentTable === 'users_detail') {
      // Format: (discord_id, 'email_or_base64', 'guilds_json', 'friends_json', 'connections_json', ...)
      // Extract tuples starting with a big number (discord_id)
      const detailPattern = /\((\d{10,20}),\s*'([^']*)'/g;
      let match;
      while ((match = detailPattern.exec(line)) !== null) {
        const discord_id = match[1];
        let email = decodeBase64Maybe(match[2]);
        
        // Extract all quoted values after this discord_id
        const startIdx = match.index;
        const endIdx = line.indexOf('),', startIdx);
        const segment = endIdx > 0 ? line.substring(startIdx, endIdx + 1) : line.substring(startIdx);
        
        const segVals = [...segment.matchAll(/'([^']*)'/g)].map(m => m[1]);
        
        // Parse guilds (typically 2nd quoted value - JSON array of guild IDs)
        let guilds = [];
        for (const v of segVals) {
          if (v.startsWith('[') && v.includes(',')) {
            const parsed = safeJsonParse(v);
            if (Array.isArray(parsed)) {
              // Check if these look like guild IDs (long numbers)
              const guildIds = parsed.filter(id => String(id).length >= 10);
              if (guildIds.length > guilds.length) guilds = guildIds;
            }
          }
        }

        // Parse connections (JSON object like {"spotify": {...}})
        let connections = [];
        for (const v of segVals) {
          if (v.startsWith('{') && v.includes(':')) {
            connections = parseConnections(v);
            if (connections.length > 0) break;
          }
        }

        // Find IP in segment
        let ip = null;
        for (const v of segVals) {
          if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(v)) { ip = v; break; }
          if (/^[0-9a-f]{1,4}(:[0-9a-f]{1,4}){2,7}$/i.test(v)) { ip = v; break; }
        }

        // Insert user data
        await pool.query(
          `INSERT INTO users (discord_id, email, last_ip, connections, source) VALUES ($1, $2, $3, $4, $5)`,
          [discord_id, email !== 'null' ? email : null, ip, JSON.stringify(connections), fileName + '_detail']
        );
        detailCount++;

        // Insert guild memberships
        if (guilds.length > 0) {
          const guildValues = [];
          const guildParams = [];
          let pi = 1;
          for (const gid of guilds) {
            guildValues.push(`($${pi++}, $${pi++}, $${pi++})`);
            guildParams.push(discord_id, String(gid), fileName);
          }
          await pool.query(
            `INSERT INTO user_guilds (discord_id, guild_id, source) VALUES ${guildValues.join(',')}`,
            guildParams
          );
        }
      }

      if (detailCount % 1000 === 0 && detailCount > 0) {
        process.stdout.write(`\r   users_detail: ${detailCount}`);
      }
    }

    // ===== QUERY_LOGS TABLE =====
    if (currentTable === 'query_logs') {
      // query_logs contains response_data JSON with discord user info
      const responseMatch = line.match(/"discord_id"\s*:\s*"(\d{10,20})"/);
      if (responseMatch) {
        const discord_id = responseMatch[1];
        
        // Extract fields from JSON
        const emailMatch = line.match(/"email"\s*:\s*"([^"]+)"/);
        const usernameMatch = line.match(/"username"\s*:\s*"([^"]+)"/);
        const ipMatch = line.match(/"ip"\s*:\s*"([^"]+)"/);
        const avatarMatch = line.match(/"avatar_hash"\s*:\s*"([^"]+)"/);

        let email = emailMatch ? decodeBase64Maybe(emailMatch[1]) : null;
        const username = usernameMatch ? usernameMatch[1] : null;
        let ip = ipMatch ? ipMatch[1] : null;
        const avatar_hash = avatarMatch ? avatarMatch[1] : null;

        // Skip hash IPs
        if (ip && /^[a-f0-9]{32}$/.test(ip)) ip = null;

        await pool.query(
          `INSERT INTO query_logs (discord_id, email, ip, username, avatar_hash, source) VALUES ($1, $2, $3, $4, $5, $6)`,
          [discord_id, email, ip, username, avatar_hash, fileName]
        );
        queryLogsCount++;

        if (queryLogsCount % 1000 === 0) {
          process.stdout.write(`\r   query_logs: ${queryLogsCount}`);
        }
      }
    }
  }

  // Flush remaining users batch
  if (batch.length > 0) {
    await flushUsersBatch(batch);
    usersCount += batch.length;
  }

  rl.close();
  rs.close();

  console.log(`\n✅ ${fileName}: users=${usersCount} detail=${detailCount} query_logs=${queryLogsCount}`);
  return usersCount + detailCount + queryLogsCount;
}

async function flushUsersBatch(batch) {
  if (batch.length === 0) return;
  const values = [];
  const params = [];
  let pi = 1;

  for (const u of batch) {
    values.push(`($${pi++}, $${pi++}, $${pi++}, $${pi++}, $${pi++}, $${pi++}, $${pi++}, $${pi++})`);
    params.push(u.discord_id, u.username, u.discriminator, u.email, u.avatar_hash, u.reg_ip, u.last_ip, u.source);
  }

  await pool.query(
    `INSERT INTO users (discord_id, username, discriminator, email, avatar_hash, registration_ip, last_ip, source) VALUES ${values.join(',')}`,
    params
  );
}

// ============= DEDUPLICATE =============
async function deduplicateData() {
  console.log('\n🔄 Tekrar eden kayıtlar temizleniyor...');
  
  // Users tablosu - aynı discord_id + email + source olan duplicates sil
  const res = await pool.query(`
    DELETE FROM users a USING users b
    WHERE a.id < b.id 
      AND a.discord_id = b.discord_id 
      AND COALESCE(a.email,'') = COALESCE(b.email,'')
      AND COALESCE(a.source,'') = COALESCE(b.source,'')
  `);
  console.log(`   ${res.rowCount} duplicate user silindi`);

  // User guilds - aynı discord_id + guild_id
  const res2 = await pool.query(`
    DELETE FROM user_guilds a USING user_guilds b
    WHERE a.id < b.id 
      AND a.discord_id = b.discord_id 
      AND a.guild_id = b.guild_id
  `);
  console.log(`   ${res2.rowCount} duplicate guild membership silindi`);
}

// ============= STATS =============
async function printStats() {
  const users = await pool.query('SELECT COUNT(*) as cnt FROM users');
  const guilds = await pool.query('SELECT COUNT(DISTINCT guild_id) as cnt FROM user_guilds');
  const guildMembers = await pool.query('SELECT COUNT(*) as cnt FROM user_guilds');
  const logs = await pool.query('SELECT COUNT(*) as cnt FROM query_logs');
  const emails = await pool.query('SELECT COUNT(*) as cnt FROM users WHERE email IS NOT NULL AND email != \'\'');
  const ips = await pool.query('SELECT COUNT(*) as cnt FROM users WHERE (registration_ip IS NOT NULL OR last_ip IS NOT NULL)');

  console.log('\n📊 Veritabanı İstatistikleri:');
  console.log(`   Toplam kullanıcı kayıtları: ${users.rows[0].cnt}`);
  console.log(`   Email'li kayıtlar: ${emails.rows[0].cnt}`);
  console.log(`   IP'li kayıtlar: ${ips.rows[0].cnt}`);
  console.log(`   Benzersiz guild: ${guilds.rows[0].cnt}`);
  console.log(`   Guild üyelikleri: ${guildMembers.rows[0].cnt}`);
  console.log(`   Query log kayıtları: ${logs.rows[0].cnt}`);
}

// ============= MAIN =============
async function main() {
  console.log('🦁 Zagros Data Importer');
  console.log('========================\n');

  try {
    await pool.query('SELECT 1');
    console.log('✅ Veritabanı bağlantısı başarılı');
  } catch (err) {
    console.error('❌ Veritabanı bağlantısı başarısız:', err.message);
    process.exit(1);
  }

  await createSchema();

  let totalRecords = 0;

  // 1. TXT dosyası
  totalRecords += await importTxtFile();

  // 2. SQL dosyaları
  const sqlFiles = ['za.sql', 'zagros.sql', 'zagrs.sql'];
  for (const sqlFile of sqlFiles) {
    const sqlPath = path.join(DATA_DIR, sqlFile);
    if (fs.existsSync(sqlPath)) {
      totalRecords += await importSqlFile(sqlPath);
    } else {
      console.log(`⚠️ ${sqlFile} bulunamadı, atlanıyor`);
    }
  }

  // 3. Deduplicate
  await deduplicateData();

  // 4. Stats
  await printStats();

  console.log(`\n🎉 Toplam ${totalRecords} kayıt işlendi`);
  console.log('\n💡 Artık server.js DATABASE_URL ile çalışabilir!');

  await pool.end();
}

main().catch(err => {
  console.error('❌ Fatal hata:', err);
  process.exit(1);
});
