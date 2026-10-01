# Bot MrStore Unificado

Três bots em um único processo:

| Módulo | Funções |
|--------|---------|
| **Bot de Vendas** | Loja, carrinho, PIX (EFI), produtos, cupons, coins, afiliados, caixas misteriosas, flash sale |
| **Bot Mr** | Painel `/menu`, sorteio, anúncios, avaliações, proteção, backup, tradutor, status de call |
| **Bot Tickets** | Sistema avançado: denúncia / suporte / parceria, SLA, auto-close, prioridades, tags, transcript HTML |

---

## Configuração

### 1. Variáveis de ambiente

Copie `.env.example` para `.env` e preencha:

```bash
cp .env.example .env
```

Variáveis obrigatórias:
- `DISCORD_TOKEN` — token do bot
- `CLIENT_ID` — ID da aplicação
- `GUILD_ID` — ID do servidor principal

### 2. Instalar dependências

```bash
npm install
```

### 3. Registrar comandos slash

```bash
node src/deploy-commands.js
```

### 4. Iniciar

```bash
npm start
```

---

## Deploy no Railway

1. Faça push para o GitHub (sem o `.env` — use variáveis de ambiente no painel do Railway)
2. No Railway: **New Project → Deploy from GitHub repo**
3. Adicione todas as variáveis do `.env.example` em **Variables**
4. O Railway detecta o `railway.toml` e usa `node src/index.js` automaticamente

### Variáveis importantes no Railway

| Variável | Descrição |
|----------|-----------|
| `DISCORD_TOKEN` | Token do bot |
| `CLIENT_ID` | ID da aplicação |
| `GUILD_ID` | ID do servidor |
| `EFI_CLIENT_ID` / `EFI_CLIENT_SECRET` | Credenciais EFI Bank PIX |
| `EFI_PIX_KEY` | Chave PIX |
| `WEBHOOK_URL` | URL pública do Railway (ex: `https://SEU-APP.up.railway.app/webhook`) |
| `BOT_URL` | Mesma URL base (para transcripts) |
| `TICKET_TRANSCRIPT_CHANNEL` | Canal onde o embed de log do transcript é enviado |
| `TICKET_HTML_CHANNEL` | Canal onde o arquivo HTML do transcript é enviado |

---

## Canais e cargos

Todos configuráveis via `.env`. Os padrões já estão preenchidos com os IDs do servidor MrStore.

### Tickets avançados (denúncia/suporte/parceria)

- `TICKET_CATEGORY_SUPORTE` — pasta do Discord para tickets de suporte
- `TICKET_CATEGORY_DENUNCIA` — pasta para denúncias
- `TICKET_CATEGORY_PARCERIA` — pasta para propostas de parceria
- `TICKET_ROLE_ADMIN` / `TICKET_ROLE_MOD` / `TICKET_ROLE_SUPORTE` — cargos da staff de tickets

Se não configurar categorias separadas, todos os tickets usam `CATEGORY_TICKETS`.
