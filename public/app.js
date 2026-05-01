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
        // Also store in localStorage for persistence
        localStorage.setItem('zagros_authed', '1');
        localStorage.setItem('zagros_tier', data.tier || 'free');
        
        // Hide any overlays
        const introOverlay = document.getElementById('intro-overlay');
        if (introOverlay) introOverlay.remove();
        
        const theChoice = document.getElementById('the-choice');
        if (theChoice) theChoice.classList.add('hidden');
        
        hide(authCard); 
        show(appCard); 
        loadStats(); 
        try { renderHistory(); } catch (e) {}
        return true;
      }
    }
  } catch (err) { 
    console.error('[checkAuth] Error:', err);
  }
  
  // Not authenticated
  authData = { tier: 'free' };
  localStorage.removeItem('zagros_authed');
  show(authCard); 
  hide(appCard); 
  return false;
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
  
  // Attach login button event listeners after DOM is ready
  const autoLoginBtn = document.getElementById('autoLoginBtn');
  if (autoLoginBtn) {
    autoLoginBtn.addEventListener('click', autoLogin);
  }
  
  const keyLoginBtn = document.getElementById('keyLoginBtn');
  if (keyLoginBtn) {
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
  }
  
  // Key input Enter key support
  const keyInput = document.getElementById('key');
  if (keyInput) {
    keyInput.addEventListener('keydown', (e) => { 
      if (e.key === 'Enter') {
        const keyLoginBtn = document.getElementById('keyLoginBtn');
        if (keyLoginBtn) keyLoginBtn.click();
      }
    });
  }
  
  // Skip intro overlay - go directly to login
  // const isLoggedIn = localStorage.getItem('zagros_authed') === '1';
  // if (!isLoggedIn) {
  //   showIntroOverlay();
  // }
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

// Event listeners moved inside DOMContentLoaded above

logoutBtn.addEventListener('click', async () => {
  try {
    await api('/api/logout', { method: 'POST', body: '{}' });
    // Clear auth state
    authData = { tier: 'free' };
    localStorage.removeItem('zagros_authed');
    localStorage.removeItem('zagros_tier');
    localStorage.removeItem('pillSelected'); // Reset pill selection on logout
    
    // Reset UI
    document.getElementById('subscriptionInfo').innerHTML = '';
    
    // Check auth to update UI state
    await checkAuth();
    
    showToast('👋 Çıkış yapıldı. Tekrar giriş yapabilirsiniz.', 'info');
  } catch (err) {
    console.error('Logout error:', err);
    showToast('❌ Çıkış yapılırken hata oluştu', 'error');
  }
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
    
    // Sunucular modunda otomatik listele - Tüm sunucuları göster
    if (searchMode === 'guilds') {
      showAllGuilds();
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

// Discord CDN URL yardımcıları (frontend)
function discordAvatarUrlFE(userId, avatarHash, size = 128) {
  if (!userId || !avatarHash) return null;
  const ext = avatarHash.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${ext}?size=${size}`;
}
function discordDefaultAvatarFE(userId) {
  let index = 0;
  try { index = Number(BigInt(userId) >> 22n) % 6; } catch { index = parseInt(userId || '0') % 5; }
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}
function discordGuildIconFE(guildId, iconHash, size = 128) {
  if (!guildId || !iconHash) return null;
  const ext = iconHash.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/icons/${guildId}/${iconHash}.${ext}?size=${size}`;
}
function discordGuildBannerFE(guildId, bannerHash, size = 512) {
  if (!guildId || !bannerHash) return null;
  const ext = bannerHash.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/banners/${guildId}/${bannerHash}.${ext}?size=${size}`;
}

// Kart oluştur - Discord ID Sorgu (Tablo ve Butonlu Tasarım)
function createUserCard(data) {
  const card = document.createElement('div');
  card.className = 'user-card discord-id-card';
  const username = data.username || 'Bilinmeyen Kullanıcı';
  const disc = data.discriminator && data.discriminator !== '0' ? `#${data.discriminator}` : '';
  const initial = username[0].toUpperCase();
  const discordId = data.discord_id || '-';

  // Profil fotoğrafı - öncelik sırası
  let avatarUrl = null;
  if (data.avatar_url) {
    avatarUrl = data.avatar_url;
  } else if (data.enriched_avatar_url) {
    avatarUrl = data.enriched_avatar_url;
  } else if (data.findcord_avatar_url) {
    avatarUrl = data.findcord_avatar_url;
  } else if (data.avatar_hash && data.avatar_hash !== 'N/A' && discordId !== '-') {
    avatarUrl = discordAvatarUrlFE(discordId, data.avatar_hash, 256);
  } else if (discordId !== '-') {
    avatarUrl = discordDefaultAvatarFE(discordId);
  }

  let avatarHtml;
  if (avatarUrl) {
    const fallbackUrl = discordId !== '-' ? discordDefaultAvatarFE(discordId) : null;
    const fallbackHtml = fallbackUrl
      ? `this.src='${fallbackUrl}'; this.onerror=null;`
      : `this.outerHTML='<div class=\\'avatar\\'>${initial}</div>';`;
    avatarHtml = `<img class="avatar-img" src="${avatarUrl}" onerror="${fallbackHtml}" alt="" loading="lazy">`;
  } else {
    avatarHtml = `<div class="avatar">${initial}</div>`;
  }

  // Rozetler
  let badgesHtml = '';
  if (data.premium === '1' || data.premium === 'true' || data.subscription_type === 'enterprise' || data.subscription_type === 'pro') badgesHtml += '<span class="badge premium-badge">⭐ Premium</span>';
  if (data.verified === '1' || data.verified === 'true' || data.is_active === 1) badgesHtml += '<span class="badge verified-badge">✓ Doğrulanmış</span>';
  if (data.findcord_badges && data.findcord_badges.length > 0) {
    for (const b of data.findcord_badges) {
      const iconHtml = b.icon ? `<img class="badge-icon" src="${b.icon}" onerror="this.style.display='none'" alt="">` : '';
      badgesHtml += `<span class="badge fc-badge" title="${b.description || b.id}">${iconHtml}${b.description || b.id}</span>`;
    }
  }

  // Banner
  let bannerStyle = '';
  const bannerUrl = data.banner_url || data.enriched_banner_url || data.findcord_banner_url;
  if (bannerUrl) {
    bannerStyle = `background-image: url(${bannerUrl}); background-size: cover; background-position: center;`;
  }

  // Global name + zamir
  let globalNameHtml = '';
  if (data.findcord_global_name && data.findcord_global_name !== username) {
    globalNameHtml = `<div class="global-name">${data.findcord_global_name}</div>`;
  }
  if (data.findcord_pronouns) {
    globalNameHtml += `<span class="pronouns">${data.findcord_pronouns}</span>`;
  }

  // Durum
  let presenceHtml = '';
  if (data.findcord_presence) {
    const status = data.findcord_presence.Status || data.findcord_presence.status || 'offline';
    const statusMap = { online: '🟢 Çevrimiçi', idle: '🟡 Boşta', dnd: '🔴 Rahatsız Etmeyin', offline: '⚫ Çevrimdışı' };
    presenceHtml = statusMap[status] || `⚫ ${status}`;
  }

  // ===== SUNUCULAR TABLOSU =====
  let serversHtml = '';
  const guilds = data.guilds || data.findcord_servers || [];
  if (guilds.length > 0) {
    // Yetkili olduğu sunucuları önce sırala (owner/admin önce)
    const sortedGuilds = [...guilds].sort((a, b) => {
      if (a.owner && !b.owner) return -1;
      if (!a.owner && b.owner) return 1;
      if (a.admin && !b.admin) return -1;
      if (!a.admin && b.admin) return 1;
      return 0;
    });
    
    serversHtml = `<div class="data-section"><div class="section-title">💬 Sunucular (${guilds.length} sunucu${guilds.some(g => g.owner || g.admin) ? ' - 👑 Yetkili olduğu sunucular var' : ''})</div><table class="data-table server-table"><thead><tr><th>Avatar</th><th>Sunucu</th><th>İsminiz</th><th>Rozetler</th><th>ID</th></tr></thead><tbody>${sortedGuilds.slice(0, 20).map(s => {
      const name = s.name || 'Bilinmeyen Sunucu';
      const iconUrl = s.icon || null;
      const iconHtml = iconUrl 
        ? `<img class="table-avatar" src="${iconUrl}" alt="" onerror="this.style.display='none'; this.parentElement.innerHTML='<div class=\\'table-avatar-placeholder\\'>' + '${name[0].toUpperCase()}' + '</div>'">`
        : `<div class="table-avatar-placeholder">${name[0].toUpperCase()}</div>`;
      const booster = s.booster ? '💎' : '';
      const owner = s.owner ? '👑 Sahip' : '';
      const admin = s.admin ? '🔧 Admin' : '';
      const mod = s.moderator ? '🛡️ Mod' : '';
      const nickname = s.nickname || s.user_name || s.global_name || '-';
      const rowClass = s.owner ? 'row-owner' : (s.admin ? 'row-admin' : '');
      return `<tr class="${rowClass}"><td>${iconHtml}</td><td><strong>${name}</strong></td><td>${nickname}</td><td>${owner} ${admin} ${mod} ${booster}</td><td class="mono">${s.id || '-'}</td></tr>`;
    }).join('')}</tbody></table>${sortedGuilds.length > 20 ? `<div class="more-row">+${sortedGuilds.length - 20} sunucu daha...</div>` : ''}</div>`;
  }

  // ===== SUNUCU MESAJLARI TABLOSU (6 adet) =====
  let messagesTableHtml = '';
  const recentMessages = data.findcord_recent_messages || data.findcord_raw?.RecentMessages || data.findcord_raw?.recentMessages || [];
  if (recentMessages && recentMessages.length > 0) {
    const messages = recentMessages.slice(0, 6);
    messagesTableHtml = `<div class="data-section"><div class="section-title">💬 Son 6 Sunucu Mesajı (${recentMessages.length} toplam)</div><table class="data-table message-table"><thead><tr><th>Sunucu</th><th>Kanal</th><th>Mesaj</th><th>Tarih</th></tr></thead><tbody>${messages.map(m => {
      const guildName = m.guild_name || m.GuildName || '-';
      const channelName = m.channel_name || m.ChannelName || '-';
      const content = m.content || m.Content || m.message || m.Message || '-';
      const timestamp = m.timestamp || m.Timestamp || m.date || m.Date;
      const timeStr = timestamp ? new Date(timestamp).toLocaleDateString('tr-TR') : '-';
      return `<tr><td><strong>${guildName}</strong></td><td>${channelName}</td><td class="message-preview">${content.substring(0, 80)}${content.length > 80 ? '...' : ''}</td><td>${timeStr}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  }

  // ===== EMAIL TABLOSU =====
  let emailTableHtml = '';
  const emails = [];
  if (data.email) emails.push({ email: data.email, source: 'Ana Kayıt' });
  if (data.sql_matches && data.sql_matches.length > 0) {
    data.sql_matches.forEach(m => {
      if (m.email && !emails.find(e => e.email === m.email)) {
        emails.push({ email: m.email, source: m.source || 'SQL' });
      }
    });
  }
  if (emails.length > 0) {
    emailTableHtml = `<div class="data-section"><div class="section-title">📧 Email Adresleri (${emails.length})</div><table class="data-table email-table"><thead><tr><th>Email</th><th>Kaynak</th><th>Kopyala</th></tr></thead><tbody>${emails.map(e => `<tr><td class="mono">${e.email}</td><td>${e.source}</td><td><button class="copy-btn-small" onclick="navigator.clipboard.writeText('${e.email}')">📋</button></td></tr>`).join('')}</tbody></table></div>`;
  }

  // ===== YAKIN ARKADAŞLAR TABLOSU (5 kişi) =====
  let closeFriendsTableHtml = '';
  const topFriends = data.findcord_raw?.TopFriends || data.findcord_raw?.topFriends || data.findcord_raw?.CloseFriends || [];
  if (topFriends && topFriends.length > 0) {
    const friends = topFriends.slice(0, 5);
    closeFriendsTableHtml = `<div class="data-section"><div class="section-title">👥 Yakın Arkadaşlar (En Çok Mesajlaşılan 5 Kişi)</div><table class="data-table friends-table"><thead><tr><th>Profil</th><th>Kullanıcı</th><th>ID</th><th>Son Mesaj</th></tr></thead><tbody>${friends.map(f => {
      const name = f.username || f.name || 'Bilinmeyen';
      const id = f.discord_id || f.DiscordId || '-';
      const avatar = f.avatar ? `<img class="table-avatar-small" src="https://cdn.discordapp.com/avatars/${id}/${f.avatar}.png" alt="">` : `<div class="table-avatar-small-placeholder">${name[0]}</div>`;
      const lastMsg = f.last_message_date || f.date || f.Date || '-';
      return `<tr><td>${avatar}</td><td>${name}</td><td class="mono">${id}</td><td>${lastMsg}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  }

  // ===== SES ARKADAŞLARI TABLOSU (5 kişi) =====
  let voiceFriendsTableHtml = '';
  const voiceFriends = data.findcord_voice_friends || data.findcord_raw?.VoiceFriends || data.findcord_raw?.voiceFriends || [];
  if (voiceFriends && voiceFriends.length > 0) {
    const vFriends = voiceFriends.slice(0, 5);
    voiceFriendsTableHtml = `<div class="data-section"><div class="section-title">🎤 Ses Arkadaşları (Son 5 Kişi)</div><table class="data-table friends-table"><thead><tr><th>Profil</th><th>Kullanıcı</th><th>ID</th><th>Son Görülme</th><th>Süre</th></tr></thead><tbody>${vFriends.map(f => {
      const name = f.username || f.name || 'Bilinmeyen';
      const id = f.discord_id || f.DiscordId || '-';
      const avatar = f.avatar ? `<img class="table-avatar-small" src="https://cdn.discordapp.com/avatars/${id}/${f.avatar}.png" alt="">` : `<div class="table-avatar-small-placeholder">${name[0]}</div>`;
      const lastSeen = f.last_connected || f.LastConnected || '-';
      const duration = f.total_time || f.TotalTime || '-';
      return `<tr><td>${avatar}</td><td>${name}</td><td class="mono">${id}</td><td>${lastSeen}</td><td>${duration}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  }

  // ===== API KAYNAKLARI BADGES =====
  let apiSourcesHtml = '';
  const sources = [];
  if (data.findcord_raw) sources.push({ name: 'FindCord', color: '#5865f2' });
  if (data.discordlookup_data) sources.push({ name: 'DiscordLookup', color: '#3ba55d' });
  if (data.discordid_data) sources.push({ name: 'Discord.id', color: '#faa61a' });
  if (data.enriched) sources.push({ name: 'Discord API', color: '#5865f2' });
  
  if (sources.length > 0) {
    apiSourcesHtml = `<div class="api-sources"><span class="api-sources-label">Veri Kaynakları:</span>${sources.map(s => `<span class="api-source-badge" style="background:${s.color}20;color:${s.color};border:1px solid ${s.color}40">${s.name}</span>`).join('')}</div>`;
  }

  // ===== FINDCORD DETAYLAR =====
  let fcExtraHtml = '';
  const fcExtras = [];
  if (data.findcord_top_name) fcExtras.push(`<span class="info-icon">👤</span><span class="info-label">Gerçek İsim</span><span class="info-value">${data.findcord_top_name}</span>`);
  if (data.findcord_top_age) fcExtras.push(`<span class="info-icon">🎂</span><span class="info-label">Yaş</span><span class="info-value">${data.findcord_top_age}</span>`);
  if (data.findcord_top_sex) fcExtras.push(`<span class="info-icon">⚧</span><span class="info-label">Cinsiyet</span><span class="info-value">${data.findcord_top_sex}</span>`);
  if (data.findcord_created) {
    const createdDate = new Date(data.findcord_created).toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' });
    fcExtras.push(`<span class="info-icon">📅</span><span class="info-label">Hesap Oluşturma</span><span class="info-value">${createdDate}</span>`);
  }
  if (presenceHtml) fcExtras.push(`<span class="info-icon">📡</span><span class="info-label">Durum</span><span class="info-value">${presenceHtml}</span>`);
  if (data.findcord_phone) fcExtras.push(`<span class="info-icon">📱</span><span class="info-label">Telefon</span><span class="info-value">${data.findcord_phone}</span>`);
  if (data.findcord_nitro) fcExtras.push(`<span class="info-icon">💎</span><span class="info-label">Nitro</span><span class="info-value">${data.findcord_nitro_type || 'Nitro'}</span>`);
  if (data.findcord_display_names && data.findcord_display_names.length > 0) {
    fcExtras.push(`<span class="info-icon">🏷️</span><span class="info-label">Geçmiş İsimler</span><span class="info-value">${data.findcord_display_names.slice(0, 5).join(', ')}${data.findcord_display_names.length > 5 ? ` (+${data.findcord_display_names.length - 5})` : ''}</span>`);
  }
  if (data.findcord_locale) fcExtras.push(`<span class="info-icon">🌍</span><span class="info-label">Dil</span><span class="info-value">${data.findcord_locale}</span>`);
  if (data.findcord_mfa_enabled) fcExtras.push(`<span class="info-icon">🔒</span><span class="info-label">2FA</span><span class="info-value">Aktif</span>`);
  if (data.findcord_email_verified !== undefined) fcExtras.push(`<span class="info-icon">✉️</span><span class="info-label">Email Doğrulama</span><span class="info-value">${data.findcord_email_verified ? '✓ Doğrulanmış' : '✗ Doğrulanmamış'}</span>`);
  
  if (fcExtras.length > 0) {
    fcExtraHtml = `<div class="fc-extras-section"><div class="section-title">📋 FindCord Profil Detayları</div><div class="fc-extras">${fcExtras.map(e => `<div class="info-row">${e}</div>`).join('')}</div></div>`;
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

  const emailVal = data.email || data.email_masked || 'Bilinmiyor';
  const ipVal = data.ip || data.ip_masked || data.last_ip || data.registration_ip || 'Bilinmiyor';
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
      ${apiSourcesHtml}
      <div class="info-rows">
        <div class="info-row"><span class="info-icon">📧</span><span class="info-label">Email</span><span class="info-value">${emailVal}</span>${copyBtn(data.email)}</div>
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
      ${emailTableHtml}
      ${messagesTableHtml}
      ${closeFriendsTableHtml}
      ${voiceFriendsTableHtml}
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
  guild: 180000,  // 180 saniye (3 dk) - SQL dosyaları çok büyük
  guilds: 120000  // 120 saniye (2 dk) - sunucu listesi (SQL tarama uzun sürüyor)
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
      } else if (searchMode === 'plaka') {
        return await api(`/api/plaka-sorgu?plaka=${encodeURIComponent(query)}`, { method: 'GET' });
      }
    })();
    
    // Race: API vs Timeout
    data = await Promise.race([searchPromise, timeoutPromise]);
    
    hideLoading();
    
    if (searchMode === 'id') {
      // New API structure: data.user contains merged user data
      let candidate = null;
      if (data?.found && data?.user) {
        candidate = data.user;
      } else if (data?.results) {
        // Fallback to old structure
        const res = data.results;
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
    } else if (searchMode === 'plaka') {
      lastResult = data;
      if (data?.plaka) {
        showPlakaResults(data);
        addToHistory(query, 'plaka');
      } else {
        show(noResults);
        showToast('⚠️ Plaka bulunamadı veya geçersiz', 'warning');
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

  // Skeleton placeholders when data is not yet available
  const guilds = data.guilds || [];
  if (!guilds.length) {
    const skeleton = document.createElement('div');
    skeleton.className = 'guilds-skeleton-grid';
    skeleton.innerHTML = Array.from({ length: 6 }).map(() => `<div class="guild-skeleton-card"></div>`).join('');
    container.appendChild(skeleton);
    return container;
  }

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

  // Premium Banner (only shown to free users with a one-time login)
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
  // Gösterim koşulu: sadece free kullanıcılar için ve tek seferlik giriş yapanlar için
  if (authData?.tier === 'free') {
    container.appendChild(premiumBanner);
  }

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
    // Kart arkaplanı için banner URL (önce banner_url, sonra hash'ten oluştur)
    const cardBannerUrl = g.banner_url || (g.banner && g.id ? discordGuildBannerFE(g.id, g.banner, 512) : null);
    if (cardBannerUrl) {
      card.style.background = `linear-gradient(rgba(0,0,0,0.7), rgba(0,0,0,0.9)), url(${cardBannerUrl})`;
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
    // Önce gelen veriyi kontrol et, sonra Discord API'den çekmeye çalış
    let displayName = g.name || g.guild_name || g.server_name;
    const hasRealName = displayName && 
                        displayName !== 'Bilinmeyen Sunucu' && 
                        displayName !== 'Unknown Guild' &&
                        displayName !== 'null' &&
                        displayName !== 'undefined' &&
                        displayName.trim().length > 0;

    // Otomatik isim: İsim yoksa "Sunucu #ID" formatında
    // ID'nin son 6 karakteri veya tamamı
    const guildIdShort = g.id ? g.id.slice(-6) : '??????';
    const autoName = `Sunucu #${guildIdShort}`;
    
    if (!hasRealName) {
      displayName = autoName;
    }
    // ID'nin ilk harfini alıp renkli kare içinde göster (Discord tarzı)
    const iconLetter = (g.name?.[0] || g.id.slice(-1)).toUpperCase();
    const iconColors = ['#5865F2', '#EB459E', '#57F287', '#FEE75C', '#ED4245', '#9B59B6', '#3498DB', '#E91E63'];
    const colorIndex = g.id.split('').reduce((a,b)=>a+b.charCodeAt(0),0) % iconColors.length;
    const iconBg = iconColors[colorIndex];
    
    // Icon URL varsa kullan, yoksa otomatik harf ikonu
    // Icon URL - önce icon_url, sonra icon hash'ten oluştur, yoksa harf ikonu
    let resolvedIconUrl = g.icon_url;
    
    // Discord CDN URL oluştur - icon hash kontrolü
    if (!resolvedIconUrl && g.id) {
      const iconHash = g.icon || g.icon_hash || g.guild_icon;
      if (iconHash && typeof iconHash === 'string' && iconHash.length > 5) {
        const ext = iconHash.startsWith('a_') ? 'gif' : 'png';
        resolvedIconUrl = `https://cdn.discordapp.com/icons/${g.id}/${iconHash}.${ext}?size=128`;
      }
    }
    
    // Banner URL oluştur
    let bannerUrl = g.banner_url;
    if (!bannerUrl && g.id) {
      const bannerHash = g.banner || g.banner_hash || g.guild_banner;
      if (bannerHash && typeof bannerHash === 'string' && bannerHash.length > 5) {
        const ext = bannerHash.startsWith('a_') ? 'gif' : 'png';
        bannerUrl = `https://cdn.discordapp.com/banners/${g.id}/${bannerHash}.${ext}?size=512`;
      }
    }
    
    // Splash URL oluştur (invite background)
    let splashUrl = g.splash_url;
    if (!splashUrl && g.id) {
      const splashHash = g.splash || g.splash_hash;
      if (splashHash && typeof splashHash === 'string' && splashHash.length > 5) {
        splashUrl = `https://cdn.discordapp.com/splashes/${g.id}/${splashHash}.png?size=512`;
      }
    }
    
    let iconHtml;
    if (resolvedIconUrl) {
      iconHtml = `<img src="${resolvedIconUrl}" class="guild-card-icon-img" onerror="this.onerror=null; this.style.display='none'; this.parentElement.innerHTML='<div class=\'guild-card-icon-auto\' style=\'background:${iconBg}\'>${iconLetter}</div>';" loading="lazy" />`;
    } else {
      iconHtml = `<div class="guild-card-icon-auto" style="background:${iconBg}">${iconLetter}</div>`;
    }
    
    // Banner arka planı varsa ayarla
    if (bannerUrl) {
      card.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.7), rgba(0,0,0,0.9)), url('${bannerUrl}')`;
      card.style.backgroundSize = 'cover';
      card.style.backgroundPosition = 'center';
    } else if (splashUrl) {
      card.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.7), rgba(0,0,0,0.9)), url('${splashUrl}')`;
      card.style.backgroundSize = 'cover';
      card.style.backgroundPosition = 'center';
    }

    // Sample members avatarları (ilk 3 üye) - Discord CDN
    let membersHtml = '';
    if (g.sample_members && g.sample_members.length > 0) {
      const avatars = g.sample_members.slice(0, 3).map(m => {
        // Avatar URL önceliği: avatar_url > avatar hash > varsayılan
        let avatarUrl = m.avatar_url;
        const memberId = m.discord_id || m.id || m.user_id;
        
        if (!avatarUrl && memberId) {
          const avatarHash = m.avatar || m.avatar_hash || m.user_avatar;
          if (avatarHash && typeof avatarHash === 'string' && avatarHash.length > 5) {
            const ext = avatarHash.startsWith('a_') ? 'gif' : 'png';
            avatarUrl = `https://cdn.discordapp.com/avatars/${memberId}/${avatarHash}.${ext}?size=64`;
          }
        }
        
        // Discord default avatar
        let fallbackUrl = 'https://cdn.discordapp.com/embed/avatars/0.png';
        if (memberId) {
          try {
            const fallbackIdx = Number(BigInt(memberId) >> 22n) % 6;
            fallbackUrl = `https://cdn.discordapp.com/embed/avatars/${fallbackIdx}.png`;
          } catch {
            // Default
          }
        }
        
        const initial = (m.username || m.user_name || 'U')[0].toUpperCase();
        return avatarUrl 
          ? `<img src="${avatarUrl}" class="member-avatar" onerror="this.src='${fallbackUrl}'; this.onerror=null;" title="${m.username || m.user_name || 'İsimsiz'}" alt="${initial}" loading="lazy">`
          : `<div class="member-avatar-placeholder" title="${m.username || m.user_name || 'İsimsiz'}">${initial}</div>`;
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
    
    // Banner varsa göster (kart üstünde) - önce banner_url, sonra banner hash'ten oluştur
    let resolvedBannerUrl = g.banner_url;
    if (!resolvedBannerUrl && g.banner && g.id) {
      resolvedBannerUrl = discordGuildBannerFE(g.id, g.banner, 512);
    }
    let bannerHtml = '';
    if (resolvedBannerUrl) {
      bannerHtml = `<div class="guild-card-banner" style="background-image:url('${resolvedBannerUrl}')"></div>`;
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

    // Safer, minimal render to ensure at least name/avatar shows up
    card.innerHTML = `
      ${bannerHtml}
      <div class="guild-card-header">
        ${iconHtml}
        <div class="guild-card-title-wrap">
          <div class="guild-card-name">${displayName}</div>
        </div>
      </div>
      <div class="guild-card-body">
        ${membersHtml || ''}
        ${descHtml || ''}
        <div class="guild-card-meta">
          <span class="guild-card-count">👥 ${g.member_count?.toLocaleString('tr-TR') || 0} kayıt</span>
          <span class="guild-card-source">📁 ${g.source ?? 'Veritabanı'}</span>
        </div>
        ${chipsHtml || ''}
      </div>
      <div class="guild-card-arrow">→</div>
    `;
    grid.appendChild(card);
  }

  container.appendChild(grid);

  return container;
}

// 🏢 TÜM SUNUCULARI LİSTELE - Algılanan bütün sunucular
async function showAllGuilds() {
  // 🚀 SKELETON LOADING - Show shimmer effect while loading
  const resultsArea = document.getElementById('resultsArea');
  const noResults = document.getElementById('noResults');
  
  resultsArea.innerHTML = `
    <div class="all-guilds-header">
      <div class="skeleton-title" style="width: 300px; height: 32px; background: linear-gradient(90deg, #333 25%, #444 50%, #333 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 8px; margin-bottom: 10px;"></div>
      <div class="skeleton-subtitle" style="width: 200px; height: 16px; background: linear-gradient(90deg, #333 25%, #444 50%, #333 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 4px;"></div>
    </div>
    <div class="all-guilds-grid">
      ${Array(12).fill(0).map((_, i) => `
        <div class="all-guild-card guild-skeleton" style="background: linear-gradient(90deg, #2a2a2e 25%, #3a3a3e 50%, #2a2a2e 75%); background-size: 200% 100%; animation: skeletonLoading 1.5s ease-in-out infinite; height: 100px; border-radius: 20px;">
          <div style="display: flex; align-items: center; gap: 16px; padding: 20px;">
            <div style="width: 64px; height: 64px; border-radius: 16px; background: rgba(255,255,255,0.1);"></div>
            <div style="flex: 1;">
              <div style="width: 60%; height: 20px; background: rgba(255,255,255,0.1); border-radius: 4px; margin-bottom: 8px;"></div>
              <div style="width: 40%; height: 14px; background: rgba(255,255,255,0.05); border-radius: 4px;"></div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
  hide(noResults);
  
  showLoading();
  try {
    const data = await api('/api/guilds', { method: 'GET' });
    hideLoading();
    
    if (!data.guilds || data.guilds.length === 0) {
      resultsArea.innerHTML = `
        <div class="no-results">
          <div class="no-results-icon">🏢</div>
          <h3>Henüz Sunucu Yok</h3>
          <p>Veritabanında kayıtlı sunucu bulunamadı.</p>
        </div>
      `;
      hide(noResults);
      return;
    }
    
    // Tüm sunucuları ID'ye göre benzersizleştir ve tüm avatar/banner kaynaklarını kontrol et
    const uniqueGuilds = [];
    const seenIds = new Set();
    
    console.log(`[showAllGuilds] ${data.guilds.length} sunucu verisi alındı`);
    
    data.guilds.forEach((g, idx) => {
      if (idx < 5) {
        console.log(`[showAllGuilds] Guild ${idx}:`, { 
          id: g.id || g.guild_id, 
          name: g.name || g.guild_name,
          icon: g.icon || g.icon_hash || g.guild_icon,
          banner: g.banner || g.banner_hash || g.guild_banner 
        });
      }
      const id = g.id || g.guild_id || g.server_id;
      if (id && !seenIds.has(id)) {
        seenIds.add(id);
        
        // TÜM olası icon hash kaynaklarını kontrol et
        const iconHash = g.icon || 
                         g.icon_hash || 
                         g.guild_icon || 
                         g.icon_id ||
                         g.server_icon ||
                         g.guild_icon_hash ||
                         g.icon_url?.match(/icons\/\d+\/([a-f0-9]+)/)?.[1];
        
        // TÜM olası banner hash kaynaklarını kontrol et
        const bannerHash = g.banner || 
                          g.banner_hash || 
                          g.guild_banner || 
                          g.banner_id ||
                          g.server_banner ||
                          g.guild_banner_hash ||
                          g.banner_url?.match(/banners\/\d+\/([a-f0-9]+)/)?.[1];
        
        // TÜM olası splash hash kaynaklarını kontrol et
        const splashHash = g.splash || 
                          g.splash_hash || 
                          g.guild_splash ||
                          g.splash_url?.match(/splashes\/\d+\/([a-f0-9]+)/)?.[1];
        
        // TÜM olası isim kaynaklarını kontrol et
        let name = g.name || 
                   g.guild_name || 
                   g.server_name ||
                   g.servername ||
                   g.title;
        
        // Widget'dan isim çekmeyi dene
        if (!name || name === 'null' || name === 'undefined') {
          name = null; // Sonra fetch et
        }
        
        uniqueGuilds.push({
          id: id,
          name: name,
          icon: iconHash,
          banner: bannerHash,
          splash: splashHash,
          member_count: g.member_count || g.members || g.memberCount || g.presence_count || 0,
          source: g.source || 'Veritabanı',
          // Ekstra metadata
          features: g.features || [],
          description: g.description || g.desc || g.about,
          vanity_url: g.vanity_url || g.vanityUrl || g.custom_url,
          verification_level: g.verification_level,
          nsfw: g.nsfw || g.is_nsfw
        });
      }
    });
    
    // Discord Widget'dan sunucu bilgilerini çek (rate limiting ile)
    const guildsNeedingData = uniqueGuilds.filter(g => !g.name || !g.icon);
    console.log(`[showAllGuilds] ${guildsNeedingData.length} sunucu için widget API'den veri çekilecek`);
    
    // Rate limiting: 5'erli gruplar halinde işle, her grup arasında 500ms bekle
    const batchSize = 5;
    for (let i = 0; i < guildsNeedingData.length; i += batchSize) {
      const batch = guildsNeedingData.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (guild) => {
        try {
          const widgetData = await fetchDiscordWidget(guild.id);
          if (widgetData) {
            if (!guild.name && widgetData.name) {
              guild.name = widgetData.name;
              console.log(`[Widget] ${guild.id} - isim bulundu: ${widgetData.name}`);
            }
            if (!guild.icon && widgetData.icon_hash) {
              guild.icon = widgetData.icon_hash;
              console.log(`[Widget] ${guild.id} - icon bulundu: ${widgetData.icon_hash}`);
            }
            if (!guild.banner && widgetData.banner_hash) {
              guild.banner = widgetData.banner_hash;
              console.log(`[Widget] ${guild.id} - banner bulundu: ${widgetData.banner_hash}`);
            }
            if (widgetData.presence_count) {
              guild.member_count = widgetData.presence_count;
            }
          }
        } catch (e) {
          // Widget fetch hatası - sessizce devam et
        }
      }));
      
      // Rate limit koruması: her batch sonrası bekle
      if (i + batchSize < guildsNeedingData.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    // Konteyner oluştur
    const container = document.createElement('div');
    container.className = 'all-guilds-container';
    
    // Sırala (isme göre, bilinmeyenler en sonda)
    uniqueGuilds.sort((a, b) => {
      const nameA = a.name || `Sunucu #${a.id.slice(-6)}`;
      const nameB = b.name || `Sunucu #${b.id.slice(-6)}`;
      return nameA.localeCompare(nameB);
    });
    
    // Başlık
    const header = document.createElement('div');
    header.className = 'all-guilds-header';
    header.innerHTML = `
      <h2>🏢 Tüm Sunucular</h2>
      <div class="all-guilds-stats">
        <span class="stat-item">📊 ${uniqueGuilds.length} sunucu</span>
        <span class="stat-item">👤 ${uniqueGuilds.reduce((sum, g) => sum + (g.member_count || 0), 0).toLocaleString('tr-TR')} toplam üye</span>
      </div>
    `;
    container.appendChild(header);
    
    // Arama kutusu
    const searchBox = document.createElement('div');
    searchBox.className = 'all-guilds-search';
    searchBox.innerHTML = `
      <input type="text" id="guildSearchInput" placeholder="🔍 Sunucu ID, isim veya üye sayısı ara..." class="guild-search-input">
    `;
    container.appendChild(searchBox);
    
    // Grid oluştur
    const grid = document.createElement('div');
    grid.className = 'all-guilds-grid';
    grid.id = 'allGuildsGrid';
    
    // Her sunucu için kart oluştur (sıralı)
    uniqueGuilds.forEach((guild, index) => {
      const card = createAllGuildCard(guild, index + 1);
      grid.appendChild(card);
    });
    
    container.appendChild(grid);
    
    // Sonuçları göster
    resultsArea.innerHTML = '';
    resultsArea.appendChild(container);
    hide(noResults);
    
    // Arama fonksiyonu
    const searchInput = document.getElementById('guildSearchInput');
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      const cards = grid.querySelectorAll('.all-guild-card');
      
      cards.forEach(card => {
        const name = card.dataset.name?.toLowerCase() || '';
        const id = card.dataset.id?.toLowerCase() || '';
        const match = name.includes(query) || id.includes(query);
        card.style.display = match ? 'flex' : 'none';
      });
    });
    
  } catch (error) {
    hideLoading();
    console.error('Tüm sunucular yüklenirken hata:', error);
    showToast('❌ Sunucular yüklenirken hata oluştu', 'error');
  }
}

// Discord Widget API'den sunucu bilgisi çek (Backend proxy ile - CORS koruması)
async function fetchDiscordWidget(guildId) {
  try {
    // Backend proxy kullan (CORS sorununu önler)
    const response = await api(`/api/widget/${guildId}`, { method: 'GET' });
    
    if (response.error) {
      if (response.error === 'Rate limited') {
        console.log(`[Widget] ${guildId} - Rate limited`);
      }
      return null;
    }
    
    return response;
  } catch (error) {
    console.log(`[Widget] ${guildId} - Hata:`, error.message);
    return null;
  }
}

// 🎴 TEK SUNUCU KARTI OLUŞTUR (Tüm sunucular listesi için)
function createAllGuildCard(g, index) {
  const card = document.createElement('div');
  card.className = 'all-guild-card';
  card.dataset.id = g.id;
  card.dataset.name = g.name || '';
  
  // TIKLAMA OLAYI
  card.onclick = async () => {
    showLoading();
    try {
      const data = await api(`/api/search-all?discord_id=${encodeURIComponent(g.id)}`, { method: 'GET' });
      hideLoading();
      
      if (data.guilds && data.guilds.length > 0) {
        renderGuildDetailView({ guild: data.guilds[0], members: data.members || [] });
      } else {
        showToast('⚠️ Sunucu detayları bulunamadı', 'warning');
      }
    } catch (e) {
      hideLoading();
      showToast('❌ Sunucu detayları yüklenirken hata', 'error');
    }
  };
  
  // Discord CDN İkon URL oluştur - hem hash hem de tam URL desteği
  let iconUrl = null;
  if (g.id && g.icon) {
    const iconValue = g.icon;
    if (typeof iconValue === 'string') {
      // Eğer zaten tam URL ise direkt kullan
      if (iconValue.startsWith('http')) {
        iconUrl = iconValue.replace('?size=4096', '?size=128'); // Boyutu küçült
        console.log(`[Guild Card] ${g.id} - Icon zaten URL: ${iconUrl}`);
      } else if (iconValue.length > 5) {
        // Hash ise CDN URL oluştur
        const ext = iconValue.startsWith('a_') ? 'gif' : 'png';
        iconUrl = `https://cdn.discordapp.com/icons/${g.id}/${iconValue}.${ext}?size=128`;
        console.log(`[Guild Card] ${g.id} - Icon URL: ${iconUrl}`);
      }
    }
  }
  
  // Discord default avatar (guild icon yoksa)
  if (!iconUrl && g.id) {
    try {
      const fallbackIdx = Number(BigInt(g.id) >> 22n) % 6;
      iconUrl = `https://cdn.discordapp.com/embed/avatars/${fallbackIdx}.png`;
    } catch {
      iconUrl = 'https://cdn.discordapp.com/embed/avatars/0.png';
    }
  }
  
  // Banner URL oluştur - hem hash hem de tam URL desteği
  let bannerUrl = null;
  if (g.id && g.banner) {
    const bannerValue = g.banner;
    if (typeof bannerValue === 'string') {
      // Eğer zaten tam URL ise direkt kullan
      if (bannerValue.startsWith('http')) {
        bannerUrl = bannerValue.replace('?size=4096', '?size=512'); // Boyutu ayarla
      } else if (bannerValue.length > 5) {
        // Hash ise CDN URL oluştur
        const ext = bannerValue.startsWith('a_') ? 'gif' : 'png';
        bannerUrl = `https://cdn.discordapp.com/banners/${g.id}/${bannerValue}.${ext}?size=512`;
      }
    }
  }
  
  // Splash URL oluştur (invite background)
  let splashUrl = null;
  if (g.id && g.splash) {
    const splashHash = g.splash;
    if (typeof splashHash === 'string' && splashHash.length > 5) {
      splashUrl = `https://cdn.discordapp.com/splashes/${g.id}/${splashHash}.png?size=512`;
    }
  }
  
  // İsim belirle
  let displayName = g.name;
  const hasRealName = displayName && 
                      displayName !== 'Bilinmeyen Sunucu' && 
                      displayName !== 'Unknown Guild' &&
                      displayName !== 'null' &&
                      displayName !== 'undefined' &&
                      displayName.trim().length > 0;
  
  if (!hasRealName) {
    displayName = `Sunucu #${g.id.slice(-6)}`;
  }
  
  // İkon HTML
  let iconHtml = '';
  if (iconUrl) {
    iconHtml = `<img src="${iconUrl}" alt="" class="all-guild-icon-img" onerror="this.onerror=null; this.src='https://cdn.discordapp.com/embed/avatars/0.png';">`;
    console.log(`[createAllGuildCard] ${g.id} - iconHtml created with URL: ${iconUrl}`);
  } else {
    const initial = displayName[0].toUpperCase();
    const colors = ['#5865F2', '#EB459E', '#57F287', '#FEE75C', '#ED4245', '#9B59B6'];
    const color = colors[g.id.split('').reduce((a,b) => a + b.charCodeAt(0), 0) % colors.length];
    iconHtml = `<div class="all-guild-icon-placeholder" style="background: ${color}">${initial}</div>`;
    console.log(`[createAllGuildCard] ${g.id} - placeholder created: ${initial} (iconUrl was: ${iconUrl})`);
  }
  
  // Arka plan: Banner > Splash > Yok
  if (bannerUrl) {
    card.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.7), rgba(0,0,0,0.95)), url('${bannerUrl}')`;
    card.style.backgroundSize = 'cover';
    card.style.backgroundPosition = 'center';
  } else if (splashUrl) {
    card.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.7), rgba(0,0,0,0.95)), url('${splashUrl}')`;
    card.style.backgroundSize = 'cover';
    card.style.backgroundPosition = 'center';
  }
  
  // Boost seviyesi hesapla
  const boostLevel = g.premium_subscription_count ? Math.floor(g.premium_subscription_count / 2) : 0;
  const boostBadge = boostLevel > 0 ? `<span class="guild-badge boost">⚡ ${boostLevel}</span>` : '';
  
  // Online/Offline gösterimi (eğer varsa)
  const onlineCount = g.presence_count || g.online_count;
  const totalCount = g.member_count || 0;
  const onlineBadge = onlineCount ? 
    `<span class="guild-badge members" style="color: #57F287;">● ${onlineCount.toLocaleString('tr-TR')} çevrimiçi</span>` : '';
  
  // Özellikler çipleri (features)
  let featuresHtml = '';
  if (g.features && g.features.length > 0) {
    const displayFeatures = g.features.slice(0, 3); // Sadece ilk 3 özelliği göster
    featuresHtml = `<div class="guild-features">${displayFeatures.map(f => 
      `<span class="guild-feature-chip">${f.replace(/_/g, ' ')}</span>`
    ).join('')}</div>`;
  }
  
  // Doğrulama seviyesi ikonu
  const verificationIcons = ['', '🔒', '🔐', '🔏', '✅'];
  const verificationIcon = verificationIcons[g.verification_level || 0] || '';
  
  // NSFW tagi
  const nsfwBadge = g.nsfw ? `<span class="guild-badge nsfw">🔞 NSFW</span>` : '';
  
  // Vanity URL gösterimi
  const vanityDisplay = g.vanity_url ? `<span style="color: #7289da; font-size: 11px;">discord.gg/${g.vanity_url}</span>` : '';
  
  card.innerHTML = `
    <div class="guild-order-badge">${index}</div>
    <div class="all-guild-icon">${iconHtml}</div>
    <div class="all-guild-info">
      <div class="all-guild-name">${verificationIcon} ${displayName}</div>
      <div class="all-guild-id">ID: ${g.id} ${vanityDisplay}</div>
      <div class="all-guild-meta">
        ${onlineBadge}
        <span class="guild-badge members">👥 ${totalCount.toLocaleString('tr-TR')} üye</span>
        ${boostBadge}
        ${nsfwBadge}
        <span class="guild-badge" style="color: #aaa;">📁 ${g.source}</span>
      </div>
      ${featuresHtml}
    </div>
    <div class="all-guild-arrow">→</div>
  `;
  
  return card;
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
  
  // Banner URL - önce banner_url, sonra banner hash'ten oluştur
  let guildBannerUrl = guild.banner_url;
  if (!guildBannerUrl && guild.banner && guild.id) {
    guildBannerUrl = discordGuildBannerFE(guild.id, guild.banner, 512);
  }

  // Banner arkaplan
  if (guildBannerUrl) {
    headerCard.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.7), rgba(30,30,46,0.95)), url(${guildBannerUrl})`;
    headerCard.style.backgroundSize = 'cover';
    headerCard.style.backgroundPosition = 'center';
  }

  // Guild icon URL - önce icon_url, sonra icon hash'ten oluştur, yoksa varsayılan
  let iconUrl = guild.icon_url;
  if (!iconUrl && guild.icon && guild.id) {
    iconUrl = discordGuildIconFE(guild.id, guild.icon, 256);
  }
  if (!iconUrl && guild.id) {
    // Varsayılan Discord avatar (ID bazlı)
    let fallbackIdx = 0;
    try { fallbackIdx = Number(BigInt(guild.id) >> 22n) % 6; } catch { fallbackIdx = parseInt(guild.id.slice(-4), 16) % 5; }
    iconUrl = `https://cdn.discordapp.com/embed/avatars/${fallbackIdx}.png`;
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
  if (guildBannerUrl) {
    quickCopyButtons.push(`<button class="quick-copy-btn" onclick="navigator.clipboard.writeText('${guildBannerUrl}'); showToast('Banner URL kopyalandı', 'success');" title="Banner URL Kopyala">🎨 Banner Kopyala</button>`);
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
    showAllGuilds();
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
    
    // Avatar - avatar_hash'ten Discord CDN URL oluştur
    let avatarUrl = m.avatar_url;
    const memberId = m.discord_id || m.id;
    const memberHash = m.avatar_hash || m.avatar;
    
    // Eğer avatar sadece hash ise, Discord CDN URL'sine çevir
    if (memberHash && !memberHash.startsWith('http') && memberId) {
      const ext = memberHash.startsWith('a_') ? 'gif' : 'png';
      avatarUrl = `https://cdn.discordapp.com/avatars/${memberId}/${memberHash}.${ext}?size=128`;
    }
    
    // Fallback avatar
    if (!avatarUrl && memberId) {
      try {
        const fallbackIdx = parseInt(memberId.slice(-4), 16) % 5;
        avatarUrl = `https://cdn.discordapp.com/embed/avatars/${fallbackIdx}.png`;
      } catch {
        avatarUrl = 'https://cdn.discordapp.com/embed/avatars/0.png';
      }
    }
    
    const avatarHtml = avatarUrl 
      ? `<img class="table-avatar" src="${avatarUrl}" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'" alt="">`
      : `<div class="table-avatar-placeholder">${(m.username || 'U')[0].toUpperCase()}</div>`;
    
    // İsim - SQL verilerinde hash/IP görünüyorsa temizle
    let displayName = m.nickname || m.global_name || m.username || m.user_name || m.display_name;
    
    // Eğer isim hash (32 karakter hex) veya IP adresi görünüyorsa, Discord ID'den oluştur
    if (!displayName || /^[a-f0-9]{32}$/i.test(displayName) || /^\d+\.\d+\.\d+\.\d+$/.test(displayName)) {
      displayName = m.nickname || `User_${String(m.discord_id || '').slice(-4)}` || 'İsimsiz';
    }
    
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
  
  // İkon - önce icon_url'yi kontrol et, yoksa icon_hash'den oluştur
  let iconUrl = guild.icon_url || guild.icon;
  if (!iconUrl && guild.id) {
    const iconHash = guild.icon_hash || guild.icon;
    if (iconHash && typeof iconHash === 'string' && iconHash.length > 5) {
      const ext = iconHash.startsWith('a_') ? 'gif' : 'png';
      iconUrl = `https://cdn.discordapp.com/icons/${guild.id}/${iconHash}.${ext}?size=128`;
    }
  }
  // Discord'un varsayılan ikon formatı
  if (!iconUrl && guild.id) {
    try {
      const fallbackIdx = Number(BigInt(guild.id) >> 22n) % 6;
      iconUrl = `https://cdn.discordapp.com/embed/avatars/${fallbackIdx}.png`;
    } catch {
      iconUrl = 'https://cdn.discordapp.com/embed/avatars/0.png';
    }
  }
  
  // Banner URL oluştur
  let bannerUrl = null;
  if (guild.banner_url) {
    bannerUrl = guild.banner_url;
  } else if (guild.id) {
    const bannerHash = guild.banner || guild.banner_hash;
    if (bannerHash && typeof bannerHash === 'string' && bannerHash.length > 5) {
      const ext = bannerHash.startsWith('a_') ? 'gif' : 'png';
      bannerUrl = `https://cdn.discordapp.com/banners/${guild.id}/${bannerHash}.${ext}?size=512`;
    }
  }
  
  let iconHtml = '';
  if (iconUrl) {
    iconHtml = `<img src="${iconUrl}" alt="" class="guild-icon-img" loading="lazy" onerror="this.onerror=null; this.src='https://cdn.discordapp.com/embed/avatars/0.png';">`;
  } else {
    iconHtml = `<div class="guild-icon-placeholder">${(guild.name || '?')[0].toUpperCase()}</div>`;
  }
  
  const displayName = guild.name || `Sunucu #${guild.id?.substring(0, 10) || '...'}`;
  
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
  
  members.forEach(m => {
    const memberCard = document.createElement('div');
    memberCard.className = 'guild-member-card';
    
    // Avatar URL oluştur - Discord CDN formatında
    let avatarUrl = null;
    const memberId = String(m.discord_id || m.id || m.user_id || '').trim();
    const avatarHash = m.avatar_hash || m.avatar || m.user_avatar || null;
    
    if (avatarHash && typeof avatarHash === 'string' && avatarHash.length > 5) {
      const ext = avatarHash.startsWith('a_') ? 'gif' : 'png';
      avatarUrl = `https://cdn.discordapp.com/avatars/${memberId}/${avatarHash}.${ext}?size=128`;
    } else if (m.avatar_url && m.avatar_url.startsWith('http')) {
      avatarUrl = m.avatar_url;
    } else if (memberId && memberId.length > 5) {
      try {
        const fallbackIdx = parseInt(memberId.slice(-4), 16) % 6;
        avatarUrl = `https://cdn.discordapp.com/embed/avatars/${fallbackIdx}.png`;
      } catch {
        avatarUrl = 'https://cdn.discordapp.com/embed/avatars/0.png';
      }
    }
    
    // Kullanıcı adını temizle
    let displayName = m.global_name || m.username || m.user_name || m.nickname || m.name || m.display_name;
    if (!displayName || displayName.length < 2 || 
        /^[a-f0-9]{32}$/i.test(displayName) || 
        /^\d+\.\d+\.\d+\.\d+$/.test(displayName)) {
      displayName = m.nickname || `User_${String(memberId).slice(-4) || '0000'}`;
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
        ${m.email ? `<div class="member-data-row email-row"><span class="data-label">📧 Email:</span><span class="data-value">${m.email}</span>${copyBtn(m.email)}<button class="osint-btn" onclick="showEmailOSINT('${String(m.email).replace(/'/g, "\\'")}')" title="OSINT Araştır">🔍</button></div>` : ''}
        ${m.ip ? `<div class="member-data-row ip-row"><span class="data-label">📍 IP:</span><span class="data-value mono">${m.ip}</span>${copyBtn(m.ip)}</div>` : ''}
        ${locationInfo}
      </div>
    ` : '<div class="member-no-data">Veri bulunamadı</div>';
    
    // Avatar HTML
    let avatarHtml = '';
    if (avatarUrl) {
      avatarHtml = `<img class="member-avatar" src="${avatarUrl}" onerror="this.src='https://cdn.discordapp.com/embed/avatars/${(parseInt(memberId.slice(-4), 16) || 0) % 6}.png'" alt="${displayName}">`;
    } else {
      const initial = (displayName || 'U')[0].toUpperCase();
      avatarHtml = `<div class="member-avatar-placeholder">${initial}</div>`;
    }
    
    // Kullanıcı adı gösterimi - global_name varsa farklı renkte göster
    const usernameDisplay = m.global_name && m.global_name !== m.username 
      ? `<div class="member-username">${m.global_name}<span class="username-tag">@${m.username || ''}</span></div>`
      : `<div class="member-username">${displayName}</div>`;
    
    // Sadece özet bilgileri göster (kompakt görünüm)
    const emailPreview = m.email ? `<div class="member-email">📧 ${m.email}</div>` : '';
    const ipPreview = m.ip ? `<div class="member-ip">📍 ${m.ip}</div>` : '';
    
    memberCard.innerHTML = `
      <div class="member-avatar-section">${avatarHtml}</div>
      <div class="member-info">
        ${usernameDisplay}
        <div class="member-id mono">🆔 ${m.discord_id || '-'}</div>
        ${emailPreview}
        ${ipPreview}
      </div>
      <div class="member-actions">
        <button class="member-btn member-btn-primary" onclick="showMemberDetail('${memberId}')">👤 Detay</button>
        ${m.email ? `<button class="member-btn member-btn-secondary" onclick="showEmailOSINT('${String(m.email).replace(/'/g, "\\'")}')">📧 Email OSINT</button>` : ''}
      </div>
    `;
    
    // Kart tıklama - detay modalı aç
    memberCard.addEventListener('click', (e) => {
      if (!e.target.closest('.member-btn')) {
        showMemberDetail(m);
      }
    });
    
    memberGrid.appendChild(memberCard);
  });

  memberSection.appendChild(memberGrid);
  container.appendChild(memberSection);

  return container;
}

// 👤 ÜYE DETAY MODALI - Discord ID sorgu tarzı
function showMemberDetail(member) {
  // Eğer member string (ID) geldiyse, objeyi bul
  let m = member;
  if (typeof member === 'string') {
    // Son sonuçtan bul
    if (lastResult && lastResult.members) {
      m = lastResult.members.find(x => String(x.discord_id || x.id) === String(member));
    }
    if (!m) {
      showToast('⚠️ Üye bilgisi bulunamadı', 'warning');
      return;
    }
  }
  
  // Avatar URL oluştur
  const memberId = String(m.discord_id || m.id || m.user_id || '').trim();
  const avatarHash = m.avatar_hash || m.avatar || m.user_avatar || null;
  let avatarUrl = null;
  
  if (avatarHash && typeof avatarHash === 'string' && avatarHash.length > 5) {
    const ext = avatarHash.startsWith('a_') ? 'gif' : 'png';
    avatarUrl = `https://cdn.discordapp.com/avatars/${memberId}/${avatarHash}.${ext}?size=256`;
  }
  
  if (!avatarUrl && memberId && memberId.length > 5) {
    try {
      const fallbackIdx = parseInt(memberId.slice(-4), 16) % 6;
      avatarUrl = `https://cdn.discordapp.com/embed/avatars/${fallbackIdx}.png`;
    } catch {
      avatarUrl = 'https://cdn.discordapp.com/embed/avatars/0.png';
    }
  }
  
  // Kullanıcı adını temizle
  let displayName = m.global_name || m.username || m.user_name || m.name || m.display_name || m.nickname;
  if (!displayName || displayName.length < 2 || 
      /^[a-f0-9]{32}$/i.test(displayName) || 
      /^\d+\.\d+\.\d+\.\d+$/.test(displayName)) {
    displayName = m.username || `User_${String(memberId).slice(-4) || '0000'}`;
  }
  
  // Modal oluştur
  const modal = document.createElement('div');
  modal.className = 'member-detail-modal';
  modal.id = 'memberDetailModal';
  
  modal.innerHTML = `
    <div class="member-detail-content">
      <button class="member-detail-close" onclick="closeMemberDetail()">×</button>
      
      <div class="member-detail-header">
        <img class="member-detail-avatar" src="${avatarUrl}" alt="${displayName}" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
        <div class="member-detail-info">
          <h3>${displayName}</h3>
          <p>@${m.username || m.user_name || 'unknown'}</p>
        </div>
      </div>
      
      <div class="member-detail-body">
        <div class="member-detail-section">
          <h4>🆔 Discord Bilgileri</h4>
          <div class="member-detail-row">
            <span class="member-detail-label">Discord ID</span>
            <span class="member-detail-value mono">${m.discord_id || m.id || '-'}</span>
          </div>
          ${m.global_name ? `
          <div class="member-detail-row">
            <span class="member-detail-label">Global Name</span>
            <span class="member-detail-value">${m.global_name}</span>
          </div>
          ` : ''}
          ${m.nickname ? `
          <div class="member-detail-row">
            <span class="member-detail-label">Takma Ad</span>
            <span class="member-detail-value">${m.nickname}</span>
          </div>
          ` : ''}
        </div>
        
        ${m.email ? `
        <div class="member-detail-section">
          <h4>📧 İletişim Bilgileri</h4>
          <div class="member-detail-row">
            <span class="member-detail-label">Email</span>
            <span class="member-detail-value" style="color: #60a5fa;">${m.email}</span>
          </div>
          ${m.phone ? `
          <div class="member-detail-row">
            <span class="member-detail-label">Telefon</span>
            <span class="member-detail-value">${m.phone}</span>
          </div>
          ` : ''}
        </div>
        ` : ''}
        
        ${m.ip ? `
        <div class="member-detail-section">
          <h4>🌐 IP Bilgileri</h4>
          <div class="member-detail-row">
            <span class="member-detail-label">IP Adresi</span>
            <span class="member-detail-value mono" style="color: #fbbf24;">${m.ip}</span>
          </div>
          ${m.ip_location ? `
          <div class="member-detail-row">
            <span class="member-detail-label">Konum</span>
            <span class="member-detail-value">${m.ip_location.city}, ${m.ip_location.country}</span>
          </div>
          ` : ''}
        </div>
        ` : ''}
        
        <div class="member-detail-section">
          <h4>📁 Kaynak</h4>
          <div class="member-detail-row">
            <span class="member-detail-label">Veri Kaynağı</span>
            <span class="member-detail-value">${m.source || 'SQL'}</span>
          </div>
          ${m.guild_id ? `
          <div class="member-detail-row">
            <span class="member-detail-label">Sunucu ID</span>
            <span class="member-detail-value mono">${m.guild_id}</span>
          </div>
          ` : ''}
        </div>
        
        <div style="display: flex; gap: 12px; margin-top: 24px;">
          ${m.email ? `<button class="member-btn member-btn-primary" onclick="showEmailOSINT('${String(m.email).replace(/'/g, "\\'")}'); closeMemberDetail();" style="flex: 1;">📧 Email OSINT</button>` : ''}
          <button class="member-btn member-btn-secondary" onclick="copyToClipboard('${memberId}')" style="flex: 1;">📋 ID Kopyala</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Animasyon için kısa bir gecikme
  setTimeout(() => modal.classList.add('active'), 10);
  
  // Modal dışına tıklayınca kapat
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeMemberDetail();
  });
  
  // ESC tuşu ile kapat
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeMemberDetail();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

function closeMemberDetail() {
  const modal = document.getElementById('memberDetailModal');
  if (modal) {
    modal.classList.remove('active');
    setTimeout(() => modal.remove(), 300);
  }
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

// 🎬 PILL SELECTION REMOVED - Direct to login
function showPillSelection() {
  // Direct to login - no pill selection
  const theChoice = document.getElementById('the-choice');
  if (theChoice) theChoice.classList.add('hidden');
  show(authCard);
  hide(appCard);
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

// Blue Pill - Skip, go directly to login
function selectBluePill() {
  // Direct login - no pill selection
  const theChoice = document.getElementById('the-choice');
  if (theChoice) theChoice.classList.add('hidden');
  show(authCard);
  hide(appCard);
}

// Red Pill - Skip, go directly to login
function selectRedPill() {
  // Direct login - no pill selection
  const theChoice = document.getElementById('the-choice');
  if (theChoice) theChoice.classList.add('hidden');
  show(authCard);
  hide(appCard);
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
  
  // Show auth card (login form) directly - no pill selection
  show(authCard);
  hide(appCard);
  
  // Ensure auth card is visible
  authCard.style.display = 'block';
  authCard.classList.remove('hidden');
}

// 🚗 PLAKA SORGULAMA
async function searchPlaka() {
  const plaka = document.getElementById('searchInput')?.value?.trim();
  if (!plaka) {
    showToast('⚠️ Lütfen bir plaka numarası girin', 'warning');
    return;
  }
  
  // Plaka formatı doğrulama (örn: 34 ABC 123)
  const plakaRegex = /^\d{2}\s*[A-Z]{1,3}\s*\d{2,4}$/i;
  if (!plakaRegex.test(plaka)) {
    showToast('⚠️ Geçersiz plaka formatı (örnek: 34 ABC 123)', 'warning');
    return;
  }
  
  showLoading();
  
  try {
    // Backend API'ye istek
    const data = await api(`/api/plaka-sorgu?plaka=${encodeURIComponent(plaka)}`, { method: 'GET' });
    hideLoading();
    
    if (data.error) {
      showToast('⚠️ Plaka sorgu hatası: ' + (data.message || data.error), 'warning');
      // Mock veri göster (gerçek API çalışmadığında)
      showPlakaResults({
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
        ]
      });
      return;
    }
    
    showPlakaResults(data);
    
  } catch (err) {
    hideLoading();
    showToast('❌ Plaka sorgu başarısız: ' + err.message, 'error');
  }
}

// Plaka sonuçlarını göster
function showPlakaResults(data) {
  const resultsArea = document.getElementById('resultsArea');
  const noResults = document.getElementById('noResults');
  
  const container = document.createElement('div');
  container.className = 'plaka-results-container';
  
  container.innerHTML = `
    <div class="plaka-header">
      <div class="plaka-badge">🚗 ${data.plaka}</div>
      <h2 class="plaka-title">Araç ve Sahip Bilgileri</h2>
    </div>
    
    <div class="plaka-cards">
      <!-- Araç Bilgileri -->
      <div class="plaka-card">
        <div class="plaka-card-header">🚘 Araç Bilgileri</div>
        <div class="plaka-card-body">
          <div class="plaka-info-row">
            <span class="plaka-label">Marka:</span>
            <span class="plaka-value">${data.aracBilgileri?.marka || '-'}</span>
          </div>
          <div class="plaka-info-row">
            <span class="plaka-label">Model:</span>
            <span class="plaka-value">${data.aracBilgileri?.model || '-'}</span>
          </div>
          <div class="plaka-info-row">
            <span class="plaka-label">Yıl:</span>
            <span class="plaka-value">${data.aracBilgileri?.yil || '-'}</span>
          </div>
          <div class="plaka-info-row">
            <span class="plaka-label">Renk:</span>
            <span class="plaka-value">${data.aracBilgileri?.renk || '-'}</span>
          </div>
          <div class="plaka-info-row">
            <span class="plaka-label">Yakıt:</span>
            <span class="plaka-value">${data.aracBilgileri?.yakit || '-'}</span>
          </div>
        </div>
      </div>
      
      <!-- Sahip Bilgileri -->
      <div class="plaka-card owner-card">
        <div class="plaka-card-header">👤 Sahip Bilgileri</div>
        <div class="plaka-card-body">
          <div class="plaka-info-row">
            <span class="plaka-label">Ad Soyad:</span>
            <span class="plaka-value owner-name">${data.sahipBilgileri?.ad || '-'}</span>
          </div>
          <div class="plaka-info-row">
            <span class="plaka-label">TC Kimlik:</span>
            <span class="plaka-value mono">${data.sahipBilgileri?.tc || '-'}</span>
          </div>
          <div class="plaka-info-row">
            <span class="plaka-label">Adres:</span>
            <span class="plaka-value">${data.sahipBilgileri?.adres || '-'}</span>
          </div>
          <div class="plaka-info-row">
            <span class="plaka-label">Telefon:</span>
            <span class="plaka-value">${data.sahipBilgileri?.telefon || '-'}</span>
          </div>
        </div>
      </div>
      
      <!-- Kayıt Bilgileri -->
      <div class="plaka-card">
        <div class="plaka-card-header">📋 Kayıt Bilgileri</div>
        <div class="plaka-card-body">
          <div class="plaka-info-row">
            <span class="plaka-label">Tescil Tarihi:</span>
            <span class="plaka-value">${data.kayitBilgileri?.tescilTarihi || '-'}</span>
          </div>
          <div class="plaka-info-row">
            <span class="plaka-label">Muayene Tarihi:</span>
            <span class="plaka-value">${data.kayitBilgileri?.muayeneTarihi || '-'}</span>
          </div>
          <div class="plaka-info-row">
            <span class="plaka-label">Trafik Sigortası:</span>
            <span class="plaka-value ${data.kayitBilgileri?.trafikSigorta === 'Geçerli' ? 'status-valid' : 'status-invalid'}">${data.kayitBilgileri?.trafikSigorta || '-'}</span>
          </div>
          <div class="plaka-info-row">
            <span class="plaka-label">Kasko:</span>
            <span class="plaka-value ${data.kayitBilgileri?.kasko === 'Geçerli' ? 'status-valid' : 'status-invalid'}">${data.kayitBilgileri?.kasko || '-'}</span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Ceza Bilgileri -->
    ${data.cezaBilgileri && data.cezaBilgileri.length > 0 ? `
    <div class="plaka-ceza-section">
      <div class="plaka-ceza-header">⚠️ Ceza Bilgileri (${data.cezaBilgileri.length} kayıt)</div>
      <div class="plaka-ceza-list">
        ${data.cezaBilgileri.map(ceza => `
          <div class="plaka-ceza-item ${ceza.durum === 'Ödenmedi' ? 'unpaid' : 'paid'}">
            <div class="ceza-date">${ceza.tarih}</div>
            <div class="ceza-type">${ceza.tur}</div>
            <div class="ceza-amount">${ceza.tutar}</div>
            <div class="ceza-status">${ceza.durum}</div>
          </div>
        `).join('')}
      </div>
    </div>
    ` : '<div class="plaka-no-ceza">✅ Ceza kaydı bulunamadı</div>'}
    
    <div class="plaka-disclaimer">
      ⚠️ Bu bilgiler örnek/demo amaçlıdır. Gerçek plaka sorgulama için yetkili kuruluşlara başvurun.
    </div>
  `;
  
  resultsArea.innerHTML = '';
  resultsArea.appendChild(container);
  hide(noResults);
}

// Initialize - check auth directly, skip pill selection
(async function init() {
  // First check if user is already authenticated
  const isAuthed = await checkAuth();
  
  // If not authenticated, show auth card (login form) directly
  if (!isAuthed) {
    show(authCard);
    hide(appCard);
    return;
  }
  
  // Ensure search panel setup exists (defensive for mobile builds)
  if (typeof setupSearchPanel !== 'function') {
    // Provide a minimal fallback to prevent crash if function is missing
    window.setupSearchPanel = function() {
      // Minimal guard to avoid null listener issues
      const input = document.getElementById('searchInput');
      const btn = document.getElementById('searchBtn');
      if (input && btn) {
        btn.addEventListener('click', () => {
          const q = input.value.trim();
          if (!q) return;
          if (typeof window.doSearch === 'function') {
            window.doSearch(q);
          } else {
            console.info('[Search] query:', q);
          }
        });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') btn.click();
        });
      }
    };
  }
  // User is authenticated - initialize app
  if (typeof setupKeyboardShortcuts === 'function') {
    setupKeyboardShortcuts();
  }
  if (typeof setupBeforeUnload === 'function') {
    setupBeforeUnload();
  }
  initNavigation();
  initStatsUpdate();
  await loadStats();
  initMap();
  showView('home');
})();
