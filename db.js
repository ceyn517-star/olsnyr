/**
 * Zagros Database Layer
 * PostgreSQL sorgu katmanı - server.js'deki dosya tarama fonksiyonlarının DB karşılıkları
 */

import pg from 'pg';

let pool = null;

export function initDB(databaseUrl) {
  pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1')
      ? false
      : { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });
  pool.on('error', (err) => console.error('[DB] Pool error:', err.message));
  return pool;
}

export function getPool() { return pool; }
export function isDBReady() { return !!pool; }

// ============= DISCORD ID İLE ARAMA =============
export async function dbSearchByDiscordId(discordId) {
  if (!pool) return [];
  const needle = String(discordId);

  // users tablosundan
  const usersRes = await pool.query(
    `SELECT discord_id, username, discriminator, email, avatar_hash, 
            registration_ip, last_ip, phone, bio, premium, verified, 
            connections, source, created_at, last_login
     FROM users WHERE discord_id = $1 LIMIT 50`,
    [needle]
  );

  // query_logs tablosundan
  const logsRes = await pool.query(
    `SELECT discord_id, email, ip, username, avatar_hash, connections, source
     FROM query_logs WHERE discord_id = $1 LIMIT 50`,
    [needle]
  );

  const results = [];

  for (const row of usersRes.rows) {
    results.push({
      email: row.email,
      ip: row.registration_ip || row.last_ip,
      username: row.username,
      discriminator: row.discriminator,
      avatar_hash: row.avatar_hash,
      bio: row.bio,
      premium: row.premium,
      verified: row.verified,
      phone: row.phone,
      connections_apps: typeof row.connections === 'string' ? JSON.parse(row.connections || '[]') : (row.connections || []),
      source: row.source || 'database'
    });
  }

  for (const row of logsRes.rows) {
    results.push({
      email: row.email,
      ip: row.ip,
      username: row.username,
      avatar_hash: row.avatar_hash,
      connections_apps: typeof row.connections === 'string' ? JSON.parse(row.connections || '[]') : (row.connections || []),
      source: row.source || 'query_logs'
    });
  }

  return results;
}

// ============= GUILD'LER - Discord ID ile =============
export async function dbGetUserGuilds(discordId) {
  if (!pool) return [];
  const res = await pool.query(
    `SELECT DISTINCT guild_id FROM user_guilds WHERE discord_id = $1`,
    [String(discordId)]
  );
  return res.rows.map(r => r.guild_id);
}

// ============= EMAIL İLE ARAMA =============
export async function dbSearchByEmail(email) {
  if (!pool) return [];
  const needle = String(email).toLowerCase();

  const usersRes = await pool.query(
    `SELECT discord_id, username, discriminator, email, avatar_hash,
            registration_ip, last_ip, phone, connections, source
     FROM users WHERE LOWER(email) = $1 LIMIT 100`,
    [needle]
  );

  const logsRes = await pool.query(
    `SELECT discord_id, email, ip, username, avatar_hash, connections, source
     FROM query_logs WHERE LOWER(email) = $1 LIMIT 100`,
    [needle]
  );

  const results = [];
  for (const row of [...usersRes.rows, ...logsRes.rows]) {
    results.push({
      discord_id: row.discord_id,
      email: row.email,
      ip: row.ip || row.registration_ip || row.last_ip,
      username: row.username,
      avatar_hash: row.avatar_hash,
      phone: row.phone || null,
      connections_apps: typeof row.connections === 'string' ? JSON.parse(row.connections || '[]') : (row.connections || []),
      source: row.source || 'database'
    });
  }
  return results;
}

// ============= IP İLE ARAMA =============
export async function dbSearchByIp(ip) {
  if (!pool) return [];
  const needle = String(ip);

  const res = await pool.query(
    `SELECT discord_id, username, email, avatar_hash, registration_ip, last_ip, source
     FROM users 
     WHERE registration_ip = $1 OR last_ip = $1
     LIMIT 100`,
    [needle]
  );

  const logsRes = await pool.query(
    `SELECT discord_id, email, ip, username, avatar_hash, source
     FROM query_logs WHERE ip = $1 LIMIT 100`,
    [needle]
  );

  const results = [];
  for (const row of [...res.rows, ...logsRes.rows]) {
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
}

// ============= GUILD ÜYELERI =============
export async function dbSearchGuildMembers(guildId) {
  if (!pool) return [];

  const res = await pool.query(
    `SELECT ug.discord_id, u.username, u.email, u.avatar_hash, 
            u.registration_ip, u.last_ip, u.phone, u.connections, u.source
     FROM user_guilds ug
     LEFT JOIN LATERAL (
       SELECT * FROM users WHERE discord_id = ug.discord_id LIMIT 1
     ) u ON true
     WHERE ug.guild_id = $1
     LIMIT 500`,
    [String(guildId)]
  );

  return res.rows.map(row => ({
    discord_id: row.discord_id,
    username: row.username,
    email: row.email,
    avatar_hash: row.avatar_hash,
    ip: row.registration_ip || row.last_ip,
    phone: row.phone,
    connections_apps: typeof row.connections === 'string' ? JSON.parse(row.connections || '[]') : (row.connections || []),
    source: row.source || 'database'
  }));
}

// ============= TÜM GUILD'LER LİSTESİ =============
export async function dbGetAllGuilds() {
  if (!pool) return [];

  const res = await pool.query(
    `SELECT ug.guild_id, COUNT(DISTINCT ug.discord_id) as member_count,
            gc.name, gc.icon, gc.banner, gc.description,
            ARRAY_AGG(DISTINCT ug.discord_id ORDER BY ug.discord_id) FILTER (WHERE ug.discord_id IS NOT NULL) as sample_member_ids
     FROM user_guilds ug
     LEFT JOIN guild_cache gc ON gc.guild_id = ug.guild_id
     GROUP BY ug.guild_id, gc.name, gc.icon, gc.banner, gc.description
     ORDER BY member_count DESC
     LIMIT 200`
  );

  return res.rows.map(row => ({
    id: row.guild_id,
    name: row.name || null,
    icon: row.icon || null,
    banner: row.banner || null,
    description: row.description || null,
    member_count: parseInt(row.member_count),
    sample_member_ids: (row.sample_member_ids || []).slice(0, 10)
  }));
}

// ============= IP İLE DİĞER DISCORD ID'LERİ BUL (Arkadaş Tespiti) =============
export async function dbFindFriendsByIp(ip, excludeDiscordId) {
  if (!pool || !ip) return [];

  const res = await pool.query(
    `SELECT DISTINCT discord_id, username, avatar_hash
     FROM users 
     WHERE (registration_ip = $1 OR last_ip = $1) AND discord_id != $2
     LIMIT 20`,
    [ip, String(excludeDiscordId)]
  );

  return res.rows.map(r => ({
    discord_id: r.discord_id,
    username: r.username,
    avatar_hash: r.avatar_hash,
    match_type: 'ip'
  }));
}

// ============= GUILD İSİM CACHE =============
export async function dbSaveGuildName(guildId, name, icon, banner, description) {
  if (!pool) return;
  await pool.query(
    `INSERT INTO guild_cache (guild_id, name, icon, banner, description, updated_at) 
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (guild_id) DO UPDATE SET 
       name = COALESCE(EXCLUDED.name, guild_cache.name),
       icon = COALESCE(EXCLUDED.icon, guild_cache.icon),
       banner = COALESCE(EXCLUDED.banner, guild_cache.banner),
       description = COALESCE(EXCLUDED.description, guild_cache.description),
       updated_at = NOW()`,
    [String(guildId), name, icon, banner, description]
  );
}

export async function dbGetGuildName(guildId) {
  if (!pool) return null;
  const res = await pool.query('SELECT name, icon, banner, description FROM guild_cache WHERE guild_id = $1', [String(guildId)]);
  return res.rows[0] || null;
}

// ============= İSTATİSTİKLER =============
export async function dbGetStats() {
  if (!pool) return null;
  
  const [users, emails, guilds, logs] = await Promise.all([
    pool.query('SELECT COUNT(*) as cnt FROM users'),
    pool.query("SELECT COUNT(*) as cnt FROM users WHERE email IS NOT NULL AND email != ''"),
    pool.query('SELECT COUNT(DISTINCT guild_id) as cnt FROM user_guilds'),
    pool.query('SELECT COUNT(*) as cnt FROM query_logs')
  ]);

  return {
    total_users: parseInt(users.rows[0].cnt),
    total_emails: parseInt(emails.rows[0].cnt),
    total_guilds: parseInt(guilds.rows[0].cnt),
    total_query_logs: parseInt(logs.rows[0].cnt)
  };
}

// ============= FIELD İLE ARAMA (Email/IP field tarama) =============
export async function dbSearchByField(field, value) {
  if (!pool) return [];
  const needle = String(value);

  let query;
  if (field === 'email') {
    query = `SELECT discord_id, username, email, avatar_hash, registration_ip, last_ip, phone, connections, source
             FROM users WHERE LOWER(email) = LOWER($1) LIMIT 100`;
  } else if (field === 'ip') {
    query = `SELECT discord_id, username, email, avatar_hash, registration_ip, last_ip, phone, connections, source
             FROM users WHERE registration_ip = $1 OR last_ip = $1 LIMIT 100`;
  } else {
    return [];
  }

  const res = await pool.query(query, [needle]);
  return res.rows.map(row => ({
    discord_id: row.discord_id,
    email: row.email,
    ip: row.registration_ip || row.last_ip,
    username: row.username,
    avatar_hash: row.avatar_hash,
    phone: row.phone,
    connections_apps: typeof row.connections === 'string' ? JSON.parse(row.connections || '[]') : (row.connections || []),
    source: row.source
  }));
}
