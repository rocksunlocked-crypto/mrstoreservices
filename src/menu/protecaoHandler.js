/**
 * Proteção de Cargos em Tempo Real
 *
 * Monitora roleUpdate — se alguém que NÃO é Owner alterar um cargo,
 * restaura as permissões originais instantaneamente e loga a tentativa.
 */

const { PermissionsBitField } = require('discord.js');
const { log } = require('./logsHandler');

const GUILD_ID  = '1522456699082903572';
const OWNER_ID  = '1522459532469469225'; // cargo Owner
const P         = PermissionsBitField.Flags;

// ─── Snapshot das permissões originais ───────────────────────────────────────
// Gerado a partir do configurarCargos.js — mantido em sincronia
const BASE_MEMBRO = [
  P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AddReactions,
  P.UseExternalEmojis, P.UseApplicationCommands, P.Connect, P.Speak,
  P.Stream, P.UseVAD, P.ChangeNickname,
];
const BASE_STAFF = [
  ...BASE_MEMBRO, P.ManageMessages, P.MuteMembers, P.DeafenMembers,
  P.MoveMembers, P.KickMembers, P.ModerateMembers, P.ManageNicknames,
  P.ViewAuditLog, P.ManageThreads, P.CreatePublicThreads, P.SendMessagesInThreads,
];
const BASE_ADMIN = [
  ...BASE_STAFF, P.BanMembers, P.ManageChannels, P.ManageGuild,
  P.ManageWebhooks, P.ManageRoles, P.ManageEmojisAndStickers, P.ManageEvents,
  P.MentionEveryone, P.EmbedLinks, P.AttachFiles, P.UseExternalStickers, P.PrioritySpeaker,
];

const SNAPSHOT = {
  '1522459532469469225': new PermissionsBitField([P.Administrator]),
  '1533017261634359326': new PermissionsBitField(BASE_ADMIN),
  '1522791855597555842': new PermissionsBitField([...BASE_STAFF, P.ManageChannels, P.ManageWebhooks, P.EmbedLinks, P.AttachFiles]),
  '1522806323446681741': new PermissionsBitField([...BASE_STAFF, P.EmbedLinks, P.AttachFiles, P.MentionEveryone]),
  '1543648460085923923': new PermissionsBitField([...BASE_MEMBRO, P.EmbedLinks, P.AttachFiles, P.CreatePublicThreads, P.SendMessagesInThreads]),
  '1522458772801458236': new PermissionsBitField(BASE_ADMIN),
  '1522459007854575697': new PermissionsBitField(BASE_STAFF),
  '1522457765161992292': new PermissionsBitField([...BASE_MEMBRO, P.ManageMessages, P.MuteMembers, P.MoveMembers, P.ModerateMembers, P.ViewAuditLog, P.EmbedLinks, P.AttachFiles, P.SendMessagesInThreads]),
  '1522458063573880984': new PermissionsBitField([...BASE_MEMBRO, P.EmbedLinks, P.AttachFiles, P.UseExternalStickers, P.CreatePublicThreads, P.SendMessagesInThreads]),
  '1522457266119512114': new PermissionsBitField([...BASE_MEMBRO, P.EmbedLinks, P.AttachFiles]),
  '1522457009931419748': new PermissionsBitField(BASE_MEMBRO),
  '1529786619509342449': new PermissionsBitField([...BASE_MEMBRO, P.EmbedLinks, P.AttachFiles, P.Stream]),
  '1522459297320144947': new PermissionsBitField(BASE_MEMBRO),
  '1522463987151929474': new PermissionsBitField([...BASE_MEMBRO, P.ViewAuditLog]),
  '1522456786622218280': new PermissionsBitField([P.ViewChannel, P.ReadMessageHistory, P.UseApplicationCommands, P.Connect]),
  '1544176787552997516': new PermissionsBitField([...BASE_MEMBRO, P.EmbedLinks, P.AttachFiles, P.UseExternalStickers, P.Stream]),
};

// ─── Verifica se quem alterou tem cargo Owner ─────────────────────────────────
async function quemAlterou(guild, roleId) {
  try {
    // Busca o audit log — ação 31 = ROLE_UPDATE
    const logs = await guild.fetchAuditLogs({ limit: 1, type: 31 });
    const entry = logs.entries.first();

    if (!entry) return null;

    // Verifica se é recente (menos de 5 segundos)
    const agora = Date.now();
    if (agora - entry.createdTimestamp > 5000) return null;

    // Verifica se é sobre este cargo
    if (entry.targetId !== roleId) return null;

    return entry.executor;
  } catch {
    return null;
  }
}

// ─── Handler principal ────────────────────────────────────────────────────────
async function onRoleUpdate(oldRole, newRole) {
  if (newRole.guild.id !== GUILD_ID) return;

  const permissoesOriginais = SNAPSHOT[newRole.id];
  if (!permissoesOriginais) return; // cargo não monitorado

  // Compara as permissões
  if (oldRole.permissions.equals(newRole.permissions)) return; // nada mudou

  // Busca quem fez a alteração
  const executor = await quemAlterou(newRole.guild, newRole.id);

  // Se não conseguiu identificar ou quem fez tem Owner, permite
  if (executor) {
    const member = await newRole.guild.members.fetch(executor.id).catch(() => null);
    if (member?.roles?.cache?.has(OWNER_ID)) {
      console.log(`[Proteção] Alteração autorizada por Owner: ${executor.tag} → ${newRole.name}`);

      // Atualiza o snapshot com as novas permissões do Owner
      SNAPSHOT[newRole.id] = new PermissionsBitField(newRole.permissions);
      console.log(`[Proteção] Snapshot atualizado para: ${newRole.name}`);
      return;
    }
  }

  // Não autorizado — restaura imediatamente
  console.warn(`[Proteção] ⚠️ Tentativa de alteração não autorizada em: ${newRole.name} — restaurando...`);

  try {
    await newRole.edit({ permissions: permissoesOriginais });
    console.log(`[Proteção] ✅ ${newRole.name} restaurado!`);

    // Loga a tentativa
    await log(null, newRole.guild, 'canal_trancado', {
      acao:        '🚨 Alteração de Cargo Bloqueada e Restaurada',
      responsavel: executor ? `${executor.tag} (\`${executor.id}\`)` : 'Desconhecido',
      alvo:        `<@&${newRole.id}> (${newRole.name})`,
      detalhes:    `Permissões originais restauradas automaticamente.\nApenas o cargo <@&${OWNER_ID}> pode alterar cargos.`,
    });

    // Tenta avisar o executor por DM
    if (executor) {
      try {
        await executor.send({
          embeds: [{
            color: 0xFF0000,
            title: '🚨 Ação Bloqueada',
            description: `Você tentou alterar as permissões do cargo **${newRole.name}**.\n\nApenas membros com o cargo **Owner** podem modificar cargos.\n\nAs permissões foram restauradas automaticamente.`,
            timestamp: new Date().toISOString(),
          }]
        });
      } catch { /* DMs fechadas */ }
    }

  } catch (err) {
    console.error(`[Proteção] ❌ Erro ao restaurar ${newRole.name}:`, err.message);
  }
}

// ─── Inicia o monitoramento ───────────────────────────────────────────────────
function iniciarProtecao(client) {
  client.on('roleUpdate', onRoleUpdate);
  console.log('[Proteção] 🛡️ Monitoramento de cargos ativo');
}

module.exports = { iniciarProtecao, SNAPSHOT };
