const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { Produtos, db } = require('../../database/database');
const { isLoja } = require('../../utils/permissions');
const { log } = require('../../utils/logger');
const { v4: uuidv4 } = require('uuid');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('produto')
    .setDescription('📦 Gerenciar produtos da loja')
    .addSubcommand(sub =>
      sub.setName('adicionar')
         .setDescription('➕ Adicionar produto')
         .addStringOption(o => o.setName('nome').setDescription('Nome do produto').setRequired(true))
         .addNumberOption(o => o.setName('preco').setDescription('Preço (R$)').setRequired(true).setMinValue(0.01))
         .addStringOption(o => o.setName('descricao').setDescription('Descrição').setRequired(false))
         .addStringOption(o => o.setName('categoria').setDescription('Categoria').setRequired(false))
         .addNumberOption(o => o.setName('preco_promo').setDescription('Preço promocional').setRequired(false).setMinValue(0))
         .addIntegerOption(o => o.setName('estoque').setDescription('Estoque (-1 = ilimitado)').setRequired(false).setMinValue(-1))
         .addStringOption(o => o.setName('tipo').setDescription('Tipo').addChoices({ name: 'Digital', value: 'digital' }, { name: 'Físico', value: 'fisico' }).setRequired(false))
         .addStringOption(o => o.setName('imagem').setDescription('URL da imagem').setRequired(false))
         .addBooleanOption(o => o.setName('destaque').setDescription('Produto em destaque?').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('editar')
         .setDescription('✏️ Editar produto existente')
         .addStringOption(o => o.setName('id').setDescription('ID do produto').setRequired(true))
         .addStringOption(o => o.setName('campo').setDescription('Campo').addChoices(
           { name: 'Nome', value: 'nome' }, { name: 'Preço', value: 'preco' },
           { name: 'Preço Promo', value: 'preco_promo' }, { name: 'Descrição', value: 'descricao' },
           { name: 'Estoque', value: 'estoque' }, { name: 'Imagem', value: 'imagem_url' },
         ).setRequired(true))
         .addStringOption(o => o.setName('valor').setDescription('Novo valor').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('remover')
         .setDescription('🗑️ Remover/desativar produto')
         .addStringOption(o => o.setName('id').setDescription('ID do produto').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('listar')
         .setDescription('📋 Listar todos os produtos')
         .addBooleanOption(o => o.setName('inativos').setDescription('Incluir inativos?').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('estoque_add')
         .setDescription('📥 Adicionar itens ao estoque digital')
         .addStringOption(o => o.setName('produto_id').setDescription('ID do produto').setRequired(true))
         .addStringOption(o => o.setName('conteudo').setDescription('Conteúdo (separado por ; para múltiplos)').setRequired(true))
    ),
  cooldown: 3,
  async execute(interaction) {
    if (!isLoja(interaction.member)) {
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    const sub = interaction.options.getSubcommand();

    if (sub === 'adicionar') {
      const dados = {
        nome: interaction.options.getString('nome'),
        preco: interaction.options.getNumber('preco'),
        descricao: interaction.options.getString('descricao') || '',
        categoria: interaction.options.getString('categoria') || 'Geral',
        precoPromo: interaction.options.getNumber('preco_promo') || null,
        estoque: interaction.options.getInteger('estoque') ?? -1,
        tipo: interaction.options.getString('tipo') || 'digital',
        imagemUrl: interaction.options.getString('imagem') || null,
        criadoPor: interaction.user.id,
      };

      const id = Produtos.criar(dados);
      if (interaction.options.getBoolean('destaque')) {
        Produtos.atualizar(id, { destaque: 1 });
      }

      await log('produto_adicionado', {
        executor: interaction.user.id,
        produto: dados.nome,
        valor: dados.preco,
        descricao: `Produto adicionado: ${dados.nome} (R$ ${dados.preco.toFixed(2)})`,
      });

      await interaction.editReply({ content: `✅ Produto **${dados.nome}** criado!\nID: \`${id}\`` });
    }

    else if (sub === 'editar') {
      const id = interaction.options.getString('id');
      const campo = interaction.options.getString('campo');
      const valor = interaction.options.getString('valor');
      const produto = Produtos.get(id);
      if (!produto) return interaction.editReply({ content: '❌ Produto não encontrado.' });

      const valorConv = ['preco', 'preco_promo', 'estoque'].includes(campo) ? parseFloat(valor) : valor;
      Produtos.atualizar(id, { [campo]: valorConv });

      await interaction.editReply({ content: `✅ **${produto.nome}** atualizado! \`${campo}\` = \`${valor}\`` });
    }

    else if (sub === 'remover') {
      const id = interaction.options.getString('id');
      const produto = Produtos.get(id);
      if (!produto) return interaction.editReply({ content: '❌ Produto não encontrado.' });
      Produtos.atualizar(id, { ativo: 0 });
      await interaction.editReply({ content: `✅ Produto **${produto.nome}** desativado.` });
    }

    else if (sub === 'listar') {
      const inativos = interaction.options.getBoolean('inativos') ?? false;
      const lista = Produtos.listar(null, !inativos);
      if (!lista.length) return interaction.editReply({ content: '📦 Nenhum produto encontrado.' });

      const linhas = lista.map(p =>
        `${p.ativo ? '✅' : '❌'} **${p.nome}** — R$ ${(p.preco_promo || p.preco).toFixed(2)} | Estoque: ${p.estoque === -1 ? '∞' : p.estoque} | ID: \`${p.id.slice(0,8)}\``
      );
      const blocos = [];
      for (let i = 0; i < linhas.length; i += 10) blocos.push(linhas.slice(i, i + 10).join('\n'));

      await interaction.editReply({ content: `📦 **Produtos (${lista.length}):**\n\n${blocos[0]}` });
    }

    else if (sub === 'estoque_add') {
      const produtoId = interaction.options.getString('produto_id');
      const conteudo = interaction.options.getString('conteudo');
      const produto = Produtos.get(produtoId);
      if (!produto) return interaction.editReply({ content: '❌ Produto não encontrado.' });

      const itens = conteudo.split(';').map(s => s.trim()).filter(Boolean);
      const stmt = db.prepare('INSERT INTO estoque_digital (id, produto_id, conteudo) VALUES (?,?,?)');
      const insAll = db.transaction(() => itens.forEach(i => stmt.run(uuidv4(), produtoId, i)));
      insAll();

      const total = db.prepare('SELECT COUNT(*) as c FROM estoque_digital WHERE produto_id=? AND usado=0').get(produtoId).c;
      Produtos.atualizar(produtoId, { estoque: total });

      await interaction.editReply({ content: `✅ **${itens.length}** item(ns) adicionado(s) ao estoque de **${produto.nome}**. Total disponível: ${total}` });
    }
  },
};
