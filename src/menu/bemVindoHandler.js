const { EmbedBuilder } = require('discord.js');

// ─── IDs ──────────────────────────────────────────────────────────────────────
const CANAL_BOAS_VINDAS = '1522456699082903573'; // canal público de boas-vindas (ajuste se necessário)
const CARGO_VISITANTE   = '1522456786622218280'; // Visitante

async function recepcionarMembro(member) {
  const { guild, user } = member;
  const criado  = Math.floor(user.createdTimestamp / 1000);
  const entrou  = Math.floor(Date.now() / 1000);
  const pos     = guild.memberCount;

  // ── Embed no canal de boas-vindas ─────────────────────────────────────────
  const canalBV = guild.channels.cache.get(CANAL_BOAS_VINDAS);
  if (canalBV) {
    const embed = new EmbedBuilder()
      .setTitle(`👋 Bem-vindo(a), ${user.username}!`)
      .setDescription(
        `> Você é o membro de número **#${pos}** do servidor!\n\n` +
        `Leia as regras e aproveite tudo que o servidor tem a oferecer. 🎉`
      )
      .setColor(0x57F287)
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: '📅 Conta criada',  value: `<t:${criado}:D> (<t:${criado}:R>)`, inline: true },
        { name: '📥 Entrou em',     value: `<t:${entrou}:F>`,                    inline: true },
      )
      .setFooter({ text: `${guild.name} • Seja bem-vindo!` })
      .setTimestamp();

    await canalBV.send({ content: `<@${user.id}>`, embeds: [embed] }).catch(() => {});
  }

  // ── DM de boas-vindas ─────────────────────────────────────────────────────
  try {
    const embedDM = new EmbedBuilder()
      .setTitle(`🎉 Bem-vindo(a) ao ${guild.name}!`)
      .setDescription(
        `Olá, **${user.username}**! Ficamos felizes em ter você aqui.\n\n` +
        `**O que você pode fazer:**\n` +
        `• Verificar os canais disponíveis\n` +
        `• Conferir nossos produtos na loja\n` +
        `• Participar dos sorteios\n` +
        `• Avaliar produtos que comprar\n\n` +
        `Qualquer dúvida, abra um ticket ou chame nossa equipe! 💬`
      )
      .setColor(0x5865F2)
      .setThumbnail(guild.iconURL({ size: 256 }) ?? null)
      .setFooter({ text: guild.name })
      .setTimestamp();

    await user.send({ embeds: [embedDM] });
  } catch { /* DMs fechadas — ignora */ }
}

async function despedirMembro(member) {
  const { guild, user } = member;
  const canalBV = guild.channels.cache.get(CANAL_BOAS_VINDAS);
  if (!canalBV) return;

  const embed = new EmbedBuilder()
    .setTitle('🚪 Membro saiu')
    .setDescription(`**${user.username}** saiu do servidor. Esperamos vê-lo de volta em breve!`)
    .setColor(0xED4245)
    .setThumbnail(user.displayAvatarURL())
    .addFields({ name: '👥 Membros restantes', value: `${guild.memberCount}`, inline: true })
    .setTimestamp();

  await canalBV.send({ embeds: [embed] }).catch(() => {});
}

module.exports = { recepcionarMembro, despedirMembro };
