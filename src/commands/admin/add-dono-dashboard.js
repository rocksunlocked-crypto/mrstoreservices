const { SlashCommandBuilder } = require('discord.js');
const { isOwner } = require('../../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('add-dono-dashboard')
    .setDescription('👑 [OWNER] Adicionar usuário como dono do dashboard')
    .setDefaultMemberPermissions('0')
    .addStringOption(o =>
      o.setName('username')
       .setDescription('Username do dashboard')
       .setRequired(true)
    )
    .addStringOption(o =>
      o.setName('password')
       .setDescription('Senha (deixe vazio para manter a atual)')
       .setRequired(false)
    ),
  
  async execute(interaction) {
    // Apenas owner pode executar
    if (!isOwner(interaction.member)) {
      return interaction.reply({ 
        content: '❌ Apenas o owner pode executar este comando.', 
        ephemeral: true 
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const username = interaction.options.getString('username').trim();
      const password = interaction.options.getString('password');
      
      const { hashPass } = require('../../dashboard/auth');
      const { db } = require('../../database/database');
      const { getUsuarioByUsername } = require('../../dashboard/db');

      // Verificar se usuário existe
      const usuarioExistente = getUsuarioByUsername(username);

      if (usuarioExistente) {
        // Atualizar para dono
        if (password) {
          db.prepare('UPDATE dash_usuarios SET cargo=?, password=?, aprovado=1 WHERE username=?')
            .run('dono', hashPass(password), username);
        } else {
          db.prepare('UPDATE dash_usuarios SET cargo=?, aprovado=1 WHERE username=?')
            .run('dono', username);
        }

        const { log } = require('../../utils/logger');
        await log('sistema', { 
          executor: interaction.user.id, 
          descricao: `👑 Usuário ${username} promovido a DONO do dashboard` 
        });

        return interaction.editReply({ 
          content: [
            '✅ **Usuário promovido a DONO!**',
            '',
            `👤 **Username:** ${username}`,
            `👑 **Novo cargo:** Dono`,
            `🔑 **Senha:** ${password ? 'Atualizada' : 'Mantida'}`,
            '',
            '📝 O usuário agora tem acesso total ao dashboard.',
            '⚠️ Esta ação foi registrada nos logs.'
          ].join('\n')
        });
      } else {
        // Criar novo usuário dono
        if (!password) {
          return interaction.editReply({ 
            content: '❌ Para criar um novo usuário, você precisa fornecer uma senha.' 
          });
        }

        const { v4: uuidv4 } = require('uuid');
        db.prepare('INSERT INTO dash_usuarios (username, password, discord_id, cargo, aprovado) VALUES (?,?,?,?,1)')
          .run(username, hashPass(password), interaction.user.id, 'dono');

        const { log } = require('../../utils/logger');
        await log('sistema', { 
          executor: interaction.user.id, 
          descricao: `👑 Novo usuário DONO criado no dashboard: ${username}` 
        });

        return interaction.editReply({ 
          content: [
            '✅ **Novo usuário DONO criado!**',
            '',
            `👤 **Username:** ${username}`,
            `🔑 **Senha:** ${password}`,
            `👑 **Cargo:** Dono`,
            '',
            '📝 O usuário pode fazer login no dashboard agora.',
            '⚠️ Esta ação foi registrada nos logs.',
            '',
            '💡 Compartilhe as credenciais de forma segura!'
          ].join('\n')
        });
      }

    } catch (error) {
      console.error('[Add Dono Dashboard]', error);
      return interaction.editReply({ 
        content: `❌ Erro: ${error.message}` 
      });
    }
  },
};
