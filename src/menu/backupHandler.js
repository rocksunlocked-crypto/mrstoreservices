/**
 * Backup automático dos arquivos JSON de dados.
 * Roda a cada 1h e salva em data/backups/ com timestamp.
 * Mantém os últimos 24 backups (1 dia).
 */

const fs   = require('fs');
const path = require('path');

const DIR_DATA    = path.join(__dirname, '../data');
const DIR_BACKUP  = path.join(__dirname, '../data/backups');
const MAX_BACKUPS = 24;

function fazerBackup() {
  try {
    if (!fs.existsSync(DIR_BACKUP)) fs.mkdirSync(DIR_BACKUP, { recursive: true });

    const ts        = new Date().toISOString().replace(/[:.]/g, '-');
    const dirDestino = path.join(DIR_BACKUP, ts);
    fs.mkdirSync(dirDestino, { recursive: true });

    // Copia todos os JSONs de /data (não recursivo)
    const arquivos = fs.readdirSync(DIR_DATA).filter(f => f.endsWith('.json'));
    for (const arq of arquivos) {
      fs.copyFileSync(
        path.join(DIR_DATA, arq),
        path.join(dirDestino, arq)
      );
    }

    console.log(`[Backup] ✅ Backup criado: ${ts} (${arquivos.length} arquivo(s))`);

    // Limpa backups antigos — mantém apenas os últimos MAX_BACKUPS
    const backups = fs.readdirSync(DIR_BACKUP)
      .filter(d => fs.statSync(path.join(DIR_BACKUP, d)).isDirectory())
      .sort(); // ISO date = ordem cronológica

    while (backups.length > MAX_BACKUPS) {
      const antigo = backups.shift();
      fs.rmSync(path.join(DIR_BACKUP, antigo), { recursive: true, force: true });
      console.log(`[Backup] 🗑️ Backup antigo removido: ${antigo}`);
    }
  } catch (err) {
    console.error('[Backup] ❌ Erro ao criar backup:', err.message);
  }
}

function iniciarBackup() {
  fazerBackup(); // imediato no boot
  setInterval(fazerBackup, 60 * 60 * 1000); // a cada 1h
  console.log('[Backup] 🕐 Backup automático iniciado (a cada 1h)');
}

module.exports = { iniciarBackup, fazerBackup };
