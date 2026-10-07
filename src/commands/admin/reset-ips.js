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
      let mensagens = [];
      
      // 1. Limpar tabela user_ips (se existir)
      let r1Changes = 0;
      try {
        const r1 = db.prepare('DELETE FROM user_ips').run();
        r1Changes = r1.changes;
        totalLimpo += r1Changes;
        mensagens.push(`✅ ${r1Changes} registro(s) de user_ips deletados`);
      } catch(e) {
        mensagens.push(`⚠️ Tabela user_ips não existe`);
      }
      
      // 2. Limpar tabela login_attempts (se existir)
      let r2Changes = 0;
      try {
        const r2 = db.prepare('DELETE FROM login_attempts').run();
        r2Changes = r2.changes;
        totalLimpo += r2Changes;
        mensagens.push(`✅ ${r2Changes} tentativa(s) de login deletadas`);
      } catch(e) {
        mensagens.push(`⚠️ Tabela login_attempts não existe`);
      }
      
      // 3. Limpar tabela de sessões web (se existir)
      let r3Changes = 0;
      try {
        const r3 = db.prepare('DELETE FROM sessoes_web').run();
        r3Changes = r3.changes;
        totalLimpo += r3Changes;
        mensagens.push(`✅ ${r3Changes} sessão(ões) web deletadas`);
      } catch(e) {
        mensagens.push(`⚠️ Tabela sessoes_web não existe`);
      }

      // Log da operação
      const { log } = require('../../utils/logger');
      await log('sistema', { 
        executor: interaction.user.id, 
        descricao: `🌐 Reset de IPs executado (${totalLimpo} registros limpos)` 
      });

      return interaction.editReply({ 
        content: [
          totalLimpo > 0 ? '✅ **Reset de IPs concluído com sucesso!**' : '⚠️ **Nenhum registro de IP encontrado**',
          '',
          `📊 **Resultados:**`,
          ...mensagens,
          '',
          totalLimpo > 0 ? `📝 Total: **${totalLimpo}** registro(s) limpos` : '💡 O banco não possui tabelas de controle de IP',
          '',
          '🔓 Sistema de autenticação web (se existir) foi resetado.',
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
