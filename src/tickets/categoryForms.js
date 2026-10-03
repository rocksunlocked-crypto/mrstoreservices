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
          new TextInputBuilder().setCustomId('ticket_motivo')
            .setLabel('Motivo da denúncia').setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Explique o motivo da denúncia...').setRequired(true).setMinLength(5).setMaxLength(1000),
        ),
      );
      break;

    case 'suporte':
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('ticket_subject')
            .setLabel('Por que está abrindo este ticket?').setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Descreva brevemente seu problema ou dúvida...').setRequired(true).setMinLength(5).setMaxLength(1000),
        ),
      );
      break;

    case 'anydesk':
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('ticket_subject')
            .setLabel('Motivo do suporte').setStyle(TextInputStyle.Short)
            .setPlaceholder('Descreva brevemente o que precisa...').setRequired(true).setMinLength(3).setMaxLength(100),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('anydesk_codigo')
            .setLabel('Código AnyDesk').setStyle(TextInputStyle.Short)
            .setPlaceholder('Ex: 123 456 789').setRequired(true).setMinLength(5).setMaxLength(20),
        ),
      );
      break;

    case 'parceria':
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('ticket_subject')
            .setLabel('Por que está abrindo este ticket?').setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Descreva sua proposta de parceria...').setRequired(true).setMinLength(5).setMaxLength(1000),
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
            .setLabel('Por que está abrindo este ticket?').setStyle(TextInputStyle.Paragraph)
            .setRequired(true).setMinLength(5).setMaxLength(1000),
        ),
      );
  }

  return modal;
}

function getTitleForCategory(category) {
  return {
    denuncia: '🚨 Abrir Denúncia',
    suporte:  '🛠️ Abrir Ticket de Suporte',
    anydesk:  '🖥️ Suporte AnyDesk',
    parceria: '🤝 Proposta de Parceria',
  }[category] || 'Abrir Ticket';
}

// ────────────────────────────────────────────────────────────────────────────
// EXTRAÇÃO DOS DADOS DO MODAL
// ────────────────────────────────────────────────────────────────────────────

function extractModalData(interaction, category) {
  const subject = interaction.fields.getTextInputValue('ticket_subject');
  let extraFields = [], description = subject;

  switch (category) {
    case 'denuncia': {
      const motivo = interaction.fields.getTextInputValue('ticket_motivo');
      extraFields = [
        { name: '🎯 Denunciado', value: subject, inline: true },
        { name: '⚠️ Motivo',     value: motivo,  inline: false },
      ];
      description = motivo;
      break;
    }
    case 'anydesk': {
      const codigo = interaction.fields.getTextInputValue('anydesk_codigo');
      extraFields = [
        { name: '📋 Motivo',        value: subject, inline: false },
        { name: '🖥️ Código AnyDesk', value: `\`${codigo}\``, inline: true },
      ];
      description = subject;
      break;
    }
    case 'parceria': {
      const link = interaction.fields.getTextInputValue('parceria_link') || 'Não informado';
      extraFields = [
        { name: '📋 Proposta', value: subject, inline: false },
        { name: '🔗 Convite',  value: link,    inline: true  },
      ];
      description = subject;
      break;
    }
    default:
      extraFields = [{ name: '📋 Descrição', value: subject }];
      description = subject;
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
      desc:   `Nossa equipe está pronta para te ajudar!\n\n> 📋 Aguarde um atendente assumir seu ticket.\n> ⏱️ Resposta em até **12 horas**`,
      footer: '💙 Estamos aqui para ajudar!',
    },
    anydesk: {
      header: '🖥️ **SUPORTE ANYDESK**',
      desc:   `Sua solicitação de suporte remoto foi registrada!\n\n> 🖥️ Aguarde um atendente conectar via AnyDesk.\n> ⏱️ Resposta em até **1 hora**`,
      footer: '🔒 Conexão segura via AnyDesk',
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
