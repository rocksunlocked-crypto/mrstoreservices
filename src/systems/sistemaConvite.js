/**
 * Sistema de Convite por Código
 * - Cada usuário gera seu código único
 * - Quem usa o código ganha 15 coins
 * - Quem gerou o código ganha 5 coins por uso
 * - Cada pessoa só pode resgatar um código uma vez
 * - Quem entra no servidor já começa com 15 coins
 */

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { db, Usuarios } = require('../database/database');
const { addCoins, COIN_EMOJI } = require('./coins');
const { v4: uuidv4 }  = require('uuid');
const config           = require('../config');

const COINS_BOAS_VINDAS = 15;  // quem entra no servidor
const COINS_USAR_CODIGO = 15;  // quem usa o código de convite
const COINS_DONO_CODIGO = 5;   // quem gerou o código

// ─── Gerar código único para um usuário ──────────────────────────────────────
function gerarCodigoConvite(discordId, username) {
  // Verificar se já tem código
  const existente = db.prepare('SELECT * FROM codigos_convite WHERE dono_id=?').get(discordId);
  if (existente) return existente;

  // Gerar código no formato: NICK-XXXX (primeiros 4 chars do nick + 4 aleatórios)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const aleatorio = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const prefixo   = (username || 'USER').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4).padEnd(4, 'X');
  const codigo    = `${prefixo}-${aleatorio}`;

  const id = uuidv4();
  db.prepare('INSERT INTO codigos_convite (id, codigo, dono_id) VALUES (?,?,?)').run(id, codigo, discordId);
  return db.prepare('SELECT * FROM codigos_convite WHERE id=?').get(id);
}

// ─── Resgatar código de convite ───────────────────────────────────────────────
async function resgatarCodigoConvite(interaction, codigoInput) {
  if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true });

  const codigo  = codigoInput.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
  const usuario = Usuarios.garantir(interaction.user.id, interaction.user.username);

  // Verificar se já resgatou algum código
  const jaResgatou = db.prepare('SELECT * FROM convite_usos WHERE usado_por=?').get(interaction.user.id);
  if (jaResgatou) {
    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.error)
        .setTitle('❌ Código Já Resgatado')
        .setDescription('Você já resgatou um código de convite.\nCada pessoa só pode resgatar **uma vez**.')
        .setTimestamp()],
    });
  }

  // Buscar código
  const registro = db.prepare('SELECT * FROM codigos_convite WHERE codigo=?').get(codigo);
  if (!registro) {
    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.error)
        .setTitle('❌ Código Inválido')
        .setDescription(`O código \`${codigo}\` não existe.\nPeça para alguém te mandar o código de convite dele.`)
        .setTimestamp()],
    });
  }

  // Não pode usar o próprio código
  if (registro.dono_id === interaction.user.id) {
    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.warning)
        .setTitle('⚠️ Código Próprio')
        .setDescription('Você não pode resgatar seu próprio código de convite.')
        .setTimestamp()],
    });
  }

  // Registrar uso
  db.prepare('INSERT INTO convite_usos (id, codigo_id, usado_por, coins_ganhos) VALUES (?,?,?,?)').run(uuidv4(), registro.id, interaction.user.id, COINS_USAR_CODIGO);
  db.prepare('UPDATE codigos_convite SET usos=usos+1 WHERE id=?').run(registro.id);

  // Dar coins para quem usou
  const novoSaldoUsou = addCoins(interaction.user.id, COINS_USAR_CODIGO, `Código de convite resgatado: ${codigo}`);

  // Dar coins para o dono do código
  Usuarios.garantir(registro.dono_id, 'Usuário');
  const novoSaldoDono = addCoins(registro.dono_id, COINS_DONO_CODIGO, `Convite usado por ${interaction.user.username}`);

  // Notificar o dono do código
  const guild  = interaction.guild;
  const dono   = await guild?.members.fetch(registro.dono_id).catch(() => null);
  if (dono) {
    await dono.send({
      embeds: [new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle(`${COIN_EMOJI} Seu Código Foi Usado!`)
        .setDescription([
          `**${interaction.user.username}** usou o seu código de convite **\`${codigo}\`**!`,
          '',
          `${COIN_EMOJI} **+${COINS_DONO_CODIGO} coins** adicionados ao seu saldo.`,
          `💰 Saldo atual: **${novoSaldoDono.toLocaleString('pt-BR')} coins**`,
        ].join('\n'))
        .setTimestamp()
        .setFooter({ text: 'Máximo Store • Sistema de Convites' })],
    }).catch(() => {});
  }

  return interaction.editReply({
    embeds: [new EmbedBuilder()
      .setColor(config.colors.success)
      .setTitle(`${COIN_EMOJI} Código Resgatado!`)
      .setDescription([
        `✅ Código **\`${codigo}\`** resgatado com sucesso!`,
        '',
        `${COIN_EMOJI} **+${COINS_USAR_CODIGO} coins** adicionados ao seu saldo.`,
        `💰 Saldo atual: **${novoSaldoUsou.toLocaleString('pt-BR')} coins** (R$ ${(novoSaldoUsou * 0.01).toFixed(2)})`,
      ].join('\n'))
      .setTimestamp()
      .setFooter({ text: 'Máximo Store • Sistema de Convites' })],
  });
}

// ─── Mostrar código do usuário ────────────────────────────────────────────────
async function mostrarMeuCodigo(interaction) {
  if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true });

  const usuario = Usuarios.garantir(interaction.user.id, interaction.user.username);
  const reg     = gerarCodigoConvite(interaction.user.id, interaction.user.username);

  const usos = db.prepare(`
    SELECT COUNT(*) as c, COALESCE(SUM(coins_ganhos),0) as total
    FROM convite_usos WHERE codigo_id=?
  `).get(reg.id);

  const recentes = db.prepare(`
    SELECT cu.*, u.nome FROM convite_usos cu
    LEFT JOIN usuarios u ON cu.usado_por=u.discord_id
    WHERE cu.codigo_id=? ORDER BY cu.usado_em DESC LIMIT 5
  `).all(reg.id);

  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle('🔗 Meu Código de Convite')
    .setDescription([
      `> Compartilhe seu código para ganhar coins quando alguém usar!`,
      '',
      `**Seu código:**`,
      `# \`${reg.codigo}\``,
      '',
      `${COIN_EMOJI} **Você ganha:** ${COINS_DONO_CODIGO} coins por uso`,
      `${COIN_EMOJI} **Quem usa ganha:** ${COINS_USAR_CODIGO} coins`,
      '',
      `📊 **Total de usos:** ${usos.c}`,
      `${COIN_EMOJI} **Total ganho:** ${usos.total} coins`,
    ].join('\n'))
    .setTimestamp()
    .setFooter({ text: 'Máximo Store • Sistema de Convites' });

  if (recentes.length) {
    embed.addFields({
      name: '👥 Últimas pessoas que usaram',
      value: recentes.map(u => `• ${u.nome || u.usado_por} +${u.coins_ganhos}${COIN_EMOJI}`).join('\n'),
      inline: false,
    });
  }

  return interaction.editReply({ embeds: [embed] });
}

// ─── Enviar/atualizar embed do canal de convites ──────────────────────────────
async function enviarEmbedConvites(guild, canalId) {
  const canal = guild.channels.cache.get(canalId);
  if (!canal) return;

  const totalCodigos = db.prepare('SELECT COUNT(*) as c FROM codigos_convite').get().c;
  const totalUsos    = db.prepare('SELECT COUNT(*) as c FROM convite_usos').get().c;

  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle('🔗 Sistema de Convites')
    .setDescription([
      `> Convide amigos, ganhe coins e use códigos para receber bônus!`,
      '',
      `**Como funciona:**`,
      `🎁 **Entrar no servidor:** +${COINS_BOAS_VINDAS} ${COIN_EMOJI} automático`,
      `🔗 **Criar seu código:** grátis, compartilhe com amigos`,
      `${COIN_EMOJI} **Usar código de alguém:** +${COINS_USAR_CODIGO} coins para você`,
      `🤝 **Quando usam seu código:** +${COINS_DONO_CODIGO} coins para você`,
      '',
      `> ${COIN_EMOJI} 100 coins = R$ 1,00 em qualquer produto da loja!`,
    ].join('\n'))
    .addFields(
      { name: `${COIN_EMOJI} Boas vindas`,    value: `**+${COINS_BOAS_VINDAS} coins**\nAutomático ao entrar`, inline: true },
      { name: `🔗 Ao convidar`,               value: `**+${COINS_DONO_CODIGO} coins**\nPor cada pessoa`,      inline: true },
      { name: `🎁 Ao usar código`,            value: `**+${COINS_USAR_CODIGO} coins**\nUma vez por pessoa`,   inline: true },
    )
    .setTimestamp()
    .setFooter({ text: `Máximo Store • ${totalUsos} códigos usados • ${totalCodigos} usuários com código` });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('convite_criar_codigo').setLabel('🔗 Criar Meu Código').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('convite_usar_codigo').setLabel('🎁 Usar Código').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ver_saldo_coins').setLabel('💰 Ver Meus Coins').setStyle(ButtonStyle.Secondary),
  );

  // Verificar se já tem embed
  const msgs = await canal.messages.fetch({ limit: 10 }).catch(() => null);
  const existente = msgs?.find(m =>
    m.author.id === guild.client.user.id &&
    m.embeds.length > 0 &&
    m.embeds[0]?.title?.includes('Convite')
  );

  if (existente) {
    await existente.edit({ embeds: [embed], components: [row] }).catch(() => {});
  } else {
    await canal.send({ embeds: [embed], components: [row] });
  }
}

module.exports = {
  gerarCodigoConvite,
  resgatarCodigoConvite,
  mostrarMeuCodigo,
  enviarEmbedConvites,
  COINS_BOAS_VINDAS,
  COINS_USAR_CODIGO,
  COINS_DONO_CODIGO,
};
