const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const {
  add2FAAccount,
  remove2FAAccount,
  list2FAAccounts,
  generate2FACode,
  generateAll2FACodes,
} = require('../../2fa');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('2fa')
    .setDescription('🔐 Gerar códigos TOTP para suas contas')
    .addSubcommand(sub => sub
      .setName('add')
      .setDescription('💾 Salvar uma conta 2FA no bot')
      .addStringOption(option => option.setName('nome').setDescription('Nome da conta').setRequired(true))
      .addStringOption(option => option.setName('secret').setDescription('Chave secreta Base32').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('gerar')
      .setDescription('🔑 Gerar o código atual de uma conta salva')
      .addStringOption(option => option.setName('nome').setDescription('Nome da conta salva').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('todos')
      .setDescription('📋 Gerar códigos de todas as contas salvas')
    )
    .addSubcommand(sub => sub
      .setName('listar')
      .setDescription('📚 Listar contas 2FA salvas')
    )
    .addSubcommand(sub => sub
      .setName('remover')
      .setDescription('🗑️ Remover uma conta 2FA salva')
      .addStringOption(option => option.setName('nome').setDescription('Nome da conta salva').setRequired(true))
    ),
  cooldown: 5,

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === 'add') {
        const nome = interaction.options.getString('nome').trim();
        const secret = interaction.options.getString('secret').trim();

        add2FAAccount(interaction.user.id, nome, secret);

        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('✅ Conta 2FA salva')
            .setDescription(`A conta **${nome}** foi salva com sucesso.\nAgora você pode usar **/2fa gerar nome:${nome}** para obter o código.`)
            .setTimestamp()],
        });
      }

      if (subcommand === 'listar') {
        const contas = list2FAAccounts(interaction.user.id);

        if (!contas.length) {
          return interaction.reply({
            embeds: [new EmbedBuilder()
              .setColor(0x5865F2)
              .setTitle('📚 Contas 2FA salvas')
              .setDescription('Você ainda não salvou nenhuma conta 2FA.\nUse **/2fa add** para adicionar uma.')],
          });
        }

        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`📚 Contas 2FA salvas (${contas.length})`)
            .setDescription(contas.map((conta) => `• ${conta}`).join('\n'))],
        });
      }

      if (subcommand === 'gerar') {
        const nome = interaction.options.getString('nome').trim();
        const codigo = generate2FACode(interaction.user.id, nome);

        return interaction.reply({
          content: `🔐 Código da conta **${codigo.label}**\n\n\`\`\`\n${codigo.token}\n\`\`\`\n\n⏳ Expira em: **${codigo.remaining}s**`,
        });
      }

      if (subcommand === 'todos') {
        const contas = list2FAAccounts(interaction.user.id);

        if (!contas.length) {
          return interaction.reply({
            embeds: [new EmbedBuilder()
              .setColor(0x5865F2)
              .setTitle('📋 Todos os códigos 2FA')
              .setDescription('Você ainda não salvou nenhuma conta 2FA.\nUse **/2fa add** para adicionar uma.')],
          });
        }

        const codigos = generateAll2FACodes(interaction.user.id);
        const fields = codigos.map(c => ({
          name: `🔑 ${c.label}`,
          value: `\`${c.token}\` • expira em ${c.remaining}s`,
          inline: false,
        }));

        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(0x9B59B6)
            .setTitle(`📋 Códigos 2FA (${codigos.length})`)
            .addFields(fields)
            .setTimestamp()],
        });
      }

      if (subcommand === 'remover') {
        const nome = interaction.options.getString('nome').trim();
        remove2FAAccount(interaction.user.id, nome);

        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('🗑️ Conta 2FA removida')
            .setDescription(`A conta **${nome}** foi removida da sua lista.`)
            .setTimestamp()],
        });
      }

      return interaction.reply({ content: '❌ Subcomando inválido.' });
    } catch (error) {
      console.error('[2FA Command]', error);
      return interaction.reply({
        content: `❌ ${error.message}`,
      });
    }
  },
};
