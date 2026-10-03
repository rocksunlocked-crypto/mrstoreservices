const { SlashCommandBuilder } = require('discord.js');
const { criarCupom, listarCupons, desativarCupom, deletarCupom, gerarCodigoCupom, embedCupom } = require('../../systems/cupons');
const { isLoja } = require('../../utils/permissions');
const { log } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cupom')
    .setDescription('🎟️ Gerenciar cupons de desconto')
    .setDefaultMemberPermissions('0')
    .addSubcommand(sub =>
      sub.setName('criar')
        .setDescription('➕ Criar novo cupom (recria se já existir com esse código)')
        .addStringOption(o => o.setName('tipo').setDescription('Tipo de desconto').setRequired(true)
          .addChoices({ name: '% Percentual', value: 'percentual' }, { name: 'R$ Fixo', value: 'fixo' }))
        .addNumberOption(o => o.setName('valor').setDescription('Valor do desconto').setRequired(true).setMinValue(0.01))
        .addStringOption(o => o.setName('codigo').setDescription('Código (gerado automaticamente se vazio)').setRequired(false))
        .addNumberOption(o => o.setName('min_compra').setDescription('Valor mínimo de compra').setRequired(false))
        .addIntegerOption(o => o.setName('usos').setDescription('Máximo de usos (padrão: 100)').setRequired(false).setMinValue(1))
        .addIntegerOption(o => o.setName('validade_dias').setDescription('Validade em dias (padrão: 30)').setRequired(false).setMinValue(1))
        .addNumberOption(o => o.setName('max_desconto').setDescription('Desconto máximo em R$ (para % com teto)').setRequired(false))
        .addStringOption(o => o.setName('prefixo').setDescription('Prefixo do código gerado automaticamente').setRequired(false))
        .addRoleOption(o => o.setName('cargo').setDescription('Restringir cupom a um cargo específico').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('listar')
        .setDescription('📋 Listar cupons ativos')
    )
    .addSubcommand(sub =>
      sub.setName('desativar')
        .setDescription('⏸️ Desativar cupom (pode ser reativado recriando com mesmo código)')
        .addStringOption(o => o.setName('codigo').setDescription('Código do cupom').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('deletar')
        .setDescription('🗑️ Deletar cupom permanentemente (libera o código para reutilização)')
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

    // ── Criar ─────────────────────────────────────────────────
    if (sub === 'criar') {
      const codigo = interaction.options.getString('codigo') ||
        gerarCodigoCupom(interaction.options.getString('prefixo') || '');
      const tipo   = interaction.options.getString('tipo');
      const valor  = interaction.options.getNumber('valor');
      const cargo  = interaction.options.getRole('cargo');

      criarCupom({
        codigo,
        tipo,
        valor,
        minCompra:    interaction.options.getNumber('min_compra')    || 0,
        maxDesconto:  interaction.options.getNumber('max_desconto')  || null,
        usosMax:      interaction.options.getInteger('usos')         || 100,
        validadeDias: interaction.options.getInteger('validade_dias') || 30,
        cargoId:      cargo?.id || null,
        criadoPor:    interaction.user.id,
      });

      await log('cupom_criado', {
        executor: interaction.user.id,
        descricao: `Cupom criado: ${codigo.toUpperCase()} — ${tipo} ${valor}${cargo ? ` | Cargo: ${cargo.name}` : ''}`,
      });

      const linhasCargo = cargo ? `\n🎭 Exclusivo para: <@&${cargo.id}>` : '';
      await interaction.editReply({
        content: [
          `✅ Cupom **\`${codigo.toUpperCase()}\`** criado com sucesso!`,
          `💰 Tipo: **${tipo}** | Valor: **${tipo === 'percentual' ? `${valor}%` : `R$ ${valor.toFixed(2)}`}**`,
          linhasCargo,
        ].filter(Boolean).join('\n'),
      });
    }

    // ── Listar ────────────────────────────────────────────────
    else if (sub === 'listar') {
      const cupons = listarCupons();
      if (!cupons.length) return interaction.editReply({ content: '❌ Nenhum cupom ativo.' });

      const linhas = cupons.map(c => {
        const val   = c.tipo === 'percentual' ? `${c.valor}%` : `R$ ${c.valor}`;
        const exp   = c.validade ? new Date(c.validade * 1000).toLocaleDateString('pt-BR') : '∞';
        const cargo = c.cargo_id ? ` | <@&${c.cargo_id}>` : '';
        return `🎟️ \`${c.codigo}\` — ${val} | ${c.usos_atual}/${c.usos_max} usos | Exp: ${exp}${cargo}`;
      });

      await interaction.editReply({ content: `**🎟️ Cupons Ativos (${cupons.length}):**\n\n${linhas.join('\n')}` });
    }

    // ── Desativar (soft delete) ────────────────────────────────
    else if (sub === 'desativar') {
      const codigo = interaction.options.getString('codigo').toUpperCase();
      const res = desativarCupom(codigo);
      if (!res.changes) return interaction.editReply({ content: `❌ Cupom \`${codigo}\` não encontrado.` });
      await interaction.editReply({
        content: `⏸️ Cupom **\`${codigo}\`** desativado.\n> Para reativar, use \`/cupom criar\` com o mesmo código.`,
      });
    }

    // ── Deletar (hard delete) ─────────────────────────────────
    else if (sub === 'deletar') {
      const codigo = interaction.options.getString('codigo').toUpperCase();
      const { db } = require('../../database/database');
      const existe = db.prepare('SELECT id FROM cupons WHERE codigo = ?').get(codigo);
      if (!existe) return interaction.editReply({ content: `❌ Cupom \`${codigo}\` não encontrado.` });

      deletarCupom(codigo);
      await interaction.editReply({
        content: `🗑️ Cupom **\`${codigo}\`** deletado permanentemente.\n> O código está livre para ser reutilizado.`,
      });
    }

    // ── Info ──────────────────────────────────────────────────
    else if (sub === 'info') {
      const { db } = require('../../database/database');
      const cupom = db.prepare('SELECT * FROM cupons WHERE codigo = ?').get(
        interaction.options.getString('codigo').toUpperCase()
      );
      if (!cupom) return interaction.editReply({ content: '❌ Cupom não encontrado.' });
      await interaction.editReply({ embeds: [embedCupom(cupom)] });
    }
  },
};
