const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const fs   = require('fs');
const path = require('path');
const { rowTraduzir }          = require('./traduzirHandler');
const { registrarAprovacao }   = require('./avaliacaoStats');
const { log }                  = require('./logsHandler');

// ─── IDs ──────────────────────────────────────────────────────────────────────
const CANAL_PUBLICO    = '1544558778261835846';
const CANAL_MODERACAO  = '1529713273912426716';

// ─── Arquivos de dados ────────────────────────────────────────────────────────
const ARQ_BLOQUEADOS  = path.join(__dirname, '../data/bloqueados_avaliacao.json');
const ARQ_PAINEL_ID   = path.join(__dirname, '../data/painel_avaliacao.json');

function carregarBloqueados() {
  if (!fs.existsSync(ARQ_BLOQUEADOS)) return [];
  try { return JSON.parse(fs.readFileSync(ARQ_BLOQUEADOS, 'utf-8')); } catch { return []; }
}
function salvarBloqueados(lista) {
  const dir = path.dirname(ARQ_BLOQUEADOS);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(ARQ_BLOQUEADOS, JSON.stringify(lista, null, 2));
}

function carregarPainelId() {
  if (!fs.existsSync(ARQ_PAINEL_ID)) return null;
  try { return JSON.parse(fs.readFileSync(ARQ_PAINEL_ID, 'utf-8')).messageId ?? null; } catch { return null; }
}
function salvarPainelId(messageId) {
  const dir = path.dirname(ARQ_PAINEL_ID);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(ARQ_PAINEL_ID, JSON.stringify({ messageId }, null, 2));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function estrelas(n) {
  const num = Math.min(5, Math.max(1, parseInt(n) || 1));
  return '⭐'.repeat(num) + '☆'.repeat(5 - num) + ` (${num}/5)`;
}

// ─── Embed do painel público ──────────────────────────────────────────────────
function embedPainel() {
  return new EmbedBuilder()
    .setTitle('⭐  Avaliações de Clientes')
    .setDescription(
      '> Veja o que nossos clientes estão dizendo sobre os produtos e serviços.\n\n' +
      '**Comprou algo? Deixe sua avaliação!**\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      '`1` — Clique em **⭐ Avaliar** abaixo\n' +
      '`2` — Escolha o produto, a nota (1-5) e descreva\n' +
      '`3` — Sua avaliação será revisada e publicada aqui\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      '*Avaliações falsas ou ofensivas serão removidas.*'
    )
    .setColor(0xFFD700)
    .setFooter({ text: 'Mr. Chefe • Sistema de Avaliações Verificadas ✅' })
    .setTimestamp();
}

function rowPainel() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('aval_abrir_modal')
      .setLabel('⭐ Avaliar')
      .setStyle(ButtonStyle.Primary),
  );
}

// ─── Envia / renova o painel público ──────────────────────────────────────────
async function renovarPainel(client) {
  const guild = client.guilds.cache.find(g => g.channels.cache.has(CANAL_PUBLICO));
  if (!guild) return;

  const canal = guild.channels.cache.get(CANAL_PUBLICO);
  if (!canal) return;

  // Deleta o painel antigo se existir
  const idAntigo = carregarPainelId();
  if (idAntigo) {
    try {
      const msgAntiga = await canal.messages.fetch(idAntigo);
      await msgAntiga.delete();
    } catch { /* já foi deletada */ }
  }

  // Envia novo painel
  const msg = await canal.send({ embeds: [embedPainel()], components: [rowPainel()] });
  salvarPainelId(msg.id);
  console.log(`[Avaliação] Painel renovado: ${msg.id}`);
}

// ─── Inicia o ciclo de renovação (10 min) ────────────────────────────────────
function iniciarCiclo(client) {
  // Primeira vez imediatamente
  renovarPainel(client).catch(console.error);
  // Depois a cada 10 minutos
  setInterval(() => renovarPainel(client).catch(console.error), 10 * 60 * 1000);
}

// ─── Abre o modal de avaliação ────────────────────────────────────────────────
async function abrirModal(interaction) {
  const bloqueados = carregarBloqueados();
  if (bloqueados.includes(interaction.user.id)) {
    return interaction.reply({
      content: '🚫 Você foi bloqueado de enviar avaliações.',
      flags: 64,
    });
  }

  const modal = new ModalBuilder()
    .setCustomId('modal_avaliacao')
    .setTitle('⭐ Avaliar Produto / Serviço');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('aval_produto')
        .setLabel('Produto ou serviço avaliado')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100)
        .setPlaceholder('Ex: Nitro Classic, Conta Premium...')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('aval_estrelas')
        .setLabel('Estrelas (1 a 5)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(1)
        .setPlaceholder('1, 2, 3, 4 ou 5')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('aval_comentario')
        .setLabel('Comentário (mínimo 3 caracteres)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMinLength(3)
        .setMaxLength(500)
        .setPlaceholder('Descreva sua experiência...')
    ),
  );

  await interaction.showModal(modal);
}

// ─── Processa o modal de avaliação ───────────────────────────────────────────
async function processarModal(interaction) {
  await interaction.deferReply({ flags: 64 });

  const produto    = interaction.fields.getTextInputValue('aval_produto').trim();
  const estRelRaw  = interaction.fields.getTextInputValue('aval_estrelas').trim();
  const comentario = interaction.fields.getTextInputValue('aval_comentario').trim();

  const nota = Math.min(5, Math.max(1, parseInt(estRelRaw) || 0));
  if (!nota) {
    return interaction.editReply({ content: '❌ Estrelas inválidas! Use um número de 1 a 5.' });
  }

  // Embed para moderação
  const embedMod = new EmbedBuilder()
    .setTitle('📋 Nova Avaliação Pendente')
    .setDescription(`**${comentario}**`)
    .setColor(0xFEE75C)
    .addFields(
      { name: '🛍️ Produto',  value: produto,                     inline: true },
      { name: '⭐ Nota',     value: estrelas(nota),               inline: true },
      { name: '👤 Usuário',  value: `<@${interaction.user.id}>`, inline: true },
      { name: '🆔 User ID',  value: `\`${interaction.user.id}\``, inline: true },
      { name: '📅 Enviado',  value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
    )
    .setThumbnail(interaction.user.displayAvatarURL())
    .setFooter({ text: 'Use os botões para aprovar, negar ou bloquear o usuário' })
    .setTimestamp();

  const rowMod = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`aval_aprovar_${interaction.user.id}_${nota}_${encodeURIComponent(produto)}_${encodeURIComponent(comentario)}`)
      .setLabel('✅ Aprovar')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`aval_negar_${interaction.user.id}`)
      .setLabel('❌ Negar')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`aval_bloquear_${interaction.user.id}`)
      .setLabel('🚫 Bloquear usuário')
      .setStyle(ButtonStyle.Danger),
  );

  // Busca o canal de moderação
  const guild       = interaction.guild;
  const canalMod    = guild.channels.cache.get(CANAL_MODERACAO);
  if (!canalMod) {
    return interaction.editReply({ content: '❌ Canal de moderação não configurado.' });
  }

  await canalMod.send({ embeds: [embedMod], components: [rowMod] });
  await interaction.editReply({
    content: '✅ Avaliação enviada para revisão! Você será notificado quando for aprovada.',
  });
}

// ─── Aprovar avaliação ────────────────────────────────────────────────────────
async function aprovar(interaction) {
  // customId: aval_aprovar_<userId>_<nota>_<produto>_<comentario>
  const partes    = interaction.customId.split('_');
  // partes[0]=aval partes[1]=aprovar partes[2]=userId partes[3]=nota partes[4]=produto partes[5..]=comentario
  const userId    = partes[2];
  const nota      = parseInt(partes[3]);
  const produto   = decodeURIComponent(partes[4]);
  const comentario = decodeURIComponent(partes.slice(5).join('_'));

  await interaction.deferReply({ flags: 64 });

  const guild       = interaction.guild;
  const canalPublico = guild.channels.cache.get(CANAL_PUBLICO);
  if (!canalPublico) {
    return interaction.editReply({ content: '❌ Canal público não encontrado.' });
  }

  // Busca o usuário
  let user;
  try { user = await interaction.client.users.fetch(userId); } catch { user = null; }

  const embedPublico = new EmbedBuilder()
    .setTitle(`${['', '⭐', '⭐⭐', '⭐⭐⭐', '⭐⭐⭐⭐', '⭐⭐⭐⭐⭐'][nota]}  ${produto}`)
    .setDescription(
      `> *"${comentario}"*\n\n` +
      `${'⭐'.repeat(nota)}${'☆'.repeat(5 - nota)}  **${nota}/5**`
    )
    .setColor(nota === 5 ? 0xFFD700 : nota === 4 ? 0x57F287 : nota === 3 ? 0x5865F2 : nota === 2 ? 0xFEE75C : 0xED4245)
    .addFields(
      { name: '👤 Cliente',    value: user ? `<@${userId}>` : `\`${userId}\``, inline: true },
      { name: '🛍️ Produto',   value: `**${produto}**`,                         inline: true },
      { name: '✅ Verificado', value: 'Avaliação aprovada',                     inline: true },
    )
    .setThumbnail(user?.displayAvatarURL({ size: 256 }) ?? null)
    .setFooter({
      text: `Aprovado por ${interaction.user.username} • ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}`,
      iconURL: interaction.user.displayAvatarURL(),
    })
    .setTimestamp();

  await canalPublico.send({ embeds: [embedPublico], components: [rowTraduzir('avaliacao')] });

  // Registra nas estatísticas
  registrarAprovacao(produto, nota);

  // Log
  log(interaction.client, interaction.guild, 'avaliacao_aprovada', {
    acao: 'Avaliação Aprovada',
    responsavel: `<@${interaction.user.id}>`,
    alvo: `<@${userId}>`,
    detalhes: `**Produto:** ${produto}\n**Nota:** ${'⭐'.repeat(nota)} (${nota}/5)\n**Comentário:** ${comentario}`,
  });

  // Edita a mensagem de moderação para indicar aprovação
  const embedAtualizado = EmbedBuilder.from(interaction.message.embeds[0])
    .setTitle('✅ Avaliação Aprovada')
    .setColor(0x57F287)
    .setFooter({ text: `Aprovado por ${interaction.user.username}` });

  await interaction.message.edit({ embeds: [embedAtualizado], components: [] });
  await interaction.editReply({ content: '✅ Avaliação aprovada e publicada!' });
}

// ─── Negar avaliação ──────────────────────────────────────────────────────────
async function negar(interaction) {
  const userId = interaction.customId.replace('aval_negar_', '');

  await interaction.deferReply({ flags: 64 });

  // Tenta notificar o usuário por DM
  try {
    const user = await interaction.client.users.fetch(userId);
    await user.send({
      embeds: [new EmbedBuilder()
        .setTitle('❌ Avaliação Recusada')
        .setDescription('Sua avaliação foi recusada pela equipe de moderação.\n\nCertifique-se de enviar avaliações honestas e relevantes.')
        .setColor(0xED4245)
        .setTimestamp()],
    });
  } catch { /* DMs fechadas */ }

  const embedAtualizado = EmbedBuilder.from(interaction.message.embeds[0])
    .setTitle('❌ Avaliação Negada')
    .setColor(0xED4245)
    .setFooter({ text: `Negado por ${interaction.user.username}` });

  await interaction.message.edit({ embeds: [embedAtualizado], components: [] });
  await interaction.editReply({ content: '✅ Avaliação negada.' });

  log(interaction.client, interaction.guild, 'avaliacao_negada', {
    acao: 'Avaliação Negada',
    responsavel: `<@${interaction.user.id}>`,
    alvo: `<@${userId}>`,
  });
}

// ─── Bloquear usuário de avaliar ──────────────────────────────────────────────
async function bloquear(interaction) {
  const userId = interaction.customId.replace('aval_bloquear_', '');

  await interaction.deferReply({ flags: 64 });

  const lista = carregarBloqueados();
  if (!lista.includes(userId)) {
    lista.push(userId);
    salvarBloqueados(lista);
  }

  // Notifica o usuário
  try {
    const user = await interaction.client.users.fetch(userId);
    await user.send({
      embeds: [new EmbedBuilder()
        .setTitle('🚫 Bloqueado de Avaliar')
        .setDescription('Você foi bloqueado de enviar avaliações neste servidor.')
        .setColor(0x000000)
        .setTimestamp()],
    });
  } catch { /* DMs fechadas */ }

  const embedAtualizado = EmbedBuilder.from(interaction.message.embeds[0])
    .setTitle('🚫 Usuário Bloqueado + Avaliação Negada')
    .setColor(0x000000)
    .setFooter({ text: `Bloqueado por ${interaction.user.username}` });

  await interaction.message.edit({ embeds: [embedAtualizado], components: [] });
  await interaction.editReply({ content: `✅ Usuário \`${userId}\` bloqueado de enviar avaliações.` });

  log(interaction.client, interaction.guild, 'avaliacao_bloqueio', {
    acao: 'Usuário Bloqueado de Avaliar',
    responsavel: `<@${interaction.user.id}>`,
    alvo: `<@${userId}>`,
  });
}

module.exports = {
  iniciarCiclo,
  abrirModal,
  processarModal,
  aprovar,
  negar,
  bloquear,
};
