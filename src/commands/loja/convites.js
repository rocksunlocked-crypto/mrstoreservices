const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db, Usuarios } = require('../../database/database');
const { COIN_EMOJI } = require('../../systems/coins');
const config = require('../../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('convites')
    .setDescription('🔗 Ver suas estatísticas de convites e coins ganhos'),
  cooldown: 10,
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    Usuarios.garantir(interaction.user.id, interaction.user.username);

    const stats = db.prepare(`
      SELECT COUNT(*) as total, COALESCE(SUM(coins_ganhos),0) as total_coins
      FROM convites WHERE convidador_id=?
    `).get(interaction.user.id);

    const recentes = db.prepare(`
      SELECT c.*, u.nome as convidado_nome
      FROM convites c LEFT JOIN usuarios u ON c.convidado_id=u.discord_id
      WHERE c.convidador_id=? ORDER BY c.criado_em DESC LIMIT 5
    `).all(interaction.user.id);

    // Ranking global
    const ranking = db.prepare(`
      SELECT convidador_id, COUNT(*) as total, u.nome
      FROM convites c LEFT JOIN usuarios u ON c.convidador_id=u.discord_id
      GROUP BY convidador_id ORDER BY total DESC LIMIT 5
    `).all();

    const minhaPosicao = ranking.findIndex(r => r.convidador_id === interaction.user.id) + 1;

    const embed = new EmbedBuilder()
      .setColor(config.colors.gold)
      .setTitle('🔗 Programa de Convites')
      .setDescription([
        `> Convide amigos e ganhe **${COIN_EMOJI} ${5} coins** por cada um que entrar!`,
        '',
        `**Suas estatísticas:**`,
        `🔗 Convites realizados: **${stats.total}**`,
        `${COIN_EMOJI} Total ganho: **${stats.total_coins.toLocaleString('pt-BR')} coins** (R$ ${(stats.total_coins * 0.01).toFixed(2)})`,
        minhaPosicao > 0 ? `🏆 Sua posição: **#${minhaPosicao}** no ranking` : '',
      ].filter(Boolean).join('\n'))
      .setTimestamp()
      .setFooter({ text: 'Máximo Store • Programa de Convites' });

    if (recentes.length) {
      embed.addFields({
        name: '📋 Últimos Convidados',
        value: recentes.map(c => `• ${c.convidado_nome || c.convidado_id} — +${c.coins_ganhos}${COIN_EMOJI}`).join('\n'),
        inline: false,
      });
    }

    if (ranking.length) {
      const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
      embed.addFields({
        name: '🏆 Top Convidadores',
        value: ranking.map((r, i) => `${medals[i]} **${r.nome || r.convidador_id}** — ${r.total} convite(s)`).join('\n'),
        inline: false,
      });
    }

    return interaction.editReply({ embeds: [embed] });
  },
};
