/**
 * Configura permissões de todos os canais do servidor.
 * Execute UMA VEZ com: node utils/configurarCanais.js
 */

require('dotenv').config();
require('./inicializarDados').inicializar();

const { Client, GatewayIntentBits, PermissionFlagsBits } = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

// ─── IDs dos cargos ───────────────────────────────────────────────────────────
const C = {
  OWNER:           '1522459532469469225',
  BOTS:            '1533017261634359326',
  ACEITAR_COMPRA:  '1522791855597555842',
  LOJA:            '1522806323446681741',
  PARCEIROS:       '1543648460085923923',
  ADMIN:           '1522458772801458236',
  MOD:             '1522459007854575697',
  SUPORTE:         '1522457765161992292',
  CLI_SUPREMO:     '1522458063573880984',
  CLI_PREMIUM:     '1522457266119512114',
  CLIENTE:         '1522457009931419748',
  INFLUENCIADOR:   '1529786619509342449',
  INSCRITO:        '1522459297320144947',
  VERIFICADOR:     '1522463987151929474',
  VISITANTE:       '1522456786622218280',
  BOOSTER:         '1544176787552997516',
};

// Permissões prontas
const VER          = { ViewChannel: true };
const NAO_VER      = { ViewChannel: false };
const ESCREVER     = { ViewChannel: true, SendMessages: true, AddReactions: true };
const SO_LER       = { ViewChannel: true, SendMessages: false, AddReactions: false, ReadMessageHistory: true };
const ENTRAR_CALL  = { ViewChannel: true, Connect: true, Speak: true };
const SO_VER_CALL  = { ViewChannel: true, Connect: false };
const STAFF_CALL   = { ViewChannel: true, Connect: true, Speak: true, MuteMembers: true, DeafenMembers: true };
const NEGAR_TUDO   = { ViewChannel: false, SendMessages: false, Connect: false };

// ─── Configuração de cada canal ───────────────────────────────────────────────
// Formato: { canalId, permissoes: [ { roleId, perms } ] }
// everyone = null significa usar o ID do @everyone (resolvido abaixo)

function buildConfig(everyoneId) {
  return [

    // ══════════════════════════════════════════════════════════════════════════
    // CATEGORIA BEM VINDO
    // ══════════════════════════════════════════════════════════════════════════

    // #inscritos — todos veem, só staff escreve
    {
      id: '1522463682401927308',
      nome: '#inscritos',
      perms: [
        { id: everyoneId,       ...SO_LER },
        { id: C.OWNER,          ...ESCREVER },
        { id: C.ADMIN,          ...ESCREVER },
        { id: C.MOD,            ...ESCREVER },
        { id: C.SUPORTE,        ...SO_LER },
        { id: C.BOTS,           ...ESCREVER },
      ],
    },

    // #termos — todos veem e leem, ninguém escreve
    {
      id: '1522464983537946785',
      nome: '#termos',
      perms: [
        { id: everyoneId,       ...SO_LER },
        { id: C.OWNER,          ...ESCREVER },
        { id: C.ADMIN,          ...ESCREVER },
        { id: C.BOTS,           ...ESCREVER },
      ],
    },

    // #entrada-e-saida — todos veem, só bot escreve
    {
      id: '1524326072701681664',
      nome: '#entrada-e-saida',
      perms: [
        { id: everyoneId,       ...SO_LER },
        { id: C.OWNER,          ...ESCREVER },
        { id: C.BOTS,           ...ESCREVER },
      ],
    },

    // ══════════════════════════════════════════════════════════════════════════
    // CATEGORIA GRATUITOS
    // ══════════════════════════════════════════════════════════════════════════

    {
      id: '1530608693060571287',
      nome: '#gratuitos (referência)',
      perms: [
        { id: everyoneId,       ...NAO_VER },
        { id: C.VISITANTE,      ...SO_LER },
        { id: C.INSCRITO,       ...SO_LER },
        { id: C.VERIFICADOR,    ...SO_LER },
        { id: C.CLIENTE,        ...SO_LER },
        { id: C.CLI_PREMIUM,    ...SO_LER },
        { id: C.CLI_SUPREMO,    ...SO_LER },
        { id: C.INFLUENCIADOR,  ...SO_LER },
        { id: C.PARCEIROS,      ...SO_LER },
        { id: C.BOOSTER,        ...SO_LER },
        { id: C.SUPORTE,        ...ESCREVER },
        { id: C.MOD,            ...ESCREVER },
        { id: C.ADMIN,          ...ESCREVER },
        { id: C.LOJA,           ...ESCREVER },
        { id: C.ACEITAR_COMPRA, ...ESCREVER },
        { id: C.OWNER,          ...ESCREVER },
        { id: C.BOTS,           ...ESCREVER },
      ],
    },

    // ══════════════════════════════════════════════════════════════════════════
    // CATEGORIA LOJA FIVEM
    // ══════════════════════════════════════════════════════════════════════════

    {
      id: '1541882411426517052',
      nome: '#loja-fivem (referência)',
      perms: [
        { id: everyoneId,       ...NAO_VER },
        { id: C.VISITANTE,      ...SO_LER },
        { id: C.INSCRITO,       ...SO_LER },
        { id: C.VERIFICADOR,    ...SO_LER },
        { id: C.CLIENTE,        ...SO_LER },
        { id: C.CLI_PREMIUM,    ...SO_LER },
        { id: C.CLI_SUPREMO,    ...SO_LER },
        { id: C.INFLUENCIADOR,  ...SO_LER },
        { id: C.PARCEIROS,      ...SO_LER },
        { id: C.BOOSTER,        ...SO_LER },
        { id: C.SUPORTE,        ...ESCREVER },
        { id: C.MOD,            ...ESCREVER },
        { id: C.ADMIN,          ...ESCREVER },
        { id: C.LOJA,           ...ESCREVER },
        { id: C.ACEITAR_COMPRA, ...ESCREVER },
        { id: C.OWNER,          ...ESCREVER },
        { id: C.BOTS,           ...ESCREVER },
      ],
    },

    // ══════════════════════════════════════════════════════════════════════════
    // CATEGORIA LOJA FREE FIRE
    // ══════════════════════════════════════════════════════════════════════════

    {
      id: '1530608758575726793',
      nome: '#loja-freefire (referência)',
      perms: [
        { id: everyoneId,       ...NAO_VER },
        { id: C.VISITANTE,      ...SO_LER },
        { id: C.INSCRITO,       ...SO_LER },
        { id: C.VERIFICADOR,    ...SO_LER },
        { id: C.CLIENTE,        ...SO_LER },
        { id: C.CLI_PREMIUM,    ...SO_LER },
        { id: C.CLI_SUPREMO,    ...SO_LER },
        { id: C.INFLUENCIADOR,  ...SO_LER },
        { id: C.PARCEIROS,      ...SO_LER },
        { id: C.BOOSTER,        ...SO_LER },
        { id: C.SUPORTE,        ...ESCREVER },
        { id: C.MOD,            ...ESCREVER },
        { id: C.ADMIN,          ...ESCREVER },
        { id: C.LOJA,           ...ESCREVER },
        { id: C.ACEITAR_COMPRA, ...ESCREVER },
        { id: C.OWNER,          ...ESCREVER },
        { id: C.BOTS,           ...ESCREVER },
      ],
    },

    // ══════════════════════════════════════════════════════════════════════════
    // CATEGORIA LOJA EXTRA
    // ══════════════════════════════════════════════════════════════════════════

    {
      id: '1544289088692162710',
      nome: '#loja-extra (referência)',
      perms: [
        { id: everyoneId,       ...NAO_VER },
        { id: C.VISITANTE,      ...SO_LER },
        { id: C.INSCRITO,       ...SO_LER },
        { id: C.VERIFICADOR,    ...SO_LER },
        { id: C.CLIENTE,        ...SO_LER },
        { id: C.CLI_PREMIUM,    ...SO_LER },
        { id: C.CLI_SUPREMO,    ...SO_LER },
        { id: C.INFLUENCIADOR,  ...SO_LER },
        { id: C.PARCEIROS,      ...SO_LER },
        { id: C.BOOSTER,        ...SO_LER },
        { id: C.SUPORTE,        ...ESCREVER },
        { id: C.MOD,            ...ESCREVER },
        { id: C.ADMIN,          ...ESCREVER },
        { id: C.LOJA,           ...ESCREVER },
        { id: C.ACEITAR_COMPRA, ...ESCREVER },
        { id: C.OWNER,          ...ESCREVER },
        { id: C.BOTS,           ...ESCREVER },
      ],
    },

    // ══════════════════════════════════════════════════════════════════════════
    // CATEGORIA UTILIDADES
    // ══════════════════════════════════════════════════════════════════════════

    {
      id: '1534449168750215219',
      nome: '#utilidades (referência)',
      perms: [
        { id: everyoneId,       ...NAO_VER },
        { id: C.VISITANTE,      ...SO_LER },
        { id: C.INSCRITO,       ...SO_LER },
        { id: C.VERIFICADOR,    ...SO_LER },
        { id: C.CLIENTE,        ...SO_LER },
        { id: C.CLI_PREMIUM,    ...SO_LER },
        { id: C.CLI_SUPREMO,    ...SO_LER },
        { id: C.INFLUENCIADOR,  ...SO_LER },
        { id: C.PARCEIROS,      ...SO_LER },
        { id: C.BOOSTER,        ...SO_LER },
        { id: C.SUPORTE,        ...ESCREVER },
        { id: C.MOD,            ...ESCREVER },
        { id: C.ADMIN,          ...ESCREVER },
        { id: C.OWNER,          ...ESCREVER },
        { id: C.BOTS,           ...ESCREVER },
      ],
    },

    // ══════════════════════════════════════════════════════════════════════════
    // CATEGORIA COMUNIDADE
    // ══════════════════════════════════════════════════════════════════════════

    // #anti-spam — todos escrevem (com exceção de visitante não verificado)
    {
      id: '1529777783629414481',
      nome: '#anti-spam',
      perms: [
        { id: everyoneId,       ...NAO_VER },
        { id: C.VISITANTE,      ...ESCREVER },
        { id: C.INSCRITO,       ...ESCREVER },
        { id: C.VERIFICADOR,    ...ESCREVER },
        { id: C.CLIENTE,        ...ESCREVER },
        { id: C.CLI_PREMIUM,    ...ESCREVER },
        { id: C.CLI_SUPREMO,    ...ESCREVER },
        { id: C.INFLUENCIADOR,  ...ESCREVER },
        { id: C.PARCEIROS,      ...ESCREVER },
        { id: C.BOOSTER,        ...ESCREVER },
        { id: C.SUPORTE,        ...ESCREVER },
        { id: C.MOD,            ...ESCREVER },
        { id: C.ADMIN,          ...ESCREVER },
        { id: C.OWNER,          ...ESCREVER },
        { id: C.BOTS,           ...ESCREVER },
      ],
    },

    // #chat-geral — todos com cargo básico escrevem
    {
      id: '1530560930880950362',
      nome: '#chat-geral',
      perms: [
        { id: everyoneId,       ...NAO_VER },
        { id: C.VISITANTE,      ...SO_LER },
        { id: C.INSCRITO,       ...ESCREVER },
        { id: C.VERIFICADOR,    ...ESCREVER },
        { id: C.CLIENTE,        ...ESCREVER },
        { id: C.CLI_PREMIUM,    ...ESCREVER },
        { id: C.CLI_SUPREMO,    ...ESCREVER },
        { id: C.INFLUENCIADOR,  ...ESCREVER },
        { id: C.PARCEIROS,      ...ESCREVER },
        { id: C.BOOSTER,        ...ESCREVER },
        { id: C.SUPORTE,        ...ESCREVER },
        { id: C.MOD,            ...ESCREVER },
        { id: C.ADMIN,          ...ESCREVER },
        { id: C.OWNER,          ...ESCREVER },
        { id: C.BOTS,           ...ESCREVER },
      ],
    },

    // #divulgacao — só parceiros e staff postam
    {
      id: '1529782564804362281',
      nome: '#divulgacao',
      perms: [
        { id: everyoneId,       ...NAO_VER },
        { id: C.VISITANTE,      ...SO_LER },
        { id: C.INSCRITO,       ...SO_LER },
        { id: C.VERIFICADOR,    ...SO_LER },
        { id: C.CLIENTE,        ...SO_LER },
        { id: C.CLI_PREMIUM,    ...SO_LER },
        { id: C.CLI_SUPREMO,    ...SO_LER },
        { id: C.INFLUENCIADOR,  ...SO_LER },
        { id: C.PARCEIROS,      ...ESCREVER },
        { id: C.BOOSTER,        ...SO_LER },
        { id: C.SUPORTE,        ...ESCREVER },
        { id: C.MOD,            ...ESCREVER },
        { id: C.ADMIN,          ...ESCREVER },
        { id: C.OWNER,          ...ESCREVER },
        { id: C.BOTS,           ...ESCREVER },
      ],
    },

    // #staff-e-parceria — só staff e parceiros veem
    {
      id: '1530201578718494791',
      nome: '#staff-e-parceria',
      perms: [
        { id: everyoneId,       ...NAO_VER },
        { id: C.PARCEIROS,      ...ESCREVER },
        { id: C.SUPORTE,        ...ESCREVER },
        { id: C.MOD,            ...ESCREVER },
        { id: C.ADMIN,          ...ESCREVER },
        { id: C.ACEITAR_COMPRA, ...ESCREVER },
        { id: C.LOJA,           ...ESCREVER },
        { id: C.OWNER,          ...ESCREVER },
        { id: C.BOTS,           ...ESCREVER },
      ],
    },

    // calls públicas 1, 2, 3 — todos entram
    {
      id: '1522517236219248640',
      nome: 'call-publica-1',
      perms: [
        { id: everyoneId,       ...NAO_VER },
        { id: C.VISITANTE,      ...ENTRAR_CALL },
        { id: C.INSCRITO,       ...ENTRAR_CALL },
        { id: C.VERIFICADOR,    ...ENTRAR_CALL },
        { id: C.CLIENTE,        ...ENTRAR_CALL },
        { id: C.CLI_PREMIUM,    ...ENTRAR_CALL },
        { id: C.CLI_SUPREMO,    ...ENTRAR_CALL },
        { id: C.INFLUENCIADOR,  ...ENTRAR_CALL },
        { id: C.PARCEIROS,      ...ENTRAR_CALL },
        { id: C.BOOSTER,        ...ENTRAR_CALL },
        { id: C.SUPORTE,        ...STAFF_CALL },
        { id: C.MOD,            ...STAFF_CALL },
        { id: C.ADMIN,          ...STAFF_CALL },
        { id: C.OWNER,          ...STAFF_CALL },
        { id: C.BOTS,           ...ENTRAR_CALL },
      ],
    },

    {
      id: '1522517991105888337',
      nome: 'call-publica-2',
      perms: [
        { id: everyoneId,       ...NAO_VER },
        { id: C.VISITANTE,      ...ENTRAR_CALL },
        { id: C.INSCRITO,       ...ENTRAR_CALL },
        { id: C.VERIFICADOR,    ...ENTRAR_CALL },
        { id: C.CLIENTE,        ...ENTRAR_CALL },
        { id: C.CLI_PREMIUM,    ...ENTRAR_CALL },
        { id: C.CLI_SUPREMO,    ...ENTRAR_CALL },
        { id: C.INFLUENCIADOR,  ...ENTRAR_CALL },
        { id: C.PARCEIROS,      ...ENTRAR_CALL },
        { id: C.BOOSTER,        ...ENTRAR_CALL },
        { id: C.SUPORTE,        ...STAFF_CALL },
        { id: C.MOD,            ...STAFF_CALL },
        { id: C.ADMIN,          ...STAFF_CALL },
        { id: C.OWNER,          ...STAFF_CALL },
        { id: C.BOTS,           ...ENTRAR_CALL },
      ],
    },

    {
      id: '1522518032587427962',
      nome: 'call-publica-3',
      perms: [
        { id: everyoneId,       ...NAO_VER },
        { id: C.VISITANTE,      ...ENTRAR_CALL },
        { id: C.INSCRITO,       ...ENTRAR_CALL },
        { id: C.VERIFICADOR,    ...ENTRAR_CALL },
        { id: C.CLIENTE,        ...ENTRAR_CALL },
        { id: C.CLI_PREMIUM,    ...ENTRAR_CALL },
        { id: C.CLI_SUPREMO,    ...ENTRAR_CALL },
        { id: C.INFLUENCIADOR,  ...ENTRAR_CALL },
        { id: C.PARCEIROS,      ...ENTRAR_CALL },
        { id: C.BOOSTER,        ...ENTRAR_CALL },
        { id: C.SUPORTE,        ...STAFF_CALL },
        { id: C.MOD,            ...STAFF_CALL },
        { id: C.ADMIN,          ...STAFF_CALL },
        { id: C.OWNER,          ...STAFF_CALL },
        { id: C.BOTS,           ...ENTRAR_CALL },
      ],
    },

    // ══════════════════════════════════════════════════════════════════════════
    // CATEGORIA STAFF
    // ══════════════════════════════════════════════════════════════════════════

    // #abrir-ticket — todos veem, só bot escreve
    {
      id: '1522587244614127676',
      nome: '#abrir-ticket',
      perms: [
        { id: everyoneId,       ...NAO_VER },
        { id: C.VISITANTE,      ...SO_LER },
        { id: C.INSCRITO,       ...SO_LER },
        { id: C.VERIFICADOR,    ...SO_LER },
        { id: C.CLIENTE,        ...SO_LER },
        { id: C.CLI_PREMIUM,    ...SO_LER },
        { id: C.CLI_SUPREMO,    ...SO_LER },
        { id: C.INFLUENCIADOR,  ...SO_LER },
        { id: C.PARCEIROS,      ...SO_LER },
        { id: C.BOOSTER,        ...SO_LER },
        { id: C.SUPORTE,        ...ESCREVER },
        { id: C.MOD,            ...ESCREVER },
        { id: C.ADMIN,          ...ESCREVER },
        { id: C.OWNER,          ...ESCREVER },
        { id: C.BOTS,           ...ESCREVER },
      ],
    },

    // call suporte — só staff entra
    {
      id: '1522518079785926837',
      nome: 'call-suporte',
      perms: [
        { id: everyoneId,       ...NAO_VER },
        { id: C.SUPORTE,        ...STAFF_CALL },
        { id: C.MOD,            ...STAFF_CALL },
        { id: C.ADMIN,          ...STAFF_CALL },
        { id: C.ACEITAR_COMPRA, ...STAFF_CALL },
        { id: C.LOJA,           ...STAFF_CALL },
        { id: C.OWNER,          ...STAFF_CALL },
        { id: C.BOTS,           ...ENTRAR_CALL },
      ],
    },

    // call atendimento suporte — clientes + staff
    {
      id: '1522518111763435570',
      nome: 'call-atendimento-suporte',
      perms: [
        { id: everyoneId,       ...NAO_VER },
        { id: C.CLIENTE,        ...ENTRAR_CALL },
        { id: C.CLI_PREMIUM,    ...ENTRAR_CALL },
        { id: C.CLI_SUPREMO,    ...ENTRAR_CALL },
        { id: C.SUPORTE,        ...STAFF_CALL },
        { id: C.MOD,            ...STAFF_CALL },
        { id: C.ADMIN,          ...STAFF_CALL },
        { id: C.OWNER,          ...STAFF_CALL },
        { id: C.BOTS,           ...ENTRAR_CALL },
      ],
    },

    // call dos bots — só bots e owner
    {
      id: '1522518246694191284',
      nome: 'call-dos-bots',
      perms: [
        { id: everyoneId,       ...NAO_VER },
        { id: C.OWNER,          ...STAFF_CALL },
        { id: C.ADMIN,          ...SO_VER_CALL },
        { id: C.BOTS,           ...ENTRAR_CALL },
      ],
    },

  ];
}

// ─── Aplica as permissões ─────────────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`\n🤖 Conectado como ${client.user.tag}`);
  console.log('🔧 Iniciando configuração de canais...\n');

  const guild      = await client.guilds.fetch('1522456699082903572');
  const everyoneId = guild.roles.everyone.id;
  const config     = buildConfig(everyoneId);

  let ok = 0, erros = 0;

  for (const canal of config) {
    const ch = guild.channels.cache.get(canal.id);
    if (!ch) {
      console.log(`⚠️  Canal não encontrado: ${canal.nome} (${canal.id})`);
      erros++;
      continue;
    }

    try {
      // Remove todas as permissões existentes primeiro
      await ch.permissionOverwrites.set(
        canal.perms.map(p => ({ id: p.id, ...p }))
      );
      console.log(`✅ ${canal.nome}`);
      ok++;
      // Pequeno delay para não bater rate limit
      await new Promise(r => setTimeout(r, 800));
    } catch (err) {
      console.error(`❌ ${canal.nome}: ${err.message}`);
      erros++;
    }
  }

  console.log(`\n📊 Resultado: ${ok} canais configurados, ${erros} erros.`);
  console.log('✅ Concluído!');
  client.destroy();
});

client.login(process.env.TOKEN);
