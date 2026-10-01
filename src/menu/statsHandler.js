const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { carregar: carregarSorteios } = require('./sorteioCore');
const fs   = require('fs');
const path = require('path');

const ARQ_STATS_AVAL = path.join(__dirname, '../data/stats_avaliacoes.json');

function carregarStatsAval() {
  if (!fs.existsSync(ARQ_STATS_AVAL)) return { total: 0, aprovadas: 0, mediaGlobal: 0, porProduto: {} };
  try { return JSON.parse(fs.readFileSync(ARQ_STATS_AVAL, 'utf-8')); } catch { return { total: 0, aprovadas: 0, mediaGlobal: 0, porProduto: {} }; }
}

async function mostrarStats(interaction) {
  await interaction.deferReply({ flags: 64 });

  const guild = interaction.guild;

  // ── Membros ───────────────────────────────────────────────────────────────
  await guild.members.fetch();
  const totalMembros  = guild.memberCount;
  const totalBots     = guild.members.cache.filter(m => m.user.bot).size;
  const totalHumanos  = totalMembros - totalBots;
  const online        = guild.members.cache.filter(m => m.presence?.status === 'online').size;
  const ausentes      = guild.members.cache.filter(m => ['idle','dnd'].includes(m.presence?.status)).size;

  // ── Canais ────────────────────────────────────────────────────────────────
  const canais       = guild.channels.cache;
  const totalCanais  = canais.size;
  const texto        = canais.filter(c => c.type === 0).size;
  const voz          = canais.filter(c => c.type === 2).size;
  const categorias   = canais.filter(c => c.type === 4).size;

  // ── Cargos e emojis ───────────────────────────────────────────────────────
  const totalCargos  = guild.roles.cache.size - 1;
  const totalEmojis  = guild.emojis.cache.size;

  // ── Sorteios ──────────────────────────────────────────────────────────────
  const sorteios     = carregarSorteios();
  const ativos       = Object.values(sorteios).filter(s => !s.encerrado).length;
  const encerrados   = Object.values(sorteios).filter(s => s.encerrado).length;
  const totalPartic  = Object.values(sorteios).reduce((acc, s) => acc + (s.participantes?.length ?? 0), 0);

  // ── Avaliações ────────────────────────────────────────────────────────────
  const statsAval = carregarStatsAval();

  // ── Servidor ──────────────────────────────────────────────────────────────
  const criado       = Math.floor(guild.createdTimestamp / 1000);
  const boosts       = guild.premiumSubscriptionCount ?? 0;
  const nivelBoost   = guild.premiumTier ?? 0;

  const embed = new EmbedBuilder()
    .setTitle(`📊  Estatísticas — ${guild.name}`)
    .setThumbnail(guild.iconURL({ size: 256 }) ?? null)
    .setColor(0x5865F2)
    .addFields(
      // Membros
      { name: '👥 Membros',
        value: `**Total:** ${totalMembros}\n**Humanos:** ${totalHumanos}\n**Bots:** ${totalBots}\n🟢 Online: ${online} · 🟡 Ausentes: ${ausentes}`,
        inline: true },

      // Canais
      { name: '📡 Canais',
        value: `**Total:** ${totalCanais}\n💬 Texto: ${texto}\n🔊 Voz: ${voz}\n📁 Categorias: ${categorias}`,
        inline: true },

      // Servidor
      { name: '🏰 Servidor',
        value: `**Criado:** <t:${criado}:D>\n**Cargos:** ${totalCargos}\n**Emojis:** ${totalEmojis}\n🚀 Boosts: ${boosts} (Nível ${nivelBoost})`,
        inline: true },

      // Sorteios
      { name: '🎉 Sorteios',
        value: `🟢 Ativos: **${ativos}**\n✅ Encerrados: **${encerrados}**\n👥 Total participantes: **${totalPartic}**`,
        inline: true },

      // Avaliações
      { name: '⭐ Avaliações',
        value: `📋 Total: **${statsAval.total}**\n✅ Aprovadas: **${statsAval.aprovadas}**\n⭐ Média global: **${statsAval.mediaGlobal?.toFixed(1) ?? '—'}/5**`,
        inline: true },
    )
    .setFooter({ text: `Consultado por ${interaction.user.username}` })
    .setTimestamp();

  if (guild.bannerURL()) embed.setImage(guild.bannerURL({ size: 1024 }));

  await interaction.editReply({ embeds: [embed] });
}

module.exports = { mostrarStats };
