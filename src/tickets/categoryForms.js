const {
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
  EmbedBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const config = require('../config');

// ── Modais personalizados por categoria ──────────────────────

function getModalForCategory(category) {
  const modal = new ModalBuilder()
    .setCustomId(`modal_open_ticket_${category}`)
    .setTitle(getTitleForCategory(category));

  switch (category) {
    case 'denuncia':
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('ticket_subject')
            .setLabel('Usuário denunciado (nome ou ID)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ex: NomeDoUsuario#0000 ou 123456789')
            .setRequired(true).setMinLength(2).setMaxLength(100)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('denuncia_motivo')
            .setLabel('Motivo da denúncia')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ex: Uso de hack, spam, comportamento tóxico...')
            .setRequired(true).setMinLength(5).setMaxLength(100)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('denuncia_descricao')
            .setLabel('Descrição detalhada')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Descreva o ocorrido com o máximo de detalhes...')
            .setRequired(true).setMinLength(20).setMaxLength(1000)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('denuncia_provas')
            .setLabel('Provas (links de imagem/vídeo)')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Cole aqui os links das provas (prints, vídeos)...')
            .setRequired(false).setMaxLength(500)
        ),
      );
      break;

    case 'suporte':
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('ticket_subject')
            .setLabel('Assunto — resumo do problema')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ex: Não consigo acessar meu cargo VIP...')
            .setRequired(true).setMinLength(5).setMaxLength(100)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('suporte_descricao')
            .setLabel('Descreva seu problema em detalhes')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Explique o que aconteceu, quando começou, o que já tentou...')
            .setRequired(true).setMinLength(20).setMaxLength(1000)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('suporte_tentativas')
            .setLabel('O que você já tentou fazer?')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Ex: Tentei reiniciar, verificar permissões...')
            .setRequired(false).setMaxLength(500)
        ),
      );
      break;

    case 'parceria':
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('ticket_subject')
            .setLabel('Nome do servidor / projeto')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Nome oficial do seu servidor ou projeto')
            .setRequired(true).setMinLength(2).setMaxLength(100)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('parceria_membros')
            .setLabel('Quantidade de membros')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ex: 500 membros')
            .setRequired(true).setMaxLength(30)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('parceria_descricao')
            .setLabel('Sobre o servidor / proposta')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Descreva seu servidor, tema, o que oferece na parceria...')
            .setRequired(true).setMinLength(20).setMaxLength(1000)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('parceria_link')
            .setLabel('Link de convite do servidor')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('discord.gg/...')
            .setRequired(false).setMaxLength(100)
        ),
      );
      break;

    default:
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('ticket_subject')
            .setLabel('Assunto')
            .setStyle(TextInputStyle.Short)
            .setRequired(true).setMinLength(5).setMaxLength(100)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('suporte_descricao')
            .setLabel('Descrição')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true).setMinLength(10).setMaxLength(1000)
        ),
      );
  }

  return modal;
}

function getTitleForCategory(category) {
  const titles = {
    denuncia: '🚨 Abrir Denúncia',
    suporte:  '🛠️ Abrir Ticket de Suporte',
    parceria: '🤝 Proposta de Parceria',
  };
  return titles[category] || 'Abrir Ticket';
}

// ── Extrai dados do modal por categoria ──────────────────────

function extractModalData(interaction, category) {
  const subject = interaction.fields.getTextInputValue('ticket_subject');
  let extraFields = [];
  let description = '';

  switch (category) {
    case 'denuncia':
      description = interaction.fields.getTextInputValue('denuncia_descricao');
      const motivo = interaction.fields.getTextInputValue('denuncia_motivo');
      const provas = interaction.fields.getTextInputValue('denuncia_provas') || 'Não informado';
      extraFields = [
        { name: '🎯 Denunciado', value: subject, inline: true },
        { name: '⚠️ Motivo', value: motivo, inline: true },
        { name: '📋 Descrição', value: description },
        { name: '🔗 Provas', value: provas },
      ];
      break;

    case 'suporte':
      description = interaction.fields.getTextInputValue('suporte_descricao');
      const tentativas = interaction.fields.getTextInputValue('suporte_tentativas') || 'Não informado';
      extraFields = [
        { name: '❓ Problema', value: subject, inline: true },
        { name: '📋 Descrição', value: description },
        { name: '🔄 Tentativas', value: tentativas },
      ];
      break;

    case 'parceria':
      description = interaction.fields.getTextInputValue('parceria_descricao');
      const membros = interaction.fields.getTextInputValue('parceria_membros');
      const link = interaction.fields.getTextInputValue('parceria_link') || 'Não informado';
      extraFields = [
        { name: '🏠 Servidor', value: subject, inline: true },
        { name: '👥 Membros', value: membros, inline: true },
        { name: '📋 Sobre', value: description },
        { name: '🔗 Convite', value: link },
      ];
      break;

    default:
      description = interaction.fields.getTextInputValue('suporte_descricao') || subject;
      extraFields = [{ name: '📋 Descrição', value: description }];
  }

  return { subject, extraFields, description };
}

// ── Embed de boas-vindas por categoria ───────────────────────

function buildWelcomeEmbed(ticket, user, extraFields) {
  const { getCategoryName } = require('../utils/ticketHelpers');
  const catColor = config.colors[ticket.category] || config.colors.primary;

  const categoryBanners = {
    denuncia: {
      header: '🚨 **DENÚNCIA REGISTRADA**',
      desc: `Sua denúncia foi recebida e será analisada pela nossa equipe de moderação.\n\n> 📎 Por favor, envie screenshots e qualquer prova adicional neste canal.\n> ⏱️ Tempo médio de resposta: **até 24 horas**`,
      footer: '🔒 Todas as informações são tratadas com sigilo',
    },
    suporte: {
      header: '🛠️ **TICKET DE SUPORTE ABERTO**',
      desc: `Seja bem-vindo ao suporte! Nossa equipe está pronta para te ajudar.\n\n> 📋 Aguarde um atendente assumir seu ticket.\n> 💡 Enquanto espera, envie prints ou informações adicionais.\n> ⏱️ Tempo médio de resposta: **até 12 horas**`,
      footer: '💙 Estamos aqui para ajudar!',
    },
    parceria: {
      header: '🤝 **PROPOSTA DE PARCERIA RECEBIDA**',
      desc: `Obrigado pelo interesse em fazer parceria conosco!\n\n> 📊 Nossa equipe irá analisar sua proposta com cuidado.\n> 📞 Em breve um responsável entrará em contato.\n> ⏱️ Tempo médio de resposta: **até 48 horas**`,
      footer: '🌟 Crescendo juntos!',
    },
  };

  const banner = categoryBanners[ticket.category] || categoryBanners.suporte;

  const embed = new EmbedBuilder()
    .setTitle(`${config.emojis.ticket}  ${ticket.ticket_id}`)
    .setColor(catColor)
    .setDescription(`${banner.header}\n\n${banner.desc}`)
    .setThumbnail(user.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: 'DETALHES DO ATENDIMENTO', value: 'As informações abaixo ajudam a equipe a entender e resolver sua solicitação.', inline: false },
      { name: '👤 Usuário', value: `${user} (${user.tag})`, inline: true },
      { name: '🎫 ID', value: `\`${ticket.ticket_id}\``, inline: true },
      { name: '📅 Aberto em', value: `<t:${Math.floor(Date.now()/1000)}:f>`, inline: true },
      { name: 'DADOS ENVIADOS', value: 'Confira os dados preenchidos no formulário.', inline: false },
      ...extraFields,
    )
    .setFooter({ text: banner.footer })
    .setTimestamp();

  return embed;
}

// ── Botões do painel fixado ───────────────────────────────────

function buildTicketButtons(ticketId, isStaffOnly = false) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket_claim_${ticketId}`).setLabel('Assumir').setEmoji('✋').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`ticket_close_${ticketId}`).setLabel('Fechar').setEmoji('🔒').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`ticket_priority_${ticketId}`).setLabel('Prioridade').setEmoji('🎯').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ticket_tags_${ticketId}`).setLabel('Tags').setEmoji('🏷️').setStyle(ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket_addnote_${ticketId}`).setLabel('Nota Interna').setEmoji('📝').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ticket_transfer_${ticketId}`).setLabel('Transferir').setEmoji('↔️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ticket_transcript_${ticketId}`).setLabel('Transcript').setEmoji('💾').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ticket_rename_${ticketId}`).setLabel('Renomear').setEmoji('✏️').setStyle(ButtonStyle.Secondary),
  );

  return [row1, row2];
}

module.exports = {
  getModalForCategory,
  extractModalData,
  buildWelcomeEmbed,
  buildTicketButtons,
};
