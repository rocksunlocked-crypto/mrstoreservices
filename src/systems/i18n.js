/**
 * Sistema de Internacionalização (i18n)
 * Idiomas: PT-BR, EN, FR, HI, ES
 * O idioma é salvo por usuário no banco e aplicado em todas as respostas
 */

const { StringSelectMenuBuilder, ActionRowBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../database/database');
const config = require('../config');

// ─── Definição dos idiomas ────────────────────────────────────────────────────
const IDIOMAS = {
  'pt-BR': { nome: '🇧🇷 Português (Brasil)', flag: '🇧🇷' },
  'en':    { nome: '🇺🇸 English',             flag: '🇺🇸' },
  'fr':    { nome: '🇫🇷 Français',             flag: '🇫🇷' },
  'hi':    { nome: '🇮🇳 हिन्दी (Hindi)',       flag: '🇮🇳' },
  'es':    { nome: '🇪🇸 Español',              flag: '🇪🇸' },
};

// ─── Traduções ────────────────────────────────────────────────────────────────
const T = {
  // ─ Entrega de produto ──────────────────────────────────────────────────────
  delivery_title: {
    'pt-BR': '✅ Produto Entregue!',
    'en':    '✅ Product Delivered!',
    'fr':    '✅ Produit Livré!',
    'hi':    '✅ उत्पाद वितरित!',
    'es':    '✅ ¡Producto Entregado!',
  },
  delivery_thanks: {
    'pt-BR': (nome) => `Obrigado pela sua compra, **${nome}**! 🎉`,
    'en':    (nome) => `Thank you for your purchase, **${nome}**! 🎉`,
    'fr':    (nome) => `Merci pour votre achat, **${nome}**! 🎉`,
    'hi':    (nome) => `आपकी खरीद के लिए धन्यवाद, **${nome}**! 🎉`,
    'es':    (nome) => `¡Gracias por tu compra, **${nome}**! 🎉`,
  },
  delivery_product: {
    'pt-BR': '📦 Produto',
    'en':    '📦 Product',
    'fr':    '📦 Produit',
    'hi':    '📦 उत्पाद',
    'es':    '📦 Producto',
  },
  delivery_value: {
    'pt-BR': '💵 Valor Pago',
    'en':    '💵 Amount Paid',
    'fr':    '💵 Montant Payé',
    'hi':    '💵 भुगतान राशि',
    'es':    '💵 Monto Pagado',
  },
  delivery_order: {
    'pt-BR': '🆔 Pedido',
    'en':    '🆔 Order',
    'fr':    '🆔 Commande',
    'hi':    '🆔 ऑर्डर',
    'es':    '🆔 Pedido',
  },
  delivery_your_product: {
    'pt-BR': '📋 Seu Produto',
    'en':    '📋 Your Product',
    'fr':    '📋 Votre Produit',
    'hi':    '📋 आपका उत्पाद',
    'es':    '📋 Tu Producto',
  },
  delivery_manual: {
    'pt-BR': '⚠️ Entrega manual — nossa equipe entrará em contato.',
    'en':    '⚠️ Manual delivery — our team will contact you.',
    'fr':    '⚠️ Livraison manuelle — notre équipe vous contactera.',
    'hi':    '⚠️ मैन्युअल डिलीवरी — हमारी टीम संपर्क करेगी।',
    'es':    '⚠️ Entrega manual — nuestro equipo te contactará.',
  },
  delivery_footer: {
    'pt-BR': 'Máximo Store • Obrigado pela preferência! ❤️',
    'en':    'Máximo Store • Thank you for your preference! ❤️',
    'fr':    'Máximo Store • Merci pour votre préférence! ❤️',
    'hi':    'Máximo Store • आपकी प्राथमिकता के लिए धन्यवाद! ❤️',
    'es':    'Máximo Store • ¡Gracias por tu preferencia! ❤️',
  },
  delivery_confirm: {
    'pt-BR': '✅ Confirmar Recebimento',
    'en':    '✅ Confirm Receipt',
    'fr':    '✅ Confirmer Réception',
    'hi':    '✅ प्राप्ति की पुष्टि करें',
    'es':    '✅ Confirmar Recepción',
  },
  delivery_rate: {
    'pt-BR': '⭐ Avaliar',
    'en':    '⭐ Rate',
    'fr':    '⭐ Évaluer',
    'hi':    '⭐ रेटिंग दें',
    'es':    '⭐ Calificar',
  },

  // ─ Ticket ──────────────────────────────────────────────────────────────────
  ticket_welcome: {
    'pt-BR': (nome) => `Olá, <@${nome}>! 👋\nSeu ticket de compra foi criado. Nossa equipe irá atendê-lo em breve.`,
    'en':    (nome) => `Hello, <@${nome}>! 👋\nYour purchase ticket has been created. Our team will attend to you shortly.`,
    'fr':    (nome) => `Bonjour, <@${nome}>! 👋\nVotre ticket d'achat a été créé. Notre équipe vous répondra bientôt.`,
    'hi':    (nome) => `नमस्ते, <@${nome}>! 👋\nआपका खरीद टिकट बनाया गया है। हमारी टीम जल्द ही आपकी सहायता करेगी।`,
    'es':    (nome) => `¡Hola, <@${nome}>! 👋\nTu ticket de compra ha sido creado. Nuestro equipo te atenderá pronto.`,
  },
  ticket_pay_pix: {
    'pt-BR': '💠 Pagar via PIX',
    'en':    '💠 Pay via PIX',
    'fr':    '💠 Payer via PIX',
    'hi':    '💠 PIX से भुगतान',
    'es':    '💠 Pagar vía PIX',
  },
  ticket_pay_boleto: {
    'pt-BR': '📄 Boleto',
    'en':    '📄 Bank Slip',
    'fr':    '📄 Boleto',
    'hi':    '📄 बोलेटो',
    'es':    '📄 Boleto',
  },
  ticket_cancel: {
    'pt-BR': '❌ Cancelar',
    'en':    '❌ Cancel',
    'fr':    '❌ Annuler',
    'hi':    '❌ रद्द करें',
    'es':    '❌ Cancelar',
  },
  ticket_pay_coins: {
    'pt-BR': '🪙 Pagar com Coins',
    'en':    '🪙 Pay with Coins',
    'fr':    '🪙 Payer avec Coins',
    'hi':    '🪙 Coins से भुगतान',
    'es':    '🪙 Pagar con Coins',
  },
  ticket_free: {
    'pt-BR': '✅ Liberar Sem Pagamento',
    'en':    '✅ Release Without Payment',
    'fr':    '✅ Libérer Sans Paiement',
    'hi':    '✅ बिना भुगतान जारी करें',
    'es':    '✅ Liberar Sin Pago',
  },

  // ─ PIX ─────────────────────────────────────────────────────────────────────
  pix_title: {
    'pt-BR': '💠 Pagamento via PIX',
    'en':    '💠 PIX Payment',
    'fr':    '💠 Paiement PIX',
    'hi':    '💠 PIX भुगतान',
    'es':    '💠 Pago PIX',
  },
  pix_expires: {
    'pt-BR': '⏰ Expira em **30 minutos**',
    'en':    '⏰ Expires in **30 minutes**',
    'fr':    '⏰ Expire dans **30 minutes**',
    'hi':    '⏰ **30 मिनट** में समाप्त',
    'es':    '⏰ Expira en **30 minutos**',
  },
  pix_code: {
    'pt-BR': '📋 Código PIX (Copia e Cola)',
    'en':    '📋 PIX Code (Copy and Paste)',
    'fr':    '📋 Code PIX (Copier-Coller)',
    'hi':    '📋 PIX कोड (कॉपी और पेस्ट)',
    'es':    '📋 Código PIX (Copiar y Pegar)',
  },
  pix_footer: {
    'pt-BR': 'Pagamento confirmado automaticamente • Máximo Store',
    'en':    'Payment confirmed automatically • Máximo Store',
    'fr':    'Paiement confirmé automatiquement • Máximo Store',
    'hi':    'भुगतान स्वचालित रूप से पुष्टि • Máximo Store',
    'es':    'Pago confirmado automáticamente • Máximo Store',
  },
  pix_verify: {
    'pt-BR': '🔄 Verificar Pagamento',
    'en':    '🔄 Verify Payment',
    'fr':    '🔄 Vérifier Paiement',
    'hi':    '🔄 भुगतान जाँचें',
    'es':    '🔄 Verificar Pago',
  },

  // ─ Geral ───────────────────────────────────────────────────────────────────
  choose_language: {
    'pt-BR': '🌐 Escolha seu idioma',
    'en':    '🌐 Choose your language',
    'fr':    '🌐 Choisissez votre langue',
    'hi':    '🌐 अपनी भाषा चुनें',
    'es':    '🌐 Elige tu idioma',
  },
  language_set: {
    'pt-BR': (lang) => `✅ Idioma definido: **${IDIOMAS[lang]?.nome}**`,
    'en':    (lang) => `✅ Language set: **${IDIOMAS[lang]?.nome}**`,
    'fr':    (lang) => `✅ Langue définie: **${IDIOMAS[lang]?.nome}**`,
    'hi':    (lang) => `✅ भाषा सेट: **${IDIOMAS[lang]?.nome}**`,
    'es':    (lang) => `✅ Idioma establecido: **${IDIOMAS[lang]?.nome}**`,
  },
  translate_btn: {
    'pt-BR': '🌐 Idioma',
    'en':    '🌐 Language',
    'fr':    '🌐 Langue',
    'hi':    '🌐 भाषा',
    'es':    '🌐 Idioma',
  },
};

// ─── Obter idioma do usuário ──────────────────────────────────────────────────
function getIdioma(discordId) {
  try {
    const u = db.prepare('SELECT idioma FROM usuarios WHERE discord_id=?').get(discordId);
    return u?.idioma || 'pt-BR';
  } catch { return 'pt-BR'; }
}

// ─── Definir idioma do usuário ────────────────────────────────────────────────
function setIdioma(discordId, idioma) {
  try {
    db.prepare('UPDATE usuarios SET idioma=? WHERE discord_id=?').run(idioma, discordId);
  } catch {}
}

// ─── Traduzir uma chave ───────────────────────────────────────────────────────
function t(chave, idioma = 'pt-BR', ...args) {
  const traducao = T[chave]?.[idioma] || T[chave]?.['pt-BR'] || chave;
  if (typeof traducao === 'function') return traducao(...args);
  return traducao;
}

// ─── Select menu de idioma ────────────────────────────────────────────────────
function selectMenuIdioma(idiomaAtual = 'pt-BR') {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('selecionar_idioma')
      .setPlaceholder('🌐 Selecione seu idioma')
      .addOptions(Object.entries(IDIOMAS).map(([val, info]) => ({
        label: info.nome,
        value: val,
        default: val === idiomaAtual,
        emoji: info.flag,
      })))
  );
}

// ─── Botão de idioma (adiciona em qualquer row) ───────────────────────────────
function btnIdioma(idioma = 'pt-BR') {
  const { ButtonBuilder, ButtonStyle } = require('discord.js');
  return new ButtonBuilder()
    .setCustomId('abrir_idioma')
    .setLabel(t('translate_btn', idioma))
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('🌐');
}

// ─── Embed de seleção de idioma ───────────────────────────────────────────────
async function mostrarSeletorIdioma(interaction) {
  const idioma = getIdioma(interaction.user.id);
  const embed = new EmbedBuilder()
    .setColor(config.colors.info)
    .setTitle('🌐 Language / Idioma / Langue / Idioma / भाषा')
    .setDescription([
      '🇧🇷 Selecione seu idioma preferido',
      '🇺🇸 Select your preferred language',
      '🇫🇷 Sélectionnez votre langue',
      '🇮🇳 अपनी पसंदीदा भाषा चुनें',
      '🇪🇸 Selecciona tu idioma preferido',
    ].join('\n'))
    .setTimestamp();

  const fn = interaction.replied || interaction.deferred ? 'editReply' : 'reply';
  await interaction[fn]({
    embeds:     [embed],
    components: [selectMenuIdioma(idioma)],
    ephemeral:  true,
  });
}

module.exports = { T, IDIOMAS, t, getIdioma, setIdioma, selectMenuIdioma, btnIdioma, mostrarSeletorIdioma };
