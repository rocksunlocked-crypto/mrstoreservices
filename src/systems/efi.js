const axios = require('axios');
const fs = require('fs');
const https = require('https');
const config = require('../config');

// ─── Token cache ──────────────────────────────────────────────────────────────
let _token = null;
let _tokenExpira = 0;

function baseURL() {
  return config.efi.sandbox
    ? 'https://pix-h.api.efipay.com.br'
    : 'https://pix.api.efipay.com.br';
}

function baseURLBoleto() {
  return config.efi.sandbox
    ? 'https://sandbox.efipay.com.br'
    : 'https://api.efipay.com.br';
}

// ─── HTTPS Agent com certificado ─────────────────────────────────────────────
function getAgent() {
  // Suporte a certificado via variável de ambiente (base64) — usado no Railway/produção
  if (process.env.EFI_CERTIFICATE_BASE64) {
    const b64 = process.env.EFI_CERTIFICATE_BASE64.replace(/[\s\r\n]/g, '');
    console.log(`[EFI] Usando certificado BASE64 (${b64.length} chars)`);
    const certBuffer = Buffer.from(b64, 'base64');
    return new https.Agent({ pfx: certBuffer, passphrase: '' });
  }
  // Fallback: arquivo local
  if (config.efi.certificatePath && fs.existsSync(config.efi.certificatePath)) {
    console.log(`[EFI] Usando certificado arquivo: ${config.efi.certificatePath}`);
    const cert = fs.readFileSync(config.efi.certificatePath);
    return new https.Agent({ pfx: cert, passphrase: '' });
  }
  console.error('[EFI] ⚠️ NENHUM CERTIFICADO ENCONTRADO — PIX vai falhar!');
  return undefined;
}

// ─── Autenticação OAuth2 ──────────────────────────────────────────────────────
async function getToken() {
  if (_token && Date.now() < _tokenExpira) return _token;

  const credentials = Buffer.from(`${config.efi.clientId}:${config.efi.clientSecret}`).toString('base64');
  const agent = getAgent();

  try {
    const res = await axios.post(
      `${baseURL()}/oauth/token`,
      { grant_type: 'client_credentials' },
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/json',
        },
        httpsAgent: agent,
      }
    );
    _token = res.data.access_token;
    _tokenExpira = Date.now() + (res.data.expires_in - 60) * 1000;
    return _token;
  } catch (err) {
    const detalhe = err.response?.data
      ? (typeof err.response.data === 'string'
          ? err.response.data.substring(0, 200)
          : JSON.stringify(err.response.data))
      : err.message;
    console.error('[EFI Auth] Status:', err.response?.status, '| URL:', baseURL());
    console.error('[EFI Auth] Detalhe:', detalhe);
    throw new Error(`EFI Auth falhou: ${detalhe}`);
  }
}

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

// ─── Criar cobrança PIX imediata ──────────────────────────────────────────────
async function criarCobrancaPix({ valor, descricao, pedidoId, nomeCliente, cpf }) {
  const token = await getToken();
  const agent = getAgent();

  const payload = {
    calendario: { expiracao: 1800 }, // 30 minutos
    devedor: cpf ? {
      cpf: cpf.replace(/\D/g, ''),
      nome: nomeCliente || 'Cliente',
    } : undefined,
    valor: { original: Number(valor).toFixed(2) },
    chave: config.efi.pixKey,
    solicitacaoPagador: descricao || 'Máximo Store',
    infoAdicionais: [
      { nome: 'Pedido', valor: pedidoId.slice(0, 8).toUpperCase() },
    ],
  };

  const res = await axios.post(
    `${baseURL()}/v2/cob`,
    payload,
    { headers: headers(token), httpsAgent: agent }
  );

  return {
    txid:     res.data.txid,
    locId:    res.data.loc?.id,        // ID numérico do location (usado para QR Code)
    location: res.data.location,
    status:   res.data.status,
    valor:    res.data.valor?.original,
    expiracao: res.data.calendario?.expiracao,
  };
}

// ─── Gerar QR Code do PIX ─────────────────────────────────────────────────────
// locId = res.data.loc.id (numérico) retornado pela criarCobrancaPix
async function gerarQRCode(locId) {
  const token = await getToken();
  const agent = getAgent();

  const res = await axios.get(
    `${baseURL()}/v2/loc/${locId}/qrcode`,
    { headers: headers(token), httpsAgent: agent }
  );

  return {
    qrcode:           res.data.qrcode,
    imagemQrcode:     res.data.imagemQrcode,
    linkVisualizacao: res.data.linkVisualizacao,
  };
}

// ─── Consultar status de cobrança ─────────────────────────────────────────────
async function consultarCobranca(txid) {
  const token = await getToken();
  const agent = getAgent();

  const res = await axios.get(
    `${baseURL()}/v2/cob/${txid}`,
    { headers: headers(token), httpsAgent: agent }
  );

  return {
    txid: res.data.txid,
    status: res.data.status, // ATIVA | CONCLUIDA | REMOVIDA_PELO_USUARIO_RECEBEDOR | REMOVIDA_PELO_PSP
    valor: res.data.valor?.original,
    pago: res.data.status === 'CONCLUIDA',
    pix: res.data.pix, // array de pagamentos realizados
  };
}

// ─── Solicitar devolução (reembolso) PIX ──────────────────────────────────────
async function devolverPix(txid, e2eId, valor, idDevol) {
  const token = await getToken();
  const agent = getAgent();

  const res = await axios.put(
    `${baseURL()}/v2/pix/${e2eId}/devolucao/${idDevol}`,
    { valor: Number(valor).toFixed(2) },
    { headers: headers(token), httpsAgent: agent }
  );

  return res.data;
}

// ─── Criar cobrança por boleto ────────────────────────────────────────────────
async function criarBoleto({ valor, vencimento, descricao, cliente }) {
  const token = await getToken();
  const agent = getAgent();

  const payload = {
    items: [{ name: descricao || 'Produto', value: Math.round(valor * 100), amount: 1 }],
    customer: {
      name: cliente.nome,
      cpf: cliente.cpf?.replace(/\D/g, ''),
      email: cliente.email,
      phone_number: cliente.telefone?.replace(/\D/g, ''),
    },
    expire_at: vencimento || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    payment: {
      banking_billet: {
        expire_at: vencimento || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        customer: {
          name: cliente.nome,
          cpf: cliente.cpf?.replace(/\D/g, ''),
          email: cliente.email,
        },
      },
    },
  };

  const res = await axios.post(
    `${baseURLBoleto()}/v1/charge`,
    payload,
    { headers: headers(token), httpsAgent: agent }
  );

  return {
    id: res.data.data?.charge_id,
    link: res.data.data?.link,
    barcodeData: res.data.data?.barcode,
    status: res.data.data?.status,
  };
}

// ─── Enviar PIX de saída (transferência para chave PIX do usuário) ───────────
async function enviarPixSaida({ valor, chavePix, descricao = 'Saque de coins' }) {
  const token = await getToken();
  const agent = getAgent();

  // Gerar ID único para o envio (máx 35 chars alfanumérico)
  const idEnvio = `saque${Date.now()}`.slice(0, 35);

  const payload = {
    valor: Number(valor).toFixed(2),
    pagador: {
      cpf: '09772166240',
      nome: 'Máximo Store',
    },
    favorecido: {
      chave: chavePix.trim(),
    },
  };

  const res = await axios.put(
    `${baseURL()}/v2/gn/pix/${idEnvio}`,
    payload,
    { headers: headers(token), httpsAgent: agent }
  );

  return {
    idEnvio:  res.data?.idEnvio || idEnvio,
    status:   res.data?.status,
    valor:    res.data?.valor || valor,
  };
}

// ─── Registrar webhook PIX ────────────────────────────────────────────────────
async function registrarWebhook(webhookUrl) {
  const token = await getToken();
  const agent = getAgent();
  const chave = config.efi.pixKey;

  const res = await axios.put(
    `${baseURL()}/v2/webhook/${chave}`,
    { webhookUrl },
    { headers: headers(token), httpsAgent: agent }
  );

  return res.data;
}

module.exports = {
  criarCobrancaPix,
  gerarQRCode,
  consultarCobranca,
  devolverPix,
  criarBoleto,
  registrarWebhook,
  enviarPixSaida,
};
