const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
} = require('discord.js');
const { AltDetector } = require('discord-alt-detector');

// ─── Alt Detector configurado ─────────────────────────────────────────────────
const detector = new AltDetector({
  ageWeight:              2,   // idade da conta tem peso alto
  statusWeight:           1,
  activityWeight:         1,
  usernameWordsWeight:    1,
  usernameSymbolsWeight:  1,
  displaynameWordsWeight: 1,
  displaynameCapsWeight:  1,
  displaynameSymbolsWeight: 1,
  flagsWeight:            2,   // badges têm peso alto
  boosterWeight:          1,
  pfpWeight:              1,
  bannerWeight:           1,
});

// ─── Hierarquia do servidor ───────────────────────────────────────────────────
const HIERARQUIA = [
  { id: '1522459532469469225', nome: '👑 Owner',            cor: 0xFFD700 },
  { id: '1533017261634359326', nome: '🤖 Bots',             cor: 0x7289DA },
  { id: '1522791855597555842', nome: '🛒 Aceitar Compra',   cor: 0x57F287 },
  { id: '1522806323446681741', nome: '🏪 Loja',             cor: 0x57F287 },
  { id: '1543648460085923923', nome: '🤝 Parceiros',        cor: 0xEB459E },
  { id: '1522458772801458236', nome: '⚙️ Administrador',    cor: 0xED4245 },
  { id: '1522459007854575697', nome: '🔨 Moderador',        cor: 0xFEE75C },
  { id: '1522457765161992292', nome: '🎧 Suporte',          cor: 0x5865F2 },
  { id: '1522458063573880984', nome: '💎 Cliente Supremo',  cor: 0xFF73FA },
  { id: '1522457266119512114', nome: '✨ Cliente Premium',  cor: 0xBF6BFF },
  { id: '1522457009931419748', nome: '🛍️ Cliente',          cor: 0x00B0F4 },
  { id: '1529786619509342449', nome: '📣 Influenciador',    cor: 0xFF7043 },
  { id: '1522459297320144947', nome: '📺 Inscrito',         cor: 0xFF0000 },
  { id: '1522463987151929474', nome: '✅ Verificador',      cor: 0x43B581 },
  { id: '1522456786622218280', nome: '👁️ Visitante',        cor: 0x99AAB5 },
  { id: '1544176787552997516', nome: '🚀 Booster',          cor: 0xFF73FA },
];

const BADGES = {
  Staff:                   '👨‍💼 Discord Staff',
  Partner:                 '🤝 Discord Partner',
  Hypesquad:               '🏠 HypeSquad Events',
  BugHunterLevel1:         '🐛 Bug Hunter Nível 1',
  BugHunterLevel2:         '🐛 Bug Hunter Nível 2',
  HypeSquadOnlineHouse1:   '🏠 Bravery',
  HypeSquadOnlineHouse2:   '🏠 Brilliance',
  HypeSquadOnlineHouse3:   '🏠 Balance',
  PremiumEarlySupporter:   '⭐ Early Supporter',
  VerifiedDeveloper:       '🤖 Early Bot Developer',
  CertifiedModerator:      '🛡️ Certified Moderator',
  ActiveDeveloper:         '🛠️ Active Developer',
};

const NITRO    = { 0: 'Sem Nitro', 1: 'Nitro Classic', 2: 'Nitro', 3: 'Nitro Basic' };
const STATUS_EMOJI = {
  online: '🟢 Online', idle: '🟡 Ausente',
  dnd: '🔴 Não Perturbe', offline: '⚫ Offline',
};

// Níveis de confiança do AltDetector
const TRUST_LEVEL = {
  'highly-trusted':    { emoji: '🛡️', label: 'Altamente Confiável', cor: 0x57F287 },
  'trusted':           { emoji: '✅', label: 'Confiável',            cor: 0x43B581 },
  'normal':            { emoji: '🟦', label: 'Normal',               cor: 0x5865F2 },
  'newbie':            { emoji: '🟡', label: 'Iniciante',            cor: 0xFEE75C },
  'suspicious':        { emoji: '🟠', label: 'Suspeito',             cor: 0xFF7043 },
  'highly-suspicious': { emoji: '🔴', label: 'Muito Suspeito',       cor: 0xED4245 },
  'mega-suspicious':   { emoji: '💀', label: 'Alt / Scam',           cor: 0x000000 },
};

// ─── Consulta a API pública discord-lookup-api ────────────────────────────────
async function buscarDadosExtras(userId) {
  try {
    const res = await fetch(
      `https://discord-lookup-api.vercel.app/v1/user/${userId}`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ─── Abre modal ───────────────────────────────────────────────────────────────
async function abrirModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('modal_usuario')
    .setTitle('👤 Informações de Usuário');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('usuario_id')
        .setLabel('ID do usuário')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: 1234567890123456789')
        .setRequired(true)
    ),
  );
  await interaction.showModal(modal);
}

// ─── Processa e exibe as informações ─────────────────────────────────────────
async function processarModal(interaction) {
  await interaction.deferReply({ flags: 64 });

  const raw    = interaction.fields.getTextInputValue('usuario_id').trim();
  const userId = raw.replace(/\D/g, '');
  if (!userId) return interaction.editReply({ content: '❌ ID inválido.' });

  // Busca paralela: membro do servidor + dados extras da API pública
  let user, member, dadosExtras;
  try {
    [user, dadosExtras] = await Promise.all([
      interaction.client.users.fetch(userId, { force: true }),
      buscarDadosExtras(userId),
    ]);
  } catch {
    return interaction.editReply({ content: `❌ Usuário \`${userId}\` não encontrado.` });
  }
  try { member = await interaction.guild.members.fetch(userId); } catch { member = null; }

  // ── Trust Score (AltDetector) ─────────────────────────────────────────────
  let trustCategory = null;
  let trustScore    = null;
  if (member) {
    try {
      const result  = detector.check(member);
      trustCategory = detector.getCategory(result);
      trustScore    = result.total;
    } catch { /* ignora */ }
  }
  const trust = trustCategory ? TRUST_LEVEL[trustCategory] : null;

  // ── Cargo mais alto na hierarquia ─────────────────────────────────────────
  let cargoTopo = null;
  let corEmbed  = trust?.cor ?? 0x5865F2;
  if (member) {
    for (const h of HIERARQUIA) {
      if (member.roles.cache.has(h.id)) { cargoTopo = h; if (!trust) corEmbed = h.cor; break; }
    }
  }

  // ── Cargos ────────────────────────────────────────────────────────────────
  const cargosHierarquia = member
    ? HIERARQUIA.filter(h => member.roles.cache.has(h.id)).map(h => `<@&${h.id}>`).join(' ') || '_Nenhum_'
    : '_Não está no servidor_';

  const idsHierarquia = new Set(HIERARQUIA.map(h => h.id));
  const cargosExtras = member
    ? member.roles.cache
        .filter(r => r.id !== interaction.guild.id && !idsHierarquia.has(r.id))
        .sort((a, b) => b.position - a.position)
        .map(r => `<@&${r.id}>`).join(' ')
    : '';

  // ── Badges ────────────────────────────────────────────────────────────────
  const flags       = user.flags?.toArray() ?? [];
  const badgesTexto = flags.map(f => BADGES[f] ?? null).filter(Boolean).join(' · ') || '_Nenhuma_';

  // ── Nitro / Boost ─────────────────────────────────────────────────────────
  const nitroBase  = NITRO[user.premiumType ?? 0] ?? 'Sem Nitro';
  const isBooster  = member?.premiumSince != null;
  const nitroFinal = isBooster ? `${nitroBase} · 🚀 Booster` : nitroBase;

  // ── Convites ──────────────────────────────────────────────────────────────
  let totalConvites = 0;
  try {
    const invites = await interaction.guild.invites.fetch();
    invites.forEach(inv => { if (inv.inviter?.id === userId) totalConvites += inv.uses ?? 0; });
  } catch { /* sem permissão */ }

  // ── Ban check ─────────────────────────────────────────────────────────────
  let estaBanido = false;
  let banMotivo  = null;
  if (!member) {
    try {
      const entry = await interaction.guild.bans.fetch(userId);
      if (entry) { estaBanido = true; banMotivo = entry.reason ?? 'Sem motivo registrado'; }
    } catch { /* não banido */ }
  }

  // ── Servidores em comum ───────────────────────────────────────────────────
  const emComum = interaction.client.guilds.cache
    .filter(g => g.id !== interaction.guild.id && g.members.cache.has(userId))
    .map(g => `• **${g.name}**`)
    .join('\n') || '_Nenhum detectado_';

  // ── Dados extras da API pública ───────────────────────────────────────────
  const clan           = dadosExtras?.raw?.clan?.tag ?? null;
  const globalName     = dadosExtras?.global_name    ?? null;
  const accentColor    = dadosExtras?.accent_color   ?? null;
  const avatarDecor    = dadosExtras?.avatar_decoration ? '✅ Tem' : null;
  const primaryGuild   = dadosExtras?.raw?.primary_guild?.tag ?? null;

  // ── Timestamps ────────────────────────────────────────────────────────────
  const tsCreated = Math.floor(user.createdTimestamp / 1000);
  const tsJoined  = member ? Math.floor(member.joinedTimestamp / 1000) : null;
  const tsBoost   = member?.premiumSince ? Math.floor(member.premiumSince.getTime() / 1000) : null;
  const diasConta = Math.floor((Date.now() - user.createdTimestamp) / 86_400_000);
  const alertaNova = diasConta < 7;

  // ── Status e atividade ────────────────────────────────────────────────────
  const status       = STATUS_EMOJI[member?.presence?.status ?? 'offline'] ?? '⚫ Offline';
  const atividade    = member?.presence?.activities?.find(a => a.type !== 4)?.name ?? null;
  const estadoCustom = member?.presence?.activities?.find(a => a.type === 4)?.state ?? null;
  const apelido      = member?.nickname ?? '_Sem apelido_';

  // ── Cor do embed ──────────────────────────────────────────────────────────
  if (estaBanido) corEmbed = 0xED4245;
  else if (trust) corEmbed = trust.cor;
  else if (cargoTopo) corEmbed = cargoTopo.cor;
  else if (accentColor) corEmbed = accentColor;

  // ── Monta embed ───────────────────────────────────────────────────────────
  const embed = new EmbedBuilder()
    .setColor(corEmbed)
    .setThumbnail(user.displayAvatarURL({ size: 256 }))
    .setAuthor({
      name: estaBanido
        ? '🔨 BANIDO NESTE SERVIDOR'
        : (trust ? `${trust.emoji} ${trust.label}` : cargoTopo ? cargoTopo.nome : member ? 'Membro' : 'Fora do servidor'),
      iconURL: user.displayAvatarURL(),
    })
    .setTitle(`${user.bot ? '🤖 ' : ''}${user.username}${globalName && globalName !== user.username ? ` (${globalName})` : ''}`);

  // Alertas no topo
  const alertas = [];
  if (alertaNova)  alertas.push(`⚠️ **CONTA NOVA** — criada há ${diasConta} dia(s)!`);
  if (estaBanido)  alertas.push(`🔨 **Motivo do ban:** \`${banMotivo}\``);
  if (clan)        alertas.push(`🏷️ **Clan:** \`${clan}\``);
  if (primaryGuild) alertas.push(`🏰 **Guild principal:** \`${primaryGuild}\``);
  if (alertas.length) embed.setDescription(alertas.join('\n'));

  // Trust Score bar visual
  if (trust && trustScore !== null) {
    const barSize = 10;
    const filled  = Math.round((trustScore / 100) * barSize);
    const bar     = '█'.repeat(filled) + '░'.repeat(barSize - filled);
    embed.addFields({
      name: `${trust.emoji} Trust Score`,
      value: `\`${bar}\` **${trustScore}/100** — ${trust.label}`,
      inline: false,
    });
  }

  // Informações principais
  embed.addFields(
    { name: '🆔 ID',              value: `\`${userId}\``,                                    inline: true },
    { name: '💬 Apelido',         value: apelido,                                             inline: true },
    { name: '📡 Status',          value: status,                                              inline: true },
    { name: '📅 Conta criada',    value: `<t:${tsCreated}:D> · <t:${tsCreated}:R>\n_${diasConta} dia(s) atrás_`, inline: true },
    { name: '📥 Entrou',          value: tsJoined ? `<t:${tsJoined}:D> · <t:${tsJoined}:R>` : '_Fora do servidor_', inline: true },
    { name: '🚀 Boost desde',     value: tsBoost ? `<t:${tsBoost}:D> · <t:${tsBoost}:R>`   : '_Não boosta_',       inline: true },
    { name: '💎 Nitro',           value: nitroFinal,                                          inline: true },
    { name: '📨 Convites',        value: `**${totalConvites}** uso(s)`,                       inline: true },
    { name: '🏅 Badges',          value: badgesTexto,                                         inline: true },
  );

  // Extras da API pública
  const extrasLinha = [
    avatarDecor ? `🎨 Decoração de avatar` : null,
  ].filter(Boolean).join(' · ');
  if (extrasLinha) embed.addFields({ name: '✨ Extras', value: extrasLinha, inline: false });

  // Atividade
  if (atividade || estadoCustom) {
    embed.addFields({
      name: '🎮 Atividade',
      value: [atividade ? `**Jogando:** ${atividade}` : null, estadoCustom ? `💬 ${estadoCustom}` : null]
        .filter(Boolean).join('\n'),
      inline: false,
    });
  }

  // Cargos
  embed.addFields({ name: '🎭 Hierarquia no servidor', value: cargosHierarquia, inline: false });
  if (cargosExtras) embed.addFields({ name: '🏷️ Outros cargos', value: cargosExtras, inline: false });

  // Servidores em comum
  embed.addFields({ name: '🌐 Servidores em comum', value: emComum, inline: false });

  embed
    .setFooter({ text: `Consultado por ${interaction.user.username} • ${interaction.guild.name}` })
    .setTimestamp();

  // Banner
  const bannerUrl = dadosExtras?.banner?.link ?? (user.banner ? user.bannerURL({ size: 512 }) : null);
  if (bannerUrl) embed.setImage(bannerUrl);

  await interaction.editReply({ embeds: [embed] });
}

module.exports = { abrirModal, processarModal };
