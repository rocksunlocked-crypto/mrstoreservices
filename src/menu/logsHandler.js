/**
 * Sistema de Logs
 * Envia registros de ações importantes para um canal de logs dedicado.
 * Uso: log(client, guild, tipo, dados)
 */

const { EmbedBuilder } = require('discord.js');

// ─── Canal de logs (crie um canal privado e coloque o ID aqui) ────────────────
const CANAL_LOGS = '1522518229093875793'; // #logs-bot

const CORES = {
  anuncio:          0x5865F2,
  sorteio_criado:   0x57F287,
  sorteio_encerrado:0xFFD700,
  canal_trancado:   0xFF4444,
  canal_aberto:     0x57F287,
  bot_expulso:      0xFF0000,
  bot_autorizado:   0x57F287,
  avaliacao_aprovada: 0x57F287,
  avaliacao_negada:   0xED4245,
  avaliacao_bloqueio: 0x000000,
  membro_entrou:    0x43B581,
  membro_saiu:      0xED4245,
  sorteio_finalizado: 0xFFD700,
};

const ICONES = {
  anuncio:           '📢',
  sorteio_criado:    '🎉',
  sorteio_encerrado: '🏆',
  canal_trancado:    '🔒',
  canal_aberto:      '🔓',
  bot_expulso:       '🚫',
  bot_autorizado:    '✅',
  avaliacao_aprovada:'⭐',
  avaliacao_negada:  '❌',
  avaliacao_bloqueio:'🔨',
  membro_entrou:     '👋',
  membro_saiu:       '🚪',
  sorteio_finalizado:'🏁',
};

/**
 * @param {Client} client
 * @param {Guild} guild
 * @param {string} tipo
 * @param {Object} dados - campos livres { acao, responsavel, alvo, detalhes, extra }
 */
async function log(client, guild, tipo, dados = {}) {
  try {
    const canal = guild?.channels?.cache?.get(CANAL_LOGS);
    if (!canal) return;

    const icone = ICONES[tipo] ?? '📋';
    const cor   = CORES[tipo]  ?? 0x5865F2;
    const ts    = Math.floor(Date.now() / 1000);

    const embed = new EmbedBuilder()
      .setTitle(`${icone} ${dados.acao ?? tipo}`)
      .setColor(cor)
      .setTimestamp();

    const fields = [];
    if (dados.responsavel) fields.push({ name: '👤 Responsável', value: dados.responsavel, inline: true });
    if (dados.alvo)        fields.push({ name: '🎯 Alvo',        value: dados.alvo,         inline: true });
    if (dados.canal)       fields.push({ name: '📢 Canal',       value: dados.canal,        inline: true });
    if (dados.detalhes)    fields.push({ name: '📋 Detalhes',    value: dados.detalhes,     inline: false });
    if (dados.extra)       fields.push({ name: '➕ Extra',        value: dados.extra,        inline: false });
    fields.push({ name: '🕐 Horário', value: `<t:${ts}:F>`, inline: true });

    if (fields.length) embed.setFields(fields);

    await canal.send({ embeds: [embed] });
  } catch (err) {
    console.error('[Logs] Erro ao enviar log:', err.message);
  }
}

module.exports = { log, CANAL_LOGS };
