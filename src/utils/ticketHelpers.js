const { EmbedBuilder } = require('discord.js');
const config = require('../config');

// Gera ID único para o ticket no mesmo formato dos tickets de compra (UUID slice 8 uppercase)
function generateTicketId() {
  const { v4: uuidv4 } = require('uuid');
  return uuidv4().slice(0, 8).toUpperCase();
}

// Formata timestamp Unix para string legível
function formatDate(unixTs) {
  if (!unixTs) return 'N/A';
  return new Date(unixTs * 1000).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

// Calcula duração entre dois timestamps Unix
function getDuration(startTs, endTs = Math.floor(Date.now() / 1000)) {
  const diff = endTs - startTs;
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// Embed de erro padrão
function errorEmbed(msg) {
  return new EmbedBuilder()
    .setColor(config.colors.danger)
    .setDescription(`${config.emojis.x} **${msg}**`);
}

// Embed de sucesso padrão
function successEmbed(msg) {
  return new EmbedBuilder()
    .setColor(config.colors.success)
    .setDescription(`${config.emojis.check} **${msg}**`);
}

// Embed de info padrão
function infoEmbed(msg) {
  return new EmbedBuilder()
    .setColor(config.colors.info)
    .setDescription(`${config.emojis.warn} **${msg}**`);
}

// Verifica se usuário tem cargo de staff
function isStaff(member) {
  const ticketRoles = config.tickets?.roles || {};
  return (
    member.permissions.has('Administrator') ||
    member.roles.cache.has(config.roles.admin) ||
    member.roles.cache.has(config.roles.mod) ||
    member.roles.cache.has(config.roles.suporte) ||
    member.roles.cache.has(config.roles.owner) ||
    member.roles.cache.has(config.roles.aceitarCompra) ||
    member.roles.cache.has(config.roles.loja) ||
    (ticketRoles.admin     && member.roles.cache.has(ticketRoles.admin)) ||
    (ticketRoles.moderador && member.roles.cache.has(ticketRoles.moderador)) ||
    (ticketRoles.suporte   && member.roles.cache.has(ticketRoles.suporte))
  );
}

// Verifica se é admin
function isAdmin(member) {
  return (
    member.permissions.has('Administrator') ||
    member.roles.cache.has(config.roles.admin) ||
    member.roles.cache.has(config.roles.owner)
  );
}

// Mapa de nomes de categoria
const categoryNames = {
  denuncia: `${config.emojis.denuncia} Denúncia`,
  suporte:  `${config.emojis.suporte} Suporte`,
  parceria: `${config.emojis.parceria} Parceria`,
};

function getCategoryName(cat) {
  return categoryNames[cat] || cat;
}

module.exports = {
  generateTicketId, formatDate, getDuration,
  errorEmbed, successEmbed, infoEmbed,
  isStaff, isAdmin, getCategoryName,
};
