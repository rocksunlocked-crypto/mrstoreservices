/**
 * Logger — 3 webhooks por categoria + 12 canais no servidor de logs dedicado
 *
 * Canais do servidor de logs (guild 1544995531812507708):
 *  Log 1  - 1544995532894904322  → Vendas / Compras
 *  Log 2  - 1544997501877223465  → Pagamentos confirmados
 *  Log 3  - 1544997952303403048  → Entregas
 *  Log 4  - 1544998030724571136  → Tickets abertos
 *  Log 5  - 1544998099590717500  → Tickets fechados
 *  Log 6  - 1544998187713175563  → Reembolsos
 *  Log 7  - 1544998313936424971  → Fraudes / Segurança
 *  Log 8  - 1544998439849431142  → Sistema / Config
 *  Log 9  - 1544998518609944617  → Estoque baixo
 *  Log 10 - 1544998594136768522  → Afiliados
 *  Log 11 - 1544998663321821204  → Caixas misteriosas
 *  Log 12 - 1544998939323797554  → Erros
 */

const { EmbedBuilder, WebhookClient } = require('discord.js');
const { db }  = require('../database/database');
const { v4: uuidv4 } = require('uuid');

let client = null;
let logsGuild = null;

// ─── Webhooks (categorias amplas) ────────────────────────────────────────────
const WEBHOOKS = {
  vendas:    'https://discord.com/api/webhooks/1544926092471570504/7GShc9c8kM5qEINCAlmOSVD7t2uHXw6mtMIbg09-6A-eSv59vXi-PmUANRHPudOtGheD',
  operacoes: 'https://discord.com/api/webhooks/1544109833689628774/6VDNPAl90ixO6X45eutAc8zbKn4jeMaV82AF94qDgtoG7VXwr4JeHtyEFIA6QXh27jD8',
  sistema:   'https://discord.com/api/webhooks/1544926332092424272/xzSHxux2NzogyLdOxv_do9QwVsfzBUI4_kMuHbiU1D3RoptrKiM7sGjwoJ6UuZ7tvjeS',
};

let hookVendas    = null;
let hookOperacoes = null;
let hookSistema   = null;
try { hookVendas    = new WebhookClient({ url: WEBHOOKS.vendas });    } catch {}
try { hookOperacoes = new WebhookClient({ url: WEBHOOKS.operacoes }); } catch {}
try { hookSistema   = new WebhookClient({ url: WEBHOOKS.sistema });   } catch {}

// ─── Mapeamento tipo → webhook + canal de log ─────────────────────────────────
const LOGS_GUILD_ID = '1544995531812507708';
const CANAIS = {
  compra:         '1544995532894904322',  // Log 1  — Vendas
  pagamento:      '1544997501877223465',  // Log 2  — Pagamentos
  entrega:        '1544997952303403048',  // Log 3  — Entregas
  ticket_aberto:  '1544998030724571136',  // Log 4  — Tickets abertos
  ticket_fechado: '1544998099590717500',  // Log 5  — Tickets fechados
  reembolso:      '1544998187713175563',  // Log 6  — Reembolsos
  fraude:         '1544998313936424971',  // Log 7  — Fraudes
  sistema:        '1544998439849431142',  // Log 8  — Sistema
  estoque_baixo:  '1544998518609944617',  // Log 9  — Estoque
  afiliado:       '1544998594136768522',  // Log 10 — Afiliados
  caixa_aberta:   '1544998663321821204',  // Log 11 — Caixas
  erro:           '1544998939323797554',  // Log 12 — Erros
};

const MAPA = {
  compra:         { hook: () => hookVendas,    cor: 0x57F287, emoji: '🛒', nome: 'Máximo Store • Vendas'    },
  pagamento:      { hook: () => hookVendas,    cor: 0x2ECC71, emoji: '💰', nome: 'Máximo Store • Vendas'    },
  caixa_aberta:   { hook: () => hookVendas,    cor: 0xFFD700, emoji: '🎁', nome: 'Máximo Store • Vendas'    },
  afiliado:       { hook: () => hookVendas,    cor: 0x9B59B6, emoji: '🤝', nome: 'Máximo Store • Vendas'    },
  estoque_baixo:  { hook: () => hookVendas,    cor: 0xFEE75C, emoji: '📉', nome: 'Máximo Store • Vendas'    },
  ticket_aberto:  { hook: () => hookOperacoes, cor: 0x5865F2, emoji: '🎫', nome: 'Máximo Store • Operações' },
  ticket_fechado: { hook: () => hookOperacoes, cor: 0x4F545C, emoji: '🔒', nome: 'Máximo Store • Operações' },
  reembolso:      { hook: () => hookOperacoes, cor: 0xE67E22, emoji: '↩️', nome: 'Máximo Store • Operações' },
  fraude:         { hook: () => hookSistema,   cor: 0xED4245, emoji: '🚨', nome: 'Máximo Store • Segurança' },
  sistema:        { hook: () => hookSistema,   cor: 0x5BC0DE, emoji: '⚙️', nome: 'Máximo Store • Sistema'  },
  erro:           { hook: () => hookSistema,   cor: 0xED4245, emoji: '❌', nome: 'Máximo Store • Sistema'  },
};

function setClient(c) {
  client = c;
  // Cachear guild de logs assim que o client estiver pronto
  if (c) {
    logsGuild = c.guilds.cache.get(LOGS_GUILD_ID) || null;
    c.guilds.fetch(LOGS_GUILD_ID).then(g => {
      logsGuild = c.guilds.cache.get(LOGS_GUILD_ID);
    }).catch(() => {});
  }
}

async function log(tipo, dados = {}) {
  try {
    // Salvar no banco sempre
    db.prepare(`INSERT INTO logs_acoes (id,tipo,executor_id,alvo_id,descricao,dados) VALUES (?,?,?,?,?,?)`)
      .run(
        uuidv4(), tipo,
        dados.executor || dados.executorId || null,
        dados.usuario  || dados.alvoId    || null,
        dados.descricao || '',
        JSON.stringify(dados),
      );

    const cfg = MAPA[tipo];

    // Montar embed
    const titulo = dados.titulo || tipo.replace(/_/g, ' ').toUpperCase();
    const desc   = dados.descricao || '';

    const embedBuilder = new EmbedBuilder()
      .setColor(cfg?.cor || 0x5865F2)
      .setTitle(`${cfg?.emoji || '📋'} ${titulo}`)
      .setTimestamp();

    if (desc) embedBuilder.setDescription(desc);

    const fields = [];
    if (dados.usuario)   fields.push({ name: '👤 Usuário',  value: `<@${dados.usuario}>`,                    inline: true });
    if (dados.executor)  fields.push({ name: '🔧 Executor', value: `<@${dados.executor}>`,                   inline: true });
    if (dados.valor)     fields.push({ name: '💵 Valor',    value: `R$ ${Number(dados.valor).toFixed(2)}`,   inline: true });
    if (dados.produto)   fields.push({ name: '📦 Produto',  value: String(dados.produto).slice(0, 100),      inline: true });
    if (dados.pedidoId)  fields.push({ name: '🆔 Pedido',   value: `\`${String(dados.pedidoId).slice(0,8).toUpperCase()}\``, inline: true });
    if (dados.ticketId)  fields.push({ name: '🎫 Ticket',   value: `\`${String(dados.ticketId)}\``,          inline: true });
    if (fields.length) embedBuilder.addFields(fields);

    const embedJson = embedBuilder.toJSON();

    // 1. Enviar para webhook categorizado
    if (cfg) {
      const hook = cfg.hook();
      if (hook) await hook.send({ username: cfg.nome, embeds: [embedJson] }).catch(() => {});
    }

    // 2. Enviar para canal no servidor de logs
    const canalId = CANAIS[tipo];
    if (canalId && client) {
      try {
        // Tentar guild de logs primeiro
        if (!logsGuild) logsGuild = client.guilds.cache.get(LOGS_GUILD_ID);
        const canal = logsGuild?.channels.cache.get(canalId);
        if (canal) {
          await canal.send({ embeds: [embedJson] }).catch(() => {});
        }
      } catch {}
    }
  } catch (err) {
    console.error('[Logger]', err.message);
  }
}

// Log no console com timestamp
const _log = console.log;
const _err = console.error;
console.log   = (...a) => _log('[LOG]', new Date().toLocaleTimeString('pt-BR'), ...a);
console.error = (...a) => _err('[ERR]', new Date().toLocaleTimeString('pt-BR'), ...a);

function getClient() { return client; }

module.exports = { setClient, getClient, log };
