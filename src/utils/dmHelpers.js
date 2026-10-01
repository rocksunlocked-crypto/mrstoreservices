/**
 * Helpers para DMs enviadas ao cliente
 */

const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { db } = require('../database/database');

// ─── Uma mensagem só com resumo + produtos + botão transcript ─────────────────
async function enviarDmFechamento(guild, ticket, motivo, fechadoPorId, linkTranscript = null) {
  try {
    const member = await guild?.members.fetch(ticket.usuario_id).catch(() => null);
    if (!member) return;

    // Buscar 3 produtos mais baratos com estoque
    let produtosBaratos = [];
    try {
      produtosBaratos = db.prepare(`
        SELECT p.nome, MIN(vp.preco) as menor_preco
        FROM produtos p
        JOIN variantes_produto vp ON vp.produto_id = p.id AND vp.ativo = 1
        JOIN estoque_variante ev ON ev.variante_id = vp.id AND ev.usado = 0
        WHERE p.ativo = 1
        GROUP BY p.id ORDER BY menor_preco ASC LIMIT 3
      `).all();
    } catch {}

    const embed = new EmbedBuilder()
      .setColor(0x2C2F33)
      .setTitle('🔒 Seu ticket foi encerrado')
      .setDescription('> Obrigado pelo contato! Seu atendimento foi finalizado.')
      .addFields(
        { name: '🆔 Ticket',      value: `\`${ticket.id.slice(0,8).toUpperCase()}\``,         inline: true },
        { name: '✋ Atendente',   value: ticket.atendente ? `<@${ticket.atendente}>` : '—',    inline: true },
        { name: '🔒 Fechado por', value: `<@${fechadoPorId}>`,                                 inline: true },
        { name: '📝 Motivo',      value: motivo || '—',                                        inline: false },
        ...(produtosBaratos.length ? [{
          name:  '🛍️ Aproveite e confira nossos produtos',
          value: produtosBaratos.map(p => `> • **${p.nome}** — a partir de R$ ${Number(p.menor_preco).toFixed(2)}`).join('\n'),
          inline: false,
        }] : []),
      )
      .setTimestamp()
      .setFooter({ text: 'Máximo Store • Volte sempre!' });

    const components = [];
    if (linkTranscript) {
      components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('📂 Abrir Transcript').setStyle(ButtonStyle.Link).setURL(linkTranscript),
      ));
    }

    await member.send({ embeds: [embed], components }).catch(() => {});
  } catch (err) {
    console.error('[DM Fechamento]', err.message);
  }
}

// ─── Botão de transcript para DM de entrega ───────────────────────────────────
function criarBotaoTranscript(linkTranscript) {
  if (!linkTranscript) return null;
  return new ButtonBuilder().setLabel('📂 Ver Transcript').setStyle(ButtonStyle.Link).setURL(linkTranscript);
}

// ─── Sugestão de produtos (embed standalone) ──────────────────────────────────
function montarEmbedSugestao() {
  try {
    const produtos = db.prepare(`
      SELECT p.nome, MIN(vp.preco) as menor_preco
      FROM produtos p
      JOIN variantes_produto vp ON vp.produto_id = p.id AND vp.ativo = 1
      JOIN estoque_variante ev ON ev.variante_id = vp.id AND ev.usado = 0
      WHERE p.ativo = 1
      GROUP BY p.id ORDER BY menor_preco ASC LIMIT 3
    `).all();
    if (!produtos.length) return null;
    return new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle('🛍️ Outros produtos da loja')
      .setDescription(produtos.map(p => `> • **${p.nome}** — a partir de R$ ${Number(p.menor_preco).toFixed(2)}`).join('\n'))
      .setTimestamp()
      .setFooter({ text: 'Máximo Store • Volte sempre!' });
  } catch { return null; }
}

module.exports = { enviarDmFechamento, criarBotaoTranscript, montarEmbedSugestao };
