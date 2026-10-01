const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../../database/database');
const { isAceitarCompra } = require('../../utils/permissions');

function localizarRegistro(tabela, valor, campo = 'id') {
  const termo = String(valor || '').trim();
  if (!termo) return null;

  const exato = db.prepare(`SELECT * FROM ${tabela} WHERE ${campo}=?`).get(termo);
  if (exato) return exato;

  const linhas = db.prepare(`SELECT * FROM ${tabela}`).all();
  return linhas.find(linha => String(linha[campo]).toLowerCase().startsWith(termo.toLowerCase())) || null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gg')
    .setDescription('📤 Envia um produto manualmente para um usuário ou para o canal atual')
    .addStringOption(option =>
      option
        .setName('produto_id')
        .setDescription('ID ou primeiros 8 caracteres do produto')
        .setRequired(true),
    )
    .addStringOption(option =>
      option
        .setName('variante_id')
        .setDescription('ID ou primeiros 8 caracteres da variante')
        .setRequired(true),
    )
    .addUserOption(option =>
      option
        .setName('usuario')
        .setDescription('Usuário destinatário (opcional)')
        .setRequired(false),
    )
    .addIntegerOption(option =>
      option
        .setName('quantidade')
        .setDescription('Quantidade a enviar (opcional)')
        .setMinValue(1)
        .setMaxValue(20)
        .setRequired(false),
    )
    .addStringOption(option =>
      option
        .setName('motivo')
        .setDescription('Motivo do envio (opcional)')
        .setRequired(false),
    ),

  cooldown: 5,

  async execute(interaction) {
    if (!isAceitarCompra(interaction.member)) {
      return interaction.reply({ content: '❌ Apenas o cargo de aceitar compra pode usar este comando.', ephemeral: true });
    }

    const produtoId = interaction.options.getString('produto_id');
    const varianteId = interaction.options.getString('variante_id');
    const usuario = interaction.options.getUser('usuario');
    const quantidade = Math.max(1, interaction.options.getInteger('quantidade') || 1);
    const motivo = interaction.options.getString('motivo')?.trim() || 'Envio manual pelo admin';

    await interaction.deferReply({ ephemeral: true });

    const produto = localizarRegistro('produtos', produtoId);
    if (!produto) {
      return interaction.editReply({ content: '❌ Produto não encontrado.' });
    }

    if (produto.ativo !== 1 && produto.ativo !== '1') {
      return interaction.editReply({ content: `❌ Produto **${produto.nome}** está inativo.` });
    }

    const variante = localizarRegistro('variantes_produto', varianteId);
    if (!variante) {
      return interaction.editReply({ content: '❌ Variante não encontrada.' });
    }

    if (variante.produto_id !== produto.id) {
      return interaction.editReply({ content: '❌ A variante informada não pertence ao produto informado.' });
    }

    if (variante.ativo !== 1 && variante.ativo !== '1') {
      return interaction.editReply({ content: `❌ Variante **${variante.nome}** está inativa.` });
    }

    const estoqueDisponivel = db.prepare(
      'SELECT COUNT(*) as c FROM estoque_variante WHERE variante_id=? AND usado=0',
    ).get(variante.id).c;

    if (estoqueDisponivel < quantidade) {
      return interaction.editReply({
        content: `⚠️ Estoque insuficiente para **${produto.nome} / ${variante.nome}**. Disponível: ${estoqueDisponivel}.`,
      });
    }

    const itens = [];
    for (let i = 0; i < quantidade; i++) {
      const item = db.prepare(
        'SELECT * FROM estoque_variante WHERE variante_id=? AND usado=0 LIMIT 1',
      ).get(variante.id);

      if (!item) break;

      db.prepare(
        "UPDATE estoque_variante SET usado=1, usado_por=?, usado_em=strftime('%s','now') WHERE id=?",
      ).run(interaction.user.id, item.id);

      itens.push(item.conteudo);
    }

    if (!itens.length) {
      return interaction.editReply({ content: '❌ Sem estoque disponível para esta variante.' });
    }

    const conteudo = itens.join('\n');
    const embedProduto = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle(`📦 ${produto.nome}`)
      .setDescription([
        motivo ? `> 📝 ${motivo}` : '',
        '',
        `**Variante:** ${variante.nome}`,
        `**Quantidade:** ${itens.length}`,
      ].filter(Boolean).join('\n'))
      .addFields({
        name: '🎁 Produto',
        value: `\`\`\`\n${conteudo.slice(0, 900)}\n\`\`\``,
      })
      .setTimestamp()
      .setFooter({ text: `Enviado por ${interaction.user.username} • Máximo Store` });

    if (usuario) {
      const membro = await interaction.guild.members.fetch(usuario.id).catch(() => null);
      if (!membro) {
        return interaction.editReply({ content: `❌ Usuário \`${usuario.id}\` não encontrado no servidor.` });
      }

      const enviado = await membro.send({ embeds: [embedProduto] }).catch(() => null);
      if (!enviado) {
        return interaction.editReply({
          content: `❌ Não foi possível enviar DM para <@${usuario.id}> (DMs fechadas).`,
        });
      }

      return interaction.editReply({
        content: `✅ **${itens.length}x ${produto.nome} — ${variante.nome}** enviado para <@${usuario.id}>!`,
      });
    }

    const canal = interaction.channel;
    if (!canal) {
      return interaction.editReply({ content: '❌ Canal não encontrado.' });
    }

    await canal.send({ embeds: [embedProduto] }).catch(() => {});

    return interaction.editReply({
      content: `✅ **${itens.length}x ${produto.nome} — ${variante.nome}** enviado em <#${canal.id}>!`,
    });
  },
};
