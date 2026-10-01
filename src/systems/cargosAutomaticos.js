/**
 * Sistema de Cargos Automáticos
 * - Compra qualquer produto → cargo Cliente
 * - R$ 200+ gastos → cargo Cliente Premium + 10% desconto
 * - R$ 1000+ gastos → cargo Cliente Supremo + 25% desconto
 * Cargos inferiores são removidos quando sobe de nível
 */

const config = require('../config');
const { log } = require('../utils/logger');

const NIVEIS = config.niveisCliente; // ordenado do mais alto pro mais baixo

/**
 * Atualizar cargo de cliente com base no total gasto.
 * Chamado após cada pagamento confirmado.
 * @param {GuildMember} member
 * @param {number} totalGasto - total acumulado do usuário
 */
async function atualizarCargoCliente(member, totalGasto) {
  if (!member) return;

  try {
    const roles  = config.roles;

    // Determinar nível atual
    let novoNivel = null;
    for (const nivel of NIVEIS) { // já vem do mais alto pro mais baixo
      if (totalGasto >= nivel.minGasto) {
        novoNivel = nivel;
        break;
      }
    }

    if (!novoNivel) return;

    const roleId = roles[novoNivel.roleKey];
    if (!roleId) return;

    // Verificar se já tem o cargo
    if (member.roles.cache.has(roleId)) return;

    // Adicionar novo cargo
    await member.roles.add(roleId).catch(() => {});

    // Remover cargos inferiores de cliente
    const inferiores = NIVEIS
      .filter(n => NIVEIS.indexOf(n) > NIVEIS.indexOf(novoNivel))
      .map(n => roles[n.roleKey])
      .filter(Boolean);

    for (const id of inferiores) {
      if (member.roles.cache.has(id)) {
        await member.roles.remove(id).catch(() => {});
      }
    }

    // Log
    await log('sistema', {
      usuario:   member.id,
      descricao: `${novoNivel.emoji} Cargo **${novoNivel.nome}** concedido a ${member.user.tag} (R$ ${totalGasto.toFixed(2)} gastos)`,
    });

    // Notificar usuário
    await member.send({
      embeds: [{
        color:       config.colors.gold,
        title:       `${novoNivel.emoji} Parabéns! Novo cargo desbloqueado`,
        description: [
          `Você atingiu o nível **${novoNivel.nome}**!`,
          novoNivel.desconto > 0
            ? `\n🎁 Benefício: **${novoNivel.desconto}% de desconto** em todos os produtos!`
            : '',
          `\n💰 Total gasto: R$ ${totalGasto.toFixed(2)}`,
        ].join(''),
        timestamp:   new Date().toISOString(),
        footer:      { text: 'Máximo Store • Obrigado pela fidelidade!' },
      }],
    }).catch(() => {});

  } catch (err) {
    console.error('[CargosAuto]', err.message);
  }
}

/**
 * Retorna o desconto do membro baseado no cargo de cliente mais alto que ele tem.
 */
function getDescontoCliente(member) {
  const roles = config.roles;
  for (const nivel of NIVEIS) {
    const roleId = roles[nivel.roleKey];
    if (roleId && member.roles.cache.has(roleId)) {
      return nivel.desconto;
    }
  }
  return 0;
}

/**
 * Retorna o nível de cliente do membro.
 */
function getNivelCliente(member) {
  const roles = config.roles;
  for (const nivel of NIVEIS) {
    const roleId = roles[nivel.roleKey];
    if (roleId && member.roles.cache.has(roleId)) return nivel;
  }
  return null;
}

module.exports = { atualizarCargoCliente, getDescontoCliente, getNivelCliente };
