const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
} = require('discord.js');

const { rowTraduzir } = require('./traduzirHandler');

// ─── Abre o modal de anúncio ──────────────────────────────────────────────────
async function abrirModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('modal_anuncio')
    .setTitle('📢 Criar Anúncio');

  modal.addComponents(
    // Campo 1 — canal
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('anuncio_canal')
        .setLabel('ID do canal de destino')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: 1234567890123456789')
        .setRequired(true)
    ),
    // Campo 2 — título
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('anuncio_titulo')
        .setLabel('Título')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(256)
        .setRequired(true)
    ),
    // Campo 3 — conteúdo
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('anuncio_assunto')
        .setLabel('Conteúdo / descrição')
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(2000)
        .setRequired(true)
    ),
    // Campo 4 — URL da imagem (campo Paragraph aceita URLs longas)
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('anuncio_imagem')
        .setLabel('URL da imagem (opcional)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setPlaceholder('https://cdn.discordapp.com/...')
        .setMaxLength(1000)
    ),
    // Campo 5 — botões de link + cor
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('anuncio_botoes')
        .setLabel('Botões e cor (opcional)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setPlaceholder(
          'Nome -> https://link.com\nNome -> https://link2.com\ncor:#FF5733'
        )
    ),
  );

  await interaction.showModal(modal);
}

// ─── Processa o modal enviado ─────────────────────────────────────────────────
async function processarModal(interaction) {
  const canalId   = interaction.fields.getTextInputValue('anuncio_canal').trim();
  const titulo    = interaction.fields.getTextInputValue('anuncio_titulo').trim();
  const assunto   = interaction.fields.getTextInputValue('anuncio_assunto').trim();
  const imagemRaw = interaction.fields.getTextInputValue('anuncio_imagem').trim();
  const botoesRaw = interaction.fields.getTextInputValue('anuncio_botoes').trim();

  const canal = interaction.guild.channels.cache.get(canalId);
  if (!canal || canal.type !== ChannelType.GuildText) {
    return interaction.reply({
      content: `❌ Canal \`${canalId}\` não encontrado ou não é um canal de texto.`,
      flags: 64,
    });
  }

  // ── Imagem: usa direto, sem regex complicado ──────────────────────────────
  const imagem = imagemRaw || null;

  // ── Parseia cor e botões do campo combinado ───────────────────────────────
  let cor = 0xFFD700;
  const botoesLink = [];

  if (botoesRaw) {
    const linhas = botoesRaw.split('\n').map(l => l.trim()).filter(Boolean);

    for (const linha of linhas) {
      // Linha de cor: cor:#RRGGBB
      if (/^cor:/i.test(linha)) {
        const hex = linha.replace(/^cor:/i, '').trim();
        try { cor = parseInt(hex.replace('#', ''), 16); } catch { /* padrão */ }
        continue;
      }

      // Linha de botão: Nome -> URL
      const sepIdx = linha.indexOf('->');
      if (sepIdx === -1) continue;

      const nome = linha.slice(0, sepIdx).trim();
      let   url  = linha.slice(sepIdx + 2).trim();

      if (!nome || !url.startsWith('http')) continue;

      // Valida URL e limite de 512 chars
      try { new URL(url); } catch { continue; }
      if (url.length > 512) {
        console.warn(`[Anúncio] URL do botão muito longa (${url.length} chars), ignorada.`);
        continue;
      }

      if (botoesLink.length >= 3) continue;

      botoesLink.push(
        new ButtonBuilder()
          .setLabel(nome.slice(0, 80))
          .setURL(url)
          .setStyle(ButtonStyle.Link)
      );
    }
  }

  // ── Monta embed ───────────────────────────────────────────────────────────
  const embed = new EmbedBuilder()
    .setTitle(titulo)
    .setDescription(assunto)
    .setColor(cor)
    .setTimestamp()
    .setFooter({
      text: `Anúncio por ${interaction.user.username}`,
      iconURL: interaction.user.displayAvatarURL(),
    });

  if (imagem) {
    console.log(`[Anúncio] setImage: ${imagem}`);
    embed.setImage(imagem);
  }

  // ── Monta componentes ─────────────────────────────────────────────────────
  const components = [];
  if (botoesLink.length > 0) {
    components.push(new ActionRowBuilder().addComponents(...botoesLink));
  }
  components.push(rowTraduzir('anuncio'));

  // ── Envia ─────────────────────────────────────────────────────────────────
  try {
    await canal.send({ content: '@everyone', embeds: [embed], components });
    await interaction.reply({
      content: `✅ Anúncio enviado em ${canal}!`,
      flags: 64,
    });
  } catch (err) {
    console.error('Erro ao enviar anúncio:', err.message, err.code, JSON.stringify(err.rawError ?? {}));
    await interaction.reply({
      content: `❌ Erro: \`${err.message}\``,
      flags: 64,
    });
  }
}

// ─── Abre modal de EDIÇÃO de anúncio já publicado ────────────────────────────
async function abrirModalEdicao(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('modal_editar_anuncio')
    .setTitle('✏️ Editar Anúncio');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('editar_canal_id')
        .setLabel('ID do canal onde está o anúncio')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: 1234567890123456789')
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('editar_msg_id')
        .setLabel('ID da mensagem do anúncio')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Clique direito na mensagem → Copiar ID')
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('editar_titulo')
        .setLabel('Novo título (deixe vazio para manter)')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(256)
        .setRequired(false)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('editar_descricao')
        .setLabel('Nova descrição (deixe vazio para manter)')
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(2000)
        .setRequired(false)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('editar_imagem')
        .setLabel('Nova URL de imagem (deixe vazio para manter)')
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(1000)
        .setRequired(false)
        .setPlaceholder('https://cdn.discordapp.com/...')
    ),
  );

  await interaction.showModal(modal);
}

// ─── Processa o modal de edição ───────────────────────────────────────────────
async function processarEdicao(interaction) {
  const canalId  = interaction.fields.getTextInputValue('editar_canal_id').trim();
  const msgId    = interaction.fields.getTextInputValue('editar_msg_id').trim();
  const novoTit  = interaction.fields.getTextInputValue('editar_titulo').trim();
  const novaDesc = interaction.fields.getTextInputValue('editar_descricao').trim();
  const novaImg  = interaction.fields.getTextInputValue('editar_imagem').trim();

  // Defer IMEDIATAMENTE — antes de qualquer fetch ou operação async
  await interaction.deferReply({ flags: 64 });

  // Busca o canal
  const canal = interaction.guild.channels.cache.get(canalId);
  if (!canal) {
    return interaction.editReply({ content: `❌ Canal \`${canalId}\` não encontrado.` });
  }

  // Busca a mensagem
  let msg;
  try {
    msg = await canal.messages.fetch(msgId);
  } catch {
    return interaction.editReply({ content: `❌ Mensagem \`${msgId}\` não encontrada no canal.` });
  }

  if (!msg.embeds.length) {
    return interaction.editReply({ content: '❌ Essa mensagem não tem embed para editar.' });
  }

  // Valida imagem antes de clonar o embed
  if (novaImg) {
    try {
      new URL(novaImg);
      if (!novaImg.startsWith('http')) throw new Error();
    } catch {
      return interaction.editReply({
        content: `❌ URL de imagem inválida: \`${novaImg.slice(0, 100)}\`\nCertifique-se que começa com \`https://\``,
      });
    }
  }

  // Clona o embed original e aplica só o que foi preenchido
  const embedNovo = EmbedBuilder.from(msg.embeds[0]);
  if (novoTit)  embedNovo.setTitle(novoTit);
  if (novaDesc) embedNovo.setDescription(novaDesc);
  if (novaImg)  {
    console.log(`[Editar Anúncio] setImage: ${novaImg}`);
    embedNovo.setImage(novaImg);
  }

  try {
    await msg.edit({ embeds: [embedNovo], components: msg.components });
    await interaction.editReply({ content: '✅ Anúncio editado com sucesso!' });
  } catch (err) {
    console.error('Erro ao editar anúncio:', err.message);
    await interaction.editReply({ content: `❌ Erro ao editar: \`${err.message}\`` });
  }
}

module.exports = { abrirModal, processarModal, abrirModalEdicao, processarEdicao };
