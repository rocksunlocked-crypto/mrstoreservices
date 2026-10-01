const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db, Usuarios } = require('../../database/database');
const config = require('../../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ranking')
    .setDescription('🏆 Ver ranking de compradores e afiliados')
    .addStringOption(o =>
      o.setName('tipo')
       .setDescription('Tipo de ranking')
       .addChoices(
         { name: '💰 Maiores Compradores', value: 'gasto' },
         { name: '🛒 Mais Compras', value: 'compras' },
         { name: '⭐ Mais Pontos', value: 'pontos' },
         { name: '🤝 Afiliados Top', value: 'afiliados' },
       ).setRequired(false)
    ),
  cooldown: 10,
  async execute(interaction) {
    await interaction.deferReply();
    const tipo = interaction.options.getString('tipo') || 'gasto';

    // IDs a excluir do ranking (owner)
    const ownerIds = [];
    if (process.env.OWNER_DISCORD_ID) ownerIds.push(process.env.OWNER_DISCORD_ID);
    try {
      const cargoOwner = interaction.guild?.roles.cache.get(config.roles?.owner);
      if (cargoOwner) cargoOwner.members.forEach(m => ownerIds.push(m.id));
    } catch {}
    const excluirClause = ownerIds.length
      ? `AND discord_id NOT IN (${ownerIds.map(() => '?').join(',')})` : '';

    let usuarios, titulo, campo;
    if (tipo === 'gasto') {
      usuarios = db.prepare(`SELECT * FROM usuarios WHERE 1=1 ${excluirClause} ORDER BY total_gasto DESC LIMIT 10`).all(...ownerIds);
      titulo = '💰 Top 10 — Maiores Compradores';
      campo = u => `R$ ${(u.total_gasto || 0).toFixed(2)} gastos`;
    } else if (tipo === 'compras') {
      usuarios = db.prepare(`SELECT * FROM usuarios WHERE 1=1 ${excluirClause} ORDER BY total_compras DESC LIMIT 10`).all(...ownerIds);
      titulo = '🛒 Top 10 — Mais Compras';
      campo = u => `${u.total_compras || 0} compras realizadas`;
    } else if (tipo === 'pontos') {
      usuarios = db.prepare(`SELECT * FROM usuarios WHERE 1=1 ${excluirClause} ORDER BY pontos DESC LIMIT 10`).all(...ownerIds);
      titulo = '⭐ Top 10 — Pontos de Fidelidade';
      campo = u => `${u.pontos || 0} pontos — Nível ${u.nivel || 'Bronze'}`;
    } else {
      usuarios = db.prepare(`
        SELECT u.*, COUNT(i.discord_id) as total_indicados,
        COALESCE(SUM(CASE WHEN p.status IN ('pago','entregue') THEN p.comissao_afil ELSE 0 END), 0) as total_ganho
        FROM usuarios u
        LEFT JOIN usuarios i ON i.afiliado_de = u.discord_id
        LEFT JOIN pedidos p ON p.afiliado_id = u.discord_id
        WHERE 1=1 ${excluirClause ? excluirClause.replace(/discord_id/g, 'u.discord_id') : ''}
        GROUP BY u.discord_id
        ORDER BY total_ganho DESC
        LIMIT 10
      `).all(...ownerIds);
      titulo = '🤝 Top 10 — Afiliados';
      campo = u => `${u.total_indicados || 0} indicados • R$ ${(u.total_ganho || 0).toFixed(2)} em comissões`;
    }

    const medalhas = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    const nivelEmoji = n => config.fidelidade.niveis.find(x => x.nome === n)?.emoji || '🥉';

    const embed = new EmbedBuilder()
      .setColor(config.colors.gold)
      .setTitle(`🏆 ${titulo}`)
      .setTimestamp()
      .setFooter({ text: 'Máximo Store • Ranking Atualizado' });

    if (!usuarios.length) {
      embed.setDescription('Nenhum dado disponível ainda.');
    } else {
      const linhas = usuarios.map((u, i) =>
        `${medalhas[i]} **${u.nome || 'Desconhecido'}** ${nivelEmoji(u.nivel)} — ${campo(u)}`
      );
      embed.setDescription(linhas.join('\n'));
    }

    // Posição do usuário
    const propria = Usuarios.get(interaction.user.id);
    if (propria) {
      let pos = 0;
      if (tipo === 'gasto') {
        pos = db.prepare('SELECT COUNT(*) as c FROM usuarios WHERE total_gasto > ?').get(propria.total_gasto || 0).c + 1;
      } else if (tipo === 'pontos') {
        pos = db.prepare('SELECT COUNT(*) as c FROM usuarios WHERE pontos > ?').get(propria.pontos || 0).c + 1;
      }
      if (pos > 0) embed.addFields({ name: '📍 Sua posição', value: `#${pos}`, inline: true });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
