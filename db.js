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
    max: 10,
    min: 2,
    idleTimeoutMillis: 60000,
    connectionTimeoutMillis: 20000,
    statement_timeout: 30000,
    query_timeout: 30000,
    application_name: 'zagros-osint'
  });
  pool.on('error', (err) => console.error('[DB] Pool error:', err.message));
  pool.on('connect', () => console.log('[DB] New connection established'));
  pool.on('remove', () => console.log('[DB] Connection removed'));
  return pool;
}

export function getPool() { return pool; }
export function isDBReady() { return !!pool; }

// ============= DISCORD ID İLE ARAMA =============
export async function dbSearchByDiscordId(discordId) {
  if (!pool) return [];
  const needle = String(discordId);

  // users tablosundan - TÜM ALANLAR
  const usersRes = await pool.query(
    `SELECT discord_id, username, discriminator, email, avatar_hash, 
            registration_ip, last_ip, phone, bio, premium, verified, 
            connections, source, created_at, last_login, mfa_enabled, 
            locale, nsfw_allowed, public_flags, flags, 
            high_quality, email_verified
     FROM users WHERE discord_id = $1 LIMIT 50`,
    [needle]
  );

  // query_logs tablosundan
  const logsRes = await pool.query(
    `SELECT discord_id, email, ip, username, avatar_hash, connections, source, created_at
     FROM query_logs WHERE discord_id = $1 LIMIT 50`,
    [needle]
  );

  // guilds tablosundan kullanıcının bulunduğu sunucular
  const guildsRes = await pool.query(
    `SELECT g.guild_id, g.guild_name, g.guild_icon, g.guild_banner, g.guild_description,
            g.member_count, g.online_count, g.owner_id, g.created_at as guild_created_at
     FROM user_guilds ug
     JOIN guilds g ON ug.guild_id = g.guild_id
     WHERE ug.discord_id = $1 LIMIT 100`,
    [needle]
  );

  const results = [];

  for (const row of usersRes.rows) {
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
      source: row.source || 'database',
      guilds: guildsRes.rows.map(g => ({
        id: g.guild_id,
        name: g.guild_name,
        icon: g.guild_icon,
        banner: g.guild_banner,
        description: g.guild_description,
        member_count: g.member_count,
        online_count: g.online_count,
        owner_id: g.owner_id,
        created_at: g.guild_created_at
      }))
    });
  }

  for (const row of logsRes.rows) {
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
            registration_ip, last_ip, phone, bio, premium, verified,
            connections, source, created_at, last_login, mfa_enabled,
            locale, public_flags, flags
     FROM users WHERE LOWER(email) = $1 LIMIT 100`,
    [needle]
  );

  const logsRes = await pool.query(
    `SELECT discord_id, email, ip, username, avatar_hash, connections, source, created_at
     FROM query_logs WHERE LOWER(email) = $1 LIMIT 100`,
    [needle]
  );

  const results = [];
  for (const row of usersRes.rows) {
    results.push({
      discord_id: row.discord_id,
      email: row.email,
      ip: row.registration_ip || row.last_ip,
      registration_ip: row.registration_ip,
      last_ip: row.last_ip,
      username: row.username,
      discriminator: row.discriminator,
      avatar_hash: row.avatar_hash,
      bio: row.bio,
      premium: row.premium,
      verified: row.verified,
      phone: row.phone,
      mfa_enabled: row.mfa_enabled,
      locale: row.locale,
      public_flags: row.public_flags,
      flags: row.flags,
      created_at: row.created_at,
      last_login: row.last_login,
      connections_apps: typeof row.connections === 'string' ? JSON.parse(row.connections || '[]') : (row.connections || []),
      source: row.source || 'database'
    });
  }
  for (const row of logsRes.rows) {
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
export async function dbGetAllGuilds(options = {}) {
  if (!pool) return { guilds: [], total: 0 };

  const {
    limit = 200,
    offset = 0,
    searchTerm = ''
  } = options;

  const limitVal = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500);
  const offsetVal = Math.max(parseInt(offset, 10) || 0, 0);

  const filters = [];
  const params = [];
  if (searchTerm) {
    params.push(`%${searchTerm}%`);
    const nameIdx = params.length;
    params.push(`%${searchTerm}%`);
    const idIdx = params.length;
    filters.push(`(COALESCE(gc.name,'') ILIKE $${nameIdx} OR base.guild_id ILIKE $${idIdx})`);
  }
  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const listQuery = `
    WITH base AS (
      SELECT ug.guild_id,
             COUNT(DISTINCT ug.discord_id) AS member_count,
             ARRAY_AGG(DISTINCT ug.discord_id ORDER BY ug.discord_id)
               FILTER (WHERE ug.discord_id IS NOT NULL) AS sample_member_ids
      FROM user_guilds ug
      GROUP BY ug.guild_id
    )
    SELECT base.guild_id, base.member_count, base.sample_member_ids,
           gc.name, gc.icon, gc.banner, gc.description, gc.updated_at
    FROM base
    LEFT JOIN guild_cache gc ON gc.guild_id = base.guild_id
    ${whereClause}
    ORDER BY base.member_count DESC
    LIMIT $${params.length + 1}
    OFFSET $${params.length + 2}
  `;

  const countQuery = `
    WITH base AS (
      SELECT DISTINCT guild_id FROM user_guilds
    )
    SELECT COUNT(*) AS count
    FROM base
    LEFT JOIN guild_cache gc ON gc.guild_id = base.guild_id
    ${whereClause}
  `;

  const [listRes, countRes] = await Promise.all([
    pool.query(listQuery, [...params, limitVal, offsetVal]),
    pool.query(countQuery, params)
  ]);

  return {
    guilds: listRes.rows.map(row => ({
      id: row.guild_id,
      name: row.name || null,
      icon: row.icon || null,
      banner: row.banner || null,
      description: row.description || null,
      member_count: parseInt(row.member_count, 10),
      sample_member_ids: (row.sample_member_ids || []).slice(0, 10),
      metadata_source: (row.name || row.icon || row.banner || row.description) ? 'database' : null,
      metadata_updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null
    })),
    total: Number(countRes.rows?.[0]?.count || 0)
  };
}

export async function dbGetUsersByIds(discordIds = []) {
  if (!pool || !discordIds?.length) return new Map();
  const uniqueIds = Array.from(new Set(discordIds.map(id => String(id).trim()).filter(Boolean)));
  if (!uniqueIds.length) return new Map();

  const res = await pool.query(
    `SELECT discord_id, username, avatar_hash, connections FROM users WHERE discord_id = ANY($1::varchar[])`,
    [uniqueIds]
  );

  const map = new Map();
  for (const row of res.rows) {
    map.set(row.discord_id, {
      id: row.discord_id,
      username: row.username,
      avatar_hash: row.avatar_hash,
      connections: typeof row.connections === 'string' ? JSON.parse(row.connections || '[]') : (row.connections || [])
    });
  }
  return map;
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
      icon = CASE WHEN EXCLUDED.icon IS DISTINCT FROM guild_cache.icon THEN EXCLUDED.icon ELSE guild_cache.icon END,
      banner = CASE WHEN EXCLUDED.banner IS DISTINCT FROM guild_cache.banner THEN EXCLUDED.banner ELSE guild_cache.banner END,
      description = CASE WHEN EXCLUDED.description IS DISTINCT FROM guild_cache.description THEN EXCLUDED.description ELSE guild_cache.description END,
      updated_at = NOW()` ,
    [String(guildId), name, icon, banner, description]
  );
}

export async function dbGetGuildName(guildId) {
  if (!pool) return null;
  const res = await pool.query('SELECT name, icon, banner, description FROM guild_cache WHERE guild_id = $1', [String(guildId)]);
  return res.rows[0] || null;
}

export async function dbListGuildNames(options = {}) {
  if (!pool) return { names: [], total: 0 };
  const { searchTerm = '', limit = 100, offset = 0 } = options;
  const limitVal = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500);
  const offsetVal = Math.max(parseInt(offset, 10) || 0, 0);

  const params = [];
  const filters = [];
  if (searchTerm) {
    params.push(`%${searchTerm}%`);
    const nameIdx = params.length;
    params.push(`%${searchTerm}%`);
    const idIdx = params.length;
    filters.push(`(COALESCE(name,'') ILIKE $${nameIdx} OR guild_id ILIKE $${idIdx})`);
  }
  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const listQuery = `
    SELECT guild_id, name, icon, banner, description, updated_at
    FROM guild_cache
    ${whereClause}
    ORDER BY updated_at DESC NULLS LAST, guild_id ASC
    LIMIT $${params.length + 1}
    OFFSET $${params.length + 2}
  `;

  const countQuery = `SELECT COUNT(*) AS count FROM guild_cache ${whereClause}`;

  const [listRes, countRes] = await Promise.all([
    pool.query(listQuery, [...params, limitVal, offsetVal]),
    pool.query(countQuery, params)
  ]);

  return {
    names: listRes.rows,
    total: Number(countRes.rows?.[0]?.count || 0)
  };
}

export async function dbDeleteGuildName(guildId) {
  if (!pool) return;
  await pool.query('DELETE FROM guild_cache WHERE guild_id = $1', [String(guildId)]);
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

// Run a raw SQL query (administrative helper for testing/seeding)
export async function runQuery(sql, params) {
  if (!pool) throw new Error('db_not_ready');
  return pool.query(sql, params);
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
