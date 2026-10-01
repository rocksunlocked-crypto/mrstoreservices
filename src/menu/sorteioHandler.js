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

const fs   = require('fs');
const path = require('path');

const CANAL_SORTEIO_ID = '1530120769357746176';

function carregar() {
  if (!fs.existsSync(ARQUIVO)) return {};
  try { return JSON.parse(fs.readFileSync(ARQUIVO, 'utf-8')); } catch { return {}; }
}
function salvar(dados) {
  const dir = path.dirname(ARQUIVO);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(ARQUIVO, JSON.stringify(dados, null, 2));
}

function parseDuracao(str) {
  const m = str.match(/^(\d+)(s|m|h|d)$/i);
  if (!m) return null;
  const mult = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return parseInt(m[1]) * mult[m[2].toLowerCase()];
}

function sortearVencedores(lista, qtd) {
  return [...lista].sort(() => Math.random() - 0.5).slice(0, Math.min(qtd, lista.length));
}

// ─── Monta os dois botões: Participar + Participantes (contador) ──────────────
function rowBotoesSorteio(msgId, qtdParticipantes) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`sorteio_participar_${msgId}`)
      .setLabel('🎟️ Participar')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`sorteio_participantes_${msgId}`)
      .setLabel(`👥 ${qtdParticipantes} participante(s)`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),   // só informativo, não clicável
  );
}

// ─── Abre modal de criação de sorteio ─────────────────────────────────────────
async function abrirModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('modal_sorteio')
    .setTitle('🎉 Criar Sorteio');

  modal.addComponents(
    // Campo 1 — duração
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('sorteio_duracao')
        .setLabel('Duração do sorteio')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('30m, 1h, 2h, 1d, 3d...')
    ),
    // Campo 2 — título
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('sorteio_titulo')
        .setLabel('Título do sorteio')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(256)
        .setRequired(true)
    ),
    // Campo 3 — prêmio(s): cada linha = 1 prêmio
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('sorteio_premio')
        .setLabel('Prêmio(s) — 1 por linha, 1 por vencedor')
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(1000)
        .setRequired(true)
        .setPlaceholder('Nitro Classic — Código: XXXX\nNitro Classic — Código: YYYY')
    ),
    // Campo 4 — imagem + critérios de participação
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('sorteio_config')
        .setLabel('Configurações (opcional)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setPlaceholder('imagem:https://...\ncargo_participar:ID\nconvites:3')
    ),
    // Campo 5 — vencedores + cargo prêmio
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('sorteio_extras')
        .setLabel('Vencedores e cargo (opcional)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('vencedores:2 | cargo_premio:ID')
    ),
  );

  await interaction.showModal(modal);
}

// ─── Processa o modal do sorteio ──────────────────────────────────────────────
async function processarModal(interaction, client) {
  const durStr   = interaction.fields.getTextInputValue('sorteio_duracao').trim();
  const titulo   = interaction.fields.getTextInputValue('sorteio_titulo').trim();
  const premio   = interaction.fields.getTextInputValue('sorteio_premio').trim();
  const config   = interaction.fields.getTextInputValue('sorteio_config').trim();
  const extras   = interaction.fields.getTextInputValue('sorteio_extras').trim();

  // ── Canal fixo ────────────────────────────────────────────────────────────
  const canal = interaction.guild.channels.cache.get(CANAL_SORTEIO_ID);
  if (!canal) {
    return interaction.reply({ content: `❌ Canal de sorteio não encontrado. Verifique o ID configurado.`, flags: 64 });
  }

  const duracaoMs = parseDuracao(durStr);
  if (!duracaoMs) {
    return interaction.reply({ content: '❌ Duração inválida! Use: `30m`, `1h`, `2h`, `1d`, `3d` etc.', flags: 64 });
  }

  // ── Parseia campo config (imagem, cargo_participar, convites) ─────────────
  let cargoParticId = null;
  let convitesMin   = 0;
  let imagem        = null;

  for (const linha of config.split('\n')) {
    const sepIdx = linha.indexOf(':');
    if (sepIdx === -1) continue;
    const chave = linha.slice(0, sepIdx).trim().toLowerCase();
    const val   = linha.slice(sepIdx + 1).trim();
    if (!val) continue;
    switch (chave) {
      case 'imagem':           imagem        = val; break;
      case 'cargo_participar': cargoParticId = val; break;
      case 'cargo':            cargoParticId = val; break;
      case 'convites':         convitesMin   = parseInt(val) || 0; break;
    }
  }

  // ── Parseia campo extras (vencedores, cargo_premio) — formato livre ───────
  let qtdVenc      = 1;
  let cargoPremiId = null;

  // Suporta "vencedores:2 | cargo_premio:ID" ou linhas separadas
  const partesExtras = extras.replace(/\|/g, '\n').split('\n');
  for (const parte of partesExtras) {
    const sepIdx = parte.indexOf(':');
    if (sepIdx === -1) continue;
    const chave = parte.slice(0, sepIdx).trim().toLowerCase();
    const val   = parte.slice(sepIdx + 1).trim();
    if (!val) continue;
    switch (chave) {
      case 'vencedores':   qtdVenc      = Math.max(1, parseInt(val) || 1); break;
      case 'cargo_premio': cargoPremiId = val; break;
    }
  }

  const termino = Date.now() + duracaoMs;

  // ── Critérios legíveis no embed ───────────────────────────────────────────
  const criteriosTexto = [];
  if (cargoParticId) criteriosTexto.push(`• Ter o cargo <@&${cargoParticId}>`);
  if (convitesMin)   criteriosTexto.push(`• Ter convidado pelo menos **${convitesMin}** pessoa(s)`);

  // ── Prêmios: cada linha = 1 prêmio ────────────────────────────────────────
  const linhasPremio = premio.split('\n').map(l => l.trim()).filter(Boolean);

  // ── Embed ─────────────────────────────────────────────────────────────────
  const embed = new EmbedBuilder()
    .setTitle(`🎉 ${titulo}`)
    .setColor(0x5865F2)
    .addFields(
      { name: '⏰ Termina',      value: `<t:${Math.floor(termino / 1000)}:R>`, inline: true },
      { name: '🏆 Vencedores',   value: `${qtdVenc}`,                          inline: true },
      { name: '\u200B',          value: '\u200B',                               inline: true },
      {
        name: '📋 Critérios',
        value: criteriosTexto.length ? criteriosTexto.join('\n') : 'Nenhum — todos podem participar!',
      },
      {
        name: '🎁 Prêmio(s)',
        // Mostra os prêmios mas ofusca o conteúdo — entregue por DM
        value: linhasPremio.length > 1
          ? linhasPremio.map((_, i) => `🥇 Prêmio ${i + 1}: **[entregue por DM]**`).join('\n')
          : '**[entregue por DM ao vencedor]**',
      }
    )
    .setTimestamp(termino)
    .setFooter({ text: `Criado por ${interaction.user.username}` });

  if (imagem && /^https?:\/\/.+/i.test(imagem)) embed.setImage(imagem);

  await interaction.deferReply({ flags: 64 });

  const msg = await canal.send({
    embeds: [embed],
    components: [
      rowBotoesSorteio('PLACEHOLDER', 0),
      rowTraduzir('sorteio'),
    ],
  });

  await msg.edit({
    components: [
      rowBotoesSorteio(msg.id, 0),
      rowTraduzir('sorteio'),
    ],
  });

  // Salva
  const sorteios = carregar();
  sorteios[msg.id] = {
    titulo,
    premio,           // string original com as linhas
    canalId: canal.id,
    criadorId: interaction.user.id,
    termino,
    qtdVenc,
    cargoObrigId:  cargoParticId,
    cargoPremiId,
    convitesMin,
    participantes: [],
    encerrado: false,
  };
  salvar(sorteios);

  agendarEncerramento(msg.id, duracaoMs, client, interaction.guild);

  await interaction.editReply({ content: `✅ Sorteio criado em ${canal}! [Ver mensagem](${msg.url})` });
}

// ─── Botão Participar ─────────────────────────────────────────────────────────
async function participar(interaction) {
  const msgId    = interaction.customId.replace('sorteio_participar_', '');
  const sorteios = carregar();
  const s        = sorteios[msgId];

  if (!s || s.encerrado || Date.now() > s.termino) {
    return interaction.reply({ content: '❌ Este sorteio já foi encerrado.', flags: 64 });
  }
  if (s.participantes.includes(interaction.user.id)) {
    return interaction.reply({ content: '⚠️ Você já está participando!', flags: 64 });
  }

  const member = interaction.member;

  // Critério: cargo obrigatório
  if (s.cargoObrigId && !member.roles.cache.has(s.cargoObrigId)) {
    return interaction.reply({
      content: `❌ Você precisa ter o cargo <@&${s.cargoObrigId}> para participar!`,
      flags: 64,
    });
  }

  // Critério: convites mínimos
  if (s.convitesMin > 0) {
    let total = 0;
    try {
      const invs = await interaction.guild.invites.fetch();
      invs.forEach(inv => {
        if (inv.inviter?.id === interaction.user.id) total += inv.uses || 0;
      });
    } catch {
      return interaction.reply({ content: '❌ Não consegui verificar seus convites. Tente novamente.', flags: 64 });
    }
    if (total < s.convitesMin) {
      return interaction.reply({
        content: `❌ Você precisa ter convidado pelo menos **${s.convitesMin}** pessoa(s).\nSeus convites: **${total}**`,
        flags: 64,
      });
    }
  }

  s.participantes.push(interaction.user.id);
  salvar(sorteios);

  // Atualiza embed + botão contador
  try {
    const msg    = await interaction.channel.messages.fetch(msgId);
    const novaEm = EmbedBuilder.from(msg.embeds[0]);

    // Mantém os outros componentes (traduzir) e troca só o row dos botões
    const outrasRows = msg.components.filter(r =>
      !r.components.some(c => c.customId?.startsWith('sorteio_participar_') || c.customId?.startsWith('sorteio_participantes_'))
    );

    await msg.edit({
      embeds: [novaEm],
      components: [
        rowBotoesSorteio(msgId, s.participantes.length),
        ...outrasRows,
      ],
    });
  } catch { /* ignora */ }

  return interaction.reply({ content: '🎟️ Inscrito! Boa sorte! 🍀', flags: 64 });
}

// ─── Encerrar sorteio ─────────────────────────────────────────────────────────
async function encerrar(msgId, client, guild) {
  const sorteios = carregar();
  const s = sorteios[msgId];
  if (!s || s.encerrado) return;

  s.encerrado = true;
  salvar(sorteios);

  const canal = guild.channels.cache.get(s.canalId);
  if (!canal) return;

  let msg;
  try { msg = await canal.messages.fetch(msgId); } catch { return; }

  // Sem participantes
  if (!s.participantes.length) {
    await msg.edit({
      embeds: [new EmbedBuilder()
        .setTitle(`🎉 ${s.titulo} — ENCERRADO`)
        .setDescription('😢 Ninguém participou.')
        .setColor(0x95A5A6).setTimestamp()],
      components: [],
    });
    return;
  }

  const vencedores = sortearVencedores(s.participantes, s.qtdVenc);
  const mencoes    = vencedores.map(id => `<@${id}>`).join(', ');

  // Atualiza embed de encerramento
  await msg.edit({
    embeds: [new EmbedBuilder()
      .setTitle(`🎉 ${s.titulo} — ENCERRADO`)
      .setDescription(`🏆 **Vencedor(es):** ${mencoes}\n\n**${s.participantes.length}** participantes.`)
      .setColor(0xFFD700).setTimestamp()
      .setFooter({ text: 'Sorteio encerrado' })],
    components: [],
  });

  await canal.send({ content: `🎊 Parabéns ${mencoes}! Vocês venceram **${s.titulo}**!` });

  // ── Entrega prêmio e cargo para cada vencedor ─────────────────────────────
  // Cada linha do campo prêmio = 1 prêmio. Distribui em ordem pelos vencedores.
  const linhasPremio = s.premio
    ? s.premio.split('\n').map(l => l.trim()).filter(Boolean)
    : [];

  for (let i = 0; i < vencedores.length; i++) {
    const vencedorId = vencedores[i];

    // Se só tem 1 vencedor → manda todas as linhas juntas
    // Se tem múltiplos vencedores → 1 linha por vencedor (última repetida se faltar)
    const premioVencedor = vencedores.length === 1
      ? linhasPremio.join('\n') || '—'
      : (linhasPremio[i] ?? linhasPremio[linhasPremio.length - 1] ?? '—');

    // Envia prêmio por DM
    try {
      const usuario = await client.users.fetch(vencedorId);
      await usuario.send({
        embeds: [new EmbedBuilder()
          .setTitle(`🎁 Você ganhou o sorteio: ${s.titulo}!`)
          .setDescription(`Parabéns! Aqui está o seu prêmio:\n\n${premioVencedor}`)
          .setColor(0xFFD700)
          .setTimestamp()
          .setFooter({ text: `Servidor: ${guild.name}` })
        ],
      });
    } catch {
      canal.send({ content: `⚠️ Não consegui enviar o prêmio por DM para <@${vencedorId}>. Entre em contato com um administrador.` }).catch(() => {});
    }

    // Adiciona cargo do prêmio silenciosamente (sem anunciar no embed)
    if (s.cargoPremiId) {
      try {
        const member = await guild.members.fetch(vencedorId);
        await member.roles.add(s.cargoPremiId, `Venceu o sorteio: ${s.titulo}`);
      } catch (err) {
        console.error(`[Sorteio] Erro ao adicionar cargo ao vencedor ${vencedorId}:`, err.message);
      }
    }
  }
}

function agendarEncerramento(msgId, duracaoMs, client, guild) {
  if (duracaoMs > 2_147_483_647) {
    const iv = setInterval(async () => {
      const s = carregar()[msgId];
      if (!s || s.encerrado) { clearInterval(iv); return; }
      if (Date.now() >= s.termino) { clearInterval(iv); await encerrar(msgId, client, guild); }
    }, 60_000);
  } else {
    setTimeout(() => encerrar(msgId, client, guild), duracaoMs);
  }
}

module.exports = { abrirModal, processarModal, participar, encerrar, carregar, salvar };
