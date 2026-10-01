const { SlashCommandBuilder } = require('discord.js');
const { openTicket } = require('../../tickets/ticketManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('abrir')
    .setDescription('Abre um ticket diretamente via comando')
    .addStringOption(o =>
      o.setName('categoria')
        .setDescription('Categoria do ticket')
        .setRequired(true)
        .addChoices(
          { name: '🚨 Denúncia', value: 'denuncia' },
          { name: '🛠️ Suporte', value: 'suporte' },
          { name: '🤝 Parceria', value: 'parceria' },
        )
    )
    .addStringOption(o => o.setName('assunto').setDescription('Assunto do ticket').setRequired(false)),

  async execute(interaction) {
    const categoria = interaction.options.getString('categoria');
    const assunto = interaction.options.getString('assunto') || 'Sem assunto';
    await openTicket(interaction, categoria, assunto);
  },
};
