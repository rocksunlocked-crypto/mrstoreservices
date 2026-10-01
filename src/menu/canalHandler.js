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

// ─── Cargos que podem destravar canais ────────────────────────────────────────
const CARGOS_DESTRAVAR = [
  '1544859043871588402', // 🔱 Super Owner
  '1522459532469469225', // 👑 Owner
  '1522458772801458236', // ⚙️ Administrador
  '1522459007854575697', // 🔨 Moderador
  '1522457765161992292', // 🎧 Suporte
];

// ─── Todos os cargos do servidor (que serão afetados pelo travar/destravar) ───
const TODOS_CARGOS = [
  '1522459532469469225', // 👑 Owner
  '1533017261634359326', // 🤖 Bots
  '1522791855597555842', // 🛒 Aceitar Compra
  '1522806323446681741', // 🏪 Loja
  '1543648460085923923', // 🤝 Parceiros
  '1522458772801458236', // ⚙️ Administrador
  '1522459007854575697', // 🔨 Moderador
  '1522457765161992292', // 🎧 Suporte
  '1522458063573880984', // 💎 Cliente Supremo
  '1522457266119512114', // ✨ Cliente Premium
  '1522457009931419748', // 🛍️ Cliente
  '1529786619509342449', // 📣 Influenciador
  '1522459297320144947', // 📺 Inscrito
  '1522463987151929474', // ✅ Verificador
  '1522456786622218280', // 👁️ Visitante
  '1544176787552997516', // 🚀 Booster
];

function podeDestravar(member) {
  return CARGOS_DESTRAVAR.some(id => member.roles.cache.has(id));
}

// ─── Aplica permissão de SendMessages em todos os cargos do canal ─────────────
async function aplicarPermissoes(canal, guild, bloquear) {
  const promises = [];

  // @everyone
  promises.push(
    canal.permissionOverwrites.edit(guild.roles.everyone, {
      SendMessages:          bloquear ? false : null,
      SendMessagesInThreads: bloquear ? false : null,
      AddReactions:          bloquear ? false : null,
    }).catch(() => {})
  );

  // Cada cargo individualmente
  for (const cargoId of TODOS_CARGOS) {
    const role = guild.roles.cache.get(cargoId);
    if (!role) continue;
    promises.push(
      canal.permissionOverwrites.edit(role, {
        SendMessages:          bloquear ? false : null,
        SendMessagesInThreads: bloquear ? false : null,
        AddReactions:          bloquear ? false : null,
      }).catch(() => {})
    );
  }

  await Promise.all(promises);
}

// ─── Modal trancar ────────────────────────────────────────────────────────────
async function abrirModalTrancar(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('modal_trancar')
    .setTitle('🔒 Trancar Canal');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('canal_id')
        .setLabel('ID do canal (vazio = canal atual)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('Deixe em branco para o canal atual')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('canal_motivo')
        .setLabel('Motivo (opcional)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('Ex: Manutenção temporária')
    ),
  );

  await interaction.showModal(modal);
}

// ─── Processa modal de trancar ────────────────────────────────────────────────
async function processarTrancar(interaction) {
  const canalIdRaw = interaction.fields.getTextInputValue('canal_id').trim();
  const motivo     = interaction.fields.getTextInputValue('canal_motivo').trim() || null;

  let canal;
  if (canalIdRaw) {
    canal = interaction.guild.channels.cache.get(canalIdRaw);
    if (!canal || canal.type !== ChannelType.GuildText) {
      return interaction.reply({ content: `❌ Canal \`${canalIdRaw}\` não encontrado.`, flags: 64 });
    }
  } else {
    canal = interaction.channel;
  }

  await interaction.deferReply({ flags: 64 });

  try {
    await aplicarPermissoes(canal, interaction.guild, true);

    const embed = new EmbedBuilder()
      .setTitle('🔒  Canal Temporariamente Fechado')
      .setDescription(
        `> Este canal foi trancado por um membro da equipe.\n` +
        (motivo ? `\n**📋 Motivo:** ${motivo}\n` : '\n') +
        `\nAguarde a reabertura. Qualquer dúvida, contate a equipe.`
      )
      .setColor(0xFF4444)
      .addFields(
        { name: '🔐 Trancado por', value: `<@${interaction.user.id}>`,             inline: true },
        { name: '🕐 Horário',      value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
        { name: '📢 Canal',        value: `<#${canal.id}>`,                          inline: true },
      )
      .setFooter({ text: 'Para reabrir, use o botão abaixo (apenas equipe autorizada)' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`canal_destravar_${canal.id}`)
        .setLabel('🔓 Destravar Canal')
        .setStyle(ButtonStyle.Success),
    );

    await canal.send({ embeds: [embed], components: [row] });
    await interaction.editReply({ content: `✅ Canal ${canal} trancado para todos os cargos!` });

  } catch (err) {
    console.error('Erro ao trancar canal:', err.message);
    await interaction.editReply({ content: `❌ Não consegui trancar o canal. Verifique minhas permissões.` });
  }
}

// ─── Botão de destravar ───────────────────────────────────────────────────────
async function destravaBotao(interaction) {
  const canalId = interaction.customId.replace('canal_destravar_', '');
  const member  = interaction.member;

  if (!podeDestravar(member)) {
    return interaction.reply({
      content: `❌ Você não tem permissão.\nCargos autorizados: Suporte, Moderador, Administrador ou Owner.`,
      flags: 64,
    });
  }

  const canal = interaction.guild.channels.cache.get(canalId);
  if (!canal) return interaction.reply({ content: '❌ Canal não encontrado.', flags: 64 });

  await interaction.deferReply({ flags: 64 });

  try {
    await aplicarPermissoes(canal, interaction.guild, false);

    const msgOriginal     = interaction.message;
    const embedAtualizado = EmbedBuilder.from(msgOriginal.embeds[0])
      .setTitle('🔓  Canal Reaberto')
      .setColor(0x57F287)
      .setDescription(`> Este canal foi reaberto por um membro da equipe.\n\nPode falar normalmente! 😊`)
      .setFields(
        { name: '🔓 Reaberto por', value: `<@${interaction.user.id}>`,             inline: true },
        { name: '🕐 Horário',      value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
        { name: '📢 Canal',        value: `<#${canal.id}>`,                          inline: true },
      )
      .setFooter({ text: 'Canal reaberto pela equipe' })
      .setTimestamp();

    await msgOriginal.edit({ embeds: [embedAtualizado], components: [] });
    await interaction.editReply({ content: `✅ Canal ${canal} reaberto para todos!` });

  } catch (err) {
    console.error('Erro ao destravar canal:', err.message);
    await interaction.editReply({ content: `❌ Não consegui destravar. Verifique minhas permissões.` });
  }
}

// ─── Modal abrir (backup via menu) ───────────────────────────────────────────
async function abrirModalAbrir(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('modal_abrir')
    .setTitle('🔓 Abrir Canal');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('canal_id')
        .setLabel('ID do canal (vazio = canal atual)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('Deixe em branco para o canal atual')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('canal_motivo')
        .setLabel('Motivo (opcional)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('Ex: Fim da manutenção')
    ),
  );

  await interaction.showModal(modal);
}

async function processarAbrir(interaction) {
  const canalIdRaw = interaction.fields.getTextInputValue('canal_id').trim();
  const motivo     = interaction.fields.getTextInputValue('canal_motivo').trim() || null;

  let canal;
  if (canalIdRaw) {
    canal = interaction.guild.channels.cache.get(canalIdRaw);
    if (!canal || canal.type !== ChannelType.GuildText) {
      return interaction.reply({ content: `❌ Canal \`${canalIdRaw}\` não encontrado.`, flags: 64 });
    }
  } else {
    canal = interaction.channel;
  }

  await interaction.deferReply({ flags: 64 });

  try {
    await aplicarPermissoes(canal, interaction.guild, false);

    const embed = new EmbedBuilder()
      .setTitle('🔓  Canal Reaberto')
      .setDescription(
        `> Este canal foi reaberto pela equipe.\n` +
        (motivo ? `\n**📋 Motivo:** ${motivo}\n` : '\n') +
        `\nPode falar normalmente! 😊`
      )
      .setColor(0x57F287)
      .addFields(
        { name: '🔓 Reaberto por', value: `<@${interaction.user.id}>`,             inline: true },
        { name: '🕐 Horário',      value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
        { name: '📢 Canal',        value: `<#${canal.id}>`,                          inline: true },
      )
      .setFooter({ text: 'Canal reaberto pela equipe' })
      .setTimestamp();

    await canal.send({ embeds: [embed] });
    await interaction.editReply({ content: `✅ Canal ${canal} reaberto!` });

  } catch (err) {
    console.error('Erro ao abrir canal:', err.message);
    await interaction.editReply({ content: `❌ Não consegui abrir. Verifique minhas permissões.` });
  }
}

module.exports = {
  abrirModalTrancar, processarTrancar,
  abrirModalAbrir,   processarAbrir,
  destravaBotao,
};
