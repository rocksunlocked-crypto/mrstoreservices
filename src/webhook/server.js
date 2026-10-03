const express = require('express');
const crypto  = require('crypto');
const path    = require('path');
const config  = require('../config');
const { Pedidos, Usuarios, Produtos, db } = require('../database/database');
const { log }           = require('../utils/logger');
const { Embeds, Rows }  = require('../utils/embeds');
const { entregarProduto } = require('../systems/loja');

const app = express();
app.use(express.json());

// ─── Cookies (necessário para o dashboard) ────────────────────────────────────
app.use((req, res, next) => {
  req.cookies = {};
  const raw = req.headers.cookie || '';
  raw.split(';').forEach(p => {
    const [k, ...v] = p.trim().split('=');
    if (k) req.cookies[k.trim()] = v.join('=').trim();
  });
  next();
});

// ─── Dashboard ────────────────────────────────────────────────────────────────
// initDashDB é chamado no start() após o banco principal estar pronto
app.use('/painel', require('../dashboard/router'));
// Redirecionar /dashboard para /painel (compatibilidade)
app.get('/dashboard*', (req, res) => res.redirect(301, req.url.replace('/dashboard', '/painel')));

// ─── Servir assets estáticos (thumbnail, etc.) ────────────────────────────────
app.use('/assets', express.static(path.join(__dirname, '../../assets')));

// ─── Webhook Stripe ───────────────────────────────────────────────────────────
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    res.status(200).json({ ok: true });
    const stripe  = require('../systems/stripe');
    const event   = stripe.verificarWebhook(req.body.toString(), req.headers['stripe-signature']);

    if (event.type === 'payment_intent.succeeded' || event.type === 'checkout.session.completed') {
      const pedidoId = event.data?.object?.metadata?.pedido_id;
      if (!pedidoId) return;

      const { Pedidos, db } = require('../database/database');
      const pedido = Pedidos.get(pedidoId);
      if (!pedido || pedido.status !== 'pendente') return;

      console.log(`[Stripe Webhook] Pagamento confirmado: ${pedidoId} | Tipo: ${event.type}`);
      db.prepare("UPDATE pedidos SET status='pago', pago_em=strftime('%s','now') WHERE id=?").run(pedidoId);

      const { processarEntrega } = require('../systems/loja');
      await processarEntrega(Pedidos.get(pedidoId), _client);
    }
  } catch (err) {
    console.error('[Stripe Webhook]', err.message);
  }
});

// ─── Rota de sucesso Stripe (redirect após pagamento) ─────────────────────────
app.get('/stripe/sucesso', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Pagamento Confirmado</title></head>
<body style="font-family:sans-serif;text-align:center;padding:40px;background:#23272a;color:#fff">
<h1>✅ Pagamento Confirmado!</h1>
<p>Seu pagamento foi recebido com sucesso.</p>
<p>Volte ao Discord — seu produto será entregue no privado em instantes.</p>
<p style="color:#aaa;margin-top:20px">Máximo Store</p>
</body></html>`);
});

app.get('/stripe/cancelar', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Cancelado</title></head>
<body style="font-family:sans-serif;text-align:center;padding:40px;background:#23272a;color:#fff">
<h1>❌ Pagamento Cancelado</h1>
<p>Você cancelou o pagamento. Seu pedido ainda está pendente no Discord.</p>
</body></html>`);
});
app.get('/transcript/:id', (req, res) => {
  try {
    const { db: database } = require('../database/database');
    const row = database.prepare('SELECT html FROM transcripts WHERE id=? OR ticket_id LIKE ?').get(req.params.id, `${req.params.id}%`);
    if (!row) return res.status(404).send('<h1>Transcript não encontrado</h1>');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(row.html);
  } catch (err) {
    res.status(500).send('<h1>Erro ao carregar transcript</h1>');
  }
});

let _client = null;

// ─── Webhook PIX EFI Bank ─────────────────────────────────────────────────────
app.post('/webhook/pix', async (req, res) => {
  try {
    res.status(200).json({ ok: true });

    const { pix } = req.body;
    if (!pix || !Array.isArray(pix)) return;

    for (const pagamento of pix) {
      const { txid, valor, horario, e2eId } = pagamento;
      if (!txid) continue;

      // Buscar pedido pelo txid
      const pedido = Pedidos.getByTxId(txid);
      if (!pedido) {
        console.log(`[Webhook] TxID desconhecido: ${txid}`);
        continue;
      }
      if (pedido.status !== 'pendente') continue;

      console.log(`[Webhook] ✅ Pagamento PIX recebido! Pedido: ${pedido.id.slice(0,8)} | Valor: R$${valor}`);

      // Confirmar pagamento no banco
      db.prepare(`UPDATE pedidos SET status='pago', tx_id=?, pago_em=strftime('%s','now'), nota_fiscal=? WHERE id=?`)
        .run(e2eId || txid, JSON.stringify({ txid, e2eId, valor, horario }), pedido.id);

      // Atualizar estatísticas do usuário
      const usuario = Usuarios.get(pedido.usuario_id);
      if (usuario) {
        const novoGasto = (usuario.total_gasto || 0) + pedido.valor_total;
        const novasCompras = (usuario.total_compras || 0) + 1;
        const pontos = Math.floor(pedido.valor_total);
        Usuarios.atualizar(pedido.usuario_id, { total_gasto: novoGasto, total_compras: novasCompras });
        Usuarios.addPontos(pedido.usuario_id, pontos);

        // Processar comissão de afiliado — sistema de 2 níveis
        if (pedido.afiliado_id) {
          const { distribuirComissoes } = require('../systems/afiliados');
          await distribuirComissoes(pedido, pedido.afiliado_id).catch(e => console.error('[Afiliados Webhook]', e.message));
        }
      }

      // Entregar via função central (caixa, coins ou produto)
      const { processarEntrega } = require('../systems/loja');
      await processarEntrega(Pedidos.getByTxId ? Pedidos.get(pedido.id) : pedido, _client);

      // Log
      const produto = Produtos.get(pedido.produto_id);
      await log('pagamento', {
        usuario: pedido.usuario_id,
        produto: produto?.nome || pedido.produto_id,
        valor: pedido.valor_total,
        pedidoId: pedido.id,
        descricao: `Pagamento PIX confirmado para ${produto?.nome}`,
      });
    }
  } catch (err) {
    console.error('[Webhook PIX]', err.message);
  }
});

// ─── Health check para Railway ────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    bot: 'Máximo Store',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', (req, res) => res.json({ ok: true }));

// ─── Iniciar servidor ─────────────────────────────────────────────────────────
async function start(client) {
  _client = client;
  const port = process.env.PORT || config.webhook.port;

  // Inicializar banco do dashboard (após o banco principal estar pronto)
  try {
    const { initDashDB } = require('../dashboard/db');
    initDashDB();
  } catch (e) { console.error('[Dashboard DB]', e.message); }

  return new Promise((resolve) => {
    const http   = require('http');
    const server = http.createServer(app);

    // ── Socket.io — Sinalização WebRTC para streaming ──────────────────────
    const { Server } = require('socket.io');
    const io = new Server(server, {
      cors: { origin: '*', methods: ['GET','POST'] },
      path: '/stream-signal',
    });

    // rooms: Map<roomId, { streamerId, viewers: Set<socketId> }>
    const rooms = new Map();

    io.on('connection', (socket) => {
      // Streamer anuncia sala
      socket.on('stream:start', ({ roomId, userId, quality }) => {
        rooms.set(roomId, { streamerId: socket.id, userId, quality, viewers: new Set() });
        socket.join(roomId);
        socket.roomId = roomId;
        socket.role   = 'streamer';
        io.emit('stream:list', getRoomList()); // atualiza lista para todos
        console.log(`[Stream] Sala ${roomId} aberta por ${userId} [${quality}]`);
      });

      // Viewer entra na sala
      socket.on('stream:join', ({ roomId, userId }) => {
        const room = rooms.get(roomId);
        if (!room) return socket.emit('stream:error', 'Sala não encontrada');
        room.viewers.add(socket.id);
        socket.join(roomId);
        socket.roomId = roomId;
        socket.role   = 'viewer';
        // Avisar streamer que novo viewer chegou
        io.to(room.streamerId).emit('stream:viewer-joined', { viewerId: socket.id, userId });
        socket.emit('stream:joined', { streamerId: room.streamerId, quality: room.quality });
        console.log(`[Stream] ${userId} entrou na sala ${roomId}`);
      });

      // Troca de ofertas/respostas/ICE (WebRTC signaling)
      socket.on('webrtc:offer',     ({ to, offer })     => io.to(to).emit('webrtc:offer',     { from: socket.id, offer }));
      socket.on('webrtc:answer',    ({ to, answer })    => io.to(to).emit('webrtc:answer',    { from: socket.id, answer }));
      socket.on('webrtc:ice',       ({ to, candidate }) => io.to(to).emit('webrtc:ice',       { from: socket.id, candidate }));

      // Streamer encerra sala
      socket.on('stream:stop', () => endRoom(socket, io, rooms));

      // Desconexão
      socket.on('disconnect', () => {
        if (socket.role === 'streamer') endRoom(socket, io, rooms);
        else if (socket.roomId) {
          const room = rooms.get(socket.roomId);
          if (room) room.viewers.delete(socket.id);
        }
      });

      // Listar salas ativas
      socket.on('stream:list-req', () => socket.emit('stream:list', getRoomList()));
    });

    function endRoom(socket, io, rooms) {
      const room = rooms.get(socket.roomId);
      if (room) {
        io.to(socket.roomId).emit('stream:ended');
        rooms.delete(socket.roomId);
        io.emit('stream:list', getRoomList());
        console.log(`[Stream] Sala ${socket.roomId} encerrada`);
      }
    }

    function getRoomList() {
      return [...rooms.entries()].map(([id, r]) => ({
        roomId:    id,
        userId:    r.userId,
        quality:   r.quality,
        viewers:   r.viewers.size,
      }));
    }

    // Expor io para uso em rotas do dashboard
    app._io = io;

    server.listen(port, () => {
      console.log(`🌐 Servidor webhook rodando na porta ${port}`);
      resolve();
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`⚠️  Porta ${port} já em uso — webhook PIX usando instância anterior.`);
      } else {
        console.error('[Webhook]', err.message);
      }
      resolve();
    });
  });
}

module.exports = { app, start };
