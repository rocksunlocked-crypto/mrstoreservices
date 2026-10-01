/**
 * Sistema de Anúncios em DM
 * Envia mensagem privada para todos os membros do servidor
 * com controle de rate limit e progresso
 */

const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const config = require('../config');
const { db }  = require('../database/database');
const { log } = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

// ─── Enviar anúncio em DM para todos ─────────────────────────────────────────
async function enviarAnuncio(interaction, dados) {
  const { titulo, mensagem, imagemUrl, cargosAlvo } = dados;

  await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setColor(config.colors.info)
      .setTitle('📣 Iniciando envio de anúncios...')
      .setDescription('Buscando membros do servidor...')
      .setTimestamp()],
  });

  const guild   = interaction.guild;
  const members = await guild.members.fetch().catch(() => null);
  if (!members) return interaction.editReply({ content: '❌ Erro ao buscar membros.' });

  // Filtrar membros (excluir bots)
  let alvo = [...members.values()].filter(m => !m.user.bot);

  // Filtrar por cargo se especificado
  if (cargosAlvo?.length) {
    alvo = alvo.filter(m => cargosAlvo.some(roleId => m.roles.cache.has(roleId)));
  }

  const total    = alvo.length;
  const anuncioId = uuidv4();
  db.prepare('INSERT INTO anuncios (id, titulo, mensagem, criado_por) VALUES (?,?,?,?)')
    .run(anuncioId, titulo, mensagem, interaction.user.id);

  // Montar embed do anúncio
  const embedAnuncio = new EmbedBuilder()
    .setColor(config.colors.loja)
    .setTitle(`📣 ${titulo}`)
    .setDescription(mensagem)
    .setTimestamp()
    .setFooter({ text: `Máximo Store • ${guild.name}` });

  if (imagemUrl) embedAnuncio.setImage(imagemUrl);

  let enviados = 0, falhas = 0;
  const delay  = config.anuncios.delayEntreEnvios;

  // Enviar em lotes com delay
  for (const member of alvo) {
    try {
      await member.send({ embeds: [embedAnuncio] });
      enviados++;
    } catch {
      falhas++;
    }

    // Delay entre envios (evita rate limit)
    await sleep(delay);

    // Atualizar progresso a cada 25 envios
    if ((enviados + falhas) % 25 === 0) {
      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(config.colors.info)
          .setTitle('📣 Enviando anúncios...')
          .addFields(
            { name: '✅ Enviados',  value: String(enviados), inline: true },
            { name: '❌ Falhas',    value: String(falhas),   inline: true },
            { name: '📊 Progresso', value: `${enviados + falhas}/${total}`, inline: true },
          )
          .setTimestamp()],
      }).catch(() => {});
    }
  }

  // Atualizar banco
  db.prepare('UPDATE anuncios SET enviados=?, falhas=? WHERE id=?').run(enviados, falhas, anuncioId);

  // Relatório final
  const embedFinal = new EmbedBuilder()
    .setColor(config.colors.success)
    .setTitle('✅ Anúncio Enviado!')
    .addFields(
      { name: '📊 Total',    value: String(total),    inline: true },
      { name: '✅ Enviados', value: String(enviados), inline: true },
      { name: '❌ Falhas',   value: String(falhas),   inline: true },
    )
    .setTimestamp()
    .setFooter({ text: `Máximo Store • Anúncio ID: ${anuncioId.slice(0,8)}` });

  await interaction.editReply({ embeds: [embedFinal] });

  await log('sistema', {
    executor:  interaction.user.id,
    descricao: `📣 Anúncio enviado: "${titulo}" — ${enviados}/${total} membros`,
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { enviarAnuncio };
