const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');

const fs   = require('fs');
const path = require('path');

const ARQUIVO = path.join(__dirname, '../data/bots_autorizados.json');

function carregar() {
  if (!fs.existsSync(ARQUIVO)) return [];
  try { return JSON.parse(fs.readFileSync(ARQUIVO, 'utf-8')); } catch { return []; }
}
function salvar(lista) {
  const dir = path.dirname(ARQUIVO);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(ARQUIVO, JSON.stringify(lista, null, 2));
}

// ─── Modal autorizar ──────────────────────────────────────────────────────────
async function abrirModalAutorizar(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('modal_bot_autorizar')
    .setTitle('🤖 Autorizar Bot');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('bot_id')
        .setLabel('ID do bot a autorizar')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: 1234567890123456789')
        .setRequired(true)
    ),
  );

  await interaction.showModal(modal);
}

// ─── Modal desautorizar ───────────────────────────────────────────────────────
async function abrirModalDesautorizar(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('modal_bot_desautorizar')
    .setTitle('🚫 Desautorizar Bot');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('bot_id')
        .setLabel('ID do bot a remover')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: 1234567890123456789')
        .setRequired(true)
    ),
  );

  await interaction.showModal(modal);
}

// ─── Processar autorizar ──────────────────────────────────────────────────────
async function processarAutorizar(interaction) {
  const botId = interaction.fields.getTextInputValue('bot_id').trim();

  if (!/^\d{17,20}$/.test(botId)) {
    return interaction.reply({ content: '❌ ID inválido. IDs do Discord têm entre 17 e 20 dígitos.', flags: 64 });
  }

  const lista = carregar();
  if (lista.includes(botId)) {
    return interaction.reply({ content: `⚠️ O bot \`${botId}\` já está autorizado.`, flags: 64 });
  }

  lista.push(botId);
  salvar(lista);

  return interaction.reply({
    content: `✅ Bot \`${botId}\` autorizado! Ele poderá entrar no servidor sem ser expulso.`,
    flags: 64,
  });
}

// ─── Processar desautorizar ───────────────────────────────────────────────────
async function processarDesautorizar(interaction) {
  const botId = interaction.fields.getTextInputValue('bot_id').trim();

  let lista = carregar();
  if (!lista.includes(botId)) {
    return interaction.reply({ content: `⚠️ O bot \`${botId}\` não está na lista.`, flags: 64 });
  }

  lista = lista.filter(id => id !== botId);
  salvar(lista);

  return interaction.reply({
    content: `✅ Bot \`${botId}\` removido da lista de autorizados.`,
    flags: 64,
  });
}

// ─── Listar (sem modal, resposta direta) ──────────────────────────────────────
async function listar(interaction) {
  const lista = carregar();

  if (!lista.length) {
    return interaction.reply({ content: '📋 Nenhum bot está autorizado no momento.', flags: 64 });
  }

  return interaction.reply({
    embeds: [{
      color: 0x5865F2,
      title: '🤖 Bots Autorizados',
      description: lista.map((id, i) => `${i + 1}. \`${id}\``).join('\n'),
      footer: { text: `${lista.length} bot(s) na lista` },
    }],
    flags: 64,
  });
}

// Exporta função usada pelo antiBot
module.exports = {
  abrirModalAutorizar,
  abrirModalDesautorizar,
  processarAutorizar,
  processarDesautorizar,
  listar,
  carregar,
  salvar,
};
