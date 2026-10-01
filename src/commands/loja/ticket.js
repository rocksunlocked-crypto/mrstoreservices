const { SlashCommandBuilder } = require('discord.js');
const { abrirTicket } = require('../../systems/tickets');
const { Usuarios, Tickets } = require('../../database/database');
const config = require('../../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('🎫 Abrir um ticket de suporte')
    .addStringOption(o =>
      o.setName('tipo')
       .setDescription('Tipo do ticket')
       .setRequired(true)
       .addChoices(
         { name: '🛒 Compra / Pagamento', value: 'compra'    },
         { name: '🆘 Suporte Geral',      value: 'suporte'   },
         { name: '↩️ Reembolso',           value: 'reembolso' },
         { name: '📦 Entrega',             value: 'entrega'   },
         { name: '🤝 Afiliados',           value: 'afiliado'  },
         { name: '⚠️ Reclamação',          value: 'reclamacao'},
       )
    )
    .addStringOption(o => o.setName('assunto').setDescription('Descreva brevemente o assunto').setRequired(false)),
  cooldown: 30,
  async execute(interaction) {
    Usuarios.garantir(interaction.user.id, interaction.user.username);

    const tipo    = interaction.options.getString('tipo');
    const assunto = interaction.options.getString('assunto') || '';

    // Checar limite
    const abertos = Tickets.abertosUsuario(interaction.user.id);
    if (abertos >= config.tickets.maxAbertos) {
      return interaction.reply({
        content: `❌ Você já tem **${abertos}** ticket(s) aberto(s). Feche-os antes de abrir um novo.`,
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const { ok, canal, erro } = await abrirTicket(
      interaction.guild,
      interaction.member,
      tipo,
      { produto: assunto || undefined },
    );

    if (!ok) return interaction.editReply({ content: `❌ ${erro}` });

    await interaction.editReply({
      content: `✅ Ticket aberto! Acesse ${canal} para continuar.`,
    });
  },
};
