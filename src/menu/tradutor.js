/**
 * Tradutor usando a API gratuita do MyMemory
 * Protege tokens do Discord (<@&ID>, <t:X:R>, <#ID>, <@ID>) antes de traduzir
 * e os restaura depois, evitando corrupção de HTML.
 */

const IDIOMAS = [
  { label: '🇧🇷 Português (Brasil)', value: 'pt' },
  { label: '🇺🇸 Inglês',             value: 'en' },
  { label: '🇫🇷 Francês',            value: 'fr' },
  { label: '🇪🇸 Espanhol',           value: 'es' },
  { label: '🇮🇹 Italiano',           value: 'it' },
  { label: '🇷🇺 Russo',              value: 'ru' },
  { label: '🇮🇳 Hindi (Índia)',       value: 'hi' },
];

// Regex que captura qualquer token do Discord que não deve ser traduzido
const TOKEN_REGEX = /<[@#][!&]?\d+>|<t:\d+(?::[A-Za-z])?>|<a?:\w+:\d+>|\*\*|\n/g;

/**
 * Extrai tokens protegidos do texto e substitui por placeholders __T0__, __T1__ etc.
 * Retorna { texto limpo, mapa de restauração }
 */
function proteger(texto) {
  const mapa = {};
  let i = 0;
  const limpo = texto.replace(TOKEN_REGEX, (match) => {
    const key = `__T${i++}__`;
    mapa[key] = match;
    return key;
  });
  return { limpo, mapa };
}

/** Restaura os placeholders com os tokens originais */
function restaurar(texto, mapa) {
  let resultado = texto;
  for (const [key, val] of Object.entries(mapa)) {
    // Usa split/join para substituir todas as ocorrências (inclusive se a API duplicar)
    resultado = resultado.split(key).join(val);
    // A API às vezes adiciona espaços em volta dos placeholders — tenta variações
    resultado = resultado.split(`_ _T${key.slice(3)}`).join(val);
  }
  return resultado;
}

/**
 * Traduz texto de pt para o idioma alvo.
 * Preserva menções, timestamps e formatação do Discord.
 */
async function traduzir(texto, paraLang) {
  if (!texto || !texto.trim()) return texto;
  if (paraLang === 'pt') return texto;

  // Protege tokens antes de dividir em chunks
  const { limpo, mapa } = proteger(texto);
  const chunks = dividirTexto(limpo, 490);
  const resultados = [];

  for (const chunk of chunks) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=pt|${paraLang}`;

    try {
      const res  = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const json = await res.json();

      if (json?.responseStatus === 200 && json.responseData?.translatedText) {
        resultados.push(json.responseData.translatedText);
      } else {
        console.warn('[Tradutor] Status inesperado:', json?.responseStatus);
        resultados.push(chunk);
      }
    } catch (err) {
      console.error('[Tradutor] Erro na chamada:', err.message);
      resultados.push(chunk);
    }
  }

  const traduzido = resultados.join(' ');

  // Restaura tokens protegidos
  return restaurar(traduzido, mapa);
}

function dividirTexto(texto, maxLen) {
  if (texto.length <= maxLen) return [texto];
  const chunks = [];
  let restante = texto;
  while (restante.length > maxLen) {
    let corte = restante.lastIndexOf(' ', maxLen);
    if (corte === -1) corte = maxLen;
    chunks.push(restante.slice(0, corte));
    restante = restante.slice(corte + 1);
  }
  if (restante) chunks.push(restante);
  return chunks;
}

module.exports = { IDIOMAS, traduzir };
