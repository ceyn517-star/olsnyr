// GELİŞMİŞ GUILD ve ÜYE VERİ ÇIKARMA - Çalışan versiyon
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

/**
 * SQL dosyalarından guild ve üye verilerini çıkarır
 * /api/guilds endpoint'i ile aynı mantığı kullanır
 */
export async function extractGuildsAndMembersFromSQL(SQL_PATHS, maxFiles = 3) {
  const guildsMap = new Map();
  const memberInfoMap = new Map();
  const MAX_FILE_SCAN_LINES = 50000;
  const MAX_TOTAL_TIME = 5000;
  const startTime = Date.now();

  for (const sqlPath of SQL_PATHS.slice(0, maxFiles)) {
    if (!fs.existsSync(sqlPath)) continue;
    if (Date.now() - startTime > MAX_TOTAL_TIME) {
      console.log('[GuildFix] Zaman limiti aşıldı');
      break;
    }

    try {
      console.log(`[GuildFix] İşleniyor: ${path.basename(sqlPath)}`);
      
      const rs = fs.createReadStream(sqlPath, { encoding: 'utf8' });
      const rl = readline.createInterface({ input: rs, crlfDelay: Infinity });
      let lineCount = 0;

      for await (const line of rl) {
        lineCount++;
        if (lineCount > MAX_FILE_SCAN_LINES) break;
        if (Date.now() - startTime > MAX_TOTAL_TIME) break;
        if (line.length > 10000) continue;

        // User ID çıkar (Discord ID formatında: 17-20 digit)
        const userIdMatch = line.match(/\(\s*(\d{17,20})\s*,/);
        const userId = userIdMatch?.[1];
        
        // Debug: İlk birkaç eşleşmeyi logla
        if (lineCount <= 10 && userIdMatch) {
          console.log(`[GuildFix Debug] Line ${lineCount}: Found userId=${userId}`);
        }
        
        if (!userId || userId.startsWith('7656119')) continue; // Steam ID'leri atla

        // JSON formatında username ve avatar ara
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

        // Guild ID array'lerini bul [123, 456] veya ['123', '456'] formatlarında
        const allArrays = [...line.matchAll(/\[([^\]]+)\]/g)].map(m => m[1]);
        if (!allArrays.length) continue;

        // En uzun array'i al (guild ID'leri içeren)
        let bestIds = [];
        for (const raw of allArrays) {
          const ids = raw.split(',')
            .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
            .filter(s => /^\d{17,20}$/.test(s) && !s.startsWith('7656119'));
          if (ids.length > bestIds.length) bestIds = ids;
        }
        if (!bestIds.length) continue;

        // Her guild ID için kayıt oluştur/güncelle
        for (const gid of bestIds) {
          const existing = guildsMap.get(gid);
          if (existing) {
            existing.member_count++;
            if (existing.sample_member_ids.length < 15 && !existing.sample_member_ids.includes(userId)) {
              existing.sample_member_ids.push(userId);
            }
          } else if (guildsMap.size < 500) {
            guildsMap.set(gid, {
              guild_id: gid,
              id: gid,
              name: null,
              member_count: 1,
              source: 'sql_file',
              sample_member_ids: [userId],
              members: []
            });
          }
        }
      }
      
      rl.close();
    } catch (err) {
      console.error(`[GuildFix] SQL Hata ${sqlPath}:`, err.message);
    }
  }

  // Üye bilgilerini oluştur
  for (const [gid, g] of guildsMap) {
    g.members = (g.sample_member_ids || []).slice(0, 10).map(id => {
      const member = memberInfoMap.get(id) || { id };
      const avatarUrl = member.avatar
        ? `https://cdn.discordapp.com/avatars/${member.id}/${member.avatar}.png?size=64`
        : `https://cdn.discordapp.com/embed/avatars/${parseInt(member.id || '0', 10) % 5}.png`;
      return {
        discord_id: member.id,
        username: member.username || `Üye #${member.id.slice(-4)}`,
        avatar_url: avatarUrl
      };
    });
  }

  console.log(`[GuildFix] Toplam ${guildsMap.size} sunucu, ${memberInfoMap.size} üye bulundu`);
  return { 
    guilds: Array.from(guildsMap.values()), 
    members: Array.from(memberInfoMap.values()) 
  };
}

/**
 * Discord CDN URL'leri oluşturur
 */
export function generateDiscordCDNUrls(guild) {
  const result = { ...guild };
  
  // Guild icon
  if (guild.icon) {
    if (guild.icon.startsWith('http')) {
      result.icon_url = guild.icon;
    } else {
      const ext = guild.icon.startsWith('a_') ? 'gif' : 'png';
      result.icon_url = `https://cdn.discordapp.com/icons/${guild.guild_id}/${guild.icon}.${ext}?size=256`;
    }
  } else {
    const fallbackIndex = guild.guild_id ? (Number(BigInt(guild.guild_id) >> 22n) % 6) : 0;
    result.icon_url = `https://cdn.discordapp.com/embed/avatars/${fallbackIndex}.png`;
  }
  
  // Guild banner
  if (guild.banner) {
    if (guild.banner.startsWith('http')) {
      result.banner_url = guild.banner;
    } else {
      result.banner_url = `https://cdn.discordapp.com/banners/${guild.guild_id}/${guild.banner}.png?size=512`;
    }
  }
  
  // Member avatars
  if (guild.members && guild.members.length > 0) {
    result.members = guild.members.map(m => {
      const member = { ...m };
      if (m.avatar_hash) {
        const ext = m.avatar_hash.startsWith('a_') ? 'gif' : 'png';
        member.avatar_url = `https://cdn.discordapp.com/avatars/${m.discord_id}/${m.avatar_hash}.${ext}?size=64`;
      } else {
        const idx = m.discord_id ? (parseInt(m.discord_id, 10) % 5) : 0;
        member.avatar_url = `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
      }
      return member;
    });
  }
  
  return result;
}

export default {
  extractGuildsAndMembersFromSQL,
  generateDiscordCDNUrls
};
