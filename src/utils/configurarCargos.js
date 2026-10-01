/**
 * Configura as permissões de todos os cargos do servidor.
 * - Owner: Administrator + todas as permissões
 * - Demais cargos: sem Administrator, permissões adequadas ao papel
 * Execute UMA VEZ com: node utils/configurarCargos.js
 */

require('dotenv').config();
require('./inicializarDados').inicializar();

const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

const GUILD_ID  = '1522456699082903572';
const OWNER_ID  = '1522459532469469225';

// ─── Permissões base por cargo ────────────────────────────────────────────────
// Flags: https://discord.com/developers/docs/topics/permissions
const P = PermissionsBitField.Flags;

// Permissões que qualquer membro logado deve ter
const BASE_MEMBRO = [
  P.ViewChannel,
  P.SendMessages,
  P.ReadMessageHistory,
  P.AddReactions,
  P.UseExternalEmojis,
  P.UseApplicationCommands,
  P.Connect,
  P.Speak,
  P.Stream,
  P.UseVAD,
  P.ChangeNickname,
];

// Staff — pode moderar
const BASE_STAFF = [
  ...BASE_MEMBRO,
  P.ManageMessages,
  P.MuteMembers,
  P.DeafenMembers,
  P.MoveMembers,
  P.KickMembers,
  P.ModerateMembers,
  P.ManageNicknames,
  P.ViewAuditLog,
  P.ManageThreads,
  P.CreatePublicThreads,
  P.SendMessagesInThreads,
];

// Admin — pode gerenciar canais, cargos (SEM Administrator)
const BASE_ADMIN = [
  ...BASE_STAFF,
  P.BanMembers,
  P.ManageChannels,
  P.ManageGuild,
  P.ManageWebhooks,
  P.ManageRoles,
  P.ManageEmojisAndStickers,
  P.ManageEvents,
  P.MentionEveryone,
  P.EmbedLinks,
  P.AttachFiles,
  P.UseExternalStickers,
  P.PrioritySpeaker,
];

// Owner do servidor — ÚNICO com Administrator
const OWNER_PERMS = [P.Administrator];

// ─── Mapa: cargoId → permissões ───────────────────────────────────────────────
const CARGOS_CONFIG = {
  // 👑 Owner — Administrator total
  '1522459532469469225': {
    nome: '👑 Owner',
    perms: new PermissionsBitField(OWNER_PERMS),
    cor: 0xFFD700,
    hoist: true,
    mentionable: false,
  },

  // 🤖 Bots — permissões operacionais
  '1533017261634359326': {
    nome: '🤖 Bots',
    perms: new PermissionsBitField([
      ...BASE_ADMIN,
    ]),
    cor: 0x7289DA,
    hoist: false,
    mentionable: false,
  },

  // 🛒 Aceitar Compra
  '1522791855597555842': {
    nome: '🛒 Aceitar Compra',
    perms: new PermissionsBitField([
      ...BASE_STAFF,
      P.ManageChannels,
      P.ManageWebhooks,
      P.EmbedLinks,
      P.AttachFiles,
    ]),
    cor: 0x57F287,
    hoist: false,
    mentionable: false,
  },

  // 🏪 Loja
  '1522806323446681741': {
    nome: '🏪 Loja',
    perms: new PermissionsBitField([
      ...BASE_STAFF,
      P.EmbedLinks,
      P.AttachFiles,
      P.MentionEveryone,
    ]),
    cor: 0x57F287,
    hoist: false,
    mentionable: false,
  },

  // 🤝 Parceiros
  '1543648460085923923': {
    nome: '🤝 Parceiros',
    perms: new PermissionsBitField([
      ...BASE_MEMBRO,
      P.EmbedLinks,
      P.AttachFiles,
      P.CreatePublicThreads,
      P.SendMessagesInThreads,
    ]),
    cor: 0xEB459E,
    hoist: false,
    mentionable: true,
  },

  // ⚙️ Administrador — SEM Administrator flag
  '1522458772801458236': {
    nome: '⚙️ Administrador',
    perms: new PermissionsBitField(BASE_ADMIN),
    cor: 0xED4245,
    hoist: true,
    mentionable: false,
  },

  // 🔨 Moderador
  '1522459007854575697': {
    nome: '🔨 Moderador',
    perms: new PermissionsBitField(BASE_STAFF),
    cor: 0xFEE75C,
    hoist: true,
    mentionable: false,
  },

  // 🎧 Suporte
  '1522457765161992292': {
    nome: '🎧 Suporte',
    perms: new PermissionsBitField([
      ...BASE_MEMBRO,
      P.ManageMessages,
      P.MuteMembers,
      P.MoveMembers,
      P.ModerateMembers,
      P.ViewAuditLog,
      P.EmbedLinks,
      P.AttachFiles,
      P.SendMessagesInThreads,
    ]),
    cor: 0x5865F2,
    hoist: true,
    mentionable: true,
  },

  // 💎 Cliente Supremo
  '1522458063573880984': {
    nome: '💎 Cliente Supremo',
    perms: new PermissionsBitField([
      ...BASE_MEMBRO,
      P.EmbedLinks,
      P.AttachFiles,
      P.UseExternalStickers,
      P.CreatePublicThreads,
      P.SendMessagesInThreads,
    ]),
    cor: 0xFF73FA,
    hoist: true,
    mentionable: false,
  },

  // ✨ Cliente Premium
  '1522457266119512114': {
    nome: '✨ Cliente Premium',
    perms: new PermissionsBitField([
      ...BASE_MEMBRO,
      P.EmbedLinks,
      P.AttachFiles,
    ]),
    cor: 0xBF6BFF,
    hoist: true,
    mentionable: false,
  },

  // 🛍️ Cliente
  '1522457009931419748': {
    nome: '🛍️ Cliente',
    perms: new PermissionsBitField(BASE_MEMBRO),
    cor: 0x00B0F4,
    hoist: false,
    mentionable: false,
  },

  // 📣 Influenciador
  '1529786619509342449': {
    nome: '📣 Influenciador',
    perms: new PermissionsBitField([
      ...BASE_MEMBRO,
      P.EmbedLinks,
      P.AttachFiles,
      P.Stream,
    ]),
    cor: 0xFF7043,
    hoist: false,
    mentionable: false,
  },

  // 📺 Inscrito
  '1522459297320144947': {
    nome: '📺 Inscrito',
    perms: new PermissionsBitField(BASE_MEMBRO),
    cor: 0xFF0000,
    hoist: false,
    mentionable: false,
  },

  // ✅ Verificador
  '1522463987151929474': {
    nome: '✅ Verificador',
    perms: new PermissionsBitField([
      ...BASE_MEMBRO,
      P.ViewAuditLog,
    ]),
    cor: 0x43B581,
    hoist: false,
    mentionable: false,
  },

  // 👁️ Visitante — permissões mínimas
  '1522456786622218280': {
    nome: '👁️ Visitante',
    perms: new PermissionsBitField([
      P.ViewChannel,
      P.ReadMessageHistory,
      P.UseApplicationCommands,
      P.Connect,
    ]),
    cor: 0x99AAB5,
    hoist: false,
    mentionable: false,
  },

  // 🚀 Booster
  '1544176787552997516': {
    nome: '🚀 Booster',
    perms: new PermissionsBitField([
      ...BASE_MEMBRO,
      P.EmbedLinks,
      P.AttachFiles,
      P.UseExternalStickers,
      P.Stream,
    ]),
    cor: 0xFF73FA,
    hoist: false,
    mentionable: false,
  },
};

// ─── Executa ──────────────────────────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`\n🤖 Conectado como ${client.user.tag}`);
  console.log('🔧 Configurando cargos...\n');

  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.roles.fetch(); // carrega todos

  let ok = 0, erros = 0;

  for (const [roleId, config] of Object.entries(CARGOS_CONFIG)) {
    const role = guild.roles.cache.get(roleId);
    if (!role) {
      console.log(`⚠️  Cargo não encontrado: ${config.nome} (${roleId})`);
      erros++;
      continue;
    }

    try {
      await role.edit({
        permissions: config.perms,
        hoist:       config.hoist,
        mentionable: config.mentionable,
      });
      console.log(`✅ ${config.nome}`);
      ok++;
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.error(`❌ ${config.nome}: ${err.message}`);
      erros++;
    }
  }

  console.log(`\n📊 Resultado: ${ok} cargos configurados, ${erros} erros.`);
  console.log('\n✅ Concluído!');
  client.destroy();
});

client.login(process.env.TOKEN);
