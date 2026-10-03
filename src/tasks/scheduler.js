const cron = require('node-cron');
const { db, Pedidos, Usuarios } = require('../database/database');
const { log } = require('../utils/logger');
const config = require('../config');
const { EmbedBuilder } = require('discord.js');
const moment = require('moment-timezone');

module.exports = function iniciarScheduler(client) {
  // ── Expirar pedidos pendentes há mais de 35 min ───────────────────────────
  cron.schedule('*/10 * * * *', async () => {
    try {
      const limite = Math.floor(Date.now() / 1000) - 2100; // 35 min
      const pedidosExpirados = db.prepare(`
        SELECT * FROM pedidos WHERE status='pendente' AND criado_em < ?
      `).all(limite);

      for (const pedido of pedidosExpirados) {
        Pedidos.atualizar(pedido.id, { status: 'cancelado', motivo_cancel: 'Tempo de pagamento expirado (automático)' });
      }

      if (pedidosExpirados.length > 0) {
        console.log(`[Scheduler] ${pedidosExpirados.length} pedido(s) expirado(s).`);
      }
    } catch (err) {
      console.error('[Scheduler expirar pedidos]', err.message);
    }
  });

  // ── Fechar tickets inativos há mais de 24h ────────────────────────────────
  cron.schedule('0 */1 * * *', async () => {
    try {
      const limite = Math.floor(Date.now() / 1000) - 86400;
      const ticketsInativos = db.prepare("SELECT * FROM tickets WHERE status='aberto' AND criado_em < ?").all(limite);

      for (const ticket of ticketsInativos) {
        db.prepare("UPDATE tickets SET status='fechado', motivo='Fechado automaticamente por inatividade', fechado_em=strftime('%s','now') WHERE id=?").run(ticket.id);
        const guild = client.guilds.cache.first();
        if (!guild) continue;

        const canal = guild.channels.cache.get(ticket.canal_id);

        // Gerar e enviar transcrição antes de deletar o canal
        if (canal) {
          try {
            const { sendTranscript } = require('../utils/ticketTranscript');
            await sendTranscript(canal, ticket, null, 'Sistema (inatividade)');
          } catch {}

          await canal.send({
            embeds: [new EmbedBuilder()
              .setColor(config.colors.dark)
              .setTitle('🔒 Ticket Fechado por Inatividade')
              .setDescription('Este ticket foi encerrado automaticamente após 24h sem atividade.')
              .setTimestamp()],
          }).catch(() => {});
          setTimeout(() => canal.delete().catch(() => {}), 10000);
        }
      }

      if (ticketsInativos.length > 0) {
        console.log(`[Scheduler] ${ticketsInativos.length} ticket(s) fechado(s) por inatividade.`);
      }
    } catch (err) {
      console.error('[Scheduler fechar tickets]', err.message);
    }
  });

  // ── Relatório diário às 8h — via webhook ou DM do owner ──────────────────
  cron.schedule('0 8 * * *', async () => {
    try {
      const guild = client.guilds.cache.first();
      if (!guild) return;

      const ontem = Math.floor(new Date().setHours(0,0,0,0) / 1000) - 86400;
      const hoje  = Math.floor(new Date().setHours(0,0,0,0) / 1000);

      const stats = db.prepare(`
        SELECT COUNT(*) as vendas,
               COALESCE(SUM(valor_total),0) as receita,
               COUNT(DISTINCT usuario_id) as compradores
        FROM pedidos WHERE status IN ('pago','entregue') AND pago_em >= ? AND pago_em < ?
      `).get(ontem, hoje);

      const novos   = db.prepare('SELECT COUNT(*) as c FROM usuarios WHERE criado_em >= ? AND criado_em < ?').get(ontem, hoje).c;
      const tickets = db.prepare('SELECT COUNT(*) as c FROM tickets WHERE criado_em >= ? AND criado_em < ?').get(ontem, hoje).c;
      const convites = db.prepare('SELECT COUNT(*) as c FROM convites WHERE criado_em >= ? AND criado_em < ?').get(ontem, hoje).c;

      const embed = new EmbedBuilder()
        .setColor(config.colors.gold)
        .setTitle('📊 Relatório Diário')
        .setDescription(`**${moment.unix(ontem).tz(config.timezone).format('DD/MM/YYYY')}**`)
        .addFields(
          { name: '🛒 Vendas',       value: String(stats.vendas),                          inline: true },
          { name: '💰 Receita',      value: `R$ ${Number(stats.receita).toFixed(2)}`,      inline: true },
          { name: '👥 Compradores',  value: String(stats.compradores),                     inline: true },
          { name: '🆕 Novos',        value: String(novos),                                 inline: true },
          { name: '🎫 Tickets',      value: String(tickets),                               inline: true },
          { name: '🔗 Convites',     value: String(convites),                              inline: true },
        )
        .setTimestamp()
        .setFooter({ text: 'Máximo Store • Relatório Automático' });

      // Enviar para o owner por DM (não polui o canal de logs)
      const ownerRole = guild.roles.cache.get(config.roles.owner);
      if (ownerRole) {
        for (const [, member] of ownerRole.members) {
          await member.send({ embeds: [embed] }).catch(() => {});
        }
      }
    } catch (err) {
      console.error('[Scheduler relatório]', err.message);
    }
  });

  // ── Alerta de estoque baixo (a cada 6 horas) ─────────────────────────────
  cron.schedule('0 */6 * * *', async () => {
    try {
      const produtosBaixo = db.prepare(`
        SELECT p.*, (SELECT COUNT(*) FROM estoque_digital WHERE produto_id=p.id AND usado=0) as est_digital
        FROM produtos p WHERE p.ativo=1 AND p.tipo='digital'
      `).all().filter(p => p.est_digital <= 5 && p.est_digital >= 0);

      for (const p of produtosBaixo) {
        await log('estoque_baixo', {
          produto: p.nome,
          descricao: `Estoque baixo: **${p.nome}** — ${p.est_digital} unidade(s) restante(s)`,
        });
      }
    } catch (err) {
      console.error('[Scheduler estoque]', err.message);
    }
  });

  // ── Limpeza de carrinho abandonado (24h) ──────────────────────────────────
  cron.schedule('0 0 * * *', async () => {
    try {
      const limite = Math.floor(Date.now() / 1000) - 86400;
      const res = db.prepare('DELETE FROM carrinho WHERE adicionado < ?').run(limite);
      if (res.changes > 0) console.log(`[Scheduler] ${res.changes} item(ns) removido(s) de carrinhos abandonados.`);
    } catch (err) {
      console.error('[Scheduler carrinho]', err.message);
    }
  });

  // ── Notificações de pagamentos pendentes (lembretes) ─────────────────────
  cron.schedule('*/15 * * * *', async () => {
    try {
      const limite = Math.floor(Date.now() / 1000) - 900; // 15 min atrás
      const limite2 = Math.floor(Date.now() / 1000) - 1800; // 30 min atrás
      const pedidosPendentes = db.prepare(`
        SELECT * FROM pedidos WHERE status='pendente' AND criado_em BETWEEN ? AND ?
      `).all(limite2, limite);

      const guild = client.guilds.cache.first();
      if (!guild) return;

      for (const pedido of pedidosPendentes) {
        try {
          const member = await guild.members.fetch(pedido.usuario_id).catch(() => null);
          if (!member) continue;
          await member.send({
            embeds: [new EmbedBuilder()
              .setColor(config.colors.warning)
              .setTitle('⏰ Lembrete de Pagamento')
              .setDescription(`Você tem um pedido pendente de pagamento!\n\n🆔 Pedido: \`${pedido.id.slice(0,8).toUpperCase()}\`\n💵 Valor: R$ ${pedido.valor_total.toFixed(2)}\n\n⚠️ O pagamento expira em breve!`)
              .setTimestamp()],
          }).catch(() => {});
        } catch {}
      }
    } catch (err) {
      console.error('[Scheduler lembretes]', err.message);
    }
  });

  // ── KPI: Ranking de Coins — atualiza a cada 2s no canal fixo ────────────────
  const CANAL_KPI_COINS = '1544885444578254919';

  // ── Polling de verificação de pagamento PIX (a cada 3 segundos) ─────────────
  setInterval(async () => {
    try {
      const pedidosPendentes = db.prepare("SELECT * FROM pedidos WHERE status='pendente' AND metodo_pag='pix' AND criado_em > ?").all(Math.floor(Date.now() / 1000) - 1800);
      if (pedidosPendentes.length === 0) return;

      const efi = require('../systems/efi');
      const { processarEntrega } = require('../systems/loja');

      for (const pedido of pedidosPendentes) {
        if (!pedido.tx_id) continue;
        try {
          const status = await efi.consultarPix(pedido.tx_id);
          if (status?.status === 'CONCLUIDA' && status?.valor?.original) {
            console.log(`[Polling PIX] ✅ Pagamento confirmado: ${pedido.id.slice(0,8)} | TxID: ${pedido.tx_id}`);
            db.prepare("UPDATE pedidos SET status='pago', pago_em=strftime('%s','now') WHERE id=?").run(pedido.id);
            await processarEntrega(Pedidos.get(pedido.id), client);
          }
        } catch (e) {
          // Ignora erros de consulta individual
        }
      }
    } catch (err) {
      console.error('[Polling PIX]', err.message);
    }
  }, 3000); // 3 segundos
  let kpiMsgId = null;

  async function atualizarKpiCoins() {
    try {
      const guild = client.guilds.cache.first();
      if (!guild) return;
      const canal = guild.channels.cache.get(CANAL_KPI_COINS);
      if (!canal) return;

      const ownerIds = (() => {
        const ids = [];
        if (process.env.OWNER_DISCORD_ID) ids.push(process.env.OWNER_DISCORD_ID);
        // Também excluir quem tem cargo owner
        try {
          const cargoOwner = guild.roles.cache.get(require('../config').roles?.owner);
          if (cargoOwner) cargoOwner.members.forEach(m => ids.push(m.id));
        } catch {}
        return ids;
      })();

      const top = db.prepare(`
        SELECT nome, discord_id, coins
        FROM usuarios
        WHERE coins > 0
        ORDER BY coins DESC
        LIMIT 25
      `).all().filter(u => !ownerIds.includes(u.discord_id));

      const totalCoins    = Number(db.prepare("SELECT COALESCE(SUM(coins),0) as t FROM usuarios").get().t);
      const totalUsuarios = db.prepare("SELECT COUNT(*) as c FROM usuarios WHERE coins > 0").get().c;
      const agora = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });

      const posEmoji = ['🥇','🥈','🥉'];
      const linhas = top.map((u, i) => {
        const pos   = i < 3 ? posEmoji[i] : `\`${String(i + 1).padStart(2, ' ')}.\``;
        const coins = Number(u.coins).toLocaleString('pt-BR');
        const reais = `R$\u00a0${(Number(u.coins) * 0.01).toFixed(2)}`;
        const barra = gerarBarra(Number(u.coins), Number(top[0].coins));
        return `${pos} <@${u.discord_id}>\n   ${barra} **${coins}** 🪙 *(${reais})*`;
      });

      const embed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle('🏆 Ranking de Coins — Máximo Store')
        .setDescription(
          linhas.length
            ? linhas.join('\n\n')
            : '*Nenhum usuário com coins ainda.*'
        )
        .addFields(
          { name: '💰 Total em circulação', value: `**${totalCoins.toLocaleString('pt-BR')} coins**\n≈ R$ ${(totalCoins * 0.01).toFixed(2)}`, inline: true },
          { name: '👥 Usuários com coins',  value: `**${totalUsuarios}**`,                                                                      inline: true },
          { name: '🥇 Líder',              value: top.length ? `<@${top[0].discord_id}> — **${Number(top[0].coins).toLocaleString('pt-BR')}** 🪙` : '—', inline: true },
        )
        .setFooter({ text: `🔄 Atualizado às ${agora} • 100 coins = R$ 1,00` })
        .setTimestamp();

      if (kpiMsgId) {
        const msg = await canal.messages.fetch(kpiMsgId).catch(() => null);
        if (msg) {
          await msg.edit({ embeds: [embed] }).catch(() => { kpiMsgId = null; });
          return;
        }
      }

      // Deletar msgs antigas do bot e criar nova
      const msgs = await canal.messages.fetch({ limit: 10 }).catch(() => null);
      if (msgs) {
        for (const [, m] of msgs.filter(m => m.author.id === guild.client.user.id)) {
          await m.delete().catch(() => {});
        }
      }
      const nova = await canal.send({ embeds: [embed] });
      kpiMsgId = nova.id;
    } catch {}
  }

  function gerarBarra(valor, maximo, tamanho = 8) {
    if (!maximo) return '░'.repeat(tamanho);
    const preenchido = Math.round((valor / maximo) * tamanho);
    return '█'.repeat(preenchido) + '░'.repeat(tamanho - preenchido);
  }

  // Primeira execução imediata, depois a cada 2s
  setTimeout(async () => {
    await atualizarKpiCoins();
    setInterval(atualizarKpiCoins, 8000);
  }, 5000);
};

  console.log('⏰ Scheduler iniciado com sucesso!');
