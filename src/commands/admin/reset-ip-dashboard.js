const { SlashCommandBuilder } = require('discord.js');
const { isOwner, isAdmin } = require('../../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reset-ip-dashboard')
    .setDescription('🌐 [ADMIN] Resetar IP de usuário do Dashboard')
    .setDefaultMemberPermissions('0')
    .addStringOption(o =>
      o.setName('username')
       .setDescription('Username do dashboard (ou "todos" para limpar todos)')
       .setRequired(true)
    ),
  
  async execute(interaction) {
    // Apenas admin+ pode executar
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ 
        content: '❌ Apenas admins podem executar este comando.', 
        ephemeral: true 
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const username = interaction.options.getString('username').trim();
      const { 
        getUsuarioByUsername, 
        resetarIp, 
        listarUsuarios 
      } = require('../../dashboard/db');

      // Reset de todos os usuários (apenas owner)
      if (username.toLowerCase() === 'todos') {
        if (!isOwner(interaction.member)) {
          return interaction.editReply({ 
            content: '❌ Apenas o owner pode resetar TODOS os IPs do dashboard.' 
          });
        }

        const usuarios = listarUsuarios();
        let contador = 0;
        
        for (const u of usuarios) {
          if (u.ip_bloqueado) {
            resetarIp(u.id);
            contador++;
          }
        }

        const { log } = require('../../utils/logger');
        await log('sistema', { 
          executor: interaction.user.id, 
          descricao: `🌐 TODOS os IPs do dashboard foram resetados (${contador} usuários)` 
        });

        return interaction.editReply({ 
          content: [
            '✅ **Reset global de IPs concluído!**',
            '',
            `📊 **Resultado:**`,
            `• ${contador} usuário(s) com IP resetado`,
            `• ${usuarios.length - contador} usuário(s) sem IP bloqueado`,
            '',
            '🔓 Todos podem fazer login de qualquer IP.',
            '🗑️ Todas as sessões foram invalidadas.',
            '⚠️ Esta ação foi registrada nos logs.'
          ].join('\n')
        });
      }

      // Reset de um usuário específico
      const usuario = getUsuarioByUsername(username);
      
      if (!usuario) {
        return interaction.editReply({ 
          content: `❌ Usuário \`${username}\` não encontrado no dashboard.` 
        });
      }

      const tinhaIp = usuario.ip_bloqueado;
      resetarIp(usuario.id);

      const { log } = require('../../utils/logger');
      await log('sistema', { 
        executor: interaction.user.id, 
        descricao: `🌐 IP do dashboard resetado: ${username} (ID: ${usuario.id})` 
      });

      return interaction.editReply({ 
        content: [
          '✅ **IP resetado com sucesso!**',
          '',
          `👤 **Usuário:** ${username}`,
          `🔑 **Cargo:** ${usuario.cargo}`,
          `📍 **IP anterior:** ${tinhaIp || 'Nenhum'}`,
          '',
          '🔓 O usuário pode fazer login de qualquer IP agora.',
          '🗑️ Todas as sessões antigas foram invalidadas.',
          '⚠️ Esta ação foi registrada nos logs do sistema.'
        ].join('\n')
      });

    } catch (error) {
      console.error('[Reset IP Dashboard]', error);
      return interaction.editReply({ 
        content: `❌ Erro ao resetar IP: ${error.message}` 
      });
    }
  },
};
