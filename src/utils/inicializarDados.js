/**
 * Garante que todos os arquivos de dados existam antes do bot subir.
 * Necessário no Railway (filesystem efêmero — dados são recriados a cada boot).
 */

const fs   = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '../data');

const ARQUIVOS_PADRAO = {
  'sorteios.json':             '{}',
  'bots_autorizados.json':     '[]',
  'bloqueados_avaliacao.json': '[]',
  'painel_avaliacao.json':     '{}',
  'stats_avaliacoes.json':     JSON.stringify({
    total: 0, aprovadas: 0, mediaGlobal: 0, somaNota: 0, porProduto: {}
  }, null, 2),
};

function inicializar() {
  // Garante que o diretório existe
  if (!fs.existsSync(DIR)) {
    fs.mkdirSync(DIR, { recursive: true });
    console.log('[Data] Diretório /data criado.');
  }

  // Garante que cada arquivo existe
  for (const [nome, conteudoPadrao] of Object.entries(ARQUIVOS_PADRAO)) {
    const caminho = path.join(DIR, nome);
    if (!fs.existsSync(caminho)) {
      fs.writeFileSync(caminho, conteudoPadrao, 'utf-8');
      console.log(`[Data] Arquivo criado: ${nome}`);
    }
  }
}

module.exports = { inicializar };
