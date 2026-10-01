/**
 * Sessões temporárias de criação de sorteio por usuário.
 * Guardadas em memória — expiram em 30 minutos de inatividade.
 */

const sessoes = new Map(); // userId -> { dados, timeout }
const TTL = 30 * 60 * 1000; // 30 minutos

function obter(userId) {
  return sessoes.get(userId)?.dados ?? null;
}

function salvar(userId, dados) {
  // Cancela timer anterior
  const antiga = sessoes.get(userId);
  if (antiga?.timeout) clearTimeout(antiga.timeout);

  const timeout = setTimeout(() => sessoes.delete(userId), TTL);
  sessoes.set(userId, { dados, timeout });
}

function atualizar(userId, patch) {
  const atual = obter(userId) ?? {};
  salvar(userId, { ...atual, ...patch });
  return obter(userId);
}

function limpar(userId) {
  const antiga = sessoes.get(userId);
  if (antiga?.timeout) clearTimeout(antiga.timeout);
  sessoes.delete(userId);
}

function nova(userId) {
  salvar(userId, {
    titulo:      null,
    descricao:   null,
    imagem:      null,
    premios:     null,   // string com linhas
    duracao:     null,   // string ex: "1h"
    qtdVenc:     1,
    cargoPartic: null,
    cargoPremio: null,
    convites:    0,
  });
  return obter(userId);
}

// Verifica se o mínimo para publicar está preenchido
function podePublicar(userId) {
  const s = obter(userId);
  if (!s) return false;
  return !!(s.titulo && s.premios && s.duracao);
}

module.exports = { obter, salvar, atualizar, limpar, nova, podePublicar };
