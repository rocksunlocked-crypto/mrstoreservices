const fs = require('fs');
const path = require('path');
const { Tickets, Usuarios, db } = require('../database/database');
const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const {
  add2FAAccount,
  remove2FAAccount,
  list2FAAccounts,
  generate2FACode,
  generate2FACodeFromSecret,
  generateAll2FACodes,
} = require('../2fa');

// ── Importar banco via anexo ──────────────────────────────────
async function importarBackupBanco(message) {
  const OWNER_ID    = process.env.OWNER_DISCORD_ID || '1382576164752724069';
  const OWNER_ROLE  = process.env.CARGO_OWNER       || '1522459532469469225';
  const temPermissao = message.author.id === OWNER_ID
    || message.member?.roles?.cache?.has(OWNER_ROLE);

  if (!temPermissao) {
    return message.reply('❌ Apenas o dono do bot pode importar o banco.').catch(() => {});
  }
  if (!message.attachments?.size) {
    return message.reply('📥 Anexe o arquivo `.db` junto com o comando `!importar`.').catch(() => {});
  }

  try {
    const dataDir = path.resolve(process.cwd(), 'data');
    fs.mkdirSync(dataDir, { recursive: true });

    // Baixar todos os anexos (db, db-wal, db-shm)
    for (const [, anexo] of message.attachments) {
      const nome = anexo.name;
      if (!nome.endsWith('.db') && !nome.endsWith('.db-wal') && !nome.endsWith('.db-shm')) continue;

      // Normalizar nome — sempre salvar como database.db / database.db-wal / database.db-shm
      const ext = nome.includes('.db-wal') ? '.db-wal' : nome.includes('.db-shm') ? '.db-shm' : '.db';
      const destino = path.join(dataDir, `database${ext}`);

      const resposta = await fetch(anexo.url);
      if (!resposta.ok) throw new Error(`Falha ao baixar ${nome} (${resposta.status})`);
      fs.writeFileSync(destino, Buffer.from(await resposta.arrayBuffer()));
      console.log(`[Importar] ${nome} → ${destino}`);
    }

    // Fazer checkpoint WAL para consolidar tudo no .db principal
    try {
      const Database = require('better-sqlite3');
      const db = new Database(path.join(dataDir, 'database.db'));
      db.pragma('wal_checkpoint(TRUNCATE)');
      db.close();
      console.log('[Importar] WAL checkpoint concluído.');
    } catch (e) { console.error('[Importar] Checkpoint WAL:', e.message); }

    await message.reply([
      `✅ **Banco importado com sucesso!**`,
      `📁 \`${dataDir}\``,
      ``,
      `⚠️ **Reinicie o bot** no Railway para carregar os dados.`,
      `> No Railway: clique no serviço → **Restart**`,
    ].join('\n')).catch(() => {});
  } catch (error) {
    await message.reply(`❌ Erro ao importar: ${error.message}`).catch(() => {});
  }
}

// ── Exportar banco como anexo ─────────────────────────────────
async function exportarBanco(message) {
  const OWNER_ID    = process.env.OWNER_DISCORD_ID || '1382576164752724069';
  const OWNER_ROLE  = process.env.CARGO_OWNER       || '1522459532469469225';
  const temPermissao = message.author.id === OWNER_ID
    || message.member?.roles?.cache?.has(OWNER_ROLE);

  if (!temPermissao) {
    return message.reply('❌ Apenas o dono do bot pode exportar o banco.').catch(() => {});
  }

  try {
    const arquivoOrigem = path.resolve(process.cwd(), config.dbPath || path.join('data', 'database.db'));
    if (!fs.existsSync(arquivoOrigem)) {
      return message.reply('❌ Arquivo do banco não encontrado.').catch(() => {});
    }

    const { AttachmentBuilder } = require('discord.js');
    const nomeArquivo = `backup-${new Date().toISOString().slice(0, 10)}.db`;
    const att = new AttachmentBuilder(arquivoOrigem, { name: nomeArquivo });
    await message.reply({ content: `✅ Backup do banco gerado em \`${new Date().toLocaleString('pt-BR')}\``, files: [att] }).catch(() => {});
  } catch (error) {
    await message.reply(`❌ Erro ao exportar: ${error.message}`).catch(() => {});
  }
}

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (message.author.bot) return;

    // ── Anti-spam: links de convite por membros sem cargo mínimo ──────────────
    if (message.guild && !message.member.permissions.has('ManageMessages')) {
      const hasInvite = /discord\.gg\/|discord\.com\/invite\//i.test(message.content);
      if (hasInvite) {
        const cargoMinimo = '1522464995118886942'; // ID do cargo mínimo que pode enviar convites
        const temCargo = message.member.roles.cache.has(cargoMinimo) || message.member.roles.highest.position >= (message.guild.roles.cache.get(cargoMinimo)?.position ?? 0);
        if (!temCargo) {
          try {
            await message.delete();
            await message.member.timeout(3 * 24 * 60 * 60 * 1000, 'Envio de link de convite sem permissão');
            await message.channel.send(`<@${message.author.id}> foi punido por **3 dias** por enviar link de convite sem permissão.`).then(m => setTimeout(() => m.delete(), 5000));
            const { log: logMr } = require('../menu/logsHandler');
            logMr(message.client, message.guild, 'punição', {
              acao: '🔨 Timeout Aplicado',
              alvo: `<@${message.author.id}>`,
              detalhes: `Motivo: Link de convite sem cargo mínimo\nDuração: 3 dias`,
            });
          } catch {}
          return;
        }
      }
    }

    // ── Anti-spam: 4+ imagens + menção @everyone/@here ────────────────────────
    if (message.guild && !message.member.permissions.has('ManageMessages')) {
      const numImagens = message.attachments.filter(a => a.contentType?.startsWith('image/')).size;
      const temMencao = /@(everyone|here)/i.test(message.content);
      if (numImagens >= 4 && temMencao) {
        try {
          await message.delete();
          await message.member.timeout(3 * 24 * 60 * 60 * 1000, 'Spam de imagens com menção');
          await message.channel.send(`<@${message.author.id}> foi punido por **3 dias** por spam de imagens com menção.`).then(m => setTimeout(() => m.delete(), 5000));
          const { log: logMr } = require('../menu/logsHandler');
          logMr(message.client, message.guild, 'punição', {
            acao: '🔨 Timeout Aplicado',
            alvo: `<@${message.author.id}>`,
            detalhes: `Motivo: ${numImagens} imagens + menção @everyone/@here\nDuração: 3 dias`,
          });
        } catch {}
        return;
      }
    }

    const comando = message.content.trim().toLowerCase();

    // ── !importar — importa banco via arquivo anexado ─────────────────────
    if (comando === '!importar') {
      await importarBackupBanco(message);
      return;
    }

    // ── !exportar — exporta banco como arquivo ────────────────────────────
    if (comando === '!exportar') {
      await exportarBanco(message);
      return;
    }

    // ── Comando !clear em DM (só Owner) ──────────────────────────────────
    if (!message.guild && message.content.toLowerCase().startsWith('!clear')) {
      const config  = require('../config');
      const ownerId = config.roles?.owner
        ? null  // owner é cargo, não ID — usa env
        : null;
      const OWNER_ID = process.env.OWNER_DISCORD_ID || '';

      if (OWNER_ID && message.author.id !== OWNER_ID) {
        await message.reply('❌ Apenas o Owner pode usar este comando.').catch(() => {});
        return;
      }

      const args   = message.content.split(' ');
      const limite = Math.min(parseInt(args[1]) || 100, 1000);

      const aviso = await message.channel.send(`🗑️ Deletando até **${limite}** mensagens do bot neste privado...`).catch(() => null);

      let deletadas = 0;
      let antes = undefined;

      while (deletadas < limite) {
        const buscar = Math.min(limite - deletadas, 100);
        const msgs = await message.channel.messages.fetch({ limit: buscar, ...(antes ? { before: antes } : {}) }).catch(() => null);
        if (!msgs || msgs.size === 0) break;

        const doBot = msgs.filter(m => m.author.id === message.client.user.id);
        for (const [, m] of doBot) {
          await m.delete().catch(() => {});
          deletadas++;
          await new Promise(r => setTimeout(r, 300)); // evitar rate limit
        }

        antes = msgs.last()?.id;
        if (msgs.size < buscar) break;
      }

      // Deletar o próprio aviso e o comando do usuário
      await aviso?.delete().catch(() => {});
      await message.delete().catch(() => {});

      const confirm = await message.channel.send(`✅ **${deletadas}** mensagem(ns) do bot deletada(s).`).catch(() => null);
      setTimeout(() => confirm?.delete().catch(() => {}), 5000);
      return;
    }

    if (!message.guild) return;

    // Garantir perfil
    Usuarios.criar(message.author.id, message.author.username);

    // Contar msgs em tickets
    const ticket = Tickets.get(message.channelId);
    if (ticket) Tickets.atualizar(message.channelId, { mensagens: (ticket.mensagens || 0) + 1 });

    // ── Comando !2fa ─────────────────────────────────────────────────────────
    if (message.content.toLowerCase().startsWith('!2fa')) {
      const args = message.content.trim().split(/\s+/);
      const sub = (args[1] || 'help').toLowerCase();

      try {
        if (sub === 'help' || sub === 'ajuda') {
          const ajuda = [
            '🔐 Comandos do 2FA:',
            '',
            '!2fa <secret>             → gera um código direto da chave',
            '!2fa add <nome> <secret>   → salva uma conta',
            '!2fa gerar <nome>          → gera o código atual',
            '!2fa listar                → lista contas salvas',
            '!2fa todos                 → gera todos os códigos',
            '!2fa remover <nome>        → remove uma conta',
            '',
            'Exemplo: !2fa I7YFCQEIZEOBNOZNM34JLZVJ6M',
          ].join('\n');
          await message.reply(ajuda);
          return;
        }

        if (!['add', 'listar', 'gerar', 'todos', 'remover'].includes(sub)) {
          const secret = args[1];
          if (!secret) {
            await message.reply('❌ Uso correto: `!2fa <secret>` ou `!2fa add <nome> <secret>`');
            return;
          }
          const codigo = generate2FACodeFromSecret(secret, 'Código 2FA');
          await message.reply(`🔐 Código gerado\n\n\`\`\`\n${codigo.token}\n\`\`\`\n\n⏳ Expira em: **${codigo.remaining}s**`);
          return;
        }

        if (sub === 'add') {
          const nome = args[2];
          const secret = args.slice(3).join(' ');
          if (!nome || !secret) {
            await message.reply('❌ Uso correto: `!2fa add <nome> <secret>`');
            return;
          }
          add2FAAccount(message.author.id, nome, secret);
          await message.reply(`✅ Conta **${nome}** salva com sucesso.`);
          return;
        }

        if (sub === 'listar') {
          const contas = list2FAAccounts(message.author.id);
          if (!contas.length) {
            await message.reply('📚 Você ainda não salvou nenhuma conta 2FA.');
            return;
          }
          await message.reply(`📚 Contas salvas:\n${contas.map(c => `• ${c}`).join('\n')}`);
          return;
        }

        if (sub === 'gerar') {
          const nome = args[2];
          if (!nome) {
            await message.reply('❌ Uso correto: `!2fa gerar <nome>`');
            return;
          }
          const codigo = generate2FACode(message.author.id, nome);
          await message.reply(`🔐 Código da conta **${codigo.label}**\n\n\`\`\`\n${codigo.token}\n\`\`\`\n\n⏳ Expira em: **${codigo.remaining}s**`);
          return;
        }

        if (sub === 'todos') {
          const contas = list2FAAccounts(message.author.id);
          if (!contas.length) {
            await message.reply('📋 Você ainda não salvou nenhuma conta 2FA.');
            return;
          }
          const codigos = generateAll2FACodes(message.author.id);
          const texto = codigos.map(c => `🔑 ${c.label}\n\`\`\`\n${c.token}\n\`\`\`\nExpira em: ${c.remaining}s`).join('\n\n');
          await message.reply(`📋 Códigos 2FA:\n\n${texto}`);
          return;
        }

        if (sub === 'remover') {
          const nome = args[2];
          if (!nome) {
            await message.reply('❌ Uso correto: `!2fa remover <nome>`');
            return;
          }
          remove2FAAccount(message.author.id, nome);
          await message.reply(`🗑️ Conta **${nome}** removida com sucesso.`);
          return;
        }

        await message.reply('❌ Comando inválido. Use `!2fa help`.');
      } catch (error) {
        await message.reply(`❌ ${error.message}`);
      }
      return;
    }

    // ── Comando !painel (forçar envio do painel fixo) ────────────────────────
    if (message.content.toLowerCase() === '!painel') {
      try {
        const { enviarPainelFixo, CANAL_PAINEL } = require('../systems/painelAdmin');
        await enviarPainelFixo(message.guild);
        await message.reply(`✅ Painel fixo enviado para o canal configurado (${CANAL_PAINEL}).`);
      } catch (error) {
        await message.reply(`❌ Não foi possível enviar o painel: ${error.message}`);
      }
      return;
    }

    // ── Comando !ttk (atualizar painel de tickets) ────────────────────────────
    if (message.content.toLowerCase() === '!ttk') {
      try {
        const { buildTicketPanel } = require('../tickets/panelBuilder');
        const CANAL_TICKETS_PAINEL = '1522587244614127676';
        const canal = message.guild.channels.cache.get(CANAL_TICKETS_PAINEL)
          || await message.client.channels.fetch(CANAL_TICKETS_PAINEL).catch(() => null);
        if (!canal) return message.reply('❌ Canal de tickets não encontrado.');

        const msgs = await canal.messages.fetch({ limit: 50 });
        const msgTicket = msgs.find(m => m.author.id === message.client.user.id && m.components?.length > 0);

        if (msgTicket) {
          await msgTicket.edit(buildTicketPanel());
          await message.reply('✅ Painel de tickets atualizado!');
        } else {
          await canal.send(buildTicketPanel());
          await message.reply('✅ Novo painel de tickets postado!');
        }
      } catch (e) {
        await message.reply(`❌ Erro: ${e.message}`);
      }
      return;
    }

    // ── Comando !infinito (toggle estoque infinito em variante) ────────────────
    if (message.content.toLowerCase().startsWith('!infinito')) {
      const args = message.content.trim().split(/\s+/);
      if (args.length < 2) return message.reply('Uso: `!infinito <variante_id_8chars>`');
      const varId = args[1];
      const { db } = require('../database/database');
      const variantes = db.prepare('SELECT * FROM variantes_produto WHERE id LIKE ?').all(`${varId}%`);
      if (!variantes.length) return message.reply(`❌ Variante com ID \`${varId}\` não encontrada.`);
      const v = variantes[0];
      const novoInfinito = v.infinito ? 0 : 1;
      db.prepare('UPDATE variantes_produto SET infinito=? WHERE id=?').run(novoInfinito, v.id);
      await message.reply(`✅ Variante **${v.nome}** agora tem estoque **${novoInfinito ? 'INFINITO ♾️' : 'NORMAL'}**.`);
      // Atualizar painel do produto
      try {
        const { atualizarPainelProduto } = require('../systems/painelProduto');
        const paineis = db.prepare('SELECT * FROM paineis_canal WHERE produto_id=? AND ativo=1').all(v.produto_id);
        for (const p of paineis) await atualizarPainelProduto(message.guild, p.id).catch(() => {});
      } catch {}
      return;
    }

    // ── Comando !compras (listar compras de hoje) ──────────────────────────────
    if (message.content.toLowerCase() === '!compras') {
      const { db } = require('../database/database');
      const { EmbedBuilder } = require('discord.js');
      const hoje = Math.floor(new Date().setHours(0,0,0,0) / 1000);
      const compras = db.prepare(`
        SELECT p.id, p.usuario_id, p.produto_id, p.quantidade, p.valor_total, p.metodo_pag, p.pago_em, pr.nome as produto_nome
        FROM pedidos p
        LEFT JOIN produtos pr ON pr.id = p.produto_id
        WHERE p.status='entregue' AND p.pago_em >= ?
        ORDER BY p.pago_em DESC
      `).all(hoje);

      if (!compras.length) return message.reply('📊 Nenhuma compra realizada hoje.');

      const totalVendas = compras.reduce((acc, c) => acc + c.valor_total, 0);
      const lista = compras.slice(0, 20).map((c, i) => 
        `\`${String(i+1).padStart(2,'0')}\` <@${c.usuario_id}> • **${c.produto_nome}** (${c.quantidade}x) • R$ ${c.valor_total.toFixed(2)}`
      ).join('\n');

      const embed = new EmbedBuilder()
        .setColor(0x00FF88)
        .setTitle('🛍️ Compras de Hoje')
        .setDescription(lista || '*(sem compras)*')
        .addFields(
          { name: '📊 Total de Compras', value: `**${compras.length}**`, inline: true },
          { name: '💰 Faturamento',      value: `**R$ ${totalVendas.toFixed(2)}**`, inline: true },
        )
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    // ── Comando !recuperar-variante (devolver itens da variante por tempo) ─────
    // IMPORTANTE: Este comando DEVE vir ANTES do !recuperar para evitar conflito
    if (message.content.toLowerCase().startsWith('!recuperar-variante')) {
      const args = message.content.trim().split(/\s+/);
      if (args.length < 2) return message.reply('Uso: `!recuperar-variante <variante_id> <horas>`\nExemplo: `!recuperar-variante 09752ecc 3` — devolve itens adicionados há 3h');
      
      const varianteId = args[1];
      const horas = parseFloat(args[2]);
      if (!horas || horas <= 0) return message.reply('❌ Informe um tempo válido em horas (ex: 3, 0.5, 24)');
      
      const { db } = require('../database/database');
      
      // Buscar variante
      const variantes = db.prepare('SELECT * FROM variantes_produto WHERE id LIKE ?').all(`${varianteId}%`);
      if (!variantes.length) return message.reply(`❌ Variante \`${varianteId}\` não encontrada.`);
      const variante = variantes[0];
      
      // Calcular timestamp EXATO (agora - N horas) com margem de ±5min
      const agora = Math.floor(Date.now() / 1000);
      const tempoAlvo = agora - (horas * 3600);
      const margemSegundos = 5 * 60; // ±5 minutos
      const tempoMin = tempoAlvo - margemSegundos;
      const tempoMax = tempoAlvo + margemSegundos;
      
      // Buscar itens criados há ~X horas na tabela estoque_variante
      const itensVariante = db.prepare(`
        SELECT * FROM estoque_variante 
        WHERE variante_id=? AND criado_em >= ? AND criado_em <= ?
        ORDER BY criado_em ASC
      `).all(variante.id, tempoMin, tempoMax);
      
      // Também buscar no estoque_digital (caso antigo)
      const itensGlobal = db.prepare(`
        SELECT * FROM estoque_digital 
        WHERE variante_id=? AND criado_em >= ? AND criado_em <= ?
        ORDER BY criado_em ASC
      `).all(variante.id, tempoMin, tempoMax);
      
      const todosItens = [...itensVariante, ...itensGlobal];
      
      if (!todosItens.length) {
        const dataAlvo = new Date((agora - horas * 3600) * 1000).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        return message.reply(`❌ Nenhum item da variante **${variante.nome}** foi adicionado há **${horas}h** (por volta de ${dataAlvo})`);
      }
      
      // Devolver todos os itens ao estoque (marcar como não usado)
      let devolvidos = 0;
      for (const item of todosItens) {
        if (item.variante_id) {
          // Item do estoque_variante
          db.prepare('UPDATE estoque_variante SET usado=0, usado_por=NULL, usado_em=NULL, pedido_id=NULL WHERE id=?').run(item.id);
        } else {
          // Item do estoque_digital
          db.prepare('UPDATE estoque_digital SET usado=0, usado_por=NULL, usado_em=NULL, pedido_id=NULL WHERE id=?').run(item.id);
        }
        devolvidos++;
      }
      
      // Atualizar contador de estoque do produto
      const estoqueVariante = db.prepare('SELECT COUNT(*) as c FROM estoque_variante WHERE variante_id=? AND usado=0').get(variante.id).c;
      const estoqueGlobal = db.prepare('SELECT COUNT(*) as c FROM estoque_digital WHERE produto_id=? AND usado=0').get(variante.produto_id).c;
      const estoqueTotal = estoqueVariante + estoqueGlobal;
      db.prepare('UPDATE produtos SET estoque=? WHERE id=?').run(estoqueTotal, variante.produto_id);
      
      const embed = new EmbedBuilder()
        .setColor(0x00FF88)
        .setTitle('♻️ Itens Recuperados pelo Timestamp')
        .setDescription([
          `✅ **${devolvidos} item(ns)** devolvido(s) ao estoque!`,
          ``,
          `📦 **Variante:** ${variante.nome}`,
          `⏰ **Adicionados há:** ${horas}h`,
          `📊 **Estoque atual:** ${estoqueTotal} itens disponíveis`,
        ].join('\n'))
        .setTimestamp();
      
      // Mostrar preview dos itens recuperados (primeiros 5)
      if (devolvidos > 0) {
        const preview = todosItens.slice(0, 5).map((item, i) => {
          const criadoEm = new Date(item.criado_em * 1000).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
          const conteudoPreview = item.conteudo.slice(0, 30) + (item.conteudo.length > 30 ? '...' : '');
          const status = item.usado ? '🔴 estava usado' : '🟢 estava livre';
          return `\`${i+1}.\` \`${conteudoPreview}\` (${status})\n    📅 Adicionado: ${criadoEm}`;
        }).join('\n');
        embed.addFields({ name: '🔍 Preview dos Itens', value: preview + (devolvidos > 5 ? `\n... e mais ${devolvidos - 5}` : ''), inline: false });
      }
      
      return message.reply({ embeds: [embed] });
    }

    // ── Comando !recuperar (devolver item e reprocessar pedido) ────────────────
    if (message.content.toLowerCase().startsWith('!recuperar')) {
      const args = message.content.trim().split(/\s+/);
      if (args.length < 2) return message.reply('Uso: `!recuperar <pedido_id_8chars>`');
      
      const pedidoId = args[1].toUpperCase();
      const { db, Pedidos } = require('../database/database');
      const pedidos = db.prepare('SELECT * FROM pedidos WHERE id LIKE ?').all(`${pedidoId}%`);
      if (!pedidos.length) return message.reply(`❌ Pedido \`${pedidoId}\` não encontrado.`);
      
      const pedido = pedidos[0];
      
      // Devolver item ao estoque se foi usado
      const itemUsado = db.prepare('SELECT * FROM estoque_digital WHERE pedido_id=? AND usado=1').get(pedido.id);
      if (itemUsado) {
        db.prepare('UPDATE estoque_digital SET usado=0, usado_por=NULL, usado_em=NULL, pedido_id=NULL WHERE id=?').run(itemUsado.id);
        await message.reply(`✅ Item devolvido: \`${itemUsado.conteudo.slice(0,50)}\``);
      }
      
      // Marcar pedido como pago (não entregue) para reprocessar
      db.prepare("UPDATE pedidos SET status='pago' WHERE id=?").run(pedido.id);
      
      // Reprocessar entrega
      try {
        const { processarEntrega } = require('../systems/loja');
        await processarEntrega(Pedidos.get(pedido.id), message.client);
        return message.reply(`✅ Pedido \`${pedidoId}\` reprocessado e entregue!`);
      } catch (e) {
        return message.reply(`❌ Erro ao reprocessar: ${e.message}`);
      }
    }

    // ── Comando !coins (qualquer usuário) ──────────────────────────────────
    if (message.content.toLowerCase() === '!coins') {
      const usuario = Usuarios.garantir(message.author.id, message.author.username);
      const coins   = usuario.coins || 0;
      const emReais = (coins * 0.01).toFixed(2);

      const embed = new EmbedBuilder()
        .setColor(config.colors.coins || config.colors.gold)
        .setTitle('🪙 Seus Coins')
        .setDescription([
          `**${message.author.username}**, você tem:`,
          ``,
          `🪙 **${coins.toLocaleString('pt-BR')} coins**`,
          `💵 Equivale a **R$ ${emReais}**`,
          ``,
          `> 100 coins = R$ 1,00`,
          `> Use coins para pagar produtos!`,
        ].join('\n'))
        .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
        .setTimestamp()
        .setFooter({ text: 'Máximo Store • Use /coins comprar para adquirir mais' });

      await message.reply({ embeds: [embed] });
      return;
    }

    // ── Comando !saldo ─────────────────────────────────────────────────────
    if (message.content.toLowerCase() === '!saldo') {
      const usuario = Usuarios.garantir(message.author.id, message.author.username);
      await message.reply({
        embeds: [new EmbedBuilder()
          .setColor(config.colors.gold)
          .setTitle('💰 Seu Saldo')
          .addFields(
            { name: '💵 Saldo R$', value: `R$ ${(usuario.saldo || 0).toFixed(2)}`, inline: true },
            { name: '🪙 Coins',    value: `${(usuario.coins || 0).toLocaleString('pt-BR')}`, inline: true },
            { name: '⭐ Pontos',   value: String(usuario.pontos || 0), inline: true },
          )
          .setTimestamp()
          .setFooter({ text: 'Máximo Store' })],
      });
      return;
    }
  },
};
