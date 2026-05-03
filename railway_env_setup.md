# Railway Environment Variables Setup
# olsnyr projesi için gerekli tüm env variable'lar

# ==================== DATABASE ====================
DATABASE_URL=./zagros.db
# veya PostgreSQL için:
# DATABASE_URL=postgresql://username:password@host:port/database

# ==================== CORE API KEYS ====================
# FindCord API - Discord sunucu bilgileri için
FINDCORD_API_KEY=your_findcord_api_key_here

# Discord Bot Token - Sunucu üyelik kontrolü için (opsiyonel)
DISCORD_BOT_TOKEN=your_discord_bot_token_here

# ==================== ADMIN PANEL ====================
ADMIN_ID=zagros
ADMIN_PASSWORD=your_secure_admin_password
ADMIN_SESSION_SECRET=your_random_session_secret_key

# ==================== IP LOOKUP APIs ====================
# IPInfo.io - Temel IP bilgileri
IPINFO_TOKEN=your_ipinfo_token_here

# IPGeolocation.io - Detaylı IP coğrafi konum
IPGEOLOCATION_API_KEY=your_ipgeolocation_api_key_here

# IPQualityScore - IP reputation ve fraud kontrolü
IPQUALITYSCORE_API_KEY=your_ipqs_api_key_here

# ViewDNS.info - Reverse IP lookup
VIEWDNS_API_KEY=your_viewdns_api_key_here

# AbuseIPDB - IP abuse raporları
ABUSEIPDB_API_KEY=your_abuseipdb_api_key_here

# VirusTotal - IP/Domain güvenlik taraması
VIRUSTOTAL_API_KEY=your_virustotal_api_key_here

# ==================== EMAIL LOOKUP APIs ====================
# Hunter.io - Email bulma ve doğrulama
HUNTER_API_KEY=your_hunter_api_key_here

# LeakCheck.io - Email sızdırma kontrolü
LEAKCHECK_API_KEY=your_leakcheck_api_key_here

# Intelligence X - Email/OSINT arama
INTELX_API_KEY=your_intelx_api_key_here

# Have I Been Pwned - Email breach kontrolü
HIBP_API_KEY=your_hibp_api_key_here

# ==================== APP CONFIG ====================
# Session Secret
SESSION_SECRET=your_random_session_secret_v2

# Discord Webhook - Ziyaretçi logları için
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/1496280136901722222/TGXA8J1SmCeDge4FNYoiP_pj1nCn4yK-FNp9dAP1MWP96EWPusk1JD0zXi-9BSjUZPyB

# App Version
APP_VERSION=v1.0.0-prod

# Data Directory
DATA_DIR=/data

# Site Password (giriş için)
ZAGROS_PASSWORD=your_site_password

# Production Mode
NODE_ENV=production
