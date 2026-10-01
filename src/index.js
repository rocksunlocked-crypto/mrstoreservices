/**
 * index.js — Bot MrStore Unificado
 *
 * 4 módulos em um único processo / único token:
 *  1. Bot de Vendas  — loja, carrinho, PIX, produtos, cupons, coins, tickets de compra
 *  2. Bot Mr         — painel /menu, sorteio, anúncio, avaliação, proteção, backup
 *  3. Bot Tickets    — sistema avançado (SLA, auto-close, denúncia/suporte/parceria)
 *  4. Bot Gerador    — auto-moderação, logs entrada/saída, painel !mr de adição em massa
 */

require('dotenv').config();
process.on('unhandledRejection', err => console.error('[UnhandledRejection]', err?.message ?? err));
process.on('uncaughtException',  err => console.error('[UncaughtException]',  err?.message ?? err));

// ── Verificar variáveis obrigatórias ──────────────────────────
const REQUIRED = ['DISCORD_TOKEN', 'CLIENT_ID', 'GUILD_ID'];
const missing = REQUIRED.filter(k => !process.env[k]);
if (missing.length) { console.error(`❌ Variáveis ausentes no .env: ${missing.join(', ')}`); process.exit(1); }

// ── Garantir arquivos de dados (Railway reinicia sem filesystem) ──
require('./utils/inicializarDados').inicializar();

// ── Imports ───────────────────────────────────────────────────
const {
  Client, GatewayIntentBits, Partials, Collection, ActivityType,
  REST, Routes, SlashCommandBuilder,
} = require('discord.js');
const { joinVoiceChannel, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const fs   = require('fs');
const path = require('path');

const config            = require('./config');
const { init: initDb }  = require('./database/database');
const { setClient, log } = require('./utils/logger');
const webhookServer     = require('./webhook/server');

// ── Bot Mr — handlers do painel /menu ─────────────────────────
const { enviarMenu }                          = require('./menu/menuPrincipal');
const anuncio                                 = require('./menu/anuncioHandler');
const anuncioSub                              = require('./menu/anuncioSubMenu');
const { abrirModalTrancar, abrirModalAbrir,
        processarTrancar,  processarAbrir,
        destravaBotao }                       = require('./menu/canalHandler');
const bot                                     = require('./menu/botHandler');
const { abrirMenuIdiomas, processarTraducao } = require('./menu/traduzirHandler');
const { participar: sorteioParticipar }       = require('./menu/sorteioCore');
const sub                                     = require('./menu/sorteioSubMenu');
const usuario                                 = require('./menu/usuarioHandler');
const avaliacao                               = require('./menu/avaliacaoHandler');
const stats                                   = require('./menu/statsHandler');
const { recepcionarMembro, despedirMembro }   = require('./menu/bemVindoHandler');
const { iniciarBackup }                       = require('./menu/backupHandler');
const { log: logMr }                          = require('./menu/logsHandler');
const { iniciarStatus, onVoiceStateUpdate,
        atualizarMembros }                    = require('./menu/canalStatusHandler');
const { iniciarProtecao }                     = require('./menu/protecaoHandler');

// ── Bot Tickets — sistema avançado ────────────────────────────
const { handleInteraction: handleTicketInteraction } = require('./handlers/ticketInteractionHandler');
const { runSLAMonitor }       = require('./systems/ticket_slaSystem');
const { runAutoCloseMonitor } = require('./systems/ticket_autoClose');
const { notifyStaffActivity, checkUrgentKeywords } = require('./systems/ticket_notifications');
const ticketsDb = require('./database/ticketsDb');

// ── Bot Gerador — auto-mod, logs entrada/saída, painel !mr ────
const gerador = require('./gerador/gerador');

// ── Tentar carregar anuncioSessao (opcional) ──────────────────
let anuncioSessao = null;
try { anuncioSessao = require('./menu/anuncioSessao'); } catch {}

// ─── Cliente Discord ──────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.GuildMember],
});

client.commands   = new Collection();
client.cooldowns  = new Collection();
client.pagamentos = new Map();
client.inviteCache = new Map();

// ─── Carregar comandos slash ──────────────────────────────────
function carregarComandos() {
  const pasta = path.join(__dirname, 'commands');
  let total = 0;
  const nomesSeen = new Set();

  function walk(dir) {
    for (const item of fs.readdirSync(dir)) {
      const full = path.join(dir, item);
      if (fs.statSync(full).isDirectory()) { walk(full); continue; }
      if (!item.endsWith('.js')) continue;
      const cmd = require(full);
      if (!cmd.data || !cmd.execute) continue;
      const nome = cmd.data.name;
      if (nomesSeen.has(nome)) { console.warn(`⚠️  Duplicado ignorado: /${nome}`); continue; }
      nomesSeen.add(nome);
      client.commands.set(nome, cmd);
      total++;
    }
  }

  walk(pasta);
  console.log(`📂 ${total} comandos slash carregados.`);
}

// ─── Carregar eventos ─────────────────────────────────────────
function carregarEventos() {
  const pasta = path.join(__dirname, 'events');
  let total = 0;
  for (const arquivo of fs.readdirSync(pasta).filter(f => f.endsWith('.js'))) {
    const evento = require(path.join(pasta, arquivo));
    if (evento.once) client.once(evento.name, (...args) => evento.execute(...args, client));
    else             client.on(evento.name,   (...args) => evento.execute(...args, client));
    total++;
  }
  console.log(`📡 ${total} eventos carregados.`);
}

// ─── Registrar /menu (Bot Mr) ─────────────────────────────────
async function registrarComandoMenu() {
  const cmd = new SlashCommandBuilder()
    .setName('menu')
    .setDescription('👑 Abre o painel de controle')
    .toJSON();
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: [cmd] },
    );
    console.log('✅ /menu registrado.');
  } catch (err) {
    console.error('❌ Erro ao registrar /menu:', err.message);
  }
}

// ─── Conexão de voz (Bot Mr) ──────────────────────────────────
async function conectarVoz(guild) {
  const vcId = config.botMr.voiceChannelId;
  if (!vcId) return;
  try {
    const channel = guild.channels.cache.get(vcId);
    if (!channel) return;
    const conn = joinVoiceChannel({
      channelId: vcId, guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator, selfDeaf: true, selfMute: true,
    });
    conn.on(VoiceConnectionStatus.Ready, () => console.log(`🎙️  Voz: ${channel.name}`));
    conn.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(conn, VoiceConnectionStatus.Signalling, 5_000),
          entersState(conn, VoiceConnectionStatus.Connecting,  5_000),
        ]);
      } catch { setTimeout(() => conectarVoz(guild), 5_000); }
    });
    conn.on('error', () => setTimeout(() => conectarVoz(guild), 5_000));
  } catch { setTimeout(() => conectarVoz(guild), 10_000); }
}

// ─── Verificar cargo Bot Mr ───────────────────────────────────
function temCargoBotMr(interaction) {
  return interaction.member?.roles?.cache?.has(config.botMr.cargoChefe)
      || interaction.member?.roles?.cache?.has(config.botMr.cargoOwner);
}
function semPermissao(interaction) {
  return interaction.reply({ content: `❌ Apenas <@&${config.botMr.cargoChefe}> pode usar isso.`, flags: 64 });
}

// ─── Ready ────────────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`\n╔═══════════════════════════════════════════╗`);
  console.log(`║  🚀  BOT MRSTORE UNIFICADO — ONLINE       ║`);
  console.log(`║  🤖  ${client.user.tag.padEnd(39)}║`);
  console.log(`║  🌐  ${String(client.guilds.cache.size).padEnd(39)}servidores║`);
  console.log(`╚═══════════════════════════════════════════╝\n`);

  setClient(client);

  // Registrar client no clientRef para uso pelo dashboard/webhook
  require('./utils/clientRef').setClient(client);

  const guild = client.guilds.cache.get(config.guildId)
    ?? await client.guilds.fetch(config.guildId).catch(() => null);

  if (guild) {
    conectarVoz(guild);
    avaliacao.iniciarCiclo(client);
    iniciarBackup();
    iniciarStatus(client);
    iniciarProtecao(client);

    // Cache de convites para sistema de indicações
    try {
      const invites = await guild.invites.fetch().catch(() => null);
      if (invites) {
        client.inviteCache.set(guild.id, new Map(invites.map(i => [i.code, i.uses])));
        console.log(`🔗 ${invites.size} convite(s) cacheado(s).`);
      }
    } catch (e) { console.error('[Invites]', e.message); }
  }

  await registrarComandoMenu();

  // Atividade rotativa
  const atividades = [
    { name: '🛍️ Máximo Store',     type: ActivityType.Playing  },
    { name: '💰 EFI Bank PIX',      type: ActivityType.Watching },
    { name: '🎫 Tickets',           type: ActivityType.Watching },
    { name: '/loja para comprar',   type: ActivityType.Listening },
  ];
  let i = 0;
  client.user.setActivity(atividades[0].name, { type: atividades[0].type });
  setInterval(() => {
    i = (i + 1) % atividades.length;
    client.user.setActivity(atividades[i].name, { type: atividades[i].type });
  }, 30_000);

  await log('sistema', { descricao: `Bot unificado iniciado: ${client.user.tag}`, titulo: '🚀 Bot Online' });

  // Tarefas do bot de vendas (painéis, caixas, afiliados, etc.)
  setTimeout(async () => {
    try {
      if (!guild) return;
      const { atualizarPainelAdmin } = require('./systems/painelAdmin');
      const { atualizarPainelProduto } = require('./systems/painelProduto');
      const { db }                     = require('./database/database');

      // Apenas ATUALIZAR o painel admin já existente (não repostar)
      await atualizarPainelAdmin(guild);

      // Apenas ATUALIZAR painéis de produto já existentes (não repostar)
      const paineis = db.prepare('SELECT * FROM paineis_canal WHERE ativo=1 AND mensagem_id IS NOT NULL').all();
      console.log(`🔄 Atualizando ${paineis.length} painel(is) de produto...`);
      for (const p of paineis) {
        await atualizarPainelProduto(guild, p.id).catch(() => {});
        await new Promise(r => setTimeout(r, 300));
      }

      const { inicializarTabela } = require('./systems/afiliados');
      inicializarTabela();

      const { enviarHistoricoVendas } = require('./utils/canalVendas');
      await enviarHistoricoVendas(client);

      console.log('✅ Inicialização das vendas concluída.');
    } catch (e) { console.error('[Init Vendas]', e.message); }
  }, 3000);

  // Monitores do sistema de tickets avançado
  setInterval(() => runSLAMonitor(client).catch(e => console.error('[SLA]', e.message)), 15 * 60 * 1000);
  setInterval(() => runAutoCloseMonitor(client).catch(e => console.error('[AUTO-CLOSE]', e.message)), 30 * 60 * 1000);
  runSLAMonitor(client).catch(() => {});
  runAutoCloseMonitor(client).catch(() => {});
  console.log('[✅] Monitores SLA e Auto-close iniciados.');

  // Bot Gerador — auto-mod, logs de entrada/saída, painel !mr
  gerador.iniciar(client);

  require('./tasks/scheduler')(client);
});

// ─── Voice State Update (Bot Mr) ─────────────────────────────
client.on('voiceStateUpdate', (oldState, newState) => {
  if (oldState.guild.id !== config.guildId && newState.guild.id !== config.guildId) return;
  onVoiceStateUpdate(oldState, newState);
});

// ─── Membro entrou ────────────────────────────────────────────
client.on('guildMemberAdd', async (member) => {
  if (member.guild.id !== config.guildId) return;

  if (member.user.bot) {
    const autorizados = bot.carregar();
    if (autorizados.includes(member.user.id)) { console.log(`✅ Bot autorizado: ${member.user.tag}`); return; }
    try {
      await member.kick('Bot não autorizado.');
      logMr(client, member.guild, 'bot_expulso', {
        acao: 'Bot Não Autorizado Expulso',
        alvo: `${member.user.tag} (\`${member.user.id}\`)`,
      });
    } catch (err) { console.error('Erro ao expulsar bot:', err.message); }
    return;
  }

  // Boas-vindas
  await recepcionarMembro(member);

  // DM do anúncio ativo
  const dmAtivo = anuncioSessao?.getAnuncioDMAtivo?.();
  if (dmAtivo) member.send({ embeds: [dmAtivo.embed], components: dmAtivo.components ?? [] }).catch(() => {});

  atualizarMembros(member.guild);
  logMr(client, member.guild, 'membro_entrou', {
    acao: 'Membro Entrou',
    alvo: `${member.user.tag} (<@${member.user.id}>)`,
    detalhes: `Conta criada: <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
  });
});

// ─── Membro saiu ──────────────────────────────────────────────
client.on('guildMemberRemove', async (member) => {
  if (member.guild.id !== config.guildId || member.user.bot) return;
  await despedirMembro(member);
  atualizarMembros(member.guild);
  logMr(client, member.guild, 'membro_saiu', {
    acao: 'Membro Saiu',
    alvo: `${member.user.tag} (\`${member.user.id}\`)`,
  });
});

// ─── Mensagens ────────────────────────────────────────────────
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  // Monitorar mensagens em canais de ticket avançado
  const ticket = ticketsDb.getTicketByChannel(message.channel.id);
  if (ticket && ticket.status === 'open') {
    try {
      const { db } = require('./database/database');
      db.prepare("UPDATE tickets SET mensagens = COALESCE(mensagens,0) + 1 WHERE canal_id = ?").run(message.channel.id);
    } catch {}
    notifyStaffActivity(message, ticket).catch(() => {});
    checkUrgentKeywords(message, ticket).catch(() => {});
  }
});

// ─── Interações ───────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  try {

    // ── /menu (Bot Mr) ────────────────────────────────────────
    if (interaction.isChatInputCommand() && interaction.commandName === 'menu') {
      if (!temCargoBotMr(interaction)) return semPermissao(interaction);
      return enviarMenu(interaction);
    }

    // ── Outros slash commands (bot de vendas) ─────────────────
    if (interaction.isChatInputCommand()) {
      const cmd = client.commands.get(interaction.commandName);
      if (!cmd) return;

      // Cooldown
      if (!client.cooldowns.has(cmd.data.name)) client.cooldowns.set(cmd.data.name, new Collection());
      const agora = Date.now();
      const temposCooldown = client.cooldowns.get(cmd.data.name);
      const cooldownAmount = (cmd.cooldown || 3) * 1000;
      if (temposCooldown.has(interaction.user.id)) {
        const expira = temposCooldown.get(interaction.user.id) + cooldownAmount;
        if (agora < expira) {
          const restante = ((expira - agora) / 1000).toFixed(1);
          return interaction.reply({ content: `⏳ Aguarde **${restante}s** antes de usar este comando novamente.`, ephemeral: true });
        }
      }
      temposCooldown.set(interaction.user.id, agora);
      setTimeout(() => temposCooldown.delete(interaction.user.id), cooldownAmount);
      return await cmd.execute(interaction, client);
    }

    // ── Botões ────────────────────────────────────────────────
    if (interaction.isButton()) {
      const id = interaction.customId;

      // Sistema de tickets avançado — todos os prefixos
      if (
        id.startsWith('ticket_')     ||
        id.startsWith('autoclose_')  ||
        id.startsWith('rating_')     ||
        id.startsWith('tmenu_')      ||
        id.startsWith('tchamar_')    ||
        id.startsWith('tver_')       ||
        id.startsWith('tgerar_')     ||
        id.startsWith('tverificar_')
      ) {
        return handleTicketInteraction(interaction);
      }

      // Painel /menu principal
      if (id.startsWith('menu_')) {
        if (!temCargoBotMr(interaction)) return semPermissao(interaction);
        switch (id) {
          case 'menu_anuncio':          return anuncioSub.enviarSubMenu(interaction);
          case 'menu_editar_anuncio':   return anuncio.abrirModalEdicao(interaction);
          case 'menu_sorteio':          return sub.enviarSubMenu(interaction);
          case 'menu_trancar':          return abrirModalTrancar(interaction);
          case 'menu_abrir':            return abrirModalAbrir(interaction);
          case 'menu_bot_autorizar':    return bot.abrirModalAutorizar(interaction);
          case 'menu_bot_desautorizar': return bot.abrirModalDesautorizar(interaction);
          case 'menu_bot_lista':        return bot.listar(interaction);
          case 'menu_usuario':          return usuario.abrirModal(interaction);
          case 'menu_stats':            return stats.mostrarStats(interaction);
        }
      }

      // Sub-menu anúncio
      if (id.startsWith('an_')) {
        if (!temCargoBotMr(interaction)) return semPermissao(interaction);
        switch (id) {
          case 'an_canal':        return anuncioSub.modalCanal(interaction);
          case 'an_titulo':       return anuncioSub.modalTitulo(interaction);
          case 'an_conteudo':     return anuncioSub.modalConteudo(interaction);
          case 'an_imagem':       return anuncioSub.modalImagem(interaction);
          case 'an_botoes':       return anuncioSub.modalBotoes(interaction);
          case 'an_botao1':       return anuncioSub.modalBotao(interaction, 1);
          case 'an_botao2':       return anuncioSub.modalBotao(interaction, 2);
          case 'an_botao3':       return anuncioSub.modalBotao(interaction, 3);
          case 'an_botao4':       return anuncioSub.modalBotao(interaction, 4);
          case 'an_botao5':       return anuncioSub.modalBotao(interaction, 5);
          case 'an_publicar':     return anuncioSub.publicar(interaction);
          case 'an_dm':           return anuncioSub.enviarDM(interaction);
          case 'an_dm_desativar': return anuncioSub.desativarDM(interaction);
          case 'an_cancelar':     return anuncioSub.cancelar(interaction);
        }
      }

      // Sub-menu sorteio
      if (id.startsWith('ss_')) {
        if (!temCargoBotMr(interaction)) return semPermissao(interaction);
        switch (id) {
          case 'ss_titulo':    return sub.modalTitulo(interaction);
          case 'ss_imagem':    return sub.modalImagem(interaction);
          case 'ss_premios':   return sub.modalPremios(interaction);
          case 'ss_duracao':   return sub.modalDuracao(interaction);
          case 'ss_criterios': return sub.modalCriterios(interaction);
          case 'ss_publicar':  return sub.publicar(interaction, client);
          case 'ss_finalizar': return sub.finalizarAtivo(interaction, client);
          case 'ss_cancelar':  return sub.cancelar(interaction);
        }
      }

      // Destravar canal
      if (id.startsWith('canal_destravar_'))     return destravaBotao(interaction);

      // Avaliação (Bot Mr)
      if (id === 'aval_abrir_modal')             return avaliacao.abrirModal(interaction);
      if (id.startsWith('aval_aprovar_'))         return avaliacao.aprovar(interaction);
      if (id.startsWith('aval_negar_'))           return avaliacao.negar(interaction);
      if (id.startsWith('aval_bloquear_'))        return avaliacao.bloquear(interaction);

      // Participar sorteio
      if (id.startsWith('sorteio_participar_'))   return sorteioParticipar(interaction);

      // Traduzir
      if (id.startsWith('traduzir_abrir_'))
        return abrirMenuIdiomas(interaction, id.replace('traduzir_abrir_', ''));

      // Botões do bot de vendas
      const buttonsHandler = path.join(__dirname, 'handlers', 'buttons.js');
      if (fs.existsSync(buttonsHandler)) return require(buttonsHandler)(interaction, client);
    }

    // ── Select Menus ─────────────────────────────────────────
    if (interaction.isStringSelectMenu()) {
      const id = interaction.customId;

      // Tickets avançado
      if (id === 'ticket_open_menu'
        || id.startsWith('select_priority_')
        || id.startsWith('select_tags_')
        || id.startsWith('select_transfer_')) {
        return handleTicketInteraction(interaction);
      }

      // Traduzir
      if (id.startsWith('traduzir_idioma_')) return processarTraducao(interaction);

      // Bot de vendas
      const selectHandler = path.join(__dirname, 'handlers', 'selectMenus.js');
      if (fs.existsSync(selectHandler)) return require(selectHandler)(interaction, client);
    }

    // ── Modais ────────────────────────────────────────────────
    if (interaction.isModalSubmit()) {
      const id = interaction.customId;

      // Tickets avançado
      if (id.startsWith('modal_open_ticket_')
        || id.startsWith('modal_close_ticket_')
        || id.startsWith('modal_note_')
        || id.startsWith('modal_rename_')) {
        return handleTicketInteraction(interaction);
      }

      // Bot Mr — anúncio
      if (id.startsWith('anm_')) {
        if (!temCargoBotMr(interaction)) return semPermissao(interaction);
        switch (id) {
          case 'anm_canal':    return anuncioSub.processarCanal(interaction);
          case 'anm_titulo':   return anuncioSub.processarTitulo(interaction);
          case 'anm_conteudo': return anuncioSub.processarConteudo(interaction);
          case 'anm_imagem':   return anuncioSub.processarImagem(interaction);
          case 'anm_botao1':   return anuncioSub.processarBotao(interaction, 1);
          case 'anm_botao2':   return anuncioSub.processarBotao(interaction, 2);
          case 'anm_botao3':   return anuncioSub.processarBotao(interaction, 3);
          case 'anm_botao4':   return anuncioSub.processarBotao(interaction, 4);
          case 'anm_botao5':   return anuncioSub.processarBotao(interaction, 5);
        }
      }

      // Bot Mr — sorteio
      if (id.startsWith('sm_')) {
        if (!temCargoBotMr(interaction)) return semPermissao(interaction);
        switch (id) {
          case 'sm_titulo':    return sub.processarTitulo(interaction);
          case 'sm_imagem':    return sub.processarImagem(interaction);
          case 'sm_premios':   return sub.processarPremios(interaction);
          case 'sm_duracao':   return sub.processarDuracao(interaction);
          case 'sm_criterios': return sub.processarCriterios(interaction);
        }
      }

      // Avaliação — qualquer membro
      if (id === 'modal_avaliacao') return avaliacao.processarModal(interaction);

      // Modal fechar ticket (bot de vendas)
      if (id.startsWith('modal_fechar_ticket_')) {
        const modalsHandler = path.join(__dirname, 'handlers', 'modals.js');
        if (fs.existsSync(modalsHandler)) return require(modalsHandler)(interaction, client);
      }

      // Outros modais Bot Mr
      if (!temCargoBotMr(interaction)) return semPermissao(interaction);
      switch (id) {
        case 'modal_anuncio':          return anuncio.processarModal(interaction);
        case 'modal_editar_anuncio':   return anuncio.processarEdicao(interaction);
        case 'modal_trancar':          return processarTrancar(interaction);
        case 'modal_abrir':            return processarAbrir(interaction);
        case 'modal_bot_autorizar':    return bot.processarAutorizar(interaction);
        case 'modal_bot_desautorizar': return bot.processarDesautorizar(interaction);
        case 'modal_usuario':          return usuario.processarModal(interaction);
      }

      // Modais bot de vendas (fallback)
      const modalsHandler = path.join(__dirname, 'handlers', 'modals.js');
      if (fs.existsSync(modalsHandler)) return require(modalsHandler)(interaction, client);
    }

  } catch (err) {
    console.error('[Interaction]', err);
    await log('erro', { descricao: `Erro: ${err.message}`, extra: err.stack?.slice(0, 500) });
    const payload = { content: '❌ Erro ao processar sua solicitação.', ephemeral: true };
    if (interaction.replied || interaction.deferred) interaction.followUp(payload).catch(() => {});
    else interaction.reply(payload).catch(() => {});
  }
});

// ─── Inicialização ────────────────────────────────────────────
async function main() {
  console.log('🔧 Inicializando banco de dados...');
  await initDb();

  console.log('📂 Carregando comandos e eventos...');
  carregarComandos();
  carregarEventos();

  console.log('🌐 Iniciando servidor webhook...');
  await webhookServer.start(client);

  console.log('🔑 Conectando ao Discord...');
  await client.login(config.token);
}

main().catch(err => {
  console.error('❌ Erro fatal:', err);
  process.exit(1);
});
