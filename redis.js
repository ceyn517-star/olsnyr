/**
 * Zagros Redis Layer
 * Cache ve hızlı veri erişimi için Redis entegrasyonu
 */

import Redis from 'ioredis';

let redis = null;
let redisEnabled = false;

// Redis bağlantı URL'si (Railway'den otomatik alınır)
const REDIS_URL = process.env.REDIS_URL || process.env.REDIS_PUBLIC_URL || '';

export function initRedis() {
  if (!REDIS_URL) {
    console.log('[Redis] REDIS_URL bulunamadı, Redis devre dışı');
    return null;
  }

  try {
    redis = new Redis(REDIS_URL, {
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true
    });

    redis.on('connect', () => {
      console.log('[Redis] Bağlantı kuruldu');
      redisEnabled = true;
    });

    redis.on('error', (err) => {
      console.warn('[Redis] Hata:', err.message);
      redisEnabled = false;
    });

    redis.on('ready', () => {
      console.log('[Redis] Hazır - Cache aktif');
      redisEnabled = true;
    });

    return redis;
  } catch (err) {
    console.error('[Redis] Başlatma hatası:', err.message);
    return null;
  }
}

export function isRedisReady() {
  return redisEnabled && redis && redis.status === 'ready';
}

// Discord ID cache
export async function getCachedDiscordId(discordId) {
  if (!isRedisReady()) return null;
  try {
    const key = `discord:${discordId}`;
    const data = await redis.get(key);
    if (data) {
      console.log(`[Redis] Cache hit: ${discordId}`);
      return JSON.parse(data);
    }
    return null;
  } catch (err) {
    console.warn('[Redis] Get error:', err.message);
    return null;
  }
}

export async function setCachedDiscordId(discordId, data, ttl = 3600) {
  if (!isRedisReady()) return false;
  try {
    const key = `discord:${discordId}`;
    await redis.setex(key, ttl, JSON.stringify(data));
    console.log(`[Redis] Cache set: ${discordId}`);
    return true;
  } catch (err) {
    console.warn('[Redis] Set error:', err.message);
    return false;
  }
}

// Guild cache
export async function getCachedGuild(guildId) {
  if (!isRedisReady()) return null;
  try {
    const key = `guild:${guildId}`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    return null;
  }
}

export async function setCachedGuild(guildId, data, ttl = 1800) {
  if (!isRedisReady()) return false;
  try {
    const key = `guild:${guildId}`;
    await redis.setex(key, ttl, JSON.stringify(data));
    return true;
  } catch (err) {
    return false;
  }
}

// Email cache
export async function getCachedEmail(email) {
  if (!isRedisReady()) return null;
  try {
    const key = `email:${email.toLowerCase()}`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    return null;
  }
}

export async function setCachedEmail(email, data, ttl = 3600) {
  if (!isRedisReady()) return false;
  try {
    const key = `email:${email.toLowerCase()}`;
    await redis.setex(key, ttl, JSON.stringify(data));
    return true;
  } catch (err) {
    return false;
  }
}

// IP cache
export async function getCachedIP(ip) {
  if (!isRedisReady()) return null;
  try {
    const key = `ip:${ip}`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    return null;
  }
}

export async function setCachedIP(ip, data, ttl = 1800) {
  if (!isRedisReady()) return false;
  try {
    const key = `ip:${ip}`;
    await redis.setex(key, ttl, JSON.stringify(data));
    return true;
  } catch (err) {
    return false;
  }
}

// FindCord cache
export async function getCachedFindCord(discordId) {
  if (!isRedisReady()) return null;
  try {
    const key = `findcord:${discordId}`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    return null;
  }
}

export async function setCachedFindCord(discordId, data, ttl = 7200) {
  if (!isRedisReady()) return false;
  try {
    const key = `findcord:${discordId}`;
    await redis.setex(key, ttl, JSON.stringify(data));
    console.log(`[Redis] FindCord cached: ${discordId}`);
    return true;
  } catch (err) {
    return false;
  }
}

// Stats cache
export async function getCachedStats() {
  if (!isRedisReady()) return null;
  try {
    const data = await redis.get('stats:global');
    return data ? JSON.parse(data) : null;
  } catch (err) {
    return null;
  }
}

export async function setCachedStats(stats, ttl = 300) {
  if (!isRedisReady()) return false;
  try {
    await redis.setex('stats:global', ttl, JSON.stringify(stats));
    return true;
  } catch (err) {
    return false;
  }
}

// ========== YENİ SORGU TİPLERİ İÇİN CACHE FONKSİYONLARI ==========

// Tapu Cache
export async function getCachedTapu(query) {
  if (!isRedisReady()) return null;
  try {
    const key = `tapu:${query.toLowerCase()}`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    return null;
  }
}

export async function setCachedTapu(query, data, ttl = 1800) {
  if (!isRedisReady()) return false;
  try {
    const key = `tapu:${query.toLowerCase()}`;
    await redis.setex(key, ttl, JSON.stringify(data));
    return true;
  } catch (err) {
    return false;
  }
}

// GSM Cache
export async function getCachedGSM(query) {
  if (!isRedisReady()) return null;
  try {
    const key = `gsm:${query}`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    return null;
  }
}

export async function setCachedGSM(query, data, ttl = 1800) {
  if (!isRedisReady()) return false;
  try {
    const key = `gsm:${query}`;
    await redis.setex(key, ttl, JSON.stringify(data));
    return true;
  } catch (err) {
    return false;
  }
}

// İşyeri Cache
export async function getCachedIsyeri(query) {
  if (!isRedisReady()) return null;
  try {
    const key = `isyeri:${query.toLowerCase()}`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    return null;
  }
}

export async function setCachedIsyeri(query, data, ttl = 1800) {
  if (!isRedisReady()) return false;
  try {
    const key = `isyeri:${query.toLowerCase()}`;
    await redis.setex(key, ttl, JSON.stringify(data));
    return true;
  } catch (err) {
    return false;
  }
}

// Ad Soyad Cache
export async function getCachedAdSoyad(query) {
  if (!isRedisReady()) return null;
  try {
    const key = `adsoyad:${query.toLowerCase()}`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    return null;
  }
}

export async function setCachedAdSoyad(query, data, ttl = 1800) {
  if (!isRedisReady()) return false;
  try {
    const key = `adsoyad:${query.toLowerCase()}`;
    await redis.setex(key, ttl, JSON.stringify(data));
    return true;
  } catch (err) {
    return false;
  }
}

// Aşı Cache
export async function getCachedAsi(query) {
  if (!isRedisReady()) return null;
  try {
    const key = `asi:${query}`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    return null;
  }
}

export async function setCachedAsi(query, data, ttl = 1800) {
  if (!isRedisReady()) return false;
  try {
    const key = `asi:${query}`;
    await redis.setex(key, ttl, JSON.stringify(data));
    return true;
  } catch (err) {
    return false;
  }
}

// Yabancı Cache
export async function getCachedYabanci(query) {
  if (!isRedisReady()) return null;
  try {
    const key = `yabanci:${query.toLowerCase()}`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    return null;
  }
}

export async function setCachedYabanci(query, data, ttl = 1800) {
  if (!isRedisReady()) return false;
  try {
    const key = `yabanci:${query.toLowerCase()}`;
    await redis.setex(key, ttl, JSON.stringify(data));
    return true;
  } catch (err) {
    return false;
  }
}

// Adres Cache
export async function getCachedAdres(query) {
  if (!isRedisReady()) return null;
  try {
    const key = `adres:${query.toLowerCase()}`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    return null;
  }
}

export async function setCachedAdres(query, data, ttl = 1800) {
  if (!isRedisReady()) return false;
  try {
    const key = `adres:${query.toLowerCase()}`;
    await redis.setex(key, ttl, JSON.stringify(data));
    return true;
  } catch (err) {
    return false;
  }
}

// Vesika Cache
export async function getCachedVesika(query) {
  if (!isRedisReady()) return null;
  try {
    const key = `vesika:${query.toLowerCase()}`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    return null;
  }
}

export async function setCachedVesika(query, data, ttl = 1800) {
  if (!isRedisReady()) return false;
  try {
    const key = `vesika:${query.toLowerCase()}`;
    await redis.setex(key, ttl, JSON.stringify(data));
    return true;
  } catch (err) {
    return false;
  }
}

// E-Okul Cache
export async function getCachedEokul(query) {
  if (!isRedisReady()) return null;
  try {
    const key = `eokul:${query.toLowerCase()}`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    return null;
  }
}

export async function setCachedEokul(query, data, ttl = 1800) {
  if (!isRedisReady()) return false;
  try {
    const key = `eokul:${query.toLowerCase()}`;
    await redis.setex(key, ttl, JSON.stringify(data));
    return true;
  } catch (err) {
    return false;
  }
}

// Twitter Cache
export async function getCachedTwitter(query) {
  if (!isRedisReady()) return null;
  try {
    const key = `twitter:${query.toLowerCase()}`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    return null;
  }
}

export async function setCachedTwitter(query, data, ttl = 1800) {
  if (!isRedisReady()) return false;
  try {
    const key = `twitter:${query.toLowerCase()}`;
    await redis.setex(key, ttl, JSON.stringify(data));
    return true;
  } catch (err) {
    return false;
  }
}

// Azerbaycan Cache
export async function getCachedAzerbaycan(query) {
  if (!isRedisReady()) return null;
  try {
    const key = `azerbaycan:${query.toLowerCase()}`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    return null;
  }
}

export async function setCachedAzerbaycan(query, data, ttl = 1800) {
  if (!isRedisReady()) return false;
  try {
    const key = `azerbaycan:${query.toLowerCase()}`;
    await redis.setex(key, ttl, JSON.stringify(data));
    return true;
  } catch (err) {
    return false;
  }
}

// FindCord Cache (mevcut fonksiyonlar genişletildi)
export async function getCachedFindCordData(discordId) {
  return getCachedFindCord(discordId);
}

export async function setCachedFindCordData(discordId, data, ttl = 7200) {
  return setCachedFindCord(discordId, data, ttl);
}

// Cache temizleme
export async function clearCache(pattern = '*') {
  if (!isRedisReady()) return false;
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(`[Redis] ${keys.length} key silindi`);
    }
    return true;
  } catch (err) {
    console.warn('[Redis] Clear error:', err.message);
    return false;
  }
}

// Cache istatistikleri
export async function getCacheStats() {
  if (!isRedisReady()) return { enabled: false };
  try {
    const info = await redis.info('keyspace');
    const dbSize = await redis.dbsize();
    return {
      enabled: true,
      keys: dbSize,
      info: info
    };
  } catch (err) {
    return { enabled: true, error: err.message };
  }
}

export { redis };
