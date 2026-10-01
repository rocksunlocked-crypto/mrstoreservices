const sessoes = new Map();
const TTL = 30 * 60 * 1000;

function obter(userId) { return sessoes.get(userId)?.dados ?? null; }

function salvar(userId, dados) {
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
    canal: null, titulo: null, descricao: null,
    imagem: null, cor: null,
    botao1: null, botao2: null, botao3: null, botao4: null, botao5: null,
  });
  return obter(userId);
}

function podePublicar(userId) {
  const s = obter(userId);
  return !!(s?.canal && s?.titulo);
}

function podeDM(userId) {
  const s = obter(userId);
  return !!(s?.titulo);
}

module.exports = { obter, salvar, atualizar, limpar, nova, podePublicar, podeDM };
