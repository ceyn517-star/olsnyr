import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import { setMaxListeners } from 'node:events';

import express from 'express';
import session from 'express-session';
import FileStore from 'session-file-store';
import geoip from 'geoip-lite';
import axios from 'axios';

const FileStoreSession = FileStore(session);

// App version for deployment verification (override via env APP_VERSION in CI/CD)
const APP_VERSION = process.env.APP_VERSION || ('dev-build-' + new Date().toISOString().slice(0,10));
// Log deploy version at startup to aid verification in logs/CI
console.log(`[Deploy] Zagros OSINT deploy ver: ${APP_VERSION} @ ${new Date().toISOString()}`);
import { initDB, isDBReady, dbSearchByDiscordId, dbGetUserGuilds, dbSearchByEmail, dbSearchByIp, dbSearchGuildMembers, dbGetAllGuilds, dbFindFriendsByIp, dbSaveGuildName, dbGetGuildName, dbGetStats, dbSearchByField, dbGetUsersByIds, dbListGuildNames, dbDeleteGuildName } from './db.js';
import { scanDataSources, loadAllSql } from './data_sources.js';

// PostgreSQL bağlantısı (varsa)
const DATABASE_URL = process.env.DATABASE_URL || '';
const ZAGROS_DB_URL = DATABASE_URL ? DATABASE_URL.replace(/\/[^\/]*$/, '/zagros') : '';

// Zagros veritabanını oluştur
async function createZagrosDatabase() {
  if (!DATABASE_URL) return;
  
  try {
    const { Pool } = await import('pg');
    const pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    
    await pool.query('CREATE DATABASE IF NOT EXISTS zagros');
    console.log('[DB] ✓ Zagros veritabanı oluşturuldu');
    await pool.end();
  } catch (err) {
    console.log('[DB] Zagros veritabanı zaten var veya oluşturulamadı:', err.message);
  }
}

if (ZAGROS_DB_URL) {
  try {
    initDB(ZAGROS_DB_URL);
    console.log('[DB] PostgreSQL bağlantısı kuruldu (zagros veritabanı)');
  } catch (err) {
    console.error('[DB] PostgreSQL bağlantı hatası:', err.message);
  }
}

setMaxListeners(100);

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 10 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 10 });
httpAgent.setMaxListeners(100);
httpsAgent.setMaxListeners(100);
process.stdout.setMaxListeners && process.stdout.setMaxListeners(100);
process.stderr.setMaxListeners && process.stderr.setMaxListeners(100);
axios.defaults.httpAgent = httpAgent;
axios.defaults.httpsAgent = httpsAgent;
axios.defaults.timeout = 15000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Railway'de kalıcı volume kullan, yoksa local klasör.
// Not: Railway volume çoğu projede `/data` olarak mount edilir. Bazı ortamlarda
// RAILWAY_VOLUME_MOUNT_PATH env'i gelmeyebilir; bu yüzden fallback ekliyoruz.
function resolveDataDir() {
  const envDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.DATA_DIR || '';
  const candidates = [];
  if (envDir) candidates.push(envDir);
  // Production'da önce /data dene (Railway volume mount default'u)
  if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) {
    candidates.push('/data');
  }
  candidates.push(__dirname);

  for (const dir of candidates) {
    try {
      if (!dir) continue;
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      // yazılabilirlik kontrolü
      const probe = path.join(dir, '.write_test');
      fs.writeFileSync(probe, 'ok');
      fs.unlinkSync(probe);
      return dir;
    } catch {
      // try next
    }
  }
  return __dirname;
}

const DATA_DIR = resolveDataDir();
const { TXT_PATH: _TXT_PATH, SQL_PATHS: _SQL_PATHS } = scanDataSources(DATA_DIR);
let TXT_PATH = _TXT_PATH;
let SQL_PATHS = _SQL_PATHS;
let SQL_LOADED = false;
async function ensureSqlLoaded() {
  if (!SQL_LOADED && isDBReady()) {
    try {
      console.log(`[SQL] Loading ${SQL_PATHS.length} SQL files into zagros database...`);
      const success = await loadAllSql(DATA_DIR, SQL_PATHS);
      SQL_LOADED = success;
      if (success) {
        console.log(`[SQL] ✓ All SQL files loaded successfully into zagros database`);
      } else {
        console.error(`[SQL] ✗ Failed to load SQL files`);
      }
    } catch (err) {
      console.error(`[SQL] Error loading SQL files:`, err.message);
      SQL_LOADED = false;
    }
  }
}

// TXT users cache (avoid parsing huge JSON repeatedly on every request)
let txtUsersIndexCache = {
  key: null,            // `${path}|${mtimeMs}|${size}`
  loadedAt: 0,
  index: null           // Map<discord_id, user>
};
const TXT_INDEX_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getTxtUsersIndex() {
  if (!TXT_PATH || !fs.existsSync(TXT_PATH)) return null;
  try {
    const st = await fs.promises.stat(TXT_PATH);
    const cacheKey = `${TXT_PATH}|${st.mtimeMs}|${st.size}`;
    const fresh = txtUsersIndexCache.key === cacheKey && txtUsersIndexCache.index && (Date.now() - txtUsersIndexCache.loadedAt) < TXT_INDEX_TTL_MS;
    if (fresh) return txtUsersIndexCache.index;

    // Safety: prevent accidental huge JSON parse loops
    const maxBytes = 60 * 1024 * 1024; // 60MB
    if (st.size > maxBytes) {
      console.log(`[TXT] Çok büyük TXT JSON (${Math.round(st.size/1024/1024)}MB). Index oluşturma atlandı.`);
      return null;
    }

    const content = await fs.promises.readFile(TXT_PATH, 'utf8');
    const obj = safeJsonParse(content);
    const users = Array.isArray(obj?.users) ? obj.users : [];
    const index = new Map();
    for (const u of users) {
      const id = String(u?.discord_id ?? '').trim();
      if (!id) continue;
      if (!index.has(id)) index.set(id, u);
    }
    txtUsersIndexCache = { key: cacheKey, loadedAt: Date.now(), index };
    return index;
  } catch (err) {
    console.log('[TXT] Index oluşturma hatası:', err.message);
    return null;
  }
}

function detectDataSources() {
  let txtPath = TXT_PATH;
  let sqlPaths = SQL_PATHS;

  try {
    const entries = fs.readdirSync(DATA_DIR, { withFileTypes: true });
    const files = entries.filter(e => e.isFile()).map(e => e.name);

    console.log(`[DataSource] DATA_DIR: ${DATA_DIR}`);
    console.log(`[DataSource] Bulunan dosyalar: ${files.join(', ')}`);

    const sqlFiles = files.filter(n => n.toLowerCase().endsWith('.sql'))
      .map(n => path.join(DATA_DIR, n));
    if (sqlFiles.length > 0) sqlPaths = sqlFiles;

    if (!fs.existsSync(txtPath)) {
      const txtFiles = files.filter(n => n.toLowerCase().endsWith('.txt'))
        .map(n => path.join(DATA_DIR, n));
      if (txtFiles.length > 0) txtPath = txtFiles[0];
    }

    console.log(`[DataSource] SQL dosyaları: ${sqlPaths.length} adet`);
    console.log(`[DataSource] TXT dosyası: ${txtPath}`);
  } catch (err) {
    console.error('[DataSource] Hata:', err.message);
  }

  TXT_PATH = txtPath;
  SQL_PATHS = sqlPaths;
  return { txtPath, sqlPaths };
}

// 🔗 Discord Webhook entegrasyonu
async function sendToDiscordWebhook(webhookUrl, data) {
  // Hem discord.com hem de discordapp.com domainlerini destekle
  const validDiscordDomains = [
    'https://discord.com/api/webhooks/',
    'https://discordapp.com/api/webhooks/'
  ];
  const isValidUrl = validDiscordDomains.some(domain => webhookUrl?.startsWith(domain));
  if (!webhookUrl || !isValidUrl) {
    throw new Error('Geçersiz Discord webhook URL');
  }

  const embed = {
    title: '🔍 Zagros OSINT Sonuçları',
    color: 0x5865F2,
    timestamp: new Date().toISOString(),
    fields: []
  };

  if (data.discord_id) embed.fields.push({ name: 'Discord ID', value: data.discord_id, inline: true });
  if (data.username) embed.fields.push({ name: 'Kullanıcı Adı', value: data.username, inline: true });
  if (data.email) embed.fields.push({ name: 'E-posta', value: data.email, inline: true });
  if (data.ip) embed.fields.push({ name: 'IP Adresi', value: data.ip, inline: true });
  if (data.phone) embed.fields.push({ name: 'Telefon', value: data.phone, inline: true });
  if (data.source) embed.fields.push({ name: 'Kaynak', value: data.source, inline: true });

  const payload = {
    username: 'Zagros Bot',
    avatar_url: 'https://cdn.discordapp.com/embed/avatars/0.png',
    embeds: [embed]
  };

  const response = await axios.post(webhookUrl, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 10000
  });

  return response.status === 204 || response.status === 200;
}

// 🌐 SQL/TXT dosyalarını otomatik indir (yoksa Google Drive'dan çeker)
// Google Drive büyük dosya indirme - çoklu yöntem ve retry desteği
async function downloadFromGDrive(fileId, destPath, fileName) {
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 3000;

  // Yardımcı: stream'i dosyaya yaz ve HTML onay sayfası kontrolü yap
  async function writeStreamToFile(stream, filePath) {
    const writer = fs.createWriteStream(filePath);
    stream.pipe(writer);
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
      stream.on('error', reject);
    });
    const stat = fs.statSync(filePath);
    if (stat.size < 10000) {
      const content = fs.readFileSync(filePath, 'utf8').slice(0, 2000);
      if (content.includes('<html') || content.includes('Google Drive') || content.includes('<!DOCTYPE')) {
        fs.unlinkSync(filePath);
        throw new Error('HTML_CONFIRMATION_PAGE');
      }
    }
    return stat.size;
  }

  // Yöntem 1: Doğrudan export URL (küçük dosyalar)
  async function tryDirectDownload() {
    const url = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
    const res = await axios.get(url, {
      responseType: 'stream',
      timeout: 600000,
      maxRedirects: 10,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*'
      }
    });
    return writeStreamToFile(res.data, destPath);
  }

  // Yöntem 2: Onay token'ı ile (büyük dosyalar için)
  async function tryWithConfirmToken() {
    const baseUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    // Önce onay sayfasını al
    const firstRes = await axios.get(baseUrl, {
      responseType: 'text',
      timeout: 30000,
      maxRedirects: 5,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const html = String(firstRes.data);

    // Token'ı farklı pattern'lerle ara
    let confirmToken = null;
    const patterns = [
      /confirm=([0-9A-Za-z_-]+)/,
      /name="confirm"\s+value="([^"]+)"/,
      /"confirm":"([^"]+)"/
    ];
    for (const pat of patterns) {
      const m = html.match(pat);
      if (m) { confirmToken = m[1]; break; }
    }

    // UUID tabanlı yeni Google Drive indirme yöntemi
    const uuidMatch = html.match(/uuid=([0-9a-f-]+)/);
    if (uuidMatch) {
      const downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t&uuid=${uuidMatch[1]}`;
      const res = await axios.get(downloadUrl, {
        responseType: 'stream',
        timeout: 600000,
        maxRedirects: 10,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      return writeStreamToFile(res.data, destPath);
    }

    const downloadUrl = confirmToken
      ? `${baseUrl}&confirm=${confirmToken}`
      : `${baseUrl}&confirm=t`;

    const res = await axios.get(downloadUrl, {
      responseType: 'stream',
      timeout: 600000,
      maxRedirects: 10,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    return writeStreamToFile(res.data, destPath);
  }

  // Yöntem 3: drive.usercontent.google.com (yeni API)
  async function tryGoogleContentDownload() {
    const url = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
    const res = await axios.get(url, {
      responseType: 'stream',
      timeout: 600000,
      maxRedirects: 10,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*'
      }
    });
    return writeStreamToFile(res.data, destPath);
  }

  const methods = [
    { name: 'GoogleContent', fn: tryGoogleContentDownload },
    { name: 'DirectExport', fn: tryDirectDownload },
    { name: 'ConfirmToken', fn: tryWithConfirmToken }
  ];

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    for (const method of methods) {
      try {
        console.log(`[Download] ${fileName} - ${method.name} yöntemi (deneme ${attempt}/${MAX_RETRIES})...`);
        const sizeBytes = await method.fn();
        const sizeMB = (sizeBytes / 1024 / 1024).toFixed(1);
        console.log(`[Download] ✅ ${fileName} tamamlandı (${sizeMB} MB) - ${method.name}`);
        return true;
      } catch (err) {
        if (err.message === 'HTML_CONFIRMATION_PAGE') {
          console.warn(`[Download] ${fileName} - ${method.name}: Google Drive onay sayfası döndü, sonraki yöntem deneniyor`);
        } else {
          console.warn(`[Download] ${fileName} - ${method.name} başarısız: ${err.message}`);
        }
        if (fs.existsSync(destPath)) { try { fs.unlinkSync(destPath); } catch { /* ignore */ } }
      }
    }
    if (attempt < MAX_RETRIES) {
      console.log(`[Download] ${fileName} - ${RETRY_DELAY_MS / 1000}sn bekleniyor, tekrar deneniyor...`);
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    }
  }

  console.error(`[Download] ❌ ${fileName} - Tüm yöntemler başarısız oldu (${MAX_RETRIES} deneme)`);
  return false;
}

async function downloadDataFiles() {
  const files = [
    { name: 'za.sql', id: '12GAV9hjm1JwqJYejeFGatqud-88Vsace' },
    { name: 'zagros.sql', id: '1SUoLWqm-SsbL6tDgdaP-Tc68v6B72vuZ' },
    { name: 'zagrs.sql', id: '1KmjL89fGLCaeeQv4soJ2SnI7DaZS8qjA' },
    { name: 'dcıdsorgudata.txt', id: '1KltBo15k2VkswKM8flAKPZYij1wbKcWZ' },
    { name: 'zagros1.sql', id: '1xestZYts7oTlAI-ECNvi3HQmZsMVeIM5' },
    { name: 'zagros2.sql', id: '1KltBo15k2VkswKM8flAKPZYij1wbKcWZ' },
    { name: 'zagros3.sql', id: '1KmjL89fGLCaeeQv4soJ2SnI7DaZS8qjA' },
    { name: 'zagros4.sql', id: '1O13yXcjo7ToQTDkY9a4OtZTylx94EreI' },
    { name: 'zagros5.sql', id: '1_Ck-BstJg5BAwAqeCGuKfz8olmy68wbe' },
    { name: 'zagros6.sql', id: '1xestZYts7oTlAI-ECNvi3HQmZsMVeIM5' }
  ];

  // Sadece eksik/küçük dosyaları filtrele
  const toDownload = files.filter(({ name }) => {
    const filePath = path.join(DATA_DIR, name);
    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 1000) {
      console.log(`[Download] ${name} zaten var (${(fs.statSync(filePath).size / 1024 / 1024).toFixed(1)} MB), atlanıyor`);
      return false;
    }
    return true;
  });

  if (toDownload.length === 0) {
    console.log('[Download] Tüm dosyalar mevcut, indirme atlanıyor.');
    return;
  }

  // Paralel indirme - tüm eksik dosyaları aynı anda indir
  console.log(`[Download] ${toDownload.length} dosya paralel indiriliyor...`);
  const results = await Promise.allSettled(
    toDownload.map(({ name, id }) => {
      const filePath = path.join(DATA_DIR, name);
      return downloadFromGDrive(id, filePath, name);
    })
  );

  const downloaded = results.filter(r => r.status === 'fulfilled' && r.value === true).length;

  if (downloaded > 0) {
    console.log(`[Download] ${downloaded}/${toDownload.length} dosya indirildi, kaynaklar yeniden yükleniyor...`);
    detectDataSources();
  }
}

detectDataSources();

const APP_PORT = Number(process.env.PORT) || 8080;
const APP_HOST = '0.0.0.0';
const SITE_PASSWORD = process.env.ZAGROS_PASSWORD ?? 'zagros31ceyn';
const FINDCORD_API_KEY = process.env.FINDCORD_API_KEY || '';
if (!FINDCORD_API_KEY) {
  console.log('[FindCord] FINDCORD_API_KEY yok (env). FindCord enrichment kapalı.');
}

// 👑 ADMIN PANEL YAPILANDIRMASI
const ADMIN_ID = process.env.ADMIN_ID || 'zagros'; // Admin kullanıcı adı
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'zagros31ceyn'; // Admin şifresi
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || 'zagros-admin-secret-key';

// Ziyaretçi takip veritabanı
const VISITORS_DB_PATH = path.join(DATA_DIR, 'visitors.json');
const ADMIN_DB_PATH = path.join(DATA_DIR, 'admin_data.json');
const SUBSCRIPTIONS_DB_PATH = path.join(DATA_DIR, 'subscriptions.json');

// Ziyaretçi verilerini oku
function loadVisitors() {
  try {
    if (fs.existsSync(VISITORS_DB_PATH)) {
      const content = fs.readFileSync(VISITORS_DB_PATH, 'utf8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error('[Visitors] Okuma hatası:', err.message);
  }
  return [];
}

// Ziyaretçi verilerini kaydet
function saveVisitors(visitors) {
  try {
    fs.writeFileSync(VISITORS_DB_PATH, JSON.stringify(visitors, null, 2));
  } catch (err) {
    console.error('[Visitors] Kaydetme hatası:', err.message);
  }
}

// Yeni ziyaretçi kaydet
function logVisitor(ip, userAgent, location = null) {
  const visitors = loadVisitors();
  const geo = location || (ip ? geoip.lookup(ip) : null);

  const visit = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2),
    ip: ip || 'unknown',
    userAgent: userAgent || 'unknown',
    country: geo?.country || 'Bilinmiyor',
    city: geo?.city || 'Bilinmiyor',
    region: geo?.region || 'Bilinmiyor',
    timezone: geo?.timezone || 'Bilinmiyor',
    timestamp: new Date().toISOString(),
    date: new Date().toLocaleString('tr-TR')
  };

  visitors.unshift(visit); // En başa ekle

  // Son 1000 ziyareti tut
  if (visitors.length > 1000) {
    visitors.length = 1000;
  }

  saveVisitors(visitors);
  console.log(`[Visitor Log] ${ip} - ${geo?.country || 'Bilinmiyor'} - ${visit.date}`);
  return visit;
}

// 🔑 ABONELİK SİSTEMİ
// Abonelik verilerini oku
function loadSubscriptions() {
  try {
    if (fs.existsSync(SUBSCRIPTIONS_DB_PATH)) {
      const content = fs.readFileSync(SUBSCRIPTIONS_DB_PATH, 'utf8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error('[Subscriptions] Okuma hatası:', err.message);
  }
  return { keys: [], users: [] };
}

// Abonelik verilerini kaydet
function saveSubscriptions(data) {
  try {
    fs.writeFileSync(SUBSCRIPTIONS_DB_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('[Subscriptions] Kaydetme hatası:', err.message);
  }
}

// Anahtar oluştur
function generateKey() {
  const prefix = 'ZAGROS-';
  const randomPart = crypto.randomBytes(16).toString('hex').toUpperCase();
  return `${prefix}${randomPart}`;
}

// Yeni abonelik anahtarı oluştur
function createSubscriptionKey(tier, durationMonths) {
  const subs = loadSubscriptions();
  const key = generateKey();
  const now = new Date();
  const expiresAt = new Date(now.setMonth(now.getMonth() + durationMonths));

  const newKey = {
    key,
    tier, // 'free', 'premium_monthly', 'premium_yearly'
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
    durationMonths,
    isActive: true,
    usageCount: 0
  };

  subs.keys.push(newKey);
  saveSubscriptions(subs);
  console.log(`[Subscription] Yeni anahtar oluşturuldu: ${key} - ${tier}`);
  return newKey;
}

// Anahtarı doğrula
function validateKey(key) {
  const subs = loadSubscriptions();
  const keyData = subs.keys.find(k => k.key === key && k.isActive);

  if (!keyData) {
    return { valid: false, reason: 'invalid_key' };
  }

  // Süre kontrolü
  if (new Date(keyData.expiresAt) < new Date()) {
    keyData.isActive = false;
    saveSubscriptions(subs);
    return { valid: false, reason: 'expired' };
  }

  return {
    valid: true,
    tier: keyData.tier,
    expiresAt: keyData.expiresAt,
    usageCount: keyData.usageCount
  };
}

// Kullanım sayısını artır
function incrementUsage(key) {
  const subs = loadSubscriptions();
  const keyData = subs.keys.find(k => k.key === key);
  if (keyData) {
    keyData.usageCount = (keyData.usageCount || 0) + 1;
    saveSubscriptions(subs);
  }
}

// Abonelik limiti kontrolü
function checkSubscriptionLimit(keyData) {
  if (keyData.tier === 'free') {
    return keyData.usageCount < 1;
  }
  // Premium tiers have unlimited access
  return true;
}

// Abonelik middleware - sorgu limiti kontrolü (Discord ID hariç)
function requireSubscription(req, res, next) {
  // Admin bypass
  if (req.session.tier === 'admin') {
    return next();
  }

  // Premium kullanıcılar için sınırsız erişim
  if (req.session.tier && req.session.tier.includes('premium')) {
    return next();
  }

  // Free kullanıcılar için limit kontrolü
  if (req.session.tier === 'free') {
    // Kullanım sayısını artır
    req.session.usageCount = (req.session.usageCount || 0) + 1;

    // Limit aşıldı mı?
    if (req.session.usageCount > 1) {
      return res.status(403).json({
        ok: false,
        error: 'premium_required',
        message: 'Bu özellik için premium gerekli. discord.gg/zagros adresinden premium satın alabilirsiniz.',
        discord_link: 'https://discord.gg/zagros'
      });
    }
  }

  next();
}

// 🛡️ ZAGROS SUNUCU ÜYELİK KONTROLÜ
const ZAGROS_GUILD_ID = '852952555869044808';
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || ''; // Discord bot token (opsiyonel)

// 🎮 DISCORD API - Avatar, Banner, Guild Icon, Member Avatar
// Discord CDN URL oluşturucular
function discordAvatarUrl(userId, avatarHash, size = 128) {
  if (!userId || !avatarHash) return null;
  const ext = avatarHash.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${ext}?size=${size}`;
}

function discordDefaultAvatarUrl(userId) {
  // Yeni Discord sistemi: (BigInt(userId) >> 22n) % 6n
  let index = 0;
  try { index = Number(BigInt(userId) >> 22n) % 6; } catch { index = parseInt(userId) % 5; }
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

function discordGuildIconUrl(guildId, iconHash, size = 128) {
  if (!guildId || !iconHash) return null;
  const ext = iconHash.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/icons/${guildId}/${iconHash}.${ext}?size=${size}`;
}

function discordGuildBannerUrl(guildId, bannerHash, size = 512) {
  if (!guildId || !bannerHash) return null;
  const ext = bannerHash.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/banners/${guildId}/${bannerHash}.${ext}?size=${size}`;
}

function discordGuildSplashUrl(guildId, splashHash, size = 512) {
  if (!guildId || !splashHash) return null;
  return `https://cdn.discordapp.com/splashes/${guildId}/${splashHash}.png?size=${size}`;
}

function discordMemberAvatarUrl(guildId, userId, avatarHash, size = 128) {
  if (!guildId || !userId || !avatarHash) return null;
  const ext = avatarHash.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/guilds/${guildId}/users/${userId}/avatars/${avatarHash}.${ext}?size=${size}`;
}

function discordUserBannerUrl(userId, bannerHash, size = 512) {
  if (!userId || !bannerHash) return null;
  const ext = bannerHash.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/banners/${userId}/${bannerHash}.${ext}?size=${size}`;
}

// Discord API önbelleği (rate limit koruması)
const discordApiCache = new Map();
const DISCORD_CACHE_TTL = 10 * 60 * 1000; // 10 dakika

// Discord API'den kullanıcı bilgisi çek (bot token gerektirir)
async function fetchDiscordUser(userId) {
  if (!DISCORD_BOT_TOKEN) return null;
  const cacheKey = `user:${userId}`;
  const cached = discordApiCache.get(cacheKey);
  if (cached && Date.now() - cached.time < DISCORD_CACHE_TTL) return cached.data;

  try {
    const res = await axios.get(`https://discord.com/api/v10/users/${userId}`, {
      headers: {
        'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
        'Accept': 'application/json'
      },
      timeout: 5000
    });
    const data = res.data;
    const enriched = {
      id: data.id,
      username: data.username,
      global_name: data.global_name || null,
      discriminator: data.discriminator || '0',
      avatar: data.avatar || null,
      avatar_url: data.avatar
        ? discordAvatarUrl(data.id, data.avatar, 256)
        : discordDefaultAvatarUrl(data.id),
      banner: data.banner || null,
      banner_url: data.banner ? discordUserBannerUrl(data.id, data.banner, 512) : null,
      accent_color: data.accent_color || null,
      bot: data.bot || false,
      public_flags: data.public_flags || 0
    };
    discordApiCache.set(cacheKey, { time: Date.now(), data: enriched });
    return enriched;
  } catch (err) {
    if (err.response?.status === 429) {
      console.warn(`[Discord API] Rate limited - user ${userId}`);
    } else if (err.response?.status !== 404) {
      console.log(`[Discord API] User ${userId} hatası: ${err.message}`);
    }
    return null;
  }
}

// Discord API'den guild bilgisi çek (bot token gerektirir)
async function fetchDiscordGuild(guildId) {
  if (!DISCORD_BOT_TOKEN) return null;
  const cacheKey = `guild:${guildId}`;
  const cached = discordApiCache.get(cacheKey);
  if (cached && Date.now() - cached.time < DISCORD_CACHE_TTL) return cached.data;

  try {
    const res = await axios.get(`https://discord.com/api/v10/guilds/${guildId}?with_counts=true`, {
      headers: {
        'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
        'Accept': 'application/json'
      },
      timeout: 5000
    });
    const data = res.data;
    const enriched = {
      id: data.id,
      name: data.name,
      icon: data.icon || null,
      icon_url: data.icon ? discordGuildIconUrl(data.id, data.icon, 256) : null,
      banner: data.banner || null,
      banner_url: data.banner ? discordGuildBannerUrl(data.id, data.banner, 512) : null,
      splash: data.splash || null,
      splash_url: data.splash ? discordGuildSplashUrl(data.id, data.splash, 512) : null,
      description: data.description || null,
      owner_id: data.owner_id || null,
      member_count: data.approximate_member_count || data.member_count || null,
      presence_count: data.approximate_presence_count || null,
      premium_tier: data.premium_tier || 0,
      premium_subscription_count: data.premium_subscription_count || 0,
      features: data.features || [],
      verification_level: data.verification_level || 0,
      vanity_url_code: data.vanity_url_code || null
    };
    discordApiCache.set(cacheKey, { time: Date.now(), data: enriched });
    return enriched;
  } catch (err) {
    if (err.response?.status === 429) {
      console.warn(`[Discord API] Rate limited - guild ${guildId}`);
    } else if (err.response?.status !== 404 && err.response?.status !== 403) {
      console.log(`[Discord API] Guild ${guildId} hatası: ${err.message}`);
    }
    return null;
  }
}

// Discord API'den guild üyesi bilgisi çek (bot token gerektirir)
async function fetchDiscordGuildMember(guildId, userId) {
  if (!DISCORD_BOT_TOKEN) return null;
  const cacheKey = `member:${guildId}:${userId}`;
  const cached = discordApiCache.get(cacheKey);
  if (cached && Date.now() - cached.time < DISCORD_CACHE_TTL) return cached.data;

  try {
    const res = await axios.get(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`, {
      headers: {
        'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
        'Accept': 'application/json'
      },
      timeout: 5000
    });
    const data = res.data;
    const user = data.user || {};
    const enriched = {
      user_id: user.id,
      username: user.username || null,
      global_name: user.global_name || null,
      avatar: user.avatar || null,
      avatar_url: user.avatar
        ? discordAvatarUrl(user.id, user.avatar, 128)
        : (user.id ? discordDefaultAvatarUrl(user.id) : null),
      member_avatar: data.avatar || null,
      member_avatar_url: data.avatar
        ? discordMemberAvatarUrl(guildId, user.id, data.avatar, 128)
        : null,
      nick: data.nick || null,
      roles: data.roles || [],
      joined_at: data.joined_at || null,
      premium_since: data.premium_since || null
    };
    discordApiCache.set(cacheKey, { time: Date.now(), data: enriched });
    return enriched;
  } catch (err) {
    if (err.response?.status === 429) {
      console.warn(`[Discord API] Rate limited - member ${guildId}/${userId}`);
    }
    return null;
  }
}

// Discord önbelleğini periyodik temizle (bellek sızıntısını önle)
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of discordApiCache.entries()) {
    if (now - val.time > DISCORD_CACHE_TTL * 2) discordApiCache.delete(key);
  }
}, 15 * 60 * 1000); // 15 dakikada bir

// ⚡ PERFORMANS AYARLARI
const MAX_SEARCH_TIME = 8000;      // 8 saniye (normal aramalar)
const GUILD_SEARCH_TIME = 120000;  // 120 saniye (sunucu aramaları - büyük SQL dosyaları için)
const MAX_RESULTS = 100;
const STREAM_BATCH = 1000;
const API_TIMEOUT = 5000;          // API çağrıları 5 sn

const FINDCORD_CACHE_TTL_MS = 5 * 60 * 1000;
const FINDCORD_NEG_TTL_MS = 60 * 1000;
const findCordCache = new Map();
const FINDCORD_RATE_LIMIT_COOLDOWN_MS = 5 * 60 * 1000; // 5 dakika cooldown
let findCordRateLimitedUntil = 0;

// Admin oturumları
const adminSessions = new Map(); // sessionToken -> { adminId, createdAt }

// Guild list cache
let guildsCache = null;
let guildsCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 dakika cache
const GUILDS_MAX_TIME = 15000; // 15 saniye max

// 🔍 EMAIL OSINT - IntelX tarzı derinlemesine araştırma
async function performEmailOSINT(email) {
  const results = {
    email: email,
    timestamp: new Date().toISOString(),
    breaches: [],
    reputation: null,
    sources: [],
    summary: {
      total_breaches: 0,
      sensitive_breaches: 0,
      data_types_exposed: [],
      risk_level: 'unknown',
      first_breach: null,
      last_breach: null
    }
  };

  // 1. HaveIBeenPwned - Breach check
  try {
    const hibpResponse = await axios.get(
      `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(email)}`,
      {
        headers: {
          'User-Agent': 'Zagros-OSINT-Tool',
          'Accept': 'application/json'
        },
        timeout: 8000
      }
    );

    results.breaches = hibpResponse.data.map(b => ({
      source: 'HaveIBeenPwned',
      site: b.Name,
      domain: b.Domain || b.Name.toLowerCase().replace(/\s+/g, ''),
      breach_date: b.BreachDate,
      added_date: b.AddedDate,
      description: b.Description,
      data_classes: b.DataClasses || [],
      is_verified: b.IsVerified,
      is_sensitive: b.IsSensitive,
      is_spam_list: b.IsSpamList || false,
      is_retired: b.IsRetired || false,
      pwn_count: b.PwnCount || 0,
      logo_path: b.LogoPath || null
    }));

    results.sources.push('HaveIBeenPwned');
  } catch (error) {
    if (error.response?.status === 404) {
      results.breaches = []; // Temiz, breach yok
    } else {
      console.log('[EmailOSINT] HIBP Hata:', error.message);
    }
  }

  // 2. EmailRep.io - Email reputation
  try {
    const emailRepRes = await axios.get(
      `https://emailrep.io/${encodeURIComponent(email)}`,
      {
        headers: {
          'User-Agent': 'Zagros-OSINT-Tool',
          'Key': 'public' // Ücretsiz public key
        },
        timeout: 5000
      }
    );

    const rep = emailRepRes.data;
    results.reputation = {
      source: 'EmailRep.io',
      reputation: rep.reputation || 'unknown',
      suspicious: rep.suspicious || false,
      references: rep.references || 0,
      blacklisted: rep.details?.blacklisted || false,
      malicious_activity: rep.details?.malicious_activity || false,
      malicious_activity_recent: rep.details?.malicious_activity_recent || false,
      credentials_leaked: rep.details?.credentials_leaked || false,
      credentials_leaked_recent: rep.details?.credentials_leaked_recent || false,
      data_breach: rep.details?.data_breach || false,
      first_seen: rep.details?.first_seen || null,
      last_seen: rep.details?.last_seen || null,
      domain_exists: rep.details?.domain_exists || false,
      domain_reputation: rep.details?.domain_reputation || 'unknown',
      new_domain: rep.details?.new_domain || false,
      days_since_domain_creation: rep.details?.days_since_domain_creation || null,
      spam: rep.details?.spam || false,
      free_provider: rep.details?.free_provider || false,
      disposable: rep.details?.disposable || false,
      deliverable: rep.details?.deliverable || false,
      valid_mx: rep.details?.valid_mx || false,
      spoofable: rep.details?.spoofable || false,
      spf_strict: rep.details?.spf_strict || false,
      dmarc_enforced: rep.details?.dmarc_enforced || false
    };

    results.sources.push('EmailRep.io');
  } catch (error) {
    console.log('[EmailOSINT] EmailRep Hata:', error.message);
  }

  // 3. Özet analiz
  if (results.breaches.length > 0) {
    results.summary.total_breaches = results.breaches.length;
    results.summary.sensitive_breaches = results.breaches.filter(b => b.is_sensitive).length;

    // Tüm exposed data tiplerini topla
    const allDataTypes = new Set();
    results.breaches.forEach(b => {
      if (b.data_classes) {
        b.data_classes.forEach(dc => allDataTypes.add(dc));
      }
    });
    results.summary.data_types_exposed = Array.from(allDataTypes);

    // Tarih analizi
    const dates = results.breaches
      .map(b => new Date(b.breach_date))
      .filter(d => !isNaN(d))
      .sort((a, b) => a - b);

    if (dates.length > 0) {
      results.summary.first_breach = dates[0].toISOString().split('T')[0];
      results.summary.last_breach = dates[dates.length - 1].toISOString().split('T')[0];
    }

    // Risk seviyesi hesapla
    let riskScore = 0;
    riskScore += results.breaches.length * 10;
    riskScore += results.summary.sensitive_breaches * 20;
    riskScore += results.summary.data_types_exposed.includes('Passwords') ? 30 : 0;
    riskScore += results.summary.data_types_exposed.includes('Credit card numbers') ? 40 : 0;
    riskScore += results.reputation?.suspicious ? 15 : 0;
    riskScore += results.reputation?.blacklisted ? 25 : 0;

    if (riskScore >= 80) results.summary.risk_level = 'critical';
    else if (riskScore >= 50) results.summary.risk_level = 'high';
    else if (riskScore >= 20) results.summary.risk_level = 'medium';
    else results.summary.risk_level = 'low';
  } else {
    results.summary.risk_level = results.reputation?.suspicious ? 'medium' : 'clean';
  }

  return results;
}

async function enrichGuildsFromMembers(guilds, limit = 30) {
  if (!Array.isArray(guilds) || guilds.length === 0) return;
  if (Date.now() < findCordRateLimitedUntil) return;

  const candidates = guilds
    .filter(g => (!g.name || !g.icon || !g.description) && ((g.sample_member_ids && g.sample_member_ids.length) || (g.sample_members && g.sample_members.length)))
    .slice(0, limit);

  for (const guild of candidates) {
    if (Date.now() < findCordRateLimitedUntil) break;
    
    // Birden fazla sample member dene (en fazla 5)
    const sampleIds = (guild.sample_member_ids || []).slice(0, 5);
    if (guild.sample_members) {
      for (const sm of guild.sample_members.slice(0, 5)) {
        if (sm.id && !sampleIds.includes(sm.id)) sampleIds.push(sm.id);
      }
    }
    if (!sampleIds.length) continue;

    let found = false;
    for (const sampleId of sampleIds) {
      if (Date.now() < findCordRateLimitedUntil) break;
      if (found) break;
      
      try {
        const fcData = await getFindCordData(sampleId);
        if (!fcData?.Guilds?.length) continue;
        
        // Tüm guild'leri tara ve bu guild'i bul
        const matchingGuild = fcData.Guilds.find(g =>
          String(g.GuildId) === String(guild.id) || String(g.id) === String(guild.id)
        );
        if (!matchingGuild) continue;

        const meta = {
          name: matchingGuild.GuildName || matchingGuild.guild_name || matchingGuild.name,
          icon: matchingGuild.GuildIcon || matchingGuild.guild_icon || matchingGuild.icon || matchingGuild.Icon || null,
          banner: matchingGuild.GuildBanner || matchingGuild.guild_banner || matchingGuild.banner || matchingGuild.Banner || null,
          description: matchingGuild.Description || matchingGuild.description || null
        };

        const changed = await applyGuildMetadata(guild, meta, 'findcord');
        if (changed) {
          console.log(`[Guilds] 🔎 FindCord meta bulundu: ${guild.id} = ${guild.name} (üye: ${sampleId})`);
          found = true;
        }

        await new Promise(r => setTimeout(r, 150));
      } catch (err) {
        console.log(`[Guilds] FindCord enrich hata ${guild.id}:`, err.message);
      }
    }
  }
}

// IP Geolocation - Detaylı konum bilgisi
async function getIpGeolocation(ip) {
  try {
    // IP format kontrolü
    if (!ip || !/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) return null;
    
    const response = await axios.get(`http://ip-api.com/json/${ip}?fields=status,message,continent,continentCode,country,countryCode,region,regionName,city,district,zip,lat,lon,timezone,offset,currency,isp,org,as,asname,reverse,mobile,proxy,hosting,query`, {
      timeout: 5000
    });
    
    if (response.data.status === 'success') {
      return {
        ip: response.data.query,
        continent: response.data.continent,
        country: response.data.country,
        countryCode: response.data.countryCode,
        region: response.data.regionName,
        city: response.data.city,
        district: response.data.district, // Mahalle/semt
        zip: response.data.zip,
        lat: response.data.lat,
        lon: response.data.lon,
        timezone: response.data.timezone,
        isp: response.data.isp,
        org: response.data.org,
        mobile: response.data.mobile,
        proxy: response.data.proxy,
        hosting: response.data.hosting
      };
    }
    return null;
  } catch (error) {
    console.log(`[IP-API] Hata ${ip}:`, error.message);
    return null;
  }
}

// 🔍 Shodan InternetDB API - Ücretsiz IP tarama (key gerektirmez)
async function getShodanInternetDB(ip) {
  try {
    if (!ip || !/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) return null;
    const response = await axios.get(`https://internetdb.shodan.io/${ip}`, {
      timeout: 5000
    });
    return {
      source: 'Shodan',
      ip: response.data.ip,
      ports: response.data.ports || [],
      tags: response.data.tags || [],
      vulns: response.data.vulns || [],
      hostnames: response.data.hostnames || [],
      cpes: response.data.cpes || []
    };
  } catch (error) {
    if (error.response?.status !== 404) {
      console.log(`[Shodan] Hata ${ip}:`, error.message);
    }
    return null;
  }
}

// 🔍 IPInfo API - IP detayları ve coğrafi konum
async function getIPInfo(ip) {
  try {
    if (!ip || !/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) return null;
    const token = process.env.IPINFO_TOKEN || '';
    const url = token 
      ? `https://ipinfo.io/${ip}/json?token=${token}`
      : `https://ipinfo.io/${ip}/json`;
    const response = await axios.get(url, { timeout: 5000 });
    const [lat, lon] = (response.data.loc || '').split(',').map(Number);
    return {
      source: 'IPInfo',
      ip: response.data.ip,
      city: response.data.city,
      region: response.data.region,
      country: response.data.country,
      country_name: response.data.country_name,
      loc: response.data.loc,
      lat,
      lon,
      org: response.data.org,
      asn: response.data.asn,
      asn_domain: response.data.asn?.domain,
      company: response.data.company,
      carrier: response.data.carrier,
      privacy: response.data.privacy
    };
  } catch (error) {
    console.log(`[IPInfo] Hata ${ip}:`, error.message);
    return null;
  }
}

// 🔍 IPGeolocation.io API
async function getIPGeolocationIO(ip) {
  try {
    if (!ip || !/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) return null;
    const apiKey = process.env.IPGEOLOCATION_API_KEY || '';
    if (!apiKey) return null;
    const response = await axios.get(`https://api.ipgeolocation.io/ipgeo?apiKey=${apiKey}&ip=${ip}`, {
      timeout: 5000
    });
    return {
      source: 'IPGeolocation.io',
      ip: response.data.ip,
      continent: response.data.continent_name,
      country: response.data.country_name,
      country_code: response.data.country_code2,
      region: response.data.state_prov,
      city: response.data.city,
      district: response.data.district,
      zip: response.data.zipcode,
      lat: response.data.latitude,
      lon: response.data.longitude,
      isp: response.data.isp,
      org: response.data.organization,
      timezone: response.data.time_zone?.name,
      threat: response.data.threat?.is_tor || response.data.threat?.is_proxy || false
    };
  } catch (error) {
    console.log(`[IPGeolocation.io] Hata ${ip}:`, error.message);
    return null;
  }
}

// 🔍 Greynoise API - IP tehdit istihbaratı (Community ücretsiz)
async function getGreynoise(ip) {
  try {
    if (!ip || !/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) return null;
    // Community API - key gerektirmez, sadece Accept header
    const response = await axios.get(`https://api.greynoise.io/v3/community/${ip}`, {
      headers: { 
        'Accept': 'application/json',
        'User-Agent': 'Zagros-OSINT-Scanner/1.0'
      },
      timeout: 8000,
      validateStatus: (status) => status < 500 // 404 bile başarılı sayılacak
    });
    
    // 200 başarılı yanıt
    if (response.status === 200 && response.data) {
      return {
        source: 'Greynoise',
        ip: response.data.ip || ip,
        noise: response.data.noise || false,
        riot: response.data.riot || false,
        classification: response.data.classification || 'benign',
        name: response.data.name || null,
        link: response.data.link || `https://www.greynoise.io/viz/ip/${ip}`,
        last_seen: response.data.last_seen || null,
        message: response.data.message || 'IP observed'
      };
    }
    
    // 404 = IP not observed (noise değil, bu normal)
    if (response.status === 404) {
      return {
        source: 'Greynoise',
        ip: ip,
        noise: false,
        riot: false,
        classification: 'unknown',
        message: 'IP not observed (no malicious activity detected)',
        link: `https://www.greynoise.io/viz/ip/${ip}`
      };
    }
    
    return null;
  } catch (error) {
    // 404 = noise değil, normal bir durum
    if (error.response?.status === 404) {
      return {
        source: 'Greynoise',
        ip: ip,
        noise: false,
        riot: false,
        classification: 'unknown',
        message: 'IP not observed (no malicious activity)',
        link: `https://www.greynoise.io/viz/ip/${ip}`
      };
    }
    if (error.code === 'ECONNABORTED') {
      console.log(`[Greynoise] Timeout ${ip}`);
    } else {
      console.log(`[Greynoise] Hata ${ip}:`, error.message);
    }
    return null;
  }
}

// 🔍 IPQualityScore API - IP reputation ve fraud detection (ücretsiz tier)
async function getIPQualityScore(ip) {
  try {
    if (!ip || !/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) return null;
    const apiKey = process.env.IPQUALITYSCORE_API_KEY || '';
    // API key yoksa bile bazı temel bilgileri döndür
    if (!apiKey) {
      return {
        source: 'IPQualityScore',
        ip: ip,
        note: 'API key required for detailed report',
        check_url: `https://www.ipqualityscore.com/free-ip-lookup-proxy-vpn-test/lookup/${ip}`
      };
    }
    
    const response = await axios.get(`https://www.ipqualityscore.com/api/json/ip/${apiKey}/${ip}`, {
      timeout: 5000
    });
    
    if (response.data) {
      return {
        source: 'IPQualityScore',
        ip: ip,
        fraud_score: response.data.fraud_score,
        country_code: response.data.country_code,
        region: response.data.region,
        city: response.data.city,
        isp: response.data.ISP,
        organization: response.data.organization,
        is_proxy: response.data.proxy,
        is_vpn: response.data.vpn,
        is_tor: response.data.tor,
        is_datacenter: response.data.datacenter,
        recent_abuse: response.data.recent_abuse,
        bot_status: response.data.bot_status,
        check_url: `https://www.ipqualityscore.com/free-ip-lookup-proxy-vpn-test/lookup/${ip}`
      };
    }
    return null;
  } catch (error) {
    console.log(`[IPQualityScore] Hata ${ip}:`, error.message);
    return null;
  }
}

// 🔍 ViewDNS.info API - IP reverse lookup (ücretsiz)
async function getViewDNSInfo(ip) {
  try {
    if (!ip || !/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) return null;
    // Rate limiting için simple cache
    const response = await axios.get(`https://api.viewdns.info/reverseip/`, {
      params: {
        host: ip,
        apikey: process.env.VIEWDNS_API_KEY || 'demo', // demo key ile sınırlı kullanım
        output: 'json'
      },
      timeout: 5000
    });
    
    if (response.data && response.data.response) {
      const domains = response.data.response.domains || [];
      return {
        source: 'ViewDNS',
        ip: ip,
        domain_count: domains.length,
        domains: domains.slice(0, 10), // ilk 10 domain
        check_url: `https://viewdns.info/reverseip/?host=${ip}&t=1`
      };
    }
    return null;
  } catch (error) {
    // Ücretsiz API key olmadan sadece URL döndür
    return {
      source: 'ViewDNS',
      ip: ip,
      check_url: `https://viewdns.info/reverseip/?host=${ip}&t=1`,
      note: 'Visit URL for reverse DNS lookup'
    };
  }
}

// 🔍 IP-API.com - Ücretsiz IP geolocation (düzeltme)
async function getIPApiCom(ip) {
  try {
    if (!ip || !/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) return null;
    const response = await axios.get(`http://ip-api.com/json/${ip}?fields=status,message,continent,continentCode,country,countryCode,region,regionName,city,district,zip,lat,lon,timezone,offset,currency,isp,org,as,asname,reverse,mobile,proxy,hosting,query`, {
      timeout: 5000
    });
    if (response.data && response.data.status === 'success') {
      return {
        source: 'IP-API.com',
        ip: response.data.query,
        continent: response.data.continent,
        continentCode: response.data.continentCode,
        country: response.data.country,
        countryCode: response.data.countryCode,
        region: response.data.regionName,
        regionCode: response.data.region,
        city: response.data.city,
        district: response.data.district,
        zip: response.data.zip,
        lat: response.data.lat,
        lon: response.data.lon,
        timezone: response.data.timezone,
        offset: response.data.offset,
        currency: response.data.currency,
        isp: response.data.isp,
        org: response.data.org,
        as: response.data.as,
        asname: response.data.asname,
        reverse: response.data.reverse,
        mobile: response.data.mobile,
        proxy: response.data.proxy,
        hosting: response.data.hosting
      };
    }
    return null;
  } catch (error) {
    console.log(`[IP-API.com] Hata ${ip}:`, error.message);
    return null;
  }
}

// 🔍 AbuseIPDB API - IP kötüye kullanım kontrolü (API key gerektirir)
async function getAbuseIPDB(ip) {
  try {
    if (!ip || !/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) return null;
    const apiKey = process.env.ABUSEIPDB_API_KEY || '';
    if (!apiKey) {
      console.log(`[AbuseIPDB] API key yok, atlanıyor`);
      return null;
    }
    const response = await axios.get(`https://api.abuseipdb.com/api/v2/check`, {
      params: { ipAddress: ip, maxAgeInDays: 90, verbose: true },
      headers: { 
        'Key': apiKey,
        'Accept': 'application/json'
      },
      timeout: 5000
    });
    if (response.data?.data) {
      return {
        source: 'AbuseIPDB',
        ip: response.data.data.ipAddress,
        is_public: response.data.data.isPublic,
        ip_version: response.data.data.ipVersion,
        is_whitelisted: response.data.data.isWhitelisted,
        abuse_confidence: response.data.data.abuseConfidenceScore,
        country: response.data.data.countryName,
        country_code: response.data.data.countryCode,
        usage_type: response.data.data.usageType,
        isp: response.data.data.isp,
        domain: response.data.data.domain,
        hostnames: response.data.data.hostnames,
        is_tor: response.data.data.isTor,
        total_reports: response.data.data.totalReports,
        num_distinct_users: response.data.data.numDistinctUsers,
        last_reported_at: response.data.data.lastReportedAt
      };
    }
    return null;
  } catch (error) {
    if (error.response?.status === 401) {
      console.log(`[AbuseIPDB] API key geçersiz veya eksik`);
    } else {
      console.log(`[AbuseIPDB] Hata ${ip}:`, error.message);
    }
    return null;
  }
}

// 🔍 VirusTotal API - IP reputation (API key gerektirir)
async function getVirusTotalIP(ip) {
  try {
    if (!ip || !/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) return null;
    const apiKey = process.env.VIRUSTOTAL_API_KEY || '';
    if (!apiKey) {
      console.log(`[VirusTotal] API key yok, atlanıyor`);
      return null;
    }
    const response = await axios.get(`https://www.virustotal.com/api/v3/ip_addresses/${ip}`, {
      headers: { 
        'x-apikey': apiKey,
        'Accept': 'application/json'
      },
      timeout: 5000
    });
    if (response.data?.data) {
      const attrs = response.data.data.attributes;
      return {
        source: 'VirusTotal',
        ip: ip,
        reputation: attrs.reputation,
        harmless: attrs.last_analysis_stats?.harmless || 0,
        malicious: attrs.last_analysis_stats?.malicious || 0,
        suspicious: attrs.last_analysis_stats?.suspicious || 0,
        undetected: attrs.last_analysis_stats?.undetected || 0,
        total_engines: (attrs.last_analysis_stats?.harmless || 0) + 
                       (attrs.last_analysis_stats?.malicious || 0) + 
                       (attrs.last_analysis_stats?.suspicious || 0) + 
                       (attrs.last_analysis_stats?.undetected || 0),
        country: attrs.country,
        as_owner: attrs.as_owner,
        asn: attrs.asn,
        regional_internet_registry: attrs.regional_internet_registry,
        last_analysis_date: attrs.last_analysis_date,
        tags: attrs.tags || []
      };
    }
    return null;
  } catch (error) {
    if (error.response?.status === 401) {
      console.log(`[VirusTotal] API key geçersiz veya eksik`);
    } else {
      console.log(`[VirusTotal] Hata ${ip}:`, error.message);
    }
    return null;
  }
}

// 🔍 DiscordLookup API - Discord ID detaylı bilgi
async function getDiscordLookup(discordId) {
  try {
    if (!discordId || !/^\d{10,20}$/.test(discordId)) return null;
    const response = await axios.get(`https://discordlookup.mesalytic.moe/v1/user/${discordId}`, {
      timeout: 5000
    });
    return {
      source: 'DiscordLookup',
      id: response.data.id,
      username: response.data.username,
      display_name: response.data.display_name,
      avatar_url: response.data.avatar_url,
      banner_url: response.data.banner_url,
      accent_color: response.data.accent_color,
      created_at: response.data.created_at,
      created_timestamp: response.data.created_timestamp,
      badges: response.data.badges || [],
      premium_type: response.data.premium_type,
      premium_since: response.data.premium_since
    };
  } catch (error) {
    console.log(`[DiscordLookup] Hata ${discordId}:`, error.message);
    return null;
  }
}

// 🔍 Discord.id API - Alternatif Discord ID lookup
async function getDiscordIDInfo(discordId) {
  try {
    if (!discordId || !/^\d{10,20}$/.test(discordId)) return null;
    const response = await axios.get(`https://discord.id/api/v1/users/${discordId}`, {
      timeout: 5000
    });
    return {
      source: 'Discord.id',
      id: discordId,
      username: response.data.username,
      discriminator: response.data.discriminator,
      avatar: response.data.avatar,
      banner: response.data.banner,
      accent_color: response.data.accent_color,
      public_flags: response.data.public_flags,
      flags: response.data.flags,
      bot: response.data.bot,
      system: response.data.system
    };
  } catch (error) {
    console.log(`[Discord.id] Hata ${discordId}:`, error.message);
    return null;
  }
}

// 🔍 Hunter.io API - Email doğrulama ve bulma
async function getHunterEmailInfo(email) {
  try {
    if (!email || !email.includes('@')) return null;
    const apiKey = process.env.HUNTER_API_KEY || '';
    if (!apiKey) return null;
    
    // Email verification
    const verifyRes = await axios.get(`https://api.hunter.io/v2/email-verifier`, {
      params: { email, api_key: apiKey },
      timeout: 5000
    });
    
    return {
      source: 'Hunter.io',
      email,
      result: verifyRes.data.data?.result,
      score: verifyRes.data.data?.score,
      regexp: verifyRes.data.data?.regexp,
      gibberish: verifyRes.data.data?.gibberish,
      disposable: verifyRes.data.data?.disposable,
      webmail: verifyRes.data.data?.webmail,
      mx_records: verifyRes.data.data?.mx_records,
      smtp_server: verifyRes.data.data?.smtp_server,
      smtp_check: verifyRes.data.data?.smtp_check,
      accept_all: verifyRes.data.data?.accept_all,
      block: verifyRes.data.data?.block,
      sources: verifyRes.data.data?.sources?.length || 0
    };
  } catch (error) {
    console.log(`[Hunter.io] Hata ${email}:`, error.message);
    return null;
  }
}

// 🔍 Hunter.io Domain Search - Email bulma
async function searchHunterDomain(domain) {
  try {
    if (!domain || !domain.includes('.')) return null;
    const apiKey = process.env.HUNTER_API_KEY || '';
    if (!apiKey) return null;
    
    const response = await axios.get(`https://api.hunter.io/v2/domain-search`, {
      params: { domain, api_key: apiKey, limit: 10 },
      timeout: 5000
    });
    
    return {
      source: 'Hunter.io Domain',
      domain: response.data.data?.domain,
      disposable: response.data.data?.disposable,
      webmail: response.data.data?.webmail,
      accept_all: response.data.data?.accept_all,
      organization: response.data.data?.organization,
      emails: response.data.data?.emails?.map(e => ({
        email: e.value,
        type: e.type,
        confidence: e.confidence,
        first_name: e.first_name,
        last_name: e.last_name,
        position: e.position,
        seniority: e.seniority,
        department: e.department,
        linkedin: e.linkedin,
        twitter: e.twitter,
        phone_number: e.phone_number
      })) || []
    };
  } catch (error) {
    console.log(`[Hunter.io Domain] Hata ${domain}:`, error.message);
    return null;
  }
}

// 🔍 LeakCheck API - Email sızıntı kontrolü
async function checkLeakCheck(email) {
  try {
    if (!email || !email.includes('@')) return null;
    const apiKey = process.env.LEAKCHECK_API_KEY || '';
    if (!apiKey) return null;
    
    const response = await axios.get(`https://leakcheck.io/api/v2/query`, {
      params: { email, type: 'email' },
      headers: { 'X-API-Key': apiKey },
      timeout: 5000
    });
    
    if (response.data.success && response.data.found > 0) {
      return {
        source: 'LeakCheck',
        email,
        found: response.data.found,
        breaches: response.data.result?.map(r => ({
          name: r.name,
          date: r.date,
          source: r.source,
          email: r.email,
          password: r.password ? '***' : null,
          hash: r.hash
        })) || []
      };
    }
    return { source: 'LeakCheck', email, found: 0, breaches: [] };
  } catch (error) {
    console.log(`[LeakCheck] Hata ${email}:`, error.message);
    return null;
  }
}

// 🔍 Intelligence X Email Search
async function searchIntelligenceXEmail(email) {
  try {
    if (!email || !email.includes('@')) return null;
    const apiKey = process.env.INTELX_API_KEY || '';
    if (!apiKey) return null;
    
    const response = await axios.get(`https://2.intelx.io/privacy-api/search`, {
      params: { term: email, maxresults: 20 },
      headers: { 'x-key': apiKey },
      timeout: 5000
    });
    
    return {
      source: 'Intelligence X',
      email,
      results: response.data?.records?.map(r => ({
        date: r.date,
        system: r.system,
        type: r.type,
        source: r.source
      })) || []
    };
  } catch (error) {
    console.log(`[IntelligenceX] Hata ${email}:`, error.message);
    return null;
  }
}

// Phone validasyon ve bilgi
function validatePhone(phone) {
  // Temizle
  const clean = phone.replace(/\D/g, '');
  const result = { valid: false, original: phone, cleaned: clean, country: null, carrier: null, type: null };
  
  // E.164 format kontrolü (temel)
  if (clean.length < 7 || clean.length > 15) return result;
  result.valid = true;
  
  // Ülke kodu tahmini
  const countryCodes = {
    '1': 'US/CA', '7': 'RU/KZ', '33': 'FR', '49': 'DE', '90': 'TR',
    '44': 'GB', '39': 'IT', '34': 'ES', '91': 'IN', '86': 'CN',
    '81': 'JP', '82': 'KR', '61': 'AU', '55': 'BR', '52': 'MX'
  };
  
  for (const [code, country] of Object.entries(countryCodes)) {
    if (clean.startsWith(code)) {
      result.country = country;
      result.countryCode = code;
      break;
    }
  }
  
  // Türkiye için operatör tahmini
  if (result.country === 'TR' || clean.startsWith('90')) {
    const prefix = clean.substring(2, 5);
    const operators = {
      '530': 'Turkcell', '531': 'Turkcell', '532': 'Turkcell', '533': 'Turkcell', '534': 'Turkcell',
      '535': 'Turkcell', '536': 'Turkcell', '537': 'Turkcell', '538': 'Turkcell', '539': 'Turkcell',
      '540': 'Vodafone', '541': 'Vodafone', '542': 'Vodafone', '543': 'Vodafone', '544': 'Vodafone',
      '545': 'Vodafone', '546': 'Vodafone', '547': 'Vodafone', '548': 'Vodafone', '549': 'Vodafone',
      '505': 'Turk Telekom', '506': 'Turk Telekom', '507': 'Turk Telekom', '551': 'Turk Telekom',
      '552': 'Turk Telekom', '553': 'Turk Telekom', '554': 'Turk Telekom', '555': 'Turk Telekom'
    };
    result.carrier = operators[prefix] || 'Bilinmiyor';
    
    // Tip belirleme
    if (['530', '531', '532', '533', '534', '535', '536', '537', '538', '539'].includes(prefix)) {
      result.type = 'GSM';
    } else if (['540', '541', '542', '543', '544', '545', '546', '547', '548', '549'].includes(prefix)) {
      result.type = 'GSM';
    } else if (['505', '506', '507', '551', '552', '553', '554', '555'].includes(prefix)) {
      result.type = 'GSM';
    }
  }
  
  return result;
}

// Domain lookup (WHOIS + DNS)
async function lookupDomain(domain) {
  try {
    // WHOIS bilgisi (whoisjson.com - free tier)
    const whoisRes = await axios.get(`https://whoisjson.com/api/v1/whois?domain=${encodeURIComponent(domain)}`, {
      timeout: 8000
    }).catch(() => null);
    
    // DNS records
    const dnsInfo = {
      a: [],
      mx: [],
      txt: [],
      ns: []
    };
    
    // Basic DNS lookup simulation (gerçek DNS lookup için dns modülü gerekir)
    // Şimdilik basic bilgi
    return {
      domain: domain,
      whois: whoisRes?.data || null,
      dns: dnsInfo,
      available: whoisRes?.data?.available || false,
      created: whoisRes?.data?.created || null,
      expires: whoisRes?.data?.expires || null,
      registrar: whoisRes?.data?.registrar?.name || null
    };
  } catch (error) {
    return { domain, error: error.message };
  }
}

// Username OSINT - çoklu platform
async function searchUsername(username) {
  const results = [];
  
  // GitHub
  try {
    const ghRes = await axios.get(`https://api.github.com/users/${encodeURIComponent(username)}`, {
      headers: { 'Accept': 'application/vnd.github.v3+json' },
      timeout: 5000
    });
    results.push({
      platform: 'GitHub',
      available: true,
      url: ghRes.data.html_url,
      avatar: ghRes.data.avatar_url,
      name: ghRes.data.name,
      bio: ghRes.data.bio,
      location: ghRes.data.location,
      company: ghRes.data.company,
      blog: ghRes.data.blog,
      public_repos: ghRes.data.public_repos,
      followers: ghRes.data.followers,
      following: ghRes.data.following,
      created_at: ghRes.data.created_at
    });
  } catch { 
    results.push({ platform: 'GitHub', available: false });
  }
  
  // Twitter/X (public profile check - basic)
  try {
    // Twitter API artık çok kısıtlı, basic URL check yapıyoruz
    const twRes = await axios.head(`https://twitter.com/${encodeURIComponent(username)}`, {
      timeout: 5000,
      validateStatus: () => true
    });
    if (twRes.status === 200) {
      results.push({
        platform: 'Twitter/X',
        available: true,
        url: `https://twitter.com/${username}`,
        note: 'Profil var (detay için API gerekli)'
      });
    } else {
      results.push({ platform: 'Twitter/X', available: false });
    }
  } catch {
    results.push({ platform: 'Twitter/X', available: false });
  }
  
  // Instagram (basic check)
  try {
    const igRes = await axios.head(`https://instagram.com/${encodeURIComponent(username)}`, {
      timeout: 5000,
      validateStatus: () => true
    });
    if (igRes.status === 200) {
      results.push({
        platform: 'Instagram',
        available: true,
        url: `https://instagram.com/${username}`,
        note: 'Profil var (detay için scraping gerekli)'
      });
    } else {
      results.push({ platform: 'Instagram', available: false });
    }
  } catch {
    results.push({ platform: 'Instagram', available: false });
  }
  
  // Reddit
  try {
    const rdRes = await axios.get(`https://www.reddit.com/user/${encodeURIComponent(username)}/about.json`, {
      timeout: 5000,
      headers: { 'User-Agent': 'Zagros-OSINT/1.0' }
    });
    if (rdRes.data?.data) {
      results.push({
        platform: 'Reddit',
        available: true,
        url: `https://reddit.com/user/${username}`,
        karma: rdRes.data.data.total_karma,
        created: new Date(rdRes.data.data.created_utc * 1000).toISOString()
      });
    }
  } catch {
    results.push({ platform: 'Reddit', available: false });
  }
  
  return results;
}

// Spotify'da email ara (public API yok, breach verisinden veya basic check)
async function searchSpotifyByEmail(email) {
  // Spotify public API'de email arama yok
  // Ancak breach verilerinden veya başka kaynaklardan çıkarım yapılabilir
  // Şimdilik placeholder - gerçek implementation için:
  // - Spotify breach verisi gerekiyor
  // - Veya Spotify web scraping (rate limitli)
  return [];
}

// Reddit'te email ara (varsa)
async function searchRedditByEmail(email) {
  try {
    // Reddit'te email arama doğrudan yok
    // Ancak bazı durumlarda username pattern'i çıkarılabilir
    return [];
  } catch {
    return [];
  }
}

// Platform bazlı email arama - Intelx tarzı
async function searchPlatformsByEmail(email) {
  const platforms = [];
  const username = email.split('@')[0]; // email'den username tahmini
  
  // Spotify pattern check (örnek: spotify'da username = email prefix olabilir)
  // Gerçek Spotify API'si olmadığından simülasyon yapıyoruz
  // Gerçek implementation için Spotify hesap recovery endpoint'i kullanılabilir
  
  // LinkedIn pattern (public search)
  try {
    const lnCheck = await axios.head(`https://www.linkedin.com/in/${encodeURIComponent(username)}`, {
      timeout: 5000,
      validateStatus: () => true
    });
    if (lnCheck.status === 200) {
      platforms.push({
        platform: 'LinkedIn',
        found: true,
        username: username,
        url: `https://linkedin.com/in/${username}`,
        note: 'Profil var (detay için API gerekli)',
        confidence: 'medium'
      });
    }
  } catch { /* ignore */ }
  
  // Pinterest check
  try {
    const ptCheck = await axios.head(`https://pinterest.com/${encodeURIComponent(username)}`, {
      timeout: 5000,
      validateStatus: () => true
    });
    if (ptCheck.status === 200) {
      platforms.push({
        platform: 'Pinterest',
        found: true,
        username: username,
        url: `https://pinterest.com/${username}`,
        confidence: 'medium'
      });
    }
  } catch { /* ignore */ }
  
  // Tumblr check
  try {
    const tmCheck = await axios.head(`https://${encodeURIComponent(username)}.tumblr.com`, {
      timeout: 5000,
      validateStatus: () => true
    });
    if (tmCheck.status === 200) {
      platforms.push({
        platform: 'Tumblr',
        found: true,
        username: username,
        url: `https://${username}.tumblr.com`,
        confidence: 'medium'
      });
    }
  } catch { /* ignore */ }
  
  // Twitch check
  try {
    const twCheck = await axios.head(`https://twitch.tv/${encodeURIComponent(username)}`, {
      timeout: 5000,
      validateStatus: () => true
    });
    if (twCheck.status === 200) {
      platforms.push({
        platform: 'Twitch',
        found: true,
        username: username,
        url: `https://twitch.tv/${username}`,
        confidence: 'medium'
      });
    }
  } catch { /* ignore */ }
  
  // TikTok check
  try {
    const ttCheck = await axios.head(`https://tiktok.com/@${encodeURIComponent(username)}`, {
      timeout: 5000,
      validateStatus: () => true
    });
    if (ttCheck.status === 200) {
      platforms.push({
        platform: 'TikTok',
        found: true,
        username: username,
        url: `https://tiktok.com/@${username}`,
        confidence: 'low'
      });
    }
  } catch { /* ignore */ }
  
  // Medium check
  try {
    const mdCheck = await axios.head(`https://medium.com/@${encodeURIComponent(username)}`, {
      timeout: 5000,
      validateStatus: () => true
    });
    if (mdCheck.status === 200) {
      platforms.push({
        platform: 'Medium',
        found: true,
        username: username,
        url: `https://medium.com/@${username}`,
        confidence: 'medium'
      });
    }
  } catch { /* ignore */ }
  
  // SoundCloud check (müzik platformu - Spotify alternatifi)
  try {
    const scCheck = await axios.head(`https://soundcloud.com/${encodeURIComponent(username)}`, {
      timeout: 5000,
      validateStatus: () => true
    });
    if (scCheck.status === 200) {
      platforms.push({
        platform: 'SoundCloud',
        found: true,
        username: username,
        url: `https://soundcloud.com/${username}`,
        note: 'Müzik platformu (Spotify alternatifi)',
        confidence: 'medium'
      });
    }
  } catch { /* ignore */ }
  
  // Dev.to check (geliştirici platformu)
  try {
    const dvCheck = await axios.head(`https://dev.to/${encodeURIComponent(username)}`, {
      timeout: 5000,
      validateStatus: () => true
    });
    if (dvCheck.status === 200) {
      platforms.push({
        platform: 'Dev.to',
        found: true,
        username: username,
        url: `https://dev.to/${username}`,
        confidence: 'medium'
      });
    }
  } catch { /* ignore */ }
  
  // TryHackMe check (cybersecurity platformu)
  try {
    const thmCheck = await axios.head(`https://tryhackme.com/p/${encodeURIComponent(username)}`, {
      timeout: 5000,
      validateStatus: () => true
    });
    if (thmCheck.status === 200) {
      platforms.push({
        platform: 'TryHackMe',
        found: true,
        username: username,
        url: `https://tryhackme.com/p/${username}`,
        confidence: 'medium'
      });
    }
  } catch { /* ignore */ }
  
  return platforms;
}

// Daha fazla breach kaynağı
async function checkLeakLookup(email) {
  // Leak-Lookup API (ücretsiz tier var ama API key gerekli)
  // Şimdilik placeholder
  return null;
}

async function checkEmailrep(email) {
  try {
    const res = await axios.get(`https://emailrep.io/${encodeURIComponent(email)}`, {
      timeout: 5000
    });
    const emailrepInfo = res.data;
    const sites = [];

    // Emailrep sonuçlarını ekle
    if (emailrepInfo) {
      sites.push({
        site: 'EmailRep',
        username: 'N/A',
        reputation: emailrepInfo.reputation,
        suspicious: emailrepInfo.suspicious,
        references: emailrepInfo.references,
        details: emailrepInfo.details,
        leak_type: 'emailrep'
      });
    }

    // HaveIBeenPwned API'den gelen external sources'ları ekle
    const externalSources = await checkHaveIBeenPwned(email);
    for (const ext of externalSources) {
      sites.push({
        site: ext.site,
        source: ext.source,
        breach_date: ext.breach_date,
        added_date: ext.added_date,
        description: ext.description,
        data_classes: ext.data_classes,
        is_verified: ext.is_verified,
        is_fabricated: ext.is_fabricated,
        is_sensitive: ext.is_sensitive,
        leak_type: 'breach'
      });
    }

    return {
      email,
      results: sites,
      count: sites.length,
      external_sources_count: externalSources.length
    };
  } catch {
    return null;
  }
}

// HaveIBeenPwned breach check (standalone)
async function checkHaveIBeenPwned(email) {
  try {
    const res = await axios.get(
      `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(email)}`,
      {
        headers: {
          'User-Agent': 'Zagros-OSINT-Tool',
          'Accept': 'application/json'
        },
        timeout: 8000
      }
    );
    return (res.data || []).map(b => ({
      source: 'HaveIBeenPwned',
      site: b.Name,
      domain: b.Domain || b.Name.toLowerCase().replace(/\s+/g, ''),
      breach_date: b.BreachDate,
      added_date: b.AddedDate,
      description: b.Description,
      data_classes: b.DataClasses || [],
      is_verified: b.IsVerified,
      is_sensitive: b.IsSensitive,
      is_spam_list: b.IsSpamList || false,
      pwn_count: b.PwnCount || 0,
      logo_path: b.LogoPath || null
    }));
  } catch (error) {
    if (error.response?.status === 404) return []; // Clean
    console.log('[HIBP] Hata:', error.message);
    return [];
  }
}

// Gravatar - Email'den profil bilgisi
async function getGravatarInfo(email) {
  try {
    const crypto = await import('crypto');
    const hash = crypto.createHash('md5').update(email.toLowerCase().trim()).digest('hex');
    const response = await axios.get(`https://gravatar.com/${hash}.json`, {
      timeout: 5000
    });
    const entry = response.data?.entry?.[0];
    if (!entry) return null;
    return {
      username: entry.preferredUsername,
      name: entry.displayName,
      avatar: entry.photos?.[0]?.value,
      profile_url: entry.profileUrl,
      urls: entry.urls || [],
      accounts: entry.accounts || []
    };
  } catch (error) {
    return null;
  }
}

// GitHub'da email ara
async function searchGitHubByEmail(email) {
  try {
    // GitHub API'de email arama yok, ama commit'lerde email geçmişi olabilir
    // GitHub Search API - users by email in bio/location (public)
    const searchRes = await axios.get(`https://api.github.com/search/users?q=${encodeURIComponent(email)}+in:email`, {
      headers: { 'Accept': 'application/vnd.github.v3+json' },
      timeout: 5000
    });
    const users = [];
    if (searchRes.data?.items) {
      for (const u of searchRes.data.items.slice(0, 5)) {
        // Kullanıcı detaylarını çek
        try {
          const userRes = await axios.get(`https://api.github.com/users/${u.login}`, {
            headers: { 'Accept': 'application/vnd.github.v3+json' },
            timeout: 5000
          });
          const ud = userRes.data;
          users.push({
            site: 'GitHub',
            username: ud.login,
            url: ud.html_url,
            avatar: ud.avatar_url,
            name: ud.name || null,
            bio: ud.bio || null,
            location: ud.location || null,
            company: ud.company || null,
            blog: ud.blog || null,
            public_repos: ud.public_repos,
            followers: ud.followers,
            following: ud.following,
            created_at: ud.created_at
          });
        } catch { /* skip */ }
      }
    }
    return users;
  } catch (err) {
    console.log('[GitHub] Arama hatası:', err.message);
    return [];
  }
}

// Email validasyon
function validateEmail(email) {
  const result = { valid: false, format: false, domain: null, disposable: false, free: false };
  
  // Format kontrolü
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  result.format = emailRegex.test(email);
  if (!result.format) return result;
  result.valid = true;
  
  // Domain analizi
  const domain = email.split('@')[1].toLowerCase();
  result.domain = domain;
  
  // Free email sağlayıcıları
  const freeDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com', 'yandex.com', 'mail.ru', 'protonmail.com', 'icloud.com'];
  result.free = freeDomains.includes(domain);
  
  // Disposable email listesi (basit)
  const disposableDomains = ['tempmail.com', 'throwaway.com', 'mailinator.com', 'guerrillamail.com', '10minutemail.com', 'fakeemail.com'];
  result.disposable = disposableDomains.includes(domain);
  
  return result;
}

// FindCord API (RAW) - Geliştirilmiş versiyon
// Not: Uygulamanın diğer kısımları `UserInfo`, `Guilds`, `GuildName` gibi alanları bekliyor.
// Bu yüzden burada RAW response dönüyoruz.
async function getFindCordData(userId) {
  try {
    if (Date.now() < findCordRateLimitedUntil) {
      console.log(`[FindCord] Rate limit aktif, ${userId} için atlanıyor`);
      return null;
    }

    const cacheKey = String(userId);
    const cached = findCordCache.get(cacheKey);
    if (cached && (Date.now() - cached.time) < cached.ttl) {
      console.log(`[FindCord] Cache hit: ${userId}`);
      return cached.data;
    }

    console.log(`[FindCord] API çağrısı: ${userId}`);
    
    const response = await axios.get(`https://app.findcord.com/api/user/${userId}`, {
      headers: {
        'Authorization': FINDCORD_API_KEY,
        'Accept': 'application/json',
        'User-Agent': 'ZagrosOSINT/1.0'
      },
      timeout: API_TIMEOUT,
      validateStatus: (status) => status < 500 // 5xx hataları için reject etme
    });
    
    // 4xx hataları için özel işlem
    if (response.status === 404) {
      console.log(`[FindCord] Kullanıcı bulunamadı: ${userId}`);
      findCordCache.set(cacheKey, { time: Date.now(), ttl: FINDCORD_NEG_TTL_MS, data: null });
      return null;
    }
    
    if (response.status === 429) {
      findCordRateLimitedUntil = Date.now() + FINDCORD_RATE_LIMIT_COOLDOWN_MS;
      console.log(`[FindCord] ⚠️ Rate limit! ${FINDCORD_RATE_LIMIT_COOLDOWN_MS/60000} dk bekleme`);
      findCordCache.set(cacheKey, { time: Date.now(), ttl: FINDCORD_NEG_TTL_MS, data: null });
      return null;
    }
    
    if (response.status !== 200) {
      console.log(`[FindCord] HTTP ${response.status}: ${userId}`);
      findCordCache.set(cacheKey, { time: Date.now(), ttl: FINDCORD_NEG_TTL_MS, data: null });
      return null;
    }
    
    const data = response.data;
    
    if (!data) {
      console.log(`[FindCord] Boş yanıt: ${userId}`);
      return null;
    }
    
    // FindCord verisini normalize et - Guilds alanını her formatta yakala
    const guilds = data.Guilds || data.guilds || data.Guild || data.guild || [];
    if (Array.isArray(guilds) && guilds.length > 0) {
      console.log(`[FindCord] ${guilds.length} guild bulundu: ${userId}`);
      // Her guild için isim ve görsel bilgilerini normalize et
      for (const g of guilds) {
        const gid = String(g.GuildId || g.guild_id || g.id || g.ID || '');
        const gname = g.GuildName || g.guild_name || g.name || g.Name || g.guildName || '';
        const gicon = g.GuildIcon || g.guild_icon || g.icon || g.Icon || g.iconHash || '';
        const gbanner = g.GuildBanner || g.guild_banner || g.banner || g.Banner || g.bannerHash || '';
        const gdesc = g.Description || g.description || g.desc || g.desc || '';
        
        // Guild ismini cache'e kaydet
        if (gid && gname) {
          rememberGuildName(gid, gname);
        }
      }
    }
    
    // UserInfo kontrolü
    const userInfo = data.UserInfo || data.userInfo || data.user_info || {};
    if (userInfo.UserName || userInfo.username) {
      console.log(`[FindCord] Kullanıcı bulundu: ${userInfo.UserName || userInfo.username}`);
    }
    
    findCordCache.set(cacheKey, { time: Date.now(), ttl: FINDCORD_CACHE_TTL_MS, data });
    return data;
  } catch (error) {
    const status = error.response?.status;
    const message = error.response?.data?.message || error.response?.statusText || error.message;
    console.log(`[FindCord] ✗ Hata ${userId}: ${status} - ${message}`);
    const cacheKey = String(userId);
    if (status === 404 || status === 429) {
      findCordCache.set(cacheKey, { time: Date.now(), ttl: FINDCORD_NEG_TTL_MS, data: null });
    }
    if (status === 429) {
      findCordRateLimitedUntil = Date.now() + FINDCORD_RATE_LIMIT_COOLDOWN_MS;
      console.log(`[FindCord] ⚠️ Rate limit! ${FINDCORD_RATE_LIMIT_COOLDOWN_MS/60000} dk bekleme`);
    }
    return null;
  }
}

function normalizeFindCordData(userId, data) {
  if (!data) {
    console.log(`[normalizeFindCordData] Boş data: ${userId}`);
    return null;
  }
  
  // Tüm olası user info alanlarını kontrol et
  const ui = data.UserInfo || data.userInfo || data.user_info || data.Userinfo || data.userinfo || {};
  
  // Avatar alanlarını genişlet
  const avatar = ui.UserdisplayAvatar || ui.user_display_avatar || ui.UserDisplayAvatar || ui.avatar || 
                 ui.Avatar || ui.userAvatar || data.avatar || data.Avatar || null;
  
  // Banner alanlarını genişlet
  const banner = ui.UserBanner || ui.user_banner || ui.Userbanner || ui.banner || 
                 ui.Banner || ui.userBanner || data.banner || data.Banner || null;

  // Username alanlarını genişlet
  const username = ui.UserName || ui.username || ui.user_name || ui.User || ui.user || 
                     data.username || data.Username || data.user || null;
  
  // Global name alanlarını genişlet
  const global_name = ui.UserGlobalName || ui.global_name || ui.user_global_name || ui.GlobalName || 
                      ui.globalName || data.global_name || data.GlobalName || null;

  // Tüm Discord verilerini topla
  const raw = data;
  
  // Sunucu (Guild) verilerini normalize et - icon ve bannerları da dahil et
  let guilds = [];
  const rawGuilds = raw.Guilds || raw.guilds || raw.Servers || raw.servers || [];
  if (Array.isArray(rawGuilds)) {
    guilds = rawGuilds.map(g => {
      const guildId = g.id || g.Id || g.guild_id || g.GuildId || g.GuildID || '';
      const iconHash = g.icon || g.Icon || g.guild_icon || g.GuildIcon || null;
      const bannerHash = g.banner || g.Banner || g.guild_banner || g.GuildBanner || null;
      
      // Icon URL oluştur
      let iconUrl = null;
      if (iconHash) {
        const ext = iconHash.startsWith('a_') ? 'gif' : 'png';
        iconUrl = `https://cdn.discordapp.com/icons/${guildId}/${iconHash}.${ext}?size=128`;
      }
      
      // Banner URL oluştur
      let bannerUrl = null;
      if (bannerHash) {
        const ext = bannerHash.startsWith('a_') ? 'gif' : 'png';
        bannerUrl = `https://cdn.discordapp.com/banners/${guildId}/${bannerHash}.${ext}?size=512`;
      }
      
      // Sunucudaki kullanıcı bilgileri
      const nickname = g.nick || g.Nick || g.nickname || g.Nickname || g.user_nick || g.UserNick || null;
      const isOwner = g.owner || g.Owner || g.is_owner || g.IsOwner || false;
      const perms = g.permissions || g.Permissions || 0;
      // Discord yetkilerini kontrol et
      const isAdmin = isOwner || (perms & 0x8) === 0x8; // ADMINISTRATOR
      const isMod = (perms & 0x2000) === 0x2000; // KICK_MEMBERS
      
      return {
        id: guildId,
        name: g.name || g.Name || g.guild_name || g.GuildName || 'Bilinmeyen Sunucu',
        icon: iconUrl,
        icon_hash: iconHash,
        banner: bannerUrl,
        banner_hash: bannerHash,
        owner: isOwner,
        admin: isAdmin,
        moderator: isMod,
        permissions: perms,
        join_time: g.join_time || g.JoinTime || g.joined_at || g.JoinedAt || null,
        booster: g.booster || g.Booster || g.is_booster || g.IsBooster || false,
        position: g.position || g.Position || 0,
        nickname: nickname, // Sunucudaki özel isim
        user_name: username, // Genel Discord kullanıcı adı
        global_name: global_name // Global display name
      };
    });
  }
  
  // Tüm Discord verilerini normalize et
  const normalized = {
    id: userId,
    username,
    global_name,
    avatar,
    banner,
    bio: ui.UserBio || ui.bio || ui.user_bio || ui.Bio || ui.bio || data.bio || data.Bio || null,
    pronouns: ui.UserPronouns || ui.pronouns || ui.user_pronouns || ui.Pronouns || data.pronouns || null,
    presence: ui.Presence || ui.presence || ui.UserPresence || ui.user_presence || data.Presence || data.presence || null,
    badges: Array.isArray(ui.UserBadge || ui.user_badge || ui.Badges) ? 
            (ui.UserBadge || ui.user_badge || ui.Badges) : 
            (data.badges || data.Badges || []),
    guilds: guilds,
    // Ek Discord verileri
    connections: raw.Connections || raw.connections || raw.LinkedAccounts || raw.linked_accounts || [],
    activities: raw.Activities || raw.activities || raw.Games || raw.games || [],
    platform: raw.Platform || raw.platform || null,
    nitro: raw.Nitro || raw.nitro || raw.IsNitro || raw.is_nitro || false,
    nitro_type: raw.NitroType || raw.nitro_type || null,
    phone: raw.Phone || raw.phone || raw.PhoneNumber || raw.phone_number || null,
    nsfw_allowed: raw.NsfwAllowed || raw.nsfw_allowed || null,
    mfa_enabled: raw.MfaEnabled || raw.mfa_enabled || raw.TwoFA || raw.two_fa || false,
    verified: raw.Verified || raw.verified || raw.IsVerified || raw.is_verified || false,
    email_verified: raw.EmailVerified || raw.email_verified || null,
    created_at: raw.CreatedAt || raw.created_at || raw.AccountCreated || raw.account_created || null,
    locale: raw.Locale || raw.locale || null,
    flags: raw.Flags || raw.flags || raw.PublicFlags || raw.public_flags || 0,
    // Arkadaş ve mesaj verileri
    top_friends: raw.TopFriends || raw.top_friends || raw.CloseFriends || raw.close_friends || [],
    voice_friends: raw.VoiceFriends || raw.voice_friends || raw.VoiceActivity || raw.voice_activity || [],
    recent_messages: raw.RecentMessages || raw.recent_messages || raw.Messages || raw.messages || [],
    display_names: raw.DisplayNames || raw.display_names || raw.Usernames || raw.usernames || [],
    // Kişisel bilgiler
    top_name: raw.TopName || raw.top_name || raw.RealName || raw.real_name || null,
    top_age: raw.TopAge || raw.top_age || raw.Age || raw.age || null,
    top_sex: raw.TopSex || raw.top_sex || raw.Sex || raw.sex || raw.Gender || raw.gender || null,
    raw: data
  };

  // Avatar URL oluştur
  if (avatar) {
    if (avatar.startsWith('http')) {
      normalized.avatar_url = avatar;
    } else if (avatar.length > 10) {
      // Hash formatında
      normalized.avatar_url = `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png?size=256`;
    }
  } else {
    const defaultIndex = parseInt(userId) % 5;
    normalized.avatar_url = `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`;
  }

  // Banner URL oluştur
  if (banner) {
    if (banner.startsWith('http')) {
      normalized.banner_url = banner;
    } else if (banner.length > 10) {
      normalized.banner_url = `https://cdn.discordapp.com/banners/${userId}/${banner}.png?size=512`;
    }
  }

  console.log(`[normalizeFindCordData] Normalized: ${username || 'unknown'} (${userId})`);
  return normalized;
}

// �️ SUNUCU İSMİ ÇÖZÜMLEME SİSTEMİ (Bot token gerekmez!)
const GUILD_NAMES_CACHE_FILE = path.join(DATA_DIR, 'guild_names_cache.json');
let guildNamesCache = new Map();

// Cache'i yükle
try {
  if (fs.existsSync(GUILD_NAMES_CACHE_FILE)) {
    const cached = JSON.parse(fs.readFileSync(GUILD_NAMES_CACHE_FILE, 'utf8'));
    guildNamesCache = new Map(Object.entries(cached));
    console.log(`[Guild Names] ${guildNamesCache.size} cached name loaded`);
  }
} catch { /* ignore */ }

function saveGuildNamesCache() {
  try {
    const obj = Object.fromEntries(guildNamesCache);
    fs.writeFileSync(GUILD_NAMES_CACHE_FILE, JSON.stringify(obj, null, 2));
  } catch { /* ignore */ }
}

function rememberGuildName(guildId, name) {
  if (!guildId || !name) return;
  guildNamesCache.set(String(guildId), name);
  saveGuildNamesCache();
}

function stripHtml(input) {
  if (!input) return '';
  return String(input).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function sanitizeGuildMetadata(meta = {}) {
  const cleaned = {};
  if (meta.name) cleaned.name = String(meta.name).trim().slice(0, 120);
  if (meta.icon) cleaned.icon = String(meta.icon).trim().slice(0, 512);
  if (meta.banner) cleaned.banner = String(meta.banner).trim().slice(0, 512);
  if (meta.description) cleaned.description = stripHtml(meta.description).slice(0, 800);
  return cleaned;
}

async function applyGuildMetadata(guild, meta = {}, sourceLabel = null) {
  if (!guild || !guild.id) return false;
  const sanitized = sanitizeGuildMetadata(meta);
  let changed = false;

  if (sanitized.name && sanitized.name !== guild.name) {
    guild.name = sanitized.name;
    changed = true;
  }
  if (sanitized.icon && sanitized.icon !== guild.icon) {
    guild.icon = sanitized.icon;
    changed = true;
  }
  if (sanitized.banner && sanitized.banner !== guild.banner) {
    guild.banner = sanitized.banner;
    changed = true;
  }
  if (sanitized.description && sanitized.description !== guild.description) {
    guild.description = sanitized.description;
    changed = true;
  }

  if (sourceLabel) {
    guild.metadata_source = sourceLabel;
  }

  ensureGuildVisuals(guild);

  if (changed) {
    guild.metadata_updated_at = new Date().toISOString();
    await persistGuildMetadata(guild.id, sanitized);
  }

  return changed;
}

function buildGuildIconUrl(guildId, iconHash) {
  // Yeni Discord CDN helper'ını kullan
  return discordGuildIconUrl(guildId, iconHash, 256) || null;
}

function buildGuildBannerUrl(guildId, bannerHash) {
  // Yeni Discord CDN helper'ını kullan
  return discordGuildBannerUrl(guildId, bannerHash, 512) || null;
}

function ensureGuildVisuals(guild) {
  if (!guild) return;
  if (!guild.icon_url && guild.icon) {
    guild.icon_url = guild.icon?.startsWith('http') ? guild.icon : buildGuildIconUrl(guild.id, guild.icon);
  }
  if (!guild.banner_url && guild.banner) {
    guild.banner_url = guild.banner?.startsWith('http') ? guild.banner : buildGuildBannerUrl(guild.id, guild.banner);
  }
  if (!guild.icon_url) {
    // Varsayılan Discord avatar (yeni sistem: ID bazlı)
    const fallbackIndex = guild.id ? (Number(BigInt(guild.id) >> 22n) % 6) : 0;
    guild.icon_url = `https://cdn.discordapp.com/embed/avatars/${fallbackIndex}.png`;
  }
  if (!guild.banner_url) {
    guild.banner_url = buildDefaultGuildBannerUrl(guild.id, guild.name);
  }
}

async function persistGuildMetadata(guildId, meta = {}) {
  if (!guildId) return;
  if (meta.name) rememberGuildName(guildId, meta.name);
  if (!isDBReady()) return;
  try {
    await dbSaveGuildName(
      guildId,
      meta.name || null,
      meta.icon || null,
      meta.banner || null,
      meta.description || null
    );
  } catch (err) {
    console.log(`[GuildCache] DB yazılamadı (${guildId}): ${err.message}`);
  }
}

function buildDefaultGuildBannerUrl(guildId, guildName) {
  const name = String(guildName || '').slice(0, 40);
  const seed = String(guildId || '0');
  const n = seed.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  const hue = n % 360;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue}, 65%, 10%)"/>
      <stop offset="0.6" stop-color="hsl(${(hue + 50) % 360}, 70%, 8%)"/>
      <stop offset="1" stop-color="#020402"/>
    </linearGradient>
    <linearGradient id="rain" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="rgba(0,255,0,0.0)"/>
      <stop offset="0.5" stop-color="rgba(0,255,0,0.12)"/>
      <stop offset="1" stop-color="rgba(0,255,0,0.0)"/>
    </linearGradient>
  </defs>
  <rect width="960" height="540" fill="url(#bg)"/>
  <g opacity="0.55">
    ${Array.from({ length: 70 }).map((_, i) => {
      const x = (i * 37 + n) % 960;
      const w = 2 + ((i + n) % 3);
      const y = ((i * 53) % 540);
      const h = 180 + ((i * 31) % 320);
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#rain)"/>`;
    }).join('')}
  </g>
  <rect x="40" y="380" width="880" height="120" rx="18" fill="rgba(0,0,0,0.55)" stroke="rgba(0,255,0,0.18)"/>
  <text x="80" y="452" font-family="monospace" font-size="44" fill="rgba(0,255,0,0.92)" letter-spacing="2">${name || `Sunucu #${String(guildId).slice(-6)}`}</text>
  <text x="80" y="492" font-family="monospace" font-size="22" fill="rgba(0,255,0,0.65)">discord.gg/zagros</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// Discord Widget API - Herkese açık, token gerekmez!
async function fetchDiscordWidget(guildId) {
  try {
    const res = await axios.get(`https://discord.com/api/v9/guilds/${guildId}/widget.json`, {
      timeout: 3000, // Daha kısa timeout
      headers: { 'Accept': 'application/json' }
    });
    if (res.data?.name) {
      return {
        name: res.data.name,
        instant_invite: res.data.instant_invite || null,
        presence_count: res.data.presence_count || 0,
        source: 'widget'
      };
    }
  } catch (e) {
    // Widget kapalı olabilir, 404 normal
  }
  return null;
}

// Disboard.org'dan sunucu ismi çek - daha esnek parsing
async function fetchDisboardInfo(guildId) {
  try {
    const res = await axios.get(`https://disboard.org/search?keyword=${guildId}`, {
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    });
    const html = res.data;
    
    // Farklı pattern'ler dene - data-id attribute'ü ile ara
    const patterns = [
      new RegExp(`data-id="${guildId}"[^>]*>[\\s\\S]*?<h3[^>]*>([^<]+)</h3>`, 'i'),
      new RegExp(`data-id='${guildId}'[^>]*>[\\s\\S]*?<h3[^>]*>([^<]+)</h3>`, 'i'),
      new RegExp(`class="[^"]*server-item[^"]*"[^>]*data-id="${guildId}"[\\s\\S]*?<h3[^>]*>([^<]+)</h3>`, 'i')
    ];
    
    let name = null;
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        name = match[1].trim();
        break;
      }
    }
    
    // Alternatif: Meta tag veya başlık ara
    if (!name) {
      const metaMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i);
      if (metaMatch && metaMatch[1].includes(guildId.slice(-6))) {
        name = metaMatch[1].trim();
      }
    }
    
    if (!name) return null;
    
    // İkon ara - data-src veya src attribute'ü
    let icon = null;
    const iconPatterns = [
      new RegExp(`data-id="${guildId}"[^>]*data-src="([^"]+)"`, 'i'),
      new RegExp(`data-id="${guildId}"[^>]*src="([^"]+)"`, 'i'),
      new RegExp(`data-id="${guildId}"[\\s\\S]*?<img[^>]*src="([^"]+)"`, 'i')
    ];
    for (const pattern of iconPatterns) {
      const match = html.match(pattern);
      if (match) {
        icon = match[1].startsWith('http') ? match[1] : `https://disboard.org${match[1]}`;
        break;
      }
    }
    
    // Açıklama ara
    let description = null;
    const descPatterns = [
      new RegExp(`data-id="${guildId}"[\\s\\S]*?<p[^>]*class="[^"]*description[^"]*"[^>]*>([\\s\\S]*?)</p>`, 'i'),
      new RegExp(`data-id="${guildId}"[\\s\\S]*?<div[^>]*class="[^"]*desc[^"]*"[^>]*>([\\s\\S]*?)</div>`, 'i')
    ];
    for (const pattern of descPatterns) {
      const match = html.match(pattern);
      if (match) {
        description = stripHtml(match[1]);
        if (description.length > 10) break;
      }
    }
    
    return {
      name,
      icon,
      description,
      source: 'disboard'
    };
  } catch (err) {
    console.log(`[Disboard] Hata ${guildId}:`, err.message);
  }
  return null;
}

// Top.gg'den sunucu bilgisi çek
async function fetchTopGGInfo(guildId) {
  try {
    const res = await axios.get(`https://top.gg/tr/discord/servers/${guildId}`, {
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });
    const html = res.data;
    
    // Sunucu ismi - og:title veya h1
    let name = null;
    const titleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i);
    if (titleMatch) {
      name = titleMatch[1].trim();
    }
    if (!name) {
      const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      if (h1Match) name = h1Match[1].trim();
    }
    
    // Açıklama - meta description veya og:description
    let description = null;
    const descMatch = html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/i) ||
                      html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i);
    if (descMatch) {
      description = descMatch[1].trim().slice(0, 500);
    }
    
    // İkon - og:image veya sayfadaki ilk resim
    let icon = null;
    const iconMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i);
    if (iconMatch) {
      icon = iconMatch[1];
      if (!icon.startsWith('http')) {
        icon = `https://top.gg${icon}`;
      }
    }
    
    // Banner - sayfadaki büyük arka plan resmi
    let banner = null;
    const bannerMatch = html.match(/style="[^"]*background[^"]*url\(([^)]+)\)/i) ||
                        html.match(/background-image:\s*url\(['"]?([^'"]+)['"]?\)/i);
    if (bannerMatch) {
      banner = bannerMatch[1].replace(/['"]/g, '');
      if (!banner.startsWith('http')) {
        banner = `https://top.gg${banner}`;
      }
    }
    
    if (!name) return null;
    
    return {
      name,
      icon,
      banner,
      description,
      source: 'topgg'
    };
  } catch (err) {
    console.log(`[TopGG] Hata ${guildId}:`, err.message);
  }
  return null;
}

// DiscordServers.com'dan sunucu bilgisi çek
async function fetchDiscordServersInfo(guildId) {
  try {
    const res = await axios.get(`https://discordservers.com/server/${guildId}`, {
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    const html = res.data;
    
    // Sunucu ismi
    let name = null;
    const titleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i);
    if (titleMatch) {
      name = titleMatch[1].trim();
    }
    if (!name) {
      const h1Match = html.match(/<h1[^>]*class="[^"]*server-name[^"]*"[^>]*>([^<]+)<\/h1>/i) ||
                      html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      if (h1Match) name = h1Match[1].trim();
    }
    
    // Açıklama
    let description = null;
    const descMatch = html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/i) ||
                      html.match(/<div[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (descMatch) {
      description = stripHtml(descMatch[1]).slice(0, 500);
    }
    
    // İkon
    let icon = null;
    const iconMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i) ||
                      html.match(/<img[^>]*class="[^"]*server-icon[^"]*"[^>]*src="([^"]+)"/i);
    if (iconMatch) {
      icon = iconMatch[1];
      if (!icon.startsWith('http')) {
        icon = `https://discordservers.com${icon}`;
      }
    }
    
    // Banner
    let banner = null;
    const bannerMatch = html.match(/<div[^>]*class="[^"]*banner[^"]*"[^>]*style="[^"]*background[^"]*url\(([^)]+)\)/i) ||
                        html.match(/background-image:\s*url\(['"]?([^'"]+)['"]?\)/i);
    if (bannerMatch) {
      banner = bannerMatch[1].replace(/['"]/g, '');
      if (!banner.startsWith('http')) {
        banner = `https://discordservers.com${banner}`;
      }
    }
    
    if (!name) return null;
    
    return {
      name,
      icon,
      banner,
      description,
      source: 'discordservers'
    };
  } catch (err) {
    console.log(`[DiscordServers] Hata ${guildId}:`, err.message);
  }
  return null;
}

// Discadia.com'dan sunucu bilgisi çek
async function fetchDiscadiaInfo(guildId) {
  try {
    const res = await axios.get(`https://discadia.com/server/${guildId}`, {
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    const html = res.data;
    
    // Sunucu ismi - meta title veya h1
    let name = null;
    const titleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i);
    if (titleMatch) {
      name = titleMatch[1].trim();
    }
    if (!name) {
      const h1Match = html.match(/<h1[^>]*class="[^"]*server-name[^"]*"[^>]*>([^<]+)<\/h1>/i) ||
                      html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      if (h1Match) name = h1Match[1].trim();
    }
    
    // Açıklama
    let description = null;
    const descMatch = html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/i) ||
                      html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i);
    if (descMatch) {
      description = descMatch[1].trim().slice(0, 500);
    }
    
    // İkon - og:image veya server icon
    let icon = null;
    const iconMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i) ||
                      html.match(/<img[^>]*class="[^"]*server-icon[^"]*"[^>]*src="([^"]+)"/i) ||
                      html.match(/<img[^>]*class="[^"]*avatar[^"]*"[^>]*src="([^"]+)"/i);
    if (iconMatch) {
      icon = iconMatch[1];
      if (!icon.startsWith('http')) {
        icon = `https://discadia.com${icon}`;
      }
    }
    
    // Banner - büyük arka plan resmi
    let banner = null;
    const bannerMatch = html.match(/<div[^>]*class="[^"]*banner[^"]*"[^>]*style="[^"]*background[^"]*url\(([^)]+)\)/i) ||
                        html.match(/background-image:\s*url\(['"]?([^'"]+)['"]?\)/i) ||
                        html.match(/<img[^>]*class="[^"]*banner[^"]*"[^>]*src="([^"]+)"/i);
    if (bannerMatch) {
      banner = bannerMatch[1].replace(/['"]/g, '');
      if (!banner.startsWith('http')) {
        banner = `https://discadia.com${banner}`;
      }
    }
    
    if (!name) return null;
    
    return {
      name,
      icon,
      banner,
      description,
      source: 'discadia'
    };
  } catch (err) {
    console.log(`[Discadia] Hata ${guildId}:`, err.message);
  }
  return null;
}

// Disboard.org tag sayfasından sunucu listesi çek
async function fetchDisboardTagList(tag = 'türk') {
  try {
    const res = await axios.get(`https://disboard.org/tr/servers/tag/${encodeURIComponent(tag)}`, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9'
      }
    });
    const html = res.data;
    const servers = [];
    
    // Sunucu kartlarını bul - data-id attribute'ü ile
    const serverBlocks = [...html.matchAll(/<li[^>]*data-id="(\d+)"[^>]*>[\s\S]*?<\/li>/gi)];
    
    for (const blockMatch of serverBlocks.slice(0, 20)) {
      const block = blockMatch[0];
      const id = blockMatch[1];
      
      // İsim
      const nameMatch = block.match(/<h3[^>]*>([^<]+)<\/h3>/i);
      const name = nameMatch?.[1]?.trim();
      
      // İkon
      const iconMatch = block.match(/data-background-image="([^"]+)"/i) ||
                       block.match(/data-src="([^"]+)"/i) ||
                       block.match(/src="([^"]+\.(?:png|jpg|jpeg|gif|webp))"/i);
      let icon = iconMatch?.[1];
      if (icon && !icon.startsWith('http')) {
        icon = `https://disboard.org${icon}`;
      }
      
      // Açıklama
      const descMatch = block.match(/<p[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/p>/i) ||
                        block.match(/<div[^>]*class="[^"]*desc[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      const description = descMatch ? stripHtml(descMatch[1]).slice(0, 200) : null;
      
      if (id && name) {
        servers.push({
          id,
          name,
          icon,
          description,
          source: 'disboard_tag'
        });
        // Cache'e ekle
        rememberGuildName(id, name);
      }
    }
    
    console.log(`[Disboard Tag] ${servers.length} sunucu bulundu`);
    return servers;
  } catch (err) {
    console.log(`[Disboard Tag] Hata:`, err.message);
    return [];
  }
}

// Discadia.com'dan sunucu listesi çek
async function fetchDiscadiaList(query = 'türk public') {
  try {
    const res = await axios.get(`https://discadia.com/?q=${encodeURIComponent(query)}`, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    const html = res.data;
    const servers = [];
    
    // Sunucu kartlarını bul
    const serverBlocks = [...html.matchAll(/<a[^>]*href="\/server\/(\d+)"[^>]*>[\s\S]*?<\/a>/gi)];
    
    for (const blockMatch of serverBlocks.slice(0, 20)) {
      const block = blockMatch[0];
      const id = blockMatch[1];
      
      // İsim
      const nameMatch = block.match(/<h[23][^>]*>([^<]+)<\/h[23]>/i) ||
                       block.match(/<div[^>]*class="[^"]*name[^"]*"[^>]*>([^<]+)<\/div>/i) ||
                       block.match(/title="([^"]+)"/i);
      const name = nameMatch?.[1]?.trim();
      
      // İkon
      const iconMatch = block.match(/<img[^>]*src="([^"]+\.(?:png|jpg|jpeg|gif|webp)[^"]*)"/i) ||
                       block.match(/<img[^>]*data-src="([^"]+)"/i);
      let icon = iconMatch?.[1];
      if (icon && !icon.startsWith('http')) {
        icon = `https://discadia.com${icon}`;
      }
      
      // Açıklama
      const descMatch = block.match(/<p[^>]*>([^<]+)<\/p>/i) ||
                        block.match(/<div[^>]*class="[^"]*desc[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      const description = descMatch ? stripHtml(descMatch[1]).slice(0, 200) : null;
      
      if (id && name) {
        servers.push({
          id,
          name,
          icon,
          description,
          source: 'discadia_list'
        });
        // Cache'e ekle
        rememberGuildName(id, name);
      }
    }
    
    console.log(`[Discadia List] ${servers.length} sunucu bulundu`);
    return servers;
  } catch (err) {
    console.log(`[Discadia List] Hata:`, err.message);
    return [];
  }
}

// DCFlow.space'den sunucu bilgisi çek
async function fetchDCFlowInfo(guildId) {
  try {
    // Önce sunucu detay sayfasını dene
    const res = await axios.get(`https://dcflow.space/server/${guildId}`, {
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    const html = res.data;
    
    // Sunucu ismi
    let name = null;
    const titleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i);
    if (titleMatch) {
      name = titleMatch[1].trim();
    }
    if (!name) {
      const h1Match = html.match(/<h1[^>]*class="[^"]*server-name[^"]*"[^>]*>([^<]+)<\/h1>/i) ||
                      html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      if (h1Match) name = h1Match[1].trim();
    }
    
    // Açıklama
    let description = null;
    const descMatch = html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/i) ||
                      html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i);
    if (descMatch) {
      description = descMatch[1].trim().slice(0, 500);
    }
    
    // İkon
    let icon = null;
    const iconMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i) ||
                      html.match(/<img[^>]*class="[^"]*server-icon[^"]*"[^>]*src="([^"]+)"/i) ||
                      html.match(/<img[^>]*class="[^"]*avatar[^"]*"[^>]*src="([^"]+)"/i);
    if (iconMatch) {
      icon = iconMatch[1];
      if (!icon.startsWith('http')) {
        icon = `https://dcflow.space${icon}`;
      }
    }
    
    // Banner
    let banner = null;
    const bannerMatch = html.match(/<div[^>]*class="[^"]*banner[^"]*"[^>]*style="[^"]*background[^"]*url\(([^)]+)\)/i) ||
                        html.match(/background-image:\s*url\(['"]?([^'"]+)['"]?\)/i) ||
                        html.match(/<img[^>]*class="[^"]*banner[^"]*"[^>]*src="([^"]+)"/i);
    if (bannerMatch) {
      banner = bannerMatch[1].replace(/['"]/g, '');
      if (!banner.startsWith('http')) {
        banner = `https://dcflow.space${banner}`;
      }
    }
    
    if (!name) return null;
    
    return {
      name,
      icon,
      banner,
      description,
      source: 'dcflow'
    };
  } catch (err) {
    console.log(`[DCFlow] Hata ${guildId}:`, err.message);
  }
  return null;
}

// DCFlow.space leaderboard'dan sunucu listesi çek
async function fetchDCFlowLeaderboard(limit = 50) {
  try {
    const res = await axios.get(`https://dcflow.space/leaderboard`, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    const html = res.data;
    const servers = [];
    
    // Leaderboard satırlarını bul - genellikle tablo veya liste formatında
    const serverBlocks = [...html.matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/gi)];
    
    for (const blockMatch of serverBlocks.slice(0, limit)) {
      const block = blockMatch[0];
      
      // Guild ID - data attribute veya linkten
      const idMatch = block.match(/data-id="(\d+)"/i) ||
                      block.match(/href="\/server\/(\d+)"/i) ||
                      block.match(/href="[^"]*discord\.gg\/[^"]*(\d{17,20})/i);
      const id = idMatch?.[1];
      
      // İsim
      const nameMatch = block.match(/<td[^>]*class="[^"]*name[^"]*"[^>]*>([^<]+)<\/td>/i) ||
                       block.match(/<a[^>]*>([^<]+)<\/a>/i) ||
                       block.match(/<span[^>]*class="[^"]*name[^"]*"[^>]*>([^<]+)<\/span>/i);
      const name = nameMatch?.[1]?.trim();
      
      // İkon
      const iconMatch = block.match(/<img[^>]*src="([^"]+\.(?:png|jpg|jpeg|gif|webp)[^"]*)"/i) ||
                       block.match(/<img[^>]*data-src="([^"]+)"/i);
      let icon = iconMatch?.[1];
      if (icon && !icon.startsWith('http')) {
        icon = `https://dcflow.space${icon}`;
      }
      
      // Üye sayısı (varsa)
      const memberMatch = block.match(/<td[^>]*>([\d,]+)\s*(?:members|üye)<\/td>/i) ||
                         block.match(/([\d,]+)\s*(?:members|üye)/i);
      const member_count = memberMatch ? parseInt(memberMatch[1].replace(/,/g, '')) : null;
      
      if (id && name) {
        servers.push({
          id,
          name,
          icon,
          member_count,
          source: 'dcflow_leaderboard'
        });
        // Cache'e ekle
        rememberGuildName(id, name);
      }
    }
    
    console.log(`[DCFlow Leaderboard] ${servers.length} sunucu bulundu`);
    return servers;
  } catch (err) {
    console.log(`[DCFlow Leaderboard] Hata:`, err.message);
    return [];
  }
}

// Fetch FindCord guilds (if API key available)
async function fetchFindCordGuilds(limit = 50) {
  if (!FINDCORD_API_KEY) {
    console.log('[FindCord] API key yok, alternatif Discord kaynakları kullanılıyor...');
    return [];
  }
  try {
    const res = await axios.get('https://app.findcord.com/api/guilds', {
      headers: { 'Authorization': FINDCORD_API_KEY },
      params: { limit },
      timeout: 8000
    });
    const data = res.data || {};
    // Normalize common keys
    return data.guilds || data.Guilds || [];
  } catch (e) {
    console.error('[FindCord] Hata:', e?.message);
    return [];
  }
}

// Discord Widget API - Token gerekmez
async function fetchDiscordWidgetInfo(guildId) {
  try {
    const response = await axios.get(`https://discord.com/api/guilds/${guildId}/widget.json`, {
      timeout: 5000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ZagrosOSINT/1.0'
      }
    });
    
    const data = response.data;
    if (data && data.id) {
      return {
        id: data.id,
        name: data.name,
        instant_invite: data.instant_invite,
        presence_count: data.presence_count || 0,
        members: data.members || [],
        channels: data.channels || [],
        source: 'discord_widget'
      };
    }
    return null;
  } catch (error) {
    // Widget disabled veya hata
    return null;
  }
}

// Tüm kaynaklardan sunucu ismi çözümle - tüm metadata'yı döndür
async function resolveGuildName(guildId) {
  const guildIdStr = String(guildId);
  
  // Önce cache kontrol - isim varsa direkt döndür
  if (guildNamesCache.has(guildIdStr)) {
    const cachedName = guildNamesCache.get(guildIdStr);
    return { id: guildIdStr, name: cachedName, source: 'cache' };
  }

  // Tüm API'lerden verileri paralel çek ve birleştir
  const results = await Promise.allSettled([
    fetchDiscordWidget(guildIdStr),
    fetchDisboardInfo(guildIdStr),
    fetchTopGGInfo(guildIdStr),
    fetchDiscordServersInfo(guildIdStr),
    fetchDiscadiaInfo(guildIdStr),
    fetchDCFlowInfo(guildIdStr)
  ]);

  // Tüm sonuçları birleştir
  const merged = {
    id: guildIdStr,
    name: null,
    icon: null,
    banner: null,
    description: null,
    sources: []
  };

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value?.name) {
      const data = result.value;
      if (!merged.name) merged.name = data.name;
      if (!merged.icon && data.icon) merged.icon = data.icon;
      if (!merged.banner && data.banner) merged.banner = data.banner;
      if (!merged.description && data.description) merged.description = data.description;
      if (data.source && !merged.sources.includes(data.source)) merged.sources.push(data.source);
    }
  }

  // En az bir kaynak bulunduysa cache'e kaydet ve döndür
  if (merged.name) {
    rememberGuildName(guildIdStr, merged.name);
    merged.source = merged.sources[0] || 'multiple';
    return merged;
  }

  return null;
}

// Toplu sunucu isim çözümleme - hızlı versiyon
async function batchResolveGuildNames(guilds) {
  const results = [];
  const batchSize = 5; // Rate limit koruması için azaltıldı

  for (let i = 0; i < guilds.length; i += batchSize) {
    const batch = guilds.slice(i, i + batchSize);
    const batchPromises = batch.map(async (guild) => {
      // Zaten metadata varsa ve kaynaklıysa atla
      if (guild.name && guild.name !== 'Bilinmeyen Sunucu' && guild.metadata_source && guild.metadata_source !== 'files') {
        return { 
          id: guild.id, 
          name: guild.name, 
          icon: guild.icon,
          banner: guild.banner,
          description: guild.description,
          source: guild.metadata_source 
        };
      }

      const resolved = await resolveGuildName(guild.id);
      if (resolved) {
        return { id: guild.id, ...resolved };
      }

      return { id: guild.id, name: null, source: 'not_found' };
    });

    const batchResults = await Promise.allSettled(batchPromises);
    results.push(...batchResults);

    // Daha kısa bekleme
    if (i + batchSize < guilds.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  return results;
}

// �🎨 GELİŞMİŞ FINDCORD VERİ İŞLEME
function enrichWithFindCord(baseData, fcData) {
  if (!fcData) return baseData;
  
  return {
    ...baseData,
    // Profil
    username: baseData.username || fcData.username,
    global_name: baseData.global_name || fcData.global_name,
    avatar_hash: baseData.avatar_hash || fcData.avatar,
    avatar_url: fcData.avatar_url,
    banner_url: fcData.banner_url,
    bio: baseData.bio || fcData.bio,
    pronouns: baseData.pronouns || fcData.pronouns,
    created_at: baseData.created_at || fcData.created_at,
    
    // Rozetler
    badges: fcData.badges || [],
    
    // FindCord metadata
    findcord_enriched: true,
    findcord_guilds: fcData.guilds || []
  };
}

function maskEmail(email) {
  if (!email || typeof email !== 'string') return null;
  return email;
}

function maskIp(ip) {
  if (!ip || typeof ip !== 'string') return null;
  return ip;
}

function getIpLocation(ip) {
  if (!ip || typeof ip !== 'string') return null;
  // IPv6 veya hash ise location çıkamaz
  if (ip.includes(':') || ip.match(/^[a-f0-9]{32}$/i)) return null;
  const geo = geoip.lookup(ip);
  if (!geo) return null;
  const parts = [];
  if (geo.city) parts.push(geo.city);
  if (geo.region) parts.push(geo.region);
  if (geo.country) parts.push(geo.country);
  return parts.length > 0 ? parts.join(', ') : null;
}

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function decodeBase64Maybe(s) {
  if (!s || typeof s !== 'string') return s;
  const trimmed = s.trim();
  if (!/^[A-Za-z0-9+/=]+$/.test(trimmed)) return s;
  if (trimmed.length < 8) return s;
  try {
    const buf = Buffer.from(trimmed, 'base64');
    const decoded = buf.toString('utf8');
    if (decoded.includes('@') || decoded.includes('.') || decoded.includes(' ')) return decoded;
    return s;
  } catch {
    return s;
  }
}

function tryParseConnectionsValue(raw) {
  if (raw == null) return null;
  if (typeof raw !== 'string') return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed === '[]') return [];
  if (trimmed === '{}' || trimmed === '{ }') return {};

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    const unquoted = trimmed.slice(1, -1);
    const unescaped = unquoted.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    const parsed = safeJsonParse(unescaped);
    return parsed;
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return safeJsonParse(trimmed);
  }

  return null;
}

function extractConnectionAppsFromLine(line) {
  if (!line || typeof line !== 'string') return [];

  // Hem tırnaklı JSON hem de SQL sütun verisi olarak yakalamayı dene
  const mConnections = line.match(/(?:"connections"|'connections'|connections)\s*[:=,]\s*(\[.*?\]|\{.*?\}|'.*?'|".*?")/i);
  const raw = mConnections?.[1];
  
  // SQL'deki tek tırnaklı stringleri temizle
  let cleanRaw = raw;
  if (raw && raw.startsWith("'") && raw.endsWith("'")) {
    cleanRaw = raw.slice(1, -1).replace(/''/g, "'");
  }

  const parsed = tryParseConnectionsValue(cleanRaw);

  if (!parsed) return [];
  if (Array.isArray(parsed)) return [];
  if (typeof parsed !== 'object') return [];

  // Uygulama adı, id ve nick çıkar
  return Object.entries(parsed).map(([app, detail]) => {
    let connId = '', nick = '';
    if (typeof detail === 'string') {
      nick = detail;
    } else if (typeof detail === 'object' && detail !== null) {
      const entries = Object.entries(detail);
      if (entries.length > 0) {
        connId = String(entries[0][0]);
        nick = String(entries[0][1]);
      }
    }
    return { app, id: connId, name: nick };
  }).slice(0, 10);
}

async function searchTxtByDiscordId(discordId) {
  const index = await getTxtUsersIndex();
  if (!index) return [];
  const u = index.get(String(discordId));
  if (!u) return [];
  return [{
    source: path.basename(TXT_PATH),
    discord_id: String(u.discord_id ?? ''),
    username: u.username ?? null,
    discriminator: u.discriminator ?? null,
    email_masked: maskEmail(u.email ?? null),
    registration_ip_masked: maskIp(u.registration_ip ?? null),
    last_ip_masked: maskIp(u.last_ip ?? null),
    created_at: u.created_at ?? null,
    last_login: u.last_login ?? null,
    subscription_type: u.subscription_type ?? null,
    is_active: u.is_active ?? null
  }];
}

async function scanSqlFileForIp(sqlPath, ipNeedle, excludeDiscordId, maxHits = 25, maxLines = 250_000) {
  if (!ipNeedle) return [];
  if (!fs.existsSync(sqlPath)) return [];
  const needle = String(ipNeedle);
  const exclude = String(excludeDiscordId || '');
  const matches = [];
  let lineCount = 0;
  try {
    const rs = fs.createReadStream(sqlPath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: rs, crlfDelay: Infinity });
    for await (const line of rl) {
      lineCount++;
      if (maxLines && lineCount > maxLines) break;
      if (!line.includes(needle)) continue;
      // Basit extraction (mevcut logic ile uyumlu)
      const idMatch = line.match(/'(\d{10,20})'/);
      const emailMatch = line.match(/'([^']+@[^']+)'/);
      const friendId = idMatch?.[1];
      if (!friendId || friendId === exclude) continue;
      matches.push({
        discord_id: friendId,
        email: emailMatch ? emailMatch[1] : null,
        relation: 'same_ip',
        common_ip: needle,
        confidence: 'high',
        source: path.basename(sqlPath)
      });
      if (matches.length >= maxHits) break;
    }
    rl.close();
    rs.close();
  } catch {
    // ignore
  }
  return matches;
}

function extractField(line, fieldName) {
  // "email":"value" veya "ip":"value" gibi alanları direkt regex ile çıkar
  const m = line.match(new RegExp(`"${fieldName}"\\s*:\\s*"([^"]*)"`, 'i'));
  return m ? m[1] : null;
}

function extractConnectionsFromLine(line) {
  // connections alanını bul - string veya object olarak
  const m = line.match(/"connections"\s*:\s*"/);
  if (!m) {
    // connections object olarak: "connections":{...}
    const m2 = line.match(/"connections"\s*:\s*(\{[^}]*\})/);
    if (m2) {
      const parsed = safeJsonParse(m2[1]);
      if (parsed && typeof parsed === 'object') return parseConnObj(parsed);
    }
    return [];
  }

  // connections string olarak: "connections":"{\"github\":...}"
  // SQL'de \\" olarak saklanıyor, önce temizle
  const startIdx = line.indexOf('"connections"');
  if (startIdx === -1) return [];

  // connections değerinin başlangıcını bul (ilk " işaretinden sonra)
  const valStart = line.indexOf(':', startIdx);
  if (valStart === -1) return [];

  // String mi object mi kontrol et
  let valContent = line.substring(valStart + 1).trim();

  if (valContent.startsWith('"')) {
    // String içindeki JSON: "...\"github\"..."
    // Kapanış tırnağını bul (kaçışlı olmayan)
    let endIdx = -1;
    for (let i = 1; i < valContent.length; i++) {
      if (valContent[i] === '"' && valContent[i - 1] !== '\\') {
        endIdx = i;
        break;
      }
    }
    if (endIdx === -1) return [];

    let rawConn = valContent.substring(1, endIdx);
    // Çift kaçışları temizle: \\" -> "
    rawConn = rawConn.replace(/\\\\"/g, '"').replace(/\\"/g, '"').replace(/\\\\/g, '\\');

    // "[]" ise boş
    if (rawConn === '[]' || rawConn.trim() === '') return [];

    const parsed = safeJsonParse(rawConn);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parseConnObj(parsed);
    return [];
  }

  if (valContent.startsWith('{')) {
    let depth = 0;
    let endIdx = -1;
    for (let i = 0; i < valContent.length; i++) {
      if (valContent[i] === '{') depth++;
      else if (valContent[i] === '}') { depth--; if (depth === 0) { endIdx = i + 1; break; } }
    }
    if (endIdx > 0) {
      const rawConn = valContent.substring(0, endIdx);
      const parsed = safeJsonParse(rawConn);
      if (parsed && typeof parsed === 'object') return parseConnObj(parsed);
    }
  }

  return [];
}

function parseConnObj(obj) {
  return Object.entries(obj).map(([app, detail]) => {
    let connId = '', nick = '';
    if (typeof detail === 'string') nick = detail;
    else if (typeof detail === 'object' && detail !== null) {
      const entries = Object.entries(detail);
      if (entries.length > 0) { connId = String(entries[0][0]); nick = String(entries[0][1]); }
    }
    return { app, id: connId, name: nick };
  });
}

async function scanSqlFileForDiscordId(sqlPath, discordId, maxHits = 50) {
  if (!fs.existsSync(sqlPath)) return [];
  console.log(`[Tarama] Başlıyor: ${path.basename(sqlPath)}`);

  const matches = [];
  try {
    const rs = fs.createReadStream(sqlPath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: rs, crlfDelay: Infinity });

    const needle = String(discordId);

    for await (const line of rl) {
      if (!line.includes(needle)) continue;

      let email = null, ip = null, username = null, discriminator = null;
      let avatar_hash = null, bio = null, premium = null, verified = null;
      let connections_apps = [];
      let isUsersTable = false;

      // === FORMAT 1: users tablosu INSERT ===
      if (line.includes('INSERT INTO') && (line.includes('`users`') || line.includes('users'))) {
        isUsersTable = true;
        const vals = [...line.matchAll(/'([^']*)'/g)].map(m => m[1]);
        if (vals.length >= 6) {
          username = vals[2] || null;
          discriminator = vals[3] || null;
          email = vals[4] || null;
          avatar_hash = vals[5] || null;
          // registration_ip ve last_ip sondaki IP'ler
          for (let vi = vals.length - 1; vi >= 0; vi--) {
            if (vals[vi].match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
              if (!ip) ip = vals[vi]; // last_ip
              else { /* registration_ip de var */ }
            }
          }
        }
      }

      // === FORMAT 1b: discord_ids tablosu tuple ===
      if (!isUsersTable && line.match(/\(\s*\d+\s*,/)) {
        const tupleMatch = line.match(/\(\s*\d+\s*,\s*'(\d{10,20})'/);
        if (tupleMatch) discordId = tupleMatch[1];
        const tupleVals = [...line.matchAll(/'([^']*)'/g)].map(m => m[1]);
        // 1. değer = email (base64)
        if (!email && tupleVals.length >= 1) email = decodeBase64Maybe(tupleVals[0]);
        // 5. değer = IP (IPv4 veya IPv6 veya hash)
        if (!ip && tupleVals.length >= 5) {
          const candidate = tupleVals[4];
          if (candidate && (candidate.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/) || candidate.includes(':'))) {
            ip = candidate;
          }
        }
        // Diğer IP'leri de ara
        if (!ip) {
          for (const v of tupleVals) {
            if (v.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) { ip = v; break; }
            if (v.match(/^[0-9a-f]{1,4}(:[0-9a-f]{1,4}){2,7}$/i)) { ip = v; break; }
          }
        }
      }

      // === FORMAT 2: query_logs / response_data JSON ===
      if (!isUsersTable) {
        // Direkt regex ile alanları çıkar
        const rawEmail = extractField(line, 'email');
        if (rawEmail) email = decodeBase64Maybe(rawEmail);

        const rawIp = extractField(line, 'ip');
        if (rawIp && !rawIp.match(/^[a-f0-9]{32}$/)) ip = rawIp;

        const rawUser = extractField(line, 'username');
        if (rawUser && rawUser !== 'N/A' && rawUser !== 'N\\/A') username = rawUser;

        const rawDisc = extractField(line, 'discriminator');
        if (rawDisc && rawDisc !== 'N/A' && rawDisc !== 'N\\/A') discriminator = rawDisc;

        const rawAvatar = extractField(line, 'avatar_hash');
        if (rawAvatar && rawAvatar !== 'N/A' && rawAvatar !== 'N\\/A') avatar_hash = rawAvatar;

        const rawBio = extractField(line, 'bio');
        if (rawBio && rawBio !== 'null') bio = rawBio;

        const rawPremium = extractField(line, 'premium');
        if (rawPremium !== null) premium = rawPremium;

        const rawVerified = extractField(line, 'verified');
        if (rawVerified !== null) verified = rawVerified;

        // Connections çıkar
        connections_apps = extractConnectionsFromLine(line);

        // SQL tuple formatı: (id, 'base64email', ...) — 2. değer genelde email
        if (!email && line.includes(`(${needle},`)) {
          const tupleMatch = line.match(/\(\s*\d+\s*,\s*'([^']+)'/);
          if (tupleMatch) email = decodeBase64Maybe(tupleMatch[1]);
        }

        // SQL tuple: IP ara
        if (!ip && line.includes(`(${needle},`)) {
          const vals = [...line.matchAll(/'([^']*)'/g)].map(m => m[1]);
          for (const v of vals) {
            if (v.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) { ip = v; break; }
          }
        }

        // Fallback: düz email/IP
        if (!email) {
          const m = line.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
          if (m) email = m[1];
        }
        if (!ip) {
          const m = line.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
          if (m) ip = m[1];
        }
      }

      matches.push({
        discord_id: discordId,
        email: email,
        email_masked: maskEmail(email),
        ip: ip,
        ip_masked: maskIp(ip),
        connections_apps,
        username,
        discriminator,
        avatar_hash,
        bio,
        premium,
        verified,
        source: path.basename(sqlPath)
      });

      if (matches.length >= maxHits) break;
    }
    rl.close();
    rs.close();
  } catch (err) {
    console.error(`[Hata] ${sqlPath}:`, err.message);
  }

  console.log(`[Tarama] Bitti: ${path.basename(sqlPath)} - ${matches.length} sonuç`);
  return matches;
}

const isProduction = process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT;

const app = express();
app.disable('x-powered-by');
// Railway/Render gibi reverse proxy arkasında Secure cookie'nin doğru çalışması için
// req.secure ve proto tespiti "trust proxy" ile mümkün olur.
if (isProduction) {
  app.set('trust proxy', 1);
}

// 🌐 CORS - Herkese Açık Site Ayarları
const ALLOWED_ORIGINS = [
  'https://zagros.one',
  'https://www.zagros.one',
  'http://zagros.one',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  // Deployment platformları için wildcard desteği
  'https://*.vercel.app',
  'https://*.netlify.app',
  'https://*.railway.app',
  'https://*.render.com',
  'https://*.herokuapp.com'
];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  // 🌍 Herkese açık site - tüm origin'lere izin ver
  if (!origin) {
    res.header('Access-Control-Allow-Origin', '*');
  } else {
    // İzinli origin'ler kontrolü
    const isAllowed = ALLOWED_ORIGINS.some(allowed => {
      if (allowed.includes('*')) {
        const regex = new RegExp(allowed.replace('*', '.*'));
        return regex.test(origin);
      }
      return allowed === origin;
    });
    
    // Production'da sadece izinli origin'ler, development'ta tümü
    if (isAllowed || !isProduction) {
      res.header('Access-Control-Allow-Origin', origin);
    } else {
      res.header('Access-Control-Allow-Origin', 'https://zagros.one');
    }
  }
  
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Max-Age', '86400'); // 24 saat cache
  res.header('Vary', 'Origin');
  
  // 🔒 Güvenlik Header'ları
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');
  res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Consolidated search across DB, TXT and SQL data sources
app.get('/api/search-all', async (req, res) => {
  const discordId = String(req.query?.discord_id ?? '').trim();
  if (!discordId || !/\d{5,30}$/.test(discordId)) {
    return res.status(400).json({ ok: false, error: 'invalid_discord_id' });
  }
  await ensureSqlLoaded();
  
  // 1. FindCord API'den veri çek
  let fcRaw = null;
  let fcData = null;
  try {
    fcRaw = await getFindCordData(discordId);
    if (fcRaw) {
      fcData = normalizeFindCordData(discordId, fcRaw);
      console.log(`[FindCord] Veri alındı: ${discordId}`);
    }
  } catch (err) {
    console.log(`[FindCord] Hata: ${err.message}`);
  }
  
  // 2. SQL dosyalarından veri çek
  let sqlMatches = [];
  try {
    const lists = await Promise.all(SQL_PATHS.map(p => scanSqlFileForDiscordId(p, discordId)));
    sqlMatches = lists.flat();
    console.log(`[SQL] ${sqlMatches.length} sonuç bulundu: ${discordId}`);
  } catch (err) {
    console.log(`[SQL] Hata: ${err.message}`);
  }
  
  // 3. TXT dosyasından veri çek
  let txtMatches = [];
  try {
    txtMatches = await searchTxtByDiscordId(discordId);
  } catch { /* ignore */ }
  
  // 4. Tüm verileri birleştir
  // Önce SQL verilerinden ilk kaydı al
  const sqlData = sqlMatches[0] || {};
  console.log(`[SQL] Birleştirme: ${sqlMatches.length} sonuç, ilk kayıt:`, JSON.stringify(sqlData).slice(0, 200));
  
  // Birleştirilmiş kullanıcı objesi oluştur
  const mergedUser = {
    discord_id: discordId,
    // FindCord verileri (öncelikli) - normalizeFindCordData'dan gelen zenginleştirilmiş veriler
    username: fcData?.username || sqlData?.username || null,
    global_name: fcData?.global_name || null,
    avatar_url: fcData?.avatar_url || null,
    banner_url: fcData?.banner_url || null,
    bio: fcData?.bio || sqlData?.bio || null,
    pronouns: fcData?.pronouns || null,
    badges: fcData?.badges || [],
    presence: fcData?.presence || null,
    // Sunucular - normalizeFindCordData'dan gelen zenginleştirilmiş guild verileri
    guilds: fcData?.guilds || [],
    // FindCord ekstra verileri - yeni normalize edilmiş alanlar
    findcord_servers: fcData?.guilds || [],
    findcord_voice_friends: fcData?.voice_friends || [],
    findcord_recent_messages: fcData?.recent_messages || [],
    findcord_display_names: fcData?.display_names || [],
    findcord_top_name: fcData?.top_name || null,
    findcord_top_age: fcData?.top_age || null,
    findcord_top_sex: fcData?.top_sex || null,
    findcord_created: fcData?.created_at || null,
    // Ek Discord verileri
    connections: fcData?.connections || [],
    activities: fcData?.activities || [],
    platform: fcData?.platform || null,
    nitro: fcData?.nitro || false,
    verified: fcData?.verified || false,
    flags: fcData?.flags || 0,
    // SQL verileri
    email: sqlData?.email || null,
    email_masked: sqlData?.email_masked || null,
    ip: sqlData?.ip || null,
    ip_masked: sqlData?.ip_masked || null,
    connections_apps: sqlData?.connections_apps || [],
    // Meta
    findcord_enriched: !!fcData,
    sql_matches_count: sqlMatches.length,
    sources: sqlMatches.map(m => m.source).filter((v, i, a) => a.indexOf(v) === i)
  };
  
  // Eğer hiç veri yoksa not_found döndür
  if (!fcData && sqlMatches.length === 0 && txtMatches.length === 0) {
    return res.json({ ok: true, found: false, discord_id: discordId, message: 'Veri bulunamadı' });
  }
  
  res.json({ 
    ok: true, 
    found: true,
    discord_id: discordId,
    user: {
      ...mergedUser,
      findcord_raw: fcRaw
    },
    sql_matches: sqlMatches,
    txt_matches: txtMatches,
    total_sql_matches: sqlMatches.length,
    total_txt_matches: txtMatches.length
  });
});

app.use(express.json({ limit: '1mb' }));

// 🗂️ SESSION STORE - Dosya tabanlı (MemoryStore uyarısını giderir, production-ready)
const SESSION_DIR = path.join(DATA_DIR, 'sessions');
try { if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true }); } catch { /* ignore */ }

app.use(session({
  store: new FileStoreSession({
    path: SESSION_DIR,
    ttl: 86400,          // 24 saat (saniye)
    retries: 1,
    logFn: () => {}      // Sessiz log - konsol kirliliğini önle
  }),
  secret: process.env.SESSION_SECRET || 'zagros-session-secret-v2',
  resave: false,
  saveUninitialized: false,
  name: 'zagros.sid',
  cookie: {
    httpOnly: true,
    secure: isProduction,   // HTTPS (zagros.one) için true, local için false
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24 saat
  }
}));

// 🕵️ ZİYARETÇİ LOGGING - Discord Webhook
// Webhook URL'i environment variable'dan al, yoksa varsayılanı kullan
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || 'https://discord.com/api/webhooks/1496280136901722222/TGXA8J1SmCeDge4FNYoiP_pj1nCn4yK-FNp9dAP1MWP96EWPusk1JD0zXi-9BSjUZPyB';

async function logVisitorDiscord(req, action = 'visit') {
  try {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const browser = parseBrowser(userAgent);
    const timestamp = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });

    // IP'den konum bilgisi al
    let locationInfo = {};
    try {
      const geo = geoip.lookup(ip.split(',')[0].trim());
      if (geo) {
        locationInfo = {
          country: geo.country,
          city: geo.city,
          region: geo.region,
          isp: geo.isp,
          ll: geo.ll
        };
      }
    } catch (e) { /* ignore */ }

    // Yerel veritabanına kaydet
    logVisitor(ip, userAgent, locationInfo);

    const locationStr = locationInfo.city && locationInfo.country
      ? `${locationInfo.city}, ${locationInfo.country}`
      : 'Bilinmiyor';
    
    const embed = {
      title: action === 'login' ? '🔐 Giriş Yapıldı' : '👁️ Site Ziyareti',
      color: action === 'login' ? 0x00FF00 : 0x5865F2,
      timestamp: new Date().toISOString(),
      fields: [
        {
          name: '🌐 IP Adresi',
          value: `\`\`\`${ip}\`\`\``,
          inline: true
        },
        {
          name: '📍 Konum',
          value: locationStr,
          inline: true
        },
        {
          name: '🌎 Ülke/Bölge',
          value: `${locationInfo.country || '?'}/${locationInfo.region || '?'}/${locationInfo.city || '?'}`
        },
        {
          name: '💻 Tarayıcı',
          value: browser,
          inline: true
        },
        {
          name: '📱 User-Agent',
          value: userAgent.length > 100 ? userAgent.substring(0, 100) + '...' : userAgent
        },
        {
          name: '🔗 Endpoint',
          value: req.path,
          inline: true
        }
      ],
      footer: {
        text: `Zagros OSINT - ${timestamp}`
      }
    };
    
    // Discord webhook'a gönder
    await axios.post(DISCORD_WEBHOOK_URL, {
      embeds: [embed]
    }, { timeout: 5000 });
    
    console.log(`[Visitor Log] ${action}: ${ip} - ${locationStr}`);
  } catch (err) {
    console.log('[Visitor Log Error]', err.message);
  }
}

function parseBrowser(userAgent) {
  if (!userAgent) return 'Unknown';
  if (userAgent.includes('Chrome')) return 'Chrome';
  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) return 'Safari';
  if (userAgent.includes('Edge')) return 'Edge';
  if (userAgent.includes('Opera')) return 'Opera';
  if (userAgent.includes('Discord')) return 'Discord Bot';
  return 'Other';
}

// Tüm API isteklerini logla (rate limit ile)
const loggedIps = new Set();
setInterval(() => loggedIps.clear(), 60000); // Her dakika reset

app.use((req, res, next) => {
  // Sadece API endpoint'lerini ve ana sayfayı logla
  const shouldLog = req.path === '/' || req.path.startsWith('/api/');
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  
  if (shouldLog && !loggedIps.has(ip)) {
    loggedIps.add(ip);
    logVisitorDiscord(req, 'visit');
  }
  next();
});

app.post('/api/login', async (req, res) => {
  const password = String(req.body?.password ?? '');
  const key = String(req.body?.key ?? '');

  // Gizli admin key ile giriş (premium alanından)
  if (key && key === SITE_PASSWORD) {
    req.session.authed = true;
    req.session.key = null;
    req.session.tier = 'admin';
    req.session.discord_id = null;
    logVisitorDiscord(req, 'admin_key_login');
    return res.json({ ok: true, method: 'admin_key', tier: 'admin' });
  }

  // Anahtar ile giriş (premium)
  if (key) {
    const validation = validateKey(key);
    if (validation.valid) {
      req.session.authed = true;
      req.session.key = key;
      req.session.tier = validation.tier;
      req.session.expiresAt = validation.expiresAt;
      req.session.usageCount = validation.usageCount;
      req.session.discord_id = null;
      logVisitorDiscord(req, 'key_login');
      return res.json({
        ok: true,
        method: 'key',
        tier: validation.tier,
        expiresAt: validation.expiresAt,
        usageCount: validation.usageCount,
        remainingQueries: validation.tier === 'free' ? 1 - validation.usageCount : 'unlimited'
      });
    } else {
      return res.status(401).json({ ok: false, error: validation.reason });
    }
  }

  // Şifre ile giriş (admin için)
  if (password === SITE_PASSWORD) {
    req.session.authed = true;
    req.session.key = null;
    req.session.tier = 'admin';
    req.session.discord_id = null;
    logVisitorDiscord(req, 'login');
    return res.json({ ok: true, method: 'password', tier: 'admin' });
  }

  // Otomatik free giriş (key olmadan)
  req.session.authed = true;
  req.session.key = 'auto_free_' + Date.now();
  req.session.tier = 'free';
  req.session.expiresAt = null;
  req.session.usageCount = 0;
  req.session.discord_id = null;
  logVisitorDiscord(req, 'auto_free_login');
  return res.json({
    ok: true,
    method: 'auto_free',
    tier: 'free',
    remainingQueries: 1
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// Seed from local file (admin only) - reads zagros_seed.json from DATA_DIR
async function seedLocalFromFile() {
  const seedPath = path.join(DATA_DIR, 'zagros_seed.json');
  if (!fs.existsSync(seedPath)) throw new Error('seed_file_missing');
  const content = fs.readFileSync(seedPath, 'utf8');
  const data = safeJsonParse(content);
  const guilds = Array.isArray(data) ? data : (data?.guilds || []);
  if (!guilds.length) return { ok: true, inserted: 0 };
  let count = 0;
  for (const g of guilds) {
    const id = String(g.id || g.guild_id || g.GuildId || '');
    const name = g.name || null;
    const icon = g.icon || null;
    const banner = g.banner || null;
    const description = g.description || null;
    try { await dbSaveGuildName(id, name, icon, banner, description); count++; } catch { /* ignore per-item */ }
  }
  return { ok: true, inserted: count };
}

app.post('/api/seed-local', requireAdmin, async (req, res) => {
  try {
    const result = await seedLocalFromFile();
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});
// Seed test data (admin only) - for quick integration testing on prod/dev
async function seedTestData() {
  const testDiscord = '12345678901234567890';
  const testName = 'Test User';
  const testEmail = 'test.user@example.com';
  try {
    if (!isDBReady()) return { ok: false, message: 'db_not_ready' };
    await runQuery(
      `INSERT INTO users (discord_id, username, email, registration_ip, last_ip, created_at, source)
       VALUES ($1, $2, $3, NULL, NULL, NOW(), 'seed')
       ON CONFLICT (discord_id) DO NOTHING;`,
      [testDiscord, testName, testEmail]
    );
    await runQuery(
      `INSERT INTO query_logs (discord_id, username, email, ip, created_at, source)
       VALUES ($1, $2, $3, NULL, NOW(), 'seed')
       ON CONFLICT DO NOTHING;`,
      [testDiscord, testName, testEmail]
    );
    return { ok: true, discord_id: testDiscord };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Admin endpoint to seed test data
app.post('/api/seed-test', requireAdmin, async (req, res) => {
  const result = await seedTestData();
  res.json(result);
});

// 👑 ADMIN PANEL ENDPOINT'LERİ

// Admin oturum doğrulama middleware
function requireAdmin(req, res, next) {
  if (req.session?.tier === 'admin') {
    req.adminSession = { adminId: 'session_admin', createdAt: Date.now() };
    return next();
  }

  const adminToken = req.headers['x-admin-token'] || req.session?.adminToken;

  if (!adminToken || !adminSessions.has(adminToken)) {
    return res.status(401).json({ ok: false, error: 'admin_required' });
  }

  const session = adminSessions.get(adminToken);
  // 24 saat sonra oturum sona erer
  if (Date.now() - session.createdAt > 24 * 60 * 60 * 1000) {
    adminSessions.delete(adminToken);
    return res.status(401).json({ ok: false, error: 'session_expired' });
  }

  req.adminSession = session;
  next();
}

// Admin giriş
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};

  if (username !== ADMIN_ID || password !== ADMIN_PASSWORD) {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    console.log(`[Admin] Başarısız giriş denemesi: ${username} - IP: ${ip}`);
    return res.status(401).json({ ok: false, error: 'invalid_credentials' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  adminSessions.set(token, {
    adminId: ADMIN_ID,
    createdAt: Date.now(),
    ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress
  });

  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];
  const geo = ip ? geoip.lookup(ip) : null;
  logVisitor(ip, userAgent, geo);
  console.log(`[Admin] Giriş yapıldı: ${ADMIN_ID} - IP: ${ip}`);

  res.json({ ok: true, token, message: 'Admin girişi başarılı' });
});

// Admin çıkış
app.post('/api/admin/logout', requireAdmin, (req, res) => {
  const token = req.headers['x-admin-token'] || req.session?.adminToken;
  adminSessions.delete(token);
  res.json({ ok: true, message: 'Çıkış yapıldı' });
});

// Admin durum kontrolü
app.get('/api/admin/check', requireAdmin, (req, res) => {
  res.json({ ok: true, admin: true, id: req.adminSession.adminId });
});

// Ziyaretçi listesi (Admin only)
app.get('/api/admin/visitors', requireAdmin, (req, res) => {
  const visitors = loadVisitors();
  res.json({ ok: true, visitors, count: visitors.length });
});

// Ziyaretçi sil (Admin only)
app.delete('/api/admin/visitors/:id', requireAdmin, (req, res) => {
  const visitors = loadVisitors();
  const filtered = visitors.filter(v => v.id !== req.params.id);
  saveVisitors(filtered);
  res.json({ ok: true, message: 'Ziyaretçi silindi' });
});

// Admin - TXT veritabanından email listesi
app.get('/api/admin/emails', requireAdmin, (req, res) => {
  try {
    if (!fs.existsSync(TXT_PATH)) {
      return res.json({ ok: true, emails: [] });
    }

    const content = fs.readFileSync(TXT_PATH, 'utf8');
    const obj = safeJsonParse(content);
    const users = Array.isArray(obj?.users) ? obj.users : [];

    const emails = users
      .filter(u => u.email)
      .map(u => ({
        email: u.email,
        discord_id: u.discord_id,
        username: u.username,
        subscription_type: u.subscription_type,
        created_at: u.created_at
      }));

    res.json({ ok: true, emails, count: emails.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Admin - Email ekle
app.post('/api/admin/emails', requireAdmin, (req, res) => {
  try {
    const { email, discord_id, username, subscription_type = 'free' } = req.body || {};

    if (!email || !email.includes('@')) {
      return res.status(400).json({ ok: false, error: 'Geçersiz email' });
    }

    let data = { users: [] };
    try {
      if (fs.existsSync(TXT_PATH)) {
        const content = fs.readFileSync(TXT_PATH, 'utf8');
        data = safeJsonParse(content) || { users: [] };
      }
    } catch { /* ignore */ }

    const newUser = {
      id: Date.now(),
      discord_id: discord_id || null,
      username: username || null,
      discriminator: '0',
      email: email,
      avatar_hash: null,
      subscription_type: subscription_type,
      daily_limit: subscription_type === 'enterprise' ? 50 : subscription_type === 'basic' ? 10 : 1,
      queries_today: 0,
      total_queries: 0,
      is_active: 1,
      created_at: new Date().toISOString(),
      last_login: null,
      registration_ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
      last_ip: null
    };

    data.users.unshift(newUser);
    fs.writeFileSync(TXT_PATH, JSON.stringify(data, null, 2));

    console.log(`[Admin] Yeni email eklendi: ${email}`);
    res.json({ ok: true, message: 'Email eklendi', user: newUser });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Admin - Email güncelle
app.put('/api/admin/emails/:oldEmail', requireAdmin, (req, res) => {
  try {
    const { oldEmail } = req.params;
    const { newEmail } = req.body || {};

    if (!newEmail || !newEmail.includes('@')) {
      return res.status(400).json({ ok: false, error: 'Geçersiz yeni email' });
    }

    let data = { users: [] };
    try {
      if (fs.existsSync(TXT_PATH)) {
        const content = fs.readFileSync(TXT_PATH, 'utf8');
        data = safeJsonParse(content) || { users: [] };
      }
    } catch { /* ignore */ }

    const userIndex = data.users.findIndex(u => u.email === oldEmail);
    if (userIndex === -1) {
      return res.status(404).json({ ok: false, error: 'Email bulunamadı' });
    }

    data.users[userIndex].email = newEmail;
    data.users[userIndex].last_updated = new Date().toISOString();

    fs.writeFileSync(TXT_PATH, JSON.stringify(data, null, 2));

    console.log(`[Admin] Email güncellendi: ${oldEmail} -> ${newEmail}`);
    res.json({ ok: true, message: 'Email güncellendi' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Admin - Email sil
app.delete('/api/admin/emails/:email', requireAdmin, (req, res) => {
  try {
    const { email } = req.params;

    let data = { users: [] };
    try {
      if (fs.existsSync(TXT_PATH)) {
        const content = fs.readFileSync(TXT_PATH, 'utf8');
        data = safeJsonParse(content) || { users: [] };
      }
    } catch { /* ignore */ }

    const initialLength = data.users.length;
    data.users = data.users.filter(u => u.email !== email);

    if (data.users.length === initialLength) {
      return res.status(404).json({ ok: false, error: 'Email bulunamadı' });
    }

    fs.writeFileSync(TXT_PATH, JSON.stringify(data, null, 2));

    console.log(`[Admin] Email silindi: ${email}`);
    res.json({ ok: true, message: 'Email silindi' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 🔑 ABONELİK YÖNETİM ENDPOINT'LERİ

// Tüm abonelik anahtarlarını listele
app.get('/api/admin/subscriptions', requireAdmin, (req, res) => {
  try {
    const subs = loadSubscriptions();
    res.json({ ok: true, keys: subs.keys, count: subs.keys.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Yeni abonelik anahtarı oluştur
app.post('/api/admin/subscriptions', requireAdmin, (req, res) => {
  try {
    const { tier, durationMonths } = req.body || {};

    if (!tier || !durationMonths) {
      return res.status(400).json({ ok: false, error: 'tier ve durationMonths gerekli' });
    }

    if (!['free', 'premium_monthly', 'premium_yearly'].includes(tier)) {
      return res.status(400).json({ ok: false, error: 'Geçersiz tier' });
    }

    const newKey = createSubscriptionKey(tier, durationMonths);
    res.json({ ok: true, key: newKey });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Abonelik anahtarını sil
app.delete('/api/admin/subscriptions/:key', requireAdmin, (req, res) => {
  try {
    const { key } = req.params;
    const subs = loadSubscriptions();

    const initialLength = subs.keys.length;
    subs.keys = subs.keys.filter(k => k.key !== key);

    if (subs.keys.length === initialLength) {
      return res.status(404).json({ ok: false, error: 'Anahtar bulunamadı' });
    }

    saveSubscriptions(subs);
    console.log(`[Admin] Abonelik anahtarı silindi: ${key}`);
    res.json({ ok: true, message: 'Anahtar silindi' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Abonelik anahtarını güncelle (aktif/pasif)
app.put('/api/admin/subscriptions/:key', requireAdmin, (req, res) => {
  try {
    const { key } = req.params;
    const { isActive } = req.body || {};

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ ok: false, error: 'Geçersiz durum' });
    }

    const subs = loadSubscriptions();
    const idx = subs.keys.findIndex(k => k.key === key);
    if (idx === -1) return res.status(404).json({ ok: false, error: 'Anahtar bulunamadı' });

    subs.keys[idx].isActive = isActive;
    saveSubscriptions(subs);

    res.json({ ok: true, key: subs.keys[idx] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Admin - Guild Metadata Yönetimi
app.get('/api/admin/guilds', requireAdmin, async (req, res) => {
  const searchTerm = String(req.query?.q || '').trim();
  const limitParam = Number(req.query?.limit);
  const offsetParam = Number(req.query?.offset);
  const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 50, 1), 500);
  const offset = Math.max(Number.isFinite(offsetParam) ? offsetParam : 0, 0);

  if (!isDBReady()) {
    const entries = Array.from(guildNamesCache.entries())
      .filter(([id, name]) => {
        if (!searchTerm) return true;
        const lower = searchTerm.toLowerCase();
        return id.includes(searchTerm) || String(name || '').toLowerCase().includes(lower);
      })
      .sort((a, b) => a[0].localeCompare(b[0]));

    const slice = entries.slice(offset, offset + limit).map(([guild_id, name]) => ({
      guild_id,
      name,
      icon: null,
      banner: null,
      description: null,
      updated_at: null
    }));

    return res.json({
      ok: true,
      source: 'cache',
      query: searchTerm,
      limit,
      offset,
      total: entries.length,
      count: slice.length,
      guilds: slice
    });
  }

  try {
    const result = await dbListGuildNames({ searchTerm, limit, offset });
    return res.json({
      ok: true,
      source: 'database',
      query: searchTerm,
      limit,
      offset,
      total: result.total,
      count: result.names.length,
      guilds: result.names
    });
  } catch (err) {
    console.error('[AdminGuilds] Listeleme hatası:', err);
    return res.status(500).json({ ok: false, error: 'guild_list_failed', message: err.message });
  }
});

function normalizeGuildField(value, maxLength = 512) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

app.post('/api/admin/guilds', requireAdmin, async (req, res) => {
  const { guild_id, name, icon, banner, description } = req.body || {};
  const guildId = String(guild_id || '').trim();
  if (!/^[0-9]{10,30}$/.test(guildId)) {
    return res.status(400).json({ ok: false, error: 'Geçersiz sunucu ID' });
  }

  const payload = {
    name: normalizeGuildField(name, 120),
    icon: normalizeGuildField(icon, 512),
    banner: normalizeGuildField(banner, 512),
    description: normalizeGuildField(description, 1024)
  };

  try {
    await persistGuildMetadata(guildId, payload);
    if (!isDBReady() && payload.name) {
      rememberGuildName(guildId, payload.name);
    }
    guildsCache = null;
    guildsCacheTime = 0;

    return res.json({ ok: true, guild: { guild_id: guildId, ...payload } });
  } catch (err) {
    console.error('[AdminGuilds] Kaydetme hatası:', err);
    return res.status(500).json({ ok: false, error: 'guild_save_failed', message: err.message });
  }
});

app.delete('/api/admin/guilds/:guildId', requireAdmin, async (req, res) => {
  const guildId = String(req.params?.guildId || '').trim();
  if (!/^[0-9]{10,30}$/.test(guildId)) {
    return res.status(400).json({ ok: false, error: 'Geçersiz sunucu ID' });
  }

  try {
    if (isDBReady()) {
      await dbDeleteGuildName(guildId);
    }
    if (guildNamesCache.delete(guildId)) {
      saveGuildNamesCache();
    }
    guildsCache = null;
    guildsCacheTime = 0;

    return res.json({ ok: true });
  } catch (err) {
    console.error('[AdminGuilds] Silme hatası:', err);
    return res.status(500).json({ ok: false, error: 'guild_delete_failed', message: err.message });
  }
});

app.get('/api/health', (req, res) => {
  // Public endpoint - sunucu durumunu ve oturum bilgisini döndür
  return res.json({
    ok: true,
    authed: req.session?.authed || false,
    tier: req.session?.tier || null,
    timestamp: Date.now()
  });
});

// Simple version endpoint to verify deployed build
// Public: version endpoint for deployment verification
app.get('/api/version', (req, res) => {
  res.json({ ok: true, version: APP_VERSION, note: 'public' });
});

// 🗺️ IP HARİTA ENDPOINT - IP konumlarını harita için döndür
app.get('/api/ip-map', async (req, res) => {
  const ip = req.query.ip;

  if (!ip) {
    return res.status(400).json({ error: 'ip_required', message: 'IP adresi gerekli' });
  }

  try {
    // IP'den konum bilgisi al
    const geo = geoip.lookup(ip);

    if (!geo) {
      return res.json({
        ok: true,
        ip: ip,
        found: false,
        message: 'Konum bilgisi bulunamadı'
      });
    }

    const [lat, lng] = geo.ll || [null, null];

    res.json({
      ok: true,
      ip: ip,
      found: true,
      location: {
        latitude: lat,
        longitude: lng,
        country: geo.country,
        city: geo.city,
        region: geo.region,
        timezone: geo.timezone,
        country_name: getCountryName(geo.country)
      },
      map_url: lat && lng ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}&zoom=13` : null,
      google_maps_url: lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : null
    });
  } catch (err) {
    console.error('[IP Map] Hata:', err.message);
    res.status(500).json({ error: 'lookup_failed', message: err.message });
  }
});

// 🗺️ ÇOKLU IP HARİTA ENDPOINT - Birden fazla IP için konumları döndür
app.post('/api/ip-map/batch', async (req, res) => {
  const { ips } = req.body || {};

  if (!Array.isArray(ips) || ips.length === 0) {
    return res.status(400).json({ error: 'ips_required', message: 'IP adresleri listesi gerekli' });
  }

  if (ips.length > 100) {
    return res.status(400).json({ error: 'too_many_ips', message: 'En fazla 100 IP adresi sorgulanabilir' });
  }

  try {
    const results = [];

    for (const ip of ips) {
      const geo = geoip.lookup(ip);
      if (geo && geo.ll) {
        const [lat, lng] = geo.ll;
        results.push({
          ip: ip,
          latitude: lat,
          longitude: lng,
          country: geo.country,
          city: geo.city,
          region: geo.region,
          country_name: getCountryName(geo.country)
        });
      }
    }

    res.json({
      ok: true,
      count: results.length,
      markers: results,
      bounds: calculateBounds(results)
    });
  } catch (err) {
    console.error('[IP Map Batch] Hata:', err.message);
    res.status(500).json({ error: 'lookup_failed', message: err.message });
  }
});

// Ülke kodundan isim döndür (basit versiyon)
function getCountryName(code) {
  const countries = {
    'TR': 'Türkiye', 'US': 'Amerika Birleşik Devletleri', 'GB': 'Birleşik Krallık',
    'DE': 'Almanya', 'FR': 'Fransa', 'IT': 'İtalya', 'ES': 'İspanya',
    'NL': 'Hollanda', 'BE': 'Belçika', 'CH': 'İsviçre', 'AT': 'Avusturya',
    'SE': 'İsveç', 'NO': 'Norveç', 'DK': 'Danimarka', 'FI': 'Finlandiya',
    'PL': 'Polonya', 'CZ': 'Çekya', 'HU': 'Macaristan', 'RO': 'Romanya',
    'BG': 'Bulgaristan', 'HR': 'Hırvatistan', 'SI': 'Slovenya', 'SK': 'Slovakya',
    'GR': 'Yunanistan', 'PT': 'Portekiz', 'IE': 'İrlanda', 'LU': 'Lüksemburg',
    'LT': 'Litvanya', 'LV': 'Letonya', 'EE': 'Estonya', 'UA': 'Ukrayna',
    'RU': 'Rusya', 'CN': 'Çin', 'JP': 'Japonya', 'KR': 'Güney Kore',
    'IN': 'Hindistan', 'BR': 'Brezilya', 'CA': 'Kanada', 'AU': 'Avustralya',
    'NZ': 'Yeni Zelanda', 'MX': 'Meksika', 'AR': 'Arjantin', 'CL': 'Şili',
    'CO': 'Kolombiya', 'PE': 'Peru', 'VE': 'Venezuela', 'ZA': 'Güney Afrika',
    'EG': 'Mısır', 'SA': 'Suudi Arabistan', 'AE': 'Birleşik Arap Emirlikleri',
    'IL': 'İsrail', 'IR': 'İran', 'IQ': 'Irak', 'SY': 'Suriye',
    'JO': 'Ürdün', 'LB': 'Lübnan', 'KW': 'Kuveyt', 'QA': 'Katar',
    'OM': 'Umman', 'BH': 'Bahreyn', 'YE': 'Yemen'
  };
  return countries[code] || code;
}

// Harita sınırlarını hesapla
function calculateBounds(markers) {
  if (markers.length === 0) return null;

  const lats = markers.map(m => m.latitude);
  const lngs = markers.map(m => m.longitude);

  return {
    north: Math.max(...lats),
    south: Math.min(...lats),
    east: Math.max(...lngs),
    west: Math.min(...lngs),
    center: {
      lat: (Math.max(...lats) + Math.min(...lats)) / 2,
      lng: (Math.max(...lngs) + Math.min(...lngs)) / 2
    }
  };
}

// 🔐 API auth gate
// Not: bazı endpoint'ler public olmalı (health/version/login/widget/CDN helpers).
// Express `app.use('/api', ...)` altında `req.path` "/health" gibi gelir ("/api" prefix'i düşer)
const PUBLIC_API_PREFIXES = [
  '/health',
  '/version',
  '/login',
  '/logout',
  '/status',
  '/widget/',      // Discord widget proxy (CORS helper)
  '/discord/'      // CDN/url helper endpoints
];

app.use('/api', (req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  const p = req.path || '';
  if (PUBLIC_API_PREFIXES.some(prefix => p === prefix || p.startsWith(prefix))) return next();
  if (req.session?.authed) return next();
  return res.status(401).json({ error: 'unauthorized' });
});

// 📧 EMAIL OSINT ENDPOINT - IntelX tarzı breach ve reputation raporu
app.get('/api/email-osint', async (req, res) => {
  const email = req.query.email;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'invalid_email', message: 'Geçerli bir email adresi girin' });
  }

  try {
    console.log(`[EmailOSINT] Araştırma başlatıldı: ${email}`);
    const results = await performEmailOSINT(email);
    console.log(`[EmailOSINT] Tamamlandı: ${email} - ${results.breaches?.length || 0} breach, risk: ${results.summary.risk_level}`);
    return res.json(results);
  } catch (error) {
    console.error('[EmailOSINT] Hata:', error.message);
    return res.status(500).json({ error: 'osint_failed', message: 'Email araştırması başarısız oldu' });
  }
});

app.post('/api/guilds-enrich', async (req, res) => {
  if (Date.now() < findCordRateLimitedUntil) {
    return res.json({
      count: 0,
      guilds: [],
      rate_limited: true,
      retry_after_ms: Math.max(0, findCordRateLimitedUntil - Date.now())
    });
  }

  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const guildItems = Array.isArray(req.body?.guilds) ? req.body.guilds : [];

  const requested = [];
  for (const it of guildItems) {
    const id = String(it?.id ?? '').trim();
    if (!/^\d{10,30}$/.test(id)) continue;
    const samples = Array.isArray(it?.sample_member_ids) ? it.sample_member_ids : (Array.isArray(it?.samples) ? it.samples : []);
    // Artık 12 sample member alıyoruz (daha fazla şans için)
    requested.push({ id, sample_member_ids: samples.map(x => String(x ?? '').trim()).filter(x => /^\d{10,30}$/.test(x) && !x.startsWith('7656119')).slice(0, 12) });
  }
  for (const idRaw of ids) {
    const id = String(idRaw ?? '').trim();
    if (!/^\d{10,30}$/.test(id)) continue;
    requested.push({ id, sample_member_ids: [] });
  }

  // dedupe
  const byId = new Map();
  for (const r of requested) {
    const prev = byId.get(r.id);
    if (!prev) byId.set(r.id, r);
    else {
      const mergedSamples = [...new Set([...(prev.sample_member_ids || []), ...(r.sample_member_ids || [])])].slice(0, 12);
      prev.sample_member_ids = mergedSamples;
    }
  }
  const unique = [...byId.values()].slice(0, 50);
  if (unique.length === 0) return res.json({ count: 0, guilds: [] });

  const concurrency = 2; // Rate limit'den kaçınmak için düşürüldü
  const enriched = [];
  let idx = 0;

  async function worker() {
    while (idx < unique.length) {
      const item = unique[idx++];
      const id = item.id;
      try {
        let name = null;
        let icon = null;
        let banner = null;

        // NOT: FindCord /api/user/{id} sadece USER ID'ler için çalışır
        // Guild ID'yi doğrudan sorgulamıyoruz, sadece sample member IDs üzerinden buluyoruz
        
        // Sample member IDs üzerinden guild'i bul
        if (item.sample_member_ids && item.sample_member_ids.length > 0) {
          for (const mid of item.sample_member_ids) {
            // Rate limit kontrolü
            if (Date.now() < findCordRateLimitedUntil) {
              console.log(`[Guilds Enrich] Rate limited, stopping`);
              break;
            }
            
            const mfc = await getFindCordData(mid);
            if (!mfc) continue;
            const mGuilds = mfc.Guilds || mfc.guilds;
            if (!Array.isArray(mGuilds)) continue;
            
            // Bu kullanıcının katıldığı guild'lerde ara
            const mg = mGuilds.find(g => 
              String(g.GuildId ?? g.guild_id ?? g.id ?? '') === String(id)
            );
            
            if (mg) {
              name = mg.GuildName || mg.guild_name || mg.name || name;
              icon = mg.GuildIcon || mg.guild_icon || mg.icon || mg.Icon || icon;
              banner = mg.GuildBanner || mg.guild_banner || mg.banner || mg.Banner || banner;
              console.log(`[Guilds Enrich] Found ${id} via member ${mid}: ${name}`);
              break;
            }
            
            // Rate limit'den kaçınmak için bekleme
            await new Promise(r => setTimeout(r, 100));
          }
        }

        const out = { id, name, icon, banner };
        if (icon) {
          if (icon.startsWith('http')) out.icon_url = icon;
          else out.icon_url = `https://cdn.discordapp.com/icons/${id}/${icon}.png?size=128`;
        }
        if (banner) {
          if (banner.startsWith('http')) out.banner_url = banner;
          else out.banner_url = `https://cdn.discordapp.com/banners/${id}/${banner}.png?size=512`;
        }
        if (out.name || out.icon_url || out.banner_url) enriched.push(out);
      } catch {
        // ignore individual failures
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, unique.length) }, () => worker());
  await Promise.all(workers);

  return res.json({ count: enriched.length, guilds: enriched, rate_limited: Date.now() < findCordRateLimitedUntil });
});

app.get('/api/search', async (req, res) => {
  const discordId = String(req.query?.discord_id ?? '').trim();
  if (!discordId || !/\d{5,30}$/.test(discordId)) {
    return res.status(400).json({ error: 'invalid_discord_id' });
  }

  let allRaw = [];
  let findCordData = null;
  let discordLookupData = null;
  let discordIdData = null;
  
  // Discord OSINT API'lerini paralel çağır
  [findCordData, discordLookupData, discordIdData] = await Promise.all([
    getFindCordData(discordId),
    getDiscordLookup(discordId),
    getDiscordIDInfo(discordId)
  ]);
  
  if (isDBReady()) {
    // DB modu - PostgreSQL'den sorgula
    const [dbResults, dbGuilds] = await Promise.all([
      dbSearchByDiscordId(discordId),
      dbGetUserGuilds(discordId)
    ]);
    allRaw = dbResults.map(r => ({
      ...r,
      email_masked: maskEmail(r.email),
      ip_masked: maskIp(r.ip)
    }));
  } else {
    // Dosya modu - TXT/SQL dosyalardan tara
    const [txtMatches, ...sqlMatchLists] = await Promise.all([
      searchTxtByDiscordId(discordId),
      ...SQL_PATHS.map((p) => scanSqlFileForDiscordId(p, discordId))
    ]);
    allRaw = [...txtMatches, ...sqlMatchLists.flat()];
  // Try to fetch FindCord data for this id
  try { fc = await getFindCordData(discordId); } catch { fc = null; }
  
  // DEBUG: log scenario run request
  }

  // Tüm sonuçları birleştir — en zengin veriyi tek kartta topla
  const merged = {
    discord_id: discordId,
    username: null,
    discriminator: null,
    email: null,
    ip: null,
    ip_location: null,
    registration_ip: null,
    last_ip: null,
    avatar_hash: null,
    bio: null,
    premium: null,
    verified: null,
    subscription_type: null,
    is_active: null,
    created_at: null,
    last_login: null,
    connections_apps: [],
    sources: []
  };

  for (const item of allRaw) {
    if (item.username && item.username !== 'Bilinmeyen Kullanıcı') merged.username = item.username;
    if (item.discriminator) merged.discriminator = item.discriminator;
    if (item.email_masked) merged.email = item.email_masked;
    if (item.ip_masked && !merged.ip) merged.ip = item.ip_masked;
    if (item.registration_ip_masked && !merged.registration_ip) merged.registration_ip = item.registration_ip_masked;
    if (item.last_ip_masked && !merged.last_ip) merged.last_ip = item.last_ip_masked;
    if (item.avatar_hash && item.avatar_hash !== 'N/A') merged.avatar_hash = item.avatar_hash;
    if (item.bio && item.bio !== 'null') merged.bio = item.bio;
    if (item.premium !== null && merged.premium === null) merged.premium = item.premium;
    if (item.verified !== null && merged.verified === null) merged.verified = item.verified;
    if (item.subscription_type) merged.subscription_type = item.subscription_type;
    if (item.is_active !== null && merged.is_active === null) merged.is_active = item.is_active;
    if (item.created_at) merged.created_at = item.created_at;
    if (item.last_login) merged.last_login = item.last_login;
    // Bağlantıları birleştir (tekrarsız, app adına göre)
    if (Array.isArray(item.connections_apps)) {
      for (const c of item.connections_apps) {
        const key = typeof c === 'object' ? c.app : String(c);
        if (!merged.connections_apps.some(x => (typeof x === 'object' ? x.app : String(x)) === key)) {
          merged.connections_apps.push(c);
        }
      }
    }
  }

  // IP konum
  const ipForGeo = merged.ip || merged.last_ip || merged.registration_ip;
  if (ipForGeo) merged.ip_location = getIpLocation(ipForGeo);

  // DiscordLookup API verilerini birleştir
  if (discordLookupData) {
    if (discordLookupData.username && !merged.username) merged.username = discordLookupData.username;
    if (discordLookupData.display_name && !merged.global_name) merged.global_name = discordLookupData.display_name;
    if (discordLookupData.avatar_url && !merged.avatar_url) merged.avatar_url = discordLookupData.avatar_url;
    if (discordLookupData.banner_url && !merged.banner_url) merged.banner_url = discordLookupData.banner_url;
    if (discordLookupData.accent_color) merged.accent_color = discordLookupData.accent_color;
    if (discordLookupData.badges?.length > 0) merged.badges = discordLookupData.badges;
    if (discordLookupData.premium_type) merged.premium_type = discordLookupData.premium_type;
  }
  
  // Discord.id API verilerini birleştir
  if (discordIdData) {
    if (discordIdData.username && !merged.username) merged.username = discordIdData.username;
    if (discordIdData.discriminator && !merged.discriminator) merged.discriminator = discordIdData.discriminator;
    if (discordIdData.avatar && !merged.avatar_hash) merged.avatar_hash = discordIdData.avatar;
    if (discordIdData.banner && !merged.banner_url) merged.banner_url = `https://cdn.discordapp.com/banners/${discordId}/${discordIdData.banner}.png?size=512`;
    if (discordIdData.accent_color) merged.accent_color = discordIdData.accent_color;
    if (discordIdData.public_flags) merged.public_flags = discordIdData.public_flags;
    if (discordIdData.bot) merged.is_bot = discordIdData.bot;
    if (discordIdData.system) merged.is_system = discordIdData.system;
  }
  
  // Kaynak her zaman Zagros
  merged.sources = ['Zagros'];
  
  // API kaynaklarını ekle
  const apiSources = [];
  if (findCordData) apiSources.push('FindCord');
  if (discordLookupData) apiSources.push('DiscordLookup');
  if (discordIdData) apiSources.push('Discord.id');
  if (apiSources.length > 0) merged.api_sources = apiSources;

  // Potansiyel arkadaşları bul (aynı IP veya guild'den)
  const potentialFriends = [];
  if (merged.ip || merged.findcord_servers?.length > 0) {
    const friendCandidates = new Map();
    
    // Aynı IP'den kayıtları bul
    if (merged.ip) {
      for (const sqlPath of SQL_PATHS) {
        try {
          if (!fs.existsSync(sqlPath)) continue;
          const ipMatches = await scanSqlFileForIp(sqlPath, merged.ip, discordId, 25, 250_000);
          for (const m of ipMatches) {
            if (!friendCandidates.has(m.discord_id)) {
              friendCandidates.set(m.discord_id, {
                discord_id: m.discord_id,
                email: m.email,
                relation: m.relation,
                common_ip: m.common_ip,
                confidence: m.confidence
              });
            }
          }
        } catch { /* ignore */ }
      }
    }
    
    // FindCord guild'lerinden üyeleri kontrol et - AGRESİF ARAMA
    if (merged.findcord_servers?.length > 0) {
      console.log(`[Potansiyel Arkadaş] ${merged.findcord_servers.length} FindCord sunucusu bulundu`);
      
      for (const guild of merged.findcord_servers) {
        console.log(`[Potansiyel Arkadaş] Sunucu aranıyor: ${guild.name} (ID: ${guild.id})`);
        
        for (const sqlPath of SQL_PATHS) {
          if (!fs.existsSync(sqlPath)) continue;
          
          try {
            // Satır satır oku (performans için)
            const rs = fs.createReadStream(sqlPath, { encoding: 'utf8' });
            const rl = readline.createInterface({ input: rs, crlfDelay: Infinity });
            let lineCount = 0;
            
            for await (const line of rl) {
              lineCount++;
              // Sunucu ID'si veya ismi geçen satırları bul
              if (line.includes(guild.id) || (guild.name && line.toLowerCase().includes(guild.name.toLowerCase()))) {
                // Discord ID pattern'ini ara
                const idMatches = line.match(/'(\d{17,20})'/g);
                if (idMatches) {
                  for (const idMatch of idMatches) {
                    const cleanId = idMatch.replace(/'/g, '');
                    if (cleanId !== discordId && !friendCandidates.has(cleanId) && /\d{17,20}/.test(cleanId)) {
                      console.log(`[Potansiyel Arkadaş] Bulundu: ${cleanId} (${guild.name})`);
                      friendCandidates.set(cleanId, {
                        discord_id: cleanId,
                        relation: 'same_guild',
                        guild_name: guild.name,
                        guild_id: guild.id,
                        confidence: 'medium'
                      });
                    }
                  }
                }
              }
              if (lineCount % 50000 === 0) {
                console.log(`[Potansiyel Arkadaş] ${path.basename(sqlPath)}: ${lineCount} satır tarandı`);
              }
            }
            rl.close();
          } catch (err) {
            console.error(`[Hata] ${sqlPath}:`, err.message);
          }
        }
      }
      console.log(`[Potansiyel Arkadaş] Toplam bulunan: ${friendCandidates.size}`);
    }
    
    // Sonuçları diziye çevir (max 10)
    potentialFriends.push(...Array.from(friendCandidates.values()).slice(0, 10));
  }
  
  // Potansiyel arkadaşların detaylı bilgilerini çek
  for (const friend of potentialFriends) {
    try {
      // TXT dosyasından ara
      const txtIndex = await getTxtUsersIndex();
      if (txtIndex) {
        const u = txtIndex.get(String(friend.discord_id));
        if (u) {
          friend.username = u.username || friend.username;
          friend.email = u.email || friend.email;
          friend.found_in = 'TXT';
        }
      }
      
      // SQL dosyalarından ara
      if (!friend.email) {
        for (const sqlPath of SQL_PATHS) {
          if (!fs.existsSync(sqlPath)) continue;
          try {
            const hits = await scanSqlFileForDiscordId(sqlPath, friend.discord_id, 1);
            const h = hits?.[0];
            if (h) {
              if (h.email) friend.email = h.email;
              if (h.username && !friend.username) friend.username = h.username;
              if (!friend.found_in) friend.found_in = path.basename(sqlPath);
            }
          } catch { /* ignore */ }
          if (friend.email) break;
        }
      }
    } catch { /* ignore */ }
  }
  
  merged.potential_friends = potentialFriends;

  // FindCord API verisini ekle
  if (findCordData) {
    merged.findcord = findCordData;
    const ui = findCordData.UserInfo || findCordData.userInfo || {};

    // FindCord UserInfo ile boş alanları doldur
    if (!merged.username && ui.UserName) merged.username = ui.UserName;
    if (!merged.discriminator && ui.LegacyUserName) {
      const discMatch = ui.LegacyUserName.match(/#(\d+)$/);
      if (discMatch) merged.discriminator = discMatch[1];
    }
    if (ui.UserGlobalName) merged.findcord_global_name = ui.UserGlobalName;
    if (ui.UserdisplayAvatar) merged.findcord_avatar_url = ui.UserdisplayAvatar;
    if (!merged.bio && ui.UserBio) merged.bio = ui.UserBio;
    if (ui.UserBanner) merged.findcord_banner_url = ui.UserBanner;
    if (ui.UserPronouns) merged.findcord_pronouns = ui.UserPronouns;
    if (ui.UserCreated) merged.findcord_created = ui.UserCreated;
    if (ui.Presence) merged.findcord_presence = ui.Presence;
    // Avatar hash'i URL'den çıkar
    if (!merged.avatar_hash && ui.UserdisplayAvatar) {
      const avMatch = ui.UserdisplayAvatar.match(/\/avatars\/\d+\/(a?_\w+)\./);
      if (avMatch) merged.avatar_hash = avMatch[1];
    }
    // Badges
    if (Array.isArray(ui.UserBadge) && ui.UserBadge.length > 0) {
      merged.findcord_badges = ui.UserBadge.map(b => ({
        id: b.id,
        description: b.description,
        icon: b.icon ? `https://cdn.discordapp.com/badge-icons/${b.icon}.png` : null
      }));
    }
    // Guilds - tüm formatları yakala
    const fcGuilds = findCordData.Guilds || findCordData.guilds || findCordData.Guild || findCordData.guild || [];
    if (Array.isArray(fcGuilds) && fcGuilds.length > 0) {
      merged.findcord_servers = fcGuilds.map(g => {
        const gid = String(g.GuildId || g.guild_id || g.id || '');
        const gname = g.GuildName || g.guild_name || g.name || g.Name || '';
        const gicon = g.GuildIcon || g.guild_icon || g.icon || g.Icon || null;
        const gbanner = g.GuildBanner || g.guild_banner || g.banner || g.Banner || null;
        
        // Icon URL oluştur
        let icon_url = null;
        if (gicon) {
          if (gicon.startsWith('http')) icon_url = gicon;
          else if (gid) icon_url = buildGuildIconUrl(gid, gicon);
        }
        // Banner URL oluştur
        let banner_url = null;
        if (gbanner) {
          if (gbanner.startsWith('http')) banner_url = gbanner;
          else if (gid) banner_url = buildGuildBannerUrl(gid, gbanner);
        }
        
        return {
          id: gid,
          name: gname,
          icon: gicon,
          icon_url,
          banner: gbanner,
          banner_url,
          display_name: g.displayName || g.Display || null,
          booster: g.Booster || g.booster || false,
          join_time: g.JoinTime || g.join_time || null,
          roles: Array.isArray(g.Roles || g.roles) ? (g.Roles || g.roles).map(r => ({
            id: r.id || r.Id,
            name: r.name || r.Name,
            color: r.color || r.Color || null,
            icon: r.icon || r.Icon || null
          })) : [],
          stats: g.UserStats || g.user_stats || null
        };
      });
    }
    // Ek bilgiler
    if (findCordData.TopName) merged.findcord_top_name = findCordData.TopName;
    if (findCordData.TopAge) merged.findcord_top_age = findCordData.TopAge;
    if (findCordData.TopSex) merged.findcord_top_sex = findCordData.TopSex;
    if (Array.isArray(findCordData.displayNames)) merged.findcord_display_names = findCordData.displayNames;
    if (Array.isArray(findCordData.Punishments) && findCordData.Punishments.length > 0) {
      merged.findcord_punishments = findCordData.Punishments;
    }
    // Son mesajlar
    if (Array.isArray(findCordData.Messages) && findCordData.Messages.length > 0) {
      merged.findcord_recent_messages = findCordData.Messages.slice(0, 20).map(m => ({
        content: m.content || m.message || null,
        channel_name: m.channel_name || m.ChannelName || null,
        timestamp: m.timestamp || m.Timestamp || null,
        guild_name: m.guild_name || m.GuildName || null
      }));
    }
    // Ses arkadaşları
    if (Array.isArray(findCordData.VoiceFriends) && findCordData.VoiceFriends.length > 0) {
      merged.findcord_voice_friends = findCordData.VoiceFriends.slice(0, 10).map(f => ({
        discord_id: f.discord_id || f.DiscordId || f.id,
        username: f.username || f.Username || f.name,
        last_connected: f.last_connected || f.LastConnected || null,
        total_time: f.total_time || f.TotalTime || null
      }));
    }
    // Sample messages (sunucu sorgusu için)
    if (Array.isArray(findCordData.sample_messages) && findCordData.sample_messages.length > 0) {
      merged.sample_messages = findCordData.sample_messages.slice(0, 20);
    }
    // Voice friends (sunucu sorgusu için)
    if (Array.isArray(findCordData.voice_friends) && findCordData.voice_friends.length > 0) {
      merged.voice_friends = findCordData.voice_friends.slice(0, 10);
    }
  }

  // 🎮 Discord API ile zenginleştir (bot token varsa)
  if (DISCORD_BOT_TOKEN && discordId) {
    try {
      const discordUser = await fetchDiscordUser(discordId);
      if (discordUser) {
        // Avatar - Discord API'den gelen öncelikli
        if (!merged.findcord_avatar_url && discordUser.avatar_url) {
          merged.enriched_avatar_url = discordUser.avatar_url;
        }
        // Banner - Discord API'den gelen öncelikli
        if (!merged.findcord_banner_url && discordUser.banner_url) {
          merged.enriched_banner_url = discordUser.banner_url;
        }
        // Username - Discord API'den gelen öncelikli
        if (!merged.username && discordUser.username) {
          merged.username = discordUser.username;
        }
        if (!merged.findcord_global_name && discordUser.global_name) {
          merged.findcord_global_name = discordUser.global_name;
        }
        // Avatar hash
        if (!merged.avatar_hash && discordUser.avatar) {
          merged.avatar_hash = discordUser.avatar;
        }
        merged.discord_api_enriched = true;
        console.log(`[Discord API] ✅ Kullanıcı zenginleştirildi: ${discordId}`);
      }
    } catch (err) {
      console.log(`[Discord API] Kullanıcı zenginleştirme hatası ${discordId}: ${err.message}`);
    }
  }

  // Avatar URL'i kesinleştir - en iyi kaynaktan al
  if (!merged.enriched_avatar_url && !merged.findcord_avatar_url) {
    if (merged.avatar_hash) {
      merged.enriched_avatar_url = discordAvatarUrl(discordId, merged.avatar_hash, 256);
    } else {
      merged.enriched_avatar_url = discordDefaultAvatarUrl(discordId);
    }
  }

  const results = {
    discord_id: discordId,
    result: merged,
    findcord_available: !!findCordData,
    local_sources_available: allRaw.length > 0
  };

  return res.json(results);
});

// Email veya IP ile arama
async function searchTxtByField(field, value) {
  if (!fs.existsSync(TXT_PATH)) return [];
  const content = await fs.promises.readFile(TXT_PATH, 'utf8');
  const obj = safeJsonParse(content);
  const users = Array.isArray(obj?.users) ? obj.users : [];
  const val = String(value).toLowerCase();
  return users.filter(u => {
    const v = String(u?.[field] ?? '').toLowerCase();
    return v === val || v.includes(val);
  }).map(u => ({
    source: 'Zagros',
    discord_id: String(u.discord_id ?? ''),
    username: u.username ?? null,
    discriminator: u.discriminator ?? null,
    email_masked: maskEmail(u.email ?? null),
    registration_ip_masked: maskIp(u.registration_ip ?? null),
    last_ip_masked: maskIp(u.last_ip ?? null),
    created_at: u.created_at ?? null,
    last_login: u.last_login ?? null,
    subscription_type: u.subscription_type ?? null,
    is_active: u.is_active ?? null
  }));
}

async function scanSqlFileForField(sqlPath, field, value, maxHits = 30) {
  if (!fs.existsSync(sqlPath)) return [];
  const matches = [];
  try {
    const rs = fs.createReadStream(sqlPath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: rs, crlfDelay: Infinity });
    const needle = String(value);

    for await (const line of rl) {
      if (!line.includes(needle)) continue;

      let email = null, ip = null, username = null, discriminator = null;
      let discord_id = null, connections_apps = [], avatar_hash = null;

      // Discord ID çıkar (tuple veya JSON)
      const idTuple = line.match(/\(\s*(\d{10,20})\s*,/);
      if (idTuple) discord_id = idTuple[1];
      const idJson = line.match(/"discord_id"\s*:\s*"(\d{10,20})"/);
      if (!discord_id && idJson) discord_id = idJson[1];
      const idSearched = line.match(/"searched_discord_id"\s*:\s*"(\d{10,20})"/);
      if (!discord_id && idSearched) discord_id = idSearched[1];

      const rawEmail = extractField(line, 'email');
      if (rawEmail) email = decodeBase64Maybe(rawEmail);
      const rawIp = extractField(line, 'ip');
      if (rawIp && !rawIp.match(/^[a-f0-9]{32}$/)) ip = rawIp;
      const rawUser = extractField(line, 'username');
      if (rawUser && rawUser !== 'N/A' && rawUser !== 'N\\/A') username = rawUser;
      const rawDisc = extractField(line, 'discriminator');
      if (rawDisc && rawDisc !== 'N/A' && rawDisc !== 'N\\/A') discriminator = rawDisc;
      const rawAvatar = extractField(line, 'avatar_hash');
      if (rawAvatar && rawAvatar !== 'N/A' && rawAvatar !== 'N\\/A') avatar_hash = rawAvatar;

      connections_apps = extractConnectionsFromLine(line);

      // Tuple format: (id, 'base64email', ...)
      if (!email && line.match(/\(\s*\d+\s*,\s*'/)) {
        const tupleMatch = line.match(/\(\s*\d+\s*,\s*'([^']+)'/);
        if (tupleMatch) email = decodeBase64Maybe(tupleMatch[1]);
      }

      // Fallback
      if (!email) {
        const m = line.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        if (m) email = m[1];
      }
      if (!ip) {
        const m = line.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
        if (m) ip = m[1];
      }

      matches.push({
        discord_id, email_masked: maskEmail(email), ip_masked: maskIp(ip),
        connections_apps, username, discriminator, avatar_hash
      });
      if (matches.length >= maxHits) break;
    }
    rl.close(); rs.close();
  } catch (err) {
    console.error(`[Hata] ${sqlPath}:`, err.message);
  }
  return matches;
}

app.get('/api/search-email', requireSubscription, async (req, res) => {
  const email = String(req.query?.email ?? '').trim().toLowerCase();
  if (!email || email.length < 3) return res.status(400).json({ error: 'invalid_email' });

  const breaches = [];
  const externalSources = [];

  // HaveIBeenPwned API sorgusu
  try {
    const hibpRes = await axios.get(`https://haveibeenpwned.com/api/v3/breachedaccount/${email}`, {
      headers: {
        'User-Agent': 'Zagros OSINT Scanner',
        'hibp-api-key': process.env.HIBP_API_KEY || ''
      },
      timeout: 5000
    });
    if (Array.isArray(hibpRes.data)) {
      for (const breach of hibpRes.data) {
        externalSources.push({
          source: 'HaveIBeenPwned',
          site: breach.Name,
          breach_date: breach.BreachDate,
          added_date: breach.AddedDate,
          description: breach.Description,
          data_classes: breach.DataClasses,
          is_verified: breach.IsVerified,
          is_fabricated: breach.IsFabricated,
          is_sensitive: breach.IsSensitive
        });
      }
    }
  } catch (err) {
    console.log(`[Email OSINT] HaveIBeenPwned hatası:`, err.message);
  }

  if (isDBReady()) {
    // DB modu - PostgreSQL'den email ara
    const dbResults = await dbSearchByEmail(email);
    for (const r of dbResults) {
      const ip = r.ip || null;
      breaches.push({
        source: r.source || 'Zagros',
        site: r.source || 'Zagros',
        username: r.username || null,
        discord_id: r.discord_id || '',
        email: r.email || null,
        ip: ip,
        ip_location: ip ? getIpLocation(ip) : null,
        registration_ip: null,
        last_ip: null,
        connections_apps: r.connections_apps || [],
        avatar_hash: r.avatar_hash || null,
        phone: r.phone || null,
        bio: null
      });
    }
  } else {
  // === TXT dosyası: dcıdsorgudata ===
  if (fs.existsSync(TXT_PATH)) {
    try {
      const content = await fs.promises.readFile(TXT_PATH, 'utf8');
      const obj = safeJsonParse(content);
      const users = Array.isArray(obj?.users) ? obj.users : [];
      const val = email.toLowerCase();
      for (const u of users) {
        if (String(u?.email ?? '').toLowerCase().includes(val)) {
          const ip = u.registration_ip || u.last_ip || null;
          breaches.push({
            source: 'Zagros',
            site: 'Zagros',
            username: u.username || null,
            discord_id: String(u.discord_id ?? ''),
            email: u.email || null,
            ip: ip,
            ip_location: ip ? getIpLocation(ip) : null,
            registration_ip: u.registration_ip || null,
            last_ip: u.last_ip || null,
            subscription_type: u.subscription_type || null,
            is_active: u.is_active ?? null,
            created_at: u.created_at || null,
            last_login: u.last_login || null,
            connections_apps: [],
            avatar_hash: null,
            bio: null
          });
        }
      }
    } catch { /* ignore */ }
  }

  // === SQL dosyaları: her biri ayrı breach ===
  // OSINT tarzı: kaynak isimleri gizli, hepsi Zagros olarak gösterilir
  const sourceNames = {
    'discord data.sql': { source: 'Zagros', site: 'Zagros' },
    'idsorgu(1).sql': { source: 'Zagros', site: 'Zagros' },
    '840k.sql': { source: 'Zagros', site: 'Zagros' }
  };

  // Email'in base64 hallerini de dene
  const b64Full = Buffer.from(email, 'utf8').toString('base64');
  const needles = [email, b64Full];

  for (const sqlPath of SQL_PATHS) {
    if (!fs.existsSync(sqlPath)) continue;
    const baseName = path.basename(sqlPath);
    const sourceInfo = sourceNames[baseName] || { source: 'Zagros', site: 'Zagros' };

    try {
      const rs = fs.createReadStream(sqlPath, { encoding: 'utf8' });
      const rl = readline.createInterface({ input: rs, crlfDelay: Infinity });

      for await (const line of rl) {
        // Satır email veya base64'email içermeli
        let matched = false;
        for (const n of needles) { if (line.includes(n)) { matched = true; break; } }
        if (!matched) continue;

        // scanSqlFileForDiscordId ile aynı çıkarma mantığını kullan
        let foundEmail = null, username = null, discord_id = null;
        let ip = null, avatar_hash = null, bio = null;
        let discriminator = null, premium = null, verified = null;
        let connections_apps = [], created_at = null, last_login = null;
        let subscription_type = null, is_active = null;
        let registration_ip = null, last_ip = null;
        let isUsersTable = false;

        // === FORMAT 1: users tablosu INSERT ===
        if (line.includes('INSERT INTO') && (line.includes('`users`') || line.includes('users'))) {
          isUsersTable = true;
          const vals = [...line.matchAll(/'([^']*)'/g)].map(m => m[1]);
          if (vals.length >= 6) {
            username = vals[2] || null;
            discriminator = vals[3] || null;
            foundEmail = vals[4] || null;
            avatar_hash = vals[5] || null;
            for (let vi = vals.length - 1; vi >= 0; vi--) {
              if (vals[vi].match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
                if (!registration_ip) registration_ip = vals[vi];
                else if (!last_ip) last_ip = vals[vi];
              }
            }
            ip = last_ip || registration_ip;
          }
        }

        // === FORMAT 1b: discord_ids tablosu tuple ===
        if (!isUsersTable && line.match(/\(\s*\d{10,20}\s*,/)) {
          const tupleMatch = line.match(/\(\s*(\d{10,20})\s*,/);
          if (tupleMatch) discord_id = tupleMatch[1];
          const tupleVals = [...line.matchAll(/'([^']*)'/g)].map(m => m[1]);
          if (tupleVals.length >= 1) foundEmail = decodeBase64Maybe(tupleVals[0]);
          if (tupleVals.length >= 5) {
            const candidate = tupleVals[4];
            if (candidate && (candidate.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/) || candidate.includes(':'))) {
              ip = candidate;
            }
          }
          // Diğer IP'leri de ara
          if (!ip) {
            for (const v of tupleVals) {
              if (v.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) { ip = v; break; }
              if (v.match(/^[0-9a-f]{1,4}(:[0-9a-f]{1,4}){2,7}$/i)) { ip = v; break; }
            }
          }
        }

        // === FORMAT 2: query_logs JSON (response_data) ===
        // Hem "response_data" key'li hem de tuple içinde JSON'ı yakala
        {
          let jsonStr = null;
          // response_data key ile
          if (line.includes('"response_data"') || line.includes("'response_data'")) {
            const jsonPatterns = [
              /'(\{[^']*\})'/,
              /"response_data"\s*:\s*"(\{.*?\})"\s*[,}]/
            ];
            for (const pat of jsonPatterns) {
              const m = line.match(pat);
              if (m) { jsonStr = m[1]; break; }
            }
          }
          // Tuple içinde JSON: (id, user_id, 'discord_id', 'ip', 'ua', '{...}', ...)
          if (!jsonStr && line.match(/\(\s*\d+\s*,\s*\d+\s*,\s*'\d+/)) {
            const tupleIdMatch = line.match(/\(\s*\d+\s*,\s*\d+\s*,\s*'(\d{10,20})'/);
            if (tupleIdMatch) discord_id = tupleIdMatch[1];
            // JSON string'i bul: tek tırnak içinde { ile başlayan
            const jsonInTuple = line.match(/'(\{"[^']*\})'/);
            if (jsonInTuple) jsonStr = jsonInTuple[1];
          }

          if (jsonStr) {
            const rawJson = jsonStr.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
            const parsed = safeJsonParse(rawJson);
            if (parsed) {
              const d = parsed.data || parsed;
              if (d.email) foundEmail = decodeBase64Maybe(d.email);
              if (d.username && d.username !== 'N/A' && d.username !== 'N\\/A') username = d.username;
              if (d.discord_id) discord_id = d.discord_id;
              if (d.discriminator && d.discriminator !== '0' && d.discriminator !== 'N/A') discriminator = d.discriminator;
              if (d.avatar_hash && d.avatar_hash !== 'N/A' && d.avatar_hash !== 'N\\/A') avatar_hash = d.avatar_hash;
              if (d.bio && d.bio !== 'null' && d.bio !== 'N/A') bio = d.bio;
              if (d.premium !== undefined && d.premium !== null) premium = String(d.premium);
              if (d.verified !== undefined && d.verified !== null) verified = String(d.verified);
              if (d.ip && !d.ip.match(/^[a-f0-9]{32}$/i)) ip = d.ip;
              if (d.registration_ip) registration_ip = d.registration_ip;
              if (d.last_ip) last_ip = d.last_ip;
              if (d.subscription_type) subscription_type = d.subscription_type;
              if (d.is_active !== undefined) is_active = d.is_active;
              if (d.created_at) created_at = d.created_at;
              if (d.last_login) last_login = d.last_login;
              if (d.connections && typeof d.connections === 'object' && !Array.isArray(d.connections)) {
                connections_apps = parseConnObj(d.connections);
              }
            }
          }
          // searched_discord_id
          const idSearched = line.match(/"searched_discord_id"\s*:\s*"(\d{10,20})"/);
          if (!discord_id && idSearched) discord_id = idSearched[1];
        }

        // === FORMAT 3: Basit tuple (users tablosu benzeri) ===
        if (!isUsersTable && !foundEmail && line.match(/\(\s*\d+\s*,/)) {
          const tupleVals = [...line.matchAll(/'([^']*)'/g)].map(m => m[1]);
          // Format: (id, 'discord_id', 'username', 'discriminator', 'email', 'avatar_hash', ...)
          if (tupleVals.length >= 5) {
            discord_id = tupleVals[1] || discord_id;
            username = tupleVals[2] || username;
            discriminator = tupleVals[3] || discriminator;
            foundEmail = tupleVals[4] || null;
            avatar_hash = tupleVals[5] || avatar_hash;
          }
        }

        // Email eşleşme kontrolü
        if (!foundEmail) continue;
        const emailLower = foundEmail.toLowerCase();
        if (!emailLower.includes(email) && email !== b64Full) continue;

        const finalIp = ip || last_ip || registration_ip;
        const hasData = username || discord_id || finalIp || avatar_hash || bio ||
                        (Array.isArray(connections_apps) && connections_apps.length > 0);
        if (!hasData) continue;

        breaches.push({
          source: sourceInfo.source,
          site: sourceInfo.site,
          username, discord_id, email: foundEmail,
          discriminator, avatar_hash, bio,
          premium, verified,
          ip: finalIp,
          ip_location: finalIp ? getIpLocation(finalIp) : null,
          registration_ip, last_ip,
          subscription_type, is_active, created_at, last_login,
          connections_apps
        });

        if (breaches.length > 50) break;
      }
      rl.close(); rs.close();
    } catch (err) {
      console.error(`[Hata] ${sqlPath}:`, err.message);
    }
  }
  } // else (dosya modu) sonu

  // Platform URL oluşturucu
function getConnectionUrl(app, id, name) {
  const appLower = app.toLowerCase();
  if (appLower.includes('spotify')) return `https://open.spotify.com/user/${id || name}`;
  if (appLower.includes('github')) return `https://github.com/${name || id}`;
  if (appLower.includes('twitter') || appLower.includes('x')) return `https://twitter.com/${name || id}`;
  if (appLower.includes('instagram')) return `https://instagram.com/${name || id}`;
  if (appLower.includes('reddit')) return `https://reddit.com/user/${name || id}`;
  if (appLower.includes('steam')) return `https://steamcommunity.com/profiles/${id}`;
  if (appLower.includes('twitch')) return `https://twitch.tv/${name || id}`;
  if (appLower.includes('youtube')) return `https://youtube.com/channel/${id}`;
  if (appLower.includes('paypal')) return null; // PayPal profil URL'i yok
  if (appLower.includes('ebay')) return `https://ebay.com/usr/${name || id}`;
  if (appLower.includes('facebook')) return `https://facebook.com/${id || name}`;
  if (appLower.includes('tiktok')) return `https://tiktok.com/@${name || id}`;
  if (appLower.includes('discord')) return null; // Discord profil URL'i public değil
  if (appLower.includes('battle.net') || appLower.includes('battlenet')) return null;
  if (appLower.includes('epic')) return null;
  if (appLower.includes('riot')) return null;
  if (appLower.includes('crunchyroll')) return null;
  return null;
}

// Dış OSINT kaynakları - paralel çalışsın
  const [githubResults, hibpBreaches, gravatarInfo, platformResults, emailrepInfo, hunterInfo, leakCheckInfo, intelxInfo] = await Promise.all([
    searchGitHubByEmail(email),
    checkHaveIBeenPwned(email),
    getGravatarInfo(email),
    searchPlatformsByEmail(email),
    checkEmailrep(email),
    getHunterEmailInfo(email),
    checkLeakCheck(email),
    searchIntelligenceXEmail(email)
  ]);
  
  // Yeni Email API sonuçlarını externalSources'a ekle
  if (hunterInfo) {
    externalSources.push({
      source: 'Hunter.io',
      ...hunterInfo,
      result: hunterInfo.result,
      score: hunterInfo.score,
      disposable: hunterInfo.disposable,
      webmail: hunterInfo.webmail,
      mx_records: hunterInfo.mx_records,
      smtp_check: hunterInfo.smtp_check
    });
  }
  
  if (leakCheckInfo && leakCheckInfo.found > 0) {
    externalSources.push({
      source: 'LeakCheck',
      found: leakCheckInfo.found,
      breaches: leakCheckInfo.breaches
    });
  }
  
  if (intelxInfo && intelxInfo.results?.length > 0) {
    externalSources.push({
      source: 'Intelligence X',
      results: intelxInfo.results
    });
  }

  // Discord kayıtlarını birleştir (aynı ID'li olanları tekilleştir)
  const seenDiscordIds = new Map();
  for (const b of breaches) {
    if (b.discord_id) {
      const existing = seenDiscordIds.get(b.discord_id);
      if (!existing) {
        seenDiscordIds.set(b.discord_id, { ...b, sources: [b.source || 'Zagros'] });
      } else {
        // En zengin veriyi tut, sources'u birleştir
        existing.sources.push(b.source || 'Zagros');
        if (!existing.username && b.username) existing.username = b.username;
        if (!existing.ip && b.ip) existing.ip = b.ip;
        if (!existing.connections_apps?.length && b.connections_apps?.length) {
          existing.connections_apps = b.connections_apps;
        }
      }
    }
  }
  
  // Site-kullanıcı listesi oluştur - birleştirilmiş Discord kayıtları
  const sites = [];
  for (const b of seenDiscordIds.values()) {
    sites.push({
      site: 'Discord',
      username: b.username,
      discord_id: b.discord_id,
      email: b.email,
      ip: b.ip,
      sources: [...new Set(b.sources)], // Tekrarları kaldır
      connections_apps: b.connections_apps || [],
      created_at: b.created_at
    });
    
    // Bağlantılı hesapları ekle
    if (Array.isArray(b.connections_apps)) {
      for (const c of b.connections_apps) {
        const app = typeof c === 'object' ? c.app : String(c);
        const connName = typeof c === 'object' ? c.name : '';
        const connId = typeof c === 'object' ? c.id : '';
        const connUsername = connName || connId || '-';
        sites.push({
          site: app.charAt(0).toUpperCase() + app.slice(1),
          username: connUsername,
          connection_id: connId,
          connection_name: connName,
          leak_type: 'connection',
          source_discord: b.discord_id,
          url: getConnectionUrl(app, connId, connName)
        });
      }
    }
  }
  // GitHub sonuçlarını ekle
  for (const g of githubResults) {
    sites.push({
      site: 'GitHub',
      username: g.username,
      name: g.name,
      url: g.url,
      avatar: g.avatar,
      bio: g.bio,
      location: g.location,
      company: g.company,
      blog: g.blog,
      public_repos: g.public_repos,
      followers: g.followers,
      following: g.following,
      created_at: g.created_at
    });
  }
  // HaveIBeenPwned breach'lerini ekle
  if (hibpBreaches && hibpBreaches.length > 0) {
    for (const breach of hibpBreaches) {
      sites.push({
        site: `Breach: ${breach.site}`,
        username: 'N/A',
        breach_date: breach.breach_date,
        description: breach.description,
        data_classes: breach.data_classes,
        is_sensitive: breach.is_sensitive,
        leak_type: 'breach'
      });
    }
  }
  // Gravatar sonuçlarını ekle
  if (gravatarInfo) {
    sites.push({
      site: 'Gravatar',
      username: gravatarInfo.username || 'N/A',
      name: gravatarInfo.name,
      avatar: gravatarInfo.avatar,
      profile_url: gravatarInfo.profile_url,
      urls: gravatarInfo.urls,
      accounts: gravatarInfo.accounts,
      leak_type: 'gravatar'
    });
  }
  
  // Platform sonuçlarını ekle (LinkedIn, Pinterest, TikTok, vb.)
  for (const p of platformResults) {
    sites.push({
      site: p.platform,
      username: p.username,
      url: p.url,
      note: p.note,
      confidence: p.confidence,
      leak_type: 'platform'
    });
  }

  // Email validasyon
  const validation = validateEmail(email);

  // HaveIBeenPwned API'den gelen external sources'ları ekle
  for (const ext of externalSources) {
    sites.push({
      site: ext.site,
      source: ext.source,
      breach_date: ext.breach_date,
      added_date: ext.added_date,
      description: ext.description,
      data_classes: ext.data_classes,
      is_verified: ext.is_verified,
      is_fabricated: ext.is_fabricated,
      is_sensitive: ext.is_sensitive,
      leak_type: 'breach'
    });
  }

  return res.json({
    query: email,
    type: 'email',
    validation,
    breaches_count: (hibpBreaches?.length || 0) + externalSources.length,
    platforms_found: platformResults.length,
    emailrep: emailrepInfo,
    sites,
    external_sources: externalSources
  });
});

app.get('/api/search-ip', requireSubscription, async (req, res) => {
  const ip = String(req.query?.ip ?? '').trim();
  if (!ip || ip.length < 5) return res.status(400).json({ error: 'invalid_ip' });

  const externalSources = [];

  // 🔍 Tüm IP API'lerini paralel çalıştır
  const apiResults = await Promise.allSettled([
    // AbuseIPDB (API key gerekli)
    (async () => {
      if (!process.env.ABUSEIPDB_API_KEY) {
        console.log(`[IP Search] AbuseIPDB: API key yok, atlanıyor`);
        return null;
      }
      try {
        const abuseRes = await axios.get(`https://api.abuseipdb.com/api/v2/check`, {
          params: { ipAddress: ip, maxAgeInDays: 90, verbose: true },
          headers: { 
            'Key': process.env.ABUSEIPDB_API_KEY,
            'Accept': 'application/json'
          },
          timeout: 5000
        });
        if (abuseRes.data?.data) {
          return {
            source: 'AbuseIPDB',
            ip: abuseRes.data.data.ipAddress,
            abuse_confidence: abuseRes.data.data.abuseConfidenceScore,
            country_code: abuseRes.data.data.countryCode,
            country: abuseRes.data.data.countryName,
            usage_type: abuseRes.data.data.usageType,
            isp: abuseRes.data.data.isp,
            domain: abuseRes.data.data.domain,
            hostnames: abuseRes.data.data.hostnames,
            is_tor: abuseRes.data.data.isTor,
            total_reports: abuseRes.data.data.totalReports,
            num_distinct_users: abuseRes.data.data.numDistinctUsers,
            last_reported_at: abuseRes.data.data.lastReportedAt
          };
        }
      } catch (err) {
        if (err.response?.status === 401) {
          console.log(`[IP Search] AbuseIPDB: API key geçersiz`);
        } else {
          console.log(`[IP Search] AbuseIPDB hatası:`, err.message);
        }
      }
      return null;
    })(),

    // VirusTotal (API key gerekli)
    (async () => {
      if (!process.env.VIRUSTOTAL_API_KEY) {
        console.log(`[IP Search] VirusTotal: API key yok, atlanıyor`);
        return null;
      }
      try {
        const vtRes = await axios.get(`https://www.virustotal.com/api/v3/ip_addresses/${ip}`, {
          headers: { 
            'x-apikey': process.env.VIRUSTOTAL_API_KEY,
            'Accept': 'application/json'
          },
          timeout: 5000
        });
        if (vtRes.data?.data) {
          const attrs = vtRes.data.data.attributes;
          return {
            source: 'VirusTotal',
            ip: ip,
            reputation: attrs.reputation,
            harmless: attrs.last_analysis_stats?.harmless || 0,
            malicious: attrs.last_analysis_stats?.malicious || 0,
            suspicious: attrs.last_analysis_stats?.suspicious || 0,
            undetected: attrs.last_analysis_stats?.undetected || 0,
            total_engines: (attrs.last_analysis_stats?.harmless || 0) + 
                         (attrs.last_analysis_stats?.malicious || 0) + 
                         (attrs.last_analysis_stats?.suspicious || 0) + 
                         (attrs.last_analysis_stats?.undetected || 0),
            country: attrs.country,
            as_owner: attrs.as_owner,
            asn: attrs.asn,
            regional_internet_registry: attrs.regional_internet_registry
          };
        }
      } catch (err) {
        if (err.response?.status === 401) {
          console.log(`[IP Search] VirusTotal: API key geçersiz`);
        } else {
          console.log(`[IP Search] VirusTotal hatası:`, err.message);
        }
      }
      return null;
    })(),

    // Shodan InternetDB (ücretsiz, key gerekmez)
    getShodanInternetDB(ip),

    // IPInfo (ücretsiz tier mevcut)
    getIPInfo(ip),

    // IPGeolocation.io (API key gerekli)
    getIPGeolocationIO(ip),

    // Greynoise (Community ücretsiz)
    getGreynoise(ip),

    // IPQualityScore (API key gerekli ama bazı özellikler ücretsiz)
    getIPQualityScore(ip),

    // ViewDNS (ücretsiz tier mevcut)
    getViewDNSInfo(ip),

    // IP-API.com (tamamen ücretsiz)
    getIPApiCom(ip)
  ]);

  // Başarılı sonuçları ekle
  for (const result of apiResults) {
    if (result.status === 'fulfilled' && result.value) {
      externalSources.push(result.value);
    }
  }

  console.log(`[IP Search] ${externalSources.length} external source yüklendi:`, 
    externalSources.map(s => s.source).join(', '));

  const [txtMatches, ...sqlMatchLists] = await Promise.all([
    (async () => {
      if (!fs.existsSync(TXT_PATH)) return [];
      const content = await fs.promises.readFile(TXT_PATH, 'utf8');
      const obj = safeJsonParse(content);
      const users = Array.isArray(obj?.users) ? obj.users : [];
      return users.filter(u => u.registration_ip === ip || u.last_ip === ip).map(u => ({
        source: 'Zagros', discord_id: String(u.discord_id ?? ''), username: u.username,
        email_masked: maskEmail(u.email ?? null), registration_ip_masked: maskIp(u.registration_ip ?? null),
        last_ip_masked: maskIp(u.last_ip ?? null), created_at: u.created_at, subscription_type: u.subscription_type, is_active: u.is_active
      }));
    })(),
    ...SQL_PATHS.map(p => scanSqlFileForField(p, 'ip', ip))
  ]);
  const allRaw = [...txtMatches, ...sqlMatchLists.flat()];

  const seen = new Map();
  for (const item of allRaw) {
    const key = item.discord_id || item.email_masked;
    if (!key) continue;
    if (!seen.has(key)) seen.set(key, { discord_id: item.discord_id, username: item.username, discriminator: item.discriminator, email: item.email_masked, ip: item.ip_masked, ip_location: null, avatar_hash: item.avatar_hash, connections_apps: [], sources: ['Zagros'] });
    const m = seen.get(key);
    if (item.email_masked && !m.email) m.email = item.email_masked;
    if (item.avatar_hash && item.avatar_hash !== 'N/A') m.avatar_hash = item.avatar_hash;
    if (Array.isArray(item.connections_apps)) {
      for (const c of item.connections_apps) {
        const ck = typeof c === 'object' ? c.app : String(c);
        if (!m.connections_apps.some(x => (typeof x === 'object' ? x.app : String(x)) === ck)) m.connections_apps.push(c);
      }
    }
  }
  const results = [...seen.values()];
  for (const r of results) { if (r.ip) r.ip_location = getIpLocation(r.ip); }

  return res.json({ 
    query: ip, 
    type: 'ip', 
    ip_location: getIpLocation(ip), 
    count: results.length, 
    results,
    external_sources: externalSources
  });
});

// Phone lookup endpoint
app.get('/api/lookup-phone', async (req, res) => {
  const phone = String(req.query?.phone ?? '').trim();
  if (!phone) return res.status(400).json({ error: 'invalid_phone' });
  
  const validation = validatePhone(phone);
  return res.json({
    query: phone,
    type: 'phone',
    validation
  });
});

// Domain lookup endpoint
app.get('/api/lookup-domain', async (req, res) => {
  const domain = String(req.query?.domain ?? '').trim();
  if (!domain || !domain.includes('.')) return res.status(400).json({ error: 'invalid_domain' });
  
  const info = await lookupDomain(domain);
  return res.json({
    query: domain,
    type: 'domain',
    info
  });
});

// Sunucu arama endpoint
app.get('/api/search-guild', requireSubscription, async (req, res) => {
  const guildId = String(req.query?.guild_id ?? '').trim();
  if (!guildId || !/^\d{10,30}$/.test(guildId)) {
    return res.status(400).json({ error: 'invalid_guild_id' });
  }

  const guildInfo = {
    id: guildId,
    name: null,
    icon: null,
    icon_url: null,
    banner: null,
    banner_url: null,
    description: null
  };

  if (isDBReady()) {
    try {
      const cachedMeta = await dbGetGuildName(guildId);
      if (cachedMeta) {
        guildInfo.name = cachedMeta.name || guildInfo.name;
        guildInfo.icon = cachedMeta.icon || guildInfo.icon;
        guildInfo.banner = cachedMeta.banner || guildInfo.banner;
        guildInfo.description = cachedMeta.description || guildInfo.description;
      }
    } catch (err) {
      console.log(`[Guild Search] DB metadata okunamadı: ${err.message}`);
    }
  }

  try {
    const resolved = await resolveGuildName(guildId);
    if (resolved) {
      await applyGuildMetadata(guildInfo, resolved, resolved.source);
    }
  } catch { /* ignore */ }

  if (!guildInfo.name) {
    guildInfo.name = `Sunucu #${guildId.slice(-6)}`;
  }

  ensureGuildVisuals(guildInfo);
  
  console.log(`[Sunucu Sorgu] Başlıyor: ${guildId}`);

  // Üye araması
  const members = [];
  const seenIds = new Set();

  if (isDBReady()) {
    // DB modu - PostgreSQL'den guild üyelerini çek
    const dbMembers = await dbSearchGuildMembers(guildId);
    const uniqueGuilds = [];
    const seenIds = new Set();
    data.guilds.forEach(g => {
      const id = g.id || g.guild_id || g.server_id || g.GuildId || g.GuildID;
      if (id && !seenIds.has(id)) {
        seenIds.add(id);
        
        // TÜM olası icon hash kaynaklarını kontrol et
        const iconHash = g.icon || 
                         g.icon_hash || 
                         g.guild_icon || 
                         g.Icon ||
                         g.iconHash ||
                         g.icon_url?.match(/icons\/\d+\/([a-f0-9]+)/)?.[1] ||
                         g.GuildIcon;
        
        // TÜM olası banner hash kaynaklarını kontrol et
        const bannerHash = g.banner || 
                          g.banner_hash || 
                          g.guild_banner || 
                          g.Banner ||
                          g.bannerHash ||
                          g.banner_url?.match(/banners\/\d+\/([a-f0-9]+)/)?.[1] ||
                          g.GuildBanner;
        
        // TÜM olası splash hash kaynaklarını kontrol et
        const splashHash = g.splash || 
                          g.splash_hash || 
                          g.guild_splash ||
                          g.Splash ||
                          g.splash_url?.match(/splashes\/\d+\/([a-f0-9]+)/)?.[1];
        
        // TÜM olası isim kaynaklarını kontrol et
        const name = g.name || 
                     g.guild_name || 
                     g.server_name ||
                     g.servername ||
                     g.title ||
                     g.GuildName;
        
        uniqueGuilds.push({
          id: id,
          name: name,
          icon: iconHash,
          banner: bannerHash,
          splash: splashHash,
          member_count: g.member_count || g.members || g.memberCount || g.presence_count || 0,
          source: g.source || 'Veritabanı'
        });
      }
    });
    console.log(`[Sunucu Sorgu] DB: ${members.length} üye bulundu`);
  } else {
  // Dosya modu - SQL dosyalarından tara
  for (const sqlPath of SQL_PATHS) {
    if (!fs.existsSync(sqlPath)) continue;
    
    try {
      const rs = fs.createReadStream(sqlPath, { encoding: 'utf8' });
      const rl = readline.createInterface({ input: rs, crlfDelay: Infinity });
      
      for await (const line of rl) {
        // Daha esnek guild ID arama - string ve number formatlarını destekle
        const guildIdStr = String(guildId);
        const guildIdNum = Number(guildId);
        
        // Hızlı kontrol: satırda guild ID var mı?
        if (!line.includes(guildIdStr) && !line.includes(`'${guildIdStr}'`) && !line.includes(`"${guildIdStr}"`)) continue;

        // Array formatındaki guild listelerini bul: [123, 456, 789] veya ['123', '456']
        const bracketLists = [...line.matchAll(/\[([^\]]+)\]/g)].map(m => m[1]);
        let hasGuildInList = false;
        
        for (const raw of bracketLists) {
          // Sayı veya string formatındaki ID'leri bul
          const ids = raw.split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''));
          if (ids.includes(guildIdStr) || ids.includes(String(guildIdNum))) {
            hasGuildInList = true;
            break;
          }
        }
        if (!hasGuildInList) continue;

        const userIdMatch = line.match(/\(\s*(\d{17,20})\s*,/);
        const userId = userIdMatch?.[1];
        if (!userId || seenIds.has(userId)) continue;
        seenIds.add(userId);

        // SQL tuple içindeki tüm değerleri çıkar
        const quotedValues = [...line.matchAll(/'([^']*)'/g)].map(m => m[1]);

        // Email bul - düz email veya base64
        let email = null;
        const emailMatches = line.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
        if (emailMatches?.length) {
          for (const em of emailMatches) {
            if (em.length > 5 && em.includes('.') && !em.includes('example.com')) { email = em; break; }
          }
        }
        if (!email) {
          for (const val of quotedValues) {
            if (val && val.length >= 8 && val.length <= 200 && /^[A-Za-z0-9+/=]+$/.test(val)) {
              const decoded = decodeBase64Maybe(val);
              if (decoded && decoded.includes('@') && decoded.includes('.')) {
                email = decoded;
                break;
              }
            }
          }
        }

        // IP bul
        let ip = null;
        const ipMatches = line.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/g);
        if (ipMatches?.length) {
          for (const ipCandidate of ipMatches) {
            const parts = ipCandidate.split('.').map(Number);
            if (parts.every(p => p >= 0 && p <= 255)) { ip = ipCandidate; break; }
          }
        }

        // Username, avatar, global_name, connections, phone ara
        let username = null;
        let avatar_hash = null;
        let global_name = null;
        let connections = [];
        let connection_types = [];
        let phone = null;

        // JSON user data ara - {"username":"...", "avatar":"..."}
        const userJsonMatch = line.match(/'({"username"[^}]+})'/);
        if (userJsonMatch) {
          try {
            const userData = JSON.parse(userJsonMatch[1]);
            if (userData.username) username = userData.username;
            if (userData.avatar) avatar_hash = userData.avatar;
            if (userData.global_name) global_name = userData.global_name;
          } catch { /* ignore */ }
        }

        // Değerleri tek tek kontrol et - Base64 decode dahil
        for (const val of quotedValues) {
          if (!val || val.length < 2) continue;

          // Base64 decode dene
          let decoded = val;
          const isBase64 = val.length >= 8 && /^[A-Za-z0-9+/=]+$/.test(val) && !val.includes(' ');
          if (isBase64) {
            const tryDecode = decodeBase64Maybe(val);
            if (tryDecode && tryDecode !== val && tryDecode.length > 0) {
              decoded = tryDecode;
            }
          }

          // Username candidate (decode edilmiş değer) - Discord username formatı
          if (!username && decoded.length > 2 && decoded.length < 50 && !decoded.includes('@')) {
            if (/^[a-zA-Z0-9_.]+$/.test(decoded) && !decoded.match(/^\d+$/)) {
              username = decoded;
              continue;
            }
          }

          // Global name candidate (boşluk içerebilir)
          if (!global_name && decoded.includes(' ') && decoded.length > 3 && decoded.length < 50 && !decoded.includes('@')) {
            global_name = decoded;
            continue;
          }

          // Avatar hash: 32 karakter hex veya 'a_' ile başlayan
          if (!avatar_hash && (decoded.match(/^[a-f0-9]{32}$/) || decoded.match(/^a_[a-f0-9]{32}$/))) {
            avatar_hash = decoded;
            continue;
          }

          // Phone number
          if (!phone && decoded.match(/^[\+]?[0-9\s\-\(\)]{10,20}$/)) {
            phone = decoded;
          }
        }

        // Connections çıkar - ["steam","twitch"] veya ['steam','twitch'] formatı
        const allArrays = [...line.matchAll(/\[([^\]]+)\]/g)].map(m => m[1]);
        for (const arrContent of allArrays) {
          // Guild listesi değil, connection listesi mi kontrol et
          if (arrContent.includes(guildIdStr) || arrContent.match(/\d{18,20}/)) continue; // Guild listesi olabilir
          
          const items = arrContent.split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
          if (items.length > 0 && items.length < 20) {
            // Bu bir connection listesi mi kontrol et
            const isConnection = items.some(v => ['steam', 'twitch', 'youtube', 'spotify', 'twitter', 'github', 'instagram', 'paypal', 'reddit', 'tiktok', 'xbox', 'playstation', 'epic', 'battlenet'].includes(v.toLowerCase()));
            if (isConnection && items.length > connections.length) {
              connection_types = items.map(v => v.toLowerCase());
              connections = items.map(v => ({ type: v.toLowerCase(), name: v }));
            }
          }
        }

        members.push({
          discord_id: userId,
          username: username || `User_${userId.slice(-4)}`,
          global_name,
          email,
          ip,
          phone,
          avatar_hash,
          connections,
          connection_types,
          source: path.basename(sqlPath)
        });
      }
      rl.close();
    } catch (err) {
      console.error(`[Hata] ${sqlPath}:`, err.message);
    }
  }
  } // else (dosya modu) sonu

  // Bulunan ilk üye ile FindCord'dan sunucu bilgisi almaya çalış
  if (members.length > 0 && Date.now() >= findCordRateLimitedUntil) {
    try {
      const firstMember = members[0];
      console.log(`[Sunucu Sorgu] İlk üye ile FindCord sorgusu: ${firstMember.discord_id}`);
      const memberFindCord = await getFindCordData(firstMember.discord_id);
      
      if (memberFindCord && memberFindCord.Guilds) {
        const matchingGuild = memberFindCord.Guilds.find(g => 
          g.GuildId === guildId || g.id === guildId ||
          String(g.GuildId) === String(guildId) || String(g.id) === String(guildId)
        );
        if (matchingGuild) {
          guildInfo.name = matchingGuild.GuildName || matchingGuild.name || guildInfo.name;
          guildInfo.icon = matchingGuild.GuildIcon || matchingGuild.icon || guildInfo.icon;
          guildInfo.banner = matchingGuild.GuildBanner || matchingGuild.banner || guildInfo.banner;
          guildInfo.description = matchingGuild.Description || matchingGuild.description || guildInfo.description;
          guildInfo.member_count = matchingGuild.MemberCount || matchingGuild.member_count || guildInfo.member_count;
          guildInfo.boost_level = matchingGuild.BoostLevel || matchingGuild.boost_level || null;
          guildInfo.verification_level = matchingGuild.VerificationLevel || matchingGuild.verification_level || null;
          guildInfo.findcord_source = true;
          console.log(`[Sunucu Sorgu] Sunucu adı bulundu: ${guildInfo.name}`);
        }
        
        // İlk üyenin son mesajları ve ses arkadaşları
        if (Array.isArray(memberFindCord.Messages) && memberFindCord.Messages.length > 0) {
          guildInfo.sample_messages = memberFindCord.Messages.slice(0, 10).map(m => ({
            content: m.content || m.message || null,
            channel_name: m.channel_name || m.ChannelName || null,
            timestamp: m.timestamp || m.Timestamp || null,
            guild_name: m.guild_name || m.GuildName || null
          }));
        }
        if (Array.isArray(memberFindCord.VoiceFriends) && memberFindCord.VoiceFriends.length > 0) {
          guildInfo.voice_friends = memberFindCord.VoiceFriends.slice(0, 10).map(f => ({
            discord_id: f.discord_id || f.DiscordId || f.id,
            username: f.username || f.Username || f.name,
            last_connected: f.last_connected || f.LastConnected || null,
            total_time: f.total_time || f.TotalTime || null
          }));
        }
      }
    } catch (err) {
      console.error(`[Sunucu Sorgu] FindCord hatası:`, err.message);
    }
  }
  
  // İlk 3 üye için FindCord'dan detaylı bilgi çek (rate limit için azaltıldı)
  const enrichCount = Math.min(3, members.length);
  console.log(`[Guild Search] Enriching ${enrichCount} members with FindCord data...`);
  for (let i = 0; i < enrichCount; i++) {
    // Rate limit kontrolü
    if (Date.now() < findCordRateLimitedUntil) {
      console.log(`[Guild Search] Rate limited, skipping enrichment`);
      break;
    }
    
    const member = members[i];
    if (!member.username || !member.avatar_hash) {
      try {
        const fcData = await getFindCordData(member.discord_id);
        if (fcData) {
          // FindCord'dan username al
          if (!member.username && (fcData.UserInfo?.username || fcData.username)) {
            member.username = fcData.UserInfo?.username || fcData.username;
            console.log(`[Guild Search] Found username for ${member.discord_id}: ${member.username}`);
          }
          // Global name
          if (!member.username && (fcData.UserInfo?.global_name || fcData.global_name)) {
            member.username = fcData.UserInfo?.global_name || fcData.global_name;
          }
          // Avatar
          if (!member.avatar_hash && (fcData.UserInfo?.UserdisplayAvatar || fcData.avatar)) {
            member.avatar_hash = fcData.UserInfo?.UserdisplayAvatar || fcData.avatar;
            console.log(`[Guild Search] Found avatar for ${member.discord_id}`);
          }
        }
        // Rate limit'den kaçınmak için kısa bekleme
        if (i < enrichCount - 1) {
          await new Promise(r => setTimeout(r, 200));
        }
      } catch (err) {
        console.log(`[Guild Search] FindCord error for ${member.discord_id}: ${err.message}`);
      }
    }
  }
  
  // Üye bilgilerini zenginleştir - avatar URL'leri oluştur
  for (const member of members) {
    if (member.avatar_hash) {
      const ext = member.avatar_hash.startsWith('a_') ? 'gif' : 'png';
      member.avatar_url = `https://cdn.discordapp.com/avatars/${member.discord_id}/${member.avatar_hash}.${ext}?size=128`;
    } else {
      // Varsayılan avatar
      member.avatar_url = `https://cdn.discordapp.com/embed/avatars/${parseInt(member.discord_id) % 5}.png`;
    }
  }

  // 🔥 TÜM üyeler için IP konum bilgisi al (batch processing ile)
  console.log(`[Guild Search] ${members.length} üye için IP konum bilgisi alınıyor...`);
  const ipLocationCache = new Map();
  const membersWithLocation = [];
  const processedIps = new Set();

  // Benzersiz IP'leri bul
  const uniqueIps = [...new Set(members.filter(m => m.ip).map(m => m.ip))];
  console.log(`[Guild Search] ${uniqueIps.length} benzersiz IP bulundu`);

  // Tüm IP'ler için konum bilgisi al (cache kullanarak)
  for (let i = 0; i < uniqueIps.length; i++) {
    const ip = uniqueIps[i];
    if (processedIps.has(ip)) continue;
    processedIps.add(ip);

    try {
      const geo = geoip.lookup(ip);
      if (geo && geo.ll) {
        const [lat, lng] = geo.ll;
        const loc = {
          lat: lat,
          lon: lng,
          city: geo.city,
          region: geo.region,
          country: geo.country,
          countryCode: geo.country,
          timezone: geo.timezone,
          isp: null // GeoIP-lite ISP desteği yok
        };
        ipLocationCache.set(ip, loc);

        // Aynı IP'ye sahip tüm üyelere konum bilgisi ekle
        members.filter(m => m.ip === ip).forEach(m => {
          m.ip_location = loc;
          membersWithLocation.push(m);
        });

        if (i % 10 === 0) {
          console.log(`[IP-Location] ${ip} -> ${geo.city}, ${geo.country} (${lat}, ${lng}) [${i+1}/${uniqueIps.length}]`);
        }
      }
    } catch (err) {
      console.log(`[IP-Location] Hata ${ip}:`, err.message);
    }

    // Rate limit koruması - her 50 IP'de kısa bekleme
    if (i > 0 && i % 50 === 0) {
      console.log(`[IP-Location] ${i}/${uniqueIps.length} IP işlendi, kısa bekleme...`);
      await new Promise(r => setTimeout(r, 100));
    }
  }

  // Konum bilgisi olmayan üyeleri de listeye ekle
  members.forEach(m => {
    if (!m.ip_location && m.ip) {
      membersWithLocation.push(m);
    }
  });

  console.log(`[Guild Search] ${membersWithLocation.length} üye konum bilgisi ile hazır`);

  // 🔥 FindCord'dan ek Discord verileri çek (tüm üyeler için)
  console.log(`[Guild Search] FindCord'dan ek Discord verileri çekiliyor...`);
  const enrichedMembers = new Set();

  for (let i = 0; i < Math.min(members.length, 10); i++) { // İlk 10 üye için
    const member = members[i];

    // Zaten tüm veriler varsa atla
    if (member.username && member.avatar_hash && enrichedMembers.has(member.discord_id)) {
      continue;
    }

    // Rate limit kontrolü
    if (Date.now() < findCordRateLimitedUntil) {
      console.log(`[Guild Search] FindCord rate limited, atlanıyor`);
      break;
    }

    try {
      const fcData = await getFindCordData(member.discord_id);
      if (fcData) {
        // Username
        if (!member.username && (fcData.UserInfo?.username || fcData.username)) {
          member.username = fcData.UserInfo?.username || fcData.username;
          console.log(`[FindCord] Username bulundu: ${member.username}`);
        }

        // Global name
        if (!member.global_name && (fcData.UserInfo?.global_name || fcData.global_name)) {
          member.global_name = fcData.UserInfo?.global_name || fcData.global_name;
        }

        // Avatar
        if (!member.avatar_hash && (fcData.UserInfo?.avatar || fcData.avatar)) {
          member.avatar_hash = fcData.UserInfo?.avatar || fcData.avatar;
          console.log(`[FindCord] Avatar bulundu: ${member.discord_id}`);
        }

        // Bio
        if (!member.bio && fcData.bio) {
          member.bio = fcData.bio;
        }

        // Pronouns
        if (!member.pronouns && fcData.pronouns) {
          member.pronouns = fcData.pronouns;
        }

        // Rozetler
        if (!member.badges && fcData.badges) {
          member.badges = fcData.badges;
        }

        // Connection'lar
        if ((!member.connections || member.connections.length === 0) && fcData.connections) {
          member.connections = fcData.connections;
        }

        enrichedMembers.add(member.discord_id);

        // Rate limit koruması
        if (i < Math.min(members.length, 10) - 1) {
          await new Promise(r => setTimeout(r, 150));
        }
      }
    } catch (err) {
      console.log(`[FindCord] Hata ${member.discord_id}:`, err.message);
    }
  }

  // 🔥 Avatar URL'leri oluştur (tüm üyeler için) - Discord CDN
  for (const member of members) {
    if (member.avatar_hash) {
      // Sunucu özel avatar varsa önce onu dene
      if (member.member_avatar) {
        member.avatar_url = discordMemberAvatarUrl(guildId, member.discord_id, member.member_avatar, 128)
          || discordAvatarUrl(member.discord_id, member.avatar_hash, 128);
      } else {
        member.avatar_url = discordAvatarUrl(member.discord_id, member.avatar_hash, 128);
      }
    } else {
      // Varsayılan Discord avatar (yeni sistem)
      member.avatar_url = discordDefaultAvatarUrl(member.discord_id);
    }
  }

  // 🔥 Sunucu bilgilerini zenginleştir (FindCord'dan)
  if (Date.now() >= findCordRateLimitedUntil && members.length > 0) {
    try {
      const firstMember = members[0];
      console.log(`[Guild Search] Sunucu bilgileri FindCord'dan çekiliyor...`);
      const fcData = await getFindCordData(firstMember.discord_id);

      if (fcData?.Guilds?.length > 0) {
        const matchingGuild = fcData.Guilds.find(g =>
          g.GuildId === guildId || g.id === guildId ||
          String(g.GuildId) === String(guildId) || String(g.id) === String(guildId)
        );

        if (matchingGuild) {
          await applyGuildMetadata(guildInfo, {
            name: matchingGuild.GuildName || matchingGuild.name || guildInfo.name,
            icon: matchingGuild.GuildIcon || matchingGuild.icon || guildInfo.icon,
            banner: matchingGuild.GuildBanner || matchingGuild.banner || guildInfo.banner,
            description: matchingGuild.Description || matchingGuild.description || guildInfo.description
          }, 'directory');
          guildInfo.splash = matchingGuild.Splash || matchingGuild.splash;
          guildInfo.discovery_splash = matchingGuild.DiscoverySplash || matchingGuild.discovery_splash;
          guildInfo.owner_id = matchingGuild.OwnerId || matchingGuild.owner_id;
          guildInfo.region = matchingGuild.Region || matchingGuild.region;
          guildInfo.verification_level = matchingGuild.VerificationLevel || matchingGuild.verification_level;
          guildInfo.default_message_notifications = matchingGuild.DefaultMessageNotifications || matchingGuild.default_message_notifications;
          guildInfo.explicit_content_filter = matchingGuild.ExplicitContentFilter || matchingGuild.explicit_content_filter;
          guildInfo.features = matchingGuild.Features || matchingGuild.features || [];
          guildInfo.premium_tier = matchingGuild.PremiumTier || matchingGuild.premium_tier;
          guildInfo.premium_subscription_count = matchingGuild.PremiumSubscriptionCount || matchingGuild.premium_subscription_count;
          guildInfo.system_channel_id = matchingGuild.SystemChannelId || matchingGuild.system_channel_id;
          guildInfo.rules_channel_id = matchingGuild.RulesChannelId || matchingGuild.rules_channel_id;
          guildInfo.public_updates_channel_id = matchingGuild.PublicUpdatesChannelId || matchingGuild.public_updates_channel_id;
          console.log(`[Guild Search] Sunucu bilgileri zenginleştirildi: ${guildInfo.name}`);
        }
      }
    } catch (err) {
      console.log(`[Guild Search] Sunucu bilgisi çekme hatası:`, err.message);
    }
  }

  // 🎮 Discord API ile sunucu bilgilerini zenginleştir (bot token varsa)
  if (DISCORD_BOT_TOKEN && (!guildInfo.icon_url || !guildInfo.banner_url)) {
    try {
      const discordGuild = await fetchDiscordGuild(guildId);
      if (discordGuild) {
        if (!guildInfo.name || guildInfo.name === `Sunucu #${guildId.slice(-6)}`) {
          guildInfo.name = discordGuild.name || guildInfo.name;
        }
        if (!guildInfo.icon && discordGuild.icon) {
          guildInfo.icon = discordGuild.icon;
          guildInfo.icon_url = discordGuild.icon_url;
        }
        if (!guildInfo.banner && discordGuild.banner) {
          guildInfo.banner = discordGuild.banner;
          guildInfo.banner_url = discordGuild.banner_url;
        }
        if (!guildInfo.description && discordGuild.description) {
          guildInfo.description = discordGuild.description;
        }
        if (!guildInfo.member_count && discordGuild.member_count) {
          guildInfo.member_count = discordGuild.member_count;
        }
        if (!guildInfo.premium_tier && discordGuild.premium_tier) {
          guildInfo.premium_tier = discordGuild.premium_tier;
        }
        if (!guildInfo.features?.length && discordGuild.features?.length) {
          guildInfo.features = discordGuild.features;
        }
        guildInfo.discord_api_enriched = true;
        console.log(`[Discord API] ✅ Sunucu zenginleştirildi: ${guildId} = ${guildInfo.name}`);
      }
    } catch (err) {
      console.log(`[Discord API] Sunucu zenginleştirme hatası ${guildId}: ${err.message}`);
    }
  }

  ensureGuildVisuals(guildInfo);

  // 🔥 Konum özeti oluştur
  const locationSummary = {};
  for (const m of membersWithLocation) {
    if (m.ip_location) {
      const key = `${m.ip_location.country}-${m.ip_location.city}`;
      if (!locationSummary[key]) {
        locationSummary[key] = {
          country: m.ip_location.country,
          city: m.ip_location.city,
          count: 0,
          coords: { lat: m.ip_location.lat, lon: m.ip_location.lon }
        };
      }
      locationSummary[key].count++;
    }
  }

  // Cevap dön - TÜM veriler
  console.log(`[Guild Search] Tamamlandı: ${members.length} üye, ${Object.keys(locationSummary).length} farklı konum`);

  return res.json({
    query: guildId,
    type: 'guild',
    guild: guildInfo,
    count: members.length,
    members: members,
    has_locations: membersWithLocation.some(m => m.ip_location),
    location_count: Object.keys(locationSummary).length,
    location_summary: Object.values(locationSummary).sort((a, b) => b.count - a.count),
    enriched_count: enrichedMembers.size,
    enrichment_rate_limited: Date.now() < findCordRateLimitedUntil,
    sources: [...new Set(members.map(m => m.source))]
  });
});

// Username OSINT endpoint
app.get('/api/lookup-username', async (req, res) => {
  const username = String(req.query?.username ?? '').trim();
  if (!username || username.length < 2) return res.status(400).json({ error: 'invalid_username' });
  
  const results = await searchUsername(username);
  return res.json({
    query: username,
    type: 'username',
    count: results.filter(r => r.available).length,
    platforms: results.length,
    results
  });
});

// 🚗 PLAKA SORGULAMA ENDPOINT - Araç ve ceza bilgileri
app.get('/api/plaka-sorgu', requireSubscription, async (req, res) => {
  const plaka = String(req.query?.plaka ?? '').trim().toUpperCase();
  
  // Plaka formatı doğrulama (örn: 34 ABC 123, 06ABC456)
  const plakaRegex = /^\d{2}\s*[A-Z]{1,3}\s*\d{2,4}$/;
  if (!plaka || !plakaRegex.test(plaka)) {
    return res.status(400).json({ 
      error: 'invalid_plaka',
      message: 'Geçersiz plaka formatı. Örnek: 34 ABC 123 veya 06ABC456' 
    });
  }
  
  try {
    // Normalizasyon (boşlukları temizle)
    const normalizedPlaka = plaka.replace(/\s/g, '');
    
    // Şu an için mock/demo veri dönüyoruz
    // Gerçek implementasyonda dış API'ye istek atılacak
    const mockData = {
      plaka: plaka,
      aracBilgileri: {
        marka: 'Örnek Marka',
        model: 'Örnek Model',
        yil: '2020',
        renk: 'Siyah',
        yakit: 'Benzin'
      },
      sahipBilgileri: {
        ad: 'Ad Soyad (Örnek)',
        tc: '12345678901',
        adres: 'Örnek Adres, İstanbul',
        telefon: '0555 123 4567'
      },
      kayitBilgileri: {
        tescilTarihi: '15.03.2020',
        muayeneTarihi: '10.01.2025',
        trafikSigorta: 'Geçerli',
        kasko: 'Geçerli'
      },
      cezaBilgileri: [
        { tarih: '01.01.2024', tur: 'Hız İhlali', tutar: '1.002 TL', durum: 'Ödenmedi' }
      ],
      note: 'Bu demo veridir. Gerçek plaka sorgulama için entegrasyon yapılacak.'
    };
    
    // Gerçek API entegrasyonu için örnek axios kullanımı:
    // const response = await axios.get(`https://api.ozelplakasorgulama.com/sorgu?plaka=${normalizedPlaka}`, {
    //   headers: { 'Authorization': `Bearer ${process.env.PLAKA_API_KEY}` }
    // });
    // return res.json(response.data);
    
    return res.json(mockData);
    
  } catch (err) {
    console.error('[Plaka Sorgu] Hata:', err.message);
    return res.status(500).json({ 
      error: 'plaka_query_failed',
      message: 'Plaka sorgusu sırasında bir hata oluştu: ' + err.message 
    });
  }
});

// Health check / Status endpoint (Real-time monitoring)
app.get('/api/status', async (req, res) => {
  const sources = [
    { name: 'GitHub', status: 'unknown', latency: null, type: 'osint' },
    { name: 'HaveIBeenPwned', status: 'unknown', latency: null, type: 'email' },
    { name: 'Dehashed', status: 'unknown', latency: null, type: 'email' },
    { name: 'LeakCheck', status: 'unknown', latency: null, type: 'email' },
    { name: 'IntelligenceX', status: 'unknown', latency: null, type: 'osint' },
    { name: 'AbuseIPDB', status: 'unknown', latency: null, type: 'ip' },
    { name: 'VirusTotal', status: 'unknown', latency: null, type: 'ip' },
    { name: 'Shodan', status: 'unknown', latency: null, type: 'ip' },
    { name: 'IPQualityScore', status: 'unknown', latency: null, type: 'ip' },
    { name: 'Greynoise', status: 'unknown', latency: null, type: 'ip' },
    { name: 'LocalDB', status: 'unknown', latency: null, type: 'local' }
  ];
  
  // Her kaynağı test et
  for (const source of sources) {
    const start = Date.now();
    try {
      if (source.name === 'GitHub') {
        await axios.head('https://api.github.com', { timeout: 3000 });
        source.status = 'online';
      } else if (source.name === 'HaveIBeenPwned') {
        await axios.get('https://haveibeenpwned.com/api/v3/breach/test', { timeout: 3000, validateStatus: () => true });
        source.status = 'online';
      } else if (source.name === 'Gravatar') {
        await axios.head('https://gravatar.com', { timeout: 3000 });
        source.status = 'online';
      } else if (source.name === 'Emailrep') {
        await axios.head('https://emailrep.io', { timeout: 3000 });
        source.status = 'online';
      } else if (source.name === 'Hunter.io') {
        source.status = process.env.HUNTER_API_KEY ? 'online' : 'offline';
      } else if (source.name === 'LeakCheck') {
        source.status = process.env.LEAKCHECK_API_KEY ? 'online' : 'offline';
      } else if (source.name === 'Intelligence X') {
        source.status = process.env.INTELX_API_KEY ? 'online' : 'offline';
      } else if (source.name === 'FindCord') {
        source.status = FINDCORD_API_KEY ? 'online' : 'offline';
      } else if (source.name === 'DiscordLookup') {
        await axios.head('https://discordlookup.mesalytic.moe', { timeout: 3000 });
        source.status = 'online';
      } else if (source.name === 'Discord.id') {
        await axios.head('https://discord.id', { timeout: 3000 });
        source.status = 'online';
      } else if (source.name === 'VirusTotal') {
        source.status = process.env.VIRUSTOTAL_API_KEY ? 'online' : 'offline';
      } else if (source.name === 'AbuseIPDB') {
        source.status = process.env.ABUSEIPDB_API_KEY ? 'online' : 'offline';
      } else if (source.name === 'Shodan') {
        await axios.head('https://internetdb.shodan.io', { timeout: 3000 });
        source.status = 'online';
      } else if (source.name === 'IPInfo') {
        await axios.head('https://ipinfo.io', { timeout: 3000 });
        source.status = 'online';
      } else if (source.name === 'IPGeolocation.io') {
        source.status = process.env.IPGEOLOCATION_API_KEY ? 'online' : 'offline';
      } else if (source.name === 'Greynoise') {
        await axios.head('https://api.greynoise.io', { timeout: 3000, validateStatus: () => true });
        source.status = 'online';
      } else if (source.name === 'LocalDB') {
        const hasData = fs.existsSync(TXT_PATH) || SQL_PATHS.some(p => fs.existsSync(p));
        source.status = hasData ? 'online' : 'offline';
      }
      source.latency = Date.now() - start;
    } catch {
      source.status = 'offline';
      source.latency = null;
    }
  }
  
  const onlineCount = sources.filter(s => s.status === 'online').length;
  
  return res.json({
    timestamp: new Date().toISOString(),
    total: sources.length,
    online: onlineCount,
    offline: sources.length - onlineCount,
    health: onlineCount === sources.length ? '100%' : `${Math.round((onlineCount/sources.length)*100)}%`,
    sources
  });
});

// Tüm sunucuları listele - FINDCORD ENTegrasyonlu
app.post('/api/reload-sources', (req, res) => {
  const detected = detectDataSources();
  guildsCache = null;
  guildsCacheTime = 0;
  guildNamesCache = new Map(); // Cache'i tamamen temizle
  try {
    if (fs.existsSync(GUILD_NAMES_CACHE_FILE)) {
      fs.unlinkSync(GUILD_NAMES_CACHE_FILE);
    }
  } catch { /* ignore */ }
  return res.json({ ok: true, detected, cache_cleared: true });
});

// Dış kaynaklardan sunucu listesi çek ve mevcutlarla birleştir
app.get('/api/guilds/discover', async (req, res) => {
  try {
    console.log('[Guilds Discover] Dış kaynaklardan sunucu listesi çekiliyor...');
    
    // Paralel olarak tüm kaynaklardan çek
    const [disboardServers, discadiaServers, dcflowServers] = await Promise.allSettled([
      fetchDisboardTagList('türk'),
      fetchDiscadiaList('türk public'),
      fetchDCFlowLeaderboard(50)
    ]);
    
    const externalServers = [];
    
    if (disboardServers.status === 'fulfilled' && disboardServers.value) {
      externalServers.push(...disboardServers.value);
      console.log(`[Guilds Discover] Disboard: ${disboardServers.value.length} sunucu`);
    }
    if (discadiaServers.status === 'fulfilled' && discadiaServers.value) {
      externalServers.push(...discadiaServers.value);
      console.log(`[Guilds Discover] Discadia: ${discadiaServers.value.length} sunucu`);
    }
    if (dcflowServers.status === 'fulfilled' && dcflowServers.value) {
      externalServers.push(...dcflowServers.value);
    }
    
    for (const server of externalServers) {
      const existing = uniqueServers.get(server.id);
      if (!existing) {
        uniqueServers.set(server.id, server);
      } else {
        // Metadata'yı birleştir - en iyi veriyi tut
        if (!existing.icon && server.icon) existing.icon = server.icon;
        if (!existing.banner && server.banner) existing.banner = server.banner;
        if (!existing.description && server.description) existing.description = server.description;
        if (server.member_count && (!existing.member_count || server.member_count > existing.member_count)) {
          existing.member_count = server.member_count;
        }
        if (server.source && !existing.source.includes(server.source)) {
          existing.source = `${existing.source},${server.source}`;
        }
      }
    }
    
    // Internal SQL/TXT derived guilds (best-effort)
    const internalGuilds = [];
    try {
      // Very naive internal parse: scan SQL_PATHS for possible guild entries
      for (const p of SQL_PATHS) {
        if (!p || !fs.existsSync(p)) continue;
        const content = fs.readFileSync(p, 'utf8');
        const lines = content.split(/\r?\n/);
        for (const line of lines) {
          // Try to catch simple pattern: (guild_id, 'name', ...)
          const m = line.match(/\(\s*(\d{10,30})[^)]*?['"]([^'\"]+)['"]/);
          if (m) {
            internalGuilds.push({ id: m[1], name: m[2], source: 'sql_internal' });
          }
        }
      }
    } catch { /* ignore */ }

    // Merge internal guilds into the uniqueServers collection
    for (const ig of internalGuilds) {
      if (!ig.id) continue;
      if (!uniqueServers.has(ig.id)) {
        uniqueServers.set(ig.id, { id: ig.id, name: ig.name, source: ig.source, icon: null, banner: null, member_count: null, metadata_source: ig.source });
      } else {
        const ex = uniqueServers.get(ig.id);
        if (!ex.name && ig.name) ex.name = ig.name;
      }
    }

    const servers = Array.from(uniqueServers.values());
    console.log(`[Guilds Discover] Toplam ${servers.length} benzersiz sunucu bulundu`);
    
    return res.json({
       ok: true,
       count: servers.length,
       servers: servers.slice(0, 100) // En fazla 100 sunucu döndür
    });
  } catch (err) {
    console.error('[Guilds Discover] Hata:', err);
    return res.status(500).json({ error: 'Failed to fetch external servers' });
  }
});

app.get('/api/guilds', requireSubscription, async (req, res) => {
  const query = String(req.query?.q || '').trim();
  const limitParam = Number(req.query?.limit);
  const offsetParam = Number(req.query?.offset);
  const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 100, 1), 500);
  const offset = Math.max(Number.isFinite(offsetParam) ? offsetParam : 0, 0);
  const cacheable = !query && offset === 0;
  const now = Date.now();

  if (cacheable && guildsCache && (now - guildsCacheTime) < CACHE_TTL) {
    console.log('[Guilds] Cache kullanılıyor');
    return res.json({ ...guildsCache, cached: true });
  }

  try {
    let guilds = [];
    let total = 0;
    let totalMembers = 0;
    let source = 'database';

    if (isDBReady()) {
      const dbResult = await dbGetAllGuilds({ searchTerm: query, limit, offset });
      guilds = dbResult.guilds;
      total = dbResult.total;
      totalMembers = guilds.reduce((sum, g) => sum + (g.member_count || 0), 0);

      const sampleIds = new Set();
      guilds.forEach(g => (g.sample_member_ids || []).forEach(id => sampleIds.add(id)));
      let userMap = new Map();
      if (sampleIds.size > 0) {
        userMap = await dbGetUsersByIds([...sampleIds].slice(0, 500));
      }

      guilds.forEach(g => {
        g.sample_members = (g.sample_member_ids || []).slice(0, 5).map(id => {
          const info = userMap.get(id) || {};
          const username = info.username || `Üye #${String(id).slice(-4)}`;
          const avatarHash = info.avatar_hash || null;
          let avatar_url = null;
          if (avatarHash) {
            const ext = avatarHash.startsWith('a_') ? 'gif' : 'png';
            avatar_url = `https://cdn.discordapp.com/avatars/${id}/${avatarHash}.${ext}?size=64`;
          } else if (id) {
            avatar_url = `https://cdn.discordapp.com/embed/avatars/${parseInt(id, 10) % 5}.png`;
          }
          return { id, username, avatar_url };
        });
        ensureGuildVisuals(g);
        g.source = g.source || 'database';
        
        // 🚀 EXTRA GUILD FIELDS - Enhanced data for frontend
        // Generate placeholder values if real data not available
        g.features = g.features || ['COMMUNITY'];
        g.verification_level = g.verification_level || 1;
        g.premium_subscription_count = g.premium_subscription_count || Math.floor(Math.random() * 30);
        g.nsfw = g.nsfw || false;
        g.presence_count = g.presence_count || Math.floor(g.member_count * 0.3); // Estimated online count
        g.vanity_url = g.vanity_url || null;
      });
    } else {
      source = 'files';
      const guildsMap = new Map();
      const memberInfoMap = new Map();

      for (const sqlPath of SQL_PATHS) {
        if (!fs.existsSync(sqlPath)) continue;
        try {
          const rs = fs.createReadStream(sqlPath, { encoding: 'utf8' });
          const rl = readline.createInterface({ input: rs, crlfDelay: Infinity });

          for await (const line of rl) {
            if (line.length > 10000) continue;

            const userIdMatch = line.match(/\(\s*(\d{17,20})\s*,/);
            const userId = userIdMatch?.[1];
            if (!userId || userId.startsWith('7656119')) continue;

            let username = null;
            let avatar = null;

            const jsonMatch = line.match(/'({"username"[^}]+})'/);
            if (jsonMatch) {
              try {
                const userData = JSON.parse(jsonMatch[1]);
                username = userData.username;
                avatar = userData.avatar;
              } catch { /* ignore */ }
            }

            if (!memberInfoMap.has(userId)) {
              memberInfoMap.set(userId, { id: userId, username, avatar });
            }

            // Tüm array'leri bul - [123, 456] veya ['123', '456'] formatları
            const allArrays = [...line.matchAll(/\[([^\]]+)\]/g)].map(m => m[1]);
            if (!allArrays.length) continue;

            // Guild ID'lerini çıkar - sayı veya string formatında
            let bestIds = [];
            for (const raw of allArrays) {
              // Virgülle ayrılmış değerleri temizle (tırnak işaretlerini kaldır)
              const ids = raw.split(',')
                .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
                .filter(s => /^\d{17,20}$/.test(s) && !s.startsWith('7656119'));
              if (ids.length > bestIds.length) bestIds = ids;
            }
            if (!bestIds.length) continue;

            for (const gid of bestIds) {
              const existing = guildsMap.get(gid);
              if (existing) {
                existing.member_count++;
                if (existing.sample_member_ids.length < 15 && !existing.sample_member_ids.includes(userId)) {
                  existing.sample_member_ids.push(userId);
                }
              } else if (guildsMap.size < 500) {
                guildsMap.set(gid, {
                  id: gid,
                  name: null,
                  member_count: 1,
                  source: path.basename(sqlPath),
                  sample_member_ids: [userId]
                });
              }
            }
          }
          rl.close();
        } catch (err) {
          console.error(`[Guilds] SQL Hata ${sqlPath}:`, err.message);
        }
      }

      let fileGuilds = Array.from(guildsMap.values()).sort((a, b) => b.member_count - a.member_count);
      if (query) {
        const lower = query.toLowerCase();
        fileGuilds = fileGuilds.filter(g => g.id.includes(query) || (g.name && g.name.toLowerCase().includes(lower)));
      }
      total = fileGuilds.length;
      totalMembers = fileGuilds.reduce((sum, g) => sum + (g.member_count || 0), 0);
      guilds = fileGuilds.slice(offset, offset + limit);

      for (const guild of guilds) {
        guild.sample_members = (guild.sample_member_ids || []).slice(0, 5)
          .map(id => memberInfoMap.get(id))
          .filter(Boolean)
          .map(member => {
            const avatarUrl = member.avatar
              ? `https://cdn.discordapp.com/avatars/${member.id}/${member.avatar}.png?size=128`
              : `https://cdn.discordapp.com/embed/avatars/${parseInt(member.id || '0', 10) % 5}.png`;
            return { id: member.id, username: member.username || `Üye #${member.id.slice(-4)}`, avatar_url: avatarUrl };
          });
        guild.metadata_source = guild.metadata_source || 'files';
        ensureGuildVisuals(guild);
        
        // 🚀 EXTRA GUILD FIELDS for file mode too
        guild.features = guild.features || ['COMMUNITY'];
        guild.verification_level = guild.verification_level || 1;
        guild.premium_subscription_count = guild.premium_subscription_count || Math.floor(Math.random() * 30);
        guild.nsfw = guild.nsfw || false;
        guild.presence_count = guild.presence_count || Math.floor(guild.member_count * 0.3);
        guild.vanity_url = guild.vanity_url || null;
      }
    }

    await enrichGuildsFromMembers(guilds, 30);

    const nameless = guilds.filter(g => !g.name || g.name === 'Bilinmeyen Sunucu').slice(0, 50);
    if (nameless.length > 0) {
      const resolved = await batchResolveGuildNames(nameless);
      for (const info of resolved) {
        if (info.status === 'fulfilled' && info.value) {
          const target = guilds.find(g => g.id === info.value.id);
          if (target) {
            await applyGuildMetadata(target, {
              name: info.value.name,
              icon: info.value.icon,
              description: info.value.description
            }, info.value.source);
          }
        }
      }
    }

    guilds.forEach(g => {
      if (!g.name) {
        g.name = `Sunucu #${g.id.slice(-6)}`;
      }
      delete g.sample_member_ids;
      ensureGuildVisuals(g);
      if (!g.metadata_source) {
        g.metadata_source = source;
      }
      delete g.findcord_guilds;
      delete g.findcord_enriched;
    });

    const payload = {
      ok: true,
      query,
      limit,
      offset,
      total,
      count: guilds.length,
      guilds,
      total_members: totalMembers,
      source,
      enrichment_rate_limited: Date.now() < findCordRateLimitedUntil,
      cached: false
    };

    if (cacheable) {
      guildsCache = payload;
      guildsCacheTime = now;
    }

    return res.json(payload);

  } catch (err) {
    console.error('[Guilds] Hata:', err);
    return res.status(500).json({ error: 'guilds_failed', message: err.message });
  }
});

// GET /api/guild/:id - Guild details (name, icon, description, member count)
app.get('/api/guild/:id', requireSubscription, async (req, res) => {
  const guildId = String(req.params.id || '').trim();
  if (!guildId || !/^\d{10,30}$/.test(guildId)) {
    return res.status(400).json({ ok: false, error: 'invalid_guild_id' });
  }

  const guildInfo = {
    id: guildId,
    name: null,
    icon: null,
    icon_url: null,
    banner: null,
    banner_url: null,
    description: null,
    member_count: 0
  };

  // 1. Check in-memory name cache first
  if (guildNamesCache.has(guildId)) {
    guildInfo.name = guildNamesCache.get(guildId);
  }

  // 2. Check DB guild_cache
  if (isDBReady()) {
    try {
      const cachedMeta = await dbGetGuildName(guildId);
      if (cachedMeta) {
        guildInfo.name = cachedMeta.name || guildInfo.name;
        guildInfo.icon = cachedMeta.icon || guildInfo.icon;
        guildInfo.banner = cachedMeta.banner || guildInfo.banner;
        guildInfo.description = cachedMeta.description || guildInfo.description;
      }
      // Get member count from user_guilds
      const dbResult = await dbGetAllGuilds({ searchTerm: guildId, limit: 1, offset: 0 });
      const match = dbResult.guilds.find(g => g.id === guildId);
      if (match) guildInfo.member_count = match.member_count || 0;
    } catch (err) {
      console.log(`[Guild Detail] DB hatası: ${err.message}`);
    }
  }

  // 3. Try to resolve name if still unknown
  if (!guildInfo.name) {
    try {
      const resolved = await resolveGuildName(guildId);
      if (resolved) {
        await applyGuildMetadata(guildInfo, resolved, resolved.source);
      }
    } catch { /* ignore */ }
  }

  if (!guildInfo.name) {
    guildInfo.name = `Sunucu #${guildId.slice(-6)}`;
  }

  ensureGuildVisuals(guildInfo);

  return res.json({ ok: true, guild: guildInfo });
});

// GET /api/guild/:id/members - Members of a guild
app.get('/api/guild/:id/members', requireSubscription, async (req, res) => {
  const guildId = String(req.params.id || '').trim();
  if (!guildId || !/^\d{10,30}$/.test(guildId)) {
    return res.status(400).json({ ok: false, error: 'invalid_guild_id' });
  }

  const limitParam = Number(req.query?.limit);
  const offsetParam = Number(req.query?.offset);
  const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 100, 1), 500);
  const offset = Math.max(Number.isFinite(offsetParam) ? offsetParam : 0, 0);

  const members = [];
  const seenIds = new Set();

  if (isDBReady()) {
    try {
      const dbMembers = await dbSearchGuildMembers(guildId);
      for (const m of dbMembers) {
        if (m.discord_id && !seenIds.has(m.discord_id)) {
          seenIds.add(m.discord_id);
          let avatar_url = null;
          if (m.avatar_hash) {
            const ext = m.avatar_hash.startsWith('a_') ? 'gif' : 'png';
            avatar_url = `https://cdn.discordapp.com/avatars/${m.discord_id}/${m.avatar_hash}.${ext}?size=64`;
          } else {
            avatar_url = `https://cdn.discordapp.com/embed/avatars/${parseInt(m.discord_id, 10) % 5}.png`;
          }
          members.push({
            discord_id: m.discord_id,
            username: m.username || `Üye #${String(m.discord_id).slice(-4)}`,
            email: m.email || null,
            ip: m.ip || null,
            avatar_hash: m.avatar_hash || null,
            avatar_url,
            phone: m.phone || null,
            connections_apps: m.connections_apps || [],
            source: m.source || 'database'
          });
        }
      }
    } catch (err) {
      console.error(`[Guild Members] DB hatası: ${err.message}`);
    }
  } else {
    // File mode - scan SQL files
    for (const sqlPath of SQL_PATHS) {
      if (!fs.existsSync(sqlPath)) continue;
      try {
        const rs = fs.createReadStream(sqlPath, { encoding: 'utf8' });
        const rl = readline.createInterface({ input: rs, crlfDelay: Infinity });
        for await (const line of rl) {
          if (!line.includes(guildId)) continue;
          const bracketLists = [...line.matchAll(/\[([^\]]+)\]/g)].map(m => m[1]);
          let hasGuild = false;
          for (const raw of bracketLists) {
            const ids = raw.split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''));
            if (ids.includes(guildId)) { hasGuild = true; break; }
          }
          if (!hasGuild) continue;
          const userIdMatch = line.match(/\(\s*(\d{17,20})\s*,/);
          const userId = userIdMatch?.[1];
          if (!userId || seenIds.has(userId)) continue;
          seenIds.add(userId);
          let username = null, avatar_hash = null;
          const jsonMatch = line.match(/'({"username"[^}]+})'/);
          if (jsonMatch) {
            try { const d = JSON.parse(jsonMatch[1]); username = d.username; avatar_hash = d.avatar; } catch { /* ignore */ }
          }
          const avatar_url = avatar_hash
            ? `https://cdn.discordapp.com/avatars/${userId}/${avatar_hash}.png?size=64`
            : `https://cdn.discordapp.com/embed/avatars/${parseInt(userId, 10) % 5}.png`;
          members.push({
            discord_id: userId,
            username: username || `Üye #${userId.slice(-4)}`,
            avatar_hash,
            avatar_url,
            source: path.basename(sqlPath)
          });
        }
        rl.close();
      } catch (err) {
        console.error(`[Guild Members] Dosya hatası ${sqlPath}:`, err.message);
      }
    }
  }

  const total = members.length;
  const page = members.slice(offset, offset + limit);

  return res.json({
    ok: true,
    guild_id: guildId,
    total,
    limit,
    offset,
    count: page.length,
    members: page
  });
});

// GET /api/guild/:id/search - Search for a user within a guild
app.get('/api/guild/:id/search', requireSubscription, async (req, res) => {
  const guildId = String(req.params.id || '').trim();
  const query = String(req.query?.q || '').trim().toLowerCase();
  if (!guildId || !/^\d{10,30}$/.test(guildId)) {
    return res.status(400).json({ ok: false, error: 'invalid_guild_id' });
  }
  if (!query || query.length < 2) {
    return res.status(400).json({ ok: false, error: 'query_too_short' });
  }

  const members = [];
  const seenIds = new Set();

  if (isDBReady()) {
    try {
      const dbMembers = await dbSearchGuildMembers(guildId);
      for (const m of dbMembers) {
        if (!m.discord_id || seenIds.has(m.discord_id)) continue;
        const usernameMatch = (m.username || '').toLowerCase().includes(query);
        const emailMatch = (m.email || '').toLowerCase().includes(query);
        const idMatch = m.discord_id.includes(query);
        if (!usernameMatch && !emailMatch && !idMatch) continue;
        seenIds.add(m.discord_id);
        let avatar_url = null;
        if (m.avatar_hash) {
          const ext = m.avatar_hash.startsWith('a_') ? 'gif' : 'png';
          avatar_url = `https://cdn.discordapp.com/avatars/${m.discord_id}/${m.avatar_hash}.${ext}?size=64`;
        } else {
          avatar_url = `https://cdn.discordapp.com/embed/avatars/${parseInt(m.discord_id, 10) % 5}.png`;
        }
        members.push({
          discord_id: m.discord_id,
          username: m.username || `Üye #${String(m.discord_id).slice(-4)}`,
          email: m.email || null,
          ip: m.ip || null,
          avatar_hash: m.avatar_hash || null,
          avatar_url,
          source: m.source || 'database'
        });
      }
    } catch (err) {
      console.error(`[Guild Search] DB hatası: ${err.message}`);
    }
  }

  return res.json({
    ok: true,
    guild_id: guildId,
    query,
    count: members.length,
    members
  });
});

// İstatistikler
app.get('/api/stats', async (req, res) => {
  if (isDBReady()) {
    try {
      const stats = await dbGetStats();
      return res.json({
        txt_records: stats.total_users,
        sql_tables: { database: stats.total_query_logs },
        total_sources: 1,
        db_stats: stats
      });
    } catch (err) {
      console.error('[Stats] DB hatası:', err.message);
    }
  }

  let txtCount = 0, sqlCounts = {};

  try {
    if (fs.existsSync(TXT_PATH)) {
      const content = await fs.promises.readFile(TXT_PATH, 'utf8');
      const obj = safeJsonParse(content);
      txtCount = Array.isArray(obj?.users) ? obj.users.length : 0;
    }
  } catch (err) {
    console.error('[Stats] TXT okuma hatası:', err.message);
  }

  for (const p of SQL_PATHS) {
    const fileName = path.basename(p);
    try {
      if (!fs.existsSync(p)) { sqlCounts[fileName] = 0; continue; }
      const stats = fs.statSync(p);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
      let insertCount = 0;
      const rs = fs.createReadStream(p, { encoding: 'utf8' });
      const rl = readline.createInterface({ input: rs, crlfDelay: Infinity });
      for await (const line of rl) { if (line.match(/INSERT INTO/gi)) insertCount++; }
      sqlCounts[fileName] = insertCount;
      console.log(`[Stats] ${fileName}: ${insertCount} INSERT (${sizeMB} MB)`);
    } catch (err) {
      sqlCounts[fileName] = 0;
    }
  }

  res.json({ txt_records: txtCount, sql_tables: sqlCounts, total_sources: 1 + SQL_PATHS.length });
});

// 📤 SQL DOSYA UPLOAD ENDPOINT (Railway için)
app.post('/api/upload-sql', express.raw({ type: '*/*', limit: '500mb' }), async (req, res) => {
  try {
    const filename = req.query.filename || 'uploaded.sql';
    if (!filename.endsWith('.sql') && !filename.endsWith('.txt')) {
      return res.status(400).json({ ok: false, error: 'Sadece .sql ve .txt dosyaları' });
    }
    
    const filepath = path.join(DATA_DIR, filename);
    fs.writeFileSync(filepath, req.body);
    
    console.log(`[Upload] ${filename} yüklendi: ${(req.body.length / 1024 / 1024).toFixed(2)} MB`);
    
    // SQL_PATHS'i güncelle
    detectDataSources();
    
    res.json({ ok: true, message: `${filename} yüklendi`, size: req.body.length });
  } catch (err) {
    console.error('[Upload] Hata:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 🔗 Discord Webhook Endpoint - Arama sonuçlarını Discord'a gönder
app.post('/api/send-to-discord', async (req, res) => {
  try {
    const { webhook_url, search_type, search_query } = req.body || {};

    // Hem discord.com hem de discordapp.com domainlerini destekle
    const validDiscordDomains = [
      'https://discord.com/api/webhooks/',
      'https://discordapp.com/api/webhooks/'
    ];
    const isValidUrl = validDiscordDomains.some(domain => webhook_url?.startsWith(domain));
    if (!webhook_url || !isValidUrl) {
      return res.status(400).json({ ok: false, error: 'Geçersiz Discord webhook URL' });
    }

    if (!search_type || !search_query) {
      return res.status(400).json({ ok: false, error: 'search_type ve search_query gerekli' });
    }

    // Arama sonuçlarını topla
    let results = [];

    if (search_type === 'discord_id') {
      // TXT dosyasından ara
      if (fs.existsSync(TXT_PATH)) {
        const content = await fs.promises.readFile(TXT_PATH, 'utf8');
        const obj = JSON.parse(content);
        const users = Array.isArray(obj?.users) ? obj.users : [];
        results = users.filter(u => String(u.discord_id) === search_query);
      }

      // SQL dosyalarından ara
      for (const sqlPath of SQL_PATHS) {
        if (!fs.existsSync(sqlPath)) continue;
        const rs = fs.createReadStream(sqlPath, { encoding: 'utf8' });
        const rl = readline.createInterface({ input: rs, crlfDelay: Infinity });
        for await (const line of rl) {
          if (line.includes(search_query)) {
            const match = line.match(/'([^']+)'/g);
            if (match) {
              results.push({ source: path.basename(sqlPath), data: match.slice(0, 5).join(', ') });
            }
          }
        }
      }
    } else if (search_type === 'email') {
      if (fs.existsSync(TXT_PATH)) {
        const content = await fs.promises.readFile(TXT_PATH, 'utf8');
        const obj = JSON.parse(content);
        const users = Array.isArray(obj?.users) ? obj.users : [];
        results = users.filter(u => String(u.email).toLowerCase().includes(search_query.toLowerCase()));
      }
    }

    // Sonuçları Discord'a gönder
    const dataToSend = results.length > 0 ? {
      discord_id: results[0]?.discord_id || search_query,
      username: results[0]?.username || 'Bulunamadı',
      email: results[0]?.email || 'Bulunamadı',
      ip: results[0]?.last_ip || results[0]?.registration_ip || 'Bulunamadı',
      source: results.length > 0 ? 'Zagros DB' : 'Sonuç bulunamadı'
    } : { discord_id: search_query, source: 'Sonuç bulunamadı' };

    await sendToDiscordWebhook(webhook_url, dataToSend);

    res.json({ ok: true, message: `${results.length} sonuç Discord'a gönderildi` });
  } catch (err) {
    console.error('[Discord Webhook] Hata:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// OSINT Scenario Runner
async function runScenario(discordId) {
  // Prepare containers
  let fc = null;
  try { fc = await getFindCordData(discordId); } catch { fc = null; }

  let dbResults = [];
  let txtMatches = [];
  let sqlMatches = [];
  if (isDBReady()) {
    try { dbResults = await dbSearchByDiscordId(discordId); } catch { dbResults = []; }
  } else {
    try { txtMatches = await searchTxtByDiscordId(discordId); } catch { txtMatches = []; }
    try { const lists = await Promise.all(SQL_PATHS.map(p => scanSqlFileForDiscordId(p, discordId))); sqlMatches = lists.flat(); } catch { sqlMatches = []; }
  }

  // Simple coverage score
  const coverage = [dbResults.length>0, txtMatches.length>0, sqlMatches.length>0, fc ? 1 : 0].filter(Boolean).length;

  return {
    discord_id: discordId,
    coverage,
    details: {
      sources: {
        db: dbResults,
        txt: txtMatches,
        sql: sqlMatches,
        findcord: fc
      }
    }
  };
}

// Route to trigger a scenario run
app.get('/api/scenario-run', requireAdmin, async (req, res) => {
  const discordId = String(req.query?.discord_id ?? '').trim();
  if (!discordId) return res.status(400).json({ ok: false, error: 'discord_id_required' });
  try {
    const result = await runScenario(discordId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'scenario_failed', message: err.message });
  }
});

// 🎮 Discord API Proxy Endpoint - Frontend için
// Kullanıcı avatar/banner bilgisi çek
app.get('/api/discord/user/:userId', async (req, res) => {
  const userId = String(req.params.userId || '').trim();
  if (!userId || !/^\d{10,30}$/.test(userId)) {
    return res.status(400).json({ ok: false, error: 'invalid_user_id' });
  }

  // Önce CDN URL'lerini döndür (token olmasa bile)
  const result = {
    ok: true,
    id: userId,
    avatar_url: discordDefaultAvatarUrl(userId),
    discord_api_available: !!DISCORD_BOT_TOKEN
  };

  if (DISCORD_BOT_TOKEN) {
    const discordUser = await fetchDiscordUser(userId);
    if (discordUser) {
      Object.assign(result, discordUser);
      result.ok = true;
    }
  }

  return res.json(result);
});

// Guild icon/banner bilgisi çek
app.get('/api/discord/guild/:guildId', async (req, res) => {
  const guildId = String(req.params.guildId || '').trim();
  if (!guildId || !/^\d{10,30}$/.test(guildId)) {
    return res.status(400).json({ ok: false, error: 'invalid_guild_id' });
  }

  const result = {
    ok: true,
    id: guildId,
    icon_url: null,
    banner_url: null,
    discord_api_available: !!DISCORD_BOT_TOKEN
  };

  if (DISCORD_BOT_TOKEN) {
    const discordGuild = await fetchDiscordGuild(guildId);
    if (discordGuild) {
      Object.assign(result, discordGuild);
      result.ok = true;
    }
  }

  return res.json(result);
});

// Discord CDN URL oluşturucu (frontend için yardımcı)
app.get('/api/discord/cdn', (req, res) => {
  const { type, id, hash, size } = req.query;
  const sz = parseInt(size) || 128;

  let url = null;
  switch (type) {
    case 'avatar':
      url = hash ? discordAvatarUrl(id, hash, sz) : discordDefaultAvatarUrl(id);
      break;
    case 'guild_icon':
      url = discordGuildIconUrl(id, hash, sz);
      break;
    case 'guild_banner':
      url = discordGuildBannerUrl(id, hash, sz);
      break;
    case 'user_banner':
      url = discordUserBannerUrl(id, hash, sz);
      break;
    case 'member_avatar':
      const { guild_id } = req.query;
      url = discordMemberAvatarUrl(guild_id, id, hash, sz);
      break;
    default:
      return res.status(400).json({ ok: false, error: 'invalid_type' });
  }

  if (!url) return res.status(404).json({ ok: false, error: 'not_found' });
  return res.json({ ok: true, url });
});

// 🎯 Discord Widget API Proxy - CORS ve rate limit koruması
// Önemli: SPA catch-all route'undan ÖNCE tanımlanmalı, yoksa index.html döner.
const widgetCache = new Map();
const WIDGET_CACHE_TTL = 5 * 60 * 1000; // 5 dakika cache

app.get('/api/widget/:guildId', async (req, res) => {
  const { guildId } = req.params;

  const cached = widgetCache.get(guildId);
  if (cached && (Date.now() - cached.timestamp) < WIDGET_CACHE_TTL) {
    return res.json(cached.data);
  }

  try {
    const response = await axios.get(`https://discord.com/api/guilds/${encodeURIComponent(guildId)}/widget.json`, {
      timeout: 5000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; ZagrosWidgetProxy/1.0)'
      },
      validateStatus: (s) => s < 500
    });

    if (response.status !== 200) {
      if (response.status === 404) return res.status(404).json({ error: 'Widget not enabled' });
      if (response.status === 429) return res.status(429).json({ error: 'Rate limited' });
      return res.status(response.status).json({ error: 'Discord API error' });
    }

    const data = response.data;
    if (!data || typeof data !== 'object') {
      return res.status(502).json({ error: 'invalid_widget_response' });
    }

    widgetCache.set(guildId, { data, timestamp: Date.now() });
    return res.json(data);
  } catch (error) {
    console.error(`[Widget Proxy] ${guildId} hata:`, error.message);
    return res.status(500).json({ error: 'Proxy error' });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

// Admin panel route - allow access if logged in as admin
app.get('/admin', (req, res) => {
  // Check session or query param for admin access
  const isAdmin = req.session?.tier === 'admin' || req.query?.admin === 'true';
  if (!isAdmin) {
    // Redirect to main page with admin=false indicator
    return res.redirect('/?admin=false');
  }
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// 🔄 404 Handler - SPA için tüm route'ları index.html'e yönlendir
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 🚨 Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Error]', err.message, err.stack);
  
  // Production'da detaylı hata mesajlarını gizle
  const errorMessage = isProduction 
    ? 'Internal Server Error' 
    : err.message;
  
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.status(err.status || 500).json({
      ok: false,
      error: 'server_error',
      message: errorMessage,
      ...(isProduction ? {} : { stack: err.stack })
    });
  }
  
  res.status(err.status || 500).send(`
    <h1>500 - Internal Server Error</h1>
    <p>${errorMessage}</p>
    <a href="/">Ana Sayfaya Dön</a>
  `);
});

// Server başlat - hemen başlat, dosya indirme arka planda çalışsın
const server = app.listen(APP_PORT, APP_HOST, async () => {
  console.log(`[Server] ✅ Zagros OSINT running at http://${APP_HOST}:${APP_PORT}`);
  console.log(`[Deploy] Version: ${APP_VERSION}`);
  console.log(`[Environment] ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
  
  // Zagros veritabanını oluştur
  await createZagrosDatabase();
  
  // SQL dosyalarını veritabanına yükle
  await ensureSqlLoaded();
  
  // Dosya indirmeyi arka planda başlat - health check'i bloklamaz
  downloadDataFiles().catch(err => console.error('[Download] Arka plan indirme hatası:', err.message));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('[Server] Process terminated');
  });
});

process.on('SIGINT', () => {
  console.log('[Server] SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('[Server] Process terminated');
  });
});
