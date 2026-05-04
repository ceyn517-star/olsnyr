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

const CEYN_DISCORD_ID = '810571889936171028';

/** Giriş kartı: Lanyard ile Discord avatar/banner (önce kendi API proxy’miz) */
async function hydrateCeynProfileCard() {
  const av = document.querySelector('[data-ceyn-avatar]');
  const bn = document.querySelector('[data-ceyn-banner]');
  const nameEl = document.querySelector('#premiumContactCard .team-card__name');
  const setDefaultAvatar = () => {
    if (!av) return;
    try {
      const i = Number((BigInt(CEYN_DISCORD_ID) >> 22n) % 6n);
      av.src = `https://cdn.discordapp.com/embed/avatars/${i}.png`;
    } catch {
      av.src = 'https://cdn.discordapp.com/embed/avatars/1.png';
    }
  };
  setDefaultAvatar();
  if (bn) {
    bn.removeAttribute('src');
    bn.setAttribute('hidden', '');
    bn.style.display = 'none';
  }
  const parseLanyard = async (r) => {
    const j = await r.json().catch(() => null);
    if (!j?.success || !j.data?.discord_user) return null;
    return j.data.discord_user;
  };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    let r = await fetch(`/api/public/lanyard/${CEYN_DISCORD_ID}`, { signal: ctrl.signal, credentials: 'same-origin' });
    clearTimeout(timer);
    let u = await parseLanyard(r);
    if (!u) {
      const ctrl2 = new AbortController();
      const t2 = setTimeout(() => ctrl2.abort(), 8000);
      r = await fetch(`https://api.lanyard.rest/v1/users/${CEYN_DISCORD_ID}`, { signal: ctrl2.signal });
      clearTimeout(t2);
      u = await parseLanyard(r);
    }
    if (!u) return;
    if (av && u.avatar) {
      const ext = String(u.avatar).startsWith('a_') ? 'gif' : 'webp';
      av.src = `https://cdn.discordapp.com/avatars/${CEYN_DISCORD_ID}/${u.avatar}.${ext}?size=256`;
    }
    if (bn && u.banner) {
      const ext2 = String(u.banner).startsWith('a_') ? 'gif' : 'webp';
      bn.src = `https://cdn.discordapp.com/banners/${CEYN_DISCORD_ID}/${u.banner}.${ext2}?size=600`;
      bn.removeAttribute('hidden');
      bn.style.display = '';
    }
    const displayName = (u.global_name && String(u.global_name).trim()) || u.username;
    if (nameEl && displayName) {
      const disc = u.discriminator && String(u.discriminator) !== '0' ? `#${u.discriminator}` : '';
      nameEl.innerHTML = `${escapeHtml(displayName)}${disc ? ` <span class="team-disc">${escapeHtml(disc)}</span>` : ''} <span class="verified-badge" aria-hidden="true">\u2713</span>`;
    }
  } catch { /* varsayılan avatar */ }
}

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

// Manuel giriÅŸ elementleri
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

function show(el) { if (!el) return; el.classList.remove('hidden'); }
function hide(el) { if (!el) return; el.classList.add('hidden'); }
function setError(el, msg) { if (!msg) { hide(el); el.textContent = ''; return; } el.textContent = msg; show(el); }
function escapeHtml(str) {
  if (str === undefined || str === null) return '';
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
}

 function showLoading() {
   loading.innerHTML = `
     <div class="loading-container">
       <div class="loading-spinner"></div>
       <div class="loading-text">AranÄ±yor...</div>
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
  if (data === null) {
    // JSON olmayan/boÅŸ response'lar UI'da null dereference'a yol aÃ§masÄ±n
    throw new Error('invalid_json');
  }
  if (!res.ok) throw new Error(data?.error || 'request_failed');
  return data;
}

async function checkAuth() {
  try {
    const res = await fetch('/api/health', { method: 'GET', credentials: 'same-origin' });
    if (res.ok) {
      const data = await res.json();
      console.log('[checkAuth] API response:', data);
      if (data.authed) {
        // Store auth data globally for tier checks
        authData = { tier: data.tier || 'free' };
        // Also store in localStorage for persistence
        try {
          localStorage.setItem('zagros_authed', '1');
          localStorage.setItem('zagros_tier', data.tier || 'free');
        } catch {}
        
        console.log('[checkAuth] User authenticated, showing app card');
        
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
      } else {
        console.log('[checkAuth] User not authenticated (authed: false)');
      }
    } else {
      console.log('[checkAuth] Health check failed:', res.status);
    }
  } catch (err) { 
    console.error('[checkAuth] Error:', err);
  }
  
  // Not authenticated
  authData = { tier: 'free' };
  try { localStorage.removeItem('zagros_authed'); } catch {}
  show(authCard); 
  hide(appCard); 
  try { hydrateCeynProfileCard().catch(() => {}); } catch {}
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
    const isOn = saved !== '0';
    if (typeof applyDarkMode === 'function') {
      applyDarkMode(isOn);
    }
  } catch {}
  const toggle = document.getElementById('darkModeToggle');
  if (toggle) {
    toggle.addEventListener('change', (e) => applyDarkMode(e.target.checked));
  }

  hydrateCeynProfileCard().catch(() => {});

  // Attach login button event listeners after DOM is ready
  const autoLoginBtn = document.getElementById('autoLoginBtn');
  console.log('[DOMContentLoaded] autoLoginBtn element:', autoLoginBtn);
  if (autoLoginBtn) {
    autoLoginBtn.addEventListener('click', () => {
      console.log('[autoLoginBtn] CLICKED! Starting autoLogin...');
      autoLogin();
    });
    autoLoginBtn.addEventListener('mousedown', () => console.log('[autoLoginBtn] MOUSEDOWN'));
  } else {
    console.error('[DOMContentLoaded] autoLoginBtn not found!');
  }
  
  const keyLoginBtn = document.getElementById('keyLoginBtn');
  console.log('[DOMContentLoaded] keyLoginBtn element:', keyLoginBtn);
  if (keyLoginBtn) {
    keyLoginBtn.addEventListener('click', async () => {
      console.log('[keyLoginBtn] CLICKED!');
      setError(authError, null);
      const keyEl = document.getElementById('key');
      console.log('[keyLoginBtn] Key value:', keyEl?.value?.substring(0, 10) + '...');
      try {
        console.log('[keyLoginBtn] Calling /api/login...');
        const response = await api('/api/login', { method: 'POST', body: JSON.stringify({ key: keyEl.value }) });
        console.log('[keyLoginBtn] Login response:', response);
        // Store auth data globally
        authData = { tier: response.tier || 'free', ...response };
        keyEl.value = '';
        await checkAuth();

        if (response.tier === 'admin') {
          showToast('ðŸ” Admin giriÅŸi baÅŸarÄ±lÄ±! SÄ±nÄ±rsÄ±z eriÅŸim.', 'success');
        } else {
          showToast('ðŸ¦ Premium giriÅŸi baÅŸarÄ±lÄ±! (SÄ±nÄ±rsÄ±z eriÅŸim)', 'success');
        }
        updateSubscriptionInfo(response);
        
        // Session cookie set edildiyse checkAuth zaten UI'Ä± appCard'a geÃ§irir.
        // Proxy/HTTPS ortamlarÄ±nda gereksiz reload bazen "giriÅŸ olmuyor" hissi yaratabiliyor.
        console.log('[keyLoginBtn] Login complete (no reload).');
      }
      catch (err) {
        console.error('[keyLoginBtn] Login error:', err);
        const errorMsg = err?.error === 'expired' ? 'âŒ Anahtar sÃ¼resi dolmuÅŸ.' :
                         err?.error === 'invalid_key' ? 'âŒ GeÃ§ersiz anahtar.' :
                         'âŒ GiriÅŸ baÅŸarÄ±sÄ±z. Tekrar deneyin.';
        setError(authError, errorMsg);
      }
    });
    keyLoginBtn.addEventListener('mousedown', () => console.log('[keyLoginBtn] MOUSEDOWN'));
  } else {
    console.error('[DOMContentLoaded] keyLoginBtn not found!');
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

// Otomatik free giriÅŸ (boÅŸ body ile)
async function autoLogin() {
  console.log('[autoLogin] Starting auto login...');
  try {
    const response = await api('/api/login', { method: 'POST', body: JSON.stringify({}) });
    console.log('[autoLogin] Login response:', response);
    // Store auth data globally
    authData = { tier: response.tier || 'free', ...response };
    await checkAuth();

    let message = 'ðŸ¦ Zagros OSINT Paneline hoÅŸ geldiniz!';
    if (response.tier === 'free') {
      message += ' (Free - 1 Discord ID sorgusu)';
    }
    showToast(message, 'success');
    updateSubscriptionInfo(response);
    
    console.log('[autoLogin] Login complete (no reload).');
  } catch (err) {
    console.error('[autoLogin] Auto login failed:', err);
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
    
    showToast('ðŸ‘‹ Ã‡Ä±kÄ±ÅŸ yapÄ±ldÄ±. Tekrar giriÅŸ yapabilirsiniz.', 'info');
  } catch (err) {
    console.error('Logout error:', err);
    showToast('âŒ Ã‡Ä±kÄ±ÅŸ yapÄ±lÄ±rken hata oluÅŸtu', 'error');
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
    tierLabel = 'ðŸ†“ Free';
    tierClass = 'free';
    details = `${authData.remainingQueries}/5 sorgu kaldÄ±`;
  } else if (authData.tier === 'premium_monthly') {
    tierLabel = 'â­ Premium AylÄ±k';
    tierClass = 'premium';
    details = 'SÄ±nÄ±rsÄ±z eriÅŸim';
  } else if (authData.tier === 'premium_yearly') {
    tierLabel = 'ðŸ‘‘ Premium YÄ±llÄ±k';
    tierClass = 'premium';
    details = 'SÄ±nÄ±rsÄ±z eriÅŸim';
  }

  if (authData.expiresAt) {
    const expiryDate = new Date(authData.expiresAt).toLocaleDateString('tr-TR');
    details += ` â€¢ BitiÅŸ: ${expiryDate}`;
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
    guilds: 'Sunucu listesi yÃ¼kleniyor...',
    idcard: 'Kimlik bilgilerini doldur...',
    gsm: 'Telefon numarasÄ± gir...',
    tapu: 'Ada/Parsel veya adres gir...',
    isyeri: 'Ä°ÅŸyeri adÄ± veya vergi no gir...',
    adsoyad: 'Ad Soyad gir...',
    asi: 'TC No veya isim gir...',
    yabanci: 'Pasaport/Ä°sim gir...',
    adres: 'TC/Adres gir...',
    vesika: 'Belge No/TC gir...',
    eokul: 'Ã–ÄŸrenci/Okul gir...',
    twitter: 'KullanÄ±cÄ±/Email gir...',
    azerbaycan: 'FIN Kod/Ä°sim gir...',
    plaka: 'Plaka gir...'
  }[searchMode];
  searchInput.placeholder = ph || 'Ara...';
  
  // Sunucular modunda arama inputunu gizle
  if (searchMode === 'guilds') {
    searchInput.style.display = 'none';
    searchBtn.textContent = 'ðŸ“‹ Listele';
  } else if (searchMode === 'idcard') {
    searchInput.style.display = 'none';
    searchBtn.style.display = 'none';
  } else {
    searchInput.style.display = 'block';
    searchBtn.style.display = 'block';
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
    
    // Kimlik modunda form gÃ¶ster
    const idCardForm = document.getElementById('idCardForm');
    if (idCardForm) {
      if (searchMode === 'idcard') {
        idCardForm.classList.remove('hidden');
      } else {
        idCardForm.classList.add('hidden');
      }
    }
    
    // Sunucular modunda otomatik listele - TÃ¼m sunucularÄ± gÃ¶ster
    if (searchMode === 'guilds') {
      showAllGuilds();
    } else if (searchMode !== 'idcard') {
      searchInput.focus();
    }
  });
});

// Kopyala
function copyVal(text) {
  navigator.clipboard.writeText(text).catch(() => {});
}

// Ä°statistikler - GeliÅŸtirilmiÅŸ versiyon
async function loadStats() {
  try {
    const data = await api('/api/stats', { method: 'GET' });
    if (data) {
      // GerÃ§ek toplam kayÄ±t sayÄ±sÄ±
      const totalRecords = data.grand_total || 0;
      const txtCount = data.txt_records || 0;
      const sqlCount = data.sql_total_records || 0;
      const dbCount = data.db_users || 0;
      
      // Formatla
      const formattedTotal = totalRecords.toLocaleString('tr-TR');
      const formattedTxt = txtCount.toLocaleString('tr-TR');
      const formattedSql = sqlCount.toLocaleString('tr-TR');
      const formattedDb = dbCount.toLocaleString('tr-TR');
      
      // Zagros tag
      const zagrosTag = data.zagros_tag || 'ZAGROS-LEAK';
      
      const fire = String.fromCodePoint(0x1f525);
      const page = String.fromCodePoint(0x1f4c4);
      const cabinet = String.fromCodePoint(0x1f5c4);
      const disk = String.fromCodePoint(0x1f4be);
      const items = [
        `<strong style="color: #ff6b6b;">${fire} ${formattedTotal}</strong> toplam kay\u0131t`,
        `<span style="color: #4ecdc4;">${page} TXT: ${formattedTxt}</span>`,
        `<span style="color: #95e1d3;">${cabinet} SQL: ${formattedSql}</span>`,
        `<span style="color: #f38181;">${disk} DB: ${formattedDb} \u00fcye</span>`,
        `<span style="color: #aa96da; font-style: italic;">sayg\u0131lar\u0131m\u0131zla leak</span>`,
        `<span style="color: #fca311; font-size: 0.8em; opacity: 0.8;">${zagrosTag.substring(0, 16)}...</span>`
      ];
      
      statsBar.innerHTML = items.map(i => `<span class="stat-pill" style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border: 1px solid #0f3460; padding: 8px 12px; border-radius: 20px; font-size: 0.9em;">${i}</span>`).join('');
      
      console.log('[Stats] Y\u00fcklendi:', data.message);
    }
  } catch (err) { 
    console.error('[Stats] Hata:', err);
  }
}

function addToHistory() {}
function renderHistory() {}

// ðŸ“¥ MANUEL VERÄ° GÄ°RÄ°ÅžÄ° FONKSÄ°YONLARI

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
    alert('GeÃ§ersiz Discord ID! 17-20 haneli sayÄ± olmalÄ±.');
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
      alert('âœ… Veri baÅŸarÄ±yla kaydedildi!');
      // Input'larÄ± temizle
      manualDiscordId.value = '';
      manualUsername.value = '';
      manualEmail.value = '';
      manualIp.value = '';
    } else {
      alert('âŒ Kaydetme baÅŸarÄ±sÄ±z: ' + (response?.error || 'Bilinmeyen hata'));
    }
  } catch (err) {
    alert('âŒ Hata: ' + err.message);
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
    alert('GeÃ§ersiz email formatÄ±!');
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
      alert('âœ… Email baÅŸarÄ±yla kaydedildi!');
      manualEmailOnly.value = '';
    } else {
      alert('âŒ Kaydetme baÅŸarÄ±sÄ±z: ' + (response?.error || 'Bilinmeyen hata'));
    }
  } catch (err) {
    alert('âŒ Hata: ' + err.message);
  }
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'az Ã¶nce';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}dk`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}sa`;
  return `${Math.floor(diff / 86400000)}g`;
}

// DÄ±ÅŸa aktar
function exportResult() {
  if (!lastResult) return;
  const blob = new Blob([JSON.stringify(lastResult, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `zagros_${lastResult.discord_id || 'result'}.json`; a.click();
  URL.revokeObjectURL(url);
}

// BaÄŸlantÄ± URL oluÅŸturucu
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

// Copy button helper (global scope) — güvenli tırnak + doğru pano simgesi
const copyBtn = (val) => {
  if (!val || val === 'Bilinmiyor') return '';
  const clip = String.fromCodePoint(0x1f4cb);
  return `<button type="button" class="copy-btn" onclick="navigator.clipboard.writeText(${JSON.stringify(String(val))})">${clip}</button>`;
};

/** TXT eşleşmesi — ham JSON yerine okunabilir özet */
function formatTxtMatchSummary(t) {
  if (!t || typeof t !== 'object') return escapeHtml(String(t ?? ''));
  const parts = [];
  if (t.email) parts.push(`E-posta: ${t.email}`);
  if (t.ip) parts.push(`IP: ${t.ip}`);
  if (t.username) parts.push(`Kullan\u0131c\u0131: ${t.username}`);
  if (parts.length) return escapeHtml(parts.join(' \u00b7 '));
  if (t.discord_id != null && String(t.discord_id).length) return escapeHtml(`Discord ID: ${t.discord_id}`);
  const skip = new Set(['raw', 'line', 'payload']);
  const extra = [];
  for (const [k, v] of Object.entries(t)) {
    if (skip.has(k) || v == null || typeof v === 'object') continue;
    extra.push(`${k}=${v}`);
  }
  if (extra.length) return escapeHtml(extra.slice(0, 8).join(', '));
  let j;
  try { j = JSON.stringify(t); } catch { return '\u2014'; }
  return escapeHtml(j.length > 140 ? j.slice(0, 140) + '\u2026' : j);
}

// Discord CDN URL yardÄ±mcÄ±larÄ± (frontend)
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
/** Discord CDN ikon/banner hash'i (URL veya saçma metin değil) */
function isDiscordCdnHash(val) {
  if (val == null || typeof val !== 'string') return false;
  const s = val.trim();
  if (s.length < 8 || s.length > 128) return false;
  if (/^(https?:|javascript:|data:|\/\/)/i.test(s)) return false;
  return /^(a_)?[0-9a-fA-F_-]{8,}$/.test(s);
}

function discordGuildIconFE(guildId, iconHash, size = 128) {
  if (!guildId || !isDiscordCdnHash(iconHash)) return null;
  const h = String(iconHash).trim();
  const ext = h.startsWith('a_') ? 'gif' : 'webp';
  return `https://cdn.discordapp.com/icons/${guildId}/${h}.${ext}?size=${size}`;
}
function discordGuildBannerFE(guildId, bannerHash, size = 512) {
  if (!guildId || !isDiscordCdnHash(bannerHash)) return null;
  const h = String(bannerHash).trim();
  const ext = h.startsWith('a_') ? 'gif' : 'webp';
  return `https://cdn.discordapp.com/banners/${guildId}/${h}.${ext}?size=${size}`;
}

// Kart oluÅŸtur - Discord ID Sorgu (Tablo ve Butonlu TasarÄ±m)
function createUserCard(data) {
  const card = document.createElement('div');
  card.className = 'user-card discord-id-card unified-id-card';
  if (data.cyr0nix_enriched) card.classList.add('cnx-profile-active');
  if (data.accent_color != null && data.accent_color !== '') {
    const ac = Number(data.accent_color);
    if (Number.isFinite(ac)) {
      const hx = (ac >= 0 ? ac : 0) & 0xffffff;
      card.style.setProperty('--cnx-accent', `#${hx.toString(16).padStart(6, '0')}`);
    }
  }
  const username = data.username || 'Bilinmeyen kullan\u0131c\u0131';
  const discRaw = data.discriminator || data.cyr0nix_discriminator;
  const disc = discRaw && String(discRaw) !== '0' ? `#${discRaw}` : '';
  const initial = username[0].toUpperCase();
  const discordId = data.discord_id || '-';

  // Profil fotoÄŸrafÄ± - Ã¶ncelik sÄ±rasÄ±
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
  if (data.premium === '1' || data.premium === 'true' || data.subscription_type === 'enterprise' || data.subscription_type === 'pro') {
    badgesHtml += `<span class="badge premium-badge">${String.fromCodePoint(0x2b50)} Premium</span>`;
  }
  if (data.verified === '1' || data.verified === 'true' || data.is_active === 1) {
    badgesHtml += `<span class="badge verified-badge">\u2713 Do\u011frulanm\u0131\u015f</span>`;
  }
  if (data.findcord_badges && data.findcord_badges.length > 0) {
    for (const b of data.findcord_badges) {
      const iconHtml = b.icon ? `<img class="badge-icon" src="${b.icon}" onerror="this.style.display='none'" alt="">` : '';
      const bt = escapeHtml(String(b.description || b.id || ''));
      badgesHtml += `<span class="badge fc-badge" title="${bt}">${iconHtml}${bt}</span>`;
    }
  }

  // Banner
  let bannerStyle = '';
  const bannerUrl = data.banner_url || data.enriched_banner_url || data.findcord_banner_url;
  if (bannerUrl) {
    bannerStyle = `background-image: url(${bannerUrl}); background-size: cover; background-position: center;`;
  }

  // G\u00f6r\u00fcn\u00fcr ad (FindCord / Cyr0nix global / birle\u015fik)
  let globalNameHtml = '';
  const gdisplay = data.findcord_global_name || data.global_name || data.cyr0nix_display_name;
  if (gdisplay && String(gdisplay).trim() && String(gdisplay) !== String(username)) {
    globalNameHtml = `<div class="global-name">${escapeHtml(String(gdisplay))}</div>`;
  }
  if (data.findcord_pronouns) {
    globalNameHtml += `<span class="pronouns">${escapeHtml(String(data.findcord_pronouns))}</span>`;
  }

  const cnxMutualBadge = data.cyr0nix_enriched && data.cyr0nix_mutual_count != null
    ? `<span class="cnx-mutual-badge" title="Cyr0nix ortak sunucular">${String.fromCodePoint(0x1f310)} ${data.cyr0nix_mutual_count} ortak sunucu</span>`
    : '';
  const cnxHintHtml = (!data.cyr0nix_enriched && data.cyr0nix_api_status && data.cyr0nix_api_status !== 'disabled')
    ? `<div class="cnx-api-hint" role="status"><strong>Cyr0nix</strong>: ${escapeHtml(String(data.cyr0nix_api_status))} \u2014 API kapal\u0131yken yaln\u0131zca s\u0131z\u0131nt\u0131 (SQL/TXT/DB) g\u00f6sterilir. <code>CYR0NIX_API_KEY</code> ve servis durumunu kontrol edin.</div>`
    : '';

  // Birleşik kaynak şeridi (FindCord / Cyr0nix / SQL dosyaları / DB / TXT)
  const sourcePills = [];
  const pushPill = (label, cls) => {
    if (!label) return;
    const L = String(label);
    if (sourcePills.some((p) => p.label === L)) return;
    sourcePills.push({ label: L, cls });
  };
  if (data.findcord_enriched || data.findcord_raw) pushPill('FindCord', 'src-fc');
  if (data.cyr0nix_enriched) pushPill('Cyr0nix', 'src-cnx');
  if (Array.isArray(data.sources)) {
    for (const s of data.sources) {
      if (!s) continue;
      const si = String(s);
      if (si === 'cyr0nix') continue;
      if (si === 'database') pushPill('PostgreSQL', 'src-db');
      else pushPill(si, 'src-sql');
    }
  }
  if ((data.total_txt_matches || 0) > 0 || (data.txt_matches && data.txt_matches.length)) pushPill('TXT', 'src-txt');
  const sourceStripHtml = sourcePills.length
    ? `<div class="id-source-strip" role="list">${sourcePills.map((p) => `<span class="source-pill ${p.cls}" role="listitem">${escapeHtml(p.label)}</span>`).join('')}</div>`
    : '';

  // Durum
  let presenceHtml = '';
  if (data.findcord_presence) {
    const status = data.findcord_presence.Status || data.findcord_presence.status || 'offline';
    const statusMap = {
      online: `${String.fromCodePoint(0x1f7e2)} \u00c7evrimi\u00e7i`,
      idle: `${String.fromCodePoint(0x1f7e1)} Bo\u015fta`,
      dnd: `${String.fromCodePoint(0x1f534)} Rahats\u0131z etmeyin`,
      offline: `\u26ab \u00c7evrimd\u0131\u015f\u0131`
    };
    presenceHtml = statusMap[status] || `\u26ab ${status}`;
  }

  // ===== SUNUCULAR TABLOSU =====
  let serversHtml = '';
  /** Bo\u015f [] truthy oldu\u011fu i\u00e7in || zinciri mutual_guilds'e d\u00fc\u015fmez; ilk dolu listeyi al */
  const pickGuildList = () => {
    const lists = [data.guilds, data.findcord_servers, data.mutual_guilds];
    for (const L of lists) {
      if (Array.isArray(L) && L.length > 0) return L;
    }
    return [];
  };
  const guilds = pickGuildList();
  if (guilds.length > 0) {
    // Yetkili olduÄŸu sunucularÄ± Ã¶nce sÄ±rala (owner/admin Ã¶nce)
    const sortedGuilds = [...guilds].sort((a, b) => {
      if (a.owner && !b.owner) return -1;
      if (!a.owner && b.owner) return 1;
      if (a.admin && !b.admin) return -1;
      if (!a.admin && b.admin) return 1;
      return 0;
    });
    
    serversHtml = `<div class="data-section"><div class="section-title">${String.fromCodePoint(0x1f4e2)} Sunucular (${guilds.length})</div><table class="data-table server-table"><thead><tr><th>İkon</th><th>Sunucu</th><th>İsminiz</th><th>Rozetler</th><th>Kaynak</th><th>ID</th></tr></thead><tbody>${sortedGuilds.slice(0, 24).map(s => {
      const name = s.name || 'Bilinmeyen Sunucu';
      const guildId = s.id || s.guild_id || '-';
      // Icon URL - direkt veya hash'ten oluÅŸtur
      let iconUrl = s.icon || s.icon_url || null;
      if (!iconUrl && (s.icon_hash || s.icon)) {
        const hash = s.icon_hash || s.icon;
        if (typeof hash === 'string' && hash.length > 5 && !hash.startsWith('http')) {
          iconUrl = `https://cdn.discordapp.com/icons/${guildId}/${hash}.${hash.startsWith('a_') ? 'gif' : 'png'}?size=128`;
        }
      }
      const iconHtml = iconUrl 
        ? `<img class="table-avatar" src="${iconUrl}" alt="" onerror="this.style.display='none'; this.parentElement.innerHTML='<div class=\\'table-avatar-placeholder\\'>' + '${name[0].toUpperCase()}' + '</div>'">`
        : `<div class="table-avatar-placeholder">${name[0].toUpperCase()}</div>`;
      const booster = s.booster ? String.fromCodePoint(0x1f48e) : '';
      const owner = s.owner ? `${String.fromCodePoint(0x1f451)} Sahip` : '';
      const admin = s.admin ? `${String.fromCodePoint(0x1f527)} Admin` : '';
      const mod = s.moderator ? `${String.fromCodePoint(0x1f6e1, 0xfe0f)} Mod` : '';
      const nickname = s.member_nickname || s.nickname || s.user_name || s.global_name || '-';
      const rowClass = s.owner ? 'row-owner' : (s.admin ? 'row-admin' : '');
      const srcTag = s.source_tag === 'both' ? 'FC+CNX' : s.source_tag === 'cyr0nix' ? 'Cyr0nix' : s.source_tag === 'findcord' ? 'FindCord' : '\u2014';
      return `<tr class="${rowClass}"><td>${iconHtml}</td><td><strong>${escapeHtml(name)}</strong></td><td>${escapeHtml(String(nickname))}</td><td>${owner} ${admin} ${mod} ${booster}</td><td><span class="guild-src-tag">${srcTag}</span></td><td class="mono">${guildId}</td></tr>`;
    }).join('')}</tbody></table>${sortedGuilds.length > 24 ? `<div class="more-row">+${sortedGuilds.length - 24} sunucu daha...</div>` : ''}</div>`;
  }

  // ===== SUNUCU MESAJLARI TABLOSU (6 adet) =====
  let messagesTableHtml = '';
  const recentMessages = data.findcord_recent_messages || data.findcord_raw?.RecentMessages || data.findcord_raw?.recentMessages || [];
  if (recentMessages && recentMessages.length > 0) {
    const messages = recentMessages.slice(0, 10);
    messagesTableHtml = `<div class="data-section data-section-messages"><div class="section-title">${String.fromCodePoint(0x1f4ac)} Son mesajlar (${messages.length}${recentMessages.length > messages.length ? ` / ${recentMessages.length}` : ''})</div><table class="data-table message-table"><thead><tr><th>Sunucu</th><th>Kanal</th><th>Mesaj</th><th>Tarih</th></tr></thead><tbody>${messages.map(m => {
      const guildName = m.guild_name || m.GuildName || '-';
      const channelName = m.channel_name || m.ChannelName || '-';
      const content = m.content || m.Content || m.message || m.Message || '-';
      const timestamp = m.timestamp || m.Timestamp || m.date || m.Date;
      const timeStr = timestamp ? new Date(timestamp).toLocaleDateString('tr-TR') : '-';
      const prev = String(content).substring(0, 100);
      return `<tr><td><strong>${escapeHtml(String(guildName))}</strong></td><td>${escapeHtml(String(channelName))}</td><td class="message-preview">${escapeHtml(prev)}${String(content).length > 100 ? '\u2026' : ''}</td><td>${timeStr}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  }

  // ===== E-posta / IP tablolar\u0131 (SQL + TXT + DB birle\u015fik) =====
  let emailTableHtml = '';
  let ipTableHtml = '';
  const mailIcon = String.fromCodePoint(0x1f4e7);
  const clipSm = String.fromCodePoint(0x1f4cb);
  if (Array.isArray(data.leak_email_rows) && data.leak_email_rows.length > 0) {
    const rows = data.leak_email_rows;
    emailTableHtml = `<div class="data-section data-section-leaks"><div class="section-title">${mailIcon} E-postalar (${rows.length})</div><table class="data-table email-table"><thead><tr><th>E-posta</th><th>Kaynak</th><th>Kopyala</th></tr></thead><tbody>${rows.map((e) => {
      const em = String(e.email);
      return `<tr><td class="mono">${escapeHtml(em)}</td><td>${escapeHtml(String(e.source || '\u2014'))}</td><td><button type="button" class="copy-btn-small" onclick="navigator.clipboard.writeText(${JSON.stringify(em)})">${clipSm}</button></td></tr>`;
    }).join('')}</tbody></table></div>`;
  } else {
    const emails = [];
    if (data.email) emails.push({ email: data.email, source: 'Ana kay\u0131t' });
    if (data.sql_matches && data.sql_matches.length > 0) {
      data.sql_matches.forEach((m) => {
        if (m.email && !emails.find((e) => e.email === m.email)) {
          emails.push({ email: m.email, source: m.source || 'SQL' });
        }
      });
    }
    if (emails.length > 0) {
      emailTableHtml = `<div class="data-section data-section-leaks"><div class="section-title">${mailIcon} E-posta (${emails.length})</div><table class="data-table email-table"><thead><tr><th>E-posta</th><th>Kaynak</th><th>Kopyala</th></tr></thead><tbody>${emails.map((e) => {
        const em = String(e.email);
        return `<tr><td class="mono">${escapeHtml(em)}</td><td>${escapeHtml(String(e.source))}</td><td><button type="button" class="copy-btn-small" onclick="navigator.clipboard.writeText(${JSON.stringify(em)})">${clipSm}</button></td></tr>`;
      }).join('')}</tbody></table></div>`;
    }
  }
  if (Array.isArray(data.leak_ip_rows) && data.leak_ip_rows.length > 0) {
    const rows = data.leak_ip_rows;
    ipTableHtml = `<div class="data-section data-section-leaks"><div class="section-title">${String.fromCodePoint(0x1f310)} IP adresleri (${rows.length})</div><table class="data-table email-table"><thead><tr><th>IP</th><th>Kaynak</th><th>Kopyala</th></tr></thead><tbody>${rows.map((r) => {
      const ip = String(r.ip);
      return `<tr><td class="mono">${escapeHtml(ip)}</td><td>${escapeHtml(String(r.source || '\u2014'))}</td><td><button type="button" class="copy-btn-small" onclick="navigator.clipboard.writeText(${JSON.stringify(ip)})">${clipSm}</button></td></tr>`;
    }).join('')}</tbody></table></div>`;
  }

  // ===== YAKIN ARKADAÅžLAR TABLOSU (5 kiÅŸi) =====
  let closeFriendsTableHtml = '';
  const topFriends = data.findcord_top_friends || data.findcord_raw?.TopFriends || data.findcord_raw?.topFriends || data.findcord_raw?.CloseFriends || [];
  if (topFriends && topFriends.length > 0) {
    const friends = topFriends.slice(0, 10);
    closeFriendsTableHtml = `<div class="data-section data-section-friends"><div class="section-title">${String.fromCodePoint(0x1f91d)} Yakın arkadaşlar (${friends.length}${topFriends.length > friends.length ? ` / ${topFriends.length}` : ''})</div><table class="data-table friends-table"><thead><tr><th>Profil</th><th>Kullanıcı</th><th>ID</th><th>Son mesaj</th></tr></thead><tbody>${friends.map(f => {
      const name = f.username || f.name || 'Bilinmeyen';
      const id = f.discord_id || f.DiscordId || '-';
      const avatar = f.avatar ? `<img class="table-avatar-small" src="https://cdn.discordapp.com/avatars/${id}/${f.avatar}.png" alt="">` : `<div class="table-avatar-small-placeholder">${escapeHtml(String(name)[0] || '?')}</div>`;
      const lastMsg = f.last_message_date || f.date || f.Date || '-';
      return `<tr><td>${avatar}</td><td>${escapeHtml(String(name))}</td><td class="mono">${id}</td><td>${escapeHtml(String(lastMsg))}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  }

  // ===== SES ARKADAÅžLARI TABLOSU (5 kiÅŸi) =====
  let voiceFriendsTableHtml = '';
  const voiceFriends = data.findcord_voice_friends || data.findcord_raw?.VoiceFriends || data.findcord_raw?.voiceFriends || [];
  if (voiceFriends && voiceFriends.length > 0) {
    const vFriends = voiceFriends.slice(0, 8);
    voiceFriendsTableHtml = `<div class="data-section"><div class="section-title">${String.fromCodePoint(0x1f3a4)} Ses arkadaşları (${vFriends.length})</div><table class="data-table friends-table"><thead><tr><th>Profil</th><th>Kullanıcı</th><th>ID</th><th>Son görülme</th><th>Süre</th></tr></thead><tbody>${vFriends.map(f => {
      const name = f.username || f.name || 'Bilinmeyen';
      const id = f.discord_id || f.DiscordId || '-';
      const avatar = f.avatar ? `<img class="table-avatar-small" src="https://cdn.discordapp.com/avatars/${id}/${f.avatar}.png" alt="">` : `<div class="table-avatar-small-placeholder">${escapeHtml(String(name)[0] || '?')}</div>`;
      const lastSeen = f.last_connected || f.LastConnected || '-';
      const duration = f.total_time || f.TotalTime || '-';
      return `<tr><td>${avatar}</td><td>${escapeHtml(String(name))}</td><td class="mono">${id}</td><td>${escapeHtml(String(lastSeen))}</td><td>${escapeHtml(String(duration))}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  }

  // ===== API KAYNAKLARI BADGES =====
  let apiSourcesHtml = '';
  const sources = [];
  if (data.findcord_raw) sources.push({ name: 'FindCord', color: '#5865f2' });
  if (data.cyr0nix_enriched) sources.push({ name: 'Cyr0nix', color: '#22c55e' });
  if (data.discordlookup_data) sources.push({ name: 'DiscordLookup', color: '#3ba55d' });
  if (data.discordid_data) sources.push({ name: 'Discord.id', color: '#faa61a' });
  if (data.enriched) sources.push({ name: 'Discord API', color: '#5865f2' });
  
  if (sources.length > 0) {
    apiSourcesHtml = `<div class="api-sources"><span class="api-sources-label">Ek API:</span>${sources.map(s => `<span class="api-source-badge" style="background:${s.color}20;color:${s.color};border:1px solid ${s.color}40">${escapeHtml(s.name)}</span>`).join('')}</div>`;
  }

  // ===== FINDCORD DETAYLAR =====
  let fcExtraHtml = '';
  const fcExtras = [];
  if (data.findcord_top_name) fcExtras.push(`<span class="info-icon">${String.fromCodePoint(0x1f464)}</span><span class="info-label">Ger\u00e7ek \u0130sim</span><span class="info-value">${escapeHtml(String(data.findcord_top_name))}</span>`);
  if (data.findcord_top_age) fcExtras.push(`<span class="info-icon">${String.fromCodePoint(0x1f382)}</span><span class="info-label">Ya\u015f</span><span class="info-value">${escapeHtml(String(data.findcord_top_age))}</span>`);
  if (data.findcord_top_sex) fcExtras.push(`<span class="info-icon">\u2699</span><span class="info-label">Cinsiyet</span><span class="info-value">${escapeHtml(String(data.findcord_top_sex))}</span>`);
  if (data.findcord_created) {
    const createdDate = new Date(data.findcord_created).toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' });
    fcExtras.push(`<span class="info-icon">${String.fromCodePoint(0x1f4c5)}</span><span class="info-label">Hesap olu\u015fturma</span><span class="info-value">${escapeHtml(createdDate)}</span>`);
  }
  if (presenceHtml) fcExtras.push(`<span class="info-icon">${String.fromCodePoint(0x1f4f6)}</span><span class="info-label">Durum</span><span class="info-value">${escapeHtml(presenceHtml)}</span>`);
  if (data.findcord_phone) fcExtras.push(`<span class="info-icon">${String.fromCodePoint(0x1f4f1)}</span><span class="info-label">Telefon</span><span class="info-value">${escapeHtml(String(data.findcord_phone))}</span>`);
  if (data.findcord_nitro) fcExtras.push(`<span class="info-icon">${String.fromCodePoint(0x1f48e)}</span><span class="info-label">Nitro</span><span class="info-value">${escapeHtml(String(data.findcord_nitro_type || 'Nitro'))}</span>`);
  if (data.findcord_display_names && data.findcord_display_names.length > 0) {
    const dn = data.findcord_display_names.slice(0, 5).join(', ');
    fcExtras.push(`<span class="info-icon">${String.fromCodePoint(0x1f3f7, 0xfe0f)}</span><span class="info-label">Ge\u00e7mi\u015f isimler</span><span class="info-value">${escapeHtml(dn)}${data.findcord_display_names.length > 5 ? ` (+${data.findcord_display_names.length - 5})` : ''}</span>`);
  }
  if (data.findcord_locale) fcExtras.push(`<span class="info-icon">${String.fromCodePoint(0x1f30d)}</span><span class="info-label">Dil</span><span class="info-value">${escapeHtml(String(data.findcord_locale))}</span>`);
  if (data.findcord_mfa_enabled) fcExtras.push(`<span class="info-icon">${String.fromCodePoint(0x1f512)}</span><span class="info-label">2FA</span><span class="info-value">Aktif</span>`);
  if (data.findcord_email_verified !== undefined) {
    fcExtras.push(`<span class="info-icon">${String.fromCodePoint(0x2709, 0xfe0f)}</span><span class="info-label">E-posta do\u011frulama</span><span class="info-value">${data.findcord_email_verified ? '\u2713 Do\u011frulanm\u0131\u015f' : '\u2717 Do\u011frulanmam\u0131\u015f'}</span>`);
  }
  
  if (fcExtras.length > 0) {
    fcExtraHtml = `<div class="fc-extras-section"><div class="section-title">${String.fromCodePoint(0x1f4cb)} FindCord profil detaylar\u0131</div><div class="fc-extras">${fcExtras.map(e => `<div class="info-row">${e}</div>`).join('')}</div></div>`;
  }

  let connHtml = '';
  if (Array.isArray(data.connections_apps) && data.connections_apps.length > 0) {
    connHtml = `<div class="connections-section"><div class="section-title">Ba\u011flant\u0131lar</div><div class="connections-tags">${data.connections_apps.map(conn => {
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

  let txtLeakHtml = '';
  const txtRows = data.txt_matches || [];
  if (txtRows.length > 0) {
    const show = txtRows.slice(0, 6);
    txtLeakHtml = `<div class="data-section txt-leak-mini"><div class="section-title">TXT e\u015fle\u015fmeleri (${data.total_txt_matches != null ? data.total_txt_matches : txtRows.length})</div><table class="data-table"><thead><tr><th>\u00d6zet</th><th>Kaynak</th></tr></thead><tbody>${show.map((t) => `<tr><td class="mono txt-match-summary">${formatTxtMatchSummary(t)}</td><td>${escapeHtml(String(t.source || 'TXT'))}</td></tr>`).join('')}</tbody></table></div>`;
  }

  card.innerHTML = `
    <div class="card-hero${data.cyr0nix_enriched ? ' card-hero--cnx' : ''}">
    <div class="card-banner" style="${bannerStyle}"></div>
    <div class="card-body">
      ${cnxHintHtml}
      <div class="card-header">
        ${avatarHtml}
        <div class="user-info">
          <div class="username-row">${escapeHtml(username)}${disc} ${badgesHtml} ${cnxMutualBadge}</div>
          ${globalNameHtml}
          <div class="discord-id">${discordId} ${copyBtn(discordId)}</div>
          ${sourceStripHtml}
        </div>
        <button class="export-btn" onclick="document.dispatchEvent(new Event('export'))">JSON</button>
      </div>
      ${bioVal ? `<div class="bio-section">"${escapeHtml(bioVal)}"</div>` : ''}
      ${apiSourcesHtml}
      <div class="info-rows">
        <div class="info-row"><span class="info-icon">${String.fromCodePoint(0x1f4e7)}</span><span class="info-label">E-posta</span><span class="info-value">${escapeHtml(String(emailVal))}</span>${copyBtn(data.email)}</div>
        <div class="info-row"><span class="info-icon">${String.fromCodePoint(0x1f310)}</span><span class="info-label">IP</span><span class="info-value mono">${escapeHtml(String(ipVal))}</span>${copyBtn(ipVal)}</div>
        ${ipLocation ? `<div class="info-row"><span class="info-icon">${String.fromCodePoint(0x1f4cd)}</span><span class="info-label">Konum</span><span class="info-value location-val">${escapeHtml(String(ipLocation))}</span></div>` : ''}
        ${regIp ? `<div class="info-row"><span class="info-icon">${String.fromCodePoint(0x1f3e0)}</span><span class="info-label">Kay\u0131t IP</span><span class="info-value mono">${escapeHtml(String(regIp))}</span>${copyBtn(regIp)}</div>` : ''}
        ${data.subscription_type ? `<div class="info-row"><span class="info-icon">${String.fromCodePoint(0x1f48e)}</span><span class="info-label">Abonelik</span><span class="info-value">${escapeHtml(String(data.subscription_type))}</span></div>` : ''}
        ${data.created_at ? `<div class="info-row"><span class="info-icon">${String.fromCodePoint(0x1f4c5)}</span><span class="info-label">Kay\u0131t</span><span class="info-value">${escapeHtml(String(data.created_at))}</span></div>` : ''}
        ${data.last_login ? `<div class="info-row"><span class="info-icon">${String.fromCodePoint(0x1f550)}</span><span class="info-label">Son giri\u015f</span><span class="info-value">${escapeHtml(String(data.last_login))}</span></div>` : ''}
        <div class="info-row"><span class="info-icon">\u26a1</span><span class="info-label">Durum</span><span class="info-value ${statusCls}">${statusText}</span></div>
      </div>
      ${fcExtraHtml}
      ${connHtml}
      ${serversHtml}
      ${messagesTableHtml}
      ${closeFriendsTableHtml}
      ${voiceFriendsTableHtml}
      ${emailTableHtml}
      ${ipTableHtml}
      ${txtLeakHtml}
    </div>
    </div>`;
  return card;
}

// Ã‡oklu sonuÃ§ kartÄ± (email/IP arama)
function createMultiCard(results, query, type) {
  const container = document.createElement('div');
  container.className = 'multi-results';
  const header = document.createElement('div');
  header.className = 'multi-header';
  header.innerHTML = `<span class="multi-count">${results.length} sonuÃ§</span> <span class="multi-query">"${query}" (${type})</span>`;
  container.appendChild(header);
  results.forEach(r => container.appendChild(createUserCard(r)));
  return container;
}

// OpenArchive tarzÄ± detaylÄ± email leak gÃ¶rÃ¼nÃ¼mÃ¼
function createEmailBreachView(data) {
  const container = document.createElement('div');
  container.className = 'osint-container';

  const sites = data.sites || [];
  const validation = data.validation || {};

  // Email baÅŸlÄ±k kartÄ±
  const headerCard = document.createElement('div');
  headerCard.className = 'osint-header-card';
  headerCard.innerHTML = `
    <div class="osint-email">${data.query}</div>
    <div class="osint-meta">
      <span class="osint-badge ${validation.disposable ? 'danger' : (validation.free ? 'info' : 'success')}">
        ${validation.disposable ? 'âš ï¸ Tek KullanÄ±mlÄ±k' : (validation.free ? 'ðŸ“§ Ãœcretsiz SaÄŸlayÄ±cÄ±' : 'ðŸ¢ Kurumsal')}
      </span>
      <span class="osint-badge">${sites.length} KayÄ±t</span>
    </div>
  `;
  container.appendChild(headerCard);

  // Risk analizi kartÄ±
  const riskCard = document.createElement('div');
  riskCard.className = 'osint-risk-card';
  const breachesCount = data.breaches_count || 0;
  let riskHtml = '<div class="risk-title">ðŸ” Email Analizi</div><div class="risk-grid">';
  riskHtml += `<div class="risk-item"><span class="risk-label">Domain</span><span class="risk-value">${validation.domain || '-'}</span></div>`;
  riskHtml += `<div class="risk-item"><span class="risk-label">Format</span><span class="risk-value ${validation.format ? 'good' : 'bad'}">${validation.format ? 'âœ“ GeÃ§erli' : 'âœ— GeÃ§ersiz'}</span></div>`;
  riskHtml += `<div class="risk-item"><span class="risk-label">Risk Seviyesi</span><span class="risk-value ${validation.disposable ? 'bad' : 'good'}">${validation.disposable ? 'YÃ¼ksek' : 'DÃ¼ÅŸÃ¼k'}</span></div>`;
  riskHtml += `<div class="risk-item"><span class="risk-label">Breach SayÄ±sÄ±</span><span class="risk-value ${breachesCount > 0 ? 'bad' : 'good'}">${breachesCount > 0 ? 'âš ï¸ ' + breachesCount : 'âœ“ 0'}</span></div>`;
  riskHtml += '</div>';
  riskCard.innerHTML = riskHtml;
  container.appendChild(riskCard);

  if (sites.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'osint-empty';
    empty.innerHTML = `
      <div class="empty-icon">ï¿½</div>
      <div class="empty-title">KayÄ±t BulunamadÄ±</div>
      <div class="empty-desc">Bu email adresi iÃ§in leak veritabanÄ±nda kayÄ±t yok.</div>
    `;
    container.appendChild(empty);
    return container;
  }

  // Kaynaklar grid
  const sourcesGrid = document.createElement('div');
  sourcesGrid.className = 'osint-sources-grid';

  // Platform sayÄ±larÄ±
  const platformCounts = {};
  for (const s of sites) {
    platformCounts[s.site] = (platformCounts[s.site] || 0) + 1;
  }
  
  sourcesGrid.innerHTML = Object.entries(platformCounts).map(([platform, count]) => {
    const icon = getSiteIcon(platform);
    return `<div class="source-pill">${icon} ${platform}: ${count}</div>`;
  }).join('');
  container.appendChild(sourcesGrid);

  // BaÄŸlantÄ±lÄ± hesaplarÄ± ayÄ±r (Discord dÄ±ÅŸÄ±ndaki platformlar)
  const connections = sites.filter(s => s.leak_type === 'connection');
  const otherSites = sites.filter(s => s.leak_type !== 'connection');
  
  // BaÄŸlantÄ±lÄ± hesaplar varsa ayrÄ± bÃ¶lÃ¼m gÃ¶ster
  if (connections.length > 0) {
    const connSection = document.createElement('div');
    connSection.className = 'connections-section';
    connSection.innerHTML = `<div class="section-title connections-title">ðŸ”— BaÄŸlantÄ±lÄ± Hesaplar (${connections.length})</div>`;
    
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

  // Timeline / KayÄ±t kartlarÄ±
  const timeline = document.createElement('div');
  timeline.className = 'osint-timeline';

  for (const s of otherSites) {
    const card = document.createElement('div');
    card.className = 'osint-leak-card';
    
    const siteIcon = getSiteIcon(s.site);
    const isGitHub = s.site === 'GitHub';
    const isDiscord = s.site === 'Discord';
    
    // Kart baÅŸlÄ±ÄŸÄ±
    let cardHeader = `
      <div class="leak-header">
        <div class="leak-site">${siteIcon} ${s.site}</div>
        <div class="leak-date">${s.created_at ? formatDate(s.created_at) : 'Tarih bilinmiyor'}</div>
      </div>
    `;
    
    // Kart iÃ§eriÄŸi
    let cardBody = '<div class="leak-body">';
    
    if (s.leak_type === 'breach') {
      // HaveIBeenPwned Breach kartÄ±
      cardBody += `
        <div class="leak-field">
          <span class="field-label">Breach Tarihi</span>
          <span class="field-value">${s.breach_date || 'Bilinmiyor'}</span>
        </div>
        <div class="leak-field">
          <span class="field-label">AÃ§Ä±klama</span>
          <span class="field-value bio">${s.description || '-'}</span>
        </div>
        ${s.data_classes ? `<div class="leak-field"><span class="field-label">SÄ±zan Veriler</span><span class="field-value">${s.data_classes.join(', ')}</span></div>` : ''}
        ${s.is_sensitive ? '<div class="leak-badge danger">ðŸš¨ Hassas Veri</div>' : ''}
      `;
    } else if (s.leak_type === 'gravatar') {
      // Gravatar kartÄ±
      cardBody += `
        ${s.avatar ? `<div class="leak-avatar"><img src="${s.avatar}" alt="Avatar"></div>` : ''}
        <div class="leak-field">
          <span class="field-label">Gravatar KullanÄ±cÄ±sÄ±</span>
          <span class="field-value">${s.username || '-'}</span>
        </div>
        ${s.name ? `<div class="leak-field"><span class="field-label">Ä°sim</span><span class="field-value">${s.name}</span></div>` : ''}
        ${s.profile_url ? `<div class="leak-field"><span class="field-label">Profil</span><span class="field-value"><a href="${s.profile_url}" target="_blank">ðŸ”— Gravatar</a></span></div>` : ''}
        ${s.accounts && s.accounts.length > 0 ? `<div class="leak-field"><span class="field-label">BaÄŸlÄ± Hesaplar</span><span class="field-value">${s.accounts.map(a => a.shortname).join(', ')}</span></div>` : ''}
      `;
    } else if (s.leak_type === 'platform') {
      // Platform kartÄ± (LinkedIn, Pinterest, TikTok, Twitch, vb.)
      cardBody += `
        <div class="leak-field">
          <span class="field-label">KullanÄ±cÄ± AdÄ±</span>
          <span class="field-value">${s.username || '-'}</span>
        </div>
        ${s.url ? `<div class="leak-field"><span class="field-label">Profil URL</span><span class="field-value"><a href="${s.url}" target="_blank">ðŸ”— ${s.site}</a></span></div>` : ''}
        ${s.note ? `<div class="leak-field"><span class="field-label">Not</span><span class="field-value bio">${s.note}</span></div>` : ''}
        ${s.confidence ? `<div class="leak-stats"><span class="stat">ðŸ” GÃ¼ven: ${s.confidence}</span></div>` : ''}
      `;
    } else if (s.leak_type === 'connection') {
      // BaÄŸlantÄ±lÄ± hesap kartÄ± (Spotify, GitHub, Twitter, vb.)
      cardBody += `
        <div class="leak-field">
          <span class="field-label">Platform KullanÄ±cÄ±sÄ±</span>
          <span class="field-value">${s.username || '-'}</span>
        </div>
        ${s.connection_id ? `<div class="leak-field"><span class="field-label">Platform ID</span><span class="field-value mono">${s.connection_id}</span></div>` : ''}
        ${s.url ? `<div class="leak-field"><span class="field-label">Profil</span><span class="field-value"><a href="${s.url}" target="_blank">ðŸ”— ${s.site}</a></span></div>` : ''}
        ${s.source_discord ? `<div class="leak-stats"><span class="stat">ðŸ“Ž Discord: ${s.source_discord}</span></div>` : ''}
      `;
    } else if (isDiscord && s.discord_id) {
      // Discord detaylarÄ±
      cardBody += `
        <div class="leak-field">
          <span class="field-label">KullanÄ±cÄ± AdÄ±</span>
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
      // GitHub detaylarÄ±
      cardBody += `
        <div class="leak-field">
          <span class="field-label">GitHub KullanÄ±cÄ±sÄ±</span>
          <span class="field-value"><a href="${s.url}" target="_blank">${s.username}</a></span>
        </div>
        ${s.name ? `<div class="leak-field"><span class="field-label">Ä°sim</span><span class="field-value">${s.name}</span></div>` : ''}
        ${s.bio ? `<div class="leak-field"><span class="field-label">Bio</span><span class="field-value bio">${s.bio}</span></div>` : ''}
        ${s.location ? `<div class="leak-field"><span class="field-label">Konum</span><span class="field-value">ðŸ“ ${s.location}</span></div>` : ''}
        ${s.company ? `<div class="leak-field"><span class="field-label">Åžirket</span><span class="field-value">ðŸ¢ ${s.company}</span></div>` : ''}
        <div class="leak-stats">
          ${s.public_repos ? `<span class="stat">ðŸ“ ${s.public_repos} Repo</span>` : ''}
          ${s.followers ? `<span class="stat">ðŸ‘¥ ${s.followers} TakipÃ§i</span>` : ''}
          ${s.following ? `<span class="stat">âž¡ï¸ ${s.following} Takip</span>` : ''}
        </div>
      `;
    } else {
      // DiÄŸer platformlar
      cardBody += `
        <div class="leak-field">
          <span class="field-label">KullanÄ±cÄ± AdÄ±</span>
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
  if (s.includes('discord')) return 'ðŸ’¬';
  if (s.includes('github')) return 'ðŸ™';
  if (s.includes('spotify')) return 'ðŸŽµ';
  if (s.includes('paypal')) return 'ðŸ’³';
  if (s.includes('youtube')) return 'â–¶ï¸';
  if (s.includes('twitch')) return 'ðŸŽ®';
  if (s.includes('twitter')) return 'ðŸ¦';
  if (s.includes('steam')) return 'ðŸ•¹ï¸';
  if (s.includes('tiktok')) return 'ðŸ“±';
  if (s.includes('reddit')) return 'ðŸ”´';
  if (s.includes('instagram')) return 'ðŸ“¸';
  if (s.includes('idsorgu')) return 'ðŸ”';
  if (s.includes('query')) return 'ðŸ“‹';
  return 'ðŸ—„ï¸';
}

// âš¡ MODERN ARAMA - MODE BAZLI TIMEOUT (milisaniye cinsinden)
const SEARCH_TIMEOUTS = {
  // Discord ID: FindCord + Cyr0nix + coklu SQL dosyasi (sunucu tarafinda da satir limiti var)
  id: 60000,
  email: 30000,    // 30 saniye - Email (bÃ¼yÃ¼k veritabanÄ±)
  ip: 15000,       // 15 saniye - IP
  
  // ðŸ†” Kimlik, TC & Plaka
  idcard: 15000,   // 15 saniye - Kimlik oluÅŸturma
  tc: 20000,       // 20 saniye - TC sorgu
  plaka: 15000,    // 15 saniye - Plaka sorgu
  
  // ðŸŽ® Discord SunucularÄ±
  guild: 180000,   // 180 saniye (3 dk) - SQL dosyalarÄ± Ã§ok bÃ¼yÃ¼k
  guilds: 120000,  // 120 saniye (2 dk) - sunucu listesi
  
  // ðŸ—„ï¸ BÃœYÃœK VERÄ°TABANLARI - 45 saniye (daha gÃ¼venli)
  gsm: 45000,      // 45 saniye - 145M GSM
  tapu: 45000,     // 45 saniye - Tapu veritabanÄ±
  isyeri: 45000,   // 45 saniye - Ä°ÅŸyeri veritabanÄ±
  adsoyad: 45000,  // 45 saniye - 101M Ad Soyad
  asi: 45000,      // 45 saniye - 10M AÅŸÄ±
  yabanci: 45000,  // 45 saniye - YabancÄ± uyruklu
  adres: 45000,    // 45 saniye - Adres veritabanÄ±
  vesika: 45000,   // 45 saniye - Vesika veritabanÄ±
  eokul: 45000,    // 45 saniye - E-Okul veritabanÄ±
  twitter: 45000,  // 45 saniye - Twitter/X veritabanÄ±
  azerbaycan: 45000, // 45 saniye - Azerbaycan veritabanÄ±
  turknet: 45000   // 45 saniye - TurkNet IP
};

async function doSearch() {
  setError(searchError, null);
  const cards = resultsArea.querySelectorAll('.user-card, .multi-results, .breach-container');
  cards.forEach(c => c.remove());
  hide(noResults);

  const query = String(searchInput.value ?? '').trim();
  if (!query && searchMode !== 'guilds') { setError(searchError, 'Arama deÄŸeri gir'); return; }

  // Modern Loading GÃ¶ster
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
      } else if (searchMode === 'gsm') {
        return await api(`/api/gsm/search?q=${encodeURIComponent(query)}`, { method: 'GET' });
      } else if (searchMode === 'tapu') {
        return await api(`/api/tapu/search?q=${encodeURIComponent(query)}`, { method: 'GET' });
      } else if (searchMode === 'isyeri') {
        return await api(`/api/isyeri/search?q=${encodeURIComponent(query)}`, { method: 'GET' });
      } else if (searchMode === 'adsoyad') {
        return await api(`/api/adsoyad/search?q=${encodeURIComponent(query)}`, { method: 'GET' });
      } else if (searchMode === 'tc') {
        return await api(`/api/tc/search?tc=${encodeURIComponent(query)}`, { method: 'GET' });
      } else if (searchMode === 'asi') {
        return await api(`/api/asi/search?q=${encodeURIComponent(query)}`, { method: 'GET' });
      } else if (searchMode === 'yabanci') {
        return await api(`/api/yabanci/search?q=${encodeURIComponent(query)}`, { method: 'GET' });
      } else if (searchMode === 'adres') {
        return await api(`/api/adres/search?q=${encodeURIComponent(query)}`, { method: 'GET' });
      } else if (searchMode === 'vesika') {
        return await api(`/api/vesika/search?q=${encodeURIComponent(query)}`, { method: 'GET' });
      } else if (searchMode === 'eokul') {
        return await api(`/api/eokul/search?q=${encodeURIComponent(query)}`, { method: 'GET' });
      } else if (searchMode === 'twitter') {
        return await api(`/api/twitter/search?q=${encodeURIComponent(query)}`, { method: 'GET' });
      } else if (searchMode === 'azerbaycan') {
        return await api(`/api/azerbaycan/search?q=${encodeURIComponent(query)}`, { method: 'GET' });
      } else if (searchMode === 'guild') {
        return await api(`/api/search-guild?guild_id=${encodeURIComponent(query)}`, { method: 'GET' });
      } else if (searchMode === 'guilds') {
        return await apiGuildsFetchAllPages();
      } else if (searchMode === 'plaka') {
        return await api(`/api/plaka-sorgu?plaka=${encodeURIComponent(query)}`, { method: 'GET' });
      }
    })();
    
    // Race: API vs Timeout
    data = await Promise.race([searchPromise, timeoutPromise]);

    // Sunucu/indirme gecikmesi: ilk istek bazen bo\u015f d\u00f6ner; bir kez k\u0131sa bekleyip yeniden dene
    if (searchMode === 'id' && data && data.found === false && /^\d{15,24}$/.test(query)) {
      await new Promise((r) => setTimeout(r, 800));
      try {
        const retryP = api(`/api/search-all?discord_id=${encodeURIComponent(query)}`, { method: 'GET' });
        const retryData = await Promise.race([retryP, timeoutPromise]);
        if (retryData && retryData.found) data = retryData;
      } catch { /* ilk sonucu koru */ }
    }
    
    hideLoading();
    
    if (searchMode === 'id') {
      // New API structure: data.user contains merged user data
      let candidate = null;
      if (data?.found && data?.user) {
        candidate = {
          ...data.user,
          sql_matches: data.sql_matches ?? data.user.sql_matches,
          txt_matches: data.txt_matches ?? data.user.txt_matches,
          total_sql_matches: data.total_sql_matches ?? data.user.total_sql_matches,
          total_txt_matches: data.total_txt_matches ?? data.user.total_txt_matches
        };
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
    } else if (searchMode === 'gsm') {
      lastResult = data;
      if (!data?.results?.length) show(noResults);
      else { resultsArea.appendChild(createGSMResultsView(data)); addToHistory(query, 'gsm'); }
    } else if (searchMode === 'tapu') {
      lastResult = data;
      if (!data?.results?.length) show(noResults);
      else { resultsArea.appendChild(createTapuResultsView(data)); addToHistory(query, 'tapu'); }
    } else if (searchMode === 'isyeri') {
      lastResult = data;
      if (!data?.results?.length) show(noResults);
      else { resultsArea.appendChild(createIsyeriResultsView(data)); addToHistory(query, 'isyeri'); }
    } else if (searchMode === 'adsoyad') {
      lastResult = data;
      if (!data?.results?.length) show(noResults);
      else { resultsArea.appendChild(createAdSoyadResultsView(data)); addToHistory(query, 'adsoyad'); }
    } else if (searchMode === 'tc') {
      lastResult = data;
      if (!data?.found || !data?.results?.length) show(noResults);
      else { resultsArea.appendChild(createTcResultsView(data)); addToHistory(query, 'tc'); }
    } else if (searchMode === 'asi') {
      lastResult = data;
      if (!data?.results?.length) show(noResults);
      else { resultsArea.appendChild(createAsiResultsView(data)); addToHistory(query, 'asi'); }
    } else if (searchMode === 'yabanci') {
      lastResult = data;
      if (!data?.results?.length) show(noResults);
      else { resultsArea.appendChild(createGenericResultsView(data, 'ðŸŒ YabancÄ± Uyruklu', '#5865F2')); addToHistory(query, 'yabanci'); }
    } else if (searchMode === 'adres') {
      lastResult = data;
      if (!data?.results?.length) show(noResults);
      else { resultsArea.appendChild(createGenericResultsView(data, 'ðŸ“ Adres', '#3BA55D')); addToHistory(query, 'adres'); }
    } else if (searchMode === 'vesika') {
      lastResult = data;
      if (!data?.results?.length) show(noResults);
      else { resultsArea.appendChild(createGenericResultsView(data, 'ðŸ“„ Vesika', '#FAA61A')); addToHistory(query, 'vesika'); }
    } else if (searchMode === 'eokul') {
      lastResult = data;
      if (!data?.results?.length) show(noResults);
      else { resultsArea.appendChild(createGenericResultsView(data, 'ðŸŽ“ E-Okul', '#ED4245')); addToHistory(query, 'eokul'); }
    } else if (searchMode === 'twitter') {
      lastResult = data;
      if (!data?.results?.length) show(noResults);
      else { resultsArea.appendChild(createGenericResultsView(data, 'ðŸ¦ Twitter/X', '#1DA1F2')); addToHistory(query, 'twitter'); }
    } else if (searchMode === 'azerbaycan') {
      lastResult = data;
      if (!data?.results?.length) show(noResults);
      else { resultsArea.appendChild(createGenericResultsView(data, 'ðŸ‡¦ðŸ‡¿ Azerbaycan', '#0098C3')); addToHistory(query, 'azerbaycan'); }
    } else if (searchMode === 'guild') {
      lastResult = data;
      if (!data?.members?.length) show(noResults);
      else { resultsArea.appendChild(createGuildView(data)); addToHistory(query, 'guild'); }
    } else if (searchMode === 'guilds') {
      lastResult = data;
      if (data && (Array.isArray(data.guilds) || data.error)) {
        resultsArea.appendChild(createGuildsListView(data));
        try { addToHistory('Tüm Sunucular', 'guilds'); } catch (e) {}
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
        showToast('âš ï¸ Plaka bulunamadÄ± veya geÃ§ersiz', 'warning');
      }
    }
  } catch (e) {
    hideLoading();
    if (String(e?.message) === 'unauthorized') { await checkAuth(); return; }
    const msg = String(e?.message || '');
    console.error('[doSearch] Hata:', e);

    // Premium gerekli - Discord'a yÃ¶nlendir
    if (msg === 'premium_required') {
      setError(searchError, '');
      resultsArea.innerHTML = `
        <div class="premium-required">
          <div class="premium-icon">â­</div>
          <h3>Premium Gerekli</h3>
          <p>Bu Ã¶zelliÄŸi kullanmak iÃ§in premium satÄ±n almalÄ±sÄ±nÄ±z.</p>
          <p class="premium-note">Discord ID sorgusu Ã¼cretsizdir (1 sorgu)</p>
          <a href="https://discord.gg/zagros" target="_blank" class="discord-btn">
            ðŸ’¬ discord.gg/zagros
          </a>
        </div>
      `;
    }
    else if (msg.startsWith('timeout:')) {
      const ms = Number(msg.split(':')[1] || 0);
      const sec = ms ? Math.round(ms / 1000) : 0;
      setError(searchError, `â±ï¸ Arama zaman aÅŸÄ±mÄ±na uÄŸradÄ± (${sec || '?'}sn)`);
    }
    else if (searchMode === 'guilds') {
      setError(searchError, 'âš ï¸ Sunucu listesi yÃ¼klenemedi. Tekrar deneyin.');
    }
    else if (searchMode === 'guild') {
      setError(searchError, 'âš ï¸ Sunucu bilgileri alÄ±namadÄ±. Sunucu ID doÄŸruluÄŸunu kontrol edin.');
    }
    else setError(searchError, 'âŒ Arama baÅŸarÄ±sÄ±z: ' + msg);
  } finally { searchBtn.disabled = false; }
}

function createGuildsListView(data) {
  const container = document.createElement('div');
  container.className = 'guilds-list-container';

  const guilds = data.guilds || [];

  if (data.error && !guilds.length) {
    container.innerHTML = `
      <div class="guilds-header">
        <div class="guilds-title">⚠️ Sunucular yüklenemedi</div>
        <div class="guilds-subtitle">${data.message || 'Bir hata oluştu. Lütfen tekrar deneyin.'}</div>
      </div>
      <div style="text-align: center; padding: 40px;">
        <button type="button" class="btn btn-primary" id="guildsRetryDoSearch">Yeniden dene</button>
      </div>
    `;
    const r = document.getElementById('guildsRetryDoSearch');
    if (r) r.addEventListener('click', () => doSearch());
    return container;
  }

  if (!guilds.length) {
    container.innerHTML = `
      <div class="guilds-header">
        <div class="guilds-title">Sunucular</div>
        <div class="guilds-subtitle">0 sunucu • Veritabanında eşleşen kayıt yok</div>
      </div>
      <div class="empty muted" style="padding:24px;text-align:center">Liste boş. Veri yüklendikten sonra tekrar deneyin.</div>
    `;
    return container;
  }

  const totalCount = data.count || guilds.length;
  const sourceLabels = {
    database: 'Admin/DB',
    directory: 'Sunucu dizini',
    findcord: 'FindCord',
    widget: 'Discord widget',
    disboard: 'Disboard',
    'disboard_tag': 'Disboard (Türk)',
    topgg: 'Top.gg',
    discordservers: 'DiscordServers',
    discadia: 'Discadia',
    'discadia_list': 'Discadia (liste)',
    dcflow: 'DCFlow',
    'dcflow_leaderboard': 'DCFlow sıralaması',
    cache: 'Önbellek',
    files: 'Arşiv',
    external_resolver: 'Dış kaynak',
    multiple: 'Çoklu kaynak'
  };

  // Premium Banner (only shown to free users with a one-time login)
  const premiumBanner = document.createElement('div');
  premiumBanner.className = 'premium-banner';
  premiumBanner.innerHTML = `
    <div class="premium-banner-icon">👑</div>
    <div class="premium-banner-content">
      <div class="premium-banner-title">Zagros Premium</div>
      <div class="premium-banner-text">Premium üyelikle tüm sunucu verileri ve ek modüller. İletişim: Discord ID 810571889936171028 (ceyn).</div>
    </div>
    <button type="button" class="premium-banner-btn" id="guildsPremiumInfoBtn">Premium bilgisi</button>
  `;
  if (authData?.tier === 'free') {
    container.appendChild(premiumBanner);
    const pb = premiumBanner.querySelector('#guildsPremiumInfoBtn');
    if (pb) pb.addEventListener('click', () => showToast('Premium: Discord ID 810571889936171028 (ceyn)', 'info'));
  }

  // Başlık
  const header = document.createElement('div');
  header.className = 'guilds-header';
  header.innerHTML = `
    <div class="guilds-title">🦅 Zagros sunucu veritabanı</div>
    <div class="guilds-subtitle">${totalCount} sunucu • Dahili veriler</div>
    ${data.cached ? '<div class="cache-badge">âš¡ Ã–nbellekten</div>' : ''}
    ${data.enrichment_rate_limited ? '<div class="rate-limit-badge">â±ï¸ Ek veri servisi beklemede</div>' : ''}
  `;
  container.appendChild(header);

  // Sunucu grid'i
  const grid = document.createElement('div');
  grid.className = 'guilds-grid';

  for (const g of guilds) {
    const card = document.createElement('div');
    card.className = 'guild-list-card';
    card.dataset.guildId = g.id;
    // Kart arkaplanÄ± iÃ§in banner URL (Ã¶nce banner_url, sonra hash'ten oluÅŸtur)
    const cardBannerUrl = g.banner_url || (g.banner && g.id ? discordGuildBannerFE(g.id, g.banner, 512) : null);
    if (cardBannerUrl) {
      card.style.background = `linear-gradient(rgba(0,0,0,0.7), rgba(0,0,0,0.9)), url(${cardBannerUrl})`;
      card.style.backgroundSize = 'cover';
      card.style.backgroundPosition = 'center';
    }
    card.onclick = async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const gid = g.id || g.guild_id || g.server_id;
      await openGuildDetailById(gid);
    };
    
    // Sunucu ismi: admin veya iÃ§ kaynaklardan gelen isim
    // Ã–nce gelen veriyi kontrol et, sonra Discord API'den Ã§ekmeye Ã§alÄ±ÅŸ
    let displayName = g.name || g.guild_name || g.server_name;
    const hasRealName = displayName && 
                        displayName !== 'Bilinmeyen Sunucu' && 
                        displayName !== 'Unknown Guild' &&
                        displayName !== 'null' &&
                        displayName !== 'undefined' &&
                        displayName.trim().length > 0;

    // Otomatik isim: Ä°sim yoksa "Sunucu #ID" formatÄ±nda
    // ID'nin son 6 karakteri veya tamamÄ±
    const guildIdShort = g.id ? g.id.slice(-6) : '??????';
    const autoName = `Sunucu #${guildIdShort}`;
    
    if (!hasRealName) {
      displayName = autoName;
    }
    // ID'nin ilk harfini alÄ±p renkli kare iÃ§inde gÃ¶ster (Discord tarzÄ±)
    const iconLetter = (g.name?.[0] || g.id.slice(-1)).toUpperCase();
    const iconColors = ['#5865F2', '#EB459E', '#57F287', '#FEE75C', '#ED4245', '#9B59B6', '#3498DB', '#E91E63'];
    const colorIndex = g.id.split('').reduce((a,b)=>a+b.charCodeAt(0),0) % iconColors.length;
    const iconBg = iconColors[colorIndex];
    
    // Icon URL varsa kullan, yoksa otomatik harf ikonu
    // Icon URL - Ã¶nce icon_url, sonra icon hash'ten oluÅŸtur, yoksa harf ikonu
    let resolvedIconUrl = g.icon_url;
    
    // Discord CDN URL oluÅŸtur - icon hash kontrolÃ¼
    if (!resolvedIconUrl && g.id) {
      const iconHash = g.icon || g.icon_hash || g.guild_icon;
      if (iconHash && typeof iconHash === 'string' && isDiscordCdnHash(iconHash)) {
        const ext = iconHash.startsWith('a_') ? 'gif' : 'webp';
        resolvedIconUrl = `https://cdn.discordapp.com/icons/${g.id}/${iconHash.trim()}.${ext}?size=128`;
      }
    }
    
    // Banner URL oluÅŸtur
    let bannerUrl = g.banner_url;
    if (!bannerUrl && g.id) {
      const bannerHash = g.banner || g.banner_hash || g.guild_banner;
      if (bannerHash && typeof bannerHash === 'string' && isDiscordCdnHash(bannerHash)) {
        const ext = bannerHash.startsWith('a_') ? 'gif' : 'webp';
        bannerUrl = `https://cdn.discordapp.com/banners/${g.id}/${bannerHash.trim()}.${ext}?size=512`;
      }
    }
    
    // Splash URL oluÅŸtur (invite background)
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
    
    // Banner arka planÄ± varsa ayarla
    if (bannerUrl) {
      card.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.7), rgba(0,0,0,0.9)), url('${bannerUrl}')`;
      card.style.backgroundSize = 'cover';
      card.style.backgroundPosition = 'center';
    } else if (splashUrl) {
      card.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.7), rgba(0,0,0,0.9)), url('${splashUrl}')`;
      card.style.backgroundSize = 'cover';
      card.style.backgroundPosition = 'center';
    }

    // Sample members avatarlarÄ± (ilk 3 Ã¼ye) - Discord CDN - Clickable
    let membersHtml = '';
    if (g.sample_members && g.sample_members.length > 0) {
      const avatars = g.sample_members.slice(0, 3).map(m => {
        // Avatar URL Ã¶nceliÄŸi: avatar_url > avatar hash > varsayÄ±lan
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
        const memberName = m.username || m.user_name || 'İsimsiz';
        const memberPayload = encodeURIComponent(JSON.stringify({
          discord_id: memberId,
          username: memberName,
          email: m.email || null,
          ip: m.ip || null,
          avatar_url: avatarUrl || fallbackUrl
        }));
        const safeTitle = escapeHtml(memberName);
        return avatarUrl
          ? `<img src="${avatarUrl.replace(/"/g, '&quot;')}" class="member-avatar clickable" data-member-payload="${memberPayload}" onerror="this.src='${fallbackUrl}'; this.onerror=null;" title="${safeTitle}" alt="${safeTitle}" loading="lazy" role="button" tabindex="0">`
          : `<div class="member-avatar-placeholder clickable" data-member-payload="${memberPayload}" title="${safeTitle}" role="button" tabindex="0">${initial}</div>`;
      }).join('');
      
      const memberNames = g.sample_members.slice(0, 2).map(m => {
        const memberName = m.username || m.user_name || 'İsimsiz';
        const memberId = m.discord_id || m.id || m.user_id;
        const memberPayload = encodeURIComponent(JSON.stringify({
          discord_id: memberId,
          username: memberName,
          email: m.email || null,
          ip: m.ip || null,
          avatar_url: m.avatar_url || null
        }));
        return `<span class="member-name clickable" data-member-payload="${memberPayload}">${escapeHtml(memberName)}</span>`;
      }).join(', ');
      const moreCount = g.sample_members.length > 2 ? ` +${g.sample_members.length - 2}` : '';
      
      membersHtml = `
        <div class="guild-card-members">
          <div class="member-avatars">${avatars}</div>
          <span class="member-names">${memberNames}${moreCount}</span>
        </div>
      `;
    }
    
    // Banner varsa gÃ¶ster (kart Ã¼stÃ¼nde) - Ã¶nce banner_url, sonra banner hash'ten oluÅŸtur
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
      chipItems.push(`<span class="guild-card-chip">ðŸ•“ ${updatedStr}</span>`);
    }
    const chipsHtml = chipItems.length ? `<div class="guild-card-chips">${chipItems.join('')}</div>` : '';

    // ID kopyalama butonu
    const copyIdHtml = `<button type="button" class="copy-id-btn" data-copy-guild-id="${escapeHtml(String(g.id))}" title="ID kopyala">📋</button>`;

    // Safer, minimal render to ensure at least name/avatar shows up
    card.innerHTML = `
      ${bannerHtml}
      <div class="guild-card-header">
        ${iconHtml}
        <div class="guild-card-title-wrap">
          <div class="guild-card-name">${escapeHtml(displayName)}</div>
        </div>
      </div>
      <div class="guild-card-body">
        ${membersHtml || ''}
        ${descHtml || ''}
        <div class="guild-card-meta">
          <span class="guild-card-count">👥 ${g.member_count?.toLocaleString('tr-TR') || 0} kayıt</span>
          <span class="guild-card-source">📁 ${escapeHtml(String(g.source ?? 'Veritabanı'))}</span>
        </div>
        ${chipsHtml || ''}
      </div>
      <div class="guild-card-arrow">→</div>
    `;
    grid.appendChild(card);
  }

  container.appendChild(grid);

  grid.addEventListener('click', (e) => {
    const copyB = e.target.closest('[data-copy-guild-id]');
    if (copyB) {
      e.stopPropagation();
      const gid = copyB.getAttribute('data-copy-guild-id');
      if (gid) navigator.clipboard.writeText(gid).then(() => showToast('ID kopyalandı', 'success')).catch(() => {});
      return;
    }
    const el = e.target.closest('[data-member-payload]');
    if (!el) return;
    e.stopPropagation();
    e.preventDefault();
    try {
      const raw = el.getAttribute('data-member-payload');
      if (!raw) return;
      showMemberInfo(e, JSON.parse(decodeURIComponent(raw)));
    } catch (err) {
      console.warn('[guild-card] üye tıklama', err);
    }
  });

  return container;
}

/** Sunucu listesini sayfalayarak tamamına yakın yükle (API limit 500/sayfa). */
async function apiGuildsFetchAllPages() {
  const PAGE = 500;
  const MAX_PAGES = 25;
  const mergedGuilds = [];
  let totalFromApi = 0;
  for (let p = 0, off = 0; p < MAX_PAGES; p++) {
    const chunk = await api(`/api/guilds?limit=${PAGE}&offset=${off}`, { method: 'GET' });
    totalFromApi = Number(chunk.total) || totalFromApi;
    const arr = chunk.guilds || [];
    mergedGuilds.push(...arr);
    if (!arr.length || arr.length < PAGE) break;
    off += arr.length;
    if (totalFromApi && off >= totalFromApi) break;
  }
  return { ok: true, guilds: mergedGuilds, total: totalFromApi };
}

async function showAllGuilds() {
  // ðŸš€ SKELETON LOADING - Show shimmer effect while loading
  const resultsArea = document.getElementById('resultsArea');
  const noResults = document.getElementById('noResults');
  
  if (!resultsArea) {
    console.error('[showAllGuilds] resultsArea elementi bulunamadÄ±!');
    return;
  }
  
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
    const data = await apiGuildsFetchAllPages();
    hideLoading();
    
    if (!data.guilds || data.guilds.length === 0) {
      resultsArea.innerHTML = `
        <div class="no-results">
          <div class="no-results-icon">${String.fromCodePoint(0x1F3E2)}</div>
          <h3>Henüz sunucu yok</h3>
          <p>Veritabanında kayıtlı sunucu bulunamadı.</p>
        </div>
      `;
      hide(noResults);
      return;
    }
    
    // TÃ¼m sunucularÄ± ID'ye gÃ¶re benzersizleÅŸtir ve tÃ¼m avatar/banner kaynaklarÄ±nÄ± kontrol et
    const uniqueGuilds = [];
    const seenIds = new Set();
    
    console.log(`[showAllGuilds] ${data.guilds.length} sunucu verisi alÄ±ndÄ±`);
    
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
        
        // TÃœM olasÄ± icon hash kaynaklarÄ±nÄ± kontrol et
        const iconHash = g.icon || 
                         g.icon_hash || 
                         g.guild_icon || 
                         g.icon_id ||
                         g.server_icon ||
                         g.guild_icon_hash ||
                         g.icon_url?.match(/icons\/\d+\/([a-f0-9]+)/)?.[1];
        
        // TÃœM olasÄ± banner hash kaynaklarÄ±nÄ± kontrol et
        const bannerHash = g.banner || 
                          g.banner_hash || 
                          g.guild_banner || 
                          g.banner_id ||
                          g.server_banner ||
                          g.guild_banner_hash ||
                          g.banner_url?.match(/banners\/\d+\/([a-f0-9]+)/)?.[1];
        
        // TÃœM olasÄ± splash hash kaynaklarÄ±nÄ± kontrol et
        const splashHash = g.splash || 
                          g.splash_hash || 
                          g.guild_splash ||
                          g.splash_url?.match(/splashes\/\d+\/([a-f0-9]+)/)?.[1];
        
        // TÃœM olasÄ± isim kaynaklarÄ±nÄ± kontrol et
        let name = g.name || 
                   g.guild_name || 
                   g.server_name ||
                   g.servername ||
                   g.title;
        
        // Widget'dan isim Ã§ekmeyi dene
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
          source: g.source || 'VeritabanÄ±',
          // Ekstra metadata
          features: g.features || [],
          description: g.description || g.desc || g.about,
          vanity_url: g.vanity_url || g.vanityUrl || g.custom_url,
          verification_level: g.verification_level,
          nsfw: g.nsfw || g.is_nsfw
        });
      }
    });
    
    // Discord widget (çok sunucuda yavaşlar; ilk N eksik kayıt için)
    const guildsNeedingData = uniqueGuilds.filter(g => !g.name || !g.icon).slice(0, 60);
    console.log(`[showAllGuilds] widget ile zenginleştirilecek: ${guildsNeedingData.length} / ${uniqueGuilds.length}`);
    
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
          // Widget fetch hatasÄ± - sessizce devam et
        }
      }));
      
      // Rate limit korumasÄ±: her batch sonrasÄ± bekle
      if (i + batchSize < guildsNeedingData.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    // Konteyner oluÅŸtur
    const container = document.createElement('div');
    container.className = 'all-guilds-container';
    
    // SÄ±rala (isme gÃ¶re, bilinmeyenler en sonda)
    uniqueGuilds.sort((a, b) => {
      const nameA = a.name || `Sunucu #${a.id.slice(-6)}`;
      const nameB = b.name || `Sunucu #${b.id.slice(-6)}`;
      return nameA.localeCompare(nameB);
    });
    
    const memberSum = uniqueGuilds.reduce((sum, g) => sum + (g.member_count || 0), 0);
    const totalDb = Number(data.total) || uniqueGuilds.length;
    const emB = String.fromCodePoint(0x1F3E2);
    const emChart = String.fromCodePoint(0x1F4CA);
    const emPeople = String.fromCodePoint(0x1F465);
    const header = document.createElement('div');
    header.className = 'all-guilds-header';
    header.innerHTML = `
      <h2>${emB} Tüm sunucular</h2>
      <div class="all-guilds-stats">
        <span class="stat-item">${emChart} ${uniqueGuilds.length.toLocaleString('tr-TR')} sunucu (bu sayfada)</span>
        <span class="stat-item">${emPeople} ${memberSum.toLocaleString('tr-TR')} üye (üye sayıları toplamı)</span>
        ${totalDb > uniqueGuilds.length ? `<span class="stat-item muted">Veritabanında toplam ${totalDb.toLocaleString('tr-TR')} sunucu; yalnızca ilk kayıtlar yüklendi.</span>` : ''}
      </div>
    `;
    container.appendChild(header);
    
    const searchBox = document.createElement('div');
    searchBox.className = 'all-guilds-search';
    searchBox.innerHTML = `
      <input type="text" id="guildSearchInput" placeholder="Sunucu ID veya isim ara..." class="guild-search-input" autocomplete="off">
    `;
    container.appendChild(searchBox);
    
    // Grid oluÅŸtur
    const grid = document.createElement('div');
    grid.className = 'all-guilds-grid';
    grid.id = 'allGuildsGrid';
    
    // Her sunucu iÃ§in kart oluÅŸtur (sÄ±ralÄ±)
    uniqueGuilds.forEach((guild, index) => {
      const card = createAllGuildCard(guild, index + 1);
      grid.appendChild(card);
    });
    
    container.appendChild(grid);
    
    // SonuÃ§larÄ± gÃ¶ster
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
    console.error('[showAllGuilds] Hata:', error);
    const msg = String(error?.message || '');
    if (msg === 'premium_required') {
      resultsArea.innerHTML = `
        <div class="premium-required">
          <div class="premium-icon">⭐</div>
          <h3>Premium Gerekli</h3>
          <p>Sunucu listesi bu oturumda ücretsiz kotayı aştı veya premium gerektiriyor.</p>
          <p class="premium-note">Discord ID sorgusu ücretsizdir (1 sorgu)</p>
          <a href="https://discord.gg/zagrosleak" target="_blank" rel="noopener" class="discord-btn">discord.gg/zagrosleak</a>
        </div>`;
    } else {
      resultsArea.innerHTML = `
        <div class="no-results">
          <div class="no-results-icon">🏢</div>
          <h3>Sunucular yüklenemedi</h3>
          <p class="muted">${msg === 'invalid_json' ? 'Sunucu yanıtı geçersiz.' : (msg || 'Bilinmeyen hata')}</p>
          <p style="margin-top:16px"><button type="button" class="btn btn-primary" id="retryAllGuildsBtn">Yeniden dene</button></p>
        </div>`;
      const retry = document.getElementById('retryAllGuildsBtn');
      if (retry) retry.addEventListener('click', () => showAllGuilds());
    }
    showToast('Sunucular yüklenemedi', 'error');
  }
}

/** Sunucu kartından detay + üye listesi (tüm kullanıcı seviyeleri; API kotası sunucu okumalarında muaf). */
async function openGuildDetailById(gidRaw) {
  const gid = String(gidRaw || '').trim();
  if (!/^\d{10,30}$/.test(gid)) {
    showToast('Geçersiz sunucu ID', 'warning');
    return;
  }
  showLoading();
  try {
    const guildRes = await api(`/api/guild/${encodeURIComponent(gid)}`, { method: 'GET' });
    let members = [];
    try {
      const memRes = await api(`/api/guild/${encodeURIComponent(gid)}/members?limit=300`, { method: 'GET' });
      members = memRes.members || [];
    } catch {
      /* üye listesi ayrı hata verebilir */
    }
    hideLoading();
    renderGuildDetailView({ guild: guildRes.guild || {}, members });
  } catch (e) {
    hideLoading();
    const m = String(e?.message || '');
    if (m === 'premium_required') {
      showToast('Bu işlem için premium gerekli.', 'warning');
    } else {
      showToast('Sunucu detayı yüklenemedi: ' + (m || 'bilinmeyen'), 'error');
    }
  }
}

// Discord Widget API'den sunucu bilgisi Ã§ek (Backend proxy ile - CORS korumasÄ±)
async function fetchDiscordWidget(guildId) {
  try {
    // Backend proxy kullan (CORS sorununu Ã¶nler)
    const response = await api(`/api/widget/${guildId}`, { method: 'GET' });
    
    if (!response || typeof response !== 'object') return null;
    if (response.error) {
      if (response.error === 'Rate limited') {
        console.log(`[Widget] ${guildId} - Rate limited`);
      }
      return null;
    }
    
    return response;
  } catch (error) {
    console.log(`[Widget] ${guildId} - Hata:`, error?.message || String(error));
    return null;
  }
}

// ðŸŽ´ TEK SUNUCU KARTI OLUÅžTUR (TÃ¼m sunucular listesi iÃ§in)
function createAllGuildCard(g, index) {
  const card = document.createElement('div');
  card.className = 'all-guild-card';
  card.dataset.id = g.id;
  card.dataset.name = g.name || '';
  
  card.onclick = async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    await openGuildDetailById(g.id || g.guild_id);
  };
  
  // Discord CDN Ä°kon URL oluÅŸtur - hem hash hem de tam URL desteÄŸi
  let iconUrl = null;
  if (g.id && g.icon) {
    const iconValue = g.icon;
    if (typeof iconValue === 'string') {
      // EÄŸer zaten tam URL ise direkt kullan
      if (iconValue.startsWith('http')) {
        iconUrl = iconValue.replace('?size=4096', '?size=128'); // Boyutu kÃ¼Ã§Ã¼lt
        console.log(`[Guild Card] ${g.id} - Icon zaten URL: ${iconUrl}`);
      } else if (isDiscordCdnHash(iconValue)) {
        const ext = iconValue.startsWith('a_') ? 'gif' : 'webp';
        iconUrl = `https://cdn.discordapp.com/icons/${g.id}/${String(iconValue).trim()}.${ext}?size=128`;
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
  
  // Banner URL oluÅŸtur - hem hash hem de tam URL desteÄŸi
  let bannerUrl = null;
  if (g.id && g.banner) {
    const bannerValue = g.banner;
    if (typeof bannerValue === 'string') {
      // EÄŸer zaten tam URL ise direkt kullan
      if (bannerValue.startsWith('http')) {
        bannerUrl = bannerValue.replace('?size=4096', '?size=512'); // Boyutu ayarla
      } else if (isDiscordCdnHash(bannerValue)) {
        const ext = bannerValue.startsWith('a_') ? 'gif' : 'webp';
        bannerUrl = `https://cdn.discordapp.com/banners/${g.id}/${String(bannerValue).trim()}.${ext}?size=512`;
      }
    }
  }
  
  // Splash URL oluÅŸtur (invite background)
  let splashUrl = null;
  if (g.id && g.splash) {
    const splashHash = g.splash;
    if (typeof splashHash === 'string' && isDiscordCdnHash(splashHash)) {
      splashUrl = `https://cdn.discordapp.com/splashes/${g.id}/${splashHash.trim()}.jpg?size=512`;
    }
  }
  
  // Ä°sim belirle
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
  
  // Ä°kon HTML
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
  const boostBadge = boostLevel > 0 ? `<span class="guild-badge boost">âš¡ ${boostLevel}</span>` : '';
  
  // Online/Offline gÃ¶sterimi (eÄŸer varsa)
  const onlineCount = g.presence_count || g.online_count;
  const totalCount = g.member_count || 0;
  const onlineBadge = onlineCount ? 
    `<span class="guild-badge members" style="color: #57F287;">â— ${onlineCount.toLocaleString('tr-TR')} Ã§evrimiÃ§i</span>` : '';
  
  // Ã–zellikler Ã§ipleri (features)
  let featuresHtml = '';
  if (g.features && g.features.length > 0) {
    const displayFeatures = g.features.slice(0, 3); // Sadece ilk 3 Ã¶zelliÄŸi gÃ¶ster
    featuresHtml = `<div class="guild-features">${displayFeatures.map(f => 
      `<span class="guild-feature-chip">${f.replace(/_/g, ' ')}</span>`
    ).join('')}</div>`;
  }
  
  // DoÄŸrulama seviyesi ikonu
  const verificationIcons = ['', 'ðŸ”’', 'ðŸ”', 'ðŸ”', 'âœ…'];
  const verificationIcon = verificationIcons[g.verification_level || 0] || '';
  
  // NSFW tagi
  const nsfwBadge = g.nsfw ? `<span class="guild-badge nsfw">ðŸ”ž NSFW</span>` : '';
  
  // Vanity URL gÃ¶sterimi
  const vanityDisplay = g.vanity_url ? `<span style="color: #7289da; font-size: 11px;">discord.gg/${g.vanity_url}</span>` : '';
  
  card.innerHTML = `
    <div class="guild-order-badge">${index}</div>
    <div class="all-guild-icon">${iconHtml}</div>
    <div class="all-guild-info">
      <div class="all-guild-name">${verificationIcon} ${displayName}</div>
      <div class="all-guild-id">ID: ${g.id} ${vanityDisplay}</div>
      <div class="all-guild-meta">
        ${onlineBadge}
        <span class="guild-badge members">ðŸ‘¥ ${totalCount.toLocaleString('tr-TR')} Ã¼ye</span>
        ${boostBadge}
        ${nsfwBadge}
        <span class="guild-badge" style="color: #aaa;">ðŸ“ ${g.source}</span>
      </div>
      ${featuresHtml}
    </div>
    <div class="all-guild-arrow">â†’</div>
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
    directory: 'Sunucu dizini',
    findcord: 'FindCord',
    widget: 'Discord widget',
    disboard: 'Disboard',
    'disboard_tag': 'Disboard (Türk)',
    topgg: 'Top.gg',
    discordservers: 'DiscordServers',
    discadia: 'Discadia',
    'discadia_list': 'Discadia (liste)',
    dcflow: 'DCFlow',
    'dcflow_leaderboard': 'DCFlow sıralaması',
    cache: 'Önbellek',
    files: 'Arşiv',
    multiple: 'Çoklu kaynak'
  };

  const membersWithLocation = members.filter(m => m.ip_location && m.ip_location.lat && m.ip_location.lon);

  const headerCard = document.createElement('div');
  headerCard.className = 'guild-detail-header';
  
  // Banner URL - Ã¶nce banner_url, sonra banner hash'ten oluÅŸtur
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

  // Guild icon URL - Ã¶nce icon_url, sonra icon hash'ten oluÅŸtur, yoksa varsayÄ±lan
  let iconUrl = guild.icon_url;
  if (!iconUrl && guild.icon && guild.id) {
    iconUrl = discordGuildIconFE(guild.id, guild.icon, 256);
  }
  if (!iconUrl && guild.id) {
    // VarsayÄ±lan Discord avatar (ID bazlÄ±)
    let fallbackIdx = 0;
    try { fallbackIdx = Number(BigInt(guild.id) >> 22n) % 6; } catch { fallbackIdx = parseInt(guild.id.slice(-4), 16) % 5; }
    iconUrl = `https://cdn.discordapp.com/embed/avatars/${fallbackIdx}.png`;
  }

  // Kopyalama fonksiyonlarÄ±
  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text).then(() => showToast(`${label} kopyalandÄ±`, 'success'));
  };

  const iconHtml = iconUrl 
    ? `<img class="guild-detail-icon" src="${iconUrl.replace(/"/g, '&quot;')}" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'" alt="" onclick="window.open('${iconUrl.replace(/'/g, "\\'")}', '_blank')" title="Büyük görüntü için tıkla">`
    : `<span class="guild-detail-icon-placeholder">ðŸ—„ï¸</span>`;

  // HÄ±zlÄ± kopyalama butonlarÄ±
  const quickCopyButtons = [];
  if (iconUrl) {
    quickCopyButtons.push(`<button class="quick-copy-btn" onclick="navigator.clipboard.writeText('${iconUrl}'); showToast('PP URL kopyalandÄ±', 'success');" title="PP URL Kopyala">ðŸ–¼ï¸ PP Kopyala</button>`);
  }
  if (guildBannerUrl) {
    quickCopyButtons.push(`<button class="quick-copy-btn" onclick="navigator.clipboard.writeText('${guildBannerUrl}'); showToast('Banner URL kopyalandÄ±', 'success');" title="Banner URL Kopyala">ðŸŽ¨ Banner Kopyala</button>`);
  }
  quickCopyButtons.push(`<button class="quick-copy-btn" onclick="navigator.clipboard.writeText('${guild.id}'); showToast('ID kopyalandÄ±: ${guild.id}', 'success');" title="ID Kopyala">ðŸ“‹ ID Kopyala</button>`);

  const metaItems = [
    `<span class="guild-detail-id">ðŸ†” ${guild.id || '-'}</span>`,
    `<span class="guild-detail-count">👥 ${members.length} üye</span>`,
    membersWithLocation.length > 0 ? `<span class="guild-detail-location">ðŸ“ ${membersWithLocation.length} konum</span>` : '',
    locationSummary.length > 0 ? `<span class="guild-detail-cities">ðŸŒ ${locationSummary.length} ÅŸehir</span>` : '',
    guild.premium_tier ? `<span class="guild-detail-boost">âš¡ Boost Seviye ${guild.premium_tier}</span>` : ''
  ].filter(Boolean);

  if (guild.metadata_source) {
    const label = metadataSourceLabels[guild.metadata_source] || guild.metadata_source;
    metaItems.push(`<span class="guild-detail-meta-source">ðŸ“Œ ${label}</span>`);
  }
  if (guild.metadata_updated_at) {
    metaItems.push(`<span class="guild-detail-meta-source">ðŸ•“ ${new Date(guild.metadata_updated_at).toLocaleDateString('tr-TR')}</span>`);
  }

  headerCard.innerHTML = `
    <div class="guild-header-top">
      <div class="guild-back-btn" onclick="goBackToGuilds()">← Sunuculara dön</div>
    </div>
    <div class="guild-header-content">
      <div class="guild-detail-icon-section">${iconHtml}</div>
      <div class="guild-detail-info">
        <div class="guild-detail-name">${(guild.name && guild.name !== 'Bilinmeyen Sunucu') ? guild.name : (guild.id ? `Sunucu #${String(guild.id).slice(-6)}` : 'Sunucu')}</div>
        ${guild.owner_id ? `<div class="guild-owner">ðŸ‘‘ Sahip: ${guild.owner_id}</div>` : ''}
        <div class="guild-detail-meta">${metaItems.join('')}</div>
        ${guild.description ? `<div class="guild-detail-description">${escapeHtml(guild.description)}</div>` : ''}
        ${guild.features?.length > 0 ? `<div class="guild-features">${guild.features.map(f => `<span class="feature-badge">${f}</span>`).join('')}</div>` : ''}
        <div class="quick-copy-bar">${quickCopyButtons.join('')}</div>
      </div>
    </div>
  `;
  
  // Geri dÃ¶nÃ¼ÅŸ fonksiyonunu global yap
  window.goBackToGuilds = () => {
    searchMode = 'guilds';
    updateModeUI();
    showAllGuilds();
  };
  
  container.appendChild(headerCard);

  // ðŸ“Š KONUM Ã–ZETÄ° (EÄŸer varsa)
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
      <div class="section-title">ðŸŒ Konum DaÄŸÄ±lÄ±mÄ± (${locationSummary.length} farklÄ± ÅŸehir)</div>
      <div class="location-chips">${citiesHtml}</div>
    `;
    container.appendChild(locationSection);
  }

  // ðŸ—ºï¸ TAM EKRAN HARITA
  if (membersWithLocation.length > 0) {
    const mapSection = document.createElement('div');
    mapSection.className = 'guild-map-section expanded';
    mapSection.innerHTML = `
      <div class="map-header">
        <div class="section-title">ðŸ“ IP Konum HaritasÄ±</div>
        <div class="map-stats">
          <span>${membersWithLocation.length} marker</span>
          <span>${data.location_count || locationSummary.length} lokasyon</span>
        </div>
      </div>
      <div id="guild-map" class="guild-map expanded"></div>
    `;
    container.appendChild(mapSection);
    
    // HaritayÄ± initialize et
    setTimeout(() => initGuildMap(membersWithLocation, locationSummary), 100);
  }

  // ï¿½ Son Mesajlar (FindCord'dan)
  if (guild.sample_messages && guild.sample_messages.length > 0) {
    const messagesSection = document.createElement('div');
    messagesSection.className = 'messages-section';
    const messagesHtml = guild.sample_messages.slice(0, 10).map(m => {
      const guildName = m.guild_name || 'Bilinmeyen Sunucu';
      const channelName = m.channel_name || 'Bilinmeyen Kanal';
      const timestamp = m.timestamp ? new Date(m.timestamp).toLocaleDateString('tr-TR') : '';
      return `<div class="message-item"><div class="message-meta">${guildName} â€¢ ${channelName}${timestamp ? ' â€¢ ' + timestamp : ''}</div><div class="message-content">${m.content || 'Ä°Ã§erik yok'}</div></div>`;
    }).join('');
    messagesSection.innerHTML = `<div class="section-title">ðŸ’¬ Son Mesajlar (${guild.sample_messages.length})</div><div class="messages-list">${messagesHtml}</div>`;
    container.appendChild(messagesSection);
  }

  // ðŸŽ¤ Ses ArkadaÅŸlarÄ± (FindCord'dan)
  if (guild.voice_friends && guild.voice_friends.length > 0) {
    const voiceFriendsSection = document.createElement('div');
    voiceFriendsSection.className = 'voice-friends-section';
    const voiceFriendsHtml = guild.voice_friends.slice(0, 10).map(f => {
      const lastConnected = f.last_connected ? new Date(f.last_connected).toLocaleDateString('tr-TR') : 'Bilinmiyor';
      const totalTime = f.total_time || 'Bilinmiyor';
      return `<div class="voice-friend-item"><div class="voice-friend-name">${f.username || f.discord_id}</div><div class="voice-friend-meta">Son: ${lastConnected} â€¢ SÃ¼re: ${totalTime}</div></div>`;
    }).join('');
    voiceFriendsSection.innerHTML = `<div class="section-title">ðŸŽ¤ Ses ArkadaÅŸlarÄ± (${guild.voice_friends.length})</div><div class="voice-friends-list">${voiceFriendsHtml}</div>`;
    container.appendChild(voiceFriendsSection);
  }

  // ï¿½ðŸ‘¥ ÃœYE LÄ°STESÄ° (GeliÅŸmiÅŸ)
  const tableSection = document.createElement('div');
  tableSection.className = 'guild-members-table-section';
  
  // Filtreleme ve arama
  tableSection.innerHTML = `
    <div class="members-header">
      <div class="section-title">ðŸ‘¥ Ãœye Listesi (${members.length})</div>
      <div class="members-search">
        <input type="text" id="memberSearch" placeholder="ðŸ” Ãœye ara..." onkeyup="filterMembers()">
      </div>
    </div>
    <div class="table-scroll-container">
      <table class="guild-members-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Profil</th>
            <th>KullanÄ±cÄ±</th>
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

  // Ãœye filtreleme fonksiyonu
  window.filterMembers = () => {
    const searchTerm = document.getElementById('memberSearch')?.value?.toLowerCase() || '';
    const rows = tbody.querySelectorAll('tr');
    rows.forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(searchTerm) ? '' : 'none';
    });
  };

  // Ãœyeleri tabloya ekle
  members.forEach((m, index) => {
    const tr = document.createElement('tr');
    tr.className = 'member-row';
    tr.dataset.discordId = m.discord_id;
    
    // Avatar - avatar_hash'ten Discord CDN URL oluÅŸtur
    let avatarUrl = m.avatar_url;
    const memberId = m.discord_id || m.id;
    const memberHash = m.avatar_hash || m.avatar;
    
    // EÄŸer avatar sadece hash ise, Discord CDN URL'sine Ã§evir
    if (memberHash && !memberHash.startsWith('http') && memberId && isDiscordCdnHash(memberHash)) {
      const ext = memberHash.startsWith('a_') ? 'gif' : 'webp';
      avatarUrl = `https://cdn.discordapp.com/avatars/${memberId}/${String(memberHash).trim()}.${ext}?size=128`;
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
    
    // Ä°sim - SQL verilerinde hash/IP gÃ¶rÃ¼nÃ¼yorsa temizle
    let displayName = m.nickname || m.global_name || m.username || m.user_name || m.display_name;
    
    // EÄŸer isim hash (32 karakter hex) veya IP adresi gÃ¶rÃ¼nÃ¼yorsa, Discord ID'den oluÅŸtur
    if (!displayName || /^[a-f0-9]{32}$/i.test(displayName) || /^\d+\.\d+\.\d+\.\d+$/.test(displayName)) {
      displayName = m.nickname || `User_${String(m.discord_id || '').slice(-4)}` || 'Ä°simsiz';
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
      : (m.ip ? `<div class="ip-only">ðŸ“ ${m.ip}</div>` : '-');
    
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
        <button class="copy-btn" onclick="copyToClipboard('${m.discord_id}')">ðŸ“‹</button>
      </td>
      <td class="email-cell">
        ${m.email ? `<span class="email">${m.email}</span><button class="copy-btn" onclick="copyToClipboard('${m.email}')">ðŸ“‹</button>` : '-'}
      </td>
      <td class="location-cell">${locationHtml}</td>
      <td class="connections-cell">${connectionsHtml}</td>
    `;
    
    tbody.appendChild(tr);
  });

  // Kopyalama fonksiyonu
  window.copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      showToast('ðŸ“‹ KopyalandÄ±: ' + text.substring(0, 20) + (text.length > 20 ? '...' : ''));
    });
  };

  resultsArea.innerHTML = '';
  resultsArea.appendChild(container);
  hide(noResults);
}

// Ãœlke emoji helper
function getCountryEmoji(countryCode) {
  if (!countryCode) return 'ðŸŒ';
  const code = countryCode.toUpperCase();
  const flags = {
    'TR': 'ðŸ‡¹ðŸ‡·', 'US': 'ðŸ‡ºðŸ‡¸', 'GB': 'ðŸ‡¬ðŸ‡§', 'DE': 'ðŸ‡©ðŸ‡ª', 'FR': 'ðŸ‡«ðŸ‡·', 'IT': 'ðŸ‡®ðŸ‡¹', 'ES': 'ðŸ‡ªðŸ‡¸',
    'NL': 'ðŸ‡³ðŸ‡±', 'BE': 'ðŸ‡§ðŸ‡ª', 'CH': 'ðŸ‡¨ðŸ‡­', 'AT': 'ðŸ‡¦ðŸ‡¹', 'SE': 'ðŸ‡¸ðŸ‡ª', 'NO': 'ðŸ‡³ðŸ‡´', 'DK': 'ðŸ‡©ðŸ‡°',
    'FI': 'ðŸ‡«ðŸ‡®', 'PL': 'ðŸ‡µðŸ‡±', 'CZ': 'ðŸ‡¨ðŸ‡¿', 'HU': 'ðŸ‡­ðŸ‡º', 'RO': 'ðŸ‡·ðŸ‡´', 'BG': 'ðŸ‡§ðŸ‡¬', 'HR': 'ðŸ‡­ðŸ‡·',
    'GR': 'ðŸ‡¬ðŸ‡·', 'PT': 'ðŸ‡µðŸ‡¹', 'IE': 'ðŸ‡®ðŸ‡ª', 'UA': 'ðŸ‡ºðŸ‡¦', 'RU': 'ðŸ‡·ðŸ‡º', 'CN': 'ðŸ‡¨ðŸ‡³', 'JP': 'ðŸ‡¯ðŸ‡µ',
    'KR': 'ðŸ‡°ðŸ‡·', 'IN': 'ðŸ‡®ðŸ‡³', 'BR': 'ðŸ‡§ðŸ‡·', 'CA': 'ðŸ‡¨ðŸ‡¦', 'AU': 'ðŸ‡¦ðŸ‡º', 'MX': 'ðŸ‡²ðŸ‡½', 'AR': 'ðŸ‡¦ðŸ‡·',
    'ZA': 'ðŸ‡¿ðŸ‡¦', 'EG': 'ðŸ‡ªðŸ‡¬', 'SA': 'ðŸ‡¸ðŸ‡¦', 'AE': 'ðŸ‡¦ðŸ‡ª', 'IL': 'ðŸ‡®ðŸ‡±'
  };
  return flags[code] || 'ðŸŒ';
}

// Rozet emoji helper
function getBadgeEmoji(badge) {
  const badges = {
    'staff': 'ðŸ‘¨â€ðŸ’¼', 'partner': 'ðŸ¤', 'hypesquad': 'ðŸ ', 'bug_hunter': 'ðŸ›',
    'hypesquad_bravery': 'ðŸ¦…', 'hypesquad_brilliance': 'ðŸŒŸ', 'hypesquad_balance': 'â˜¯ï¸',
    'early_supporter': 'ðŸ’Ž', 'verified_bot': 'ðŸ¤–', 'verified_developer': 'ðŸ‘¨â€ðŸ’»'
  };
  return badges[badge] || 'ðŸ·ï¸';
}

// Connection tipi iÃ§in icon
function getConnectionIcon(type) {
  const icons = {
    'steam': 'ðŸŽ®',
    'twitch': 'ðŸ“º',
    'youtube': 'â–¶ï¸',
    'spotify': 'ðŸŽµ',
    'twitter': 'ðŸ¦',
    'x': 'ð•',
    'reddit': 'ðŸ”´',
    'github': 'ðŸ’»',
    'paypal': 'ðŸ’°',
    'ebay': 'ðŸ›’',
    'tiktok': 'ðŸ“±',
    'instagram': 'ðŸ“¸',
    'facebook': 'ðŸ‘¤',
    'domain': 'ðŸŒ',
    'crunchyroll': 'ðŸ¿'
  };
  return icons[type?.toLowerCase()] || 'ðŸ”—';
}

// Sunucu Ã¼yeleri gÃ¶rÃ¼nÃ¼mÃ¼ (eski - kullanÄ±lmÄ±yor)
function createGuildView(data) {
  const container = document.createElement('div');
  container.className = 'guild-container';

  const guild = data.guild;
  const members = data.members || [];

  // IP konumu olan Ã¼yeleri bul (harita iÃ§in)
  const membersWithLocation = members.filter(m => m.ip_location && m.ip_location.lat && m.ip_location.lon);

  // Sunucu baÅŸlÄ±k kartÄ±
  const headerCard = document.createElement('div');
  headerCard.className = 'guild-header-card';
  
  // Ä°kon - Ã¶nce icon_url'yi kontrol et, yoksa icon_hash'den oluÅŸtur
  let iconUrl = guild.icon_url || guild.icon;
  if (!iconUrl && guild.id) {
    const iconHash = guild.icon_hash || guild.icon;
    if (iconHash && typeof iconHash === 'string' && iconHash.length > 5) {
      const ext = iconHash.startsWith('a_') ? 'gif' : 'png';
      iconUrl = `https://cdn.discordapp.com/icons/${guild.id}/${iconHash}.${ext}?size=128`;
    }
  }
  // Discord'un varsayÄ±lan ikon formatÄ±
  if (!iconUrl && guild.id) {
    try {
      const fallbackIdx = Number(BigInt(guild.id) >> 22n) % 6;
      iconUrl = `https://cdn.discordapp.com/embed/avatars/${fallbackIdx}.png`;
    } catch {
      iconUrl = 'https://cdn.discordapp.com/embed/avatars/0.png';
    }
  }
  
  // Banner URL oluÅŸtur
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
        <span class="guild-count">ðŸ‘¥ ${members.length} Ã¼ye bulundu</span>
        ${membersWithLocation.length > 0 ? `<span class="guild-location-count">ðŸ“ ${membersWithLocation.length} konum</span>` : ''}
      </div>
      ${bannerUrl ? `<div class="guild-banner" style="background-image: url(${bannerUrl})"></div>` : ''}
    </div>
  `;
  container.appendChild(headerCard);

  // ðŸ—ºï¸ HARITA BÃ–LÃœMÃœ (IP konumu olan Ã¼yeler iÃ§in)
  if (membersWithLocation.length > 0) {
    const mapSection = document.createElement('div');
    mapSection.className = 'guild-map-section';
    mapSection.innerHTML = `
      <div class="section-title">ðŸ“ IP Konum HaritasÄ± (${membersWithLocation.length} Ã¼ye)</div>
      <div id="guild-map" class="guild-map"></div>
      <div class="map-legend">
        <span class="legend-item"><span class="marker-dot blue"></span> Ãœye Konumu</span>
        <span class="legend-item">ðŸ–±ï¸ TÄ±klayÄ±n: Mahalle/Sokak detayÄ±</span>
      </div>
    `;
    container.appendChild(mapSection);
    
    // HaritayÄ± sonradan initialize et (DOM'a eklendikten sonra)
    setTimeout(() => initGuildMap(membersWithLocation), 100);
  }

  // Ãœye listesi
  const memberSection = document.createElement('div');
  memberSection.className = 'guild-members-section';
  memberSection.innerHTML = `<div class="section-title">Sunucu Ãœyeleri (${members.length})</div>`;

  const memberGrid = document.createElement('div');
  memberGrid.className = 'guild-members-grid';
  
  members.forEach(m => {
    const memberCard = document.createElement('div');
    memberCard.className = 'guild-member-card';
    
    // Avatar URL oluÅŸtur - Discord CDN formatÄ±nda
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
    
    // KullanÄ±cÄ± adÄ±nÄ± temizle
    let displayName = m.global_name || m.username || m.user_name || m.nickname || m.name || m.display_name;
    if (!displayName || displayName.length < 2 || 
        /^[a-f0-9]{32}$/i.test(displayName) || 
        /^\d+\.\d+\.\d+\.\d+$/.test(displayName)) {
      displayName = m.nickname || `User_${String(memberId).slice(-4) || '0000'}`;
    }
    
    // Email ve IP bilgilerini vurgula + IP Konum detayÄ±
    const hasData = m.email || m.ip;
    const loc = m.ip_location;
    const locationInfo = loc ? `
      <div class="member-location-info">
        <div class="location-badge">
          ðŸŒ ${loc.city}${loc.district ? ', ' + loc.district : ''}, ${loc.country || loc.countryCode || 'N/A'}
          ${loc.lat && loc.lon ? `<span class="coords">(${loc.lat.toFixed(4)}, ${loc.lon.toFixed(4)})</span>` : ''}
        </div>
        ${loc.isp ? `<div class="isp-info">ðŸŒ ${loc.isp}</div>` : ''}
      </div>
    ` : '';
    
    const dataSection = hasData ? `
      <div class="member-data-section">
        ${m.email ? `<div class="member-data-row email-row"><span class="data-label">ðŸ“§ Email:</span><span class="data-value">${m.email}</span>${copyBtn(m.email)}<button class="osint-btn" onclick="showEmailOSINT('${String(m.email).replace(/'/g, "\\'")}')" title="OSINT AraÅŸtÄ±r">ðŸ”</button></div>` : ''}
        ${m.ip ? `<div class="member-data-row ip-row"><span class="data-label">ðŸ“ IP:</span><span class="data-value mono">${m.ip}</span>${copyBtn(m.ip)}</div>` : ''}
        ${locationInfo}
      </div>
    ` : '<div class="member-no-data">Veri bulunamadÄ±</div>';
    
    // Avatar HTML
    let avatarHtml = '';
    if (avatarUrl) {
      avatarHtml = `<img class="member-avatar" src="${avatarUrl}" onerror="this.src='https://cdn.discordapp.com/embed/avatars/${(parseInt(memberId.slice(-4), 16) || 0) % 6}.png'" alt="${displayName}">`;
    } else {
      const initial = (displayName || 'U')[0].toUpperCase();
      avatarHtml = `<div class="member-avatar-placeholder">${initial}</div>`;
    }
    
    // KullanÄ±cÄ± adÄ± gÃ¶sterimi - global_name varsa farklÄ± renkte gÃ¶ster
    const usernameDisplay = m.global_name && m.global_name !== m.username 
      ? `<div class="member-username">${m.global_name}<span class="username-tag">@${m.username || ''}</span></div>`
      : `<div class="member-username">${displayName}</div>`;
    
    // Sadece Ã¶zet bilgileri gÃ¶ster (kompakt gÃ¶rÃ¼nÃ¼m)
    const emailPreview = m.email ? `<div class="member-email">ðŸ“§ ${m.email}</div>` : '';
    const ipPreview = m.ip ? `<div class="member-ip">ðŸ“ ${m.ip}</div>` : '';
    
    memberCard.innerHTML = `
      <div class="member-avatar-section">${avatarHtml}</div>
      <div class="member-info">
        ${usernameDisplay}
        <div class="member-id mono">ðŸ†” ${m.discord_id || '-'}</div>
        ${emailPreview}
        ${ipPreview}
      </div>
      <div class="member-actions">
        <button class="member-btn member-btn-primary" onclick="showMemberDetail('${memberId}')">ðŸ‘¤ Detay</button>
        ${m.email ? `<button class="member-btn member-btn-secondary" onclick="showEmailOSINT('${String(m.email).replace(/'/g, "\\'")}')">ðŸ“§ Email OSINT</button>` : ''}
      </div>
    `;
    
    // Kart tÄ±klama - detay modalÄ± aÃ§
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

// ðŸ‘¤ ÃœYE DETAY MODALI - Discord ID sorgu tarzÄ±
function showMemberDetail(member) {
  // EÄŸer member string (ID) geldiyse, objeyi bul
  let m = member;
  if (typeof member === 'string') {
    // Son sonuÃ§tan bul
    if (lastResult && lastResult.members) {
      m = lastResult.members.find(x => String(x.discord_id || x.id) === String(member));
    }
    if (!m) {
      showToast('âš ï¸ Ãœye bilgisi bulunamadÄ±', 'warning');
      return;
    }
  }
  
  // Avatar URL oluÅŸtur
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
  
  // KullanÄ±cÄ± adÄ±nÄ± temizle
  let displayName = m.global_name || m.username || m.user_name || m.name || m.display_name || m.nickname;
  if (!displayName || displayName.length < 2 || 
      /^[a-f0-9]{32}$/i.test(displayName) || 
      /^\d+\.\d+\.\d+\.\d+$/.test(displayName)) {
    displayName = m.username || `User_${String(memberId).slice(-4) || '0000'}`;
  }
  
  // Modal oluÅŸtur
  const modal = document.createElement('div');
  modal.className = 'member-detail-modal';
  modal.id = 'memberDetailModal';
  
  modal.innerHTML = `
    <div class="member-detail-content">
      <button class="member-detail-close" onclick="closeMemberDetail()">Ã—</button>
      
      <div class="member-detail-header">
        <img class="member-detail-avatar" src="${avatarUrl}" alt="${displayName}" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
        <div class="member-detail-info">
          <h3>${displayName}</h3>
          <p>@${m.username || m.user_name || 'unknown'}</p>
        </div>
      </div>
      
      <div class="member-detail-body">
        <div class="member-detail-section">
          <h4>ðŸ†” Discord Bilgileri</h4>
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
          <h4>ðŸ“§ Ä°letiÅŸim Bilgileri</h4>
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
          <h4>ðŸŒ IP Bilgileri</h4>
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
          <h4>ðŸ“ Kaynak</h4>
          <div class="member-detail-row">
            <span class="member-detail-label">Veri KaynaÄŸÄ±</span>
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
          ${m.email ? `<button class="member-btn member-btn-primary" onclick="showEmailOSINT('${String(m.email).replace(/'/g, "\\'")}'); closeMemberDetail();" style="flex: 1;">ðŸ“§ Email OSINT</button>` : ''}
          <button class="member-btn member-btn-secondary" onclick="copyToClipboard('${memberId}')" style="flex: 1;">ðŸ“‹ ID Kopyala</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Animasyon iÃ§in kÄ±sa bir gecikme
  setTimeout(() => modal.classList.add('active'), 10);
  
  // Modal dÄ±ÅŸÄ±na tÄ±klayÄ±nca kapat
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeMemberDetail();
  });
  
  // ESC tuÅŸu ile kapat
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

// ðŸ” EMAIL OSINT - IntelX tarzÄ± breach araÅŸtÄ±rmasÄ±
async function showEmailOSINT(email) {
  showLoading();

  try {
    const data = await api(`/api/email-osint?email=${encodeURIComponent(email)}`, { method: 'GET' });
    hideLoading();

    if (data.error) {
      showToast('âš ï¸ OSINT HatasÄ±: ' + (data.message || data.error), 'warning');
      return;
    }

    // OSINT raporu modal'Ä± oluÅŸtur
    const modal = document.createElement('div');
    modal.className = 'osint-modal-overlay';

    // Risk seviyesi badge
    const riskColors = {
      critical: { bg: '#ff4444', text: '#fff', label: 'KRÄ°TÄ°K RÄ°SK' },
      high: { bg: '#ff8800', text: '#fff', label: 'YÃœKSEK RÄ°SK' },
      medium: { bg: '#ffcc00', text: '#000', label: 'ORTA RÄ°SK' },
      low: { bg: '#88cc00', text: '#fff', label: 'DÃœÅžÃœK RÄ°SK' },
      clean: { bg: '#00cc66', text: '#fff', label: 'TEMÄ°Z' },
      unknown: { bg: '#888888', text: '#fff', label: 'BÄ°LÄ°NMEYEN' }
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
            ${b.is_verified ? '<span class="badge verified">âœ“ DoÄŸrulanmÄ±ÅŸ</span>' : ''}
            ${b.is_sensitive ? '<span class="badge sensitive">âš ï¸ Hassas</span>' : ''}
            ${b.pwn_count ? `<span class="badge count">ðŸ‘¤ ${b.pwn_count.toLocaleString()}</span>` : ''}
          </td>
        </tr>
      `).join('')
      : '<tr><td colspan="4" class="no-breach">âœ… Bu email hiÃ§bir veri ihlalinde bulunamadÄ±</td></tr>';

    // Reputation bilgileri
    const rep = data.reputation;
    const repSection = rep ? `
      <div class="osint-reputation-section">
        <h4>ðŸ›¡ï¸ Email Reputation (EmailRep.io)</h4>
        <div class="rep-grid">
          <div class="rep-item ${rep.suspicious ? 'bad' : 'good'}">
            <span class="rep-label">ÅžÃ¼pheli:</span>
            <span class="rep-value">${rep.suspicious ? 'âš ï¸ Evet' : 'âœ… HayÄ±r'}</span>
          </div>
          <div class="rep-item ${rep.blacklisted ? 'bad' : 'good'}">
            <span class="rep-label">Blacklist:</span>
            <span class="rep-value">${rep.blacklisted ? 'âŒ Evet' : 'âœ… HayÄ±r'}</span>
          </div>
          <div class="rep-item ${rep.credentials_leaked ? 'bad' : 'good'}">
            <span class="rep-label">Credential Leak:</span>
            <span class="rep-value">${rep.credentials_leaked ? 'âš ï¸ Evet' : 'âœ… HayÄ±r'}</span>
          </div>
          <div class="rep-item ${rep.spam ? 'bad' : 'good'}">
            <span class="rep-label">Spam:</span>
            <span class="rep-value">${rep.spam ? 'âŒ Evet' : 'âœ… HayÄ±r'}</span>
          </div>
          <div class="rep-item ${rep.disposable ? 'bad' : 'good'}">
            <span class="rep-label">Tek KullanÄ±mlÄ±k:</span>
            <span class="rep-value">${rep.disposable ? 'âš ï¸ Evet' : 'âœ… HayÄ±r'}</span>
          </div>
          <div class="rep-item ${rep.deliverable ? 'good' : 'bad'}">
            <span class="rep-label">Teslim Edilebilir:</span>
            <span class="rep-value">${rep.deliverable ? 'âœ… Evet' : 'âŒ HayÄ±r'}</span>
          </div>
        </div>
        <div class="rep-dates">
          ${rep.first_seen ? `<span>Ä°lk gÃ¶rÃ¼lme: ${rep.first_seen}</span>` : ''}
          ${rep.last_seen ? `<span>Son gÃ¶rÃ¼lme: ${rep.last_seen}</span>` : ''}
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
          <span class="stat-label">Ä°lk Ä°hlal</span>
        </div>
        ` : ''}
      </div>
    ` : '';

    modal.innerHTML = `
      <div class="osint-modal">
        <div class="osint-header">
          <h3>ðŸ” Email OSINT Raporu</h3>
          <span class="osint-email">${email}</span>
          <span class="risk-badge" style="background:${risk.bg};color:${risk.text}">${risk.label}</span>
          <button class="osint-close" onclick="this.closest('.osint-modal-overlay').remove()">âœ•</button>
        </div>
        <div class="osint-body">
          ${statsSection}
          ${repSection}
          <div class="osint-breaches-section">
            <h4>ðŸ’¥ Veri Ä°hlalleri (${data.breaches?.length || 0})</h4>
            <table class="breach-table">
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Tarih</th>
                  <th>Ã‡alÄ±nan Veriler</th>
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

    // Modal dÄ±ÅŸÄ±na tÄ±klayÄ±nca kapat
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

  } catch (e) {
    hideLoading();
    console.error('[EmailOSINT] Hata:', e);
    showToast('âŒ OSINT araÅŸtÄ±rmasÄ± baÅŸarÄ±sÄ±z: ' + (e.message || 'Hata'), 'error');
  }
}

// ðŸ—ºï¸ HARITA FONKSÄ°YONU - Guild Ã¼yelerinin IP konumlarÄ±nÄ± gÃ¶ster (GELÄ°ÅžMÄ°Åž)
function initGuildMap(membersWithLocation, locationSummary = []) {
  const mapContainer = document.getElementById('guild-map');
  if (!mapContainer || !window.L) {
    console.error('[Map] Leaflet yÃ¼klenmemiÅŸ veya container bulunamadÄ±');
    return;
  }

  // Ã–nceki haritayÄ± temizle
  mapContainer.innerHTML = '';

  // GeÃ§erli konumlarÄ± filtrele
  const validLocations = membersWithLocation.filter(m =>
    m.ip_location &&
    typeof m.ip_location.lat === 'number' &&
    typeof m.ip_location.lon === 'number' &&
    !isNaN(m.ip_location.lat) &&
    !isNaN(m.ip_location.lon)
  );

  if (validLocations.length === 0) {
    console.warn('[Map] GeÃ§erli konum bulunamadÄ±');
    mapContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: #666;">ðŸ“ Konum bilgisi bulunamadÄ±</div>';
    return;
  }

  console.log(`[Map] ${validLocations.length} geÃ§erli konum gÃ¶steriliyor`);

  // TÃ¼m konumlarÄ±n ortalamasÄ±nÄ± merkez olarak al
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

  // AynÄ± konumdaki Ã¼yeleri grupla
  validLocations.forEach(m => {
    const loc = m.ip_location;
    const key = `${loc.lat.toFixed(3)},${loc.lon.toFixed(3)}`;
    if (!locationGroups[key]) {
      locationGroups[key] = [];
    }
    locationGroups[key].push(m);
  });

  // Her grup iÃ§in marker oluÅŸtur
  Object.entries(locationGroups).forEach(([key, groupMembers]) => {
    const firstMember = groupMembers[0];
    const loc = firstMember.ip_location;
    
    // Grup avatarlarÄ±
    const avatarUrls = groupMembers.slice(0, 3).map(m => {
      return m.avatar_url || `https://cdn.discordapp.com/embed/avatars/${parseInt(m.discord_id) % 5}.png`;
    });

    // Popup iÃ§eriÄŸi
    let popupContent = `
      <div class="map-popup">
        <div class="popup-location-header">
          <span class="loc-flag-big">${getCountryEmoji(loc.country)}</span>
          <div>
            <div class="popup-city">${loc.city || 'Bilinmiyor'}</div>
            <div class="popup-country">${loc.country || loc.countryCode || '?'}</div>
          </div>
        </div>
        <div class="popup-coords">ðŸ“Œ ${loc.lat.toFixed(4)}, ${loc.lon.toFixed(4)}</div>
        <div class="popup-members-count">ðŸ‘¥ ${groupMembers.length} Ã¼ye</div>
        <div class="popup-members-list">
    `;

    // Ãœye listesi (ilk 5)
    groupMembers.slice(0, 5).forEach(m => {
      popupContent += `
        <div class="popup-member-item">
          <img src="${m.avatar_url}" class="popup-member-avatar" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
          <span class="popup-member-name">${m.username || 'Ä°simsiz'}</span>
          <span class="popup-member-ip">${m.ip}</span>
        </div>
      `;
    });

    if (groupMembers.length > 5) {
      popupContent += `<div class="popup-more">+${groupMembers.length - 5} daha...</div>`;
    }

    popupContent += `</div></div>`;

    // Grup marker'Ä± iÃ§in custom icon
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

  // TÃ¼m marker'larÄ± gÃ¶ster
  if (markers.length > 1) {
    const group = new L.featureGroup(markers);
    map.fitBounds(group.getBounds().pad(0.2));
  } else if (markers.length === 1) {
    map.setZoom(10);
  }

  // Harita kontrolleri
  L.control.scale({ metric: true, imperial: false }).addTo(map);
  
  // Konum Ã¶zetini de haritaya ekle (saÄŸ Ã¼st)
  if (locationSummary.length > 0) {
    const summaryControl = L.control({ position: 'topright' });
    summaryControl.onAdd = () => {
      const div = L.DomUtil.create('div', 'map-location-summary');
      const top3 = locationSummary.slice(0, 3);
      div.innerHTML = `
        <div class="summary-title">ðŸ† En Ã‡ok Ãœye</div>
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

  console.log(`[Map] ${markers.length} konum grubu baÅŸarÄ±yla gÃ¶sterildi`);
}

searchBtn.addEventListener('click', doSearch);
searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
document.addEventListener('export', exportResult);

// SQL/TXT Dosya YÃ¼kleme (Railway iÃ§in)
const sqlFileInput = document.getElementById('sqlFileInput');
const uploadSqlBtn = document.getElementById('uploadSqlBtn');
const uploadStatus = document.getElementById('uploadStatus');

uploadSqlBtn?.addEventListener('click', async () => {
  const file = sqlFileInput?.files?.[0];
  if (!file) {
    uploadStatus.textContent = 'âŒ Dosya seÃ§ilmedi';
    return;
  }
  
  if (!file.name.endsWith('.sql') && !file.name.endsWith('.txt')) {
    uploadStatus.textContent = 'âŒ Sadece .sql ve .txt dosyalarÄ±';
    return;
  }
  
  try {
    uploadStatus.textContent = 'â¬†ï¸ YÃ¼kleniyor...';
    
    const arrayBuffer = await file.arrayBuffer();
    const response = await fetch(`/api/upload-sql?filename=${encodeURIComponent(file.name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: arrayBuffer
    });
    
    const result = await response.json();
    if (result.ok) {
      uploadStatus.textContent = `âœ… ${file.name} yÃ¼klendi (${(result.size / 1024 / 1024).toFixed(2)} MB)`;
      sqlFileInput.value = ''; // Reset input
      showToast('Dosya baÅŸarÄ±yla yÃ¼klendi!', 'success');
    } else {
      uploadStatus.textContent = `âŒ Hata: ${result.error}`;
    }
  } catch (err) {
    uploadStatus.textContent = `âŒ Hata: ${err.message}`;
    console.error('Upload error:', err);
  }
});

// Enter tuÅŸu ile manuel giriÅŸ
manualDiscordId?.addEventListener('keydown', (e) => { if (e.key === 'Enter') addManualDiscordInfo(); });
manualEmailOnly?.addEventListener('keydown', (e) => { if (e.key === 'Enter') addManualEmail(); });

// ðŸŽ¬ PILL SELECTION REMOVED - Direct to login
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
    <div style="font-size: 1em;">${pillColor === 'red' ? 'GERÃ‡EKLÄ°K AÃ‡ILIYOR' : 'SÄ°STEME GÄ°RÄ°Åž'}</div>
    <div style="font-size: 0.3em; margin-top: 30px; opacity: 0.6;">10 SANÄ°YE...</div>
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
  
  const chars = '01ã‚¢ã‚¤ã‚¦ã‚¨ã‚ªã‚«ã‚­ã‚¯ã‚±ã‚³ã‚µã‚·ã‚¹ã‚»ã‚½ã‚¿ãƒãƒ„ãƒ†ãƒˆãƒŠãƒ‹ãƒŒãƒãƒŽãƒãƒ’ãƒ•ãƒ˜ãƒ›ãƒžãƒŸãƒ ãƒ¡ãƒ¢ãƒ¤ãƒ¦ãƒ¨ãƒ©ãƒªãƒ«ãƒ¬ãƒ­ãƒ¯ãƒ²ãƒ³';
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

// ðŸš— PLAKA SORGULAMA
async function searchPlaka() {
  const plaka = document.getElementById('searchInput')?.value?.trim();
  if (!plaka) {
    showToast('âš ï¸ LÃ¼tfen bir plaka numarasÄ± girin', 'warning');
    return;
  }
  
  // Plaka formatÄ± doÄŸrulama (Ã¶rn: 34 ABC 123)
  const plakaRegex = /^\d{2}\s*[A-Z]{1,3}\s*\d{2,4}$/i;
  if (!plakaRegex.test(plaka)) {
    showToast('âš ï¸ GeÃ§ersiz plaka formatÄ± (Ã¶rnek: 34 ABC 123)', 'warning');
    return;
  }
  
  showLoading();
  
  try {
    // Backend API'ye istek
    const data = await api(`/api/plaka-sorgu?plaka=${encodeURIComponent(plaka)}`, { method: 'GET' });
    hideLoading();
    
    if (data.error) {
      showToast('âš ï¸ Plaka sorgu hatasÄ±: ' + (data.message || data.error), 'warning');
      // Mock veri gÃ¶ster (gerÃ§ek API Ã§alÄ±ÅŸmadÄ±ÄŸÄ±nda)
      showPlakaResults({
        plaka: plaka,
        aracBilgileri: {
          marka: 'Ã–rnek Marka',
          model: 'Ã–rnek Model',
          yil: '2020',
          renk: 'Siyah',
          yakit: 'Benzin'
        },
        sahipBilgileri: {
          ad: 'Ad Soyad (Ã–rnek)',
          tc: '12345678901',
          adres: 'Ã–rnek Adres, Ä°stanbul',
          telefon: '0555 123 4567'
        },
        kayitBilgileri: {
          tescilTarihi: '15.03.2020',
          muayeneTarihi: '10.01.2025',
          trafikSigorta: 'GeÃ§erli',
          kasko: 'GeÃ§erli'
        },
        cezaBilgileri: [
          { tarih: '01.01.2024', tur: 'HÄ±z Ä°hlali', tutar: '1.002 TL', durum: 'Ã–denmedi' }
        ]
      });
      return;
    }
    
    showPlakaResults(data);
    
  } catch (err) {
    hideLoading();
    showToast('âŒ Plaka sorgu baÅŸarÄ±sÄ±z: ' + err.message, 'error');
  }
}

// Plaka sonuÃ§larÄ±nÄ± gÃ¶ster
function showPlakaResults(data) {
  const resultsArea = document.getElementById('resultsArea');
  const noResults = document.getElementById('noResults');
  
  const container = document.createElement('div');
  container.className = 'plaka-results-container';
  
  container.innerHTML = `
    <div class="plaka-header">
      <div class="plaka-badge">ðŸš— ${data.plaka}</div>
      <h2 class="plaka-title">AraÃ§ ve Sahip Bilgileri</h2>
    </div>
    
    <div class="plaka-cards">
      <!-- AraÃ§ Bilgileri -->
      <div class="plaka-card">
        <div class="plaka-card-header">ðŸš˜ AraÃ§ Bilgileri</div>
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
            <span class="plaka-label">YÄ±l:</span>
            <span class="plaka-value">${data.aracBilgileri?.yil || '-'}</span>
          </div>
          <div class="plaka-info-row">
            <span class="plaka-label">Renk:</span>
            <span class="plaka-value">${data.aracBilgileri?.renk || '-'}</span>
          </div>
          <div class="plaka-info-row">
            <span class="plaka-label">YakÄ±t:</span>
            <span class="plaka-value">${data.aracBilgileri?.yakit || '-'}</span>
          </div>
        </div>
      </div>
      
      <!-- Sahip Bilgileri -->
      <div class="plaka-card owner-card">
        <div class="plaka-card-header">ðŸ‘¤ Sahip Bilgileri</div>
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
      
      <!-- KayÄ±t Bilgileri -->
      <div class="plaka-card">
        <div class="plaka-card-header">ðŸ“‹ KayÄ±t Bilgileri</div>
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
            <span class="plaka-label">Trafik SigortasÄ±:</span>
            <span class="plaka-value ${data.kayitBilgileri?.trafikSigorta === 'GeÃ§erli' ? 'status-valid' : 'status-invalid'}">${data.kayitBilgileri?.trafikSigorta || '-'}</span>
          </div>
          <div class="plaka-info-row">
            <span class="plaka-label">Kasko:</span>
            <span class="plaka-value ${data.kayitBilgileri?.kasko === 'GeÃ§erli' ? 'status-valid' : 'status-invalid'}">${data.kayitBilgileri?.kasko || '-'}</span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Ceza Bilgileri -->
    ${data.cezaBilgileri && data.cezaBilgileri.length > 0 ? `
    <div class="plaka-ceza-section">
      <div class="plaka-ceza-header">âš ï¸ Ceza Bilgileri (${data.cezaBilgileri.length} kayÄ±t)</div>
      <div class="plaka-ceza-list">
        ${data.cezaBilgileri.map(ceza => `
          <div class="plaka-ceza-item ${ceza.durum === 'Ã–denmedi' ? 'unpaid' : 'paid'}">
            <div class="ceza-date">${ceza.tarih}</div>
            <div class="ceza-type">${ceza.tur}</div>
            <div class="ceza-amount">${ceza.tutar}</div>
            <div class="ceza-status">${ceza.durum}</div>
          </div>
        `).join('')}
      </div>
    </div>
    ` : '<div class="plaka-no-ceza">âœ… Ceza kaydÄ± bulunamadÄ±</div>'}
    
    <div class="plaka-disclaimer">
      âš ï¸ Bu bilgiler Ã¶rnek/demo amaÃ§lÄ±dÄ±r. GerÃ§ek plaka sorgulama iÃ§in yetkili kuruluÅŸlara baÅŸvurun.
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
  if (typeof initNavigation === 'function') {
    initNavigation();
  }
  if (typeof initStatsUpdate === 'function') {
    initStatsUpdate();
  }
  await loadStats();
  if (typeof initMap === 'function') {
    initMap();
  }
  if (typeof showView === 'function') {
    showView('home');
  }
})();

// Stub functions for missing dependencies
function initNavigation() { console.log('[initNavigation] Stub called'); }
function initStatsUpdate() { console.log('[initStatsUpdate] Stub called'); }
function initMap() { console.log('[initMap] Stub called'); }

// ðŸ–¼ï¸ VÄ°EW YÃ–NETÄ°MÄ° - Sayfa gÃ¶rÃ¼nÃ¼mlerini deÄŸiÅŸtir
function showView(view) {
  console.log('[showView] View deÄŸiÅŸtiriliyor:', view);
  
  // TÃ¼m view section'larÄ± gizle
  const views = ['home', 'search', 'results', 'guilds', 'admin', 'email', 'stats', 'map', 'settings'];
  views.forEach(v => {
    const el = document.getElementById(v + 'View') || document.getElementById(v);
    if (el) el.classList.add('hidden');
  });
  
  // Ä°stenen view'i gÃ¶ster
  let targetView = document.getElementById(view + 'View') || document.getElementById(view);
  if (targetView) {
    targetView.classList.remove('hidden');
  } else {
    // Ana container'Ä± kontrol et
    const mainContainer = document.getElementById('mainContainer') || document.querySelector('.main-container');
    if (mainContainer) {
      console.log('[showView] View elementi bulunamadÄ±, ana container gÃ¶steriliyor');
      mainContainer.classList.remove('hidden');
    }
  }
  
  // Navbar aktif durumunu gÃ¼ncelle
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
    if (item.dataset.view === view || item.getAttribute('href')?.includes(view)) {
      item.classList.add('active');
    }
  });
}

function setupKeyboardShortcuts() { console.log('[setupKeyboardShortcuts] Stub called'); }
function setupBeforeUnload() { console.log('[setupBeforeUnload] Stub called'); }

// ðŸ†” TC SORGU SONUÃ‡LARI GÃ–RÃœNÃœMÃœ
function createTcResultsView(data) {
  const container = document.createElement('div');
  container.className = 'tc-results';
  
  let html = `
    <div style="background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); padding: 20px; border-radius: 16px; margin-bottom: 20px;">
      <h3 style="margin: 0 0 15px 0; color: white; font-size: 18px;">
        ðŸ†” TC Sorgu SonuÃ§larÄ±
        <span style="background: rgba(255,255,255,0.2); padding: 4px 12px; border-radius: 12px; font-size: 12px; margin-left: 10px;">
          ${data.count || 0} kayÄ±t
        </span>
      </h3>
      <div style="color: rgba(255,255,255,0.9); font-size: 14px;">
        <strong>Sorgulanan TC:</strong> ${escapeHtml(data.query || '')}
      </div>
    </div>
  `;
  
  if (data.results && data.results.length > 0) {
    data.results.forEach((person, index) => {
      html += `
        <div style="background: rgba(0,0,0,0.3); padding: 20px; border-radius: 12px; margin-bottom: 15px; border-left: 4px solid #5865F2;">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
            <div>
              <div style="color: #72767d; font-size: 12px; margin-bottom: 4px;">Ad</div>
              <div style="color: white; font-weight: 600;">${escapeHtml(person.first_name || person.ad || 'â€”')}</div>
            </div>
            <div>
              <div style="color: #72767d; font-size: 12px; margin-bottom: 4px;">Soyad</div>
              <div style="color: white; font-weight: 600;">${escapeHtml(person.last_name || person.soyad || 'â€”')}</div>
            </div>
            <div>
              <div style="color: #72767d; font-size: 12px; margin-bottom: 4px;">TC Kimlik No</div>
              <div style="color: #00d4aa; font-weight: 600; font-family: monospace;">${escapeHtml(person.tc || person.tc_no || person.tckn || data.query)}</div>
            </div>
            <div>
              <div style="color: #72767d; font-size: 12px; margin-bottom: 4px;">DoÄŸum Tarihi</div>
              <div style="color: white;">${escapeHtml(person.birth_date || person.dogum_tarihi || 'â€”')}</div>
            </div>
            <div>
              <div style="color: #72767d; font-size: 12px; margin-bottom: 4px;">Cinsiyet</div>
              <div style="color: white;">${escapeHtml(person.gender || person.cinsiyet || 'â€”')}</div>
            </div>
            <div>
              <div style="color: #72767d; font-size: 12px; margin-bottom: 4px;">Åžehir</div>
              <div style="color: white;">${escapeHtml(person.city || person.il || 'â€”')}</div>
            </div>
          </div>
        </div>
      `;
    });
  } else {
    html += `
      <div style="text-align: center; padding: 40px; color: #72767d;">
        <div style="font-size: 48px; margin-bottom: 15px;">ðŸ”</div>
        <div>SonuÃ§ bulunamadÄ±</div>
      </div>
    `;
  }
  
  if (data.has_more) {
    html += `<div style="text-align: center; color: #72767d; margin-top: 20px; font-size: 13px;">Daha fazla sonuÃ§ var...</div>`;
  }
  
  container.innerHTML = html;
  return container;
}

// ðŸ‘¤ AD SOYAD SORGU SONUÃ‡LARI GÃ–RÃœNÃœMÃœ
function createAdSoyadResultsView(data) {
  const container = document.createElement('div');
  container.className = 'adsoyad-results';
  
  const demoBadge = data.demo_mode ? '<span style="background:#FAA61A;color:#000;padding:4px 8px;border-radius:4px;font-size:12px;margin-left:10px;">DEMO MOD</span>' : '';
  
  let html = `
    <div style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);border:1px solid #ED4245;border-radius:12px;padding:20px;margin-bottom:20px;">
      <h3 style="color:#ED4245;margin-bottom:15px;display:flex;align-items:center;gap:10px;">
        ðŸ‘¤ 101M Ad Soyad VeritabanÄ± ${demoBadge}
      </h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:15px;margin-bottom:20px;">
        <div style="background:rgba(0,0,0,0.3);padding:15px;border-radius:8px;text-align:center;">
          <div style="font-size:24px;font-weight:bold;color:#3BA55D;">${data.total || 0}</div>
          <div style="font-size:12px;color:#b9bbbe;">Toplam SonuÃ§</div>
        </div>
        <div style="background:rgba(0,0,0,0.3);padding:15px;border-radius:8px;text-align:center;">
          <div style="font-size:24px;font-weight:bold;color:#5865F2;">${data.returned || 0}</div>
          <div style="font-size:12px;color:#b9bbbe;">GÃ¶sterilen</div>
        </div>
        <div style="background:rgba(0,0,0,0.3);padding:15px;border-radius:8px;text-align:center;">
          <div style="font-size:24px;font-weight:bold;color:#FAA61A;">${(data.database_size || 0).toLocaleString()}</div>
          <div style="font-size:12px;color:#b9bbbe;">VeritabanÄ±</div>
        </div>
        <div style="background:rgba(0,0,0,0.3);padding:15px;border-radius:8px;text-align:center;">
          <div style="font-size:24px;font-weight:bold;color:#ED4245;">${data.search_time_ms || 0}ms</div>
          <div style="font-size:12px;color:#b9bbbe;">Arama SÃ¼resi</div>
        </div>
      </div>
  `;
  
  if (data.results?.length > 0) {
    html += `
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:rgba(237,66,69,0.2);">
              <th style="padding:12px;text-align:left;color:#ED4245;font-size:13px;border-bottom:2px solid #ED4245;">ðŸ‘¤ KiÅŸi</th>
              <th style="padding:12px;text-align:left;color:#ED4245;font-size:13px;border-bottom:2px solid #ED4245;">ðŸ†” TCKN</th>
              <th style="padding:12px;text-align:left;color:#ED4245;font-size:13px;border-bottom:2px solid #ED4245;">ðŸ“… DoÄŸum</th>
              <th style="padding:12px;text-align:left;color:#ED4245;font-size:13px;border-bottom:2px solid #ED4245;">ðŸ‘¨â€ðŸ‘©â€ðŸ‘§ Aile</th>
              <th style="padding:12px;text-align:left;color:#ED4245;font-size:13px;border-bottom:2px solid #ED4245;">ðŸ“ Adres</th>
              <th style="padding:12px;text-align:center;color:#ED4245;font-size:13px;border-bottom:2px solid #ED4245;">ðŸ“‹ Kopyala</th>
            </tr>
          </thead>
          <tbody>
    `;
    
    data.results.forEach((r, i) => {
      const bg = i % 2 === 0 ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.1)';
      const genderIcon = r.gender === 'Erkek' ? 'â™‚ï¸' : 'â™€ï¸';
      const genderColor = r.gender === 'Erkek' ? '#5865F2' : '#ED4245';
      html += `
        <tr style="background:${bg};transition:background 0.2s;" onmouseover="this.style.background='rgba(237,66,69,0.2)'" onmouseout="this.style.background='${bg}'">
          <td style="padding:12px;border-bottom:1px solid rgba(255,255,255,0.1);">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:20px;">${genderIcon}</span>
              <div>
                <div style="color:#fff;font-size:15px;font-weight:bold;">${r.full_name}</div>
                <div style="color:${genderColor};font-size:11px;">${r.gender} | ${r.age} yaÅŸ</div>
                <div style="color:#666;font-size:10px;">${r.status}</div>
              </div>
            </div>
          </td>
          <td style="padding:12px;border-bottom:1px solid rgba(255,255,255,0.1);">
            <span style="font-family:monospace;font-size:14px;color:#FAA61A;font-weight:bold;">${r.tc_no}</span>
            <div style="color:#666;font-size:10px;margin-top:2px;">${r.blood_type}</div>
          </td>
          <td style="padding:12px;border-bottom:1px solid rgba(255,255,255,0.1);">
            <div style="color:#fff;font-size:13px;">${r.birth_date}</div>
            <div style="color:#b9bbbe;font-size:11px;">${r.birth_city}</div>
            <div style="color:#666;font-size:10px;">${r.marital_status}</div>
          </td>
          <td style="padding:12px;border-bottom:1px solid rgba(255,255,255,0.1);">
            <div style="color:#b9bbbe;font-size:12px;">
              <div>ðŸ‘© Anne: ${r.mother_name}</div>
              <div>ðŸ‘¨ Baba: ${r.father_name}</div>
            </div>
          </td>
          <td style="padding:12px;border-bottom:1px solid rgba(255,255,255,0.1);">
            <div style="color:#fff;font-size:13px;">${r.current_city}</div>
            <div style="color:#b9bbbe;font-size:11px;">${r.district}</div>
            <div style="color:#666;font-size:10px;">${r.neighborhood}</div>
            <div style="color:#3BA55D;font-size:10px;" title="${r.address}">ðŸ“ ${r.address.substring(0, 30)}...</div>
          </td>
          <td style="padding:12px;border-bottom:1px solid rgba(255,255,255,0.1);text-align:center;">
            <button onclick="copyVal('${r.tc_no}')" style="background:#ED4245;color:#fff;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:11px;margin-bottom:4px;width:100%;">ðŸ“‹ TC</button>
            <button onclick="copyVal('${r.phone}')" style="background:#3BA55D;color:#fff;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:11px;margin-bottom:4px;width:100%;">ðŸ“ž Tel</button>
            <button onclick="copyVal('${r.full_name}')" style="background:#5865F2;color:#fff;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:11px;width:100%;">ðŸ‘¤ Ä°sim</button>
          </td>
        </tr>
      `;
    });
    
    html += `
          </tbody>
        </table>
      </div>
    `;
  } else {
    html += `
      <div style="text-align:center;padding:40px;color:#b9bbbe;">
        <div style="font-size:48px;margin-bottom:10px;">ðŸ‘¤</div>
        <div>SonuÃ§ bulunamadÄ±.</div>
      </div>
    `;
  }
  
  if (data.demo_mode) {
    html += `
      <div style="background:rgba(250,166,26,0.1);border:1px solid #FAA61A;border-radius:8px;padding:15px;margin-top:20px;">
        <div style="color:#FAA61A;font-size:13px;">
          <strong>âš ï¸ Demo Mod:</strong> GerÃ§ek 101M Ad Soyad veritabanÄ± yÃ¼klenmemiÅŸ. Åžu anda demo verileri gÃ¶steriliyor.
          VeritabanÄ±nÄ± yÃ¼klemek iÃ§in <code>101m_adsoyad.json</code> dosyasÄ±nÄ± <code>/data</code> klasÃ¶rÃ¼ne yÃ¼kleyin.
        </div>
      </div>
    `;
  }
  
  html += '</div>';
  
  container.innerHTML = html;
  return container;
}

// ðŸ”„ GENERIC SONUÃ‡ GÃ–RÃœNÃœMÃœ (Yeni sorgu tipleri iÃ§in)
function createGenericResultsView(data, title, color) {
  const container = document.createElement('div');
  container.className = 'generic-results';
  
  const demoBadge = data.demo_mode ? '<span style="background:#FAA61A;color:#000;padding:4px 8px;border-radius:4px;font-size:12px;margin-left:10px;">DEMO MOD</span>' : '';
  
  let html = `
    <div style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);border:1px solid ${color};border-radius:12px;padding:20px;margin-bottom:20px;">
      <h3 style="color:${color};margin-bottom:15px;display:flex;align-items:center;gap:10px;">
        ${title} ${demoBadge}
      </h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:15px;margin-bottom:20px;">
        <div style="background:rgba(0,0,0,0.3);padding:15px;border-radius:8px;text-align:center;">
          <div style="font-size:24px;font-weight:bold;color:#3BA55D;">${data.total || 0}</div>
          <div style="font-size:12px;color:#b9bbbe;">Toplam SonuÃ§</div>
        </div>
        <div style="background:rgba(0,0,0,0.3);padding:15px;border-radius:8px;text-align:center;">
          <div style="font-size:24px;font-weight:bold;color:${color};">${data.returned || 0}</div>
          <div style="font-size:12px;color:#b9bbbe;">GÃ¶sterilen</div>
        </div>
      </div>
  `;
  
  if (data.results?.length > 0) {
    html += `
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:${color}20;">
              <th style="padding:12px;text-align:left;color:${color};font-size:13px;border-bottom:2px solid ${color};">ðŸ“‹ ID</th>
              <th style="padding:12px;text-align:left;color:${color};font-size:13px;border-bottom:2px solid ${color};">ðŸ‘¤ Ä°sim</th>
              <th style="padding:12px;text-align:left;color:${color};font-size:13px;border-bottom:2px solid ${color};">ðŸ“ Konum</th>
              <th style="padding:12px;text-align:left;color:${color};font-size:13px;border-bottom:2px solid ${color};">â„¹ï¸ Detaylar</th>
              <th style="padding:12px;text-align:center;color:${color};font-size:13px;border-bottom:2px solid ${color};">ðŸ“‹ Kopyala</th>
            </tr>
          </thead>
          <tbody>
    `;
    
    data.results.forEach((r, i) => {
      const bg = i % 2 === 0 ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.1)';
      const name = r.full_name || r.student_name || r.display_name || `${r.first_name} ${r.last_name}` || '-';
      const location = r.city || r.location || r.district || '-';
      
      // Detay objesini oluÅŸtur
      let details = '';
      const excludeFields = ['id', 'first_name', 'last_name', 'full_name', 'city', 'district', 'location', 'student_name', 'display_name'];
      Object.entries(r).forEach(([key, value]) => {
        if (!excludeFields.includes(key) && value && value !== 'null' && value !== '-') {
          details += `<div style="color:#b9bbbe;font-size:11px;">${key}: <span style="color:#fff;">${value}</span></div>`;
        }
      });
      
      html += `
        <tr style="background:${bg};transition:background 0.2s;" onmouseover="this.style.background='${color}20'" onmouseout="this.style.background='${bg}'">
          <td style="padding:12px;border-bottom:1px solid rgba(255,255,255,0.1);">
            <span style="font-family:monospace;font-size:13px;color:${color};font-weight:bold;">${r.id || '-'}</span>
          </td>
          <td style="padding:12px;border-bottom:1px solid rgba(255,255,255,0.1);">
            <div style="color:#fff;font-size:14px;font-weight:bold;">${name}</div>
            ${r.tc_no ? `<div style="color:#FAA61A;font-size:10px;">TC: ${r.tc_no}</div>` : ''}
          </td>
          <td style="padding:12px;border-bottom:1px solid rgba(255,255,255,0.1);">
            <div style="color:#fff;font-size:13px;">${location}</div>
          </td>
          <td style="padding:12px;border-bottom:1px solid rgba(255,255,255,0.1);">
            ${details}
          </td>
          <td style="padding:12px;border-bottom:1px solid rgba(255,255,255,0.1);text-align:center;">
            <button onclick="copyVal('${r.id || ''}')" style="background:${color};color:#fff;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:12px;">ðŸ“‹</button>
          </td>
        </tr>
      `;
    });
    
    html += `
          </tbody>
        </table>
      </div>
    `;
  } else {
    html += `
      <div style="text-align:center;padding:40px;color:#b9bbbe;">
        <div style="font-size:48px;margin-bottom:10px;">ðŸ”</div>
        <div>SonuÃ§ bulunamadÄ±.</div>
      </div>
    `;
  }
  
  if (data.demo_mode) {
    html += `
      <div style="background:rgba(250,166,26,0.1);border:1px solid #FAA61A;border-radius:8px;padding:15px;margin-top:20px;">
        <div style="color:#FAA61A;font-size:13px;">
          <strong>âš ï¸ Demo Mod:</strong> GerÃ§ek veritabanÄ± yÃ¼klenmemiÅŸ. Åžu anda demo verileri gÃ¶steriliyor.
        </div>
      </div>
    `;
  }
  
  html += '</div>';
  
  container.innerHTML = html;
  return container;
}

// ðŸ’‰ AÅžI SORGU SONUÃ‡LARI GÃ–RÃœNÃœMÃœ
function createAsiResultsView(data) {
  const container = document.createElement('div');
  container.className = 'asi-results';
  
  const demoBadge = data.demo_mode ? '<span style="background:#FAA61A;color:#000;padding:4px 8px;border-radius:4px;font-size:12px;margin-left:10px;">DEMO MOD</span>' : '';
  
  let html = `
    <div style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);border:1px solid #3BA55D;border-radius:12px;padding:20px;margin-bottom:20px;">
      <h3 style="color:#3BA55D;margin-bottom:15px;display:flex;align-items:center;gap:10px;">
        ðŸ’‰ 10M AÅŸÄ± Sorgu VeritabanÄ± ${demoBadge}
      </h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:15px;margin-bottom:20px;">
        <div style="background:rgba(0,0,0,0.3);padding:15px;border-radius:8px;text-align:center;">
          <div style="font-size:24px;font-weight:bold;color:#3BA55D;">${data.total_people || 0}</div>
          <div style="font-size:12px;color:#b9bbbe;">KiÅŸi</div>
        </div>
        <div style="background:rgba(0,0,0,0.3);padding:15px;border-radius:8px;text-align:center;">
          <div style="font-size:24px;font-weight:bold;color:#5865F2;">${data.total_records || 0}</div>
          <div style="font-size:12px;color:#b9bbbe;">Toplam Doz</div>
        </div>
        <div style="background:rgba(0,0,0,0.3);padding:15px;border-radius:8px;text-align:center;">
          <div style="font-size:24px;font-weight:bold;color:#FAA61A;">${(data.database_size || 0).toLocaleString()}</div>
          <div style="font-size:12px;color:#b9bbbe;">VeritabanÄ±</div>
        </div>
        <div style="background:rgba(0,0,0,0.3);padding:15px;border-radius:8px;text-align:center;">
          <div style="font-size:24px;font-weight:bold;color:#ED4245;">${data.search_time_ms || 0}ms</div>
          <div style="font-size:12px;color:#b9bbbe;">Arama SÃ¼resi</div>
        </div>
      </div>
  `;
  
  if (data.people?.length > 0) {
    html += `
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:rgba(59,165,93,0.2);">
              <th style="padding:12px;text-align:left;color:#3BA55D;font-size:13px;border-bottom:2px solid #3BA55D;">ðŸ‘¤ KiÅŸi</th>
              <th style="padding:12px;text-align:left;color:#3BA55D;font-size:13px;border-bottom:2px solid #3BA55D;">ðŸ“ Konum</th>
              <th style="padding:12px;text-align:left;color:#3BA55D;font-size:13px;border-bottom:2px solid #3BA55D;">ðŸ’‰ AÅŸÄ±lar</th>
              <th style="padding:12px;text-align:center;color:#3BA55D;font-size:13px;border-bottom:2px solid #3BA55D;">ðŸ“‹ Ä°ÅŸlemler</th>
            </tr>
          </thead>
          <tbody>
    `;
    
    data.people.forEach((person, i) => {
      const bg = i % 2 === 0 ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.1)';
      const genderIcon = person.gender === 'Erkek' ? 'â™‚ï¸' : 'â™€ï¸';
      const genderColor = person.gender === 'Erkek' ? '#5865F2' : '#ED4245';
      
      // AÅŸÄ± kartlarÄ±nÄ± oluÅŸtur
      let dosesHtml = '';
      person.doses?.forEach(dose => {
        const vaccineIcon = dose.vaccine_type?.includes('Sinovac') ? 'ðŸ‡¨ðŸ‡³' : 
                          dose.vaccine_type?.includes('Biontech') ? 'ðŸ‡©ðŸ‡ª' :
                          dose.vaccine_type?.includes('Turkovac') ? 'ðŸ‡¹ðŸ‡·' : 'ðŸ’‰';
        dosesHtml += `
          <div style="background:rgba(59,165,93,0.1);border:1px solid rgba(59,165,93,0.3);border-radius:6px;padding:8px;margin-bottom:6px;">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
              <span>${vaccineIcon}</span>
              <span style="color:#3BA55D;font-weight:bold;font-size:12px;">${dose.dose_number}</span>
              <span style="color:#fff;font-size:11px;">${dose.vaccine_type}</span>
            </div>
            <div style="color:#b9bbbe;font-size:10px;display:flex;gap:10px;">
              <span>ðŸ“… ${dose.vaccine_date}</span>
              <span>ðŸ¥ ${dose.vaccine_center?.substring(0, 20)}...</span>
            </div>
            <div style="color:#666;font-size:9px;margin-top:2px;">
              Lot: ${dose.lot_number} | SN: ${dose.serial_number?.substring(0, 15)}...
            </div>
            <div style="color:#FAA61A;font-size:9px;margin-top:2px;">
              ðŸ‘¨â€âš•ï¸ ${dose.doctor_name} ${dose.side_effect !== 'Yok' ? `| âš ï¸ ${dose.side_effect}` : ''}
            </div>
          </div>
        `;
      });
      
      html += `
        <tr style="background:${bg};transition:background 0.2s;" onmouseover="this.style.background='rgba(59,165,93,0.2)'" onmouseout="this.style.background='${bg}'">
          <td style="padding:12px;border-bottom:1px solid rgba(255,255,255,0.1);">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:20px;">${genderIcon}</span>
              <div>
                <div style="color:#fff;font-size:15px;font-weight:bold;">${person.full_name}</div>
                <div style="color:${genderColor};font-size:11px;">${person.gender} | ${person.age} yaÅŸ</div>
                <div style="color:#FAA61A;font-size:10px;font-family:monospace;">TC: ${person.tc_no}</div>
              </div>
            </div>
          </td>
          <td style="padding:12px;border-bottom:1px solid rgba(255,255,255,0.1);">
            <div style="color:#fff;font-size:14px;">${person.city}</div>
            <div style="color:#b9bbbe;font-size:11px;">${person.total_doses} Doz</div>
          </td>
          <td style="padding:12px;border-bottom:1px solid rgba(255,255,255,0.1);">
            ${dosesHtml}
          </td>
          <td style="padding:12px;border-bottom:1px solid rgba(255,255,255,0.1);text-align:center;">
            <button onclick="copyVal('${person.tc_no}')" style="background:#ED4245;color:#fff;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:11px;margin-bottom:4px;width:100%;">ðŸ“‹ TC</button>
            <button onclick="copyVal('${person.full_name}')" style="background:#3BA55D;color:#fff;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:11px;width:100%;">ðŸ‘¤ Ä°sim</button>
          </td>
        </tr>
      `;
    });
    
    html += `
          </tbody>
        </table>
      </div>
    `;
  } else {
    html += `
      <div style="text-align:center;padding:40px;color:#b9bbbe;">
        <div style="font-size:48px;margin-bottom:10px;">ðŸ’‰</div>
        <div>AÅŸÄ± kaydÄ± bulunamadÄ±.</div>
      </div>
    `;
  }
  
  if (data.demo_mode) {
    html += `
      <div style="background:rgba(250,166,26,0.1);border:1px solid #FAA61A;border-radius:8px;padding:15px;margin-top:20px;">
        <div style="color:#FAA61A;font-size:13px;">
          <strong>âš ï¸ Demo Mod:</strong> GerÃ§ek 10M AÅŸÄ± veritabanÄ± yÃ¼klenmemiÅŸ. Åžu anda demo verileri gÃ¶steriliyor.
          VeritabanÄ±nÄ± yÃ¼klemek iÃ§in <code>asi10m.json</code> dosyasÄ±nÄ± <code>/data</code> klasÃ¶rÃ¼ne yÃ¼kleyin.
        </div>
      </div>
    `;
  }
  
  html += '</div>';
  
  container.innerHTML = html;
  return container;
}

// ðŸ†” KÄ°MLÄ°K OLUÅžTURUCU FONKSÄ°YONLARI - Roswell Check tarzÄ±
// https://sahtekimlikolusturucu.github.io/ referans alÄ±narak yapÄ±lmÄ±ÅŸtÄ±r

// Kimlik oluÅŸtur butonu event listener
document.addEventListener('DOMContentLoaded', () => {
  // Kimlik oluÅŸtur butonu
  const generateBtn = document.getElementById('generateIdCardBtn');
  if (generateBtn) {
    generateBtn.addEventListener('click', generateIdCard);
  }
  
  // Temizle butonu
  const clearBtn = document.getElementById('clearIdCardBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', clearIdCardForm);
  }
  
  // Ä°ndir butonlarÄ±
  const downloadFrontBtn = document.getElementById('downloadFrontBtn');
  if (downloadFrontBtn) {
    downloadFrontBtn.addEventListener('click', () => downloadIdCard('front'));
  }
  
  const downloadBackBtn = document.getElementById('downloadBackBtn');
  if (downloadBackBtn) {
    downloadBackBtn.addEventListener('click', () => downloadIdCard('back'));
  }
  
  // TCKN input validation (sadece rakam)
  const tcknInput = document.getElementById('idCardTckn');
  if (tcknInput) {
    tcknInput.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 11);
    });
  }
  
  // Ä°sim/Soyisim validation (sadece harf ve boÅŸluk)
  ['idCardName', 'idCardSurname', 'idCardMother', 'idCardFather'].forEach(id => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/[^a-zA-ZÄŸÃ¼ÅŸÄ±Ã¶Ã§ÄžÃœÅžÄ°Ã–Ã‡\s]/g, '');
      });
    }
  });
  
  // VarsayÄ±lan tarihleri ayarla
  const birthDateInput = document.getElementById('idCardBirthDate');
  if (birthDateInput) {
    birthDateInput.value = '1990-01-01';
  }
  
  const validDateInput = document.getElementById('idCardValid');
  if (validDateInput) {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 10);
    validDateInput.value = futureDate.toISOString().split('T')[0];
  }
});

// Kimlik oluÅŸturma fonksiyonu
async function generateIdCard() {
  const btn = document.getElementById('generateIdCardBtn');
  const resultsDiv = document.getElementById('idCardResults');
  
  try {
    // Form verilerini al
    const name = document.getElementById('idCardName')?.value?.trim();
    const surname = document.getElementById('idCardSurname')?.value?.trim();
    const birthDate = document.getElementById('idCardBirthDate')?.value;
    const gender = document.getElementById('idCardGender')?.value;
    const tckn = document.getElementById('idCardTckn')?.value?.trim();
    const docNo = document.getElementById('idCardDocNo')?.value?.trim();
    const validUntil = document.getElementById('idCardValid')?.value;
    const motherName = document.getElementById('idCardMother')?.value?.trim();
    const fatherName = document.getElementById('idCardFather')?.value?.trim();
    const imageFile = document.getElementById('idCardImage')?.files?.[0];
    
    // Validasyon
    if (!name || !surname || !birthDate || !tckn || !docNo) {
      showToast('âŒ Eksik alanlar! Ä°sim, soyisim, doÄŸum tarihi, TCKN ve seri no zorunludur.', 'error');
      return;
    }
    
    if (tckn.length !== 11) {
      showToast('âŒ TCKN 11 haneli olmalÄ±dÄ±r!', 'error');
      return;
    }
    
    // Butonu loading yap
    btn.disabled = true;
    btn.textContent = 'ðŸ”„ OluÅŸturuluyor...';
    
    // FotoÄŸraf varsa base64'e Ã§evir
    let imageBase64 = null;
    if (imageFile) {
      imageBase64 = await fileToBase64(imageFile);
    }
    
    // API isteÄŸi
    const response = await api('/api/id-card/generate', {
      method: 'POST',
      body: JSON.stringify({
        name: name.toUpperCase(),
        surname: surname.toUpperCase(),
        birth_date: birthDate,
        gender: gender,
        tckn: tckn,
        document_number: docNo.toUpperCase(),
        valid_until: validUntil,
        mother_name: motherName?.toUpperCase(),
        father_name: fatherName?.toUpperCase(),
        image_base64: imageBase64
      })
    });
    
    if (response.ok) {
      // SonuÃ§larÄ± gÃ¶ster
      resultsDiv.classList.remove('hidden');
      
      // HTML template'leri iframe'lere yÃ¼kle
      const frontFrame = document.getElementById('idCardFront');
      const backFrame = document.getElementById('idCardBack');
      
      if (frontFrame) {
        frontFrame.srcdoc = response.templates?.front || '';
      }
      if (backFrame) {
        backFrame.srcdoc = response.templates?.back || '';
      }
      
      showToast('âœ… Kimlik baÅŸarÄ±yla oluÅŸturuldu!', 'success');
      console.log('[Kimlik OluÅŸturucu] Kimlik oluÅŸturuldu:', response.data);
    } else {
      showToast(`âŒ Hata: ${response.error || 'Bilinmeyen hata'}`, 'error');
    }
  } catch (err) {
    console.error('[Kimlik OluÅŸturucu] Hata:', err);
    showToast(`âŒ Hata: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'ðŸ†” Kimlik OluÅŸtur';
  }
}

// DosyayÄ± base64'e Ã§evir
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Kimlik formunu temizle
function clearIdCardForm() {
  document.getElementById('idCardName').value = '';
  document.getElementById('idCardSurname').value = '';
  document.getElementById('idCardTckn').value = '';
  document.getElementById('idCardDocNo').value = '';
  document.getElementById('idCardMother').value = '';
  document.getElementById('idCardFather').value = '';
  document.getElementById('idCardImage').value = '';
  document.getElementById('idCardResults').classList.add('hidden');
  
  // Tarihleri varsayÄ±lana ayarla
  const birthDateInput = document.getElementById('idCardBirthDate');
  if (birthDateInput) birthDateInput.value = '1990-01-01';
  
  const validDateInput = document.getElementById('idCardValid');
  if (validDateInput) {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 10);
    validDateInput.value = futureDate.toISOString().split('T')[0];
  }
  
  showToast('ðŸ—‘ï¸ Form temizlendi', 'info');
}

// Kimlik yÃ¼zÃ¼nÃ¼ indir
function downloadIdCard(side) {
  const iframe = document.getElementById(side === 'front' ? 'idCardFront' : 'idCardBack');
  if (!iframe) return;
  
  // iframe iÃ§eriÄŸini yeni pencerede aÃ§ ve yazdÄ±rma diyaloÄŸunu aÃ§
  const printWindow = window.open('', '_blank');
  printWindow.document.write(iframe.srcdoc);
  printWindow.document.close();
  
  // YazdÄ±rma diyaloÄŸunu aÃ§ (PDF olarak kaydetmek iÃ§in)
  setTimeout(() => {
    printWindow.print();
  }, 500);
  
  showToast(`ðŸ“¥ ${side === 'front' ? 'Ã–n' : 'Arka'} yÃ¼z indirme penceresi aÃ§Ä±ldÄ±`, 'success');
}

// ðŸ“± GSM Arama SonuÃ§larÄ± GÃ¶rÃ¼nÃ¼mÃ¼
function createGSMResultsView(data) {
  const container = document.createElement('div');
  container.className = 'gsm-results';
  
  const demoBadge = data.demo_mode ? '<span style="background:#FAA61A;color:#000;padding:4px 8px;border-radius:4px;font-size:12px;margin-left:10px;">DEMO MOD</span>' : '';
  
  let html = `
    <div style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);border:1px solid #5865F2;border-radius:12px;padding:20px;margin-bottom:20px;">
      <h3 style="color:#5865F2;margin-bottom:15px;display:flex;align-items:center;gap:10px;">
        ðŸ“± 145M GSM VeritabanÄ± ${demoBadge}
      </h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:15px;margin-bottom:20px;">
        <div style="background:rgba(0,0,0,0.3);padding:15px;border-radius:8px;text-align:center;">
          <div style="font-size:24px;font-weight:bold;color:#3BA55D;">${data.total || 0}</div>
          <div style="font-size:12px;color:#b9bbbe;">Toplam SonuÃ§</div>
        </div>
        <div style="background:rgba(0,0,0,0.3);padding:15px;border-radius:8px;text-align:center;">
          <div style="font-size:24px;font-weight:bold;color:#5865F2;">${data.returned || 0}</div>
          <div style="font-size:12px;color:#b9bbbe;">GÃ¶sterilen</div>
        </div>
        <div style="background:rgba(0,0,0,0.3);padding:15px;border-radius:8px;text-align:center;">
          <div style="font-size:24px;font-weight:bold;color:#FAA61A;">${(data.database_size || 0).toLocaleString()}</div>
          <div style="font-size:12px;color:#b9bbbe;">VeritabanÄ±</div>
        </div>
        <div style="background:rgba(0,0,0,0.3);padding:15px;border-radius:8px;text-align:center;">
          <div style="font-size:24px;font-weight:bold;color:#ED4245;">${data.search_time_ms || 0}ms</div>
          <div style="font-size:12px;color:#b9bbbe;">Arama SÃ¼resi</div>
        </div>
      </div>
  `;
  
  if (data.results?.length > 0) {
    html += `
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:rgba(88,101,242,0.2);">
              <th style="padding:12px;text-align:left;color:#5865F2;font-size:13px;border-bottom:2px solid #5865F2;">ðŸ“± Telefon</th>
              <th style="padding:12px;text-align:left;color:#5865F2;font-size:13px;border-bottom:2px solid #5865F2;">ðŸ‘¤ Ä°sim</th>
              <th style="padding:12px;text-align:left;color:#5865F2;font-size:13px;border-bottom:2px solid #5865F2;">ðŸ“ Åžehir</th>
              <th style="padding:12px;text-align:left;color:#5865F2;font-size:13px;border-bottom:2px solid #5865F2;">ðŸ“¡ OperatÃ¶r</th>
              <th style="padding:12px;text-align:center;color:#5865F2;font-size:13px;border-bottom:2px solid #5865F2;">ðŸ“‹ Kopyala</th>
            </tr>
          </thead>
          <tbody>
    `;
    
    data.results.forEach((r, i) => {
      const bg = i % 2 === 0 ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.1)';
      html += `
        <tr style="background:${bg};transition:background 0.2s;" onmouseover="this.style.background='rgba(88,101,242,0.2)'" onmouseout="this.style.background='${bg}'">
          <td style="padding:12px;border-bottom:1px solid rgba(255,255,255,0.1);">
            <span style="font-family:monospace;font-size:15px;color:#fff;">${r.phone}</span>
          </td>
          <td style="padding:12px;border-bottom:1px solid rgba(255,255,255,0.1);color:#b9bbbe;">${r.name || '-'}</td>
          <td style="padding:12px;border-bottom:1px solid rgba(255,255,255,0.1);color:#b9bbbe;">${r.city || '-'}</td>
          <td style="padding:12px;border-bottom:1px solid rgba(255,255,255,0.1);">
            <span style="background:rgba(59,165,93,0.2);color:#3BA55D;padding:4px 8px;border-radius:4px;font-size:12px;">${r.operator || '-'}</span>
          </td>
          <td style="padding:12px;border-bottom:1px solid rgba(255,255,255,0.1);text-align:center;">
            <button onclick="copyVal('${r.phone}')" style="background:#5865F2;color:#fff;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:12px;">ðŸ“‹</button>
          </td>
        </tr>
      `;
    });
    
    html += `
          </tbody>
        </table>
      </div>
    `;
  } else {
    html += `
      <div style="text-align:center;padding:40px;color:#b9bbbe;">
        <div style="font-size:48px;margin-bottom:10px;">ðŸ“±</div>
        <div>SonuÃ§ bulunamadÄ±.</div>
      </div>
    `;
  }
  
  if (data.demo_mode) {
    html += `
      <div style="background:rgba(250,166,26,0.1);border:1px solid #FAA61A;border-radius:8px;padding:15px;margin-top:20px;">
        <div style="color:#FAA61A;font-size:13px;">
          <strong>âš ï¸ Demo Mod:</strong> GerÃ§ek 145M GSM veritabanÄ± yÃ¼klenmemiÅŸ. Åžu anda demo verileri gÃ¶steriliyor.
          VeritabanÄ±nÄ± yÃ¼klemek iÃ§in <code>145m_gsm.json</code> dosyasÄ±nÄ± <code>/data</code> klasÃ¶rÃ¼ne yÃ¼kleyin.
        </div>
      </div>
    `;
  }
  
  html += '</div>';
  
  container.innerHTML = html;
  return container;
}
// ðŸŽ­ ÃœYE BÄ°LGÄ° MODAL - Email/IP gÃ¶ster
function showMemberInfo(event, memberData) {
  event.stopPropagation();
  
  // Modal varsa kapat
  var existingModal = document.getElementById("memberInfoModal");
  if (existingModal) existingModal.remove();
  
  // Modal oluÅŸtur
  var modal = document.createElement("div");
  modal.id = "memberInfoModal";
  modal.className = "member-info-modal";
  modal.innerHTML = `
    <div class="member-modal-backdrop" onclick="this.parentElement.remove()"></div>
    <div class="member-modal-content">
      <div class="member-modal-header">
        <div class="member-modal-avatar">
          <img src="${memberData.avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png'}" 
               onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'" 
               alt="${memberData.username}">
        </div>
        <div class="member-modal-info">
          <h3>${escapeHtml(memberData.username)}</h3>
          <span class="member-modal-id">ID: ${memberData.discord_id}</span>
        </div>
        <button type="button" class="member-modal-close" onclick="document.getElementById('memberInfoModal').remove()">Kapat</button>
      </div>
      
      <div class="member-modal-body">
        <div class="info-card">
          <div class="info-card-icon">ðŸ“§</div>
          <div class="info-card-content">
            <div class="info-card-label">Email</div>
            <div class="info-card-value">
              ${memberData.email ? `
                <span class="mono">${escapeHtml(memberData.email)}</span>
                <button class="copy-btn-small" onclick="navigator.clipboard.writeText('${memberData.email}'); showToast('Email kopyalandÄ±', 'success')">ðŸ“‹</button>
              ` : '<span class="info-empty">Bilgi yok</span>'}
            </div>
          </div>
        </div>
        
        <div class="info-card">
          <div class="info-card-icon">ðŸŒ</div>
          <div class="info-card-content">
            <div class="info-card-label">IP Adresi</div>
            <div class="info-card-value">
              ${memberData.ip ? `
                <span class="mono">${escapeHtml(memberData.ip)}</span>
                <button class="copy-btn-small" onclick="navigator.clipboard.writeText('${memberData.ip}'); showToast('IP kopyalandÄ±', 'success')">ðŸ“‹</button>
              ` : '<span class="info-empty">Bilgi yok</span>'}
            </div>
          </div>
        </div>
        
        <div class="info-card">
          <div class="info-card-icon">ðŸ”—</div>
          <div class="info-card-content">
            <div class="info-card-label">Discord</div>
            <div class="info-card-value">
              <a href="https://discord.com/users/${memberData.discord_id}" target="_blank" rel="noopener" class="discord-link">
                Discord'da gör
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Animasyon
  setTimeout(function() {
    modal.classList.add("show");
  }, 10);
}
