const { SlashCommandBuilder } = require('discord.js');
const { comandoEmailTemp } = require('../../systems/tempMail');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('email-temp')
    .setDescription('🌐 Gerar um email temporário para uso pessoal')
    .addSubcommand(sub =>
      sub
        .setName('criar')
        .setDescription('📧 Criar um novo email temporário')
    )
    .addSubcommand(sub =>
      sub
        .setName('premium')
        .setDescription('⭐ Criar um email temporário premium (maior duração)')
    )
    .addSubcommand(sub =>
      sub
        .setName('meus')
        .setDescription('📬 Ver seus emails temporários ativos')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'criar' || sub === 'premium') {
      return comandoEmailTemp(interaction, sub === 'premium');
    }

    if (sub === 'meus') {
      const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
      const { db } = require('../../database/database');

      await interaction.deferReply({ ephemeral: true });

      const emails = db.prepare(`
        SELECT * FROM emails_temporarios 
        WHERE usuario_id=? AND deletado=0 AND expira_em > strftime('%s','now')
        ORDER BY criado_em DESC
      `).all(interaction.user.id);

      if (!emails.length) {
        return interaction.editReply({
          content: '📭 Você não tem emails temporários ativos.\n\nUse `/email-temp criar` para gerar um novo!'
        });
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`📬 Seus Emails Temporários (${emails.length})`)
        .setDescription('> Clique nos botões abaixo para gerenciar cada email.')
        .setTimestamp()
        .setFooter({ text: 'Máximo Store • Email Temporário' });

      for (const email of emails) {
        const expira = `<t:${email.expira_em}:R>`;
        embed.addFields({
          name: `📧 ${email.email}`,
          value: `⏰ Expira: ${expira} • 🆔 \`${email.id.slice(0, 8)}\``,
          inline: false
        });
      }

      const rows = [];
      for (let i = 0; i < Math.min(emails.length, 5); i++) {
        const e = emails[i];
        rows.push(new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`tempmail_refresh_${e.username}_${e.domain}`)
            .setLabel(`📬 ${e.email.slice(0, 30)}`)
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`tempmail_delete_${e.username}_${e.domain}`)
            .setLabel('🗑️')
            .setStyle(ButtonStyle.Danger)
        ));
      }

      return interaction.editReply({ embeds: [embed], components: rows });
    }
  }
};
