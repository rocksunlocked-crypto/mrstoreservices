const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const { db } = require('../database/database');
const { log } = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

// Migração segura — adicionar coluna cargo_id se não existir
try { db.exec('ALTER TABLE cupons ADD COLUMN cargo_id TEXT DEFAULT NULL'); } catch {}

/**
 * Criar cupom
 * Se já existir um cupom com esse código (mesmo desativado), reativa e atualiza.
 */
function criarCupom({
  codigo, tipo = 'percentual', valor, minCompra = 0,
  maxDesconto = null, usosMax = 100, validadeDias = 30,
  produtoId = null, categoria = null, cargoId = null, criadoPor,
}) {
  const codigoUp    = codigo.toUpperCase();
  const validadeTs  = Math.floor(Date.now() / 1000) + (validadeDias * 86400);

  // Verificar se já existe (ativo ou inativo)
  const existente = db.prepare('SELECT id FROM cupons WHERE codigo = ?').get(codigoUp);

  if (existente) {
    // Reativar e atualizar todos os campos
    db.prepare(`
      UPDATE cupons SET
        tipo=?, valor=?, min_compra=?, max_desconto=?, usos_max=?,
        usos_atual=0, validade=?, produto_id=?, categoria=?, cargo_id=?,
        criado_por=?, ativo=1, criado_em=strftime('%s','now')
      WHERE codigo=?
    `).run(tipo, valor, minCompra, maxDesconto, usosMax, validadeTs, produtoId, categoria, cargoId, criadoPor, codigoUp);
    return existente.id;
  }

  // Criar novo
  const id = uuidv4();
  db.prepare(`
    INSERT INTO cupons (id, codigo, tipo, valor, min_compra, max_desconto, usos_max, validade, produto_id, categoria, cargo_id, criado_por)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(id, codigoUp, tipo, valor, minCompra, maxDesconto, usosMax, validadeTs, produtoId, categoria, cargoId, criadoPor);

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
 * Desativar cupom (soft delete)
 */
function desativarCupom(codigo) {
  return db.prepare('UPDATE cupons SET ativo=0 WHERE codigo=?').run(codigo.toUpperCase());
}

/**
 * Deletar cupom permanentemente (hard delete) — permite recriar com mesmo código
 */
function deletarCupom(codigo) {
  const codigoUp = codigo.toUpperCase();
  db.prepare('DELETE FROM cupons_usos WHERE cupom_id = (SELECT id FROM cupons WHERE codigo=?)').run(codigoUp);
  return db.prepare('DELETE FROM cupons WHERE codigo=?').run(codigoUp);
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
  const agora    = Math.floor(Date.now() / 1000);
  const expirado = cupom.validade && cupom.validade < agora;
  const esgotado = cupom.usos_atual >= cupom.usos_max;

  const embed = new EmbedBuilder()
    .setColor(expirado || esgotado ? config.colors.error : config.colors.success)
    .setTitle(`🎟️ Cupom: ${cupom.codigo}`)
    .addFields(
      { name: '💰 Tipo',         value: cupom.tipo === 'percentual' ? `${cupom.valor}% de desconto` : `R$ ${Number(cupom.valor).toFixed(2)} de desconto`, inline: true },
      { name: '🛒 Compra Mín.',  value: `R$ ${Number(cupom.min_compra).toFixed(2)}`,                                   inline: true },
      { name: '📊 Usos',         value: `${cupom.usos_atual}/${cupom.usos_max}`,                                        inline: true },
      { name: '⏰ Validade',     value: cupom.validade ? new Date(cupom.validade * 1000).toLocaleDateString('pt-BR') : 'Sem validade', inline: true },
      { name: '📋 Status',       value: expirado ? '❌ Expirado' : esgotado ? '❌ Esgotado' : '✅ Ativo',              inline: true },
    )
    .setTimestamp();

  if (cupom.cargo_id) {
    embed.addFields({ name: '🎭 Cargo exclusivo', value: `<@&${cupom.cargo_id}>`, inline: true });
  }

  return embed;
}

module.exports = { criarCupom, listarCupons, desativarCupom, deletarCupom, gerarCodigoCupom, embedCupom };
