const { SlashCommandBuilder } = require('discord.js');
const { db } = require('../../database/database');
const { isOwner } = require('../../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reset-ips')
    .setDescription('🌐 [OWNER] Resetar todos os IPs do banco de dados')
    .setDefaultMemberPermissions('0'),
  
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
      let totalLimpo = 0;
      
      // 1. Limpar coluna last_ip
      const r1 = db.prepare('UPDATE usuarios SET last_ip=NULL WHERE last_ip IS NOT NULL').run();
      totalLimpo += r1.changes;
      
      // 2. Limpar tabela user_ips (se existir)
      let r2Changes = 0;
      try {
        const r2 = db.prepare('DELETE FROM user_ips').run();
        r2Changes = r2.changes;
        totalLimpo += r2Changes;
      } catch(e) {
        // Tabela não existe
      }
      
      // 3. Limpar tabela login_attempts (se existir)
      let r3Changes = 0;
      try {
        const r3 = db.prepare('DELETE FROM login_attempts').run();
        r3Changes = r3.changes;
        totalLimpo += r3Changes;
      } catch(e) {
        // Tabela não existe
      }

      // Log da operação
      const { log } = require('../../utils/logger');
      await log('sistema', { 
        executor: interaction.user.id, 
        descricao: `🌐 TODOS os IPs foram resetados (${totalLimpo} registros limpos)` 
      });

      return interaction.editReply({ 
        content: [
          '✅ **Reset de IPs concluído com sucesso!**',
          '',
          `📊 **Estatísticas:**`,
          `• ${r1.changes} usuários com last_ip limpo`,
          `• ${r2Changes} registros de user_ips deletados`,
          `• ${r3Changes} tentativas de login deletadas`,
          '',
          `📝 Total: **${totalLimpo}** registro(s) limpos`,
          '',
          '🔓 Todos os usuários podem fazer login de qualquer IP agora.',
          '⚠️ Esta ação foi registrada nos logs do sistema.'
        ].join('\n')
      });

    } catch (error) {
      console.error('[Reset IPs]', error);
      return interaction.editReply({ 
        content: `❌ Erro ao resetar IPs: ${error.message}` 
      });
    }
  },
};
