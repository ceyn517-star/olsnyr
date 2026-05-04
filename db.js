/**
 * Zagros Database Layer
 * SQLite ve PostgreSQL sorgu katmanı
 */

import Database from 'better-sqlite3';
import pg from 'pg';
import path from 'path';
import fs from 'fs';
const { Pool } = pg;

let db = null;
let pool = null;
let isPostgres = false;

// DATABASE_URL kontrolü - PostgreSQL mi SQLite mı?
const DATABASE_URL = process.env.DATABASE_URL || './zagros.db';

export function initDB(databasePath) {
  // PostgreSQL connection string mi kontrol et
  if (DATABASE_URL.startsWith('postgresql://') || DATABASE_URL.startsWith('postgres://')) {
    return initPostgreSQL(DATABASE_URL);
  }
  // SQLite
  return initSQLite(databasePath || DATABASE_URL);
}

function initPostgreSQL(connectionString) {
  try {
    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false }
    });
    isPostgres = true;
    console.log('[DB] PostgreSQL bağlantısı kuruldu');
    
    // Test connection
    pool.query('SELECT NOW()', (err, res) => {
      if (err) {
        console.error('[DB] PostgreSQL test hatası:', err.message);
      } else {
        console.log('[DB] PostgreSQL bağlantısı aktif');
      }
    });
    
    return pool;
  } catch (err) {
    console.error('[DB] PostgreSQL bağlantı hatası:', err.message);
    // Fallback to SQLite
    console.log('[DB] SQLite\'a fallback yapılıyor...');
    return initSQLite('./zagros.db');
  }
}

function initSQLite(databasePath) {
  try {
    const dir = path.dirname(databasePath);
    if (dir && dir !== '.' && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    db = new Database(databasePath);
    db.pragma('journal_mode = WAL');
    isPostgres = false;
    console.log('[DB] SQLite bağlantısı kuruldu:', databasePath);
    return db;
  } catch (err) {
    console.error('[DB] SQLite bağlantı hatası:', err.message);
    return null;
  }
}

export function getPool() { return isPostgres ? pool : db; }
export function isDBReady() { return isPostgres ? !!pool : !!db; }
export function isPostgreSQL() { return isPostgres; }

/** Parametreli sorgu ($1, $2, …). Yalnız PostgreSQL; bulkLoad / seed için. */
export async function runQuery(text, params = []) {
  if (!isPostgres || !pool) {
    throw new Error('runQuery requires PostgreSQL (DATABASE_URL postgres://...)');
  }
  return pool.query(text, params);
}

// SQL exec fonksiyonu - PostgreSQL veya SQLite
export async function execSql(sql) {
  if (isPostgres && pool) {
    try {
      await pool.query(sql);
      return { success: true };
    } catch (err) {
      throw err;
    }
  }
  
  if (!db) throw new Error('Database not initialized');
  try {
    db.exec(sql);
    return { success: true };
  } catch (err) {
    throw err;
  }
}

// ============= DISCORD ID İLE ARAMA =============
export async function dbSearchByDiscordId(discordId) {
  const needle = String(discordId);
  
  // PostgreSQL mod
  if (isPostgres && pool) {
    try {
      // 🛠️ Dinamik kolon seçimi - mevcut kolonları kontrol et
      const columnRes = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'users'
      `);
      const columns = columnRes.rows.map(r => r.column_name);
      
      // Mevcut kolonlara göre SELECT oluştur
      const selectCols = ['id', 'user_id', 'discord_id', 'username', 'email', 'ip_address', 'location', 'nickname', 'avatar_hash', 'banner_hash']
        .filter(col => columns.includes(col))
        .join(', ');
      
      // Discord ID arama - user_id veya discord_id kolonunda ara
      let usersRes;
      
      // Önce discord_id kolonunda dene
      if (columns.includes('discord_id')) {
        usersRes = await pool.query(
          `SELECT ${selectCols || '*'} FROM users WHERE discord_id = $1 LIMIT 50`,
          [needle]
        );
      }
      
      // Sonuç yoksa user_id kolonunda dene (numeric olarak)
      if ((!usersRes || usersRes.rows.length === 0) && columns.includes('user_id')) {
        usersRes = await pool.query(
          `SELECT ${selectCols || '*'} FROM users WHERE user_id = $1::bigint LIMIT 50`,
          [needle]
        );
      }
      
      // ID kolonunda dene
      if ((!usersRes || usersRes.rows.length === 0) && columns.includes('id')) {
        usersRes = await pool.query(
          `SELECT ${selectCols || '*'} FROM users WHERE id = $1::bigint LIMIT 50`,
          [needle]
        );
      }
      
      if (!usersRes || usersRes.rows.length === 0) {
        return [];
      }
      
      return usersRes.rows.map(row => ({
        discord_id: row.discord_id || row.user_id || row.id,
        username: row.username || row.nickname,
        email: row.email,
        ip: row.ip_address || row.location,
        avatar_hash: row.avatar_hash,
        banner_hash: row.banner_hash,
        source: 'database'
      }));
    } catch (err) {
      console.warn('[DB] PostgreSQL Discord ID search error:', err.message);
      return [];
    }
  }
  
  // SQLite mod
  if (!db) return [];
  
  try {
    const usersStmt = db.prepare(
      `SELECT discord_id, username, email, avatar_hash, 
              registration_ip, last_ip, phone, connections, source
       FROM users WHERE discord_id = ? LIMIT 50`
    );
    const userRows = usersStmt.all(needle);
    
    const guildsStmt = db.prepare(
      `SELECT g.guild_id, g.guild_name, g.guild_icon, g.guild_banner
       FROM user_guilds ug
       JOIN guilds g ON ug.guild_id = g.guild_id
       WHERE ug.discord_id = ? LIMIT 100`
    );
    const guildsRows = guildsStmt.all(needle);
    
    return userRows.map(row => ({
      discord_id: row.discord_id,
      username: row.username,
      email: row.email,
      ip: row.registration_ip || row.last_ip,
      avatar_hash: row.avatar_hash,
      connections_apps: typeof row.connections === 'string' ? JSON.parse(row.connections || '[]') : [],
      source: row.source || 'database',
      guilds: guildsRows.map(g => ({
        id: g.guild_id,
        name: g.guild_name,
        icon: g.guild_icon,
        banner: g.guild_banner,
      }))
    }));
  } catch (err) {
    console.warn('[DB] Discord ID search error:', err.message);
    return [];
  }
}

// ============= GUILD'LER - Discord ID ile =============
export async function dbGetUserGuilds(discordId) {
  if (!db) return [];
  try {
    const stmt = db.prepare(`SELECT DISTINCT guild_id FROM user_guilds WHERE discord_id = ?`);
    const rows = stmt.all(String(discordId));
    return rows.map(r => r.guild_id);
  } catch (err) {
    console.warn('[DB] Get user guilds error:', err.message);
    return [];
  }
}

// ============= EMAIL İLE ARAMA =============
export async function dbSearchByEmail(email) {
  if (!db) return [];
  const needle = String(email).toLowerCase();

  try {
    // users tablosunda email ile ara
    const usersStmt = db.prepare(
      `SELECT discord_id, username, discriminator, email, avatar_hash, 
              registration_ip, last_ip, phone, bio, premium, verified, 
              connections, source, created_at, last_login, mfa_enabled, 
              locale, nsfw_allowed, public_flags, flags, 
              high_quality, email_verified
       FROM users WHERE LOWER(email) = ? LIMIT 50`
    );
    const usersRows = usersStmt.all(needle);

    // query_logs tablosunda email ile ara
    const logsStmt = db.prepare(
      `SELECT discord_id, email, ip, username, avatar_hash, connections, source, created_at
       FROM query_logs WHERE LOWER(email) = ? LIMIT 50`
    );
    const logsRows = logsStmt.all(needle);

    const results = [];

    for (const row of usersRows) {
      results.push({
        discord_id: row.discord_id,
        username: row.username,
        discriminator: row.discriminator,
        email: row.email,
        ip: row.registration_ip || row.last_ip,
        registration_ip: row.registration_ip,
        last_ip: row.last_ip,
        avatar_hash: row.avatar_hash,
        bio: row.bio,
        premium: row.premium,
        verified: row.verified,
        phone: row.phone,
        mfa_enabled: row.mfa_enabled,
        locale: row.locale,
        nsfw_allowed: row.nsfw_allowed,
        public_flags: row.public_flags,
        flags: row.flags,
        high_quality: row.high_quality,
        email_verified: row.email_verified,
        created_at: row.created_at,
        last_login: row.last_login,
        connections_apps: typeof row.connections === 'string' ? JSON.parse(row.connections || '[]') : (row.connections || []),
        source: row.source || 'database'
      });
    }

    for (const row of logsRows) {
      if (!results.find(r => r.discord_id === row.discord_id)) {
        results.push({
          discord_id: row.discord_id,
          email: row.email,
          ip: row.ip,
          username: row.username,
          avatar_hash: row.avatar_hash,
          created_at: row.created_at,
          connections_apps: typeof row.connections === 'string' ? JSON.parse(row.connections || '[]') : (row.connections || []),
          source: row.source || 'query_logs'
        });
      }
    }

    return results;
  } catch (err) {
    console.warn('[DB] Email search error:', err.message);
    return [];
  }
}

// ============= IP İLE ARAMA =============
export async function dbSearchByIp(ip) {
  if (!db) return [];
  const needle = String(ip);

  try {
    const usersStmt = db.prepare(
      `SELECT discord_id, username, email, avatar_hash, registration_ip, last_ip, source
       FROM users 
       WHERE registration_ip = ? OR last_ip = ?
       LIMIT 100`
    );
    const usersRows = usersStmt.all(needle, needle);

    const logsStmt = db.prepare(
      `SELECT discord_id, email, ip, username, avatar_hash, source
       FROM query_logs WHERE ip = ? LIMIT 100`
    );
    const logsRows = logsStmt.all(needle);

    const results = [];
    for (const row of [...usersRows, ...logsRows]) {
      results.push({
        discord_id: row.discord_id,
        email: row.email,
        ip: row.ip || row.registration_ip || row.last_ip,
        username: row.username,
        avatar_hash: row.avatar_hash,
        source: row.source || 'database'
      });
    }
    return results;
  } catch (err) {
    console.warn('[DB] IP search error:', err.message);
    return [];
  }
}

// ============= GUILD ÜYELERI =============
export async function dbSearchGuildMembers(guildId) {
  if (!db) return [];

  try {
    // SQLite LATERAL JOIN desteklemez, subquery kullan
    const stmt = db.prepare(
      `SELECT ug.discord_id, u.username, u.email, u.avatar_hash, 
              u.registration_ip, u.last_ip, u.phone, u.connections, u.source
       FROM user_guilds ug
       LEFT JOIN users u ON u.discord_id = ug.discord_id
       WHERE ug.guild_id = ?
       LIMIT 500`
    );
    const rows = stmt.all(String(guildId));

    return rows.map(row => ({
      discord_id: row.discord_id,
      username: row.username,
      email: row.email,
      avatar_hash: row.avatar_hash,
      ip: row.registration_ip || row.last_ip,
      phone: row.phone,
      connections_apps: typeof row.connections === 'string' ? JSON.parse(row.connections || '[]') : (row.connections || []),
      source: row.source || 'database'
    }));
  } catch (err) {
    console.warn('[DB] Guild members error:', err.message);
    return [];
  }
}

// ============= TÜM GUILD'LER LİSTESİ =============
function mapGuildListRows(rows) {
  return (rows || []).map(row => ({
    id: row.guild_id,
    name: row.name || null,
    icon: row.icon || null,
    banner: row.banner || null,
    description: row.description || null,
    member_count: parseInt(row.member_count, 10),
    sample_member_ids: [],
    metadata_source: (row.name || row.icon || row.banner || row.description) ? 'database' : null,
    metadata_updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null
  }));
}

export async function dbGetAllGuilds(options = {}) {
  const {
    limit = 200,
    offset = 0,
    searchTerm = ''
  } = options;

  const limitVal = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500);
  const offsetVal = Math.max(parseInt(offset, 10) || 0, 0);

  if (isPostgres && pool) {
    try {
      const term = String(searchTerm || '').trim().toLowerCase();
      if (term) {
        const searchPattern = `%${term}%`;
        const listRes = await pool.query(
          `SELECT * FROM (
             SELECT ug.guild_id,
                    COUNT(DISTINCT ug.discord_id)::bigint AS member_count,
                    MAX(gc.name) AS name,
                    MAX(gc.icon) AS icon,
                    MAX(gc.banner) AS banner,
                    MAX(gc.description) AS description,
                    MAX(gc.updated_at) AS updated_at
             FROM user_guilds ug
             LEFT JOIN guild_cache gc ON gc.guild_id = ug.guild_id
             GROUP BY ug.guild_id
           ) t
           WHERE LOWER(COALESCE(t.name, '')) LIKE $1 OR LOWER(t.guild_id::text) LIKE $1
           ORDER BY t.member_count DESC
           LIMIT $2 OFFSET $3`,
          [searchPattern, limitVal, offsetVal]
        );
        const countRes = await pool.query(
          `SELECT COUNT(*)::bigint AS cnt FROM (
             SELECT ug.guild_id
             FROM user_guilds ug
             LEFT JOIN guild_cache gc ON gc.guild_id = ug.guild_id
             GROUP BY ug.guild_id
             HAVING LOWER(COALESCE(MAX(gc.name), '')) LIKE $1 OR LOWER(ug.guild_id::text) LIKE $1
           ) x`,
          [searchPattern]
        );
        return {
          guilds: mapGuildListRows(listRes.rows),
          total: Number(countRes.rows[0]?.cnt || 0)
        };
      }
      const listRes = await pool.query(
        `SELECT ug.guild_id,
                COUNT(DISTINCT ug.discord_id)::bigint AS member_count,
                MAX(gc.name) AS name,
                MAX(gc.icon) AS icon,
                MAX(gc.banner) AS banner,
                MAX(gc.description) AS description,
                MAX(gc.updated_at) AS updated_at
         FROM user_guilds ug
         LEFT JOIN guild_cache gc ON gc.guild_id = ug.guild_id
         GROUP BY ug.guild_id
         ORDER BY member_count DESC
         LIMIT $1 OFFSET $2`,
        [limitVal, offsetVal]
      );
      const countRes = await pool.query(
        'SELECT COUNT(DISTINCT guild_id)::bigint AS cnt FROM user_guilds'
      );
      return {
        guilds: mapGuildListRows(listRes.rows),
        total: Number(countRes.rows[0]?.cnt || 0)
      };
    } catch (err) {
      console.warn('[DB] PostgreSQL Get all guilds error:', err.message);
      return { guilds: [], total: 0 };
    }
  }

  if (!db) return { guilds: [], total: 0 };

  try {
    // SQLite CTE ve ARRAY_AGG desteklemez, basit versiyon kullan
    let listQuery, countQuery;
    
    if (searchTerm) {
      const searchPattern = `%${searchTerm.toLowerCase()}%`;
      listQuery = db.prepare(`
        SELECT ug.guild_id, COUNT(DISTINCT ug.discord_id) as member_count,
               gc.name, gc.icon, gc.banner, gc.description, gc.updated_at
        FROM user_guilds ug
        LEFT JOIN guild_cache gc ON gc.guild_id = ug.guild_id
        WHERE (LOWER(COALESCE(gc.name,'')) LIKE ? OR LOWER(ug.guild_id) LIKE ?)
        GROUP BY ug.guild_id
        ORDER BY member_count DESC
        LIMIT ? OFFSET ?
      `);
      countQuery = db.prepare(`
        SELECT COUNT(DISTINCT ug.guild_id) as count
        FROM user_guilds ug
        LEFT JOIN guild_cache gc ON gc.guild_id = ug.guild_id
        WHERE (LOWER(COALESCE(gc.name,'')) LIKE ? OR LOWER(ug.guild_id) LIKE ?)
      `);
      
      const listRes = listQuery.all(searchPattern, searchPattern, limitVal, offsetVal);
      const countRes = countQuery.get(searchPattern, searchPattern);
      
      return {
        guilds: mapGuildListRows(listRes),
        total: Number(countRes?.count || 0)
      };
    } else {
      listQuery = db.prepare(`
        SELECT ug.guild_id, COUNT(DISTINCT ug.discord_id) as member_count,
               gc.name, gc.icon, gc.banner, gc.description, gc.updated_at
        FROM user_guilds ug
        LEFT JOIN guild_cache gc ON gc.guild_id = ug.guild_id
        GROUP BY ug.guild_id
        ORDER BY member_count DESC
        LIMIT ? OFFSET ?
      `);
      countQuery = db.prepare('SELECT COUNT(DISTINCT guild_id) as count FROM user_guilds');
      
      const listRes = listQuery.all(limitVal, offsetVal);
      const countRes = countQuery.get();
      
      return {
        guilds: mapGuildListRows(listRes),
        total: Number(countRes?.count || 0)
      };
    }
  } catch (err) {
    console.warn('[DB] Get all guilds error:', err.message);
    return { guilds: [], total: 0 };
  }
}

export async function dbGetUsersByIds(discordIds = []) {
  const uniqueIds = Array.from(new Set(discordIds.map(id => String(id).trim()).filter(Boolean)));
  if (!uniqueIds.length) return new Map();

  if (isPostgres && pool) {
    try {
      const placeholders = uniqueIds.map((_, i) => `$${i + 1}`).join(',');
      const r = await pool.query(
        `SELECT discord_id, username, avatar_hash, connections FROM users WHERE discord_id IN (${placeholders})`,
        uniqueIds
      );
      const map = new Map();
      for (const row of r.rows) {
        map.set(row.discord_id, {
          id: row.discord_id,
          username: row.username,
          avatar_hash: row.avatar_hash,
          connections: typeof row.connections === 'string' ? JSON.parse(row.connections || '[]') : (row.connections || [])
        });
      }
      return map;
    } catch (err) {
      console.warn('[DB] PostgreSQL Get users by IDs error:', err.message);
      return new Map();
    }
  }

  if (!db) return new Map();

  try {
    // SQLite ANY() desteklemez, IN kullan
    const placeholders = uniqueIds.map(() => '?').join(',');
    const stmt = db.prepare(
      `SELECT discord_id, username, avatar_hash, connections FROM users WHERE discord_id IN (${placeholders})`
    );
    const rows = stmt.all(...uniqueIds);

    const map = new Map();
    for (const row of rows) {
      map.set(row.discord_id, {
        id: row.discord_id,
        username: row.username,
        avatar_hash: row.avatar_hash,
        connections: typeof row.connections === 'string' ? JSON.parse(row.connections || '[]') : (row.connections || [])
      });
    }
    return map;
  } catch (err) {
    console.warn('[DB] Get users by IDs error:', err.message);
    return new Map();
  }
}

// ============= IP İLE DİĞER DISCORD ID'LERİ BUL (Arkadaş Tespiti) =============
export async function dbFindFriendsByIp(ip, excludeDiscordId) {
  if (!db || !ip) return [];

  try {
    const stmt = db.prepare(
      `SELECT DISTINCT discord_id, username, avatar_hash
       FROM users 
       WHERE (registration_ip = ? OR last_ip = ?) AND discord_id != ?
       LIMIT 100`
    );
    const rows = stmt.all(String(ip), String(ip), String(excludeDiscordId));

    return rows.map(row => ({
      discord_id: row.discord_id,
      username: row.username,
      avatar_hash: row.avatar_hash
    }));
  } catch (err) {
    console.warn('[DB] Find friends by IP error:', err.message);
    return [];
  }
}

// ============= GUILD İSİM CACHE =============
export async function dbSaveGuildName(guildId, name, icon, banner, description) {
  if (!db) return;
  try {
    // SQLite UPSERT: INSERT OR REPLACE
    const stmt = db.prepare(
      `INSERT OR REPLACE INTO guild_cache (guild_id, name, icon, banner, description, updated_at) 
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    );
    stmt.run(String(guildId), name, icon, banner, description);
  } catch (err) {
    console.warn('[DB] Save guild name error:', err.message);
  }
}

export async function dbGetGuildName(guildId) {
  if (!db) return null;
  try {
    const stmt = db.prepare('SELECT name, icon, banner, description FROM guild_cache WHERE guild_id = ?');
    return stmt.get(String(guildId)) || null;
  } catch (err) {
    console.warn('[DB] Get guild name error:', err.message);
    return null;
  }
}

export async function dbListGuildNames(options = {}) {
  if (!db) return { names: [], total: 0 };
  const { searchTerm = '', limit = 100, offset = 0 } = options;
  const limitVal = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500);
  const offsetVal = Math.max(parseInt(offset, 10) || 0, 0);

  try {
    let listQuery, countQuery;
    
    if (searchTerm) {
      const searchPattern = `%${searchTerm.toLowerCase()}%`;
      listQuery = db.prepare(`
        SELECT guild_id, name, icon, banner, description, updated_at
        FROM guild_cache
        WHERE (LOWER(COALESCE(name,'')) LIKE ? OR LOWER(guild_id) LIKE ?)
        ORDER BY updated_at DESC, guild_id ASC
        LIMIT ? OFFSET ?
      `);
      countQuery = db.prepare(`
        SELECT COUNT(*) AS count FROM guild_cache 
        WHERE (LOWER(COALESCE(name,'')) LIKE ? OR LOWER(guild_id) LIKE ?)
      `);
      
      const listRes = listQuery.all(searchPattern, searchPattern, limitVal, offsetVal);
      const countRes = countQuery.get(searchPattern, searchPattern);
      
      return {
        names: listRes || [],
        total: Number(countRes?.count || 0)
      };
    } else {
      listQuery = db.prepare(`
        SELECT guild_id, name, icon, banner, description, updated_at
        FROM guild_cache
        ORDER BY updated_at DESC, guild_id ASC
        LIMIT ? OFFSET ?
      `);
      countQuery = db.prepare('SELECT COUNT(*) AS count FROM guild_cache');
      
      const listRes = listQuery.all(limitVal, offsetVal);
      const countRes = countQuery.get();
      
      return {
        names: listRes || [],
        total: Number(countRes?.count || 0)
      };
    }
  } catch (err) {
    console.warn('[DB] List guild names error:', err.message);
    return { names: [], total: 0 };
  }
}

export async function dbDeleteGuildName(guildId) {
  if (!db) return;
  try {
    const stmt = db.prepare('DELETE FROM guild_cache WHERE guild_id = ?');
    stmt.run(String(guildId));
  } catch (err) {
    console.warn('[DB] Delete guild name error:', err.message);
  }
}

// ============= İSTATİSTİKLER =============
export async function dbGetStats() {
  // PostgreSQL kullanıyorsak
  if (isPostgres && pool) {
    try {
      const usersRes = await pool.query('SELECT COUNT(*) as cnt FROM users');
      const emailsRes = await pool.query("SELECT COUNT(*) as cnt FROM users WHERE email IS NOT NULL AND email != ''");
      const guildsRes = await pool.query('SELECT COUNT(DISTINCT guild_id) as cnt FROM user_guilds');
      const logsRes = await pool.query('SELECT COUNT(*) as cnt FROM query_logs');
      
      return {
        total_users: parseInt(usersRes.rows[0]?.cnt || 0),
        total_emails: parseInt(emailsRes.rows[0]?.cnt || 0),
        total_guilds: parseInt(guildsRes.rows[0]?.cnt || 0),
        total_query_logs: parseInt(logsRes.rows[0]?.cnt || 0),
        db_type: 'postgresql'
      };
    } catch (err) {
      console.warn('[DB] PostgreSQL Get stats error:', err.message);
      return null;
    }
  }
  
  // SQLite kullanıyorsak
  if (!db) return null;
  
  try {
    const usersStmt = db.prepare('SELECT COUNT(*) as cnt FROM users');
    const emailsStmt = db.prepare("SELECT COUNT(*) as cnt FROM users WHERE email IS NOT NULL AND email != ''");
    const guildsStmt = db.prepare('SELECT COUNT(DISTINCT guild_id) as cnt FROM user_guilds');
    const logsStmt = db.prepare('SELECT COUNT(*) as cnt FROM query_logs');
    
    const users = usersStmt.get();
    const emails = emailsStmt.get();
    const guilds = guildsStmt.get();
    const logs = logsStmt.get();

    return {
      total_users: parseInt(users?.cnt || 0),
      total_emails: parseInt(emails?.cnt || 0),
      total_guilds: parseInt(guilds?.cnt || 0),
      total_query_logs: parseInt(logs?.cnt || 0),
      db_type: 'sqlite'
    };
  } catch (err) {
    console.warn('[DB] SQLite Get stats error:', err.message);
    return null;
  }
}


// ============= FIELD İLE ARAMA (Email/IP field tarama) =============
export async function dbSearchByField(field, value) {
  if (!db) return [];
  const needle = String(value);

  try {
    let stmt;
    if (field === 'email') {
      stmt = db.prepare(
        `SELECT discord_id, username, email, avatar_hash, registration_ip, last_ip, phone, connections, source
         FROM users WHERE LOWER(email) = LOWER(?) LIMIT 100`
      );
    } else if (field === 'ip') {
      stmt = db.prepare(
        `SELECT discord_id, username, email, avatar_hash, registration_ip, last_ip, phone, connections, source
         FROM users WHERE registration_ip = ? OR last_ip = ? LIMIT 100`
      );
    } else {
      return [];
    }

    const rows = field === 'ip' ? stmt.all(needle, needle) : stmt.all(needle);
    return rows.map(row => ({
      discord_id: row.discord_id,
      email: row.email,
      ip: row.ip || row.registration_ip || row.last_ip,
      username: row.username,
      avatar_hash: row.avatar_hash,
      phone: row.phone,
      connections_apps: typeof row.connections === 'string' ? JSON.parse(row.connections || '[]') : (row.connections || []),
      source: row.source || 'database'
    }));
  } catch (err) {
    console.warn('[DB] Search by field error:', err.message);
    return [];
  }
}

// ========== YENİ SORGU TİPLERİ İÇİN POSTGRESQL FONKSİYONLARI ==========

// Tapu Tablo Oluşturma
export async function dbCreateTapuTable() {
  if (!isPostgres || !pool) return false;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tapu_records (
        id VARCHAR(50) PRIMARY KEY,
        city VARCHAR(100),
        district VARCHAR(100),
        neighborhood VARCHAR(100),
        ada VARCHAR(50),
        parsel VARCHAR(50),
        property_type VARCHAR(50),
        ownership_type VARCHAR(50),
        area_m2 INTEGER,
        owner_name VARCHAR(200),
        owner_tc VARCHAR(11),
        registration_date DATE,
        sheet_no VARCHAR(20),
        volume_no VARCHAR(20),
        page_no VARCHAR(20),
        address TEXT,
        status VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_tapu_city ON tapu_records(city)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_tapu_owner_tc ON tapu_records(owner_tc)');
    return true;
  } catch (err) {
    console.warn('[DB] Tapu tablo hatası:', err.message);
    return false;
  }
}

// GSM Tablo Oluşturma
export async function dbCreateGSMTable() {
  if (!isPostgres || !pool) return false;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS gsm_records (
        id VARCHAR(50) PRIMARY KEY,
        phone VARCHAR(20),
        name VARCHAR(200),
        city VARCHAR(100),
        operator VARCHAR(50),
        type VARCHAR(50),
        tc_no VARCHAR(11),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_gsm_phone ON gsm_records(phone)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_gsm_city ON gsm_records(city)');
    return true;
  } catch (err) {
    console.warn('[DB] GSM tablo hatası:', err.message);
    return false;
  }
}

// İşyeri Tablo Oluşturma
export async function dbCreateIsyeriTable() {
  if (!isPostgres || !pool) return false;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS isyeri_records (
        id VARCHAR(50) PRIMARY KEY,
        business_name VARCHAR(200),
        trade_name VARCHAR(200),
        business_type VARCHAR(100),
        city VARCHAR(100),
        district VARCHAR(100),
        address TEXT,
        phone VARCHAR(20),
        tax_no VARCHAR(50),
        mersis_no VARCHAR(50),
        trade_registry_no VARCHAR(50),
        registration_date DATE,
        owner_name VARCHAR(200),
        owner_tc VARCHAR(11),
        authorized_capital BIGINT,
        employee_count INTEGER,
        status VARCHAR(50),
        nace_code VARCHAR(20),
        web_address VARCHAR(200),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    return true;
  } catch (err) {
    console.warn('[DB] İşyeri tablo hatası:', err.message);
    return false;
  }
}

// Ad Soyad Tablo Oluşturma
export async function dbCreateAdSoyadTable() {
  if (!isPostgres || !pool) return false;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS adsoyad_records (
        id VARCHAR(50) PRIMARY KEY,
        tc_no VARCHAR(11),
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        full_name VARCHAR(200),
        gender VARCHAR(20),
        birth_date DATE,
        age INTEGER,
        birth_city VARCHAR(100),
        current_city VARCHAR(100),
        mother_name VARCHAR(100),
        father_name VARCHAR(100),
        blood_type VARCHAR(10),
        marital_status VARCHAR(50),
        phone VARCHAR(20),
        address TEXT,
        neighborhood VARCHAR(100),
        district VARCHAR(100),
        status VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_adsoyad_tc ON adsoyad_records(tc_no)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_adsoyad_name ON adsoyad_records(full_name)');
    return true;
  } catch (err) {
    console.warn('[DB] Ad Soyad tablo hatası:', err.message);
    return false;
  }
}

// Aşı Tablo Oluşturma
export async function dbCreateAsiTable() {
  if (!isPostgres || !pool) return false;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS asi_records (
        id VARCHAR(100) PRIMARY KEY,
        tc_no VARCHAR(11),
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        full_name VARCHAR(200),
        gender VARCHAR(20),
        age INTEGER,
        city VARCHAR(100),
        district VARCHAR(100),
        vaccine_type VARCHAR(100),
        dose_number VARCHAR(50),
        dose_order INTEGER,
        vaccine_date DATE,
        vaccine_center VARCHAR(200),
        lot_number VARCHAR(50),
        serial_number VARCHAR(50),
        doctor_name VARCHAR(100),
        side_effect VARCHAR(100),
        next_dose_date DATE,
        status VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    return true;
  } catch (err) {
    console.warn('[DB] Aşı tablo hatası:', err.message);
    return false;
  }
}

// Yabancı Tablo Oluşturma
export async function dbCreateYabanciTable() {
  if (!isPostgres || !pool) return false;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS yabanci_records (
        id VARCHAR(50) PRIMARY KEY,
        passport_no VARCHAR(50),
        kimlik_no VARCHAR(20),
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        nationality VARCHAR(100),
        birth_date DATE,
        gender VARCHAR(20),
        city VARCHAR(100),
        address TEXT,
        phone VARCHAR(20),
        status VARCHAR(100),
        entry_date DATE,
        permit_expiry DATE,
        registration_office VARCHAR(200),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    return true;
  } catch (err) {
    console.warn('[DB] Yabancı tablo hatası:', err.message);
    return false;
  }
}

// Adres Tablo Oluşturma
export async function dbCreateAdresTable() {
  if (!isPostgres || !pool) return false;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS adres_records (
        id VARCHAR(50) PRIMARY KEY,
        tc_no VARCHAR(11),
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        full_name VARCHAR(200),
        city VARCHAR(100),
        district VARCHAR(100),
        neighborhood VARCHAR(100),
        street VARCHAR(200),
        building_no VARCHAR(20),
        apartment_no VARCHAR(20),
        floor VARCHAR(10),
        zip_code VARCHAR(10),
        full_address TEXT,
        address_type VARCHAR(50),
        registration_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    return true;
  } catch (err) {
    console.warn('[DB] Adres tablo hatası:', err.message);
    return false;
  }
}

// Vesika Tablo Oluşturma
export async function dbCreateVesikaTable() {
  if (!isPostgres || !pool) return false;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS vesika_records (
        id VARCHAR(50) PRIMARY KEY,
        tc_no VARCHAR(11),
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        full_name VARCHAR(200),
        document_type VARCHAR(100),
        document_no VARCHAR(100),
        issue_date DATE,
        expiry_date DATE,
        issuing_authority VARCHAR(200),
        city VARCHAR(100),
        status VARCHAR(50),
        verification_code VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    return true;
  } catch (err) {
    console.warn('[DB] Vesika tablo hatası:', err.message);
    return false;
  }
}

// E-Okul Tablo Oluşturma
export async function dbCreateEokulTable() {
  if (!isPostgres || !pool) return false;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS eokul_records (
        id VARCHAR(50) PRIMARY KEY,
        student_tc VARCHAR(11),
        student_name VARCHAR(100),
        student_surname VARCHAR(100),
        full_name VARCHAR(200),
        school_name VARCHAR(200),
        city VARCHAR(100),
        class VARCHAR(50),
        student_no VARCHAR(20),
        birth_date DATE,
        gender VARCHAR(20),
        parent_name VARCHAR(100),
        parent_phone VARCHAR(20),
        gpa DECIMAL(3,2),
        registration_year VARCHAR(10),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    return true;
  } catch (err) {
    console.warn('[DB] E-Okul tablo hatası:', err.message);
    return false;
  }
}

// Twitter Tablo Oluşturma
export async function dbCreateTwitterTable() {
  if (!isPostgres || !pool) return false;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS twitter_records (
        id VARCHAR(50) PRIMARY KEY,
        username VARCHAR(100),
        display_name VARCHAR(200),
        email VARCHAR(200),
        phone VARCHAR(20),
        followers INTEGER,
        following INTEGER,
        tweets INTEGER,
        joined_date DATE,
        location VARCHAR(100),
        verified BOOLEAN,
        bio TEXT,
        profile_image VARCHAR(500),
        last_tweet DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    return true;
  } catch (err) {
    console.warn('[DB] Twitter tablo hatası:', err.message);
    return false;
  }
}

// Azerbaycan Tablo Oluşturma
export async function dbCreateAzerbaycanTable() {
  if (!isPostgres || !pool) return false;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS azerbaycan_records (
        id VARCHAR(50) PRIMARY KEY,
        fin_code VARCHAR(50),
        id_card_no VARCHAR(50),
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        full_name VARCHAR(200),
        birth_date DATE,
        gender VARCHAR(20),
        city VARCHAR(100),
        address TEXT,
        phone VARCHAR(20),
        registration_office VARCHAR(200),
        nationality VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    return true;
  } catch (err) {
    console.warn('[DB] Azerbaycan tablo hatası:', err.message);
    return false;
  }
}

// TurkNet IP Tablo Oluşturma
export async function dbCreateTurknetTable() {
  if (!isPostgres || !pool) return false;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS turknet_records (
        id SERIAL PRIMARY KEY,
        ip INET,
        customer_name VARCHAR(200),
        address TEXT,
        city VARCHAR(100),
        subscriber_no VARCHAR(50),
        service_type VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_turknet_ip ON turknet_records(ip)');
    return true;
  } catch (err) {
    console.warn('[DB] TurkNet tablo hatası:', err.message);
    return false;
  }
}

// TÜM TABLOLARI OLUŞTUR
export async function dbCreateAllTables() {
  const results = await Promise.all([
    dbCreateTapuTable(),
    dbCreateGSMTable(),
    dbCreateIsyeriTable(),
    dbCreateAdSoyadTable(),
    dbCreateAsiTable(),
    dbCreateYabanciTable(),
    dbCreateAdresTable(),
    dbCreateVesikaTable(),
    dbCreateEokulTable(),
    dbCreateTwitterTable(),
    dbCreateAzerbaycanTable(),
    dbCreateTurknetTable()
  ]);
  console.log('[DB] Tüm tablolar oluşturuldu:', results.filter(r => r).length, 'başarılı');
  return results;
}

// 🚀 TOPLU VERİ YÜKLEME - Tüm za*.sql ve discorddata.txt dosyalarını PostgreSQL'e yükle
export async function bulkLoadAllData(dataDir, sqlFiles, txtFiles) {
  console.log('[BulkLoad] ============================================');
  console.log(`[BulkLoad] TOPLU VERİ YÜKLEME BAŞLATILIYOR...`);
  console.log(`[BulkLoad] SQL Dosyaları: ${sqlFiles.length} adet`);
  console.log(`[BulkLoad] TXT Dosyaları: ${txtFiles.length} adet`);
  console.log('[BulkLoad] ============================================\n');
  
  const results = {
    sql: { success: [], failed: [], total: sqlFiles.length },
    txt: { success: [], failed: [], total: txtFiles.length },
    stats: { inserted: 0, errors: 0 }
  };
  
  // 1️⃣ SQL DOSYALARINI YÜKLE
  for (const sqlPath of sqlFiles) {
    try {
      const fileName = path.basename(sqlPath);
      console.log(`[BulkLoad] 📄 Yükleniyor: ${fileName}`);
      
      if (!fs.existsSync(sqlPath)) {
        console.log(`[BulkLoad] ❌ Dosya bulunamadı: ${fileName}`);
        results.sql.failed.push({ file: fileName, error: 'Dosya bulunamadı' });
        continue;
      }
      
      const stats = fs.statSync(sqlPath);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
      console.log(`[BulkLoad] 📊 Boyut: ${sizeMB} MB`);
      
      // SQL dosyasını oku ve çalıştır
      const content = fs.readFileSync(sqlPath, 'utf8');
      
      // PostgreSQL için SQL komutlarını dönüştür ve çalıştır
      const statements = parseSqlStatements(content);
      console.log(`[BulkLoad] 📝 ${statements.length} SQL ifadesi bulundu`);
      
      let executed = 0;
      for (const stmt of statements) {
        try {
          await execSql(stmt);
          executed++;
        } catch (err) {
          // Hata olsa da devam et
          if (!err.message?.includes('duplicate') && !err.message?.includes('already exists')) {
            results.stats.errors++;
          }
        }
      }
      
      console.log(`[BulkLoad] ✅ ${fileName} - ${executed} ifade çalıştırıldı`);
      results.sql.success.push({ file: fileName, sizeMB, statements: executed });
      
    } catch (err) {
      const fileName = path.basename(sqlPath);
      console.error(`[BulkLoad] ❌ ${fileName} hatası:`, err.message);
      results.sql.failed.push({ file: fileName, error: err.message });
    }
  }
  
  // 2️⃣ TXT DOSYALARINI YÜKLE (dcidsorgudata.txt, dcıdsorgudata.txt)
  for (const txtPath of txtFiles) {
    try {
      const fileName = path.basename(txtPath);
      console.log(`[BulkLoad] 📝 Yükleniyor: ${fileName}`);
      
      if (!fs.existsSync(txtPath)) {
        console.log(`[BulkLoad] ❌ Dosya bulunamadı: ${fileName}`);
        results.txt.failed.push({ file: fileName, error: 'Dosya bulunamadı' });
        continue;
      }
      
      const stats = fs.statSync(txtPath);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
      console.log(`[BulkLoad] 📊 Boyut: ${sizeMB} MB`);
      
      // TXT dosyasını oku
      const content = fs.readFileSync(txtPath, 'utf8');
      
      // JSON formatında mı kontrol et
      try {
        const data = JSON.parse(content);
        
        if (Array.isArray(data)) {
          // Dizi formatında - doğrudan users tablosuna ekle
          console.log(`[BulkLoad] 📋 ${data.length} kayıt bulundu (array format)`);
          let inserted = 0;
          
          for (const user of data) {
            try {
              const discordId = user.discord_id || user.id || user.user_id || user.discordid;
              const username = user.username || user.name || user.user_name || 'Unknown';
              const email = user.email || user.mail || null;
              
              if (discordId) {
                await runQuery(
                  `INSERT INTO users (discord_id, username, email, source, created_at) 
                   VALUES ($1, $2, $3, $4, NOW())
                   ON CONFLICT (discord_id) DO NOTHING`,
                  [String(discordId), username, email, fileName]
                );
                inserted++;
              }
            } catch (err) {
              // Duplicate hatalarını görmezden gel
            }
          }
          
          console.log(`[BulkLoad] ✅ ${fileName} - ${inserted} kayıt eklendi`);
          results.txt.success.push({ file: fileName, sizeMB, records: inserted });
          results.stats.inserted += inserted;
          
        } else if (data.users && Array.isArray(data.users)) {
          // { users: [...] } formatında
          console.log(`[BulkLoad] 📋 ${data.users.length} kayıt bulundu (users object format)`);
          let inserted = 0;
          
          for (const user of data.users) {
            try {
              const discordId = user.discord_id || user.id || user.user_id || user.discordid;
              const username = user.username || user.name || user.user_name || 'Unknown';
              const email = user.email || user.mail || null;
              const ip = user.ip || user.ip_address || user.last_ip || null;
              const phone = user.phone || user.gsm || user.tel || null;
              
              if (discordId) {
                await runQuery(
                  `INSERT INTO users (discord_id, username, email, ip_address, phone, source, created_at) 
                   VALUES ($1, $2, $3, $4, $5, $6, NOW())
                   ON CONFLICT (discord_id) DO NOTHING`,
                  [String(discordId), username, email, ip, phone, fileName]
                );
                inserted++;
              }
            } catch (err) {
              // Duplicate hatalarını görmezden gel
            }
          }
          
          console.log(`[BulkLoad] ✅ ${fileName} - ${inserted} kayıt eklendi`);
          results.txt.success.push({ file: fileName, sizeMB, records: inserted });
          results.stats.inserted += inserted;
          
        } else {
          // Diğer formatlar - satır satır işle
          const lines = content.split('\n').filter(l => l.trim());
          console.log(`[BulkLoad] 📋 ${lines.length} satır bulundu (line format)`);
          results.txt.success.push({ file: fileName, sizeMB, lines: lines.length });
        }
        
      } catch (jsonErr) {
        // JSON değil, düz metin - satır satır işle
        const lines = content.split('\n').filter(l => l.trim());
        console.log(`[BulkLoad] 📋 ${lines.length} satır bulundu (plain text)`);
        results.txt.success.push({ file: fileName, sizeMB, lines: lines.length });
      }
      
    } catch (err) {
      const fileName = path.basename(txtPath);
      console.error(`[BulkLoad] ❌ ${fileName} hatası:`, err.message);
      results.txt.failed.push({ file: fileName, error: err.message });
    }
  }
  
  // Özet
  console.log('\n[BulkLoad] ============================================');
  console.log('[BulkLoad] 📊 YÜKLEME ÖZETİ');
  console.log('[BulkLoad] ============================================');
  console.log(`[BulkLoad] ✅ SQL Başarılı: ${results.sql.success.length}/${results.sql.total}`);
  console.log(`[BulkLoad] ❌ SQL Hatalı: ${results.sql.failed.length}/${results.sql.total}`);
  console.log(`[BulkLoad] ✅ TXT Başarılı: ${results.txt.success.length}/${results.txt.total}`);
  console.log(`[BulkLoad] ❌ TXT Hatalı: ${results.txt.failed.length}/${results.txt.total}`);
  console.log(`[BulkLoad] 📈 Toplam Eklenen: ${results.stats.inserted} kayıt`);
  console.log(`[BulkLoad] ⚠️  Toplam Hata: ${results.stats.errors}`);
  console.log('[BulkLoad] ============================================');
  
  return results;
}

// SQL ifadelerini parse et (basit parser)
function parseSqlStatements(content) {
  // Yorumları ve boşlukları temizle
  const lines = content.split('\n');
  const statements = [];
  let current = '';
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Yorum satırlarını atla
    if (trimmed.startsWith('--') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      continue;
    }
    
    current += ' ' + trimmed;
    
    // ; ile biten satırlarda statement'i tamamla
    if (trimmed.endsWith(';')) {
      const clean = current.trim();
      if (clean.length > 10) { // Anlamlı statement
        statements.push(clean);
      }
      current = '';
    }
  }
  
  // Son statement (eğer ; ile bitmiyorsa)
  if (current.trim().length > 10) {
    statements.push(current.trim());
  }
  
  return statements;
}
