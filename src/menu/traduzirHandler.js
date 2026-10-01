const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  EmbedBuilder,
} = require('discord.js');

const { IDIOMAS, traduzir } = require('./tradutor');

// ─── Row com botão 🌐 Traduzir ─────────────────────────────────────────────────
function rowTraduzir(tipo) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`traduzir_abrir_${tipo}`)
      .setLabel('🌐 Traduzir / Translate / Traducir')
      .setStyle(ButtonStyle.Secondary)
  );
}

// ─── Abre o menu de seleção de idioma ─────────────────────────────────────────
// Guarda o messageId da mensagem original no customId do select
async function abrirMenuIdiomas(interaction, tipo) {
  // interaction.message é a mensagem que contém o botão traduzir
  const msgId = interaction.message.id;

  const select = new StringSelectMenuBuilder()
    .setCustomId(`traduzir_idioma_${tipo}_${msgId}`)   // ← msgId embutido
    .setPlaceholder('Escolha o idioma...')
    .addOptions(
      IDIOMAS.map(i =>
        new StringSelectMenuOptionBuilder()
          .setLabel(i.label)
          .setValue(i.value)
      )
    );

  await interaction.reply({
    content: '🌐 Escolha o idioma para traduzir este conteúdo:',
    components: [new ActionRowBuilder().addComponents(select)],
    flags: 64,
  });
}

// ─── Processa a seleção do idioma e traduz o embed ────────────────────────────
async function processarTraducao(interaction) {
  // customId: traduzir_idioma_anuncio_<msgId>  ou  traduzir_idioma_sorteio_<msgId>
  const partes   = interaction.customId.split('_');
  // partes: ['traduzir', 'idioma', 'anuncio'|'sorteio', '<msgId>']
  const msgId    = partes[partes.length - 1];
  const langCode = interaction.values[0];

  const idiomaObj  = IDIOMAS.find(i => i.value === langCode);
  const nomeIdioma = idiomaObj?.label ?? langCode;

  // Busca a mensagem original pelo ID guardado no customId
  // Funciona tanto em canais de servidor quanto em DMs
  let embedOriginal = null;
  try {
    const msgOriginal = await interaction.message.channel.messages.fetch(msgId);
    if (msgOriginal?.embeds?.length) {
      embedOriginal = msgOriginal.embeds[0];
    }
  } catch { /* ignora */ }

  if (!embedOriginal) {
    return interaction.update({
      content: '❌ Não consegui encontrar o conteúdo original para traduzir.',
      components: [],
    });
  }

  await interaction.update({
    content: `⏳ Traduzindo para **${nomeIdioma}**...`,
    components: [],
  });

  try {
    // Traduz título e descrição em paralelo
    const [tituloTrad, descTrad] = await Promise.all([
      embedOriginal.title       ? traduzir(embedOriginal.title,       langCode) : Promise.resolve(null),
      embedOriginal.description ? traduzir(embedOriginal.description, langCode) : Promise.resolve(null),
    ]);

    // Traduz fields
    const fieldsTrad = [];
    for (const field of (embedOriginal.fields ?? [])) {
      const [nameTrad, valueTrad] = await Promise.all([
        traduzir(field.name,  langCode),
        traduzir(field.value, langCode),
      ]);
      fieldsTrad.push({ name: nameTrad || '\u200B', value: valueTrad || '\u200B', inline: field.inline });
    }

    // Traduz rodapé (só o texto, sem a parte "Traduzido para X")
    let rodapeTrad = embedOriginal.footer?.text ?? null;
    if (rodapeTrad) rodapeTrad = await traduzir(rodapeTrad, langCode);

    // Monta embed traduzido
    const embedTrad = new EmbedBuilder()
      .setColor(embedOriginal.color ?? 0xFFD700)
      .setTimestamp();

    if (tituloTrad)        embedTrad.setTitle(tituloTrad);
    if (descTrad)          embedTrad.setDescription(descTrad);
    if (fieldsTrad.length) embedTrad.setFields(fieldsTrad);
    if (embedOriginal.image?.url) embedTrad.setImage(embedOriginal.image.url);

    embedTrad.setFooter({
      text: rodapeTrad
        ? `${rodapeTrad} • 🌐 ${nomeIdioma}`
        : `🌐 Traduzido para ${nomeIdioma}`,
      iconURL: embedOriginal.footer?.iconURL ?? undefined,
    });

    await interaction.editReply({
      content: `🌐 **${nomeIdioma}** — só você está vendo esta tradução`,
      embeds: [embedTrad],
      components: [],
    });

  } catch (err) {
    console.error('Erro na tradução:', err);
    await interaction.editReply({
      content: '❌ Erro ao traduzir. Tente novamente em instantes.',
      components: [],
    });
  }
}

module.exports = { rowTraduzir, abrirMenuIdiomas, processarTraducao };
