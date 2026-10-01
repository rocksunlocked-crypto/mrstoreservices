/**
 * deploy-commands.js — Registra todos os slash commands no servidor
 * Rode manualmente: node src/deploy-commands.js
 */
require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs   = require('fs');
const path = require('path');

const commands  = [];
const seen      = new Set();
const pasta     = path.join(__dirname, 'commands');

function walk(dir) {
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    if (fs.statSync(full).isDirectory()) { walk(full); continue; }
    if (!item.endsWith('.js')) continue;
    const cmd = require(full);
    if (!cmd.data) continue;
    const nome = cmd.data.name;
    if (seen.has(nome)) { console.warn(`⚠️  Duplicado ignorado: /${nome}`); continue; }
    seen.add(nome);
    commands.push(cmd.data.toJSON());
    console.log(`✅ /${nome}`);
  }
}

walk(pasta);

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  console.log(`\n🚀 Registrando ${commands.length} comandos...\n`);
  try {
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands },
    );
    console.log(`\n✅ ${commands.length} comandos registrados com sucesso!`);
  } catch (err) {
    console.error('❌ Erro:', err.message);
  }
})();
