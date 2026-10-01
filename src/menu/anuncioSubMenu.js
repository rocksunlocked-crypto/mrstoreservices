const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType,
} = require('discord.js');

const sessao          = require('./anuncioSessao');
const { rowTraduzir } = require('./traduzirHandler');
const { podeDM }      = require('./anuncioSessao');

// ─── Anúncio DM ativo (em memória — enviado para novos membros) ───────────────
let anuncioDMAtivo = null; // { embed, ativadoPor, ativadoEm }

function getAnuncioDMAtivo() { return anuncioDMAtivo; }
function limparAnuncioDMAtivo() { anuncioDMAtivo = null; }

function infoBtn(b) {
  if (!b) return '_não configurado_';
  return `**${b.nome}**\n${b.url.length > 50 ? b.url.slice(0, 50) + '...' : b.url}`;
}

// ─── Sub-menu ─────────────────────────────────────────────────────────────────
async function enviarSubMenu(interaction, editar = false) {
  const uid = interaction.user.id;
  const s   = sessao.obter(uid) ?? sessao.nova(uid);
  const ok  = v => v ? '✅' : '⬜';

  const embed = new EmbedBuilder()
    .setTitle('📢 Configurar Anúncio')
    .setDescription(
      'Preencha as seções e clique em **Publicar** quando estiver pronto.\n' +
      '> Canal e Título são obrigatórios. O resto é opcional.'
    )
    .setColor(s.cor ? parseInt(s.cor.replace('#', ''), 16) : 0x5865F2)
    .addFields(
      { name: `${ok(s.canal)} Canal`,      value: s.canal     ? `<#${s.canal}>` : '_não definido_',                                                      inline: true  },
      { name: `${ok(s.titulo)} Título`,    value: s.titulo    ? `**${s.titulo}**` : '_não definido_',                                                    inline: true  },
      { name: `${ok(s.cor)} Cor`,          value: s.cor       ? `\`${s.cor}\`` : '_padrão #FFD700_',                                                     inline: true  },
      { name: `${ok(s.descricao)} Conteúdo`, value: s.descricao ? s.descricao.slice(0, 80) + (s.descricao.length > 80 ? '...' : '') : '_não definido_', inline: false },
      { name: `${ok(s.imagem)} Imagem`,    value: s.imagem    ? `[ver imagem](${s.imagem})` : '_não definida_',                                          inline: true  },
      { name: `${ok(s.botao1)} Botão 1`,   value: infoBtn(s.botao1), inline: true },
      { name: `${ok(s.botao2)} Botão 2`,   value: infoBtn(s.botao2), inline: true },
      { name: `${ok(s.botao3)} Botão 3`,   value: infoBtn(s.botao3), inline: true },
      { name: `${ok(s.botao4)} Botão 4`,   value: infoBtn(s.botao4), inline: true },
      { name: `${ok(s.botao5)} Botão 5`,   value: infoBtn(s.botao5), inline: true },
    )
    .setFooter({ text: 'Sessão expira em 30 min de inatividade' });

  if (s.imagem) embed.setThumbnail(s.imagem);

  const podePub = sessao.podePublicar(uid);

  // Row 1: configurações principais
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('an_canal')    .setLabel('📡 Canal')        .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('an_titulo')   .setLabel('✏️ Título e Cor') .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('an_conteudo') .setLabel('📝 Conteúdo')     .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('an_imagem')   .setLabel('🖼️ Imagem')       .setStyle(ButtonStyle.Secondary),
  );

  // Row 2: 5 botões de link
  const row2 = new ActionRowBuilder().addComponents(
    ...[1,2,3,4,5].map(n =>
      new ButtonBuilder()
        .setCustomId(`an_botao${n}`)
        .setLabel(`🔗 Botão ${n}`)
        .setStyle(s[`botao${n}`] ? ButtonStyle.Success : ButtonStyle.Secondary)
    )
  );

  // Row 3: publicar e cancelar
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('an_publicar')
      .setLabel('🚀 Publicar Anúncio')
      .setStyle(podePub ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(!podePub),
    new ButtonBuilder().setCustomId('an_dm')
      .setLabel('📨 Enviar por DM')
      .setStyle(podeDM(uid) ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(!podeDM(uid)),
    new ButtonBuilder().setCustomId('an_cancelar')
      .setLabel('🗑️ Cancelar')
      .setStyle(ButtonStyle.Danger),
  );

  const payload = { embeds: [embed], components: [row1, row2, row3] };
  if (editar) return interaction.update(payload);
  return interaction.reply({ ...payload, flags: 64 });
}

// ─── Modals ───────────────────────────────────────────────────────────────────
async function modalCanal(interaction) {
  const s = sessao.obter(interaction.user.id) ?? {};
  const modal = new ModalBuilder().setCustomId('anm_canal').setTitle('📡 Canal de Destino');
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId('canal_id').setLabel('ID do canal de destino')
      .setStyle(TextInputStyle.Short).setRequired(true)
      .setPlaceholder('Ex: 1234567890123456789').setValue(s.canal ?? '')
  ));
  await interaction.showModal(modal);
}

async function modalTitulo(interaction) {
  const s = sessao.obter(interaction.user.id) ?? {};
  const modal = new ModalBuilder().setCustomId('anm_titulo').setTitle('✏️ Título e Cor');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('titulo').setLabel('Título do anúncio')
        .setStyle(TextInputStyle.Short).setMaxLength(256).setRequired(true).setValue(s.titulo ?? '')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('cor').setLabel('Cor em hex (opcional, padrão: #FFD700)')
        .setStyle(TextInputStyle.Short).setRequired(false)
        .setPlaceholder('#FFD700').setValue(s.cor ?? '')
    ),
  );
  await interaction.showModal(modal);
}

async function modalConteudo(interaction) {
  const s = sessao.obter(interaction.user.id) ?? {};
  const modal = new ModalBuilder().setCustomId('anm_conteudo').setTitle('📝 Conteúdo do Anúncio');
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId('descricao').setLabel('Conteúdo / descrição (opcional)')
      .setStyle(TextInputStyle.Paragraph).setMaxLength(2000).setRequired(false)
      .setValue(s.descricao ?? '')
  ));
  await interaction.showModal(modal);
}

async function modalImagem(interaction) {
  const s = sessao.obter(interaction.user.id) ?? {};
  const modal = new ModalBuilder().setCustomId('anm_imagem').setTitle('🖼️ Imagem do Anúncio');
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId('imagem').setLabel('URL da imagem (vazio = remover)')
      .setStyle(TextInputStyle.Paragraph).setMaxLength(512).setRequired(false)
      .setPlaceholder('https://cdn.discordapp.com/...').setValue(s.imagem ?? '')
  ));
  await interaction.showModal(modal);
}

async function modalBotao(interaction, num) {
  const s = sessao.obter(interaction.user.id) ?? {};
  const b = s[`botao${num}`] ?? {};
  const modal = new ModalBuilder().setCustomId(`anm_botao${num}`).setTitle(`🔗 Botão ${num}`);
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('nome').setLabel('Nome do botão')
        .setStyle(TextInputStyle.Short).setMaxLength(80).setRequired(true)
        .setPlaceholder('Ex: Entrar no servidor').setValue(b.nome ?? '')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('url').setLabel('Link (URL)')
        .setStyle(TextInputStyle.Paragraph).setMaxLength(512).setRequired(true)
        .setPlaceholder('https://...').setValue(b.url ?? '')
    ),
  );
  await interaction.showModal(modal);
}

// ─── Processadores ────────────────────────────────────────────────────────────
async function processarCanal(interaction) {
  const canalId = interaction.fields.getTextInputValue('canal_id').trim();
  const canal   = interaction.guild.channels.cache.get(canalId);
  if (!canal || canal.type !== ChannelType.GuildText) {
    return interaction.reply({ content: `❌ Canal \`${canalId}\` não encontrado.`, flags: 64 });
  }
  sessao.atualizar(interaction.user.id, { canal: canalId });
  await enviarSubMenu(interaction, true);
}

async function processarTitulo(interaction) {
  const titulo = interaction.fields.getTextInputValue('titulo').trim();
  const corRaw = interaction.fields.getTextInputValue('cor').trim();
  let cor = null;
  if (corRaw) {
    const hex = corRaw.replace('#', '');
    if (/^[0-9a-fA-F]{3,6}$/.test(hex)) cor = `#${hex}`;
  }
  sessao.atualizar(interaction.user.id, { titulo, cor: cor ?? sessao.obter(interaction.user.id)?.cor ?? null });
  await enviarSubMenu(interaction, true);
}

async function processarConteudo(interaction) {
  const descricao = interaction.fields.getTextInputValue('descricao').trim() || null;
  sessao.atualizar(interaction.user.id, { descricao });
  await enviarSubMenu(interaction, true);
}

async function processarImagem(interaction) {
  const imagem = interaction.fields.getTextInputValue('imagem').trim() || null;
  if (imagem) { try { new URL(imagem); } catch { return interaction.reply({ content: '❌ URL inválida.', flags: 64 }); } }
  sessao.atualizar(interaction.user.id, { imagem });
  await enviarSubMenu(interaction, true);
}

async function processarBotao(interaction, num) {
  const nome = interaction.fields.getTextInputValue('nome').trim();
  const url  = interaction.fields.getTextInputValue('url').trim();
  try { new URL(url); } catch { return interaction.reply({ content: '❌ URL inválida.', flags: 64 }); }
  if (url.length > 512) return interaction.reply({ content: '❌ URL muito longa (máx 512 chars).', flags: 64 });
  sessao.atualizar(interaction.user.id, { [`botao${num}`]: { nome, url } });
  await enviarSubMenu(interaction, true);
}

// ─── Publicar ─────────────────────────────────────────────────────────────────
async function publicar(interaction) {
  const uid = interaction.user.id;
  const s   = sessao.obter(uid);
  if (!sessao.podePublicar(uid)) return interaction.reply({ content: '❌ Preencha Canal e Título.', flags: 64 });

  const canal = interaction.guild.channels.cache.get(s.canal);
  if (!canal) return interaction.reply({ content: '❌ Canal não encontrado.', flags: 64 });

  let cor = 0xFFD700;
  if (s.cor) { try { cor = parseInt(s.cor.replace('#', ''), 16); } catch {} }

  const embed = new EmbedBuilder()
    .setTitle(s.titulo)
    .setColor(cor)
    .setTimestamp()
    .setFooter({ text: `Anúncio por ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() });

  if (s.descricao) embed.setDescription(s.descricao);
  if (s.imagem)    embed.setImage(s.imagem);

  // Monta botões de link (até 5 numa row)
  const botoesLink = [];
  for (let n = 1; n <= 5; n++) {
    const b = s[`botao${n}`];
    if (!b?.nome || !b?.url) continue;
    botoesLink.push(new ButtonBuilder().setLabel(b.nome.slice(0, 80)).setURL(b.url).setStyle(ButtonStyle.Link));
  }

  const components = [];
  if (botoesLink.length) components.push(new ActionRowBuilder().addComponents(...botoesLink));
  components.push(rowTraduzir('anuncio'));

  await interaction.deferUpdate();

  try {
    await canal.send({ content: '@everyone', embeds: [embed], components });
    sessao.limpar(uid);
    await interaction.editReply({
      embeds: [new EmbedBuilder().setTitle('✅ Anúncio Publicado!').setDescription(`Enviado em ${canal}!`).setColor(0x57F287)],
      components: [],
    });
  } catch (err) {
    console.error('Erro ao publicar anúncio:', err.message);
    await interaction.editReply({ content: `❌ Erro: \`${err.message}\``, embeds: [], components: [] });
  }
}

// ─── Cancelar ─────────────────────────────────────────────────────────────────
async function cancelar(interaction) {
  sessao.limpar(interaction.user.id);
  await interaction.update({
    embeds: [new EmbedBuilder().setTitle('🗑️ Anúncio cancelado').setColor(0xED4245)],
    components: [],
  });
}

// ─── Enviar por DM em massa ───────────────────────────────────────────────────
async function enviarDM(interaction) {
  const uid = interaction.user.id;
  const s   = sessao.obter(uid);
  if (!podeDM(uid)) return interaction.reply({ content: '❌ Preencha pelo menos o Título.', flags: 64 });

  await interaction.deferReply({ flags: 64 });

  let cor = 0xFFD700;
  if (s.cor) { try { cor = parseInt(s.cor.replace('#', ''), 16); } catch {} }

  const embed = new EmbedBuilder()
    .setTitle(s.titulo)
    .setColor(cor)
    .setTimestamp()
    .setFooter({ text: `Anúncio por ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() });

  if (s.descricao) embed.setDescription(s.descricao);
  if (s.imagem)    embed.setImage(s.imagem);

  // Monta botões de link (igual ao publicar)
  const botoesLink = [];
  for (let n = 1; n <= 5; n++) {
    const b = s[`botao${n}`];
    if (!b?.nome || !b?.url) continue;
    botoesLink.push(new ButtonBuilder().setLabel(b.nome.slice(0, 80)).setURL(b.url).setStyle(ButtonStyle.Link));
  }
  const componentsDM = [];
  if (botoesLink.length) componentsDM.push(new ActionRowBuilder().addComponents(...botoesLink));
  componentsDM.push(rowTraduzir('anuncio'));

  // Busca todos os membros humanos
  await interaction.guild.members.fetch();
  const membros = interaction.guild.members.cache.filter(m => !m.user.bot);
  const total   = membros.size;

  let enviados  = 0;
  let erros     = 0;
  let pendentes = total;

  // Mensagem de progresso inicial
  const embedProgresso = () => new EmbedBuilder()
    .setTitle('📨 Enviando DMs...')
    .setColor(0x5865F2)
    .addFields(
      { name: '✅ Enviados',  value: `${enviados}`,  inline: true },
      { name: '❌ Erros',     value: `${erros}`,      inline: true },
      { name: '⏳ Pendentes', value: `${pendentes}`,  inline: true },
      { name: '📊 Total',     value: `${total}`,      inline: true },
      { name: '📈 Taxa',      value: `${total > 0 ? ((enviados / total) * 100).toFixed(1) : 0}%`, inline: true },
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embedProgresso()] });

  // Envia em lotes para não travar
  const lista = [...membros.values()];
  for (let i = 0; i < lista.length; i++) {
    try {
      await lista[i].send({ embeds: [embed], components: componentsDM });
      enviados++;
    } catch {
      erros++;
    }
    pendentes--;

    // Atualiza o progresso a cada 10 envios
    if ((i + 1) % 10 === 0 || i === lista.length - 1) {
      await interaction.editReply({ embeds: [embedProgresso()] }).catch(() => {});
    }

    // Pequena pausa para não bater rate limit do Discord
    if ((i + 1) % 30 === 0) await new Promise(r => setTimeout(r, 1000));
  }

  // Resultado final
  const embedFinal = new EmbedBuilder()
    .setTitle('📨 DM em Massa Concluída!')
    .setColor(erros === total ? 0xED4245 : enviados > 0 ? 0x57F287 : 0xFEE75C)
    .addFields(
      { name: '✅ Enviados',        value: `**${enviados}**`,  inline: true },
      { name: '❌ Erros',           value: `**${erros}**`,     inline: true },
      { name: '📊 Total',           value: `**${total}**`,     inline: true },
      { name: '📈 Taxa de sucesso', value: `**${total > 0 ? ((enviados / total) * 100).toFixed(1) : 0}%**`, inline: true },
      { name: '🔔 Novos membros',   value: 'Ativo — novos membros receberão este anúncio automaticamente.', inline: false },
    )
    .setDescription(erros > 0 ? `_${erros} membro(s) com DMs fechadas ou bloquearam o bot._` : '✅ Todos os membros receberam!')
    .setTimestamp();

  // Ativa o anúncio para novos membros (com botões)
  anuncioDMAtivo = { embed, components: componentsDM, ativadoPor: interaction.user.tag, ativadoEm: Date.now() };

  const rowDesativar = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('an_dm_desativar')
      .setLabel('🔕 Parar de enviar para novos membros')
      .setStyle(ButtonStyle.Danger),
  );

  await interaction.editReply({ embeds: [embedFinal], components: [rowDesativar] });
}

// ─── Desativar DM para novos membros ─────────────────────────────────────────
async function desativarDM(interaction) {
  anuncioDMAtivo = null;
  await interaction.update({
    embeds: [new EmbedBuilder()
      .setTitle('🔕 DM para novos membros desativada')
      .setDescription('Novos membros não receberão mais este anúncio.')
      .setColor(0x95A5A6)],
    components: [],
  });
}

module.exports = {
  enviarSubMenu,
  modalCanal, modalTitulo, modalConteudo, modalImagem, modalBotao,
  processarCanal, processarTitulo, processarConteudo, processarImagem, processarBotao,
  publicar, cancelar, enviarDM, desativarDM,
  getAnuncioDMAtivo,
};
