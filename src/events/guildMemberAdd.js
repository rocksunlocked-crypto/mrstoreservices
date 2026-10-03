const { EmbedBuilder } = require('discord.js');
const { Usuarios }     = require('../database/database');
const { addCoins, COIN_EMOJI } = require('../systems/coins');

module.exports = {
  name: 'guildMemberAdd',
  async execute(member, client) {
    // ── Criar perfil ────────────────────────────────────────────────────────
    Usuarios.criar(member.id, member.user.username);

    // ── Sistema de convites por link Discord ────────────────────────────────
    try {
      const guild        = member.guild;
      const cacheAtual   = client.inviteCache.get(guild.id) || new Map();
      const invitesNovos = await guild.invites.fetch().catch(() => null);
      if (!invitesNovos) return;

      let inviterUsado = null;
      for (const [code, invite] of invitesNovos) {
        const usosAntigos = cacheAtual.get(code) || 0;
        if (invite.uses > usosAntigos) {
          inviterUsado = invite.inviter;
          break;
        }
      }

      client.inviteCache.set(guild.id, new Map(invitesNovos.map(i => [i.code, i.uses])));

      if (inviterUsado && inviterUsado.id !== member.id && !inviterUsado.bot) {
        // Verificar se esse convidado já ganhou coins antes (evita farm)
        const { db } = require('../database/database');
        const { v4: uuidv4 } = require('uuid');
        const jaRegistrado = db.prepare('SELECT 1 FROM convites WHERE convidado_id=?').get(member.id);
        if (jaRegistrado) {
          console.log(`[Convite] ${member.user.tag} já foi registrado anteriormente — sem coins.`);
          return;
        }

        // Registrar convite
        db.prepare('INSERT INTO convites (id, convidador_id, convidado_id, coins_ganhos) VALUES (?,?,?,?)').run(uuidv4(), inviterUsado.id, member.id, 5);

        Usuarios.garantir(inviterUsado.id, inviterUsado.username);
        const novoSaldo = addCoins(inviterUsado.id, 5, `Convite (link Discord) de ${member.user.tag}`);
        const convidador = await guild.members.fetch(inviterUsado.id).catch(() => null);
        if (convidador) {
          await convidador.send({
            embeds: [new EmbedBuilder()
              .setColor(0xFFD700)
              .setTitle(`${COIN_EMOJI} Alguém entrou pelo seu link!`)
              .setDescription([
                `**${member.user.username}** entrou pelo seu link de convite!`,
                `${COIN_EMOJI} **+5 coins** adicionados.`,
                `💰 Saldo: **${novoSaldo.toLocaleString('pt-BR')} coins**`,
              ].join('\n'))
              .setTimestamp()],
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.error('[GuildMemberAdd]', err.message);
    }
  },
};
