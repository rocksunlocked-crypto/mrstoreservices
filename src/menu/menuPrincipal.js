const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

async function enviarMenu(interaction, editar = false) {
  const embed = new EmbedBuilder()
    .setTitle('👑  Painel de Controle — Mr. Chefe')
    .setDescription(
      '> Selecione uma função abaixo para executá-la.\n' +
      '> Apenas membros com o cargo autorizado podem usar.'
    )
    .setColor(0x2B2D31)
    .addFields(
      { name: '📢  Anúncio',          value: 'Envia um embed de anúncio num canal.',         inline: true },
      { name: '✏️  Editar Anúncio',   value: 'Edita um anúncio já publicado.',               inline: true },
      { name: '🎉  Sorteio',          value: 'Cria um sorteio com critérios.',               inline: true },
      { name: '🔒  Trancar Canal',    value: 'Impede @everyone de enviar mensagens.',        inline: true },
      { name: '🔓  Abrir Canal',      value: 'Restaura as permissões do canal.',             inline: true },
      { name: '👤  Usuário',          value: 'Puxa todas as informações de um membro.',      inline: true },
      { name: '📊  Estatísticas',     value: 'Exibe dados e métricas do servidor.',           inline: true },
      { name: '🤖  Autorizar Bot',    value: 'Permite que um bot entre no servidor.',        inline: true },
      { name: '🚫  Desautorizar Bot', value: 'Remove um bot da lista de permitidos.',        inline: true },
      { name: '📋  Listar Bots',      value: 'Mostra os bots autorizados.',                  inline: true },
    )
    .setFooter({ text: 'Mr. Chefe • Sistema de controle', iconURL: interaction.client.user.displayAvatarURL() })
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('menu_anuncio')         .setLabel('📢 Anúncio')         .setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('menu_editar_anuncio')  .setLabel('✏️ Editar Anúncio')  .setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('menu_sorteio')         .setLabel('🎉 Sorteio')         .setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('menu_trancar')         .setLabel('🔒 Trancar Canal')   .setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('menu_abrir')           .setLabel('🔓 Abrir Canal')     .setStyle(ButtonStyle.Success),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('menu_usuario')         .setLabel('👤 Usuário')          .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('menu_stats')           .setLabel('📊 Estatísticas')      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('menu_bot_autorizar')   .setLabel('🤖 Autorizar Bot')    .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('menu_bot_desautorizar').setLabel('🚫 Desautorizar Bot') .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('menu_bot_lista')       .setLabel('📋 Listar Bots')      .setStyle(ButtonStyle.Secondary),
  );

  const payload = { embeds: [embed], components: [row1, row2] };

  if (editar) return interaction.update(payload);
  return interaction.reply({ ...payload });
}

module.exports = { enviarMenu };
