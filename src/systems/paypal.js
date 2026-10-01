/**
 * Sistema de pagamento PayPal
 * - Converte BRL → USD com taxa de 10%
 * - Cria ordem de pagamento
 * - Captura pagamento após aprovação
 * - Webhook para confirmação automática
 */

const axios = require('axios');

const BASE_URL = process.env.PAYPAL_SANDBOX === 'true'
  ? 'https://api-m.sandbox.paypal.com'
  : 'https://api-m.paypal.com';

let _token = null;
let _tokenExpira = 0;

// ─── Autenticação OAuth2 ──────────────────────────────────────────────────────
async function getToken() {
  if (_token && Date.now() < _tokenExpira) return _token;

  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_SECRET) {
    throw new Error('Credenciais PayPal não configuradas (PAYPAL_CLIENT_ID / PAYPAL_SECRET)');
  }

  const credentials = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`
  ).toString('base64');

  const res = await axios.post(
    `${BASE_URL}/v1/oauth2/token`,
    'grant_type=client_credentials',
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  _token = res.data.access_token;
  _tokenExpira = Date.now() + (res.data.expires_in - 60) * 1000;
  return _token;
}

// ─── Converter BRL para USD com taxa de 10% ───────────────────────────────────
async function brlParaUsd(valorBrl) {
  try {
    // Buscar cotação atual BRL/USD
    const res = await axios.get('https://api.exchangerate-api.com/v4/latest/BRL').catch(() => null);
    const taxa = res?.data?.rates?.USD || 0.20; // fallback: 1 BRL = 0.20 USD
    const valorUsd = valorBrl * taxa;
    // Aplicar taxa de 50%
    const valorFinal = valorUsd * 1.50;
    return Number(valorFinal.toFixed(2));
  } catch {
    // Fallback: conversão manual com taxa fixa
    const valorUsd = valorBrl * 0.20 * 1.50;
    return Number(valorUsd.toFixed(2));
  }
}

// ─── Criar ordem de pagamento ─────────────────────────────────────────────────
async function criarOrdem({ valorBrl, descricao, pedidoId, webhookReturnUrl }) {
  const token    = await getToken();
  const valorUsd = await brlParaUsd(valorBrl);

  const returnUrl = webhookReturnUrl || `${process.env.WEBHOOK_URL?.replace('/webhook', '')}/paypal/sucesso`;
  const cancelUrl = `${process.env.WEBHOOK_URL?.replace('/webhook', '')}/paypal/cancelar`;

  const payload = {
    intent: 'CAPTURE',
    purchase_units: [{
      reference_id: pedidoId,
      description:  descricao || 'Máximo Store',
      amount: {
        currency_code: 'USD',
        value: String(valorUsd),
      },
    }],
    application_context: {
      brand_name:          'Máximo Store',
      landing_page:        'BILLING',
      user_action:         'PAY_NOW',
      return_url:          returnUrl,
      cancel_url:          cancelUrl,
    },
  };

  const res = await axios.post(
    `${BASE_URL}/v2/checkout/orders`,
    payload,
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );

  const linkApprove = res.data.links?.find(l => l.rel === 'approve')?.href;

  return {
    orderId:    res.data.id,
    status:     res.data.status,
    valorUsd,
    valorBrl,
    linkPagar:  linkApprove,
  };
}

// ─── Capturar pagamento ───────────────────────────────────────────────────────
async function capturarPagamento(orderId) {
  const token = await getToken();

  const res = await axios.post(
    `${BASE_URL}/v2/checkout/orders/${orderId}/capture`,
    {},
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );

  return {
    status:    res.data.status, // COMPLETED
    orderId:   res.data.id,
    pago:      res.data.status === 'COMPLETED',
    valor:     res.data.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value,
    pedidoId:  res.data.purchase_units?.[0]?.reference_id,
  };
}

// ─── Consultar ordem ──────────────────────────────────────────────────────────
async function consultarOrdem(orderId) {
  const token = await getToken();
  const res   = await axios.get(
    `${BASE_URL}/v2/checkout/orders/${orderId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return {
    status:   res.data.status,
    pago:     res.data.status === 'COMPLETED',
    pedidoId: res.data.purchase_units?.[0]?.reference_id,
  };
}

module.exports = { brlParaUsd, criarOrdem, capturarPagamento, consultarOrdem };
