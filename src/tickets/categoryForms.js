/**
 * categoryForms.js — Formulários e botões do sistema de tickets avançado
 *
 * Layout do painel fixado:
 *   [👤 Menu Usuário]  [⚙️ Menu Admin]  [❌ Fechar Ticket]
 *
 * Menu Usuário (ephemeral):
 *   [📞 Chamar Staff]  [📋 Ver Meu Ticket]  [📄 Transcript]
 *
 * Menu Admin (ephemeral, só staff):
 *   [✋ Assumir]  [🎯 Prioridade]  [🏷️ Tags]
 *   [📝 Nota]    [↔️ Transferir]   [✏️ Renomear]
 *   [💸 Gerar PIX/QR]
 */

const {
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const config = require('../config');

// ────────────────────────────────────────────────────────────────────────────
// MODAIS DE ABERTURA
// ────────────────────────────────────────────────────────────────────────────

function getModalForCategory(category) {
  const modal = new ModalBuilder()
    .setCustomId(`modal_open_ticket_${category}`)
    .setTitle(getTitleForCategory(category));

  switch (category) {
    case 'denuncia':
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('ticket_subject')
            .setLabel('Usuário denunciado (nome ou ID)').setStyle(TextInputStyle.Short)
            .setPlaceholder('Ex: NomeDoUsuario#0000 ou 123456789').setRequired(true).setMinLength(2).setMaxLength(100),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('denuncia_motivo')
            .setLabel('Motivo da denúncia').setStyle(TextInputStyle.Short)
            .setPlaceholder('Ex: Uso de hack, spam, comportamento tóxico...').setRequired(true).setMinLength(5).setMaxLength(100),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('denuncia_descricao')
            .setLabel('Descrição detalhada').setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Descreva o ocorrido com o máximo de detalhes...').setRequired(true).setMinLength(20).setMaxLength(1000),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('denuncia_provas')
            .setLabel('Provas (links de imagem/vídeo)').setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Cole aqui os links das provas (prints, vídeos)...').setRequired(false).setMaxLength(500),
        ),
      );
      break;

    case 'suporte':
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('ticket_subject')
            .setLabel('Assunto — resumo do problema').setStyle(TextInputStyle.Short)
            .setPlaceholder('Ex: Não consigo acessar meu cargo VIP...').setRequired(true).setMinLength(5).setMaxLength(100),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('suporte_descricao')
            .setLabel('Descreva seu problema em detalhes').setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Explique o que aconteceu, quando começou, o que já tentou...').setRequired(true).setMinLength(20).setMaxLength(1000),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('suporte_tentativas')
            .setLabel('O que você já tentou fazer?').setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Ex: Tentei reiniciar, verificar permissões...').setRequired(false).setMaxLength(500),
        ),
      );
      break;

    case 'parceria':
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('ticket_subject')
            .setLabel('Nome do servidor / projeto').setStyle(TextInputStyle.Short)
            .setPlaceholder('Nome oficial do seu servidor ou projeto').setRequired(true).setMinLength(2).setMaxLength(100),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('parceria_membros')
            .setLabel('Quantidade de membros').setStyle(TextInputStyle.Short)
            .setPlaceholder('Ex: 500 membros').setRequired(true).setMaxLength(30),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('parceria_descricao')
            .setLabel('Sobre o servidor / proposta').setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Descreva seu servidor, tema, o que oferece na parceria...').setRequired(true).setMinLength(20).setMaxLength(1000),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('parceria_link')
            .setLabel('Link de convite do servidor').setStyle(TextInputStyle.Short)
            .setPlaceholder('discord.gg/...').setRequired(false).setMaxLength(100),
        ),
      );
      break;

    default:
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('ticket_subject')
            .setLabel('Assunto').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(5).setMaxLength(100),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('suporte_descricao')
            .setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(true).setMinLength(10).setMaxLength(1000),
        ),
      );
  }

  return modal;
}

function getTitleForCategory(category) {
  return { denuncia: '🚨 Abrir Denúncia', suporte: '🛠️ Abrir Ticket de Suporte', parceria: '🤝 Proposta de Parceria' }[category] || 'Abrir Ticket';
}

// ────────────────────────────────────────────────────────────────────────────
// EXTRAÇÃO DOS DADOS DO MODAL
// ────────────────────────────────────────────────────────────────────────────

function extractModalData(interaction, category) {
  const subject = interaction.fields.getTextInputValue('ticket_subject');
  let extraFields = [], description = '';

  switch (category) {
    case 'denuncia':
      description   = interaction.fields.getTextInputValue('denuncia_descricao');
      const motivo  = interaction.fields.getTextInputValue('denuncia_motivo');
      const provas  = interaction.fields.getTextInputValue('denuncia_provas') || 'Não informado';
      extraFields = [
        { name: '🎯 Denunciado', value: subject, inline: true },
        { name: '⚠️ Motivo',     value: motivo,  inline: true },
        { name: '📋 Descrição',  value: description },
        { name: '🔗 Provas',     value: provas },
      ];
      break;
    case 'suporte':
      description       = interaction.fields.getTextInputValue('suporte_descricao');
      const tentativas  = interaction.fields.getTextInputValue('suporte_tentativas') || 'Não informado';
      extraFields = [
        { name: '❓ Problema',   value: subject,     inline: true },
        { name: '📋 Descrição',  value: description },
        { name: '🔄 Tentativas', value: tentativas  },
      ];
      break;
    case 'parceria':
      description   = interaction.fields.getTextInputValue('parceria_descricao');
      const membros = interaction.fields.getTextInputValue('parceria_membros');
      const link    = interaction.fields.getTextInputValue('parceria_link') || 'Não informado';
      extraFields = [
        { name: '🏠 Servidor',  value: subject, inline: true },
        { name: '👥 Membros',   value: membros, inline: true },
        { name: '📋 Sobre',     value: description },
        { name: '🔗 Convite',   value: link },
      ];
      break;
    default:
      description = interaction.fields.getTextInputValue('suporte_descricao') || subject;
      extraFields = [{ name: '📋 Descrição', value: description }];
  }

  return { subject, extraFields, description };
}

// ────────────────────────────────────────────────────────────────────────────
// EMBED DE BOAS-VINDAS
// ────────────────────────────────────────────────────────────────────────────

function buildWelcomeEmbed(ticket, user, extraFields) {
  const { getCategoryName } = require('../utils/ticketHelpers');
  const catColor = config.colors[ticket.category] || config.colors.primary;

  const banners = {
    denuncia: {
      header: '🚨 **DENÚNCIA REGISTRADA**',
      desc:   `Sua denúncia foi recebida e será analisada pela nossa equipe.\n\n> 📎 Envie screenshots e provas adicionais neste canal.\n> ⏱️ Resposta em até **24 horas**`,
      footer: '🔒 Informações tratadas com sigilo',
    },
    suporte: {
      header: '🛠️ **TICKET DE SUPORTE ABERTO**',
      desc:   `Nossa equipe está pronta para te ajudar!\n\n> 📋 Aguarde um atendente assumir seu ticket.\n> 💡 Envie prints ou informações adicionais enquanto espera.\n> ⏱️ Resposta em até **12 horas**`,
      footer: '💙 Estamos aqui para ajudar!',
    },
    parceria: {
      header: '🤝 **PROPOSTA DE PARCERIA RECEBIDA**',
      desc:   `Obrigado pelo interesse!\n\n> 📊 Nossa equipe irá analisar sua proposta.\n> ⏱️ Resposta em até **48 horas**`,
      footer: '🌟 Crescendo juntos!',
    },
  };

  const banner = banners[ticket.category] || banners.suporte;

  return new EmbedBuilder()
    .setTitle(`${config.emojis.ticket}  ${ticket.ticket_id}`)
    .setColor(catColor)
    .setDescription(`${banner.header}\n\n${banner.desc}`)
    .setThumbnail(user.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: 'ℹ️ DETALHES', value: '─', inline: false },
      { name: '👤 Usuário',  value: `${user} (${user.tag})`, inline: true },
      { name: '🎫 ID',       value: `\`${ticket.ticket_id}\``, inline: true },
      { name: '📅 Aberto',   value: `<t:${Math.floor(Date.now()/1000)}:f>`, inline: true },
      { name: '📝 DADOS ENVIADOS', value: '─', inline: false },
      ...extraFields,
    )
    .setFooter({ text: banner.footer })
    .setTimestamp();
}

// ────────────────────────────────────────────────────────────────────────────
// BOTÕES — 3 BOTÕES PRINCIPAIS NO PAINEL FIXADO
// ────────────────────────────────────────────────────────────────────────────

function buildTicketButtons(ticketId) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`tmenu_usuario_${ticketId}`)
      .setLabel('Menu Usuário')
      .setEmoji('👤')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`tmenu_admin_${ticketId}`)
      .setLabel('Menu Admin')
      .setEmoji('⚙️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`ticket_close_${ticketId}`)
      .setLabel('Fechar Ticket')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger),
  );
  return [row];
}

// ────────────────────────────────────────────────────────────────────────────
// SUBMENU USUÁRIO (ephemeral — visível só para quem clicou)
// ────────────────────────────────────────────────────────────────────────────

function buildMenuUsuario(ticketId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`tchamar_staff_${ticketId}`)
      .setLabel('Chamar Staff')
      .setEmoji('📞')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`tver_ticket_${ticketId}`)
      .setLabel('Ver Meu Ticket')
      .setEmoji('📋')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`ticket_transcript_${ticketId}`)
      .setLabel('Transcript')
      .setEmoji('📄')
      .setStyle(ButtonStyle.Secondary),
  );
}

// ────────────────────────────────────────────────────────────────────────────
// SUBMENU ADMIN (ephemeral — só staff vê e usa)
// ────────────────────────────────────────────────────────────────────────────

function buildMenuAdmin(ticketId) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket_claim_${ticketId}`).setLabel('Assumir').setEmoji('✋').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`ticket_priority_${ticketId}`).setLabel('Prioridade').setEmoji('🎯').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ticket_tags_${ticketId}`).setLabel('Tags').setEmoji('🏷️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ticket_addnote_${ticketId}`).setLabel('Nota').setEmoji('📝').setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket_transfer_${ticketId}`).setLabel('Transferir').setEmoji('↔️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ticket_rename_${ticketId}`).setLabel('Renomear').setEmoji('✏️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`tgerar_pix_${ticketId}`).setLabel('Gerar PIX/QR').setEmoji('💸').setStyle(ButtonStyle.Success),
  );
  return [row1, row2];
}

module.exports = {
  getModalForCategory,
  extractModalData,
  buildWelcomeEmbed,
  buildTicketButtons,
  buildMenuUsuario,
  buildMenuAdmin,
};
