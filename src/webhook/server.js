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

// ─── Termos de Serviço ────────────────────────────────────────────────────────
app.get('/termos', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Termos de Serviço — MrStore</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',system-ui,sans-serif;background:#03030a;color:#eeeeff;line-height:1.7;padding:40px 20px}
.container{max-width:800px;margin:0 auto}
h1{font-size:28px;font-weight:900;margin-bottom:8px;background:linear-gradient(135deg,#e8b840,#f5d060,#c084fc);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.subtitle{color:#5a5a90;font-size:13px;margin-bottom:40px}
h2{font-size:18px;font-weight:700;color:#c4b5fd;margin:32px 0 12px;padding-left:12px;border-left:3px solid #6d28d9}
p,li{font-size:14px;color:#9090c0;margin-bottom:10px}
ul{padding-left:20px;margin-bottom:14px}
li{margin-bottom:6px}
strong{color:#eeeeff}
.footer{margin-top:48px;padding-top:20px;border-top:1px solid #1a1a30;font-size:12px;color:#3a3a60;text-align:center}
a{color:#a78bfa;text-decoration:none}
</style>
</head>
<body>
<div class="container">
  <h1>📜 Termos de Serviço</h1>
  <div class="subtitle">MrStore Services — Última atualização: outubro de 2026</div>

  <h2>1. Aceitação dos Termos</h2>
  <p>Ao utilizar os serviços oferecidos pela <strong>MrStore</strong> através do servidor Discord ou do site, você concorda com estes Termos de Serviço. Caso não concorde, não utilize nossos serviços.</p>

  <h2>2. Descrição dos Serviços</h2>
  <p>A MrStore oferece produtos e serviços digitais, incluindo mas não limitado a:</p>
  <ul>
    <li>Contas e acessos a jogos e plataformas digitais</li>
    <li>Softwares, menus e ferramentas para jogos</li>
    <li>Serviços de suporte e atendimento via Discord</li>
  </ul>

  <h2>3. Pagamentos e Reembolsos</h2>
  <p><strong>3.1.</strong> Todos os pagamentos são processados via PIX ou cartão de crédito. Os preços são exibidos em Reais (BRL).</p>
  <p><strong>3.2.</strong> Produtos digitais entregues <strong>não possuem direito a reembolso</strong>, salvo em casos de falha comprovada na entrega do produto.</p>
  <p><strong>3.3.</strong> Em caso de problemas, o cliente deve abrir um ticket no servidor Discord em até <strong>24 horas</strong> após a compra.</p>

  <h2>4. Uso Aceitável</h2>
  <p>O cliente concorda em não:</p>
  <ul>
    <li>Revender ou compartilhar produtos adquiridos sem autorização</li>
    <li>Realizar chargebacks indevidos ou fraudes de pagamento</li>
    <li>Usar os produtos para fins ilegais ou que violem os termos de terceiros</li>
    <li>Assediar ou ameaçar membros da equipe</li>
  </ul>

  <h2>5. Suspensão e Banimento</h2>
  <p>A MrStore se reserva o direito de suspender ou banir permanentemente qualquer usuário que viole estes termos, sem direito a reembolso.</p>

  <h2>6. Responsabilidade</h2>
  <p>A MrStore não se responsabiliza por:</p>
  <ul>
    <li>Danos causados pelo uso indevido dos produtos</li>
    <li>Banimentos em jogos decorrentes do uso dos produtos</li>
    <li>Problemas causados por terceiros (plataformas, APIs, etc.)</li>
  </ul>

  <h2>7. Alterações nos Termos</h2>
  <p>Estes termos podem ser alterados a qualquer momento. O uso continuado dos serviços após alterações implica na aceitação dos novos termos.</p>

  <h2>8. Contato</h2>
  <p>Em caso de dúvidas, entre em contato através do nosso servidor Discord ou abra um ticket de suporte.</p>

  <div class="footer">
    © 2026 MrStore Services — Todos os direitos reservados<br>
    <a href="/privacidade">Política de Privacidade</a>
  </div>
</div>
</body>
</html>`);
});

// ─── Política de Privacidade ──────────────────────────────────────────────────
app.get('/privacidade', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Política de Privacidade — MrStore</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',system-ui,sans-serif;background:#03030a;color:#eeeeff;line-height:1.7;padding:40px 20px}
.container{max-width:800px;margin:0 auto}
h1{font-size:28px;font-weight:900;margin-bottom:8px;background:linear-gradient(135deg,#e8b840,#f5d060,#c084fc);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.subtitle{color:#5a5a90;font-size:13px;margin-bottom:40px}
h2{font-size:18px;font-weight:700;color:#c4b5fd;margin:32px 0 12px;padding-left:12px;border-left:3px solid #6d28d9}
p,li{font-size:14px;color:#9090c0;margin-bottom:10px}
ul{padding-left:20px;margin-bottom:14px}
li{margin-bottom:6px}
strong{color:#eeeeff}
.footer{margin-top:48px;padding-top:20px;border-top:1px solid #1a1a30;font-size:12px;color:#3a3a60;text-align:center}
a{color:#a78bfa;text-decoration:none}
</style>
</head>
<body>
<div class="container">
  <h1>🔒 Política de Privacidade</h1>
  <div class="subtitle">MrStore Services — Última atualização: outubro de 2026</div>

  <h2>1. Dados Coletados</h2>
  <p>A MrStore coleta os seguintes dados ao usar nossos serviços:</p>
  <ul>
    <li><strong>ID do Discord:</strong> identificação única do usuário na plataforma Discord</li>
    <li><strong>Nome de usuário Discord:</strong> usado para identificação nos tickets e pedidos</li>
    <li><strong>Histórico de compras:</strong> produtos adquiridos, valores e datas</li>
    <li><strong>Endereço IP:</strong> registrado para fins de segurança no painel web</li>
  </ul>

  <h2>2. Uso dos Dados</h2>
  <p>Os dados coletados são utilizados exclusivamente para:</p>
  <ul>
    <li>Processar e entregar os produtos adquiridos</li>
    <li>Prevenir fraudes e chargebacks indevidos</li>
    <li>Gerenciar o histórico de atendimento e suporte</li>
    <li>Manter a segurança do painel de controle</li>
  </ul>

  <h2>3. Compartilhamento de Dados</h2>
  <p>A MrStore <strong>não vende, aluga ou compartilha</strong> seus dados pessoais com terceiros, exceto:</p>
  <ul>
    <li>Processadores de pagamento (EFI Bank / Stripe) — apenas os dados necessários para a transação</li>
    <li>Quando exigido por lei ou ordem judicial</li>
  </ul>

  <h2>4. Retenção dos Dados</h2>
  <p>Seus dados são mantidos enquanto você utiliza nossos serviços. Após solicitação de exclusão, os dados serão removidos em até <strong>30 dias</strong>, exceto registros financeiros que devem ser mantidos por obrigação legal.</p>

  <h2>5. Segurança</h2>
  <p>Implementamos medidas de segurança para proteger seus dados, incluindo:</p>
  <ul>
    <li>Senhas armazenadas com hash criptográfico (SHA-256 + salt)</li>
    <li>Acesso ao painel restrito por IP para cargos privilegiados</li>
    <li>Comunicação via HTTPS (SSL/TLS)</li>
  </ul>

  <h2>6. Seus Direitos</h2>
  <p>Você tem o direito de:</p>
  <ul>
    <li>Solicitar acesso aos seus dados pessoais</li>
    <li>Solicitar a correção de dados incorretos</li>
    <li>Solicitar a exclusão dos seus dados</li>
    <li>Retirar consentimento a qualquer momento</li>
  </ul>
  <p>Para exercer esses direitos, abra um ticket no nosso servidor Discord.</p>

  <h2>7. Cookies e Sessões</h2>
  <p>O painel web utiliza cookies de sessão para manter você autenticado. Esses cookies são temporários e expiram em <strong>7 dias</strong>. Não utilizamos cookies de rastreamento ou publicidade.</p>

  <h2>8. Contato</h2>
  <p>Em caso de dúvidas sobre privacidade, entre em contato através do servidor Discord ou abra um ticket de suporte.</p>

  <div class="footer">
    © 2026 MrStore Services — Todos os direitos reservados<br>
    <a href="/termos">Termos de Serviço</a>
  </div>
</div>
</body>
</html>`);
});

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
