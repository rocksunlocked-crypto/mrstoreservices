require('dotenv').config();

module.exports = {
  // ─── Discord ──────────────────────────────────────────────────────────────
  token:    process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId:  process.env.GUILD_ID,

  // ─── Canais ───────────────────────────────────────────────────────────────
  channels: {
    logs:             process.env.CANAL_LOGS              || '1530046463927648368',
    categoryTickets:  process.env.CATEGORY_TICKETS        || '1522657546345779360',
    loja:             process.env.CANAL_LOJA              || '1544177169440317440',
    anuncios:         process.env.CANAL_ANUNCIOS          || '',
    produtosFree:     process.env.CANAL_PRODUTOS_FREE     || '',
    categoryFree:     process.env.CATEGORY_FREE           || '1522465813112684716',
    logChannel:       process.env.LOG_CHANNEL_ID          || '1524326072701681664',
    // Canal onde o EMBED de log do transcript vai (log de atendimento)
    ticketTranscript: process.env.TICKET_TRANSCRIPT_CHANNEL || '1530046463927648368',
    // Canal onde o ARQUIVO HTML do transcript é enviado
    ticketHtml:       process.env.TICKET_HTML_CHANNEL       || '1545421003469885540',
    // Canal onde o painel de tickets é postado
    ticketPanel:      process.env.TICKET_PANEL_CHANNEL      || '1522587244614127676',
    verificacao:      process.env.VERIFICATION_CHANNEL_ID   || '1522464983537946785',
  },

  // ─── Cargos ───────────────────────────────────────────────────────────────
  roles: {
    owner:          process.env.CARGO_OWNER          || '1522459532469469225',
    chefe:          process.env.CARGO_CHEFE          || '1544859043871588402',
    bots:           process.env.CARGO_BOTS           || '1533017261634359326',
    aceitarCompra:  process.env.CARGO_ACEITAR_COMPRA || '1522791855597555842',
    loja:           process.env.CARGO_LOJA           || '1522806323446681741',
    parceiros:      process.env.CARGO_PARCEIROS      || '1543648460085923923',
    admin:          process.env.CARGO_ADMIN          || '1522458772801458236',
    mod:            process.env.CARGO_MOD            || '1522459007854575697',
    suporte:        process.env.CARGO_SUPORTE        || '1522457765161992292',
    verificador:    process.env.VERIFIED_ROLE_ID     || '1522463987151929474',
    pendente:       process.env.PENDING_ROLE_ID      || '1522456786622218280',
    clienteSupremo: process.env.CARGO_CLIENTE_SUPREMO || '1522458063573880984',
    clientePremium: process.env.CARGO_CLIENTE_PREMIUM || '1522457266119512114',
    cliente:        process.env.CARGO_CLIENTE         || '1522457009931419748',
    influenciador:  process.env.CARGO_INFLUENCIADOR  || '1529786619509342449',
    inscrito:       process.env.CARGO_INSCRITO       || '1522459297320144947',
    visitante:      process.env.CARGO_VISITANTE      || '1522456786622218280',
    booster:        process.env.CARGO_BOOSTER        || '1544176787552997516',
  },

  // ─── Hierarquia de staff ──────────────────────────────────────────────────
  staffHierarchy: [
    { key: 'owner',         id: process.env.CARGO_OWNER          || '1522459532469469225' },
    { key: 'admin',         id: process.env.CARGO_ADMIN          || '1522458772801458236' },
    { key: 'loja',          id: process.env.CARGO_LOJA           || '1522806323446681741' },
    { key: 'aceitarCompra', id: process.env.CARGO_ACEITAR_COMPRA || '1522791855597555842' },
    { key: 'mod',           id: process.env.CARGO_MOD            || '1522459007854575697' },
    { key: 'suporte',       id: process.env.CARGO_SUPORTE        || '1522457765161992292' },
  ],

  // ─── Bot Mr (painel interno) ──────────────────────────────────────────────
  botMr: {
    guildId:        process.env.GUILD_ID          || '1522456699082903572',
    voiceChannelId: process.env.VOICE_CHANNEL_ID  || '1522518246694191284',
    cargoChefe:     process.env.CARGO_CHEFE       || '1544859043871588402',
    cargoOwner:     process.env.CARGO_OWNER       || '1522459532469469225',
  },

  // ─── Tickets ──────────────────────────────────────────────────────────────
  tickets: {
    // Cargos usados no sistema avançado de tickets (denúncia/suporte/parceria)
    roles: {
      admin:     process.env.TICKET_ROLE_ADMIN   || process.env.CARGO_ADMIN   || '1522458772801458236',
      moderador: process.env.TICKET_ROLE_MOD     || process.env.CARGO_MOD     || '1522459007854575697',
      suporte:   process.env.TICKET_ROLE_SUPORTE || process.env.CARGO_SUPORTE || '1522457765161992292',
    },
    // Categorias (pastas do Discord) para cada tipo de ticket avançado
    categories: {
      suporte:  process.env.TICKET_CATEGORY_SUPORTE  || process.env.CATEGORY_TICKETS || '1522657546345779360',
      denuncia: process.env.TICKET_CATEGORY_DENUNCIA || process.env.CATEGORY_TICKETS || '1522657546345779360',
      parceria: process.env.TICKET_CATEGORY_PARCERIA || process.env.CATEGORY_TICKETS || '1522657546345779360',
    },
    maxTicketsPerUser: 1,
    autoCloseHours:    48,
    timeoutMinutos:    30,
    maxAbertos:        5,
  },

  // ─── OAuth2 / Gerador ─────────────────────────────────────────────────────
  oauth: {
    clientId:             process.env.CLIENT_ID,
    clientSecret:         process.env.DISCORD_CLIENT_SECRET,
    redirectUri:          process.env.OAUTH_REDIRECT_URI      || 'http://localhost:3000/oauth/callback',
    verificationGuildId:  process.env.VERIFICATION_GUILD_ID   || '1522456699082903572',
    verificationChannelId:process.env.VERIFICATION_CHANNEL_ID || '1522464983537946785',
    joinGuildIds: (process.env.JOIN_GUILD_IDS || process.env.VERIFICATION_GUILD_ID || '1522456699082903572')
                    .split(',').map(id => id.trim()).filter(Boolean),
    port: Number(process.env.PORT || 3000),
  },

  // ─── Níveis de cliente ────────────────────────────────────────────────────
  niveisCliente: [
    { nome: 'Supremo', minGasto: 1000, desconto: 25, roleKey: 'clienteSupremo', emoji: '👑' },
    { nome: 'Premium', minGasto: 200,  desconto: 10, roleKey: 'clientePremium', emoji: '💎' },
    { nome: 'Cliente', minGasto: 0.01, desconto: 0,  roleKey: 'cliente',        emoji: '🛒' },
  ],

  // ─── EFI Bank ─────────────────────────────────────────────────────────────
  efi: {
    clientId:        process.env.EFI_CLIENT_ID,
    clientSecret:    process.env.EFI_CLIENT_SECRET,
    sandbox:         process.env.EFI_SANDBOX === 'true',
    pixKey:          process.env.EFI_PIX_KEY,
    certificatePath: process.env.EFI_CERTIFICATE_PATH || './producao-940835-Loja 2.0.p12',
  },

  // ─── Webhook ──────────────────────────────────────────────────────────────
  webhook: {
    port: parseInt(process.env.WEBHOOK_PORT) || 3000,
    url:  process.env.WEBHOOK_URL || 'http://localhost:3000/webhook',
  },

  // ─── Banco de dados ───────────────────────────────────────────────────────
  dbPath: process.env.DB_PATH || './data/database.db',

  // ─── Geral ────────────────────────────────────────────────────────────────
  moeda:    process.env.MOEDA    || 'BRL',
  timezone: process.env.TIMEZONE || 'America/Sao_Paulo',

  // ─── Cores ────────────────────────────────────────────────────────────────
  colors: {
    primary:  0x5865F2, success:  0x57F287, error:    0xED4245,
    warning:  0xFEE75C, info:     0x5BC0DE, gold:     0xF1C40F,
    purple:   0x9B59B6, dark:     0x2C2F33, pix:      0x32BCAD,
    loja:     0xFF6B6B, coins:    0xFFD700, free:     0x2ECC71,
    danger:   0xED4245, denuncia: 0xED4245, suporte:  0x5865F2,
    parceria: 0x57F287, ticket:   0x2F3136,
  },

  // ─── Emojis ───────────────────────────────────────────────────────────────
  emojis: {
    ticket: '🎫', denuncia: '🚨', suporte: '🛠️', parceria: '🤝',
    close:  '🔒', open:     '🔓', claim:   '✋', transfer: '↔️',
    pin:    '📌', star:     '⭐', trash:   '🗑️', save:     '💾',
    user:   '👤', staff:    '👷', clock:   '🕐', check:    '✅',
    x:      '❌', warn:     '⚠️', note:    '📝', tag:      '🏷️',
    stats:  '📊', lock:     '🔐',
  },

  // ─── Prioridades ──────────────────────────────────────────────────────────
  priorities: {
    baixa:   { label: '🟢 Baixa',   color: 0x57F287 },
    media:   { label: '🟡 Média',   color: 0xFEE75C },
    alta:    { label: '🔴 Alta',    color: 0xED4245 },
    urgente: { label: '🚨 Urgente', color: 0xFF0000 },
  },

  // ─── Coins ────────────────────────────────────────────────────────────────
  coins: { valorPorCoin: 0.01, conversionRate: 100 },

  // ─── Anti-fraude ──────────────────────────────────────────────────────────
  antiFraude: {
    maxTentativasPagamento: parseInt(process.env.MAX_TENTATIVAS_PAGAMENTO) || 3,
    cooldownCompra:         parseInt(process.env.TEMPO_COOLDOWN_COMPRA)    || 300000,
    maxComprasDia:          10,
  },

  // ─── Produtos Free ────────────────────────────────────────────────────────
  produtosFree: {
    cooldownHoras: 24,
    exemptRoles: [
      process.env.CARGO_OWNER          || '1522459532469469225',
      process.env.CARGO_ACEITAR_COMPRA || '1522791855597555842',
    ],
  },

  // ─── Fidelidade ───────────────────────────────────────────────────────────
  fidelidade: {
    pontosPerReal: 1,
    niveis: [
      { nome: 'Bronze',   min: 0,     desconto: 0,  emoji: '🥉' },
      { nome: 'Prata',    min: 100,   desconto: 2,  emoji: '🥈' },
      { nome: 'Ouro',     min: 500,   desconto: 5,  emoji: '🥇' },
      { nome: 'Diamante', min: 1500,  desconto: 8,  emoji: '💎' },
      { nome: 'Mestre',   min: 5000,  desconto: 12, emoji: '👑' },
      { nome: 'Lendário', min: 15000, desconto: 15, emoji: '⚡' },
    ],
  },

  // ─── Afiliados ────────────────────────────────────────────────────────────
  afiliados: { comissaoPadrao: 5, minimoSaque: 20 },

  // ─── Cupons ───────────────────────────────────────────────────────────────
  cupons: { maxUsosPadrao: 100, validadeDiasPadrao: 30 },

  // ─── Anúncios ─────────────────────────────────────────────────────────────
  anuncios: { delayEntreEnvios: 1000, maxPorLote: 50 },
};
