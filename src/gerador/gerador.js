/**
 * gerador.js — Módulo Bot Gerador (sem OAuth2)
 *
 * Funcionalidades integradas ao bot unificado:
 *  1. Auto-moderação: deleta links, convites Discord, mass-mention, excesso de imagens
 *  2. Logs detalhados de entrada/saída de membros (com idade da conta, cargos, tempo no servidor)
 *  3. Painel !mr — adicionar membros autorizados (authorized-members.json) em outros servidores em massa
 */

const fs   = require('node:fs');
const path = require('node:path');
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  EmbedBuilder, Events, ModalBuilder,
  PermissionsBitField, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const config = require('../config');

// ── Arquivo de membros autorizados (painel !mr) ───────────────
const authFile = path.join(__dirname, '../../data/authorized-members.json');
const memberJoinTimes = new Map(); // guildId -> Map(userId -> timestamp)
let additionInProgress = false;

function loadAuthorizations() {
  try { return new Map(Object.entries(JSON.parse(fs.readFileSync(authFile, 'utf8')))); }
  catch { return new Map(); }
}
function saveAuthorizations(map) {
  fs.mkdirSync(path.dirname(authFile), { recursive: true });
  fs.writeFileSync(authFile, JSON.stringify(Object.fromEntries(map), null, 2));
}
const authorizedMembers = loadAuthorizations();

// ── Helpers ───────────────────────────────────────────────────
function accountAgeDays(userId) {
  const createdAt = new Date(Number((BigInt(userId) >> 22n) + 1420070400000n));
  return Math.floor((Date.now() - createdAt.getTime()) / 86_400_000);
}

function formatDate(date) {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  }).format(date);
}

async function sendLog(client, embed) {
  try {
    const channel = await client.channels.fetch(config.channels.logChannel).catch(() => null);
    if (channel?.isTextBased()) await channel.send({ embeds: [embed] });
  } catch (e) {
    console.error('[Gerador Log]', e.message);
  }
}

function availableGuildsText(client) {
  const guilds = [...client.guilds.cache.values()];
  return guilds.length > 0
    ? guilds.map(g => `• ${g.name} (${g.id})`).join('\n').slice(0, 1024)
    : 'Nenhum servidor detectado.';
}

// ── 1) Auto-moderação de mensagens ────────────────────────────
function registrarAutoMod(client) {
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guild) return;

    const isExempt = message.member?.roles.cache.has(config.roles.bots)
                  || message.member?.roles.cache.has(config.roles.owner)
                  || message.member?.roles.cache.has(config.roles.chefe);
    if (isExempt) return;

    const imageCount       = message.attachments.filter(a => a.contentType?.startsWith('image/')).size;
    const hasMassMention   = message.mentions.everyone || /@(everyone|here)/i.test(message.content);
    const hasDiscordInvite = /(?:https?:\/\/)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/[\w-]+/i.test(message.content);
    const hasLink          = /https?:\/\/\S+/i.test(message.content);

    const shouldDelete = hasMassMention || imageCount >= 3 || hasLink || hasDiscordInvite;
    if (!shouldDelete) return;

    try {
      await message.delete();

      const razoes = [];
      if (hasMassMention)   razoes.push('Menção em massa (@everyone/@here)');
      if (imageCount >= 3)  razoes.push(`${imageCount} imagens anexadas`);
      if (hasDiscordInvite) razoes.push('Link de convite do Discord');
      else if (hasLink)     razoes.push('Link externo');

      const logEmbed = new EmbedBuilder()
        .setColor(0xfee75c)
        .setAuthor({ name: '🗑️ Mensagem Auto-Moderada', iconURL: message.author.displayAvatarURL({ size: 64 }) })
        .setDescription(`Mensagem de <@${message.author.id}> removida automaticamente.`)
        .addFields(
          { name: '👤 Autor',    value: `• **Nome:** ${message.author.username}\n• **ID:** ${message.author.id}\n• **Menção:** <@${message.author.id}>` },
          { name: '📍 Local',    value: `• **Canal:** <#${message.channelId}>\n• **Servidor:** ${message.guild.name}` },
          { name: '🚫 Motivo(s)',value: razoes.map(r => `• ${r}`).join('\n') },
          { name: '💬 Conteúdo', value: message.content ? message.content.slice(0, 1024) : '*Sem texto (apenas mídia)*' },
        )
        .setFooter({ text: `ID do autor: ${message.author.id}` })
        .setTimestamp();

      await sendLog(client, logEmbed);
    } catch (e) {
      console.error('[AutoMod]', e.code || e.message);
    }
  });

  console.log('✅ [Gerador] Auto-moderação registrada.');
}

// ── 2) Logs detalhados de entrada/saída ───────────────────────
function registrarLogsEntradaSaida(client) {
  client.on(Events.GuildMemberAdd, async (member) => {
    // Registrar em todos os servidores onde o bot está
    if (!memberJoinTimes.has(member.guild.id)) memberJoinTimes.set(member.guild.id, new Map());
    memberJoinTimes.get(member.guild.id).set(member.id, Date.now());

    const ageDays   = accountAgeDays(member.id);
    const createdAt = new Date(Number((BigInt(member.id) >> 22n) + 1420070400000n));
    const isNew     = ageDays < 7;

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setAuthor({ name: '📥 Novo Membro Entrou', iconURL: member.user.displayAvatarURL({ size: 64 }) })
      .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
      .setDescription(`**${member.user.username}** entrou no servidor!${isNew ? '\n⚠️ **Conta nova — menos de 7 dias**' : ''}`)
      .addFields(
        { name: '👤 Informações',  value: `• **ID:** ${member.id}\n• **Menção:** <@${member.id}>\n• **Bot:** ${member.user.bot ? 'Sim' : 'Não'}` },
        { name: '📅 Datas',        value: `• **Conta criada em:** ${formatDate(createdAt)}\n• **Idade da conta:** ${ageDays} dia(s)\n• **Entrou em:** ${formatDate(new Date())}` },
        { name: '🏠 Servidor',     value: `• **Total de membros:** ${member.guild.memberCount}`, inline: true },
      )
      .setFooter({ text: `ID: ${member.id}` })
      .setTimestamp();

    await sendLog(client, embed);
  });

  client.on(Events.GuildMemberRemove, async (member) => {
    const ageDays   = accountAgeDays(member.id);
    const createdAt = new Date(Number((BigInt(member.id) >> 22n) + 1420070400000n));
    const joinedAt  = member.joinedAt;

    const joinTimestamp = memberJoinTimes.get(member.guild.id)?.get(member.id);
    memberJoinTimes.get(member.guild.id)?.delete(member.id);

    const timeMs = joinTimestamp
      ? Date.now() - joinTimestamp
      : joinedAt ? Date.now() - joinedAt.getTime() : null;

    const timeText = timeMs === null ? 'Desconhecido'
      : timeMs < 3_600_000   ? `${Math.floor(timeMs / 60_000)} minuto(s)`
      : timeMs < 86_400_000  ? `${Math.floor(timeMs / 3_600_000)} hora(s) e ${Math.floor((timeMs % 3_600_000) / 60_000)} min`
      : `${Math.floor(timeMs / 86_400_000)} dia(s)`;

    const roles = member.roles.cache
      .filter(r => r.id !== member.guild.id)
      .map(r => `<@&${r.id}>`)
      .join(', ') || 'Nenhum';

    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setAuthor({ name: '📤 Membro Saiu', iconURL: member.user.displayAvatarURL({ size: 64 }) })
      .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
      .setDescription(`**${member.user.username}** saiu do servidor.`)
      .addFields(
        { name: '👤 Informações', value: `• **ID:** ${member.id}\n• **Menção:** <@${member.id}>\n• **Bot:** ${member.user.bot ? 'Sim' : 'Não'}` },
        { name: '📅 Datas',       value: `• **Conta criada em:** ${formatDate(createdAt)}\n• **Idade da conta:** ${ageDays} dia(s)${joinedAt ? `\n• **Entrou em:** ${formatDate(joinedAt)}` : ''}\n• **Saiu em:** ${formatDate(new Date())}\n• **Tempo no servidor:** ${timeText}` },
        { name: '🏷️ Cargos',     value: roles.slice(0, 1024) },
      )
      .setFooter({ text: `ID: ${member.id}` })
      .setTimestamp();

    await sendLog(client, embed);
  });

  console.log('✅ [Gerador] Logs de entrada/saída registrados.');
}

// ── 3) Painel !mr — adicionar membros autorizados em massa ────
async function processAddition(targetCount, maxErrors, targetGuildId, client) {
  if (additionInProgress) throw new Error('Já existe um processamento em andamento.');
  additionInProgress = true;
  let added = 0, errors = 0;
  const addedMembers = [], failures = [];

  try {
    for (const [userId, rec] of authorizedMembers) {
      if (added >= targetCount || errors > maxErrors) break;
      if ((rec.processedGuildIds || []).includes(targetGuildId)) continue;

      try {
        const res = await fetch(`https://discord.com/api/guilds/${targetGuildId}/members/${rec.user.id}`, {
          method: 'PUT',
          headers: { Authorization: `Bot ${config.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: rec.accessToken }),
        });
        if (![201, 204].includes(res.status)) throw new Error(`Status ${res.status}`);

        const guild = client.guilds.cache.get(targetGuildId) || await client.guilds.fetch(targetGuildId).catch(() => null);
        rec.processedGuildIds = [...(rec.processedGuildIds || []), targetGuildId];
        saveAuthorizations(authorizedMembers);
        addedMembers.push({ id: userId, username: rec.user.username, servers: [guild?.name || targetGuildId] });
        added++;
      } catch (e) {
        errors++;
        failures.push(`${rec.user.username}: ${e.message}`);
        if (errors > maxErrors) break;
      }
    }
  } finally {
    additionInProgress = false;
  }

  const remaining = [...authorizedMembers.values()].filter(m => !(m.processedGuildIds || []).includes(targetGuildId)).length;
  return { added, errors, remaining, addedMembers, failures };
}

function registrarPainelMr(client) {
  // Comando !mr via mensagem
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guild) return;
    if (message.content.trim().toLowerCase() !== '!mr') return;
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      return message.reply('Você precisa da permissão **Gerenciar servidor** para abrir este painel.');
    }

    const pendentes = [...authorizedMembers.values()]
      .filter(m => !(m.processedGuildIds || []).includes(message.guild.id)).length;

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('Painel de adição')
      .setDescription('Processe somente membros que autorizaram via Discord OAuth2. Defina a quantidade e o limite de falhas.')
      .addFields(
        { name: 'Autorizações aguardando neste servidor', value: String(pendentes), inline: true },
        { name: 'Servidores detectados', value: availableGuildsText(client) },
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('mr_open_addition_panel').setLabel('Configurar adição').setStyle(ButtonStyle.Primary),
    );
    await message.reply({ embeds: [embed], components: [row] });
  });

  // Botão — abre modal
  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isButton() && interaction.customId === 'mr_open_addition_panel') {
      if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) {
        return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
      }
      const modal = new ModalBuilder()
        .setCustomId(`mr_addition_settings:${interaction.guildId}`)
        .setTitle('Adicionar membros autorizados');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('quantity').setLabel('Quantidade de membros')
            .setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex.: 10'),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('max_errors').setLabel('Falhas permitidas')
            .setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex.: 2'),
        ),
      );
      return interaction.showModal(modal);
    }

    // Modal submit — processa adição
    if (interaction.isModalSubmit() && interaction.customId.startsWith('mr_addition_settings:')) {
      if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) {
        return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
      }
      const qty     = parseInt(interaction.fields.getTextInputValue('quantity'));
      const maxErr  = parseInt(interaction.fields.getTextInputValue('max_errors'));
      const guildId = interaction.customId.split(':')[1];

      if (!qty || qty < 1 || isNaN(maxErr) || maxErr < 0) {
        return interaction.reply({ content: 'Quantidade deve ser > 0 e falhas permitidas >= 0.', ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });
      try {
        const result = await processAddition(qty, maxErr, guildId, client);
        await interaction.editReply('✅ Processamento concluído. Relatório publicado neste canal.');

        const addedList = result.addedMembers.length
          ? result.addedMembers.map(m => `• ${m.username} (<@${m.id}>)`).join('\n').slice(0, 1024)
          : 'Nenhum membro adicionado.';
        const failList = result.failures.length
          ? result.failures.join('\n').slice(0, 1024)
          : 'Nenhuma falha.';

        await interaction.channel.send({
          embeds: [new EmbedBuilder()
            .setColor(result.added === qty ? 0x57f287 : 0xfee75c)
            .setTitle('📊 Relatório de Adição')
            .setDescription(`**${result.added}/${qty}** membros adicionados.`)
            .addFields(
              { name: `✅ Adicionados (${result.added})`, value: addedList },
              { name: `❌ Falhas (${result.errors})`,     value: failList },
              { name: 'Restantes',                        value: String(result.remaining), inline: true },
            )
            .setTimestamp()],
        });
      } catch (e) {
        await interaction.editReply(`❌ Erro: ${e.message}`);
      }
    }
  });

  console.log('✅ [Gerador] Painel !mr registrado.');
}

// ── Exportar função de inicialização ─────────────────────────
function iniciar(client) {
  registrarAutoMod(client);
  registrarLogsEntradaSaida(client);
  registrarPainelMr(client);
  console.log('✅ [Gerador] Módulo Bot Gerador iniciado (sem OAuth2).');
}

module.exports = { iniciar };
