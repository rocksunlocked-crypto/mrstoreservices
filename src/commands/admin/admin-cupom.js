const { SlashCommandBuilder } = require('discord.js');
const { criarCupom, listarCupons, desativarCupom, gerarCodigoCupom, embedCupom } = require('../../systems/cupons');
const { isLoja } = require('../../utils/permissions');
const { log } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cupom')
    .setDescription('🎟️ Gerenciar cupons de desconto')
    .addSubcommand(sub =>
      sub.setName('criar')
         .setDescription('➕ Criar novo cupom')
         .addStringOption(o => o.setName('tipo').setDescription('Tipo de desconto').addChoices({ name: '% Percentual', value: 'percentual' }, { name: 'R$ Fixo', value: 'fixo' }).setRequired(true))
         .addNumberOption(o => o.setName('valor').setDescription('Valor do desconto').setRequired(true).setMinValue(0.01))
         .addStringOption(o => o.setName('codigo').setDescription('Código (gerado automaticamente se vazio)').setRequired(false))
         .addNumberOption(o => o.setName('min_compra').setDescription('Valor mínimo de compra').setRequired(false))
         .addIntegerOption(o => o.setName('usos').setDescription('Máximo de usos').setRequired(false).setMinValue(1))
         .addIntegerOption(o => o.setName('validade_dias').setDescription('Validade em dias').setRequired(false).setMinValue(1))
         .addNumberOption(o => o.setName('max_desconto').setDescription('Desconto máximo (para %)').setRequired(false))
         .addStringOption(o => o.setName('prefixo').setDescription('Prefixo do código gerado').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('listar')
         .setDescription('📋 Listar cupons ativos')
    )
    .addSubcommand(sub =>
      sub.setName('desativar')
         .setDescription('🗑️ Desativar cupom')
         .addStringOption(o => o.setName('codigo').setDescription('Código do cupom').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('info')
         .setDescription('ℹ️ Ver detalhes de um cupom')
         .addStringOption(o => o.setName('codigo').setDescription('Código do cupom').setRequired(true))
    ),
  cooldown: 3,
  async execute(interaction) {
    if (!isLoja(interaction.member)) {
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    const sub = interaction.options.getSubcommand();

    if (sub === 'criar') {
      const codigo = interaction.options.getString('codigo') ||
        gerarCodigoCupom(interaction.options.getString('prefixo') || '');
      const tipo = interaction.options.getString('tipo');
      const valor = interaction.options.getNumber('valor');

      const id = criarCupom({
        codigo,
        tipo,
        valor,
        minCompra: interaction.options.getNumber('min_compra') || 0,
        maxDesconto: interaction.options.getNumber('max_desconto') || null,
        usosMax: interaction.options.getInteger('usos') || 100,
        validadeDias: interaction.options.getInteger('validade_dias') || 30,
        criadoPor: interaction.user.id,
      });

      await log('cupom_criado', {
        executor: interaction.user.id,
        cupom: codigo,
        valor: tipo === 'percentual' ? `${valor}%` : `R$ ${valor}`,
        descricao: `Cupom criado: ${codigo} — ${tipo} ${valor}`,
      });

      await interaction.editReply({ content: `✅ Cupom **\`${codigo}\`** criado!\nTipo: ${tipo} | Valor: ${tipo === 'percentual' ? `${valor}%` : `R$ ${valor}`}` });
    }

    else if (sub === 'listar') {
      const cupons = listarCupons();
      if (!cupons.length) return interaction.editReply({ content: '❌ Nenhum cupom ativo.' });

      const linhas = cupons.map(c => {
        const val = c.tipo === 'percentual' ? `${c.valor}%` : `R$ ${c.valor}`;
        const exp = c.validade ? new Date(c.validade * 1000).toLocaleDateString('pt-BR') : '∞';
        return `🎟️ \`${c.codigo}\` — ${val} | ${c.usos_atual}/${c.usos_max} usos | Exp: ${exp}`;
      });

      await interaction.editReply({ content: `**🎟️ Cupons Ativos (${cupons.length}):**\n\n${linhas.join('\n')}` });
    }

    else if (sub === 'desativar') {
      const codigo = interaction.options.getString('codigo');
      const res = desativarCupom(codigo);
      if (!res.changes) return interaction.editReply({ content: '❌ Cupom não encontrado.' });
      await interaction.editReply({ content: `✅ Cupom **\`${codigo.toUpperCase()}\`** desativado.` });
    }

    else if (sub === 'info') {
      const { db } = require('../../database/database');
      const cupom = db.prepare('SELECT * FROM cupons WHERE codigo = ?').get(interaction.options.getString('codigo').toUpperCase());
      if (!cupom) return interaction.editReply({ content: '❌ Cupom não encontrado.' });
      await interaction.editReply({ embeds: [embedCupom(cupom)] });
    }
  },
};
