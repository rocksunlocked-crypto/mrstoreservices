/**
 * sistemas/painel2FA.js — Painel fixo de 2FA no canal
 * Canal: 1534449168750215219
 *
 * Usuário clica em "Gerar Código", digita a Secret Key no modal,
 * e recebe o código de 6 dígitos em ephemeral.
 */

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { generate2FACodeFromSecret } = require('../2fa');

const CANAL_2FA = '1534449168750215219';
const MSG_KEY   = 'painel_2fa_msg_id';

// ── Enviar/atualizar o painel no canal ────────────────────────────────────────
async function enviarPainel2FA(client) {
  try {
    const canal = await client.channels.fetch(CANAL_2FA).catch(() => null);
    if (!canal) { console.warn('[2FA Painel] Canal não encontrado:', CANAL_2FA); return; }

    const embed = new EmbedBuilder()
      .setColor(0x9B59B6)
      .setTitle('🔐 Gerador de Código 2FA')
      .setDescription([
        '> Clique no botão abaixo, insira sua **Secret Key** e receba',
        '> o código de **6 dígitos** instantaneamente.',
        '',
        '⚠️ O código é visível **apenas para você** e expira em até 30 segundos.',
      ].join('\n'))
      .setFooter({ text: 'Máximo Store • Autenticador 2FA' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('2fa_gerar')
        .setLabel('Gerar Código')
        .setEmoji('🔑')
        .setStyle(ButtonStyle.Primary),
    );

    const { db } = require('../database/database');
    const msgIdRow = db.prepare("SELECT valor FROM configuracoes WHERE chave=?").get(MSG_KEY);
    const msgId    = msgIdRow?.valor;

    if (msgId) {
      const msg = await canal.messages.fetch(msgId).catch(() => null);
      if (msg && msg.author.id === client.user.id) {
        await msg.edit({ embeds: [embed], components: [row] });
        console.log('[2FA Painel] Painel atualizado.');
        return;
      }
    }

    const msg = await canal.send({ embeds: [embed], components: [row] });
    db.prepare("INSERT OR REPLACE INTO configuracoes (chave, valor, tipo) VALUES (?,?,'string')").run(MSG_KEY, msg.id);
    console.log('[2FA Painel] Painel criado:', msg.id);
  } catch (e) {
    console.error('[2FA Painel] Erro:', e.message);
  }
}

// ── Handler de botão e modal ──────────────────────────────────────────────────
async function handle2FAInteraction(interaction) {
  const id = interaction.customId;

  // Botão: abre modal pedindo a Secret Key
  if (id === '2fa_gerar') {
    const modal = new ModalBuilder()
      .setCustomId('2fa_modal_gerar')
      .setTitle('🔑 Gerar Código 2FA');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('secret_key')
          .setLabel('Secret Key (chave Base32)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('Ex: JBSWY3DPEHPK3PXP'),
      ),
    );
    return interaction.showModal(modal);
  }

  // Modal: gera o código e responde em ephemeral
  if (id === '2fa_modal_gerar') {
    const secret = interaction.fields.getTextInputValue('secret_key').trim();
    try {
      const codigo = generate2FACodeFromSecret(secret, '2FA');
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('🔑 Seu Código 2FA')
          .setDescription(`# \`${codigo.token}\``)
          .addFields({ name: '⏳ Expira em', value: `**${codigo.remaining} segundos**`, inline: true })
          .setFooter({ text: 'Este código é visível apenas para você' })
          .setTimestamp()],
        ephemeral: true,
      });
    } catch (e) {
      return interaction.reply({
        content: '❌ Secret Key inválida. Verifique se é uma chave Base32 correta.',
        ephemeral: true,
      });
    }
  }
}

module.exports = { enviarPainel2FA, handle2FAInteraction };
