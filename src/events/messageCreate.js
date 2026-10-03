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
