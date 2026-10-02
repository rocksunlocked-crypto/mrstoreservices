const {
  SlashCommandBuilder,
} = require('discord.js');
const { isLoja, isAdmin } = require('../../utils/permissions');
const { abrirPainelBuilder } = require('../../systems/painelProduto');
const { db } = require('../../database/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('painel')
    .setDescription('🖼️ Gerenciar painéis de produto')
    .addSubcommand(sub =>
      sub.setName('criar')
         .setDescription('Criar painel de produto num canal')
         .addChannelOption(o =>
           o.setName('canal')
            .setDescription('Canal onde o painel será postado')
            .setRequired(false)
         )
    )
    .addSubcommand(sub =>
      sub.setName('sync-categorias')
         .setDescription('🔄 Sincroniza categorias dos produtos com as categorias do Discord')
    ),

  cooldown: 5,

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ── /painel criar ────────────────────────────────────────
    if (sub === 'criar') {
      if (!isLoja(interaction.member)) {
        return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      }
      const canal = interaction.options.getChannel('canal') || interaction.channel;
      return abrirPainelBuilder(interaction, canal);
    }

    // ── /painel sync-categorias ──────────────────────────────
    if (sub === 'sync-categorias') {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({ content: '❌ Apenas administradores podem sincronizar categorias.', ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      // Buscar todos os painéis com canal_id
      const paineis = db.prepare('SELECT * FROM paineis_canal WHERE produto_id IS NOT NULL').all();

      if (!paineis.length) {
        return interaction.editReply('⚠️ Nenhum painel registrado no banco.');
      }

      let atualizados = 0;
      let sem_categoria = 0;
      const log = [];

      for (const painel of paineis) {
        try {
          const canal = interaction.guild.channels.cache.get(painel.canal_id)
            || await interaction.client.channels.fetch(painel.canal_id).catch(() => null);

          if (!canal) {
            log.push(`⚠️ Canal \`${painel.canal_id}\` não encontrado — pulando`);
            sem_categoria++;
            continue;
          }

          const nomeCat = canal.parent?.name
            ? canal.parent.name.replace(/[^\w\s\-áàâãéèêíìîóòôõúùûçÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ]/g, '').trim()
            : null;

          if (!nomeCat) {
            log.push(`⚠️ Canal <#${canal.id}> não tem categoria pai — pulando`);
            sem_categoria++;
            continue;
          }

          // Atualizar produto
          db.prepare('UPDATE produtos SET categoria=?, atualizado_em=strftime(\'%s\',\'now\') WHERE id=?')
            .run(nomeCat, painel.produto_id);

          log.push(`✅ <#${canal.id}> → \`${nomeCat}\``);
          atualizados++;
        } catch (err) {
          log.push(`❌ Erro em painel \`${painel.id}\`: ${err.message}`);
        }
      }

      const resumo = [
        `**🔄 Sync concluído!**`,
        `✅ Atualizados: **${atualizados}**`,
        `⚠️ Sem categoria: **${sem_categoria}**`,
        `📦 Total de painéis: **${paineis.length}**`,
        ``,
        `**Log:**`,
        ...log.slice(0, 20), // evitar mensagem muito grande
        log.length > 20 ? `*(+${log.length - 20} mais...)*` : '',
      ].filter(l => l !== '').join('\n');

      return interaction.editReply(resumo);
    }
  },
};
