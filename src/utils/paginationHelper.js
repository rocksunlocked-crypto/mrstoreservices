/**
 * Helper genérico para paginação de SelectMenus
 */

const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

/**
 * Cria um SelectMenu paginado com botões de navegação
 * @param {Object} config
 * @param {Array} config.items - Array de StringSelectMenuOptionBuilder
 * @param {string} config.customId - ID base do select (ex: 'pa_select_produto')
 * @param {string} config.placeholder - Placeholder do select
 * @param {number} config.page - Página atual (começa em 0)
 * @param {string} config.buttonPrefix - Prefixo dos botões de navegação (ex: 'pa_pag_produto')
 * @param {number} [config.itemsPerPage=24] - Itens por página
 * @returns {{ rows: ActionRowBuilder[], totalPages: number, currentPage: number }}
 */
function createPaginatedSelect(config) {
  const {
    items,
    customId,
    placeholder,
    page = 0,
    buttonPrefix,
    itemsPerPage = 24,
  } = config;

  const totalPages = Math.ceil(items.length / itemsPerPage);
  const currentPage = Math.max(0, Math.min(page, totalPages - 1));
  const start = currentPage * itemsPerPage;
  const end = Math.min(start + itemsPerPage, items.length);
  const pageItems = items.slice(start, end);

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(`${placeholder} (${start + 1}-${end} de ${items.length})`)
    .addOptions(pageItems);

  const rows = [new ActionRowBuilder().addComponents(selectMenu)];

  // Adicionar botões de navegação se tiver mais de 1 página
  if (totalPages > 1) {
    const btnAnterior = new ButtonBuilder()
      .setCustomId(`${buttonPrefix}_${currentPage - 1}`)
      .setLabel('◀ Anterior')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentPage === 0);

    const btnInfo = new ButtonBuilder()
      .setCustomId(`${buttonPrefix}_info`)
      .setLabel(`Página ${currentPage + 1}/${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true);

    const btnProximo = new ButtonBuilder()
      .setCustomId(`${buttonPrefix}_${currentPage + 1}`)
      .setLabel('Próximo ▶')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentPage >= totalPages - 1);

    rows.push(new ActionRowBuilder().addComponents(btnAnterior, btnInfo, btnProximo));
  }

  return { rows, totalPages, currentPage };
}

module.exports = { createPaginatedSelect };
