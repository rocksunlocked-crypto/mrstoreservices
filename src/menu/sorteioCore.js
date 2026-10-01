/**
 * sorteioCore.js
 * Funções centrais de sorteio: participar, encerrar, helpers.
 * Separado do sub-menu para evitar dependência circular.
 */

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const fs   = require('fs');
const path = require('path');

const ARQUIVO = path.join(__dirname, '../data/sorteios.json');

// ─── Persistência ─────────────────────────────────────────────────────────────
function carregar() {
  if (!fs.existsSync(ARQUIVO)) return {};
  try { return JSON.parse(fs.readFileSync(ARQUIVO, 'utf-8')); } catch { return {}; }
}
function salvar(dados) {
  const dir = path.dirname(ARQUIVO);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(ARQUIVO, JSON.stringify(dados, null, 2));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseDuracao(str) {
  const m = str?.match(/^(\d+)(s|m|h|d)$/i);
  if (!m) return null;
  const mult = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return parseInt(m[1]) * mult[m[2].toLowerCase()];
}

function sortearVencedores(lista, qtd) {
  return [...lista].sort(() => Math.random() - 0.5).slice(0, Math.min(qtd, lista.length));
}

// ─── Botões da mensagem de sorteio ────────────────────────────────────────────
function rowBotoesSorteio(msgId, qtdParticipantes) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`sorteio_participar_${msgId}`)
      .setLabel('🎟️ Participar')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`sorteio_participantes_${msgId}`)
      .setLabel(`👥 ${qtdParticipantes} participante(s)`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
  );
}

// ─── Botão participar ─────────────────────────────────────────────────────────
async function participar(interaction) {
  const msgId    = interaction.customId.replace('sorteio_participar_', '');
  const sorteios = carregar();
  const s        = sorteios[msgId];

  if (!s || s.encerrado || Date.now() > s.termino) {
    return interaction.reply({ content: '❌ Este sorteio já foi encerrado.', flags: 64 });
  }
  if (s.participantes.includes(interaction.user.id)) {
    return interaction.reply({ content: '⚠️ Você já está participando!', flags: 64 });
  }

  const member = interaction.member;

  if (s.cargoObrigId && !member.roles.cache.has(s.cargoObrigId)) {
    return interaction.reply({
      content: `❌ Você precisa ter o cargo <@&${s.cargoObrigId}> para participar!`,
      flags: 64,
    });
  }

  if (s.convitesMin > 0) {
    let total = 0;
    try {
      const invs = await interaction.guild.invites.fetch();
      invs.forEach(inv => {
        if (inv.inviter?.id === interaction.user.id) total += inv.uses || 0;
      });
    } catch {
      return interaction.reply({ content: '❌ Não consegui verificar seus convites.', flags: 64 });
    }
    if (total < s.convitesMin) {
      return interaction.reply({
        content: `❌ Você precisa ter convidado pelo menos **${s.convitesMin}** pessoa(s).\nSeus convites: **${total}**`,
        flags: 64,
      });
    }
  }

  s.participantes.push(interaction.user.id);
  salvar(sorteios);

  // Atualiza embed + botão contador
  try {
    const msg     = await interaction.channel.messages.fetch(msgId);
    const novaEm  = EmbedBuilder.from(msg.embeds[0]);
    const outrasRows = msg.components.filter(r =>
      !r.components.some(c =>
        c.customId?.startsWith('sorteio_participar_') ||
        c.customId?.startsWith('sorteio_participantes_')
      )
    );
    await msg.edit({
      embeds: [novaEm],
      components: [rowBotoesSorteio(msgId, s.participantes.length), ...outrasRows],
    });
  } catch { /* ignora */ }

  return interaction.reply({ content: '🎟️ Inscrito! Boa sorte! 🍀', flags: 64 });
}

// ─── Encerrar sorteio ─────────────────────────────────────────────────────────
async function encerrar(msgId, client, guild) {
  const sorteios = carregar();
  const s = sorteios[msgId];
  if (!s || s.encerrado) return;

  s.encerrado = true;
  salvar(sorteios);

  const canal = guild.channels.cache.get(s.canalId);
  if (!canal) return;

  let msg;
  try { msg = await canal.messages.fetch(msgId); } catch { return; }

  if (!s.participantes.length) {
    await msg.edit({
      embeds: [new EmbedBuilder()
        .setTitle(`🎉 ${s.titulo} — ENCERRADO`)
        .setDescription('😢 Ninguém participou.')
        .setColor(0x95A5A6).setTimestamp()],
      components: [],
    });
    return;
  }

  const vencedores = sortearVencedores(s.participantes, s.qtdVenc);
  const mencoes    = vencedores.map(id => `<@${id}>`).join(', ');

  await msg.edit({
    embeds: [new EmbedBuilder()
      .setTitle(`🎉 ${s.titulo} — ENCERRADO`)
      .setDescription(`🏆 **Vencedor(es):** ${mencoes}\n\n**${s.participantes.length}** participantes.`)
      .setColor(0xFFD700).setTimestamp()
      .setFooter({ text: 'Sorteio encerrado' })],
    components: [],
  });

  await canal.send({ content: `🎊 Parabéns ${mencoes}! Vocês venceram **${s.titulo}**!` });

  // ── Entrega prêmios e cargos ──────────────────────────────────────────────
  const linhasPremio = s.premio
    ? s.premio.split('\n').map(l => l.trim()).filter(Boolean)
    : [];

  for (let i = 0; i < vencedores.length; i++) {
    const vencedorId = vencedores[i];

    // Divide os prêmios igualmente entre os vencedores
    // Ex: 4 prêmios, 2 vencedores → cada um recebe 2
    // Ex: 3 prêmios, 2 vencedores → vencedor 1 recebe 2, vencedor 2 recebe 1
    // Ex: 1 prêmio,  2 vencedores → os dois recebem o mesmo
    let premioVencedor;
    if (linhasPremio.length === 0) {
      premioVencedor = '—';
    } else if (linhasPremio.length === 1) {
      premioVencedor = linhasPremio[0];
    } else {
      // Distribui as linhas em fatias para cada vencedor
      const total    = linhasPremio.length;
      const qtd      = vencedores.length;
      const porCada  = Math.floor(total / qtd);
      const extras   = total % qtd; // primeiros "extras" vencedores ganham 1 a mais
      const inicio   = i * porCada + Math.min(i, extras);
      const fim      = inicio + porCada + (i < extras ? 1 : 0);
      const fatia    = linhasPremio.slice(inicio, fim);
      premioVencedor = fatia.length ? fatia.join('\n') : linhasPremio[linhasPremio.length - 1];
    }

    // DM com prêmio
    try {
      const usuario = await client.users.fetch(vencedorId);
      await usuario.send({
        embeds: [new EmbedBuilder()
          .setTitle(`🎁 Você ganhou: ${s.titulo}!`)
          .setDescription(`Parabéns! Seu prêmio:\n\n\`\`\`\n${premioVencedor}\n\`\`\``)
          .setColor(0xFFD700).setTimestamp()
          .setFooter({ text: `Servidor: ${guild.name}` })],
      });
    } catch {
      canal.send({ content: `⚠️ Não consegui enviar o prêmio por DM para <@${vencedorId}>. Contate um admin.` }).catch(() => {});
    }

    // Cargo do prêmio (silencioso)
    if (s.cargoPremiId) {
      try {
        const member = await guild.members.fetch(vencedorId);
        await member.roles.add(s.cargoPremiId, `Venceu: ${s.titulo}`);
      } catch (err) {
        console.error(`[Sorteio] Erro ao dar cargo ao vencedor ${vencedorId}:`, err.message);
      }
    }
  }
}

module.exports = { carregar, salvar, parseDuracao, sortearVencedores, rowBotoesSorteio, participar, encerrar };
