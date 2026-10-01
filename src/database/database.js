const { initSqlJs, db } = require('./sqlite-sync');
const path = require('path');
const fs   = require('fs');
const config = require('../config');

async function init() {
  // Inicializa o sql.js (wasm) e abre/cria o banco
  await initSqlJs(config.dbPath);

  db.exec(`
    -- ─── Usuários ─────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS usuarios (
      id            TEXT PRIMARY KEY,
      discord_id    TEXT UNIQUE NOT NULL,
      nome          TEXT,
      email         TEXT,
      cpf           TEXT,
      saldo         REAL DEFAULT 0,
      pontos        INTEGER DEFAULT 0,
      nivel         TEXT DEFAULT 'Bronze',
      total_gasto   REAL DEFAULT 0,
      total_compras INTEGER DEFAULT 0,
      afiliado_de   TEXT,
      codigo_afil   TEXT UNIQUE,
      ganhos_afil   REAL DEFAULT 0,
      bloqueado     INTEGER DEFAULT 0,
      motivo_bloquio TEXT,
      criado_em     INTEGER DEFAULT (strftime('%s','now')),
      ultimo_acesso INTEGER DEFAULT (strftime('%s','now')),
      FOREIGN KEY (afiliado_de) REFERENCES usuarios(discord_id)
    );

    -- ─── Produtos ─────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS produtos (
      id            TEXT PRIMARY KEY,
      nome          TEXT NOT NULL,
      descricao     TEXT,
      preco         REAL NOT NULL,
      preco_promo   REAL,
      categoria     TEXT DEFAULT 'Geral',
      imagem_url    TEXT,
      estoque       INTEGER DEFAULT -1,
      tipo          TEXT DEFAULT 'digital',
      ativo         INTEGER DEFAULT 1,
      destaque      INTEGER DEFAULT 0,
      vendas        INTEGER DEFAULT 0,
      avaliacao     REAL DEFAULT 0,
      total_aval    INTEGER DEFAULT 0,
      criado_por    TEXT,
      criado_em     INTEGER DEFAULT (strftime('%s','now')),
      atualizado_em INTEGER DEFAULT (strftime('%s','now'))
    );

    -- ─── Estoque Digital ──────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS estoque_digital (
      id          TEXT PRIMARY KEY,
      produto_id  TEXT NOT NULL,
      conteudo    TEXT NOT NULL,
      usado       INTEGER DEFAULT 0,
      usado_por   TEXT,
      usado_em    INTEGER,
      pedido_id   TEXT,
      FOREIGN KEY (produto_id) REFERENCES produtos(id)
    );

    -- ─── Categorias ───────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS categorias (
      id        TEXT PRIMARY KEY,
      nome      TEXT NOT NULL,
      emoji     TEXT DEFAULT '📦',
      descricao TEXT,
      ativa     INTEGER DEFAULT 1,
      ordem     INTEGER DEFAULT 0
    );

    -- ─── Pedidos ──────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS pedidos (
      id              TEXT PRIMARY KEY,
      usuario_id      TEXT NOT NULL,
      produto_id      TEXT NOT NULL,
      quantidade      INTEGER DEFAULT 1,
      valor_unit      REAL NOT NULL,
      valor_total     REAL NOT NULL,
      desconto        REAL DEFAULT 0,
      cupom_usado     TEXT,
      afiliado_id     TEXT,
      comissao_afil   REAL DEFAULT 0,
      status          TEXT DEFAULT 'pendente',
      metodo_pag      TEXT,
      tx_id           TEXT,
      qr_code         TEXT,
      qr_code_img     TEXT,
      conteudo_entregue TEXT,
      nota_fiscal     TEXT,
      ticket_id       TEXT,
      cancelado_por   TEXT,
      motivo_cancel   TEXT,
      criado_em       INTEGER DEFAULT (strftime('%s','now')),
      pago_em         INTEGER,
      entregue_em     INTEGER,
      cancelado_em    INTEGER,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(discord_id),
      FOREIGN KEY (produto_id) REFERENCES produtos(id)
    );

    -- ─── Tickets ──────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS tickets (
      id          TEXT PRIMARY KEY,
      canal_id    TEXT UNIQUE,
      usuario_id  TEXT NOT NULL,
      pedido_id   TEXT,
      tipo        TEXT DEFAULT 'compra',
      status      TEXT DEFAULT 'aberto',
      atendente   TEXT,
      mensagens   INTEGER DEFAULT 0,
      fechado_por TEXT,
      motivo      TEXT,
      avaliacao   INTEGER,
      criado_em   INTEGER DEFAULT (strftime('%s','now')),
      fechado_em  INTEGER,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(discord_id)
    );

    -- ─── Cupons ───────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS cupons (
      id            TEXT PRIMARY KEY,
      codigo        TEXT UNIQUE NOT NULL,
      tipo          TEXT DEFAULT 'percentual',
      valor         REAL NOT NULL,
      min_compra    REAL DEFAULT 0,
      max_desconto  REAL,
      usos_max      INTEGER DEFAULT 100,
      usos_atual    INTEGER DEFAULT 0,
      validade      INTEGER,
      produto_id    TEXT,
      categoria     TEXT,
      criado_por    TEXT,
      ativo         INTEGER DEFAULT 1,
      criado_em     INTEGER DEFAULT (strftime('%s','now'))
    );

    -- ─── Usos de cupons por usuário ───────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS cupons_usos (
      cupom_id    TEXT NOT NULL,
      usuario_id  TEXT NOT NULL,
      pedido_id   TEXT,
      usado_em    INTEGER DEFAULT (strftime('%s','now')),
      PRIMARY KEY (cupom_id, usuario_id)
    );

    -- ─── Caixas Misteriosas ───────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS caixas_misteriosas (
      id          TEXT PRIMARY KEY,
      nome        TEXT NOT NULL,
      descricao   TEXT,
      preco       REAL NOT NULL,
      imagem_url  TEXT,
      ativa       INTEGER DEFAULT 1,
      vendas      INTEGER DEFAULT 0,
      criado_em   INTEGER DEFAULT (strftime('%s','now'))
    );

    -- ─── Itens das Caixas ─────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS caixa_itens (
      id          TEXT PRIMARY KEY,
      caixa_id    TEXT NOT NULL,
      nome        TEXT NOT NULL,
      descricao   TEXT,
      raridade    TEXT DEFAULT 'comum',
      chance      REAL NOT NULL,
      tipo_premio TEXT DEFAULT 'produto',
      premio_id   TEXT,
      valor       REAL,
      imagem_url  TEXT,
      FOREIGN KEY (caixa_id) REFERENCES caixas_misteriosas(id)
    );

    -- ─── Histórico de Caixas Abertas ──────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS caixas_abertas (
      id          TEXT PRIMARY KEY,
      caixa_id    TEXT NOT NULL,
      usuario_id  TEXT NOT NULL,
      item_id     TEXT NOT NULL,
      pedido_id   TEXT,
      aberta_em   INTEGER DEFAULT (strftime('%s','now')),
      FOREIGN KEY (caixa_id) REFERENCES caixas_misteriosas(id)
    );

    -- ─── Carrinho ─────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS carrinho (
      id          TEXT PRIMARY KEY,
      usuario_id  TEXT NOT NULL,
      produto_id  TEXT NOT NULL,
      quantidade  INTEGER DEFAULT 1,
      adicionado  INTEGER DEFAULT (strftime('%s','now')),
      UNIQUE(usuario_id, produto_id),
      FOREIGN KEY (produto_id) REFERENCES produtos(id)
    );

    -- ─── Avaliações ───────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS avaliacoes (
      id          TEXT PRIMARY KEY,
      produto_id  TEXT NOT NULL,
      usuario_id  TEXT NOT NULL,
      pedido_id   TEXT NOT NULL,
      nota        INTEGER NOT NULL CHECK(nota BETWEEN 1 AND 5),
      comentario  TEXT,
      criado_em   INTEGER DEFAULT (strftime('%s','now')),
      UNIQUE(pedido_id, usuario_id),
      FOREIGN KEY (produto_id) REFERENCES produtos(id)
    );

    -- ─── Notificações ─────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS notificacoes (
      id          TEXT PRIMARY KEY,
      usuario_id  TEXT NOT NULL,
      tipo        TEXT NOT NULL,
      titulo      TEXT,
      mensagem    TEXT NOT NULL,
      lida        INTEGER DEFAULT 0,
      criado_em   INTEGER DEFAULT (strftime('%s','now'))
    );

    -- ─── Reembolsos ───────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS reembolsos (
      id          TEXT PRIMARY KEY,
      pedido_id   TEXT NOT NULL,
      usuario_id  TEXT NOT NULL,
      valor       REAL NOT NULL,
      motivo      TEXT NOT NULL,
      status      TEXT DEFAULT 'pendente',
      analisado_por TEXT,
      resposta    TEXT,
      criado_em   INTEGER DEFAULT (strftime('%s','now')),
      resolvido_em INTEGER,
      FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
    );

    -- ─── Anti-fraude ──────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS tentativas_pagamento (
      usuario_id  TEXT NOT NULL,
      produto_id  TEXT,
      ip          TEXT,
      tentativas  INTEGER DEFAULT 1,
      bloqueado   INTEGER DEFAULT 0,
      ultimo      INTEGER DEFAULT (strftime('%s','now')),
      PRIMARY KEY (usuario_id)
    );

    -- ─── Transações de Saldo ──────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS transacoes (
      id          TEXT PRIMARY KEY,
      usuario_id  TEXT NOT NULL,
      tipo        TEXT NOT NULL,
      valor       REAL NOT NULL,
      saldo_ant   REAL,
      saldo_novo  REAL,
      descricao   TEXT,
      ref_id      TEXT,
      criado_em   INTEGER DEFAULT (strftime('%s','now'))
    );

    -- ─── Configurações do Bot ─────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS configuracoes (
      chave   TEXT PRIMARY KEY,
      valor   TEXT NOT NULL,
      tipo    TEXT DEFAULT 'string',
      descricao TEXT
    );

    -- ─── Logs de Ações ────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS logs_acoes (
      id          TEXT PRIMARY KEY,
      tipo        TEXT NOT NULL,
      executor_id TEXT,
      alvo_id     TEXT,
      descricao   TEXT,
      dados       TEXT,
      criado_em   INTEGER DEFAULT (strftime('%s','now'))
    );

    -- ─── Índices para performance ─────────────────────────────────────────────
    CREATE INDEX IF NOT EXISTS idx_pedidos_usuario ON pedidos(usuario_id);
    CREATE INDEX IF NOT EXISTS idx_pedidos_status ON pedidos(status);
    CREATE INDEX IF NOT EXISTS idx_pedidos_txid ON pedidos(tx_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_usuario ON tickets(usuario_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_canal ON tickets(canal_id);
    CREATE INDEX IF NOT EXISTS idx_estoque_produto ON estoque_digital(produto_id, usado);
    CREATE INDEX IF NOT EXISTS idx_cupons_codigo ON cupons(codigo);
    CREATE INDEX IF NOT EXISTS idx_notif_usuario ON notificacoes(usuario_id, lida);
    CREATE INDEX IF NOT EXISTS idx_transacoes_usuario ON transacoes(usuario_id);

    -- ─── Códigos de Coins ─────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS codigos_coins (
      id          TEXT PRIMARY KEY,
      codigo      TEXT UNIQUE NOT NULL,
      coins       INTEGER NOT NULL,
      usado       INTEGER DEFAULT 0,
      usado_por   TEXT,
      usado_em    INTEGER,
      criado_por  TEXT,
      criado_em   INTEGER DEFAULT (strftime('%s','now'))
    );

    -- ─── Códigos de Convite (gerados pelo próprio usuário) ───────────────────
    CREATE TABLE IF NOT EXISTS codigos_convite (
      id            TEXT PRIMARY KEY,
      codigo        TEXT UNIQUE NOT NULL,
      dono_id       TEXT NOT NULL,         -- quem gerou o código
      usos          INTEGER DEFAULT 0,
      criado_em     INTEGER DEFAULT (strftime('%s','now'))
    );

    -- ─── Registro de quem usou cada código de convite ─────────────────────────
    CREATE TABLE IF NOT EXISTS convite_usos (
      id            TEXT PRIMARY KEY,
      codigo_id     TEXT NOT NULL,
      usado_por     TEXT NOT NULL UNIQUE,  -- cada pessoa só usa uma vez
      coins_ganhos  INTEGER DEFAULT 15,
      usado_em      INTEGER DEFAULT (strftime('%s','now'))
    );

    -- ─── Convites ─────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS convites (
      id            TEXT PRIMARY KEY,
      convidador_id TEXT NOT NULL,
      convidado_id  TEXT NOT NULL UNIQUE,
      coins_ganhos  INTEGER DEFAULT 5,
      criado_em     INTEGER DEFAULT (strftime('%s','now'))
    );

    -- ─── Caixa Misteriosa Config ──────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS caixa_config (
      id          TEXT PRIMARY KEY,
      nome        TEXT NOT NULL DEFAULT 'Caixa Misteriosa',
      descricao   TEXT,
      preco       REAL NOT NULL DEFAULT 5.00,
      canal_id    TEXT,
      mensagem_id TEXT,
      imagem_url  TEXT,
      cor         TEXT DEFAULT 'FFD700',
      ativa       INTEGER DEFAULT 1,
      total_abertas INTEGER DEFAULT 0,
      criado_por  TEXT,
      criado_em   INTEGER DEFAULT (strftime('%s','now'))
    );

    -- ─── Itens da Caixa (variantes de produtos existentes com % de chance) ───
    CREATE TABLE IF NOT EXISTS caixa_itens_config (
      id          TEXT PRIMARY KEY,
      caixa_id    TEXT NOT NULL,
      variante_id TEXT NOT NULL,
      raridade    TEXT DEFAULT 'comum',
      chance      REAL NOT NULL,
      ativa       INTEGER DEFAULT 1,
      FOREIGN KEY (caixa_id) REFERENCES caixa_config(id),
      FOREIGN KEY (variante_id) REFERENCES variantes_produto(id)
    );

    -- ─── Histórico de Caixas Abertas ──────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS caixa_historico (
      id          TEXT PRIMARY KEY,
      caixa_id    TEXT NOT NULL,
      usuario_id  TEXT NOT NULL,
      variante_id TEXT NOT NULL,
      raridade    TEXT,
      pedido_id   TEXT,
      aberta_em   INTEGER DEFAULT (strftime('%s','now'))
    );

    -- ─── Inventário ───────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS inventario (
      id          TEXT PRIMARY KEY,
      usuario_id  TEXT NOT NULL,
      produto_id  TEXT NOT NULL,
      pedido_id   TEXT,
      conteudo    TEXT NOT NULL,
      resgatado   INTEGER DEFAULT 0,
      resgatado_em INTEGER DEFAULT (strftime('%s','now'))
    );

    -- ─── Coins (coluna adicionada no ALTER) ───────────────────────────────────
    -- ─── Anúncios enviados ────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS anuncios (
      id          TEXT PRIMARY KEY,
      titulo      TEXT NOT NULL,
      mensagem    TEXT NOT NULL,
      enviados    INTEGER DEFAULT 0,
      falhas      INTEGER DEFAULT 0,
      criado_por  TEXT,
      criado_em   INTEGER DEFAULT (strftime('%s','now'))
    );

    -- ─── Painéis de Produto por Canal ─────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS paineis_canal (
      id          TEXT PRIMARY KEY,
      canal_id    TEXT NOT NULL,
      produto_id  TEXT NOT NULL,
      mensagem_id TEXT,
      titulo      TEXT,
      descricao   TEXT,
      cor         TEXT DEFAULT '5865F2',
      imagem_url  TEXT,
      criado_por  TEXT,
      ativo       INTEGER DEFAULT 1,
      criado_em   INTEGER DEFAULT (strftime('%s','now'))
    );

    -- ─── Variantes de Produto (planos/itens) ──────────────────────────────────
    CREATE TABLE IF NOT EXISTS variantes_produto (
      id          TEXT PRIMARY KEY,
      produto_id  TEXT NOT NULL,
      nome        TEXT NOT NULL,
      descricao   TEXT,
      preco       REAL NOT NULL,
      estoque     INTEGER DEFAULT -1,
      ativo       INTEGER DEFAULT 1,
      ordem       INTEGER DEFAULT 0,
      criado_em   INTEGER DEFAULT (strftime('%s','now')),
      FOREIGN KEY (produto_id) REFERENCES produtos(id)
    );

    -- ─── Estoque digital por variante ─────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS estoque_variante (
      id          TEXT PRIMARY KEY,
      variante_id TEXT NOT NULL,
      conteudo    TEXT NOT NULL,
      usado       INTEGER DEFAULT 0,
      usado_por   TEXT,
      pedido_id   TEXT,
      usado_em    INTEGER,
      FOREIGN KEY (variante_id) REFERENCES variantes_produto(id)
    );
  `);

  // Adicionar coluna coins se não existir (migração segura)
  try { db.exec('ALTER TABLE usuarios ADD COLUMN coins INTEGER DEFAULT 0'); } catch {}
  // Adicionar coluna idioma se não existir
  try { db.exec("ALTER TABLE usuarios ADD COLUMN idioma TEXT DEFAULT 'pt-BR'"); } catch {}
  // Migração cupons — novas colunas
  try { db.exec('ALTER TABLE cupons ADD COLUMN usos_por_usuario INTEGER DEFAULT 1'); } catch {}
  try { db.exec('ALTER TABLE cupons ADD COLUMN lojas_validas TEXT DEFAULT NULL'); } catch {}

  // Migração variantes — data de ultima atualização de estoque
  try { db.exec('ALTER TABLE variantes_produto ADD COLUMN estoque_atualizado_em INTEGER DEFAULT NULL'); } catch {}

  // Tabela de transcripts armazenados
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS transcripts (
      id          TEXT PRIMARY KEY,
      ticket_id   TEXT NOT NULL,
      html        TEXT NOT NULL,
      criado_em   INTEGER DEFAULT (strftime('%s','now'))
    )`);
  } catch {}

  // Tabela de blacklist por CPF
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS cpf_blacklist (
      cpf       TEXT PRIMARY KEY,
      motivo    TEXT,
      criado_por TEXT,
      criado_em INTEGER DEFAULT (strftime('%s','now'))
    )`);
  } catch {}

  // Tabela de notificações de estoque
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS notif_estoque (
      id           TEXT PRIMARY KEY,
      usuario_id   TEXT NOT NULL,
      variante_id  TEXT NOT NULL,
      criado_em    INTEGER DEFAULT (strftime('%s','now')),
      UNIQUE(usuario_id, variante_id)
    )`);
  } catch {}

  // Tabela de saques de coins via PIX
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS saques_coins (
      id          TEXT PRIMARY KEY,
      usuario_id  TEXT NOT NULL,
      coins       INTEGER NOT NULL,
      valor_reais REAL NOT NULL,
      chave_pix   TEXT NOT NULL,
      tipo_chave  TEXT DEFAULT 'auto',
      status      TEXT DEFAULT 'pendente',
      aprovado_por TEXT,
      motivo_rejeicao TEXT,
      criado_em   INTEGER DEFAULT (strftime('%s','now')),
      resolvido_em INTEGER
    )`);
  } catch {}

  // Configurações padrão
  const cfgStmt = db.prepare(`INSERT OR IGNORE INTO configuracoes (chave, valor, tipo, descricao) VALUES (?, ?, ?, ?)`);
  const defaults = [
    ['loja_aberta', '1', 'boolean', 'Se a loja está aberta para compras'],
    ['manutencao', '0', 'boolean', 'Modo manutenção'],
    ['nome_loja', 'Máximo Store', 'string', 'Nome da loja'],
    ['banner_loja', '', 'string', 'URL do banner da loja'],
    ['taxa_afiliado', '5', 'number', 'Taxa de comissão padrão para afiliados (%)'],
    ['min_saque_afiliado', '20', 'number', 'Valor mínimo para saque de afiliados'],
    ['pontos_por_real', '1', 'number', 'Pontos de fidelidade por real gasto'],
    ['caixa_cooldown', '6', 'number', 'Horas de cooldown entre aberturas de caixa'],
  ];
  for (const d of defaults) cfgStmt.run(...d);

  console.log('✅ Banco de dados inicializado com sucesso!');
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const Usuarios = {
  get: (discordId) => db.prepare('SELECT * FROM usuarios WHERE discord_id = ?').get(discordId),
  criar: (discordId, nome) => {
    const { v4: uuidv4 } = require('uuid');
    const codigo = gerarCodigo();
    return db.prepare(`
      INSERT OR IGNORE INTO usuarios (id, discord_id, nome, codigo_afil)
      VALUES (?, ?, ?, ?)
    `).run(uuidv4(), discordId, nome, codigo);
  },
  garantir: (discordId, nome) => {
    Usuarios.criar(discordId, nome);
    return Usuarios.get(discordId);
  },
  atualizar: (discordId, dados) => {
    const campos = Object.keys(dados).map(k => `${k} = ?`).join(', ');
    return db.prepare(`UPDATE usuarios SET ${campos} WHERE discord_id = ?`)
      .run(...Object.values(dados), discordId);
  },
  addSaldo: (discordId, valor, descricao = '', refId = '') => {
    const { v4: uuidv4 } = require('uuid');
    return db.transaction(() => {
      const u = Usuarios.get(discordId);
      if (!u) return null;
      const novo = (u.saldo || 0) + valor;
      Usuarios.atualizar(discordId, { saldo: novo });
      db.prepare(`INSERT INTO transacoes (id, usuario_id, tipo, valor, saldo_ant, saldo_novo, descricao, ref_id) VALUES (?,?,?,?,?,?,?,?)`)
        .run(uuidv4(), discordId, valor > 0 ? 'credito' : 'debito', Math.abs(valor), u.saldo, novo, descricao, refId);
      return novo;
    })();
  },
  addPontos: (discordId, pontos) => {
    const u = Usuarios.get(discordId);
    if (!u) return;
    const novoPontos = (u.pontos || 0) + pontos;
    const nivel = calcularNivel(novoPontos);
    Usuarios.atualizar(discordId, { pontos: novoPontos, nivel });
  },
  bloquear: (discordId, motivo) => Usuarios.atualizar(discordId, { bloqueado: 1, motivo_bloquio: motivo }),
  desbloquear: (discordId) => Usuarios.atualizar(discordId, { bloqueado: 0, motivo_bloquio: null }),
  top: (limite = 10) => db.prepare('SELECT * FROM usuarios ORDER BY total_gasto DESC LIMIT ?').all(limite),
};

const Produtos = {
  get: (id) => db.prepare('SELECT * FROM produtos WHERE id = ?').get(id),
  listar: (categoria, apenasAtivos = true) => {
    let q = 'SELECT * FROM produtos WHERE 1=1';
    const params = [];
    if (apenasAtivos) { q += ' AND ativo = 1'; }
    if (categoria) { q += ' AND categoria = ?'; params.push(categoria); }
    q += ' ORDER BY destaque DESC, vendas DESC';
    return db.prepare(q).all(...params);
  },
  criar: (dados) => {
    const { v4: uuidv4 } = require('uuid');
    const id = uuidv4();
    db.prepare(`
      INSERT INTO produtos (id, nome, descricao, preco, preco_promo, categoria, imagem_url, estoque, tipo, criado_por)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, dados.nome, dados.descricao, dados.preco, dados.precoPromo || null,
        dados.categoria || 'Geral', dados.imagemUrl || null,
        dados.estoque !== undefined ? dados.estoque : -1,
        dados.tipo || 'digital', dados.criadoPor || null);
    return id;
  },
  atualizar: (id, dados) => {
    const campos = Object.keys(dados).map(k => `${k} = ?`).join(', ');
    return db.prepare(`UPDATE produtos SET ${campos}, atualizado_em = strftime('%s','now') WHERE id = ?`)
      .run(...Object.values(dados), id);
  },
  temEstoque: (id, qtd = 1) => {
    const p = Produtos.get(id);
    if (!p || !p.ativo) return false;
    if (p.estoque === -1) return true;
    if (p.tipo === 'digital') {
      const disponivel = db.prepare('SELECT COUNT(*) as c FROM estoque_digital WHERE produto_id = ? AND usado = 0').get(id);
      return disponivel.c >= qtd;
    }
    return p.estoque >= qtd;
  },
};

const Pedidos = {
  get: (id) => db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id),
  getByTxId: (txId) => db.prepare('SELECT * FROM pedidos WHERE tx_id = ?').get(txId),
  listarUsuario: (discordId, status) => {
    let q = 'SELECT p.*, pr.nome as produto_nome FROM pedidos p JOIN produtos pr ON p.produto_id = pr.id WHERE p.usuario_id = ?';
    const params = [discordId];
    if (status) { q += ' AND p.status = ?'; params.push(status); }
    q += ' ORDER BY p.criado_em DESC';
    return db.prepare(q).all(...params);
  },
  criar: (dados) => {
    const { v4: uuidv4 } = require('uuid');
    const id = uuidv4();
    db.prepare(`
      INSERT INTO pedidos (id, usuario_id, produto_id, quantidade, valor_unit, valor_total, desconto,
        cupom_usado, afiliado_id, comissao_afil, metodo_pag, ticket_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, dados.usuarioId, dados.produtoId, dados.quantidade || 1,
        dados.valorUnit, dados.valorTotal, dados.desconto || 0,
        dados.cupomUsado || null, dados.afiliadoId || null,
        dados.comissaoAfil || 0, dados.metodoPag || 'pix', dados.ticketId || null);
    return id;
  },
  atualizar: (id, dados) => {
    const campos = Object.keys(dados).map(k => `${k} = ?`).join(', ');
    return db.prepare(`UPDATE pedidos SET ${campos} WHERE id = ?`)
      .run(...Object.values(dados), id);
  },
  confirmarPagamento: db.transaction((pedidoId, txId) => {
    const p = Pedidos.get(pedidoId);
    if (!p) return false;
    Pedidos.atualizar(pedidoId, { status: 'pago', tx_id: txId, pago_em: Math.floor(Date.now() / 1000) });
    const u = Usuarios.get(p.usuario_id);
    if (u) {
      const novoGasto = (u.total_gasto || 0) + p.valor_total;
      const novasCompras = (u.total_compras || 0) + 1;
      const pontos = Math.floor(p.valor_total);
      Usuarios.atualizar(p.usuario_id, { total_gasto: novoGasto, total_compras: novasCompras });
      Usuarios.addPontos(p.usuario_id, pontos);
    }
    return true;
  }),
};

const Cupons = {
  get: (codigo) => db.prepare('SELECT * FROM cupons WHERE codigo = ? AND ativo = 1').get(codigo.toUpperCase()),
  validar: (codigo, usuarioId, valor, painelId = null) => {
    const c = Cupons.get(codigo);
    if (!c) return { valido: false, erro: '❌ Cupom inválido ou inexistente.' };
    if (c.usos_atual >= c.usos_max) return { valido: false, erro: '❌ Cupom esgotado.' };
    if (c.validade && c.validade < Math.floor(Date.now() / 1000)) return { valido: false, erro: '❌ Cupom expirado.' };
    if (valor < c.min_compra) return { valido: false, erro: `❌ Valor mínimo para este cupom: R$ ${Number(c.min_compra).toFixed(2)}` };

    // Verificar limite de usos por usuário
    const usosDoUsuario = db.prepare('SELECT COUNT(*) as c FROM cupons_usos WHERE cupom_id = ? AND usuario_id = ?').get(c.id, usuarioId)?.c || 0;
    const limiteUsos = c.usos_por_usuario ?? 1;
    if (usosDoUsuario >= limiteUsos) {
      return { valido: false, erro: `❌ Você já usou este cupom ${usosDoUsuario}x (limite: ${limiteUsos}x).` };
    }

    // Verificar lojas válidas (painelId)
    if (c.lojas_validas) {
      try {
        const lojas = JSON.parse(c.lojas_validas);
        if (Array.isArray(lojas) && lojas.length > 0 && painelId && !lojas.includes(painelId)) {
          return { valido: false, erro: '❌ Este cupom não é válido para este produto.' };
        }
      } catch {}
    }

    return { valido: true, cupom: c };
  },
  calcDesconto: (cupom, valor) => {
    let desc = cupom.tipo === 'percentual' ? (valor * cupom.valor / 100) : cupom.valor;
    if (cupom.max_desconto) desc = Math.min(desc, cupom.max_desconto);
    return Math.min(desc, valor);
  },
  usar: (cupomId, usuarioId, pedidoId) => {
    const { v4: uuidv4 } = require('uuid');
    // Inserir com id único para suportar múltiplos usos por usuário
    try {
      db.prepare('INSERT INTO cupons_usos (cupom_id, usuario_id, pedido_id) VALUES (?,?,?)').run(cupomId, usuarioId, pedidoId);
    } catch {
      // PRIMARY KEY conflita em uso único — tenta com id separado se a tabela tiver id
      db.prepare('INSERT OR IGNORE INTO cupons_usos (cupom_id, usuario_id, pedido_id) VALUES (?,?,?)').run(cupomId, usuarioId, pedidoId);
    }
    db.prepare('UPDATE cupons SET usos_atual = usos_atual + 1 WHERE id = ?').run(cupomId);
  },
};

const Tickets = {
  get: (canalId) => db.prepare('SELECT * FROM tickets WHERE canal_id = ?').get(canalId),
  getById: (id) => db.prepare('SELECT * FROM tickets WHERE id = ?').get(id),
  abertosUsuario: (usuarioId) => db.prepare("SELECT COUNT(*) as c FROM tickets WHERE usuario_id = ? AND status = 'aberto'").get(usuarioId).c,
  criar: (dados) => {
    const { v4: uuidv4 } = require('uuid');
    const id = uuidv4();
    db.prepare(`INSERT INTO tickets (id, canal_id, usuario_id, pedido_id, tipo) VALUES (?,?,?,?,?)`)
      .run(id, dados.canalId, dados.usuarioId, dados.pedidoId || null, dados.tipo || 'compra');
    return id;
  },
  atualizar: (canalId, dados) => {
    const campos = Object.keys(dados).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE tickets SET ${campos} WHERE canal_id = ?`).run(...Object.values(dados), canalId);
  },
};

const Config = {
  get: (chave) => {
    const r = db.prepare('SELECT valor, tipo FROM configuracoes WHERE chave = ?').get(chave);
    if (!r) return null;
    if (r.tipo === 'boolean') return r.valor === '1';
    if (r.tipo === 'number') return parseFloat(r.valor);
    return r.valor;
  },
  set: (chave, valor) => db.prepare('INSERT OR REPLACE INTO configuracoes (chave, valor, tipo) VALUES (?,?,?)').run(chave, String(valor), typeof valor === 'boolean' ? 'boolean' : typeof valor === 'number' ? 'number' : 'string'),
};

// ─── Utilitários ─────────────────────────────────────────────────────────────

function gerarCodigo(tamanho = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let cod = '';
  for (let i = 0; i < tamanho; i++) cod += chars[Math.floor(Math.random() * chars.length)];
  return cod;
}

function calcularNivel(pontos) {
  const config = require('../config');
  let nivel = 'Bronze';
  for (const n of config.fidelidade.niveis) {
    if (pontos >= n.min) nivel = n.nome;
  }
  return nivel;
}

module.exports = { db, init, Usuarios, Produtos, Pedidos, Cupons, Tickets, Config, gerarCodigo, calcularNivel };
