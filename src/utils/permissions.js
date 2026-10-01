const config = require('../config');

const { staffHierarchy, roles } = config;

/**
 * Verifica se o membro tem pelo menos o nível mínimo na hierarquia de staff.
 * @param {GuildMember} member
 * @param {string} minKey - 'owner'|'admin'|'loja'|'aceitarCompra'|'mod'|'suporte'
 */
function temPermissao(member, minKey) {
  const idx = staffHierarchy.findIndex(h => h.key === minKey);
  if (idx === -1) return false;
  for (let i = 0; i <= idx; i++) {
    if (member.roles.cache.has(staffHierarchy[i].id)) return true;
  }
  return false;
}

// Atalhos
const isOwner        = m => m.roles.cache.has(roles.owner);
const isAdmin        = m => temPermissao(m, 'admin');
const isLoja         = m => temPermissao(m, 'loja');
const isAceitarCompra= m => temPermissao(m, 'aceitarCompra');
const isMod          = m => temPermissao(m, 'mod');
const isStaff        = m => temPermissao(m, 'suporte');

// Pode ver tickets (suporte ou superior)
const podeVerTickets     = m => isStaff(m);
// Pode assumir tickets (apenas admin ou superior)
const podeAssumirTicket  = m => isAdmin(m);
// Pode configurar carrinhos (apenas loja ou superior)
const podeConfigurarLoja = m => isLoja(m);
// Pode aceitar compra sem pagamento (cargo aceitar compra ou superior)
const podeAceitarCompra  = m => isAceitarCompra(m);

/**
 * Retorna o nível mais alto do membro na hierarquia de staff.
 */
function nivelStaff(member) {
  for (const h of staffHierarchy) {
    if (member.roles.cache.has(h.id)) return h.key;
  }
  return null;
}

/**
 * Verifica se o membro é cliente (qualquer nível).
 */
function isCliente(member) {
  return (
    member.roles.cache.has(roles.clienteSupremo) ||
    member.roles.cache.has(roles.clientePremium) ||
    member.roles.cache.has(roles.cliente)
  );
}

/**
 * Retorna o desconto do membro baseado nos cargos de cliente.
 * Inclui desconto de nível de fidelidade também.
 */
function getDesconto(member, nivelFidelidade) {
  let desconto = 0;

  // Desconto por cargo de cliente
  if (member.roles.cache.has(roles.clienteSupremo)) desconto = Math.max(desconto, 25);
  else if (member.roles.cache.has(roles.clientePremium)) desconto = Math.max(desconto, 10);

  // Desconto por nível de fidelidade (acumula com cargo)
  if (nivelFidelidade) {
    const nivel = config.fidelidade.niveis.find(n => n.nome === nivelFidelidade);
    if (nivel) desconto = Math.max(desconto, nivel.desconto);
  }

  return desconto;
}

/**
 * Verifica se o membro tem cooldown de produto free (se não tem cargo isento).
 */
function temIsencaoCooldownFree(member) {
  return config.produtosFree.exemptRoles.some(id => member.roles.cache.has(id));
}

module.exports = {
  temPermissao,
  isOwner, isAdmin, isLoja, isAceitarCompra, isMod, isStaff,
  podeVerTickets, podeAssumirTicket, podeConfigurarLoja, podeAceitarCompra,
  nivelStaff, isCliente, getDesconto, temIsencaoCooldownFree,
};
