const { PermissionFlagsBits } = require('discord.js');

const CANAL_MEMBROS   = '1544649057962688563';
const GUILD_ID        = '1522456699082903572';

async function bloquearCanal(canal, guild) {
  try {
    await canal.permissionOverwrites.edit(guild.roles.everyone, {
      ViewChannel:  true,
      Connect:      false,
      SendMessages: false,
      ReadMessageHistory: false,
    });
    console.log(`[Status] Canal bloqueado: ${canal.name}`);
  } catch (err) {
    console.error('[Status] Erro ao bloquear canal:', err.message);
  }
}

async function atualizarMembros(guild) {
  try {
    const canal = guild.channels.cache.get(CANAL_MEMBROS);
    if (!canal) return;
    const novoNome = `👥 | membros: ${guild.memberCount}`;
    if (canal.name === novoNome) return;
    await canal.setName(novoNome);
    console.log(`[Status] Membros: ${guild.memberCount}`);
  } catch (err) {
    if (err.code === 20028) console.warn('[Status] Rate limit canal membros');
    else console.error('[Status] Erro membros:', err.message);
  }
}

function onVoiceStateUpdate() {}

async function iniciarStatus(client) {
  const guild = client.guilds.cache.get(GUILD_ID);
  if (!guild) { console.warn('[Status] Guild não encontrada'); return; }

  await guild.members.fetch().catch(() => {});

  const canal = guild.channels.cache.get(CANAL_MEMBROS);
  if (canal) await bloquearCanal(canal, guild);

  await atualizarMembros(guild);

  setInterval(() => atualizarMembros(guild), 5 * 60 * 1000);

  console.log('[Status] Canal de membros iniciado (atualização a cada 5 min)');
}

module.exports = { iniciarStatus, onVoiceStateUpdate, atualizarMembros };
