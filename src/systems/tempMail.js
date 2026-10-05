/**
 * Sistema de Email Temporário integrado com 22.do API v2
 * Gera emails temporários e recebe mensagens automaticamente
 */

const axios = require('axios');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db } = require('../database/database');

const API_BASE = 'https://22.do/api/v2';

class TempMailService {
  constructor() {
    this.bearerToken = null;
    this.apiToken = process.env.TEMP_MAIL_TOKEN || null;
  }

  /**
   * Obter Bearer Token para autenticação
   */
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
        console.log('[TempMail] Bearer Token obtido com sucesso');
        return this.bearerToken;
      }

      throw new Error('Falha ao obter Bearer Token: ' + JSON.stringify(response.data));
    } catch (error) {
      console.error('[TempMail] Erro ao obter Bearer Token:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Criar uma conta de email temporário
   */
  async criarEmail() {
    try {
      const bearer = await this.getBearerToken();
      
      const response = await axios.get(`${API_BASE}/account`, {
        headers: {
          'Authorization': `Bearer ${bearer}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.data?.data) {
        const { address, username, domain } = response.data.data;
        console.log('[TempMail] Email criado:', address);
        return {
          email: address,
          username,
          domain,
          criado_em: Date.now()
        };
      }

      throw new Error('Falha ao criar email temporário');
    } catch (error) {
      console.error('[TempMail] Erro ao criar email:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Criar email temporário PREMIUM (maior duração, mais domínios)
   */
  async criarEmailPremium() {
    try {
      const bearer = await this.getBearerToken();
      
      const response = await axios.get(`${API_BASE}/account/premium`, {
        headers: {
          'Authorization': `Bearer ${bearer}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.data?.data) {
        const { address, username, domain } = response.data.data;
        console.log('[TempMail] Email Premium criado:', address);
        return {
          email: address,
          username,
          domain,
          tipo: 'premium',
          criado_em: Date.now()
        };
      }

      throw new Error('Falha ao criar email premium');
    } catch (error) {
      console.error('[TempMail] Erro ao criar email premium:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Buscar mensagens de um email específico
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
      console.error('[TempMail] Erro ao buscar mensagens:', error.response?.data || error.message);
      return [];
    }
  }

  /**
   * Buscar uma mensagem específica por ID
   */
  async buscarMensagemPorId(messageId) {
    try {
      const bearer = await this.getBearerToken();
      
      const response = await axios.get(`${API_BASE}/messages/${messageId}`, {
        headers: {
          'Authorization': `Bearer ${bearer}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.data?.data) {
        return response.data.data;
      }

      return null;
    } catch (error) {
      console.error('[TempMail] Erro ao buscar mensagem:', error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Deletar uma conta de email temporário
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

      console.log('[TempMail] Email deletado:', `${username}@${domain}`);
      return true;
    } catch (error) {
      console.error('[TempMail] Erro ao deletar email:', error.response?.data || error.message);
      return false;
    }
  }
}

// ─── Instância singleton ──────────────────────────────────────────────────────
const tempMailService = new TempMailService();

// ─── Comando /email-temp ──────────────────────────────────────────────────────
async function comandoEmailTemp(interaction, premium = false) {
  await interaction.deferReply({ ephemeral: true });

  try {
    // Criar email temporário
    const emailData = premium 
      ? await tempMailService.criarEmailPremium()
      : await tempMailService.criarEmail();

    // Salvar no banco
    const { v4: uuidv4 } = require('uuid');
    const stmt = db.prepare(`
      INSERT INTO emails_temporarios (id, usuario_id, email, username, domain, tipo, criado_em, expira_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const agora = Math.floor(Date.now() / 1000);
    const expira = agora + (premium ? 60 * 120 : 60 * 60); // Premium: 2h, Normal: 1h

    stmt.run(
      uuidv4(),
      interaction.user.id,
      emailData.email,
      emailData.username,
      emailData.domain,
      premium ? 'premium' : 'normal',
      agora,
      expira
    );

    const embed = new EmbedBuilder()
      .setColor(premium ? 0xFFD700 : 0x5865F2)
      .setTitle(`📧 Email Temporário ${premium ? '⭐ Premium' : ''} Criado`)
      .setDescription([
        '> Seu email temporário foi gerado com sucesso!',
        `> Ele estará ativo por **${premium ? '2 horas' : '1 hora'}**.`,
        '',
        `📬 **Email:** \`${emailData.email}\``,
        `⏰ Expira: <t:${expira}:R>`,
        '',
        '💡 Use os botões abaixo para gerenciar:'
      ].join('\n'))
      .setTimestamp()
      .setFooter({ text: 'Máximo Store • Email Temporário' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`tempmail_refresh_${emailData.username}_${emailData.domain}`)
        .setLabel('🔄 Ver Mensagens')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`tempmail_delete_${emailData.username}_${emailData.domain}`)
        .setLabel('🗑️ Deletar Email')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('tempmail_novo')
        .setLabel('➕ Novo Email')
        .setStyle(ButtonStyle.Success)
    );

    return interaction.editReply({ embeds: [embed], components: [row] });
  } catch (error) {
    console.error('[TempMail] Erro:', error);
    return interaction.editReply({
      content: `❌ Erro ao criar email temporário:\n\`\`\`${error.message}\`\`\`\n\n💡 **Possíveis soluções:**\n• Verifique se TEMP_MAIL_TOKEN está configurado no .env\n• Acesse https://22.do para obter um token\n• Contate o suporte se o problema persistir`,
      embeds: [],
      components: []
    });
  }
}

// ─── Handler de botões ────────────────────────────────────────────────────────
async function handleTempMailButton(interaction) {
  const id = interaction.customId;

  if (id === 'tempmail_novo') {
    return comandoEmailTemp(interaction);
  }

  if (id.startsWith('tempmail_refresh_')) {
    await interaction.deferUpdate();
    const [, , username, domain] = id.split('_');

    try {
      const mensagens = await tempMailService.buscarMensagens(username, domain);

      if (!mensagens.length) {
        const embed = new EmbedBuilder()
          .setColor(0xFFA500)
          .setTitle('📭 Nenhuma Mensagem')
          .setDescription([
            `> Email: \`${username}@${domain}\``,
            '> ',
            '> ❌ Nenhuma mensagem recebida ainda.',
            '> ',
            '> 💡 Aguarde alguns segundos e clique em **🔄 Ver Mensagens** novamente.'
          ].join('\n'))
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`tempmail_refresh_${username}_${domain}`)
            .setLabel('🔄 Atualizar')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`tempmail_delete_${username}_${domain}`)
            .setLabel('🗑️ Deletar')
            .setStyle(ButtonStyle.Danger)
        );

        return interaction.editReply({ embeds: [embed], components: [row] });
      }

      // Mostrar mensagens
      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle(`📬 ${mensagens.length} Mensagem(ns) Recebida(s)`)
        .setDescription(`> Email: \`${username}@${domain}\``)
        .setTimestamp();

      for (const msg of mensagens.slice(0, 5)) {
        const data = new Date(msg.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        const preview = msg.subject?.slice(0, 100) || 'Sem assunto';
        const corpo = msg.text?.slice(0, 200) || msg.html?.replace(/<[^>]*>/g, '').slice(0, 200) || '_Sem conteúdo_';

        embed.addFields({
          name: `📩 ${preview}`,
          value: [
            `👤 **De:** ${msg.from || 'Desconhecido'}`,
            `📅 **Data:** ${data}`,
            `📝 **Preview:** ${corpo}...`,
            `🆔 \`${msg.id}\``
          ].join('\n'),
          inline: false
        });
      }

      if (mensagens.length > 5) {
        embed.setFooter({ text: `Mostrando 5 de ${mensagens.length} mensagens` });
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`tempmail_refresh_${username}_${domain}`)
          .setLabel('🔄 Atualizar')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`tempmail_delete_${username}_${domain}`)
          .setLabel('🗑️ Deletar')
          .setStyle(ButtonStyle.Danger)
      );

      return interaction.editReply({ embeds: [embed], components: [row] });
    } catch (error) {
      return interaction.editReply({
        content: `❌ Erro ao buscar mensagens:\n\`\`\`${error.message}\`\`\``,
        embeds: [],
        components: []
      });
    }
  }

  if (id.startsWith('tempmail_delete_')) {
    await interaction.deferUpdate();
    const [, , username, domain] = id.split('_');

    try {
      await tempMailService.deletarEmail(username, domain);

      // Deletar do banco
      db.prepare('DELETE FROM emails_temporarios WHERE username=? AND domain=?').run(username, domain);

      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('🗑️ Email Deletado')
        .setDescription([
          `> Email \`${username}@${domain}\` foi deletado com sucesso.`,
          '> ',
          '> 💡 Clique em **➕ Novo Email** para criar outro.'
        ].join('\n'))
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('tempmail_novo')
          .setLabel('➕ Novo Email')
          .setStyle(ButtonStyle.Success)
      );

      return interaction.editReply({ embeds: [embed], components: [row] });
    } catch (error) {
      return interaction.editReply({
        content: `❌ Erro ao deletar email:\n\`\`\`${error.message}\`\`\``,
        embeds: [],
        components: []
      });
    }
  }
}

module.exports = {
  tempMailService,
  comandoEmailTemp,
  handleTempMailButton
};
