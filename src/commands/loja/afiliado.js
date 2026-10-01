const { SlashCommandBuilder } = require('discord.js');
const { painelAfiliado, vincularAfiliado } = require('../../systems/afiliados');
const { Usuarios } = require('../../database/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('afiliado')
    .setDescription('🤝 Sistema de afiliados e indicações')
    .addSubcommand(sub => sub.setName('painel').setDescription('📊 Ver painel de afiliado'))
    .addSubcommand(sub =>
      sub.setName('usar')
         .setDescription('🔑 Usar código de afiliado de alguém')
         .addStringOption(o => o.setName('codigo').setDescription('Código de afiliado').setRequired(true))
    ),
  cooldown: 5,
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    Usuarios.garantir(interaction.user.id, interaction.user.username);

    if (sub === 'painel') return painelAfiliado(interaction);

    if (sub === 'usar') {
      const codigo = interaction.options.getString('codigo');
      const { ok, erro, afiliado } = vincularAfiliado(interaction.user.id, codigo);
      if (!ok) return interaction.reply({ content: `❌ ${erro}`, ephemeral: true });
      await interaction.reply({ content: `✅ Você agora é indicado de **${afiliado.nome}**! Você receberá benefícios exclusivos.`, ephemeral: true });
    }
  },
};
