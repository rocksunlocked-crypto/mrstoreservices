const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const config = require('../config');
const moment = require('moment-timezone');

function ts() { return moment().tz(config.timezone).format('DD/MM/YYYY HH:mm'); }

// ─── Embed base ──────────────────────────────────────────────────────────────
function base(cor, titulo, desc) {
  return new EmbedBuilder()
    .setColor(cor)
    .setTitle(titulo)
    .setDescription(desc || null)
    .setTimestamp()
    .setFooter({ text: `Máximo Store • ${ts()}` });
}

// ─── Embeds prontos ──────────────────────────────────────────────────────────
const Embeds = {
  sucesso: (titulo, desc) => base(config.colors.success, `✅ ${titulo}`, desc),
  erro: (titulo, desc) => base(config.colors.error, `❌ ${titulo}`, desc),
  aviso: (titulo, desc) => base(config.colors.warning, `⚠️ ${titulo}`, desc),
  info: (titulo, desc) => base(config.colors.info, `ℹ️ ${titulo}`, desc),
  pix: (titulo, desc) => base(config.colors.pix, `💠 ${titulo}`, desc),
  loja: (titulo, desc) => base(config.colors.loja, `🛍️ ${titulo}`, desc),
  gold: (titulo, desc) => base(config.colors.gold, `✨ ${titulo}`, desc),

  produto: (produto) => {
    const preco = produto.preco_promo
      ? `~~R$ ${produto.preco.toFixed(2)}~~ **R$ ${produto.preco_promo.toFixed(2)}**`
      : `**R$ ${produto.preco.toFixed(2)}**`;
    const estoque = produto.estoque === -1 ? '∞ Ilimitado' : produto.estoque === 0 ? '❌ Esgotado' : `✅ ${produto.estoque}`;
    const stars = '⭐'.repeat(Math.round(produto.avaliacao || 0));
    const e = new EmbedBuilder()
      .setColor(config.colors.loja)
      .setTitle(`📦 ${produto.nome}`)
      .setDescription(produto.descricao || 'Sem descrição')
      .addFields(
        { name: '💵 Preço', value: preco, inline: true },
        { name: '📦 Estoque', value: estoque, inline: true },
        { name: '🏷️ Categoria', value: produto.categoria, inline: true },
        { name: '🛒 Vendas', value: String(produto.vendas || 0), inline: true },
        { name: '⭐ Avaliação', value: produto.avaliacao ? `${stars} (${produto.avaliacao.toFixed(1)}/5)` : 'Sem avaliações', inline: true },
      )
      .setTimestamp()
      .setFooter({ text: `ID: ${produto.id.slice(0, 8)} • Máximo Store` });
    if (produto.imagem_url) e.setImage(produto.imagem_url);
    return e;
  },

  pedido: (pedido, produto) => {
    const statusEmoji = {
      pendente: '⏳', pago: '✅', entregue: '📦', cancelado: '❌', reembolsado: '↩️'
    };
    const e = new EmbedBuilder()
      .setColor(pedido.status === 'pago' || pedido.status === 'entregue' ? config.colors.success : config.colors.warning)
      .setTitle(`${statusEmoji[pedido.status] || '📋'} Pedido #${pedido.id.slice(0, 8).toUpperCase()}`)
      .addFields(
        { name: '📦 Produto', value: produto?.nome || pedido.produto_id, inline: true },
        { name: '🔢 Quantidade', value: String(pedido.quantidade), inline: true },
        { name: '💵 Total', value: `R$ ${pedido.valor_total.toFixed(2)}`, inline: true },
        { name: '📊 Status', value: pedido.status.toUpperCase(), inline: true },
        { name: '💳 Pagamento', value: (pedido.metodo_pag || 'pix').toUpperCase(), inline: true },
        { name: '📅 Data', value: moment.unix(pedido.criado_em).tz(config.timezone).format('DD/MM/YYYY HH:mm'), inline: true },
      )
      .setTimestamp()
      .setFooter({ text: 'Máximo Store • Obrigado pela sua compra!' });
    if (pedido.desconto > 0) {
      e.addFields({ name: '🎟️ Desconto', value: `R$ ${pedido.desconto.toFixed(2)}`, inline: true });
    }
    return e;
  },

  ticket: (ticket, usuario) => new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle('🎫 Ticket de Suporte')
    .setDescription(`Bem-vindo ao seu ticket, <@${usuario}>!\n\nDescreva sua necessidade e nossa equipe irá atender você em breve.`)
    .addFields(
      { name: '🆔 ID', value: `\`${ticket.id.slice(0, 8).toUpperCase()}\``, inline: true },
      { name: '👤 Usuário', value: `<@${usuario}>`, inline: true },
      { name: '📋 Tipo', value: ticket.tipo.toUpperCase(), inline: true },
    )
    .setTimestamp()
    .setFooter({ text: 'Máximo Store • Use os botões abaixo para gerenciar o ticket' }),

  pix: (pedido, qrCode, expiracao) => new EmbedBuilder()
    .setColor(config.colors.pix)
    .setTitle('💠 Pagamento via PIX')
    .setDescription('> Escaneie o QR Code ou copie o código PIX abaixo para realizar o pagamento.')
    .addFields(
      { name: '💵 Valor', value: `**R$ ${pedido.valor_total.toFixed(2)}**`, inline: true },
      { name: '⏰ Expira em', value: expiracao || '30 minutos', inline: true },
      { name: '🆔 Pedido', value: `\`${pedido.id.slice(0, 8).toUpperCase()}\``, inline: true },
      { name: '📋 Código PIX (Copia e Cola)', value: `\`\`\`${qrCode}\`\`\`` },
    )
    .setTimestamp()
    .setFooter({ text: 'O pagamento é confirmado automaticamente • Máximo Store' }),

  perfil: (usuario, member) => {
    const config_ = require('../config');
    const nivel = config_.fidelidade.niveis.find(n => n.nome === usuario.nivel) || config_.fidelidade.niveis[0];
    const proximoNivel = config_.fidelidade.niveis.find(n => n.min > (usuario.pontos || 0));
    const progressoBar = () => {
      if (!proximoNivel) return '██████████ MAX';
      const atual = usuario.pontos - nivel.min;
      const total = proximoNivel.min - nivel.min;
      const pct = Math.floor((atual / total) * 10);
      return '█'.repeat(pct) + '░'.repeat(10 - pct) + ` (${usuario.pontos}/${proximoNivel.min})`;
    };
    return new EmbedBuilder()
      .setColor(config.colors.gold)
      .setTitle(`${nivel.emoji} ${member.displayName}`)
      .setThumbnail(member.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '🏆 Nível', value: `${nivel.emoji} **${usuario.nivel}**`, inline: true },
        { name: '⭐ Pontos', value: `${usuario.pontos || 0}`, inline: true },
        { name: '💰 Saldo', value: `R$ ${(usuario.saldo || 0).toFixed(2)}`, inline: true },
        { name: '🛒 Compras', value: String(usuario.total_compras || 0), inline: true },
        { name: '💸 Total Gasto', value: `R$ ${(usuario.total_gasto || 0).toFixed(2)}`, inline: true },
        { name: '🤝 Código Afiliado', value: `\`${usuario.codigo_afil || 'N/A'}\``, inline: true },
        { name: '📊 Progresso', value: progressoBar() },
        { name: '💎 Desconto por Fidelidade', value: `${nivel.desconto}%`, inline: true },
      )
      .setTimestamp()
      .setFooter({ text: 'Máximo Store • Sistema de Fidelidade' });
  },
};

// ─── Rows de botões ──────────────────────────────────────────────────────────
const Rows = {
  ticketAberto: (pedidoId) => new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket_pagar_${pedidoId}`).setLabel('💰 Pagar').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`ticket_cancelar_${pedidoId}`).setLabel('❌ Cancelar').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ticket_fechar').setLabel('🔒 Fechar Ticket').setStyle(ButtonStyle.Secondary),
  ),
  ticketStaff: () => new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_assumir').setLabel('✋ Assumir').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ticket_fechar').setLabel('🔒 Fechar').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ticket_banir_fraude').setLabel('🚫 Fraude').setStyle(ButtonStyle.Danger),
  ),
  pagamentoPix: (pedidoId) => new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`verificar_pix_${pedidoId}`).setLabel('🔄 Verificar Pagamento').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`cancelar_pix_${pedidoId}`).setLabel('❌ Cancelar').setStyle(ButtonStyle.Danger),
  ),
  confirmarEntrega: (pedidoId) => new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`confirmar_entrega_${pedidoId}`).setLabel('✅ Confirmar Recebimento').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`solicitar_reembolso_${pedidoId}`).setLabel('↩️ Solicitar Reembolso').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`avaliar_${pedidoId}`).setLabel('⭐ Avaliar').setStyle(ButtonStyle.Secondary),
  ),
  abrirLoja: () => new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('loja_abrir').setLabel('🛍️ Abrir Loja').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('carrinho_ver').setLabel('🛒 Meu Carrinho').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('perfil_ver').setLabel('👤 Meu Perfil').setStyle(ButtonStyle.Secondary),
  ),
};

module.exports = { Embeds, Rows };
