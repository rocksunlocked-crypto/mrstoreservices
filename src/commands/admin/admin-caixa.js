const { SlashCommandBuilder } = require('discord.js');
const { criarCaixa, adicionarItem, listarCaixas } = require('../../systems/caixaMisteriosa');
const { isLoja } = require('../../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('admin-caixa')
    .setDescription('🎁 Gerenciar caixas misteriosas')
    .addSubcommand(sub =>
      sub.setName('criar')
         .setDescription('➕ Criar nova caixa')
         .addStringOption(o => o.setName('nome').setDescription('Nome da caixa').setRequired(true))
         .addNumberOption(o => o.setName('preco').setDescription('Preço da caixa').setRequired(true).setMinValue(0.01))
         .addStringOption(o => o.setName('descricao').setDescription('Descrição').setRequired(false))
         .addStringOption(o => o.setName('imagem').setDescription('URL da imagem').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('additem')
         .setDescription('➕ Adicionar item a uma caixa')
         .addStringOption(o => o.setName('caixa_id').setDescription('ID da caixa').setRequired(true))
         .addStringOption(o => o.setName('nome').setDescription('Nome do item').setRequired(true))
         .addNumberOption(o => o.setName('chance').setDescription('Chance (%)').setRequired(true).setMinValue(0.1).setMaxValue(100))
         .addStringOption(o => o.setName('raridade').setDescription('Raridade').addChoices(
           { name: '⚪ Comum', value: 'comum' }, { name: '🟢 Incomum', value: 'incomum' },
           { name: '🔵 Raro', value: 'raro' }, { name: '🟣 Épico', value: 'epico' },
           { name: '🌟 Lendário', value: 'lendario' },
         ).setRequired(true))
         .addStringOption(o => o.setName('tipo').setDescription('Tipo de prêmio').addChoices(
           { name: '💰 Saldo', value: 'saldo' }, { name: '📦 Produto', value: 'produto' },
           { name: '⭐ Pontos', value: 'pontos' }, { name: '🎟️ Cupom', value: 'cupom' },
         ).setRequired(true))
         .addNumberOption(o => o.setName('valor').setDescription('Valor (saldo/pontos)').setRequired(false))
         .addStringOption(o => o.setName('premio_id').setDescription('ID do produto/cupom').setRequired(false))
         .addStringOption(o => o.setName('descricao').setDescription('Descrição do item').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('listar').setDescription('📋 Listar caixas existentes')
    ),
  cooldown: 3,
  async execute(interaction) {
    if (!isLoja(interaction.member)) {
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    const sub = interaction.options.getSubcommand();

    if (sub === 'criar') {
      const id = criarCaixa({
        nome: interaction.options.getString('nome'),
        descricao: interaction.options.getString('descricao') || '',
        preco: interaction.options.getNumber('preco'),
        imagemUrl: interaction.options.getString('imagem') || null,
      });
      await interaction.editReply({ content: `✅ Caixa **${interaction.options.getString('nome')}** criada!\nID: \`${id}\`` });
    }

    else if (sub === 'additem') {
      adicionarItem(interaction.options.getString('caixa_id'), {
        nome: interaction.options.getString('nome'),
        descricao: interaction.options.getString('descricao') || '',
        raridade: interaction.options.getString('raridade'),
        chance: interaction.options.getNumber('chance'),
        tipoPremio: interaction.options.getString('tipo'),
        premioId: interaction.options.getString('premio_id') || null,
        valor: interaction.options.getNumber('valor') || 0,
      });
      await interaction.editReply({ content: `✅ Item **${interaction.options.getString('nome')}** adicionado à caixa!` });
    }

    else if (sub === 'listar') {
      const caixas = listarCaixas();
      if (!caixas.length) return interaction.editReply({ content: '❌ Nenhuma caixa.' });
      const linhas = caixas.map(c => `🎁 **${c.nome}** — R$ ${c.preco.toFixed(2)} | ${c.vendas} abertas | ID: \`${c.id}\``);
      await interaction.editReply({ content: linhas.join('\n') });
    }
  },
};
