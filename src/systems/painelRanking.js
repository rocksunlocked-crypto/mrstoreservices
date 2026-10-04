/**
 * Painel de Ranking Fixo
 * Atualiza a cada 2 segundos no canal configurado
 */

const { EmbedBuilder } = require('discord.js');
const { db } = require('../database/database');
const config = require('../config');

const CANAL_RANKING = '1544885444578254919'; // Canal fixo do ranking
let mensagemRanking = null;
let intervalId = null;

/**
 * Gerar embed do ranking TOP 10
 */
function gerarEmbedRanking() {
  // IDs a excluir (owner)
  const ownerIds = [];
  if (process.env.OWNER_DISCORD_ID) ownerIds.push(process.env.OWNER_DISCORD_ID);
  
  const excluirClause = ownerIds.length
    ? `AND discord_id NOT IN (${ownerIds.map(() => '?').join(',')})` : '';

  const usuarios = db.prepare(`
    SELECT * FROM usuarios 
    WHERE 1=1 ${excluirClause} 
    ORDER BY total_gasto DESC 
    LIMIT 10
  `).all(...ownerIds);

  const medalhas = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
  
  const embed = new EmbedBuilder()
    .setColor(0xFFD700) // Dourado
    .setTitle('👑 TOP 10 — Clientes VIP')
    .setThumbnail('https://i.imgur.com/AfFp7pu.png') // Logo da loja (opcional)
    .setTimestamp()
    .setFooter({ text: 'Máximo Store • Ranking de Clientes' });

  if (!usuarios.length) {
    embed.setDescription('```ansi\n\x1b[33m⭐ Nenhum cliente ainda.\n\x1b[0mSeja o primeiro a comprar!\n```');
  } else {
    const nivelEmoji = n => {
      const niveis = {
        'Diamante': '💎',
        'Ouro': '🥇',
        'Prata': '🥈',
        'Bronze': '🥉',
      };
      return niveis[n] || '⭐';
    };

    const linhas = usuarios.map((u, i) => {
      const emoji = nivelEmoji(u.nivel || 'Bronze');
      const nivel = u.nivel || 'Bronze';
      
      return `${medalhas[i]} <@${u.discord_id}> ${emoji} **${nivel}**`;
    });
    
    embed.setDescription(
      `*Os maiores contribuidores da loja*\n` +
      `*Atualizado em tempo real*\n\n` +
      linhas.join('\n') +
      `\n\n✨ *Continue comprando para subir no ranking!*`
    );
  }

  return embed;
}

/**
 * Iniciar painel de ranking
 */
async function iniciarPainelRanking(client) {
  try {
    const guild = client.guilds.cache.first();
    if (!guild) return;

    const canal = guild.channels.cache.get(CANAL_RANKING)
      || await client.channels.fetch(CANAL_RANKING).catch(() => null);
    
    if (!canal) {
      console.error('[Ranking] Canal não encontrado:', CANAL_RANKING);
      return;
    }

    // Buscar mensagem existente ou criar nova
    const msgs = await canal.messages.fetch({ limit: 10 }).catch(() => null);
    if (msgs) {
      mensagemRanking = msgs.find(m => 
        m.author.id === client.user.id && 
        m.embeds[0]?.title?.includes('TOP 10')
      );
    }

    if (!mensagemRanking) {
      // Criar nova mensagem
      mensagemRanking = await canal.send({ embeds: [gerarEmbedRanking()] });
      console.log('[Ranking] ✅ Painel criado:', mensagemRanking.id);
    } else {
      // Atualizar mensagem existente
      await mensagemRanking.edit({ embeds: [gerarEmbedRanking()] });
      console.log('[Ranking] ✅ Painel encontrado e atualizado:', mensagemRanking.id);
    }

    // Limpar interval anterior se existir
    if (intervalId) clearInterval(intervalId);

    // Atualizar a cada 2 segundos
    intervalId = setInterval(async () => {
      try {
        if (!mensagemRanking) return;
        await mensagemRanking.edit({ embeds: [gerarEmbedRanking()] });
      } catch (e) {
        console.error('[Ranking] Erro ao atualizar:', e.message);
        // Se a mensagem foi deletada, tentar recriar
        if (e.code === 10008) {
          mensagemRanking = null;
          iniciarPainelRanking(client);
        }
      }
    }, 2000); // 2 segundos

    console.log('[Ranking] 🔄 Atualização automática iniciada (2s)');

  } catch (error) {
    console.error('[Ranking] Erro ao iniciar:', error.message);
  }
}

/**
 * Parar painel de ranking
 */
function pararPainelRanking() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[Ranking] ⏸️  Atualização automática parada');
  }
}

module.exports = {
  iniciarPainelRanking,
  pararPainelRanking,
  gerarEmbedRanking,
};
