const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const { db } = require('../database/database');
const { log } = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

/**
 * Criar cupom
 */
function criarCupom({
  codigo, tipo = 'percentual', valor, minCompra = 0,
  maxDesconto = null, usosMax = 100, validadeDias = 30,
  produtoId = null, categoria = null, criadoPor,
}) {
  const id = uuidv4();
  const validadeTs = Math.floor(Date.now() / 1000) + (validadeDias * 86400);

  db.prepare(`
    INSERT INTO cupons (id, codigo, tipo, valor, min_compra, max_desconto, usos_max, validade, produto_id, categoria, criado_por)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(id, codigo.toUpperCase(), tipo, valor, minCompra, maxDesconto, usosMax, validadeTs, produtoId, categoria, criadoPor);

  return id;
}

/**
 * Listar cupons ativos
 */
function listarCupons(apenasAtivos = true) {
  let q = 'SELECT * FROM cupons';
  if (apenasAtivos) q += ' WHERE ativo = 1';
  q += ' ORDER BY criado_em DESC';
  return db.prepare(q).all();
}

/**
 * Desativar cupom
 */
function desativarCupom(codigo) {
  return db.prepare('UPDATE cupons SET ativo=0 WHERE codigo=?').run(codigo.toUpperCase());
}

/**
 * Gerar código aleatório de cupom
 */
function gerarCodigoCupom(prefixo = '') {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let cod = prefixo ? prefixo.toUpperCase() + '-' : '';
  for (let i = 0; i < 6; i++) cod += chars[Math.floor(Math.random() * chars.length)];
  return cod;
}

/**
 * Embed de informações de cupom
 */
function embedCupom(cupom) {
  const agora = Math.floor(Date.now() / 1000);
  const expirado = cupom.validade && cupom.validade < agora;
  const esgotado = cupom.usos_atual >= cupom.usos_max;

  return new EmbedBuilder()
    .setColor(expirado || esgotado ? config.colors.error : config.colors.success)
    .setTitle(`🎟️ Cupom: ${cupom.codigo}`)
    .addFields(
      { name: '💰 Tipo', value: cupom.tipo === 'percentual' ? `${cupom.valor}% de desconto` : `R$ ${Number(cupom.valor).toFixed(2)} de desconto`, inline: true },
      { name: '🛒 Compra Mínima', value: `R$ ${Number(cupom.min_compra).toFixed(2)}`, inline: true },
      { name: '📊 Usos', value: `${cupom.usos_atual}/${cupom.usos_max}`, inline: true },
      { name: '⏰ Validade', value: cupom.validade ? new Date(cupom.validade * 1000).toLocaleDateString('pt-BR') : 'Sem validade', inline: true },
      { name: '📋 Status', value: expirado ? '❌ Expirado' : esgotado ? '❌ Esgotado' : '✅ Ativo', inline: true },
    )
    .setTimestamp();
}

module.exports = { criarCupom, listarCupons, desativarCupom, gerarCodigoCupom, embedCupom };
