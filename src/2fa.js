const fs = require('fs');
const path = require('path');
const speakeasy = require('speakeasy');

const DATA_DIR = path.join(process.cwd(), 'data');
const SECRETS_FILE = path.join(DATA_DIR, '2fa-secrets.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadSecrets() {
  ensureDataDir();

  try {
    if (!fs.existsSync(SECRETS_FILE)) {
      fs.writeFileSync(SECRETS_FILE, '{}', 'utf8');
      return {};
    }

    const raw = fs.readFileSync(SECRETS_FILE, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (error) {
    console.error('[2FA] Erro ao carregar segredos:', error.message);
    return {};
  }
}

function saveSecrets(data) {
  ensureDataDir();

  try {
    fs.writeFileSync(SECRETS_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('[2FA] Erro ao salvar segredos:', error.message);
    return false;
  }
}

function normalizeUserId(userId) {
  return String(userId);
}

function getUserSecrets(userId) {
  const secrets = loadSecrets();
  const normalizedId = normalizeUserId(userId);
  return secrets[normalizedId] || {};
}

function setUserSecrets(userId, userSecrets) {
  const secrets = loadSecrets();
  const normalizedId = normalizeUserId(userId);
  secrets[normalizedId] = userSecrets;
  return saveSecrets(secrets);
}

function add2FAAccount(userId, label, secret) {
  const trimmedLabel = String(label || '').trim();
  const trimmedSecret = String(secret || '').trim();

  if (!trimmedLabel) {
    throw new Error('Informe um nome para a conta 2FA.');
  }

  if (!trimmedSecret) {
    throw new Error('Informe a chave secreta Base32 da conta 2FA.');
  }

  const userSecrets = getUserSecrets(userId);

  if (userSecrets[trimmedLabel]) {
    throw new Error(`Você já salvou uma conta chamada "${trimmedLabel}".`);
  }

  userSecrets[trimmedLabel] = trimmedSecret;
  setUserSecrets(userId, userSecrets);

  return true;
}

function remove2FAAccount(userId, label) {
  const trimmedLabel = String(label || '').trim();
  const userSecrets = getUserSecrets(userId);

  if (!userSecrets[trimmedLabel]) {
    throw new Error(`Conta "${trimmedLabel}" não encontrada.`);
  }

  delete userSecrets[trimmedLabel];
  setUserSecrets(userId, userSecrets);

  return true;
}

function list2FAAccounts(userId) {
  return Object.keys(getUserSecrets(userId));
}

function generate2FACode(userId, label) {
  const trimmedLabel = String(label || '').trim();
  const secret = getUserSecrets(userId)[trimmedLabel];

  if (!secret) {
    throw new Error(`Conta "${trimmedLabel}" não encontrada.`);
  }

  return generate2FACodeFromSecret(secret, trimmedLabel);
}

function generate2FACodeFromSecret(secret, label = '2FA') {
  const trimmedSecret = String(secret || '').trim();

  if (!trimmedSecret) {
    throw new Error('Informe a chave secreta Base32 da conta 2FA.');
  }

  const token = speakeasy.totp({
    secret: trimmedSecret,
    encoding: 'base32',
  });

  const remaining = 30 - Math.floor((Date.now() / 1000) % 30);

  return {
    label: String(label || '2FA').trim() || '2FA',
    token,
    remaining,
  };
}

function generateAll2FACodes(userId) {
  const userSecrets = getUserSecrets(userId);
  return Object.keys(userSecrets).map((label) => generate2FACode(userId, label));
}

module.exports = {
  add2FAAccount,
  remove2FAAccount,
  list2FAAccounts,
  generate2FACode,
  generate2FACodeFromSecret,
  generateAll2FACodes,
};
