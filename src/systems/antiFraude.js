const config = require('../config');
const { db } = require('../database/database');
const { log } = require('../utils/logger');

const af = config.antiFraude;

/**
 * Verifica se o usuário está bloqueado por fraude
 */
function verificar(usuarioId) {
  const registro = db.prepare('SELECT * FROM tentativas_pagamento WHERE usuario_id = ?').get(usuarioId);
  if (!registro) return { bloqueado: false };

  if (registro.bloqueado) {
    return { bloqueado: true, mensagem: 'Sua conta foi sinalizada por atividade suspeita. Contate o suporte.' };
  }

  // Rate limit: 3 tentativas em 10 minutos
  const agora = Math.floor(Date.now() / 1000);
  const janelaSegundos = 600; // 10 min
  const maxTentativas  = 3;

  if ((agora - registro.ultimo) < janelaSegundos && registro.tentativas >= maxTentativas) {
    const restante = Math.ceil(janelaSegundos - (agora - registro.ultimo));
    const min = Math.ceil(restante / 60);
    return { bloqueado: true, mensagem: `⏳ Muitas tentativas. Aguarde ${min} minuto(s) antes de tentar novamente.` };
  }

  return { bloqueado: false };
}

/**
 * Registra uma tentativa de pagamento
 */
function registrarTentativa(usuarioId) {
  const agora = Math.floor(Date.now() / 1000);
  const registro = db.prepare('SELECT * FROM tentativas_pagamento WHERE usuario_id = ?').get(usuarioId);

  if (!registro) {
    db.prepare('INSERT INTO tentativas_pagamento (usuario_id, tentativas, ultimo) VALUES (?,1,?)').run(usuarioId, agora);
    return;
  }

  const janelaSegundos = 600; // 10 min
  // Resetar se passou a janela
  if (agora - registro.ultimo > janelaSegundos) {
    db.prepare('UPDATE tentativas_pagamento SET tentativas=1, ultimo=? WHERE usuario_id=?').run(agora, usuarioId);
  } else {
    const novasTentativas = registro.tentativas + 1;
    db.prepare('UPDATE tentativas_pagamento SET tentativas=?, ultimo=? WHERE usuario_id=?').run(novasTentativas, agora, usuarioId);

    // Auto-bloquear após 6 tentativas na mesma janela
    if (novasTentativas >= 6) {
      bloquearPorFraude(usuarioId, 'Excesso de tentativas de pagamento (auto-detecção)');
    }
  }
}

/**
 * Bloquear usuário por fraude
 */
async function bloquearPorFraude(usuarioId, motivo) {
  db.prepare('UPDATE tentativas_pagamento SET bloqueado=1 WHERE usuario_id=?').run(usuarioId);
  db.prepare('UPDATE usuarios SET bloqueado=1, motivo_bloquio=? WHERE discord_id=?').run(motivo, usuarioId);

  await log('fraude', {
    usuario: usuarioId,
    descricao: `⚠️ Usuário bloqueado por fraude: ${motivo}`,
    motivo,
  });
}

/**
 * Verificar pedidos duplicados (mesmo produto no mesmo dia)
 */
function verificarPedidoDuplicado(usuarioId, produtoId) {
  const inicioDia = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
  const pedido = db.prepare(`
    SELECT COUNT(*) as c FROM pedidos
    WHERE usuario_id=? AND produto_id=? AND status IN ('pendente','pago','entregue') AND criado_em >= ?
  `).get(usuarioId, produtoId, inicioDia);
  return pedido.c > 0;
}

/**
 * Verificar limite de compras por dia
 */
function verificarLimitesDia(usuarioId) {
  const inicioDia = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
  const total = db.prepare(`SELECT COUNT(*) as c FROM pedidos WHERE usuario_id=? AND criado_em >= ?`).get(usuarioId, inicioDia);
  if (total.c >= af.maxComprasDia) {
    return { ok: false, mensagem: `Limite de ${af.maxComprasDia} compras por dia atingido.` };
  }
  return { ok: true };
}

/**
 * Verificar CPF na blacklist
 */
function verificarCpf(cpf) {
  if (!cpf) return { bloqueado: false };
  const limpo = cpf.replace(/\D/g, '');
  const r = db.prepare('SELECT * FROM cpf_blacklist WHERE cpf=?').get(limpo);
  if (r) return { bloqueado: true, mensagem: 'CPF bloqueado. Contate o suporte.' };
  return { bloqueado: false };
}

/**
 * Bloquear CPF
 */
function bloquearCpf(cpf, motivo, criadoPor) {
  const limpo = cpf.replace(/\D/g, '');
  db.prepare('INSERT OR REPLACE INTO cpf_blacklist (cpf, motivo, criado_por) VALUES (?,?,?)').run(limpo, motivo, criadoPor);
}

/**
 * Desbloquear CPF
 */
function desbloquearCpf(cpf) {
  const limpo = cpf.replace(/\D/g, '');
  db.prepare('DELETE FROM cpf_blacklist WHERE cpf=?').run(limpo);
}

/**
 * Listar CPFs bloqueados
 */
function listarCpfsBloqueados() {
  return db.prepare('SELECT * FROM cpf_blacklist ORDER BY criado_em DESC LIMIT 50').all();
}

module.exports = { verificar, registrarTentativa, bloquearPorFraude, verificarPedidoDuplicado, verificarLimitesDia, verificarCpf, bloquearCpf, desbloquearCpf, listarCpfsBloqueados };
