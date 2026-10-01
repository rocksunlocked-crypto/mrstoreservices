const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const { isAdmin } = require('../../utils/permissions');
const { Produtos, Config, db } = require('../../database/database');
const config = require('../../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('🏪 Configurar embed permanente da loja num canal')
    .addSubcommand(sub =>
      sub.setName('loja')
         .setDescription('📌 Envia o embed principal da loja no canal atual')
         .addStringOption(o => o.setName('titulo').setDescription('Título do embed').setRequired(false))
         .addStringOption(o => o.setName('descricao').setDescription('Descrição do embed').setRequired(false))
         .addStringOption(o => o.setName('banner').setDescription('URL do banner/imagem').setRequired(false))
         .addStringOption(o => o.setName('cor').setDescription('Cor hex (ex: FF6B6B)').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('caixas')
         .setDescription('🎁 Envia o embed de caixas misteriosas no canal atual')
    )
    .addSubcommand(sub =>
      sub.setName('regras')
         .setDescription('📋 Envia embed de regras de compra no canal atual')
    ),
  cooldown: 10,
  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: '❌ Apenas administradores.', ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    const sub = interaction.options.getSubcommand();

    // ── Setup Loja ────────────────────────────────────────────────────────
    if (sub === 'loja') {
      const nomeLoja    = Config.get('nome_loja') || 'Máximo Store';
      const titulo      = interaction.options.getString('titulo') || `🛍️ Bem-vindo à ${nomeLoja}`;
      const banner      = interaction.options.getString('banner') || null;
      const corHex      = interaction.options.getString('cor');
      const cor         = corHex ? parseInt(corHex.replace('#', ''), 16) : config.colors.loja;

      const produtos = Produtos.listar(null, true).slice(0, 5);
      const descProd = produtos.length
        ? produtos.map(p => `> 📦 **${p.nome}** — R$ ${(p.preco_promo || p.preco).toFixed(2)}`).join('\n')
        : '> Nenhum produto disponível no momento.';

      const descricao = interaction.options.getString('descricao') ||
        `Compre produtos digitais com segurança e rapidez!\nPagamentos via **PIX** confirmados automaticamente.\n\n**📦 Destaques:**\n${descProd}`;

      const embed = new EmbedBuilder()
        .setColor(cor)
        .setTitle(titulo)
        .setDescription(descricao)
        .addFields(
          { name: '💠 Pagamento', value: 'PIX • Boleto', inline: true },
          { name: '⚡ Entrega',   value: 'Automática e instantânea', inline: true },
          { name: '🎫 Suporte',   value: 'Ticket 24/7', inline: true },
        )
        .setTimestamp()
        .setFooter({ text: `${nomeLoja} • Clique em Abrir Loja para comprar` });

      if (banner) embed.setImage(banner);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('loja_abrir').setLabel('🛍️ Abrir Loja').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('caixas_listar').setLabel('🎁 Caixas Misteriosas').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('carrinho_ver').setLabel('🛒 Meu Carrinho').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('perfil_ver').setLabel('👤 Meu Perfil').setStyle(ButtonStyle.Secondary),
      );

      await interaction.channel.send({ embeds: [embed], components: [row] });
      await interaction.editReply({ content: '✅ Embed da loja enviado com sucesso!' });
    }

    // ── Setup Caixas ─────────────────────────────────────────────────────
    else if (sub === 'caixas') {
      const caixas = db.prepare('SELECT * FROM caixas_misteriosas WHERE ativa=1 ORDER BY preco ASC').all();
      const RARS = { comum: '⚪', incomum: '🟢', raro: '🔵', epico: '🟣', lendario: '🌟' };

      const embed = new EmbedBuilder()
        .setColor(config.colors.gold)
        .setTitle('🎁 Caixas Misteriosas')
        .setDescription([
          '> Abra caixas e ganhe prêmios incríveis!',
          '> Raridades: ⚪ Comum • 🟢 Incomum • 🔵 Raro • 🟣 Épico • 🌟 Lendário',
        ].join('\n'))
        .setTimestamp()
        .setFooter({ text: 'Máximo Store • Tente sua sorte!' });

      if (caixas.length) {
        for (const cx of caixas) {
          const itens = db.prepare('SELECT * FROM caixa_itens WHERE caixa_id=?').all(cx.id);
          const rarMap = {};
          itens.forEach(i => rarMap[i.raridade] = (rarMap[i.raridade] || 0) + 1);
          const rarStr = Object.entries(rarMap).map(([r, c]) => `${RARS[r] || '❓'} ${c}`).join(' ');
          embed.addFields({ name: `🎁 ${cx.nome}`, value: `💵 **R$ ${cx.preco.toFixed(2)}** • ${rarStr} • ${cx.vendas} abertas`, inline: false });
        }
      } else {
        embed.setDescription('Nenhuma caixa disponível no momento.');
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('caixas_listar').setLabel('🎁 Ver Caixas').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('caixa_historico').setLabel('📜 Meu Histórico').setStyle(ButtonStyle.Secondary),
      );

      await interaction.channel.send({ embeds: [embed], components: [row] });
      await interaction.editReply({ content: '✅ Embed de caixas enviado!' });
    }

    // ── Setup Regras ──────────────────────────────────────────────────────
    else if (sub === 'regras') {
      const embed = new EmbedBuilder()
        .setColor(config.colors.info)
        .setTitle('📋 Regras de Compra')
        .setDescription([
          '**Leia antes de comprar:**',
          '',
          '**1.** Todos os pagamentos são processados via **PIX** (confirmação automática).',
          '**2.** Produtos digitais são entregues **instantaneamente** após o pagamento.',
          '**3.** Guarde o ID do pedido para eventuais consultas.',
          '**4.** Reembolsos podem ser solicitados em até **7 dias** após a compra.',
          '**5.** Tentativas de fraude resultam em **banimento permanente**.',
          '**6.** Em caso de problemas, abra um ticket com `/ticket`.',
          '',
          '> ✅ Ao realizar uma compra, você concorda com estas regras.',
        ].join('\n'))
        .setTimestamp()
        .setFooter({ text: 'Máximo Store • Boas compras!' });

      await interaction.channel.send({ embeds: [embed] });
      await interaction.editReply({ content: '✅ Embed de regras enviado!' });
    }
  },
};
