# Motor do funil (standalone)

O funil em si: HTML + CSS + JavaScript puro, **sem build**, dirigido por arquivos JSON. É o que
o cliente publica (sobe em qualquer servidor estático).

## Como rodar localmente

O motor carrega os arquivos de `config/` via `fetch`, então **não funciona abrindo o
`index.html` direto (file://)** — precisa de um servidor local. A partir desta pasta:

```bash
# Opção 1 — Python (já vem no Windows/macOS/Linux)
python -m http.server 8000   # abra http://localhost:8000

# Opção 2 — Node
npx serve .
```

## Estrutura

```
funil-standalone/
  index.html        ← casca do quiz + slots de snippets de tracking
  pitch.html        ← página de venda (pitch)
  config/           ← VOCÊ EDITA AQUI (veja config/README.md)
    brand.json      ← cores, fontes, logo, fundo, largura
    quiz.json       ← etapas, perguntas, pontuação, diagnóstico
    offers.json     ← ofertas Low / Mid / High
    pitch.json      ← blocos da página de venda
    tracking.json   ← pixels e endpoint de eventos
  assets/           ← quiz.css, pitch.css, logo (pode ajustar)
  src/              ← MOTOR (não editar): engine.js, pitch.js, events.js, brand.js
  pages/            ← páginas extras (futuro)
  server/           ← backend de eventos + dashboard (Fase 4)
```

## Customizar com IA (Claude Code ou Codex)

Peça à IA para editar **apenas** os arquivos de `config/`. Exemplo de pedido:

> "Leia `config/README.md`. Refaça `config/quiz.json` para um quiz de [seu nicho], seguindo a
> estrutura SPIN (situação, problema, implicação, necessidade) e mantendo a pontuação coerente
> com as ofertas de `offers.json`."

## Próximas fases

- **Backend** (`server/`): recebe os eventos e grava em SQLite.
- **Dashboard**: retenção pergunta a pergunta, abandono, conversão.
- **Deploy**: ver `docs/tecnico/deploy-servidor.md`.

## Publicação no DigitalOcean

Este repositório versiona o quiz completo: o frontend estático e o backend PHP em
`server/`. Ele pode ser publicado em um Droplet com PHP ou Docker, atrás de Caddy
ou Nginx.

As configurações sensíveis e os dados de execução continuam fora do Git:

- `server/config.php` (senha do dashboard e origem permitida);
- `server/database/` (respostas armazenadas no SQLite);
- arquivos `.env`.

Ao hospedar o frontend e o backend no mesmo domínio, mantenha o endpoint relativo
em `config/tracking.json`. Assim, o quiz envia os eventos para
`./server/api/event.php` no próprio domínio, e o painel fica em
`/server/dashboard/`.
