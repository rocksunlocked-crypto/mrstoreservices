const { EmbedBuilder } = require('discord.js');
const fs   = require('fs');
const path = require('path');

const ARQ = path.join(__dirname, '../data/stats_avaliacoes.json');

function carregar() {
  if (!fs.existsSync(ARQ)) return { total: 0, aprovadas: 0, mediaGlobal: 0, somaNota: 0, porProduto: {} };
  try { return JSON.parse(fs.readFileSync(ARQ, 'utf-8')); } catch {
    return { total: 0, aprovadas: 0, mediaGlobal: 0, somaNota: 0, porProduto: {} };
  }
}

function salvar(dados) {
  fs.writeFileSync(ARQ, JSON.stringify(dados, null, 2));
}

// Chamado ao aprovar uma avaliação
function registrarAprovacao(produto, nota) {
  const s = carregar();
  s.total++;
  s.aprovadas++;
  s.somaNota = (s.somaNota ?? 0) + nota;
  s.mediaGlobal = s.somaNota / s.aprovadas;

  const chave = produto.toLowerCase().trim();
  if (!s.porProduto[chave]) {
    s.porProduto[chave] = { nome: produto, total: 0, soma: 0, media: 0 };
  }
  s.porProduto[chave].total++;
  s.porProduto[chave].soma += nota;
  s.porProduto[chave].media = s.porProduto[chave].soma / s.porProduto[chave].total;

  salvar(s);
}

// Mostra o ranking de produtos
async function mostrarRanking(interaction) {
  const s = carregar();

  const produtos = Object.values(s.porProduto)
    .sort((a, b) => b.media - a.media || b.total - a.total)
    .slice(0, 10);

  if (!produtos.length) {
    return interaction.reply({ content: '📋 Ainda não há avaliações aprovadas.', flags: 64 });
  }

  const medalhas = ['🥇', '🥈', '🥉'];
  const linhas = produtos.map((p, i) => {
    const estrelas = '⭐'.repeat(Math.round(p.media)) + '☆'.repeat(5 - Math.round(p.media));
    return `${medalhas[i] ?? `**${i + 1}.**`} **${p.nome}**\n   ${estrelas} \`${p.media.toFixed(1)}/5\` — ${p.total} avaliação(ões)`;
  }).join('\n\n');

  const embed = new EmbedBuilder()
    .setTitle('🏆 Ranking de Avaliações')
    .setDescription(linhas)
    .setColor(0xFFD700)
    .addFields(
      { name: '📋 Total aprovadas', value: `${s.aprovadas}`,             inline: true },
      { name: '⭐ Média global',    value: `${s.mediaGlobal?.toFixed(1) ?? '—'}/5`, inline: true },
      { name: '🛍️ Produtos avaliados', value: `${produtos.length}`,     inline: true },
    )
    .setFooter({ text: `Consultado por ${interaction.user.username}` })
    .setTimestamp();

  return interaction.reply({ embeds: [embed], flags: 64 });
}

module.exports = { registrarAprovacao, mostrarRanking, carregar };
