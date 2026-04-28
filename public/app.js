const authCard = document.getElementById('authCard');
const appCard = document.getElementById('appCard');
const keyLoginBtn = document.getElementById('keyLoginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const authError = document.getElementById('authError');
const searchError = document.getElementById('searchError');
const resultsArea = document.getElementById('resultsArea');
const loading = document.getElementById('loading');
const noResults = document.getElementById('noResults');
const statsBar = document.getElementById('statsBar');
 const historyList = null;
 const historySection = null;
 const historyListSidebar = null;
 const historySectionSidebar = null;

// Dark mode support
function applyDarkMode(enabled) {
  document.body.classList.toggle('dark-mode', !!enabled);
  try {
    localStorage.setItem('zagrosDarkMode', enabled ? '1' : '0');
  } catch {}
  // Update toggle UI if present
  const toggle = document.getElementById('darkModeToggle');
  if (toggle) toggle.checked = !!enabled;
}

// Manuel giriş elementleri
const manualDiscordId = document.getElementById('manualDiscordId');
const manualUsername = document.getElementById('manualUsername');
const manualEmail = document.getElementById('manualEmail');
const manualIp = document.getElementById('manualIp');
const addManualBtn = document.getElementById('addManualBtn');
const manualEmailOnly = document.getElementById('manualEmailOnly');
const addEmailBtn = document.getElementById('addEmailBtn');

let searchMode = 'id';
var searchHistory = [];
let lastResult = null;
let authData = { tier: 'free' }; // Global auth state for tier checks

function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }
function setError(el, msg) { if (!msg) { hide(el); el.textContent = ''; return; } el.textContent = msg; show(el); }
function escapeHtml(str) {
  if (str === undefined || str === null) return '';
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
}

 function showLoading() {
   loading.innerHTML = `
     <div class="loading-container">
       <div class="loading-spinner"></div>
       <div class="loading-text">Aranıyor...</div>
       <div class="progress-bar" style="width: 200px; margin-top: 12px;">
         <div class="progress-bar-fill"></div>
       </div>
     </div>
   `;
   show(loading);
 }

 function hideLoading() {
   loading.innerHTML = '';
   hide(loading);
 }

// Toast notification
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  const colors = {
    success: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
    error: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
    warning: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
    info: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
  };
  
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${colors[type] || colors.info};
    color: white;
    padding: 14px 24px;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 500;
    z-index: 10000;
    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    animation: slideIn 0.3s ease;
    max-width: 400px;
    word-wrap: break-word;
  `;
  
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Toast animations
const toastStyles = document.createElement('style');
toastStyles.textContent = `
  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes fadeOut {
    from { opacity: 1; }
    to { opacity: 0; }
  }
`;
document.head.appendChild(toastStyles);

async function api(path, opts) {
  const res = await fetch(path, { 
    ...opts, 
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(opts?.headers ?? {}) } 
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || 'request_failed');
  return data;
}

async function checkAuth() {
  try {
    const res = await fetch('/api/health', { method: 'GET', credentials: 'same-origin' });
    if (res.ok) {
      const data = await res.json();
      if (data.authed) {
        // Store auth data globally for tier checks
        authData = { tier: data.tier || 'free' };
        hide(authCard); 
        show(appCard); 
        loadStats(); 
        try { renderHistory(); } catch (e) {}
        if (data.tier === 'admin') showAdminLink();
        return true;
      }
    }
  } catch { /* ignore */ }
  authData = { tier: 'free' };
  show(authCard); 
  hide(appCard); 
  return false;
}

function showAdminLink() {
  if (document.getElementById('adminPanelLink')) return;
  const btn = document.createElement('a');
  btn.id = 'adminPanelLink';
  btn.href = '/admin';
  btn.target = '_blank';
  btn.textContent = '🔐 Admin Panel';
  btn.style.cssText = 'background:linear-gradient(135deg,#5865F2,#4752C4);color:#fff;padding:8px 16px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;margin-left:10px;display:inline-block;';
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn?.parentNode) logoutBtn.parentNode.insertBefore(btn, logoutBtn);
}

// Login tab switching
const loginTabs = document.querySelectorAll('.login-tab');
loginTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    loginTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    const mode = tab.dataset.mode;
    document.getElementById('freeLogin').classList.toggle('hidden', mode !== 'free');
    document.getElementById('keyLogin').classList.toggle('hidden', mode !== 'premium');
    setError(authError, null);
  });
});

// Auto login button
document.getElementById('autoLoginBtn').addEventListener('click', autoLogin);

// Initialize dark mode on load
window.addEventListener('DOMContentLoaded', () => {
  try {
    const saved = localStorage.getItem('zagrosDarkMode');
    const isOn = saved === '1';
    if (typeof applyDarkMode === 'function') {
      applyDarkMode(isOn);
    }
  } catch {}
  const toggle = document.getElementById('darkModeToggle');
  if (toggle) {
    toggle.addEventListener('change', (e) => applyDarkMode(e.target.checked));
  }
});

// Otomatik free giriş (boş body ile)
async function autoLogin() {
  try {
    const response = await api('/api/login', { method: 'POST', body: JSON.stringify({}) });
    // Store auth data globally
    authData = { tier: response.tier || 'free', ...response };
    await checkAuth();

    let message = '🦁 Zagros OSINT Paneline hoş geldiniz!';
    if (response.tier === 'free') {
      message += ' (Free - 1 Discord ID sorgusu)';
    }
    showToast(message, 'success');
    updateSubscriptionInfo(response);
  } catch (err) {
    console.error('Auto login failed:', err);
  }
}

// Anahtar login (premium)
keyLoginBtn.addEventListener('click', async () => {
  setError(authError, null);
  const keyEl = document.getElementById('key');
  try {
    const response = await api('/api/login', { method: 'POST', body: JSON.stringify({ key: keyEl.value }) });
    // Store auth data globally
    authData = { tier: response.tier || 'free', ...response };
    keyEl.value = '';
    await checkAuth();

    if (response.tier === 'admin') {
      showToast('🔐 Admin girişi başarılı! Sınırsız erişim.', 'success');
      showAdminLink();
    } else {
      showToast('🦁 Premium girişi başarılı! (Sınırsız erişim)', 'success');
    }
    updateSubscriptionInfo(response);
  }
  catch (err) {
    const errorMsg = err?.error === 'expired' ? '❌ Anahtar süresi dolmuş.' :
                     err?.error === 'invalid_key' ? '❌ Geçersiz anahtar.' :
                     '❌ Giriş başarısız. Tekrar deneyin.';
    setError(authError, errorMsg);
  }
});

document.getElementById('key').addEventListener('keydown', (e) => { if (e.key === 'Enter') keyLoginBtn.click(); });

logoutBtn.addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST', body: '{}' });
  await checkAuth();
  document.getElementById('subscriptionInfo').innerHTML = '';
});

// Update subscription info display
function updateSubscriptionInfo(authData) {
  const subInfo = document.getElementById('subscriptionInfo');
  if (!subInfo) return;

  if (!authData || authData.tier === 'admin') {
    subInfo.innerHTML = '';
    return;
  }

  let tierLabel = '';
  let tierClass = '';
  let details = '';

  if (authData.tier === 'free') {
    tierLabel = '🆓 Free';
    tierClass = 'free';
    details = `${authData.remainingQueries}/5 sorgu kaldı`;
  } else if (authData.tier === 'premium_monthly') {
    tierLabel = '⭐ Premium Aylık';
    tierClass = 'premium';
    details = 'Sınırsız erişim';
  } else if (authData.tier === 'premium_yearly') {
    tierLabel = '👑 Premium Yıllık';
    tierClass = 'premium';
    details = 'Sınırsız erişim';
  }

  if (authData.expiresAt) {
    const expiryDate = new Date(authData.expiresAt).toLocaleDateString('tr-TR');
    details += ` • Bitiş: ${expiryDate}`;
  }

  subInfo.className = `subscription-info ${tierClass}`;
  subInfo.innerHTML = `<strong>${tierLabel}</strong> - ${details}`;
}

// Sekmeler
const tabs = document.querySelectorAll('.search-tabs .tab');
function updateModeUI() {
  tabs.forEach(t => t.classList.toggle('active', t.dataset.mode === searchMode));
  const ph = { 
    id: 'Discord ID gir...', 
    email: 'Email adresi gir...', 
    ip: 'IP adresi gir...', 
    guild: 'Sunucu ID gir...',
    guilds: 'Sunucu listesi yükleniyor...'
  }[searchMode];
  searchInput.placeholder = ph || 'Ara...';
  
  // Sunucular modunda arama inputunu gizle
  if (searchMode === 'guilds') {
    searchInput.style.display = 'none';
    searchBtn.textContent = '📋 Listele';
  } else {
    searchInput.style.display = 'block';
    searchBtn.textContent = 'Ara';
  }
  
  if (searchMode === 'email') searchInput.setAttribute('inputmode', 'email');
  else if (searchMode === 'ip') searchInput.setAttribute('inputmode', 'decimal');
  else searchInput.setAttribute('inputmode', 'text');
}
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    searchMode = tab.dataset.mode;
    updateModeUI();
    searchInput.value = '';
    
    // Sunucular modunda otomatik listele
    if (searchMode === 'guilds') {
      doSearch();
    } else {
      searchInput.focus();
    }
  });
});

// Kopyala
function copyVal(text) {
  navigator.clipboard.writeText(text).catch(() => {});
}

// İstatistikler
async function loadStats() {
  try {
    const data = await api('/api/stats', { method: 'GET' });
    if (data) {
      const items = [`TXT: ${data.txt_records} kayıt`];
      for (const [k, v] of Object.entries(data.sql_tables || {})) items.push(`${k}: ${v} tablo`);
      statsBar.innerHTML = items.map(i => `<span class="stat-pill">${i}</span>`).join('');
    }
  } catch { /* ignore */ }
}

function addToHistory() {}
function renderHistory() {}

// 📥 MANUEL VERİ GİRİŞİ FONKSİYONLARI

// Manuel Discord ID + Bilgi ekle
async function addManualDiscordInfo() {
  const discordId = manualDiscordId?.value?.trim();
  const username = manualUsername?.value?.trim();
  const email = manualEmail?.value?.trim();
  const ip = manualIp?.value?.trim();
  
  if (!discordId) {
    alert('Discord ID girilmeli!');
    return;
  }
  
  if (!/^\d{17,20}$/.test(discordId)) {
    alert('Geçersiz Discord ID! 17-20 haneli sayı olmalı.');
    return;
  }
  
  try {
    const response = await api('/api/manual-entry', {
      method: 'POST',
      body: JSON.stringify({
        type: 'discord_info',
        discord_id: discordId,
        username: username || null,
        email: email || null,
        ip: ip || null
      })
    });
    
    if (response?.ok) {
      alert('✅ Veri başarıyla kaydedildi!');
      // Input'ları temizle
      manualDiscordId.value = '';
      manualUsername.value = '';
      manualEmail.value = '';
      manualIp.value = '';
    } else {
      alert('❌ Kaydetme başarısız: ' + (response?.error || 'Bilinmeyen hata'));
    }
  } catch (err) {
    alert('❌ Hata: ' + err.message);
  }
}

// Manuel Email ekle
async function addManualEmail() {
  const email = manualEmailOnly?.value?.trim();
  
  if (!email) {
    alert('Email adresi girilmeli!');
    return;
  }
  
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    alert('Geçersiz email formatı!');
    return;
  }
  
  try {
    const response = await api('/api/manual-entry', {
      method: 'POST',
      body: JSON.stringify({
        type: 'email',
        email: email
      })
    });
    
    if (response?.ok) {
      alert('✅ Email başarıyla kaydedildi!');
      manualEmailOnly.value = '';
    } else {
      alert('❌ Kaydetme başarısız: ' + (response?.error || 'Bilinmeyen hata'));
    }
  } catch (err) {
    alert('❌ Hata: ' + err.message);
  }
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'az önce';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}dk`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}sa`;
  return `${Math.floor(diff / 86400000)}g`;
}

// Dışa aktar
function exportResult() {
  if (!lastResult) return;
  const blob = new Blob([JSON.stringify(lastResult, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `zagros_${lastResult.discord_id || 'result'}.json`; a.click();
  URL.revokeObjectURL(url);
}

// Bağlantı URL oluşturucu
function getConnectionUrl(app, connId, connName) {
  const lower = app.toLowerCase();
  if (lower === 'github' && (connId || connName)) return `https://github.com/${connName || connId}`;
  if (lower === 'twitter' && connName) return `https://twitter.com/${connName}`;
  if (lower === 'twitter' && connId) return `https://twitter.com/i/user/${connId}`;
  if (lower === 'instagram' && connName) return `https://instagram.com/${connName}`;
  if (lower === 'youtube' && connId) return `https://youtube.com/channel/${connId}`;
  if (lower === 'twitch' && (connName || connId)) return `https://twitch.tv/${connName || connId}`;
  if (lower === 'reddit' && connName) return `https://reddit.com/user/${connName}`;
  if (lower === 'tiktok' && connName) return `https://tiktok.com/@${connName}`;
  if (lower === 'steam' && connId) return `https://steamcommunity.com/profiles/${connId}`;
  if (lower === 'spotify' && connId) return `https://open.spotify.com/user/${connId}`;
  if (lower === 'paypal' && connName) return `https://paypal.me/${connName}`;
  if (lower === 'facebook' && connId) return `https://facebook.com/${connId}`;
  if (lower === 'domain' && connName) return `https://${connName}`;
  if (lower === 'crunchyroll' && connName) return `https://crunchyroll.com/user/${connName}`;
  return null;
}

function getTagClass(app) {
  const lower = app.toLowerCase();
  let cls = 'tag';
  const map = ['spotify','instagram','github','paypal','youtube','twitch','twitter','steam','tiktok','reddit','facebook','ebay','epic','battlenet','crunchyroll','domain'];
  for (const m of map) if (lower.includes(m)) cls += ` ${m}`;
  if (lower.includes('leagueoflegends') || lower.includes('riot')) cls += ' riot';
  return cls;
}

// Copy button helper (global scope)
const copyBtn = (val) => val && val !== 'Bilinmiyor' ? `<button class="copy-btn" onclick="navigator.clipboard.writeText('${val.replace(/'/g, "\\'")}')">📋</button>` : '';

// Kart oluştur
function createUserCard(data) {
  const card = document.createElement('div');
  card.className = 'user-card';
  const username = data.username || 'Bilinmeyen Kullanıcı';
  const disc = data.discriminator && data.discriminator !== '0' ? `#${data.discriminator}` : '';
  const initial = username[0].toUpperCase();
  const discordId = data.discord_id || '-';

  // Profil fotoğrafı - önce zenginleştirilmiş kaynak, sonra Discord CDN, sonra baş harf
  let avatarHtml;
  if (data.enriched_avatar_url || data.findcord_avatar_url) {
    const enrichedUrl = data.enriched_avatar_url || data.findcord_avatar_url;
    avatarHtml = `<img class="avatar-img" src="${enrichedUrl}" onerror="this.outerHTML='<div class=\'avatar\'>${initial}</div>'" alt="">`;
  } else if (data.avatar_hash && data.avatar_hash !== 'N/A') {
    const ext = data.avatar_hash.startsWith('a_') ? 'gif' : 'png';
    avatarHtml = `<img class="avatar-img" src="https://cdn.discordapp.com/avatars/${discordId}/${data.avatar_hash}.${ext}?size=128" onerror="this.outerHTML='<div class=\\'avatar\\'>${initial}</div>'" alt="">`;
  } else { avatarHtml = `<div class="avatar">${initial}</div>`; }

  let badgesHtml = '';
  if (data.premium === '1' || data.premium === 'true' || data.subscription_type === 'enterprise' || data.subscription_type === 'pro') badgesHtml += '<span class="badge premium-badge">⭐ Premium</span>';
  if (data.verified === '1' || data.verified === 'true' || data.is_active === 1) badgesHtml += '<span class="badge verified-badge">✓ Doğrulanmış</span>';
  // Ek rozetler
  if (data.findcord_badges && data.findcord_badges.length > 0) {
    for (const b of data.findcord_badges) {
      const iconHtml = b.icon ? `<img class="badge-icon" src="${b.icon}" onerror="this.style.display='none'" alt="">` : '';
      badgesHtml += `<span class="badge fc-badge" title="${b.description || b.id}">${iconHtml}${b.description || b.id}</span>`;
    }
  }

  // Ek banner
  let bannerStyle = '';
  if (data.findcord_banner_url) {
    bannerStyle = `background-image: url(${data.findcord_banner_url}); background-size: cover; background-position: center;`;
  }

  // Ek kullanıcı adı + zamir
  let globalNameHtml = '';
  if (data.findcord_global_name && data.findcord_global_name !== username) {
    globalNameHtml = `<div class="global-name">${data.findcord_global_name}</div>`;
  }
  if (data.findcord_pronouns) {
    globalNameHtml += `<span class="pronouns">${data.findcord_pronouns}</span>`;
  }

  // Çevrimiçi durum bilgisi
  let presenceHtml = '';
  if (data.findcord_presence) {
    const status = data.findcord_presence.Status || data.findcord_presence.status || 'offline';
    const statusMap = { online: '🟢 Çevrimiçi', idle: '🟡 Boşta', dnd: '🔴 Rahatsız Etmeyin', offline: '⚫ Çevrimdışı' };
    presenceHtml = statusMap[status] || `⚫ ${status}`;
  }

  // Ortak sunucular
  let serversHtml = '';
  if (data.findcord_servers && data.findcord_servers.length > 0) {
    const servers = data.findcord_servers.slice(0, 20);
    serversHtml = `<div class="servers-section"><div class="section-title">Ortak Sunucular (${data.findcord_servers.length})</div><div class="servers-grid">${servers.map(s => {
      const name = s.name || s.GuildName || 'Bilinmeyen';
      const iconUrl = s.icon || s.GuildIcon || null;
      const iconHtml = iconUrl ? `<img class="server-icon" src="${iconUrl}" onerror="this.outerHTML='<span class=\\'server-letter\\'>${name[0]}</span>'" alt="">` : `<span class="server-letter">${name[0]}</span>`;
      const boosterBadge = s.booster ? '<span class="booster-dot">💎</span>' : '';
      return `<div class="server-chip" title="${name}${s.join_time ? ' — Katılım: ' + s.join_time : ''}">${iconHtml}<span class="server-name">${name}</span>${boosterBadge}</div>`;
    }).join('')}${data.findcord_servers.length > 20 ? `<span class="server-more">+${data.findcord_servers.length - 20}</span>` : ''}</div></div>`;
  }

  // Potansiyel arkadaşlar (aynı IP veya guild'den)
  let friendsHtml = '';
  if (data.potential_friends && data.potential_friends.length > 0) {
    const friends = data.potential_friends.slice(0, 10);
    friendsHtml = `<div class="friends-section"><div class="section-title">🤔 Potansiyel Arkadaşlar (${data.potential_friends.length})</div><div class="friends-list">${friends.map(f => {
      const relationIcon = f.relation === 'same_ip' ? '📍' : (f.relation === 'same_guild' ? '💬' : '🔍');
      const relationText = f.relation === 'same_ip' ? 'Aynı IP' : (f.relation === 'same_guild' ? 'Aynı Sunucu' : 'Bağlantılı');
      const emailText = f.email ? `<div class="friend-email">${f.email}</div>` : '';
      return `<div class="friend-item" title="${relationText}${f.common_ip ? ': ' + f.common_ip : ''}${f.guild_name ? ': ' + f.guild_name : ''}"><div class="friend-relation">${relationIcon}</div><div class="friend-info"><div class="friend-id">${f.discord_id}</div>${emailText}<div class="friend-meta">${relationText} | Güven: ${f.confidence}</div></div></div>`;
    }).join('')}</div></div>`;
  }

  // Ek profil bilgileri
  let fcExtraHtml = '';
  const fcExtras = [];
  if (data.findcord_top_name) fcExtras.push(`<span class="info-icon">👤</span><span class="info-label">Gerçek İsim</span><span class="info-value">${data.findcord_top_name}</span>`);
  if (data.findcord_top_age) fcExtras.push(`<span class="info-icon">🎂</span><span class="info-label">Yaş</span><span class="info-value">${data.findcord_top_age}</span>`);
  if (data.findcord_top_sex) fcExtras.push(`<span class="info-icon">⚧</span><span class="info-label">Cinsiyet</span><span class="info-value">${data.findcord_top_sex}</span>`);
  if (data.findcord_created) fcExtras.push(`<span class="info-icon">📅</span><span class="info-label">Hesap Oluşturma</span><span class="info-value">${data.findcord_created}</span>`);
  if (presenceHtml) fcExtras.push(`<span class="info-icon">📡</span><span class="info-label">Durum</span><span class="info-value">${presenceHtml}</span>`);
  if (data.findcord_display_names && data.findcord_display_names.length > 0) {
    fcExtras.push(`<span class="info-icon">🏷️</span><span class="info-label">Geçmiş İsimler</span><span class="info-value">${data.findcord_display_names.join(', ')}</span>`);
  }
  if (fcExtras.length > 0) {
    fcExtraHtml = `<div class="fc-extras">${fcExtras.map(e => `<div class="info-row">${e}</div>`).join('')}</div>`;
  }

  // Son mesajlar
  let messagesHtml = '';
  if (data.findcord_recent_messages && data.findcord_recent_messages.length > 0) {
    const messages = data.findcord_recent_messages.slice(0, 5);
    messagesHtml = `<div class="messages-section"><div class="section-title">💬 Son Mesajlar (${data.findcord_recent_messages.length})</div><div class="messages-list">${messages.map(m => {
      const guildName = m.guild_name || 'Bilinmeyen Sunucu';
      const channelName = m.channel_name || 'Bilinmeyen Kanal';
      const timestamp = m.timestamp ? new Date(m.timestamp).toLocaleDateString('tr-TR') : '';
      return `<div class="message-item"><div class="message-meta">${guildName} • ${channelName}${timestamp ? ' • ' + timestamp : ''}</div><div class="message-content">${m.content || 'İçerik yok'}</div></div>`;
    }).join('')}</div></div>`;
  }

  // Ses arkadaşları
  let voiceFriendsHtml = '';
  if (data.findcord_voice_friends && data.findcord_voice_friends.length > 0) {
    const voiceFriends = data.findcord_voice_friends.slice(0, 5);
    voiceFriendsHtml = `<div class="voice-friends-section"><div class="section-title">🎤 Ses Arkadaşları (${data.findcord_voice_friends.length})</div><div class="voice-friends-list">${voiceFriends.map(f => {
      const lastConnected = f.last_connected ? new Date(f.last_connected).toLocaleDateString('tr-TR') : 'Bilinmiyor';
      const totalTime = f.total_time || 'Bilinmiyor';
      return `<div class="voice-friend-item"><div class="voice-friend-name">${f.username || f.discord_id}</div><div class="voice-friend-meta">Son: ${lastConnected} • Süre: ${totalTime}</div></div>`;
    }).join('')}</div></div>`;
  }

  let connHtml = '';
  if (Array.isArray(data.connections_apps) && data.connections_apps.length > 0) {
    connHtml = `<div class="connections-section"><div class="section-title">Bağlantılar</div><div class="connections-tags">${data.connections_apps.map(conn => {
      const app = typeof conn === 'object' ? conn.app : String(conn);
      const connId = typeof conn === 'object' ? conn.id : '';
      const connName = typeof conn === 'object' ? conn.name : '';
      const cls = getTagClass(app);
      const url = getConnectionUrl(app, connId, connName);
      const label = connName ? `${app} (${connName})` : app;
      return url ? `<a class="${cls}" href="${url}" target="_blank" rel="noopener">${label}</a>` : `<span class="${cls}">${label}</span>`;
    }).join('')}</div></div>`;
  }

  const ipVal = data.ip || data.last_ip || data.registration_ip || 'Bilinmiyor';
  const regIp = data.registration_ip && data.last_ip && data.registration_ip !== data.last_ip ? data.registration_ip : null;
  const ipLocation = data.ip_location || null;
  const bioVal = data.bio && data.bio !== 'null' ? data.bio : null;
  const statusText = data.is_active ? 'Aktif' : 'Pasif';
  const statusCls = data.is_active ? 'status-active' : 'status-passive';

  card.innerHTML = `
    <div class="card-banner" style="${bannerStyle}"></div>
    <div class="card-body">
      <div class="card-header">
        ${avatarHtml}
        <div class="user-info">
          <div class="username-row">${username}${disc} ${badgesHtml}</div>
          ${globalNameHtml}
          <div class="discord-id">${discordId} ${copyBtn(discordId)}</div>
        </div>
        <button class="export-btn" onclick="document.dispatchEvent(new Event('export'))">⬇ JSON</button>
      </div>
      ${bioVal ? `<div class="bio-section">"${bioVal}"</div>` : ''}
      <div class="info-rows">
        <div class="info-row"><span class="info-icon">📧</span><span class="info-label">Email</span><span class="info-value">${data.email || 'Bilinmiyor'}</span>${copyBtn(data.email)}</div>
        <div class="info-row"><span class="info-icon">🌐</span><span class="info-label">IP</span><span class="info-value mono">${ipVal}</span>${copyBtn(ipVal)}</div>
        ${ipLocation ? `<div class="info-row"><span class="info-icon">📍</span><span class="info-label">Konum</span><span class="info-value location-val">${ipLocation}</span></div>` : ''}
        ${regIp ? `<div class="info-row"><span class="info-icon">🏠</span><span class="info-label">Kayıt IP</span><span class="info-value mono">${regIp}</span>${copyBtn(regIp)}</div>` : ''}
        ${data.subscription_type ? `<div class="info-row"><span class="info-icon">💎</span><span class="info-label">Abonelik</span><span class="info-value">${data.subscription_type}</span></div>` : ''}
        ${data.created_at ? `<div class="info-row"><span class="info-icon">📅</span><span class="info-label">Kayıt</span><span class="info-value">${data.created_at}</span></div>` : ''}
        ${data.last_login ? `<div class="info-row"><span class="info-icon">🕐</span><span class="info-label">Son Giriş</span><span class="info-value">${data.last_login}</span></div>` : ''}
        <div class="info-row"><span class="info-icon">⚡</span><span class="info-label">Durum</span><span class="info-value ${statusCls}">${statusText}</span></div>
      </div>
      ${fcExtraHtml}
      ${connHtml}
      ${serversHtml}
      ${friendsHtml}
      ${messagesHtml}
      ${voiceFriendsHtml}
    </div>`;
  return card;
}

// Çoklu sonuç kartı (email/IP arama)
function createMultiCard(results, query, type) {
  const container = document.createElement('div');
  container.className = 'multi-results';
  const header = document.createElement('div');
  header.className = 'multi-header';
  header.innerHTML = `<span class="multi-count">${results.length} sonuç</span> <span class="multi-query">"${query}" (${type})</span>`;
  container.appendChild(header);
  results.forEach(r => container.appendChild(createUserCard(r)));
  return container;
}

// OpenArchive tarzı detaylı email leak görünümü
function createEmailBreachView(data) {
  const container = document.createElement('div');
  container.className = 'osint-container';

  const sites = data.sites || [];
  const validation = data.validation || {};

  // Email başlık kartı
  const headerCard = document.createElement('div');
  headerCard.className = 'osint-header-card';
  headerCard.innerHTML = `
    <div class="osint-email">${data.query}</div>
    <div class="osint-meta">
      <span class="osint-badge ${validation.disposable ? 'danger' : (validation.free ? 'info' : 'success')}">
        ${validation.disposable ? '⚠️ Tek Kullanımlık' : (validation.free ? '📧 Ücretsiz Sağlayıcı' : '🏢 Kurumsal')}
      </span>
      <span class="osint-badge">${sites.length} Kayıt</span>
    </div>
  `;
  container.appendChild(headerCard);

  // Risk analizi kartı
  const riskCard = document.createElement('div');
  riskCard.className = 'osint-risk-card';
  const breachesCount = data.breaches_count || 0;
  let riskHtml = '<div class="risk-title">🔍 Email Analizi</div><div class="risk-grid">';
  riskHtml += `<div class="risk-item"><span class="risk-label">Domain</span><span class="risk-value">${validation.domain || '-'}</span></div>`;
  riskHtml += `<div class="risk-item"><span class="risk-label">Format</span><span class="risk-value ${validation.format ? 'good' : 'bad'}">${validation.format ? '✓ Geçerli' : '✗ Geçersiz'}</span></div>`;
  riskHtml += `<div class="risk-item"><span class="risk-label">Risk Seviyesi</span><span class="risk-value ${validation.disposable ? 'bad' : 'good'}">${validation.disposable ? 'Yüksek' : 'Düşük'}</span></div>`;
  riskHtml += `<div class="risk-item"><span class="risk-label">Breach Sayısı</span><span class="risk-value ${breachesCount > 0 ? 'bad' : 'good'}">${breachesCount > 0 ? '⚠️ ' + breachesCount : '✓ 0'}</span></div>`;
  riskHtml += '</div>';
  riskCard.innerHTML = riskHtml;
  container.appendChild(riskCard);

  if (sites.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'osint-empty';
    empty.innerHTML = `
      <div class="empty-icon">�</div>
      <div class="empty-title">Kayıt Bulunamadı</div>
      <div class="empty-desc">Bu email adresi için leak veritabanında kayıt yok.</div>
    `;
    container.appendChild(empty);
    return container;
  }

  // Kaynaklar grid
  const sourcesGrid = document.createElement('div');
  sourcesGrid.className = 'osint-sources-grid';

  // Platform sayıları
  const platformCounts = {};
  for (const s of sites) {
    platformCounts[s.site] = (platformCounts[s.site] || 0) + 1;
  }
  
  sourcesGrid.innerHTML = Object.entries(platformCounts).map(([platform, count]) => {
    const icon = getSiteIcon(platform);
    return `<div class="source-pill">${icon} ${platform}: ${count}</div>`;
  }).join('');
  container.appendChild(sourcesGrid);

  // Bağlantılı hesapları ayır (Discord dışındaki platformlar)
  const connections = sites.filter(s => s.leak_type === 'connection');
  const otherSites = sites.filter(s => s.leak_type !== 'connection');
  
  // Bağlantılı hesaplar varsa ayrı bölüm göster
  if (connections.length > 0) {
    const connSection = document.createElement('div');
    connSection.className = 'connections-section';
    connSection.innerHTML = `<div class="section-title connections-title">🔗 Bağlantılı Hesaplar (${connections.length})</div>`;
    
    const connGrid = document.createElement('div');
    connGrid.className = 'connections-grid';
    
    for (const c of connections) {
      const icon = getSiteIcon(c.site);
      const connCard = document.createElement('a');
      connCard.className = 'connection-card';
      connCard.href = c.url || '#';
      connCard.target = '_blank';
      connCard.innerHTML = `
        <div class="conn-icon">${icon}</div>
        <div class="conn-info">
          <div class="conn-site">${c.site}</div>
          <div class="conn-user">${c.username || '-'}</div>
        </div>
      `;
      connGrid.appendChild(connCard);
    }
    
    connSection.appendChild(connGrid);
    container.appendChild(connSection);
  }

  // Timeline / Kayıt kartları
  const timeline = document.createElement('div');
  timeline.className = 'osint-timeline';

  for (const s of otherSites) {
    const card = document.createElement('div');
    card.className = 'osint-leak-card';
    
    const siteIcon = getSiteIcon(s.site);
    const isGitHub = s.site === 'GitHub';
    const isDiscord = s.site === 'Discord';
    
    // Kart başlığı
    let cardHeader = `
      <div class="leak-header">
        <div class="leak-site">${siteIcon} ${s.site}</div>
        <div class="leak-date">${s.created_at ? formatDate(s.created_at) : 'Tarih bilinmiyor'}</div>
      </div>
    `;
    
    // Kart içeriği
    let cardBody = '<div class="leak-body">';
    
    if (s.leak_type === 'breach') {
      // HaveIBeenPwned Breach kartı
      cardBody += `
        <div class="leak-field">
          <span class="field-label">Breach Tarihi</span>
          <span class="field-value">${s.breach_date || 'Bilinmiyor'}</span>
        </div>
        <div class="leak-field">
          <span class="field-label">Açıklama</span>
          <span class="field-value bio">${s.description || '-'}</span>
        </div>
        ${s.data_classes ? `<div class="leak-field"><span class="field-label">Sızan Veriler</span><span class="field-value">${s.data_classes.join(', ')}</span></div>` : ''}
        ${s.is_sensitive ? '<div class="leak-badge danger">🚨 Hassas Veri</div>' : ''}
      `;
    } else if (s.leak_type === 'gravatar') {
      // Gravatar kartı
      cardBody += `
        ${s.avatar ? `<div class="leak-avatar"><img src="${s.avatar}" alt="Avatar"></div>` : ''}
        <div class="leak-field">
          <span class="field-label">Gravatar Kullanıcısı</span>
          <span class="field-value">${s.username || '-'}</span>
        </div>
        ${s.name ? `<div class="leak-field"><span class="field-label">İsim</span><span class="field-value">${s.name}</span></div>` : ''}
        ${s.profile_url ? `<div class="leak-field"><span class="field-label">Profil</span><span class="field-value"><a href="${s.profile_url}" target="_blank">🔗 Gravatar</a></span></div>` : ''}
        ${s.accounts && s.accounts.length > 0 ? `<div class="leak-field"><span class="field-label">Bağlı Hesaplar</span><span class="field-value">${s.accounts.map(a => a.shortname).join(', ')}</span></div>` : ''}
      `;
    } else if (s.leak_type === 'platform') {
      // Platform kartı (LinkedIn, Pinterest, TikTok, Twitch, vb.)
      cardBody += `
        <div class="leak-field">
          <span class="field-label">Kullanıcı Adı</span>
          <span class="field-value">${s.username || '-'}</span>
        </div>
        ${s.url ? `<div class="leak-field"><span class="field-label">Profil URL</span><span class="field-value"><a href="${s.url}" target="_blank">🔗 ${s.site}</a></span></div>` : ''}
        ${s.note ? `<div class="leak-field"><span class="field-label">Not</span><span class="field-value bio">${s.note}</span></div>` : ''}
        ${s.confidence ? `<div class="leak-stats"><span class="stat">🔍 Güven: ${s.confidence}</span></div>` : ''}
      `;
    } else if (s.leak_type === 'connection') {
      // Bağlantılı hesap kartı (Spotify, GitHub, Twitter, vb.)
      cardBody += `
        <div class="leak-field">
          <span class="field-label">Platform Kullanıcısı</span>
          <span class="field-value">${s.username || '-'}</span>
        </div>
        ${s.connection_id ? `<div class="leak-field"><span class="field-label">Platform ID</span><span class="field-value mono">${s.connection_id}</span></div>` : ''}
        ${s.url ? `<div class="leak-field"><span class="field-label">Profil</span><span class="field-value"><a href="${s.url}" target="_blank">🔗 ${s.site}</a></span></div>` : ''}
        ${s.source_discord ? `<div class="leak-stats"><span class="stat">📎 Discord: ${s.source_discord}</span></div>` : ''}
      `;
    } else if (isDiscord && s.discord_id) {
      // Discord detayları
      cardBody += `
        <div class="leak-field">
          <span class="field-label">Kullanıcı Adı</span>
          <span class="field-value">${s.username || '-'}</span>
        </div>
        <div class="leak-field">
          <span class="field-label">Discord ID</span>
          <span class="field-value mono">${s.discord_id}</span>
        </div>
        <div class="leak-field">
          <span class="field-label">Email</span>
          <span class="field-value">${s.email || data.query}</span>
        </div>
      `;
    } else if (isGitHub) {
      // GitHub detayları
      cardBody += `
        <div class="leak-field">
          <span class="field-label">GitHub Kullanıcısı</span>
          <span class="field-value"><a href="${s.url}" target="_blank">${s.username}</a></span>
        </div>
        ${s.name ? `<div class="leak-field"><span class="field-label">İsim</span><span class="field-value">${s.name}</span></div>` : ''}
        ${s.bio ? `<div class="leak-field"><span class="field-label">Bio</span><span class="field-value bio">${s.bio}</span></div>` : ''}
        ${s.location ? `<div class="leak-field"><span class="field-label">Konum</span><span class="field-value">📍 ${s.location}</span></div>` : ''}
        ${s.company ? `<div class="leak-field"><span class="field-label">Şirket</span><span class="field-value">🏢 ${s.company}</span></div>` : ''}
        <div class="leak-stats">
          ${s.public_repos ? `<span class="stat">📁 ${s.public_repos} Repo</span>` : ''}
          ${s.followers ? `<span class="stat">👥 ${s.followers} Takipçi</span>` : ''}
          ${s.following ? `<span class="stat">➡️ ${s.following} Takip</span>` : ''}
        </div>
      `;
    } else {
      // Diğer platformlar
      cardBody += `
        <div class="leak-field">
          <span class="field-label">Kullanıcı Adı</span>
          <span class="field-value">${s.username || '-'}</span>
        </div>
        ${s.discord_id ? `<div class="leak-field"><span class="field-label">Discord ID</span><span class="field-value mono">${s.discord_id}</span></div>` : ''}
      `;
    }
    
    cardBody += '</div>';
    
    card.innerHTML = cardHeader + cardBody;
    timeline.appendChild(card);
  }

  container.appendChild(timeline);
  return container;
}

// Tarih formatla
function formatDate(dateStr) {
  if (!dateStr) return 'Bilinmiyor';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('tr-TR', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

function getSiteIcon(site) {
  const s = (site || '').toLowerCase();
  if (s.includes('discord')) return '💬';
  if (s.includes('github')) return '🐙';
  if (s.includes('spotify')) return '🎵';
  if (s.includes('paypal')) return '💳';
  if (s.includes('youtube')) return '▶️';
  if (s.includes('twitch')) return '🎮';
  if (s.includes('twitter')) return '🐦';
  if (s.includes('steam')) return '🕹️';
  if (s.includes('tiktok')) return '📱';
  if (s.includes('reddit')) return '🔴';
  if (s.includes('instagram')) return '📸';
  if (s.includes('idsorgu')) return '🔍';
  if (s.includes('query')) return '📋';
  return '🗄️';
}

// ⚡ MODERN ARAMA - MODE BAZLI TIMEOUT (saniye cinsinden)
const SEARCH_TIMEOUTS = {
  id: 10000,      // 10 saniye
  email: 10000,   // 10 saniye
  ip: 10000,      // 10 saniye
  guild: 60000,   // 60 saniye - SQL dosyaları çok büyük
  guilds: 45000   // 45 saniye - sunucu listesi (SQL tarama uzun sürüyor)
};

async function doSearch() {
  setError(searchError, null);
  const cards = resultsArea.querySelectorAll('.user-card, .multi-results, .breach-container');
  cards.forEach(c => c.remove());
  hide(noResults);

  const query = String(searchInput.value ?? '').trim();
  if (!query && searchMode !== 'guilds') { setError(searchError, 'Arama değeri gir'); return; }

  // Modern Loading Göster
  showLoading();
  searchBtn.disabled = true;
  
  const timeoutMs = SEARCH_TIMEOUTS[searchMode] || 8000;
  // timeout
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error(`timeout:${timeoutMs}`)), timeoutMs)
  );

  try {
    let data;
    const searchPromise = (async () => {
      if (searchMode === 'id') {
        // Use consolidated endpoint
        return await api(`/api/search-all?discord_id=${encodeURIComponent(query)}`, { method: 'GET' });
      } else if (searchMode === 'email') {
        return await api(`/api/search-email?email=${encodeURIComponent(query)}`, { method: 'GET' });
      } else if (searchMode === 'ip') {
        return await api(`/api/search-ip?ip=${encodeURIComponent(query)}`, { method: 'GET' });
      } else if (searchMode === 'guild') {
        return await api(`/api/search-guild?guild_id=${encodeURIComponent(query)}`, { method: 'GET' });
      } else if (searchMode === 'guilds') {
        return await api('/api/guilds', { method: 'GET' });
      }
    })();
    
    // Race: API vs Timeout
    data = await Promise.race([searchPromise, timeoutPromise]);
    
    hideLoading();
    
    if (searchMode === 'id') {
      // Expect consolidated results under data.results
      const res = data?.results;
      let candidate = null;
      if (res) {
        if (Array.isArray(res.db) && res.db.length) candidate = res.db[0];
        if (!candidate && Array.isArray(res.txt) && res.txt.length) candidate = res.txt[0];
        if (!candidate && res.discord_id) candidate = res;
      } else {
        candidate = data?.result || null;
      }
      lastResult = candidate;
      if (!candidate) show(noResults);
      else { resultsArea.appendChild(createUserCard(candidate)); addToHistory(query, 'id'); }
    } else if (searchMode === 'email') {
      lastResult = data;
      if (!data?.sites?.length) show(noResults);
      else { resultsArea.appendChild(createEmailBreachView(data)); addToHistory(query, 'email'); }
    } else if (searchMode === 'ip') {
      lastResult = data;
      if (!data?.results?.length) show(noResults);
      else { resultsArea.appendChild(createMultiCard(data.results, query, 'ip')); addToHistory(query, 'ip'); }
    } else if (searchMode === 'guild') {
      lastResult = data;
      if (!data?.members?.length) show(noResults);
      else { resultsArea.appendChild(createGuildView(data)); addToHistory(query, 'guild'); }
    } else if (searchMode === 'guilds') {
      // Tüm sunucuları listele - hata olsa bile boş liste göster
      lastResult = data;
      if (data?.guilds?.length || data?.error) {
        resultsArea.appendChild(createGuildsListView(data));
        try { addToHistory('Tüm Sunucular', 'guilds'); } catch(e) {}
      } else {
        show(noResults);
      }
    }
  } catch (e) {
    hideLoading();
    if (String(e?.message) === 'unauthorized') { await checkAuth(); return; }
    const msg = String(e?.message || '');
    console.error('[doSearch] Hata:', e);

    // Premium gerekli - Discord'a yönlendir
    if (msg === 'premium_required') {
      setError(searchError, '');
      resultsArea.innerHTML = `
        <div class="premium-required">
          <div class="premium-icon">⭐</div>
          <h3>Premium Gerekli</h3>
          <p>Bu özelliği kullanmak için premium satın almalısınız.</p>
          <p class="premium-note">Discord ID sorgusu ücretsizdir (1 sorgu)</p>
          <a href="https://discord.gg/zagros" target="_blank" class="discord-btn">
            💬 discord.gg/zagros
          </a>
        </div>
      `;
    }
    else if (msg.startsWith('timeout:')) {
      const ms = Number(msg.split(':')[1] || 0);
      const sec = ms ? Math.round(ms / 1000) : 0;
      setError(searchError, `⏱️ Arama zaman aşımına uğradı (${sec || '?'}sn)`);
    }
    else if (searchMode === 'guilds') {
      setError(searchError, '⚠️ Sunucu listesi yüklenemedi. Tekrar deneyin.');
    }
    else if (searchMode === 'guild') {
      setError(searchError, '⚠️ Sunucu bilgileri alınamadı. Sunucu ID doğruluğunu kontrol edin.');
    }
    else setError(searchError, '❌ Arama başarısız: ' + msg);
  } finally { searchBtn.disabled = false; }
}

function createGuildsListView(data) {
  const container = document.createElement('div');
  container.className = 'guilds-list-container';

  // Hata durumu - yine de boş liste göster
  if (data.error && !data.guilds?.length) {
    container.innerHTML = `
      <div class="guilds-header">
        <div class="guilds-title">⚠️ Sunucular Yüklenemedi</div>
        <div class="guilds-subtitle">${data.message || 'Bir hata oluştu. Lütfen tekrar deneyin.'}</div>
      </div>
      <div style="text-align: center; padding: 40px;">
        <button class="search-btn" onclick="doSearch()">🔄 Yeniden Dene</button>
      </div>
    `;
    return container;
  }

  const guilds = data.guilds || [];
  const totalCount = data.count || guilds.length;
  const sourceLabels = {
    database: 'Admin/DB',
    directory: 'Sunucu Dizini',
    findcord: 'FindCord',
    widget: 'Discord Widget',
    disboard: 'Disboard',
    'disboard_tag': 'Disboard (Türk)',
    topgg: 'Top.gg',
    discordservers: 'DiscordServers',
    discadia: 'Discadia',
    'discadia_list': 'Discadia (Liste)',
    dcflow: 'DCFlow',
    'dcflow_leaderboard': 'DCFlow Leaderboard',
    cache: 'Önbellek',
    files: 'Arşiv',
    external_resolver: 'Dış Kaynak',
    multiple: 'Çoklu Kaynak'
  };

  // Premium Banner
  const premiumBanner = document.createElement('div');
  premiumBanner.className = 'premium-banner';
  premiumBanner.innerHTML = `
    <div class="premium-banner-icon">👑</div>
    <div class="premium-banner-content">
      <div class="premium-banner-title">Zagros Premium</div>
      <div class="premium-banner-text">Premium üyelik ile tüm sunucu verilerine, API erişimine ve özel özelliklere sahip olun. ID: 810571889936171028 (ceyn) ile iletişime geçin.</div>
    </div>
    <button class="premium-banner-btn" onclick="showToast('Premium bilgisi: Discord ID 810571889936171028 (ceyn)', 'info')">Premium Al</button>
  `;
  container.appendChild(premiumBanner);

  // Başlık
  const header = document.createElement('div');
  header.className = 'guilds-header';
  header.innerHTML = `
    <div class="guilds-title">🦁 Zagros Sunucu Veritabanı</div>
    <div class="guilds-subtitle">${totalCount} sunucu bulundu • İç kaynaklı veriler</div>
    ${data.cached ? '<div class="cache-badge">⚡ Önbellekten</div>' : ''}
    ${data.enrichment_rate_limited ? '<div class="rate-limit-badge">⏱️ Ek veri servisi beklemede</div>' : ''}
  `;
  container.appendChild(header);

  // Sunucu grid'i
  const grid = document.createElement('div');
  grid.className = 'guilds-grid';

  for (const g of guilds) {
    const card = document.createElement('div');
    card.className = 'guild-list-card';
    card.dataset.guildId = g.id;
    if (g.banner_url) {
      card.style.background = `linear-gradient(rgba(0,0,0,0.7), rgba(0,0,0,0.9)), url(${g.banner_url})`;
      card.style.backgroundSize = 'cover';
      card.style.backgroundPosition = 'center';
    }
    card.onclick = async () => {
      // Sunucu detayına git - Premium kontrolü (sadece free kullanıcıları kısıtla)
      if (!authData || authData.tier === 'free') {
        showToast('⭐ Sunucu detayları sadece premium kullanıcılar içindir. discord.gg/zagros adresinden premium satın alabilirsiniz.', 'warning');
        return;
      }
      
      showLoading();
      try {
        console.log(`[Guild Click] Sunucu ID: ${g.id}`);
        const data = await api(`/api/search-guild?guild_id=${encodeURIComponent(g.id)}`, { method: 'GET' });
        console.log(`[Guild Click] API yanıt:`, data);
        hideLoading();
        
        if (data.error) {
          showToast('⚠️ ' + (data.message || data.error), 'warning');
          return;
        }
        
        if (data.members && data.members.length > 0) {
          showToast(`✅ ${data.members.length} üye bulundu`, 'success');
          renderGuildDetailView(data);
        } else {
          showToast('ℹ️ Bu sunucuda henüz kayıtlı üye yok', 'info');
          renderGuildDetailView(data);
        }
      } catch (e) {
        hideLoading();
        console.error('[Guild Click] Hata:', e);
        showToast('❌ Sunucu arama hatası: ' + (e.message || 'Bağlantı hatası'), 'error');
      }
    };
    
    // Sunucu ismi: admin veya iç kaynaklardan gelen isim
    let displayName = g.name;
    const hasRealName = displayName && displayName !== 'Bilinmeyen Sunucu' && displayName.trim().length > 0;

    // Otomatik isim: İsim yoksa "Sunucu #ID" formatında
    const autoName = hasRealName ? displayName : `Sunucu #${g.id.slice(-6)}`;
    if (!hasRealName) displayName = autoName;
    // ID'nin ilk harfini alıp renkli kare içinde göster (Discord tarzı)
    const iconLetter = (g.name?.[0] || g.id.slice(-1)).toUpperCase();
    const iconColors = ['#5865F2', '#EB459E', '#57F287', '#FEE75C', '#ED4245', '#9B59B6', '#3498DB', '#E91E63'];
    const colorIndex = g.id.split('').reduce((a,b)=>a+b.charCodeAt(0),0) % iconColors.length;
    const iconBg = iconColors[colorIndex];
    
    // Icon URL varsa kullan, yoksa otomatik harf ikonu
    let iconHtml;
    if (g.icon_url) {
      iconHtml = `<img src="${g.icon_url}" class="guild-card-icon-img" onerror="this.outerHTML='<div class=\'guild-card-icon-auto\' style=\'background:${iconBg}\'>${iconLetter}</div>'" />`;
    } else {
      iconHtml = `<div class="guild-card-icon-auto" style="background:${iconBg}">${iconLetter}</div>`;
    }
    
    // ID'yi kısalt göster (son 10 karakter daha kullanışlı)
    const shortId = g.id.length > 10 ? g.id.slice(0,4) + '...' + g.id.slice(-6) : g.id;

    // Sample members avatarları (ilk 3 üye)
    let membersHtml = '';
    if (g.sample_members && g.sample_members.length > 0) {
      const avatars = g.sample_members.slice(0, 3).map(m => {
        const avatarUrl = m.avatar_url || (m.avatar ? `https://cdn.discordapp.com/avatars/${m.id}/${m.avatar}.png?size=64` : null);
        const defaultIndex = m.id ? parseInt(m.id) % 5 : 0;
        const fallbackUrl = `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`;
        const initial = (m.username || 'U')[0].toUpperCase();
        return avatarUrl 
          ? `<img src="${avatarUrl}" class="member-avatar" onerror="this.src='${fallbackUrl}'" title="${m.username || 'İsimsiz'}" alt="${initial}" loading="lazy">`
          : `<div class="member-avatar-placeholder" title="${m.username || 'İsimsiz'}">${initial}</div>`;
      }).join('');
      
      const memberNames = g.sample_members.slice(0, 2).map(m => m.username || 'İsimsiz').join(', ');
      const moreCount = g.sample_members.length > 2 ? ` +${g.sample_members.length - 2}` : '';
      
      membersHtml = `
        <div class="guild-card-members">
          <div class="member-avatars">${avatars}</div>
          <span class="member-names">${memberNames}${moreCount}</span>
        </div>
      `;
    }
    
    // Banner varsa göster (kart üstünde)
    let bannerHtml = '';
    if (g.banner_url) {
      bannerHtml = `<div class="guild-card-banner" style="background-image:url('${g.banner_url}')"></div>`;
    }
    
    const descText = g.description ? escapeHtml(g.description.length > 160 ? `${g.description.slice(0, 160)}…` : g.description) : '';
    const descHtml = descText ? `<div class="guild-card-desc">${descText}</div>` : '';
    const chipItems = [];
    if (g.metadata_source && sourceLabels[g.metadata_source]) {
      chipItems.push(`<span class="guild-card-chip source">${sourceLabels[g.metadata_source]}</span>`);
    }
    if (g.metadata_updated_at) {
      const updatedStr = new Date(g.metadata_updated_at).toLocaleDateString('tr-TR');
      chipItems.push(`<span class="guild-card-chip">🕓 ${updatedStr}</span>`);
    }
    const chipsHtml = chipItems.length ? `<div class="guild-card-chips">${chipItems.join('')}</div>` : '';

    // ID kopyalama butonu
    const copyIdHtml = `<button class="copy-id-btn" onclick="event.stopPropagation(); navigator.clipboard.writeText('${g.id}'); showToast('ID kopyalandı: ${g.id}', 'success');" title="ID Kopyala">📋</button>`;

    card.innerHTML = `
      ${bannerHtml}
      <div class="guild-card-header">
        ${iconHtml}
        <div class="guild-card-title-wrap">
          <div class="guild-card-name">${displayName}</div>
          ${!hasRealName ? `<div class="guild-id-hint">🔍 ${shortId}</div>` : ''}
        </div>
        ${copyIdHtml}
      </div>
      <div class="guild-card-body">
        ${membersHtml}
        ${descHtml}
        <div class="guild-card-meta">
          <span class="guild-card-count">👥 ${g.member_count?.toLocaleString('tr-TR') || 0} kayıt</span>
          <span class="guild-card-source">📁 ${g.source === 'files' ? 'Arşiv' : 'Veritabanı'}</span>
        </div>
        ${chipsHtml}
      </div>
      <div class="guild-card-arrow">→</div>
    `;
    grid.appendChild(card);
  }

  container.appendChild(grid);

  return container;
}

function renderGuildDetailView(data) {
  const container = document.createElement('div');
  container.className = 'guild-detail-container';

  const guild = data.guild || {};
  const members = data.members || [];
  const locationSummary = data.location_summary || [];
  const metadataSourceLabels = {
    database: 'Admin/DB',
    directory: 'Sunucu Dizini',
    findcord: 'FindCord',
    widget: 'Discord Widget',
    disboard: 'Disboard',
    'disboard_tag': 'Disboard (Türk)',
    topgg: 'Top.gg',
    discordservers: 'DiscordServers',
    discadia: 'Discadia',
    'discadia_list': 'Discadia (Liste)',
    dcflow: 'DCFlow',
    'dcflow_leaderboard': 'DCFlow Leaderboard',
    cache: 'Önbellek',
    files: 'Arşiv',
    multiple: 'Çoklu Kaynak'
  };

  const membersWithLocation = members.filter(m => m.ip_location && m.ip_location.lat && m.ip_location.lon);

  const headerCard = document.createElement('div');
  headerCard.className = 'guild-detail-header';
  
  // Banner arkaplan
  if (guild.banner_url) {
    headerCard.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.7), rgba(30,30,46,0.95)), url(${guild.banner_url})`;
    headerCard.style.backgroundSize = 'cover';
    headerCard.style.backgroundPosition = 'center';
  }

  let iconUrl = guild.icon_url || guild.icon;
  if (!iconUrl && guild.id) {
    const hash = guild.id.slice(-4);
    iconUrl = `https://cdn.discordapp.com/embed/avatars/${parseInt(hash, 16) % 5}.png`;
  }

  // Kopyalama fonksiyonları
  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text).then(() => showToast(`${label} kopyalandı`, 'success'));
  };

  const iconHtml = iconUrl 
    ? `<img class="guild-detail-icon" src="${iconUrl}" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'" alt="" onclick="window.open('${iconUrl}', '_blank')" title="PP'yi görüntülemek için tıkla (sağ tık ile kopyala)">`
    : `<span class="guild-detail-icon-placeholder">🗄️</span>`;

  // Hızlı kopyalama butonları
  const quickCopyButtons = [];
  if (iconUrl) {
    quickCopyButtons.push(`<button class="quick-copy-btn" onclick="navigator.clipboard.writeText('${iconUrl}'); showToast('PP URL kopyalandı', 'success');" title="PP URL Kopyala">🖼️ PP Kopyala</button>`);
  }
  if (guild.banner_url) {
    quickCopyButtons.push(`<button class="quick-copy-btn" onclick="navigator.clipboard.writeText('${guild.banner_url}'); showToast('Banner URL kopyalandı', 'success');" title="Banner URL Kopyala">🎨 Banner Kopyala</button>`);
  }
  quickCopyButtons.push(`<button class="quick-copy-btn" onclick="navigator.clipboard.writeText('${guild.id}'); showToast('ID kopyalandı: ${guild.id}', 'success');" title="ID Kopyala">📋 ID Kopyala</button>`);

  const metaItems = [
    `<span class="guild-detail-id">🆔 ${guild.id || '-'}</span>`,
    `<span class="guild-detail-count">👥 ${members.length} üye</span>`,
    membersWithLocation.length > 0 ? `<span class="guild-detail-location">📍 ${membersWithLocation.length} konum</span>` : '',
    locationSummary.length > 0 ? `<span class="guild-detail-cities">🌍 ${locationSummary.length} şehir</span>` : '',
    guild.premium_tier ? `<span class="guild-detail-boost">⚡ Boost Seviye ${guild.premium_tier}</span>` : ''
  ].filter(Boolean);

  if (guild.metadata_source) {
    const label = metadataSourceLabels[guild.metadata_source] || guild.metadata_source;
    metaItems.push(`<span class="guild-detail-meta-source">📌 ${label}</span>`);
  }
  if (guild.metadata_updated_at) {
    metaItems.push(`<span class="guild-detail-meta-source">🕓 ${new Date(guild.metadata_updated_at).toLocaleDateString('tr-TR')}</span>`);
  }

  headerCard.innerHTML = `
    <div class="guild-header-top">
      <div class="guild-back-btn" onclick="goBackToGuilds()">← Sunuculara Dön</div>
    </div>
    <div class="guild-header-content">
      <div class="guild-detail-icon-section">${iconHtml}</div>
      <div class="guild-detail-info">
        <div class="guild-detail-name">${(guild.name && guild.name !== 'Bilinmeyen Sunucu') ? guild.name : (guild.id ? `Sunucu #${String(guild.id).slice(-6)}` : 'Sunucu')}</div>
        ${guild.owner_id ? `<div class="guild-owner">👑 Sahip: ${guild.owner_id}</div>` : ''}
        <div class="guild-detail-meta">${metaItems.join('')}</div>
        ${guild.description ? `<div class="guild-detail-description">${escapeHtml(guild.description)}</div>` : ''}
        ${guild.features?.length > 0 ? `<div class="guild-features">${guild.features.map(f => `<span class="feature-badge">${f}</span>`).join('')}</div>` : ''}
        <div class="quick-copy-bar">${quickCopyButtons.join('')}</div>
      </div>
    </div>
  `;
  
  // Geri dönüş fonksiyonunu global yap
  window.goBackToGuilds = () => {
    searchMode = 'guilds';
    updateModeUI();
    doSearch();
  };
  
  container.appendChild(headerCard);

  // 📊 KONUM ÖZETİ (Eğer varsa)
  if (locationSummary.length > 0) {
    const locationSection = document.createElement('div');
    locationSection.className = 'location-summary-section';
    
    const topCities = locationSummary.slice(0, 6);
    const citiesHtml = topCities.map((loc, idx) => `
      <div class="location-chip" style="--rank: ${idx}">
        <div class="location-flag">${getCountryEmoji(loc.country)}</div>
        <div class="location-info">
          <div class="location-city">${loc.city}</div>
          <div class="location-country">${loc.country}</div>
        </div>
        <div class="location-count">${loc.count}</div>
      </div>
    `).join('');
    
    locationSection.innerHTML = `
      <div class="section-title">🌍 Konum Dağılımı (${locationSummary.length} farklı şehir)</div>
      <div class="location-chips">${citiesHtml}</div>
    `;
    container.appendChild(locationSection);
  }

  // 🗺️ TAM EKRAN HARITA
  if (membersWithLocation.length > 0) {
    const mapSection = document.createElement('div');
    mapSection.className = 'guild-map-section expanded';
    mapSection.innerHTML = `
      <div class="map-header">
        <div class="section-title">📍 IP Konum Haritası</div>
        <div class="map-stats">
          <span>${membersWithLocation.length} marker</span>
          <span>${data.location_count || locationSummary.length} lokasyon</span>
        </div>
      </div>
      <div id="guild-map" class="guild-map expanded"></div>
    `;
    container.appendChild(mapSection);
    
    // Haritayı initialize et
    setTimeout(() => initGuildMap(membersWithLocation, locationSummary), 100);
  }

  // � Son Mesajlar (FindCord'dan)
  if (guild.sample_messages && guild.sample_messages.length > 0) {
    const messagesSection = document.createElement('div');
    messagesSection.className = 'messages-section';
    const messagesHtml = guild.sample_messages.slice(0, 10).map(m => {
      const guildName = m.guild_name || 'Bilinmeyen Sunucu';
      const channelName = m.channel_name || 'Bilinmeyen Kanal';
      const timestamp = m.timestamp ? new Date(m.timestamp).toLocaleDateString('tr-TR') : '';
      return `<div class="message-item"><div class="message-meta">${guildName} • ${channelName}${timestamp ? ' • ' + timestamp : ''}</div><div class="message-content">${m.content || 'İçerik yok'}</div></div>`;
    }).join('');
    messagesSection.innerHTML = `<div class="section-title">💬 Son Mesajlar (${guild.sample_messages.length})</div><div class="messages-list">${messagesHtml}</div>`;
    container.appendChild(messagesSection);
  }

  // 🎤 Ses Arkadaşları (FindCord'dan)
  if (guild.voice_friends && guild.voice_friends.length > 0) {
    const voiceFriendsSection = document.createElement('div');
    voiceFriendsSection.className = 'voice-friends-section';
    const voiceFriendsHtml = guild.voice_friends.slice(0, 10).map(f => {
      const lastConnected = f.last_connected ? new Date(f.last_connected).toLocaleDateString('tr-TR') : 'Bilinmiyor';
      const totalTime = f.total_time || 'Bilinmiyor';
      return `<div class="voice-friend-item"><div class="voice-friend-name">${f.username || f.discord_id}</div><div class="voice-friend-meta">Son: ${lastConnected} • Süre: ${totalTime}</div></div>`;
    }).join('');
    voiceFriendsSection.innerHTML = `<div class="section-title">🎤 Ses Arkadaşları (${guild.voice_friends.length})</div><div class="voice-friends-list">${voiceFriendsHtml}</div>`;
    container.appendChild(voiceFriendsSection);
  }

  // �👥 ÜYE LİSTESİ (Gelişmiş)
  const tableSection = document.createElement('div');
  tableSection.className = 'guild-members-table-section';
  
  // Filtreleme ve arama
  tableSection.innerHTML = `
    <div class="members-header">
      <div class="section-title">👥 Üye Listesi (${members.length})</div>
      <div class="members-search">
        <input type="text" id="memberSearch" placeholder="🔍 Üye ara..." onkeyup="filterMembers()">
      </div>
    </div>
    <div class="table-scroll-container">
      <table class="guild-members-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Profil</th>
            <th>Kullanıcı</th>
            <th>Discord ID</th>
            <th>Email</th>
            <th>IP / Konum</th>
            <th>Connections</th>
          </tr>
        </thead>
        <tbody id="membersTableBody"></tbody>
      </table>
    </div>
  `;
  container.appendChild(tableSection);

  const tbody = tableSection.querySelector('#membersTableBody');

  // Üye filtreleme fonksiyonu
  window.filterMembers = () => {
    const searchTerm = document.getElementById('memberSearch')?.value?.toLowerCase() || '';
    const rows = tbody.querySelectorAll('tr');
    rows.forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(searchTerm) ? '' : 'none';
    });
  };

  // Üyeleri tabloya ekle
  members.forEach((m, index) => {
    const tr = document.createElement('tr');
    tr.className = 'member-row';
    tr.dataset.discordId = m.discord_id;
    
    // Avatar
    const avatarUrl = m.avatar_url || `https://cdn.discordapp.com/embed/avatars/${parseInt(m.discord_id) % 5}.png`;
    const avatarHtml = `<img class="table-avatar" src="${avatarUrl}" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'" alt="">`;
    
    // İsim ve rozetler
    const displayName = m.username || m.global_name || 'İsimsiz';
    const badgesHtml = (m.badges || []).map(b => `<span class="user-badge" title="${b}">${getBadgeEmoji(b)}</span>`).join('');
    
    // Bio (varsa)
    const bioHtml = m.bio ? `<div class="user-bio">${m.bio.substring(0, 50)}${m.bio.length > 50 ? '...' : ''}</div>` : '';
    
    // Konum bilgisi
    const loc = m.ip_location;
    const locationHtml = loc 
      ? `<div class="location-badge">
          <span class="loc-flag">${getCountryEmoji(loc.country)}</span>
          <span class="loc-city">${loc.city}</span>
          <div class="loc-coords">${loc.lat?.toFixed(2)}, ${loc.lon?.toFixed(2)}</div>
        </div>`
      : (m.ip ? `<div class="ip-only">📍 ${m.ip}</div>` : '-');
    
    // Connections
    const connections = m.connections || m.connection_types || [];
    const connectionsHtml = connections.length > 0
      ? connections.slice(0, 4).map(c => {
          const type = typeof c === 'string' ? c : c.type;
          return `<span class="connection-icon" title="${type}">${getConnectionIcon(type)}</span>`;
        }).join('') + (connections.length > 4 ? `<span class="more-connections">+${connections.length - 4}</span>` : '')
      : '-';
    
    tr.innerHTML = `
      <td class="row-num">${index + 1}</td>
      <td class="avatar-cell">${avatarHtml}</td>
      <td class="user-cell">
        <div class="user-name">${displayName} ${badgesHtml}</div>
        ${m.global_name && m.username !== m.global_name ? `<div class="user-global">${m.global_name}</div>` : ''}
        ${bioHtml}
        ${m.pronouns ? `<div class="pronouns">${m.pronouns}</div>` : ''}
      </td>
      <td class="id-cell">
        <code>${m.discord_id || '-'}</code>
        <button class="copy-btn" onclick="copyToClipboard('${m.discord_id}')">📋</button>
      </td>
      <td class="email-cell">
        ${m.email ? `<span class="email">${m.email}</span><button class="copy-btn" onclick="copyToClipboard('${m.email}')">📋</button>` : '-'}
      </td>
      <td class="location-cell">${locationHtml}</td>
      <td class="connections-cell">${connectionsHtml}</td>
    `;
    
    tbody.appendChild(tr);
  });

  // Kopyalama fonksiyonu
  window.copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      showToast('📋 Kopyalandı: ' + text.substring(0, 20) + (text.length > 20 ? '...' : ''));
    });
  };

  resultsArea.innerHTML = '';
  resultsArea.appendChild(container);
  hide(noResults);
}

// Ülke emoji helper
function getCountryEmoji(countryCode) {
  if (!countryCode) return '🌍';
  const code = countryCode.toUpperCase();
  const flags = {
    'TR': '🇹🇷', 'US': '🇺🇸', 'GB': '🇬🇧', 'DE': '🇩🇪', 'FR': '🇫🇷', 'IT': '🇮🇹', 'ES': '🇪🇸',
    'NL': '🇳🇱', 'BE': '🇧🇪', 'CH': '🇨🇭', 'AT': '🇦🇹', 'SE': '🇸🇪', 'NO': '🇳🇴', 'DK': '🇩🇰',
    'FI': '🇫🇮', 'PL': '🇵🇱', 'CZ': '🇨🇿', 'HU': '🇭🇺', 'RO': '🇷🇴', 'BG': '🇧🇬', 'HR': '🇭🇷',
    'GR': '🇬🇷', 'PT': '🇵🇹', 'IE': '🇮🇪', 'UA': '🇺🇦', 'RU': '🇷🇺', 'CN': '🇨🇳', 'JP': '🇯🇵',
    'KR': '🇰🇷', 'IN': '🇮🇳', 'BR': '🇧🇷', 'CA': '🇨🇦', 'AU': '🇦🇺', 'MX': '🇲🇽', 'AR': '🇦🇷',
    'ZA': '🇿🇦', 'EG': '🇪🇬', 'SA': '🇸🇦', 'AE': '🇦🇪', 'IL': '🇮🇱'
  };
  return flags[code] || '🌍';
}

// Rozet emoji helper
function getBadgeEmoji(badge) {
  const badges = {
    'staff': '👨‍💼', 'partner': '🤝', 'hypesquad': '🏠', 'bug_hunter': '🐛',
    'hypesquad_bravery': '🦅', 'hypesquad_brilliance': '🌟', 'hypesquad_balance': '☯️',
    'early_supporter': '💎', 'verified_bot': '🤖', 'verified_developer': '👨‍💻'
  };
  return badges[badge] || '🏷️';
}

// Connection tipi için icon
function getConnectionIcon(type) {
  const icons = {
    'steam': '🎮',
    'twitch': '📺',
    'youtube': '▶️',
    'spotify': '🎵',
    'twitter': '🐦',
    'x': '𝕏',
    'reddit': '🔴',
    'github': '💻',
    'paypal': '💰',
    'ebay': '🛒',
    'tiktok': '📱',
    'instagram': '📸',
    'facebook': '👤',
    'domain': '🌐',
    'crunchyroll': '🍿'
  };
  return icons[type?.toLowerCase()] || '🔗';
}

// Sunucu üyeleri görünümü (eski - kullanılmıyor)
function createGuildView(data) {
  const container = document.createElement('div');
  container.className = 'guild-container';

  const guild = data.guild;
  const members = data.members || [];

  // IP konumu olan üyeleri bul (harita için)
  const membersWithLocation = members.filter(m => m.ip_location && m.ip_location.lat && m.ip_location.lon);

  // Sunucu başlık kartı
  const headerCard = document.createElement('div');
  headerCard.className = 'guild-header-card';
  
  // Discord CDN URL'si oluştur
  let iconUrl = guild.icon;
  if (!iconUrl && guild.id) {
    iconUrl = `https://cdn.discordapp.com/icons/${guild.id}/default.png?size=128`;
  }
  
  let bannerUrl = guild.banner;
  if (!bannerUrl && guild.id) {
    bannerUrl = `https://cdn.discordapp.com/banners/${guild.id}/default.png?size=512`;
  }
  
  const hasRealName = guild.name && guild.name !== 'Bilinmeyen Sunucu';
  
  let iconHtml = '';
  if (iconUrl) {
    iconHtml = `<img class="guild-icon" src="${iconUrl}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" alt="" />
                <span class="guild-icon-placeholder" style="display:none">${hasRealName ? '🏰' : '🗄️'}</span>`;
  } else {
    iconHtml = `<span class="guild-icon-placeholder">${hasRealName ? '🏰' : '🗄️'}</span>`;
  }
  
  const displayName = guild.name || `Sunucu #${guild.id.substring(0, 10)}...`;
  
  headerCard.innerHTML = `
    <div class="guild-icon-section">${iconHtml}</div>
    <div class="guild-info-section">
      <div class="guild-name">${displayName}</div>
      <div class="guild-meta">
        <span class="guild-id">ID: ${guild.id || '-'}</span>
        <span class="guild-count">👥 ${members.length} üye bulundu</span>
        ${membersWithLocation.length > 0 ? `<span class="guild-location-count">📍 ${membersWithLocation.length} konum</span>` : ''}
      </div>
      ${bannerUrl ? `<div class="guild-banner" style="background-image: url(${bannerUrl})"></div>` : ''}
    </div>
  `;
  container.appendChild(headerCard);

  // 🗺️ HARITA BÖLÜMÜ (IP konumu olan üyeler için)
  if (membersWithLocation.length > 0) {
    const mapSection = document.createElement('div');
    mapSection.className = 'guild-map-section';
    mapSection.innerHTML = `
      <div class="section-title">📍 IP Konum Haritası (${membersWithLocation.length} üye)</div>
      <div id="guild-map" class="guild-map"></div>
      <div class="map-legend">
        <span class="legend-item"><span class="marker-dot blue"></span> Üye Konumu</span>
        <span class="legend-item">🖱️ Tıklayın: Mahalle/Sokak detayı</span>
      </div>
    `;
    container.appendChild(mapSection);
    
    // Haritayı sonradan initialize et (DOM'a eklendikten sonra)
    setTimeout(() => initGuildMap(membersWithLocation), 100);
  }

  // Üye listesi
  const memberSection = document.createElement('div');
  memberSection.className = 'guild-members-section';
  memberSection.innerHTML = `<div class="section-title">Sunucu Üyeleri (${members.length})</div>`;

  const memberGrid = document.createElement('div');
  memberGrid.className = 'guild-members-grid';

  for (const m of members) {
    const memberCard = document.createElement('div');
    memberCard.className = 'guild-member-card';
    
    // Avatar - önce avatar_url (backend'den gelen), sonra avatar_hash
    let avatarUrl = m.avatar_url || m.avatar;
    let avatarHtml = '';
    if (avatarUrl) {
      avatarHtml = `<img class="member-avatar" src="${avatarUrl}" onerror="this.outerHTML='<div class=\'member-avatar-placeholder\'>${(m.username || 'U')[0].toUpperCase()}</div>'" alt="">`;
    } else {
      avatarHtml = `<div class="member-avatar-placeholder">${(m.username || 'U')[0].toUpperCase()}</div>`;
    }
    
    // Email ve IP bilgilerini vurgula + IP Konum detayı
    const hasData = m.email || m.ip;
    const loc = m.ip_location;
    const locationInfo = loc ? `
      <div class="member-location-info">
        <div class="location-badge">
          🌍 ${loc.city}${loc.district ? ', ' + loc.district : ''}, ${loc.country || loc.countryCode || 'N/A'}
          ${loc.lat && loc.lon ? `<span class="coords">(${loc.lat.toFixed(4)}, ${loc.lon.toFixed(4)})</span>` : ''}
        </div>
        ${loc.isp ? `<div class="isp-info">🌐 ${loc.isp}</div>` : ''}
      </div>
    ` : '';
    
    const dataSection = hasData ? `
      <div class="member-data-section">
        ${m.email ? `<div class="member-data-row email-row"><span class="data-label">📧 Email:</span><span class="data-value">${m.email}</span>${copyBtn(m.email)}<button class="osint-btn" onclick="showEmailOSINT('${m.email.replace(/'/g, "\\'")}')" title="OSINT Araştır">🔍</button></div>` : ''}
        ${m.ip ? `<div class="member-data-row ip-row"><span class="data-label">📍 IP:</span><span class="data-value mono">${m.ip}</span>${copyBtn(m.ip)}</div>` : ''}
        ${locationInfo}
      </div>
    ` : '<div class="member-no-data">Veri bulunamadı</div>';
    
    memberCard.innerHTML = `
      <div class="member-avatar-section">${avatarHtml}</div>
      <div class="member-info">
        <div class="member-username">${m.username || 'İsimsiz Kullanıcı'}</div>
        <div class="member-id mono">🆔 ${m.discord_id || '-'}</div>
        ${dataSection}
        <div class="member-source">📁 ${m.source || 'SQL'}</div>
      </div>
    `;
    memberGrid.appendChild(memberCard);
  }

  memberSection.appendChild(memberGrid);
  container.appendChild(memberSection);

  return container;
}

// 🔍 EMAIL OSINT - IntelX tarzı breach araştırması
async function showEmailOSINT(email) {
  showLoading();

  try {
    const data = await api(`/api/email-osint?email=${encodeURIComponent(email)}`, { method: 'GET' });
    hideLoading();

    if (data.error) {
      showToast('⚠️ OSINT Hatası: ' + (data.message || data.error), 'warning');
      return;
    }

    // OSINT raporu modal'ı oluştur
    const modal = document.createElement('div');
    modal.className = 'osint-modal-overlay';

    // Risk seviyesi badge
    const riskColors = {
      critical: { bg: '#ff4444', text: '#fff', label: 'KRİTİK RİSK' },
      high: { bg: '#ff8800', text: '#fff', label: 'YÜKSEK RİSK' },
      medium: { bg: '#ffcc00', text: '#000', label: 'ORTA RİSK' },
      low: { bg: '#88cc00', text: '#fff', label: 'DÜŞÜK RİSK' },
      clean: { bg: '#00cc66', text: '#fff', label: 'TEMİZ' },
      unknown: { bg: '#888888', text: '#fff', label: 'BİLİNMEYEN' }
    };
    const risk = riskColors[data.summary.risk_level] || riskColors.unknown;

    // Breach tablosu
    const breachTableRows = data.breaches?.length > 0
      ? data.breaches.map(b => `
        <tr class="breach-row ${b.is_sensitive ? 'sensitive' : ''}">
          <td class="site-cell">
            <div class="site-name">${b.site}</div>
            <div class="site-domain">${b.domain || ''}</div>
          </td>
          <td class="date-cell">${b.breach_date || 'Bilinmiyor'}</td>
          <td class="data-cell">
            ${b.data_classes?.map(dc => `<span class="data-tag">${dc}</span>`).join('') || '-'}
          </td>
          <td class="badges-cell">
            ${b.is_verified ? '<span class="badge verified">✓ Doğrulanmış</span>' : ''}
            ${b.is_sensitive ? '<span class="badge sensitive">⚠️ Hassas</span>' : ''}
            ${b.pwn_count ? `<span class="badge count">👤 ${b.pwn_count.toLocaleString()}</span>` : ''}
          </td>
        </tr>
      `).join('')
      : '<tr><td colspan="4" class="no-breach">✅ Bu email hiçbir veri ihlalinde bulunamadı</td></tr>';

    // Reputation bilgileri
    const rep = data.reputation;
    const repSection = rep ? `
      <div class="osint-reputation-section">
        <h4>🛡️ Email Reputation (EmailRep.io)</h4>
        <div class="rep-grid">
          <div class="rep-item ${rep.suspicious ? 'bad' : 'good'}">
            <span class="rep-label">Şüpheli:</span>
            <span class="rep-value">${rep.suspicious ? '⚠️ Evet' : '✅ Hayır'}</span>
          </div>
          <div class="rep-item ${rep.blacklisted ? 'bad' : 'good'}">
            <span class="rep-label">Blacklist:</span>
            <span class="rep-value">${rep.blacklisted ? '❌ Evet' : '✅ Hayır'}</span>
          </div>
          <div class="rep-item ${rep.credentials_leaked ? 'bad' : 'good'}">
            <span class="rep-label">Credential Leak:</span>
            <span class="rep-value">${rep.credentials_leaked ? '⚠️ Evet' : '✅ Hayır'}</span>
          </div>
          <div class="rep-item ${rep.spam ? 'bad' : 'good'}">
            <span class="rep-label">Spam:</span>
            <span class="rep-value">${rep.spam ? '❌ Evet' : '✅ Hayır'}</span>
          </div>
          <div class="rep-item ${rep.disposable ? 'bad' : 'good'}">
            <span class="rep-label">Tek Kullanımlık:</span>
            <span class="rep-value">${rep.disposable ? '⚠️ Evet' : '✅ Hayır'}</span>
          </div>
          <div class="rep-item ${rep.deliverable ? 'good' : 'bad'}">
            <span class="rep-label">Teslim Edilebilir:</span>
            <span class="rep-value">${rep.deliverable ? '✅ Evet' : '❌ Hayır'}</span>
          </div>
        </div>
        <div class="rep-dates">
          ${rep.first_seen ? `<span>İlk görülme: ${rep.first_seen}</span>` : ''}
          ${rep.last_seen ? `<span>Son görülme: ${rep.last_seen}</span>` : ''}
          ${rep.references ? `<span>Referanslar: ${rep.references}</span>` : ''}
        </div>
      </div>
    ` : '';

    // Summary stats
    const statsSection = data.summary ? `
      <div class="osint-stats">
        <div class="stat-box">
          <span class="stat-number">${data.summary.total_breaches || 0}</span>
          <span class="stat-label">Toplam Breach</span>
        </div>
        <div class="stat-box ${data.summary.sensitive_breaches > 0 ? 'warning' : ''}">
          <span class="stat-number">${data.summary.sensitive_breaches || 0}</span>
          <span class="stat-label">Hassas Breach</span>
        </div>
        <div class="stat-box">
          <span class="stat-number">${data.summary.data_types_exposed?.length || 0}</span>
          <span class="stat-label">Veri Tipi</span>
        </div>
        ${data.summary.first_breach ? `
        <div class="stat-box">
          <span class="stat-date">${data.summary.first_breach}</span>
          <span class="stat-label">İlk İhlal</span>
        </div>
        ` : ''}
      </div>
    ` : '';

    modal.innerHTML = `
      <div class="osint-modal">
        <div class="osint-header">
          <h3>🔍 Email OSINT Raporu</h3>
          <span class="osint-email">${email}</span>
          <span class="risk-badge" style="background:${risk.bg};color:${risk.text}">${risk.label}</span>
          <button class="osint-close" onclick="this.closest('.osint-modal-overlay').remove()">✕</button>
        </div>
        <div class="osint-body">
          ${statsSection}
          ${repSection}
          <div class="osint-breaches-section">
            <h4>💥 Veri İhlalleri (${data.breaches?.length || 0})</h4>
            <table class="breach-table">
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Tarih</th>
                  <th>Çalınan Veriler</th>
                  <th>Detaylar</th>
                </tr>
              </thead>
              <tbody>
                ${breachTableRows}
              </tbody>
            </table>
          </div>
          <div class="osint-sources">
            <span>Kaynaklar: ${data.sources?.join(', ') || 'Veri yok'}</span>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Modal dışına tıklayınca kapat
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

  } catch (e) {
    hideLoading();
    console.error('[EmailOSINT] Hata:', e);
    showToast('❌ OSINT araştırması başarısız: ' + (e.message || 'Hata'), 'error');
  }
}

// 🗺️ HARITA FONKSİYONU - Guild üyelerinin IP konumlarını göster (GELİŞMİŞ)
function initGuildMap(membersWithLocation, locationSummary = []) {
  const mapContainer = document.getElementById('guild-map');
  if (!mapContainer || !window.L) {
    console.error('[Map] Leaflet yüklenmemiş veya container bulunamadı');
    return;
  }

  // Önceki haritayı temizle
  mapContainer.innerHTML = '';

  // Geçerli konumları filtrele
  const validLocations = membersWithLocation.filter(m =>
    m.ip_location &&
    typeof m.ip_location.lat === 'number' &&
    typeof m.ip_location.lon === 'number' &&
    !isNaN(m.ip_location.lat) &&
    !isNaN(m.ip_location.lon)
  );

  if (validLocations.length === 0) {
    console.warn('[Map] Geçerli konum bulunamadı');
    mapContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: #666;">📍 Konum bilgisi bulunamadı</div>';
    return;
  }

  console.log(`[Map] ${validLocations.length} geçerli konum gösteriliyor`);

  // Tüm konumların ortalamasını merkez olarak al
  const avgLat = validLocations.reduce((sum, m) => sum + m.ip_location.lat, 0) / validLocations.length;
  const avgLon = validLocations.reduce((sum, m) => sum + m.ip_location.lon, 0) / validLocations.length;
  
  const map = L.map('guild-map').setView([avgLat, avgLon], 5);

  // Dark mode tile layer
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 19,
    subdomains: 'abcd'
  }).addTo(map);

  // Marker cluster grubu
  const markers = [];
  const locationGroups = {};

  // Aynı konumdaki üyeleri grupla
  validLocations.forEach(m => {
    const loc = m.ip_location;
    const key = `${loc.lat.toFixed(3)},${loc.lon.toFixed(3)}`;
    if (!locationGroups[key]) {
      locationGroups[key] = [];
    }
    locationGroups[key].push(m);
  });

  // Her grup için marker oluştur
  Object.entries(locationGroups).forEach(([key, groupMembers]) => {
    const firstMember = groupMembers[0];
    const loc = firstMember.ip_location;
    
    // Grup avatarları
    const avatarUrls = groupMembers.slice(0, 3).map(m => {
      return m.avatar_url || `https://cdn.discordapp.com/embed/avatars/${parseInt(m.discord_id) % 5}.png`;
    });

    // Popup içeriği
    let popupContent = `
      <div class="map-popup">
        <div class="popup-location-header">
          <span class="loc-flag-big">${getCountryEmoji(loc.country)}</span>
          <div>
            <div class="popup-city">${loc.city || 'Bilinmiyor'}</div>
            <div class="popup-country">${loc.country || loc.countryCode || '?'}</div>
          </div>
        </div>
        <div class="popup-coords">📌 ${loc.lat.toFixed(4)}, ${loc.lon.toFixed(4)}</div>
        <div class="popup-members-count">👥 ${groupMembers.length} üye</div>
        <div class="popup-members-list">
    `;

    // Üye listesi (ilk 5)
    groupMembers.slice(0, 5).forEach(m => {
      popupContent += `
        <div class="popup-member-item">
          <img src="${m.avatar_url}" class="popup-member-avatar" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
          <span class="popup-member-name">${m.username || 'İsimsiz'}</span>
          <span class="popup-member-ip">${m.ip}</span>
        </div>
      `;
    });

    if (groupMembers.length > 5) {
      popupContent += `<div class="popup-more">+${groupMembers.length - 5} daha...</div>`;
    }

    popupContent += `</div></div>`;

    // Grup marker'ı için custom icon
    let iconHtml;
    if (groupMembers.length === 1) {
      iconHtml = `<div class="marker-single" style="background-image: url('${avatarUrls[0]}')"></div>`;
    } else {
      iconHtml = `
        <div class="marker-group">
          <div class="marker-stack" style="background-image: url('${avatarUrls[0]}')"></div>
          ${avatarUrls[1] ? `<div class="marker-stack stack-2" style="background-image: url('${avatarUrls[1]}')"></div>` : ''}
          ${avatarUrls[2] ? `<div class="marker-stack stack-3" style="background-image: url('${avatarUrls[2]}')"></div>` : ''}
          <span class="marker-count">${groupMembers.length}</span>
        </div>
      `;
    }

    const customIcon = L.divIcon({
      className: 'custom-marker-container',
      html: iconHtml,
      iconSize: groupMembers.length === 1 ? [40, 40] : [50, 50],
      iconAnchor: groupMembers.length === 1 ? [20, 40] : [25, 50]
    });

    const marker = L.marker([loc.lat, loc.lon], { icon: customIcon })
      .addTo(map)
      .bindPopup(popupContent, { maxWidth: 320, maxHeight: 400 });

    markers.push(marker);
  });

  // Tüm marker'ları göster
  if (markers.length > 1) {
    const group = new L.featureGroup(markers);
    map.fitBounds(group.getBounds().pad(0.2));
  } else if (markers.length === 1) {
    map.setZoom(10);
  }

  // Harita kontrolleri
  L.control.scale({ metric: true, imperial: false }).addTo(map);
  
  // Konum özetini de haritaya ekle (sağ üst)
  if (locationSummary.length > 0) {
    const summaryControl = L.control({ position: 'topright' });
    summaryControl.onAdd = () => {
      const div = L.DomUtil.create('div', 'map-location-summary');
      const top3 = locationSummary.slice(0, 3);
      div.innerHTML = `
        <div class="summary-title">🏆 En Çok Üye</div>
        ${top3.map(loc => `
          <div class="summary-item">
            <span class="summary-flag">${getCountryEmoji(loc.country)}</span>
            <span class="summary-city">${loc.city}</span>
            <span class="summary-count">${loc.count}</span>
          </div>
        `).join('')}
      `;
      return div;
    };
    summaryControl.addTo(map);
  }

  console.log(`[Map] ${markers.length} konum grubu başarıyla gösterildi`);
}

searchBtn.addEventListener('click', doSearch);
searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
document.addEventListener('export', exportResult);

// SQL/TXT Dosya Yükleme (Railway için)
const sqlFileInput = document.getElementById('sqlFileInput');
const uploadSqlBtn = document.getElementById('uploadSqlBtn');
const uploadStatus = document.getElementById('uploadStatus');

uploadSqlBtn?.addEventListener('click', async () => {
  const file = sqlFileInput?.files?.[0];
  if (!file) {
    uploadStatus.textContent = '❌ Dosya seçilmedi';
    return;
  }
  
  if (!file.name.endsWith('.sql') && !file.name.endsWith('.txt')) {
    uploadStatus.textContent = '❌ Sadece .sql ve .txt dosyaları';
    return;
  }
  
  try {
    uploadStatus.textContent = '⬆️ Yükleniyor...';
    
    const arrayBuffer = await file.arrayBuffer();
    const response = await fetch(`/api/upload-sql?filename=${encodeURIComponent(file.name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: arrayBuffer
    });
    
    const result = await response.json();
    if (result.ok) {
      uploadStatus.textContent = `✅ ${file.name} yüklendi (${(result.size / 1024 / 1024).toFixed(2)} MB)`;
      sqlFileInput.value = ''; // Reset input
      showToast('Dosya başarıyla yüklendi!', 'success');
    } else {
      uploadStatus.textContent = `❌ Hata: ${result.error}`;
    }
  } catch (err) {
    uploadStatus.textContent = `❌ Hata: ${err.message}`;
    console.error('Upload error:', err);
  }
});

// Enter tuşu ile manuel giriş
manualDiscordId?.addEventListener('keydown', (e) => { if (e.key === 'Enter') addManualDiscordInfo(); });
manualEmailOnly?.addEventListener('keydown', (e) => { if (e.key === 'Enter') addManualEmail(); });

// 🎬 MATRIX PILL SELECTION - Cinematic Transition
let pillSelectionMade = false;

// Show pill selection on first visit
function showPillSelection() {
  if (pillSelectionMade || localStorage.getItem('pillSelected')) return;
  
  const theChoice = document.getElementById('the-choice');
  if (theChoice) {
    theChoice.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    
    // Auto-play cinematic music/sound effect (if browser allows)
    playMatrixSound();
  }
}

// Play Matrix cinematic sound
function playMatrixSound() {
  try {
    const audio = new Audio();
    audio.volume = 0.3;
    // Generated deep cinematic tone using Web Audio API instead
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.frequency.setValueAtTime(60, audioCtx.currentTime); // Deep bass
    oscillator.frequency.exponentialRampToValueAtTime(30, audioCtx.currentTime + 2);
    
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 2);
    
    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 2);
  } catch (e) { /* ignore audio errors */ }
}

// Blue Pill - Safe choice, shows warning then proceeds
function selectBluePill() {
  if (pillSelectionMade) return;
  pillSelectionMade = true;
  
  const bluePill = document.getElementById('bluePill');
  if (bluePill) {
    bluePill.style.transform = 'scale(1.2) translateZ(50px)';
    bluePill.style.boxShadow = '0 0 60px #00bfff, 0 0 100px #0080ff';
  }
  
  showToast('💊 Mavi Hap: Güvenli mod seçildi. Gerçeklik devam ediyor...', 'info');
  
  // 10 second cinematic Matrix transition
  startMatrixCinematic('blue');
}

// Red Pill - Truth choice, direct access
function selectRedPill() {
  if (pillSelectionMade) return;
  pillSelectionMade = true;
  
  const redPill = document.getElementById('redPill');
  if (redPill) {
    redPill.style.transform = 'scale(1.2) translateZ(50px)';
    redPill.style.boxShadow = '0 0 60px #ff0040, 0 0 100px #ff0000';
  }
  
  showToast('💊 Kırmızı Hap: OSINT dünyasına hoş geldiniz...', 'success');
  
  // 10 second cinematic Matrix transition
  startMatrixCinematic('red');
}

// 10 Second Fullscreen Matrix Cinematic
function startMatrixCinematic(pillColor) {
  const theChoice = document.getElementById('the-choice');
  
  // Create fullscreen cinematic overlay
  const cinematic = document.createElement('div');
  cinematic.id = 'matrix-cinematic';
  cinematic.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: #000;
    z-index: 99999;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  `;
  
  // Matrix rain canvas
  const canvas = document.createElement('canvas');
  canvas.id = 'cinematic-canvas';
  canvas.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    opacity: 0.8;
  `;
  
  // 3D Perspective text
  const text3d = document.createElement('div');
  text3d.style.cssText = `
    position: relative;
    z-index: 10;
    font-family: 'Courier New', monospace;
    font-size: clamp(24px, 8vw, 72px);
    font-weight: bold;
    color: ${pillColor === 'red' ? '#ff0040' : '#00bfff'};
    text-shadow: 
      0 0 10px ${pillColor === 'red' ? '#ff0040' : '#00bfff'},
      0 0 20px ${pillColor === 'red' ? '#ff0040' : '#00bfff'},
      0 0 40px ${pillColor === 'red' ? '#ff0000' : '#0080ff'};
    transform: perspective(500px) rotateX(15deg);
    animation: cinematicPulse 2s ease-in-out infinite;
    text-align: center;
    letter-spacing: 8px;
  `;
  text3d.innerHTML = `
    <div style="font-size: 0.5em; margin-bottom: 20px; opacity: 0.8;">ZAGROS OSINT</div>
    <div style="font-size: 1em;">${pillColor === 'red' ? 'GERÇEKLİK AÇILIYOR' : 'SİSTEME GİRİŞ'}</div>
    <div style="font-size: 0.3em; margin-top: 30px; opacity: 0.6;">10 SANİYE...</div>
  `;
  
  // Countdown
  const countdown = document.createElement('div');
  countdown.style.cssText = `
    position: absolute;
    bottom: 100px;
    font-family: 'Courier New', monospace;
    font-size: 48px;
    color: #0f0;
    text-shadow: 0 0 20px #0f0;
    z-index: 10;
  `;
  countdown.textContent = '10';
  
  cinematic.appendChild(canvas);
  cinematic.appendChild(text3d);
  cinematic.appendChild(countdown);
  document.body.appendChild(cinematic);
  
  // Hide the choice screen
  if (theChoice) theChoice.classList.add('hidden');
  
  // Start Matrix rain animation
  startCinematicMatrixRain(canvas);
  
  // 10 second countdown
  let seconds = 10;
  const countdownInterval = setInterval(() => {
    seconds--;
    countdown.textContent = seconds;
    if (seconds <= 0) {
      clearInterval(countdownInterval);
      endCinematic();
    }
  }, 1000);
  
  // Add cinematic styles
  const style = document.createElement('style');
  style.textContent = `
    @keyframes cinematicPulse {
      0%, 100% { transform: perspective(500px) rotateX(15deg) scale(1); opacity: 1; }
      50% { transform: perspective(500px) rotateX(15deg) scale(1.05); opacity: 0.9; }
    }
  `;
  document.head.appendChild(style);
}

// Matrix rain for cinematic
function startCinematicMatrixRain(canvas) {
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  
  const chars = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
  const fontSize = 16;
  const columns = canvas.width / fontSize;
  const drops = Array(Math.floor(columns)).fill(1);
  
  let frameCount = 0;
  const maxFrames = 600; // 10 seconds at 60fps
  
  function draw() {
    frameCount++;
    if (frameCount > maxFrames) return;
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#0f0';
    ctx.font = fontSize + 'px monospace';
    
    for (let i = 0; i < drops.length; i++) {
      const text = chars[Math.floor(Math.random() * chars.length)];
      ctx.fillText(text, i * fontSize, drops[i] * fontSize);
      
      if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
        drops[i] = 0;
      }
      drops[i]++;
    }
    
    requestAnimationFrame(draw);
  }
  
  draw();
}

// End cinematic and show login
function endCinematic() {
  const cinematic = document.getElementById('matrix-cinematic');
  if (cinematic) {
    cinematic.style.transition = 'opacity 1s ease';
    cinematic.style.opacity = '0';
    setTimeout(() => {
      cinematic.remove();
      document.body.style.overflow = '';
    }, 1000);
  }
  
  // Mark as selected
  localStorage.setItem('pillSelected', 'true');
  
  // Show auth card (login form)
  show(authCard);
}

// Initialize - check if pill selection needed
if (!localStorage.getItem('pillSelected')) {
  // Show pill selection instead of auth card initially
  hide(authCard);
  setTimeout(showPillSelection, 500);
} else {
  // Normal flow - check auth
  await checkAuth();
}
