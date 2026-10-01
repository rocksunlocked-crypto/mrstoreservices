/**
 * Sistema de Cooldown e controle de reabertura
 */

const cooldowns = new Map(); // userId -> timestamp da última abertura
const reopenWindow = new Map(); // ticketId -> timestamp do fechamento (janela de reabertura)

const COOLDOWN_MS = 60_000; // 1 minuto entre aberturas
const REOPEN_WINDOW_HOURS = 6; // Usuário pode reabrir em até 6 horas

function isOnCooldown(userId) {
  const last = cooldowns.get(userId);
  if (!last) return false;
  return (Date.now() - last) < COOLDOWN_MS;
}

function getCooldownRemaining(userId) {
  const last = cooldowns.get(userId);
  if (!last) return 0;
  const remaining = COOLDOWN_MS - (Date.now() - last);
  return Math.max(0, Math.ceil(remaining / 1000));
}

function setCooldown(userId) {
  cooldowns.set(userId, Date.now());
}

function setReopenWindow(ticketId, closedAt) {
  reopenWindow.set(ticketId, closedAt);
}

function canReopen(ticketId) {
  const closedAt = reopenWindow.get(ticketId);
  if (!closedAt) return true; // sem janela definida, permite
  const hoursElapsed = (Date.now() / 1000 - closedAt) / 3600;
  return hoursElapsed <= REOPEN_WINDOW_HOURS;
}

function getReopenTimeLeft(ticketId) {
  const closedAt = reopenWindow.get(ticketId);
  if (!closedAt) return REOPEN_WINDOW_HOURS * 3600;
  const remaining = (REOPEN_WINDOW_HOURS * 3600) - (Date.now() / 1000 - closedAt);
  return Math.max(0, Math.round(remaining));
}

module.exports = {
  isOnCooldown,
  getCooldownRemaining,
  setCooldown,
  setReopenWindow,
  canReopen,
  getReopenTimeLeft,
  COOLDOWN_MS,
  REOPEN_WINDOW_HOURS,
};
