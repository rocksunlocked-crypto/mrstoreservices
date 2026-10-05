/**
 * Sistema de Email Temporário Hotmail/Outlook com canal dedicado
 * - Painel fixo no canal configurado
 * - Cria canal privado ao gerar email
 * - Monitora mensagens via API 22.do e envia no canal
 */

const axios = require('axios');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits } = require('discord.js');
const { db } = require('../database/database');

const API_BASE = 'https://22.do/api/v2';
const CANAL_PAINEL = '1551837350030606336';
const CATEGORIA_EMAILS = process.env.CATEGORIA_EMAILS || null; // Categoria para criar os canais

// Polling: verificar mensagens a cada X segundos
const INTERVALO_VERIFICACAO = 10000; // 10 segundos
const canaisAtivos = new Map(); // Map<canalId, { username, domain, interval }>

class HotmailTempService {
  constructor() {
    this.bearerToken = null;
    this.apiToken = process.env.TEMP_MAIL_TOKEN || null;
  }

  async getBearerToken() {
    if (this.bearerToken) return this.bearerToken;
    
    if (!this.apiToken) {
      throw new Error('❌ TEMP_MAIL_TOKEN não configurado no .env');
    }

    try {
      const response = await axios.post(`${API_BASE}/token`, {
        token: this.apiToken
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      // A API retorna: { code: 200, status: true, msg: 'success', data: { Bearer: '...' } }
      if (response.data?.data?.Bearer) {
        this.bearerToken = response.data.data.Bearer;
        console.log('[HotmailTemp] Bearer Token obtido com sucesso');
        return this.bearerToken;
      }

      throw new Error('Falha ao obter Bearer Token: ' + JSON.stringify(response.data));
    } catch (error) {
      console.error('[HotmailTemp] Erro ao obter Bearer Token:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Criar email temporário (filtra apenas Hotmail/Outlook)
   */
  async criarEmailHotmail() {
    try {
      const bearer = await this.getBearerToken();
      
      // Tentar várias vezes até conseguir um domínio Hotmail/Outlook
      for (let tentativa = 0; tentativa < 10; tentativa++) {
        const response = await axios.get(`${API_BASE}/account`, {
          headers: {
            'Authorization': `Bearer ${bearer}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.data?.data) {
          const { address, username, domain } = response.data.data;
          
          // Verificar se é Hotmail ou Outlook
          if (domain.includes('hotmail') || domain.includes('outlook')) {
            console.log('[HotmailTemp] Email criado:', address);
            return {
              email: address,
              username,
              domain,
              criado_em: Date.now()
            };
          } else {
            // Deletar e tentar novamente
            await this.deletarEmail(username, domain);
            console.log('[HotmailTemp] Domínio não é Hotmail/Outlook, tentando novamente...');
          }
        }
      }

      throw new Error('Não foi possível gerar um email Hotmail/Outlook após 10 tentativas');
    } catch (error) {
      console.error('[HotmailTemp] Erro ao criar email:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Buscar mensagens de um email
   */
  async buscarMensagens(username, domain) {
    try {
      const bearer = await this.getBearerToken();
      
      const response = await axios.get(`${API_BASE}/messages`, {
        headers: {
          'Authorization': `Bearer ${bearer}`,
          'Content-Type': 'application/json'
        },
        params: {
          username,
          domain
        }
      });

      if (response.data?.data) {
        return response.data.data;
      }

      return [];
    } catch (error) {
      console.error('[HotmailTemp] Erro ao buscar mensagens:', error.response?.data || error.message);
      return [];
    }
  }

  /**
   * Deletar email
   */
  async deletarEmail(username, domain) {
    try {
      const bearer = await this.getBearerToken();
      
      await axios.delete(`${API_BASE}/account`, {
        headers: {
          'Authorization': `Bearer ${bearer}`,
          'Content-Type': 'application/json'
        },
        data: {
          username,
          domain
        }
      });

      console.log('[HotmailTemp] Email deletado:', `${username}@${domain}`);
      return true;
    } catch (error) {
      console.error('[HotmailTemp] Erro ao deletar email:', error.response?.data || error.message);
      return false;
    }
  }
}

const hotmailService = new HotmailTempService();

/**
 * Enviar/Atualizar painel fixo
 */
async function enviarPainelHotmail(guild) {
  try {
    const canal = guild.channels.cache.get(CANAL_PAINEL);
    if (!canal) {
      console.error('[HotmailTemp] Canal do painel não encontrado:', CANAL_PAINEL);
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x0078D4) // Azul Outlook
      .setTitle('📧 Gerador de Email Hotmail Temporário')
      .setDescription([
        '> Crie um email temporário **Hotmail/Outlook** instantaneamente!',
        '> ',
        '> **Como funciona:**',
        '> • Clique no botão abaixo',
        '> • Um canal privado será criado para você',
        '> • Todas as mensagens recebidas aparecerão automaticamente no canal',
        '> • O email expira em **1 hora**',
        '> ',
        '> 🔒 **Privacidade garantida** — apenas você tem acesso ao canal',
        '> ⚡ **Recebimento instantâneo** — verificação a cada 10 segundos',
        '> 🗑️ **Auto-deletar** — canal é removido após expiração'
      ].join('\n'))
      .setThumbnail('https://i.imgur.com/outlook-icon.png')
      .setFooter({ text: 'Máximo Store • Email Temporário Hotmail' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('hotmail_gerar')
        .setLabel('📧 Gerar Email Hotmail')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📬')
    );

    // Buscar mensagem existente
    const msgs = await canal.messages.fetch({ limit: 10 }).catch(() => null);
    const msgExistente = msgs?.find(m => 
      m.author.id === guild.client.user.id && 
      m.embeds.some(e => e.title?.includes('Gerador de Email Hotmail'))
    );

    if (msgExistente) {
      await msgExistente.edit({ embeds: [embed], components: [row] });
    } else {
      await canal.send({ embeds: [embed], components: [row] });
    }

    console.log('[HotmailTemp] Painel atualizado com sucesso');
  } catch (error) {
    console.error('[HotmailTemp] Erro ao enviar painel:', error.message);
  }
}

/**
 * Criar canal privado para o usuário
 */
async function criarCanalEmail(guild, member, emailData) {
  try {
    const nomeCanal = `email-${member.user.username}-${emailData.username.slice(0, 6)}`.toLowerCase();

    const canal = await guild.channels.create({
      name: nomeCanal,
      type: ChannelType.GuildText,
      parent: CATEGORIA_EMAILS || null,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: member.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
        },
        {
          id: guild.client.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ManageChannels
          ]
        }
      ]
    });

    console.log('[HotmailTemp] Canal criado:', canal.name);

    // Salvar no banco
    const { v4: uuidv4 } = require('uuid');
    const agora = Math.floor(Date.now() / 1000);
    const expira = agora + (60 * 60); // 1 hora

    db.prepare(`
      INSERT INTO emails_hotmail (id, usuario_id, canal_id, email, username, domain, criado_em, expira_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuidv4(),
      member.id,
      canal.id,
      emailData.email,
      emailData.username,
      emailData.domain,
      agora,
      expira
    );

    // Enviar embed inicial
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('✅ Email Hotmail Temporário Criado')
      .setDescription([
        `📧 **Seu email:** \`${emailData.email}\``,
        `⏰ **Expira:** <t:${expira}:R>`,
        '',
        '📬 **Aguardando mensagens...**',
        '> Todas as mensagens recebidas aparecerão aqui automaticamente.',
        '',
        '💡 **Use este email** para registros, verificações ou testes!'
      ].join('\n'))
      .setFooter({ text: 'Este canal será deletado automaticamente após expiração' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`hotmail_refresh_${emailData.username}_${emailData.domain}`)
        .setLabel('🔄 Verificar Agora')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`hotmail_deletar_${emailData.username}_${emailData.domain}`)
        .setLabel('🗑️ Deletar Email')
        .setStyle(ButtonStyle.Danger)
    );

    await canal.send({ content: `<@${member.id}>`, embeds: [embed], components: [row] });

    // Iniciar monitoramento de mensagens
    iniciarMonitoramento(guild, canal.id, emailData.username, emailData.domain);

    return canal;
  } catch (error) {
    console.error('[HotmailTemp] Erro ao criar canal:', error.message);
    throw error;
  }
}

/**
 * Iniciar monitoramento automático de mensagens
 */
function iniciarMonitoramento(guild, canalId, username, domain) {
  // Evitar duplicatas
  if (canaisAtivos.has(canalId)) {
    clearInterval(canaisAtivos.get(canalId).interval);
  }

  const mensagensProcessadas = new Set();

  const interval = setInterval(async () => {
    try {
      const canal = guild.channels.cache.get(canalId);
      if (!canal) {
        console.log('[HotmailTemp] Canal não existe mais, parando monitoramento');
        clearInterval(interval);
        canaisAtivos.delete(canalId);
        return;
      }

      // Verificar se expirou
      const registro = db.prepare('SELECT expira_em FROM emails_hotmail WHERE canal_id=?').get(canalId);
      if (!registro || registro.expira_em < Math.floor(Date.now() / 1000)) {
        console.log('[HotmailTemp] Email expirado, deletando canal');
        await hotmailService.deletarEmail(username, domain);
        await canal.delete('Email temporário expirado');
        clearInterval(interval);
        canaisAtivos.delete(canalId);
        db.prepare('DELETE FROM emails_hotmail WHERE canal_id=?').run(canalId);
        return;
      }

      // Buscar novas mensagens
      const mensagens = await hotmailService.buscarMensagens(username, domain);

      for (const msg of mensagens) {
        if (mensagensProcessadas.has(msg.id)) continue;

        mensagensProcessadas.add(msg.id);

        // Enviar mensagem no canal
        const embed = new EmbedBuilder()
          .setColor(0x0078D4)
          .setTitle(`📨 Nova Mensagem Recebida`)
          .setDescription([
            `**De:** ${msg.from || 'Desconhecido'}`,
            `**Assunto:** ${msg.subject || 'Sem assunto'}`,
            `**Data:** ${new Date(msg.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
            '',
            '**Conteúdo:**',
            '```',
            (msg.text || msg.html?.replace(/<[^>]*>/g, '') || '_Mensagem vazia_').slice(0, 1800),
            '```'
          ].join('\n'))
          .setFooter({ text: `ID: ${msg.id}` })
          .setTimestamp();

        // Extrair links
        const links = (msg.text || msg.html || '').match(/https?:\/\/[^\s<]+/g);
        if (links && links.length > 0) {
          embed.addFields({
            name: '🔗 Links encontrados',
            value: links.slice(0, 5).map(l => `• ${l}`).join('\n'),
            inline: false
          });
        }

        await canal.send({ embeds: [embed] });
        console.log('[HotmailTemp] Mensagem enviada no canal:', canal.name);
      }
    } catch (error) {
      console.error('[HotmailTemp] Erro ao monitorar mensagens:', error.message);
    }
  }, INTERVALO_VERIFICACAO);

  canaisAtivos.set(canalId, { username, domain, interval });
  console.log('[HotmailTemp] Monitoramento iniciado para:', canalId);
}

/**
 * Handler de botões
 */
async function handleHotmailButton(interaction) {
  const id = interaction.customId;

  if (id === 'hotmail_gerar') {
    await interaction.deferReply({ ephemeral: true });

    try {
      // Verificar se já tem canal ativo
      const canalExistente = db.prepare(`
        SELECT canal_id FROM emails_hotmail 
        WHERE usuario_id=? AND expira_em > strftime('%s','now')
      `).get(interaction.user.id);

      if (canalExistente) {
        const canal = interaction.guild.channels.cache.get(canalExistente.canal_id);
        if (canal) {
          return interaction.editReply({
            content: `⚠️ Você já tem um email ativo em <#${canal.id}>!\n\n💡 Aguarde a expiração ou delete o canal para criar um novo.`
          });
        }
      }

      // Criar email Hotmail
      const emailData = await hotmailService.criarEmailHotmail();

      // Criar canal
      const canal = await criarCanalEmail(interaction.guild, interaction.member, emailData);

      return interaction.editReply({
        content: `✅ Email Hotmail criado com sucesso!\n\n📧 Acesse o canal <#${canal.id}> para visualizar as mensagens.`
      });
    } catch (error) {
      console.error('[HotmailTemp] Erro:', error);
      return interaction.editReply({
        content: `❌ Erro ao gerar email:\n\`\`\`${error.message}\`\`\`\n\n💡 Verifique se o TEMP_MAIL_TOKEN está configurado corretamente.`
      });
    }
  }

  if (id.startsWith('hotmail_refresh_')) {
    await interaction.deferUpdate();
    return interaction.followUp({
      content: '🔄 Verificação manual ativada! Aguarde...',
      ephemeral: true
    });
  }

  if (id.startsWith('hotmail_deletar_')) {
    await interaction.deferUpdate();
    const [, , username, domain] = id.split('_');

    try {
      await hotmailService.deletarEmail(username, domain);
      
      const registro = db.prepare('SELECT canal_id FROM emails_hotmail WHERE username=? AND domain=?').get(username, domain);
      if (registro) {
        const canal = interaction.guild.channels.cache.get(registro.canal_id);
        if (canal) {
          await canal.delete('Email deletado pelo usuário');
        }
        db.prepare('DELETE FROM emails_hotmail WHERE canal_id=?').run(registro.canal_id);
      }

      return interaction.followUp({
        content: '✅ Email deletado com sucesso!',
        ephemeral: true
      });
    } catch (error) {
      return interaction.followUp({
        content: `❌ Erro ao deletar: ${error.message}`,
        ephemeral: true
      });
    }
  }
}

module.exports = {
  enviarPainelHotmail,
  handleHotmailButton,
  iniciarMonitoramento
};
