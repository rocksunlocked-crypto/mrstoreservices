const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const sessao   = require('./sorteioSessao');
const { encerrar, carregar, salvar, parseDuracao, sortearVencedores, rowBotoesSorteio } = require('./sorteioCore');
const { rowTraduzir } = require('./traduzirHandler');

const CANAL_SORTEIO_ID = '1530120769357746176';

// ─── Monta e envia/atualiza o sub-menu ───────────────────────────────────────
async function enviarSubMenu(interaction, editar = false) {
  const uid = interaction.user.id;
  const s   = sessao.obter(uid) ?? sessao.nova(uid);

  const ok  = (v) => v ? '✅' : '⬜';

  const embed = new EmbedBuilder()
    .setTitle('🎉 Configurar Sorteio')
    .setDescription('Preencha as seções abaixo e clique em **Publicar** quando estiver pronto.\n> Título, Prêmios e Duração são obrigatórios.')
    .setColor(0x5865F2)
    .addFields(
      { name: `${ok(s.titulo)}  Título / Descrição`, value: s.titulo ? `**${s.titulo}**\n${s.descricao ?? '_sem descrição_'}` : '_não definido_', inline: false },
      { name: `${ok(s.imagem)}  Imagem`,             value: s.imagem ? `[ver imagem](${s.imagem})` : '_não definida_',                              inline: true  },
      { name: `${ok(s.premios)} Prêmios`,            value: s.premios ? s.premios.split('\n').map((p,i) => `${i+1}. ${p}`).join('\n') : '_não definido_', inline: false },
      { name: `${ok(s.duracao)} Duração / Ganhadores`, value: s.duracao ? `**${s.duracao}** — **${s.qtdVenc}** ganhador(es)` : '_não definido_',    inline: true  },
      { name: `${ok(s.cargoPartic || s.convites || s.cargoPremio)} Critérios`,
        value: [
          s.cargoPartic ? `• Cargo participar: <@&${s.cargoPartic}>` : null,
          s.convites    ? `• Convites mínimos: **${s.convites}**`     : null,
          s.cargoPremio ? `• Cargo prêmio: <@&${s.cargoPremio}>`     : null,
        ].filter(Boolean).join('\n') || '_nenhum critério_',
        inline: false,
      },
    )
    .setFooter({ text: 'Sessão expira em 30 min de inatividade' });

  const podePub = sessao.podePublicar(uid);

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ss_titulo')    .setLabel('📝 Título e Descrição').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ss_imagem')    .setLabel('🖼️ Imagem')            .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ss_premios')   .setLabel('🎁 Prêmios')           .setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ss_duracao')   .setLabel('⏰ Duração e Ganhadores').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ss_criterios') .setLabel('📋 Critérios')           .setStyle(ButtonStyle.Secondary),
  );
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ss_publicar')
      .setLabel('🚀 Publicar Sorteio')
      .setStyle(podePub ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(!podePub),
    new ButtonBuilder().setCustomId('ss_finalizar')
      .setLabel('🏁 Finalizar Sorteio Ativo')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ss_cancelar')
      .setLabel('🗑️ Cancelar')
      .setStyle(ButtonStyle.Danger),
  );

  const payload = { embeds: [embed], components: [row1, row2, row3] };

  if (editar) return interaction.update(payload);
  return interaction.reply({ ...payload, flags: 64 });
}

// ─── Modals individuais ───────────────────────────────────────────────────────
async function modalTitulo(interaction) {
  const s = sessao.obter(interaction.user.id) ?? {};
  const modal = new ModalBuilder().setCustomId('sm_titulo').setTitle('📝 Título e Descrição');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('titulo').setLabel('Título do sorteio')
        .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(256)
        .setValue(s.titulo ?? '')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('descricao').setLabel('Descrição (opcional)')
        .setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1000)
        .setValue(s.descricao ?? '')
    ),
  );
  await interaction.showModal(modal);
}

async function modalImagem(interaction) {
  const s = sessao.obter(interaction.user.id) ?? {};
  const modal = new ModalBuilder().setCustomId('sm_imagem').setTitle('🖼️ Imagem do Sorteio');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('imagem').setLabel('URL da imagem (deixe vazio para remover)')
        .setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1000)
        .setPlaceholder('https://cdn.discordapp.com/...')
        .setValue(s.imagem ?? '')
    ),
  );
  await interaction.showModal(modal);
}

async function modalPremios(interaction) {
  const s = sessao.obter(interaction.user.id) ?? {};
  const modal = new ModalBuilder().setCustomId('sm_premios').setTitle('🎁 Prêmios');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('premios')
        .setLabel('Prêmios — 1 por linha, 1 por vencedor')
        .setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)
        .setPlaceholder('Nitro Classic — Código: XXXX\nNitro Classic — Código: YYYY')
        .setValue(s.premios ?? '')
    ),
  );
  await interaction.showModal(modal);
}

async function modalDuracao(interaction) {
  const s = sessao.obter(interaction.user.id) ?? {};
  const modal = new ModalBuilder().setCustomId('sm_duracao').setTitle('⏰ Duração e Ganhadores');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('duracao').setLabel('Duração (ex: 30m, 1h, 2h, 1d)')
        .setStyle(TextInputStyle.Short).setRequired(true)
        .setPlaceholder('1h')
        .setValue(s.duracao ?? '')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('qtdvenc').setLabel('Quantidade de ganhadores')
        .setStyle(TextInputStyle.Short).setRequired(false)
        .setPlaceholder('1')
        .setValue(s.qtdVenc ? String(s.qtdVenc) : '1')
    ),
  );
  await interaction.showModal(modal);
}

async function modalCriterios(interaction) {
  const s = sessao.obter(interaction.user.id) ?? {};
  const modal = new ModalBuilder().setCustomId('sm_criterios').setTitle('📋 Critérios');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('cargo_partic').setLabel('ID do cargo obrigatório para participar')
        .setStyle(TextInputStyle.Short).setRequired(false)
        .setPlaceholder('Deixe vazio para nenhum')
        .setValue(s.cargoPartic ?? '')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('convites').setLabel('Mínimo de convites para participar')
        .setStyle(TextInputStyle.Short).setRequired(false)
        .setPlaceholder('Deixe vazio ou 0 para nenhum')
        .setValue(s.convites ? String(s.convites) : '')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('cargo_premio').setLabel('ID do cargo dado ao vencedor')
        .setStyle(TextInputStyle.Short).setRequired(false)
        .setPlaceholder('Deixe vazio para nenhum')
        .setValue(s.cargoPremio ?? '')
    ),
  );
  await interaction.showModal(modal);
}

// ─── Processar modals ─────────────────────────────────────────────────────────
async function processarTitulo(interaction) {
  const titulo    = interaction.fields.getTextInputValue('titulo').trim();
  const descricao = interaction.fields.getTextInputValue('descricao').trim();
  sessao.atualizar(interaction.user.id, { titulo, descricao: descricao || null });
  await enviarSubMenu(interaction, true);
}

async function processarImagem(interaction) {
  const imagem = interaction.fields.getTextInputValue('imagem').trim() || null;
  if (imagem) {
    try { new URL(imagem); } catch {
      return interaction.reply({ content: '❌ URL inválida. Certifique-se que começa com `https://`', flags: 64 });
    }
  }
  sessao.atualizar(interaction.user.id, { imagem });
  await enviarSubMenu(interaction, true);
}

async function processarPremios(interaction) {
  const premios = interaction.fields.getTextInputValue('premios').trim();
  sessao.atualizar(interaction.user.id, { premios });
  await enviarSubMenu(interaction, true);
}

async function processarDuracao(interaction) {
  const durStr  = interaction.fields.getTextInputValue('duracao').trim();
  const qtdRaw  = interaction.fields.getTextInputValue('qtdvenc').trim();
  const qtdVenc = Math.max(1, parseInt(qtdRaw) || 1);

  if (!parseDuracao(durStr)) {
    return interaction.reply({ content: '❌ Duração inválida! Use: `30m`, `1h`, `2h`, `1d`, `3d`', flags: 64 });
  }
  sessao.atualizar(interaction.user.id, { duracao: durStr, qtdVenc });
  await enviarSubMenu(interaction, true);
}

async function processarCriterios(interaction) {
  const cargoPartic = interaction.fields.getTextInputValue('cargo_partic').trim() || null;
  const convitesRaw = interaction.fields.getTextInputValue('convites').trim();
  const cargoPremio = interaction.fields.getTextInputValue('cargo_premio').trim() || null;
  const convites    = Math.max(0, parseInt(convitesRaw) || 0);
  sessao.atualizar(interaction.user.id, { cargoPartic, cargoPremio, convites });
  await enviarSubMenu(interaction, true);
}

// ─── Publicar sorteio ─────────────────────────────────────────────────────────
async function publicar(interaction, client) {
  const uid = interaction.user.id;
  const s   = sessao.obter(uid);

  if (!sessao.podePublicar(uid)) {
    return interaction.reply({ content: '❌ Preencha pelo menos Título, Prêmios e Duração.', flags: 64 });
  }

  const duracaoMs = parseDuracao(s.duracao);
  const canal     = interaction.guild.channels.cache.get(CANAL_SORTEIO_ID);
  if (!canal) return interaction.reply({ content: '❌ Canal de sorteio não encontrado.', flags: 64 });

  const termino = Date.now() + duracaoMs;

  const criteriosTexto = [];
  if (s.cargoPartic) criteriosTexto.push(`• Ter o cargo <@&${s.cargoPartic}>`);
  if (s.convites)    criteriosTexto.push(`• Ter convidado pelo menos **${s.convites}** pessoa(s)`);

  const linhasPremio = s.premios.split('\n').map(l => l.trim()).filter(Boolean);

  const embed = new EmbedBuilder()
    .setTitle(`🎉 ${s.titulo}`)
    .setColor(0x5865F2)
    .addFields(
      { name: '⏰ Termina',    value: `<t:${Math.floor(termino / 1000)}:R>`, inline: true },
      { name: '🏆 Ganhadores', value: `${s.qtdVenc}`,                         inline: true },
      { name: '\u200B',        value: '\u200B',                                inline: true },
      {
        name: '📋 Critérios',
        value: criteriosTexto.length ? criteriosTexto.join('\n') : 'Nenhum — todos podem participar!',
      },
      {
        name: '🎁 Prêmio(s)',
        value: linhasPremio.length > 1
          ? linhasPremio.map((_, i) => `🥇 Prêmio ${i + 1}: **[entregue por DM]**`).join('\n')
          : '**[entregue por DM ao vencedor]**',
      },
    )
    .setTimestamp(termino)
    .setFooter({ text: `Criado por ${interaction.user.username}` });

  if (s.descricao) embed.setDescription(s.descricao);
  if (s.imagem)    embed.setImage(s.imagem);

  await interaction.deferUpdate();

  const msg = await canal.send({
    embeds: [embed],
    components: [rowBotoesSorteio('PLACEHOLDER', 0), rowTraduzir('sorteio')],
  });

  await msg.edit({
    components: [rowBotoesSorteio(msg.id, 0), rowTraduzir('sorteio')],
  });

  // Salva no JSON
  const sorteios = carregar();
  sorteios[msg.id] = {
    titulo:       s.titulo,
    premio:       s.premios,
    canalId:      canal.id,
    criadorId:    uid,
    termino,
    qtdVenc:      s.qtdVenc,
    cargoObrigId: s.cargoPartic,
    cargoPremiId: s.cargoPremio,
    convitesMin:  s.convites,
    participantes: [],
    encerrado:    false,
  };
  salvar(sorteios);

  // Agenda encerramento automático
  agendarEncerramento(msg.id, duracaoMs, client, interaction.guild);

  sessao.limpar(uid);

  await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setTitle('✅ Sorteio publicado!')
      .setDescription(`O sorteio **${s.titulo}** foi publicado em ${canal}!\n[Ver mensagem](${msg.url})`)
      .setColor(0x57F287)],
    components: [],
  });
}

// ─── Finalizar sorteio ativo ──────────────────────────────────────────────────
async function finalizarAtivo(interaction, client) {
  // Pega o sorteio mais recente ativo no canal de sorteios
  const sorteios = carregar();
  const ativos   = Object.entries(sorteios)
    .filter(([, s]) => !s.encerrado && s.canalId === CANAL_SORTEIO_ID)
    .sort(([, a], [, b]) => b.termino - a.termino); // mais recente primeiro

  if (!ativos.length) {
    return interaction.reply({ content: '❌ Nenhum sorteio ativo no canal de sorteios.', flags: 64 });
  }

  const [msgId] = ativos[0];
  await interaction.deferReply({ flags: 64 });
  await encerrar(msgId, client, interaction.guild);
  await interaction.editReply({ content: `✅ Sorteio \`${msgId}\` finalizado e prêmios entregues!` });
}

// ─── Cancelar sessão ──────────────────────────────────────────────────────────
async function cancelar(interaction) {
  sessao.limpar(interaction.user.id);
  await interaction.update({
    embeds: [new EmbedBuilder().setTitle('🗑️ Criação cancelada').setColor(0xED4245)],
    components: [],
  });
}

// ─── Agendar encerramento ─────────────────────────────────────────────────────
function agendarEncerramento(msgId, duracaoMs, client, guild) {
  const { carregar: c, salvar: sv } = require('./sorteioCore');
  if (duracaoMs > 2_147_483_647) {
    const iv = setInterval(async () => {
      const s = c()[msgId];
      if (!s || s.encerrado) { clearInterval(iv); return; }
      if (Date.now() >= s.termino) { clearInterval(iv); await encerrar(msgId, client, guild); }
    }, 60_000);
  } else {
    setTimeout(() => encerrar(msgId, client, guild), duracaoMs);
  }
}

module.exports = {
  enviarSubMenu,
  modalTitulo, modalImagem, modalPremios, modalDuracao, modalCriterios,
  processarTitulo, processarImagem, processarPremios, processarDuracao, processarCriterios,
  publicar, finalizarAtivo, cancelar,
};
