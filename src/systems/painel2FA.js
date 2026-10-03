/**
 * sistemas/painel2FA.js — Painel fixo de 2FA no canal
 * Canal: 1534449168750215219
 * 
 * Botões:
 *   🔑 Gerar Código   — abre modal para digitar nome da conta
 *   💾 Salvar Conta   — abre modal para adicionar nova conta
 *   📋 Listar Contas  — mostra contas salvas (ephemeral)
 *   🗑️ Remover Conta  — abre modal para remover conta
 */

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const {
  add2FAAccount, remove2FAAccount, list2FAAccounts,
  generate2FACode, generateAll2FACodes,
} = require('../2fa');

const CANAL_2FA = '1534449168750215219';
const MSG_KEY   = 'painel_2fa_msg_id'; // chave no banco para guardar o ID da mensagem

// ── Enviar/atualizar o painel no canal ───────────────────────────────────────
async function enviarPainel2FA(client) {
  try {
    const canal = await client.channels.fetch(CANAL_2FA).catch(() => null);
    if (!canal) { console.warn('[2FA Painel] Canal não encontrado:', CANAL_2FA); return; }

    const embed = new EmbedBuilder()
      .setColor(0x9B59B6)
      .setTitle('🔐 Autenticador 2FA')
      .setDescription([
        '> Use os botões abaixo para gerenciar seus códigos de autenticação.',
        '',
        '**Como funciona:**',
        '• **🔑 Gerar Código** — Gera o código atual de uma conta salva',
        '• **📋 Todos os Códigos** — Gera códigos de todas as suas contas',
        '• **💾 Salvar Conta** — Adiciona uma nova conta 2FA',
        '• **🗑️ Remover Conta** — Remove uma conta salva',
        '',
        '> ⚠️ Todos os códigos são enviados apenas para você (visíveis só para você).',
      ].join('\n'))
      .setFooter({ text: 'Máximo Store • Sistema 2FA' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('2fa_gerar').setLabel('Gerar Código').setEmoji('🔑').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('2fa_todos').setLabel('Todos os Códigos').setEmoji('📋').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('2fa_salvar').setLabel('Salvar Conta').setEmoji('💾').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('2fa_remover').setLabel('Remover Conta').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
    );

    // Verificar se já existe uma mensagem do painel
    const { db } = require('../database/database');
    const msgIdRow = db.prepare("SELECT valor FROM configuracoes WHERE chave=?").get(MSG_KEY);
    const msgId    = msgIdRow?.valor;

    if (msgId) {
      // Tentar editar a mensagem existente
      const msg = await canal.messages.fetch(msgId).catch(() => null);
      if (msg && msg.author.id === client.user.id) {
        await msg.edit({ embeds: [embed], components: [row] });
        console.log('[2FA Painel] Painel atualizado.');
        return;
      }
    }

    // Criar nova mensagem
    const msg = await canal.send({ embeds: [embed], components: [row] });
    db.prepare("INSERT OR REPLACE INTO configuracoes (chave, valor, tipo) VALUES (?,?,'string')").run(MSG_KEY, msg.id);
    console.log('[2FA Painel] Painel criado:', msg.id);
  } catch (e) {
    console.error('[2FA Painel] Erro:', e.message);
  }
}

// ── Handler dos botões e modais ───────────────────────────────────────────────
async function handle2FAInteraction(interaction) {
  const id = interaction.customId;

  // ── Botão: Gerar Código ─────────────────────────────────────────────────────
  if (id === '2fa_gerar') {
    const contas = list2FAAccounts(interaction.user.id);
    if (!contas.length) {
      return interaction.reply({
        content: '❌ Você não tem contas salvas. Use **💾 Salvar Conta** primeiro.',
        ephemeral: true,
      });
    }
    const modal = new ModalBuilder().setCustomId('2fa_modal_gerar').setTitle('🔑 Gerar Código 2FA');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('conta_nome')
          .setLabel('Nome da conta')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder(`Ex: ${contas[0]}`)
          .setMinLength(1),
      ),
    );
    return interaction.showModal(modal);
  }

  // ── Botão: Todos os Códigos ─────────────────────────────────────────────────
  if (id === '2fa_todos') {
    const contas = list2FAAccounts(interaction.user.id);
    if (!contas.length) {
      return interaction.reply({
        content: '❌ Você não tem contas salvas. Use **💾 Salvar Conta** primeiro.',
        ephemeral: true,
      });
    }
    try {
      const codigos = generateAll2FACodes(interaction.user.id);
      const fields  = codigos.map(c => ({
        name:   `🔑 ${c.label}`,
        value:  `\`\`\`${c.token}\`\`\`⏳ expira em **${c.remaining}s**`,
        inline: false,
      }));
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0x9B59B6)
          .setTitle(`📋 Seus Códigos 2FA (${codigos.length})`)
          .addFields(fields)
          .setTimestamp()],
        ephemeral: true,
      });
    } catch (e) {
      return interaction.reply({ content: `❌ ${e.message}`, ephemeral: true });
    }
  }

  // ── Botão: Salvar Conta ─────────────────────────────────────────────────────
  if (id === '2fa_salvar') {
    const modal = new ModalBuilder().setCustomId('2fa_modal_salvar').setTitle('💾 Salvar Conta 2FA');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('conta_nome')
          .setLabel('Nome da conta')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('Ex: Gmail, Discord, Steam...'),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('conta_secret')
          .setLabel('Chave secreta Base32')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('Ex: JBSWY3DPEHPK3PXP'),
      ),
    );
    return interaction.showModal(modal);
  }

  // ── Botão: Remover Conta ────────────────────────────────────────────────────
  if (id === '2fa_remover') {
    const contas = list2FAAccounts(interaction.user.id);
    if (!contas.length) {
      return interaction.reply({
        content: '❌ Você não tem contas salvas.',
        ephemeral: true,
      });
    }
    const modal = new ModalBuilder().setCustomId('2fa_modal_remover').setTitle('🗑️ Remover Conta 2FA');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('conta_nome')
          .setLabel('Nome da conta a remover')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder(`Suas contas: ${contas.join(', ')}`),
      ),
    );
    return interaction.showModal(modal);
  }

  // ── Modal: Gerar Código ─────────────────────────────────────────────────────
  if (id === '2fa_modal_gerar') {
    const nome = interaction.fields.getTextInputValue('conta_nome').trim();
    try {
      const codigo = generate2FACode(interaction.user.id, nome);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle(`🔑 Código 2FA — ${codigo.label}`)
          .setDescription(`\`\`\`${codigo.token}\`\`\``)
          .addFields({ name: '⏳ Expira em', value: `**${codigo.remaining}s**`, inline: true })
          .setTimestamp()],
        ephemeral: true,
      });
    } catch (e) {
      return interaction.reply({ content: `❌ ${e.message}`, ephemeral: true });
    }
  }

  // ── Modal: Salvar Conta ─────────────────────────────────────────────────────
  if (id === '2fa_modal_salvar') {
    const nome   = interaction.fields.getTextInputValue('conta_nome').trim();
    const secret = interaction.fields.getTextInputValue('conta_secret').trim();
    try {
      add2FAAccount(interaction.user.id, nome, secret);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('✅ Conta 2FA salva!')
          .setDescription(`A conta **${nome}** foi salva com sucesso.\nAgora use **🔑 Gerar Código** para obter o código.`)
          .setTimestamp()],
        ephemeral: true,
      });
    } catch (e) {
      return interaction.reply({ content: `❌ ${e.message}`, ephemeral: true });
    }
  }

  // ── Modal: Remover Conta ────────────────────────────────────────────────────
  if (id === '2fa_modal_remover') {
    const nome = interaction.fields.getTextInputValue('conta_nome').trim();
    try {
      remove2FAAccount(interaction.user.id, nome);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle('🗑️ Conta removida')
          .setDescription(`A conta **${nome}** foi removida.`)
          .setTimestamp()],
        ephemeral: true,
      });
    } catch (e) {
      return interaction.reply({ content: `❌ ${e.message}`, ephemeral: true });
    }
  }
}

module.exports = { enviarPainel2FA, handle2FAInteraction };
