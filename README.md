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

## GitHub Pages

Este repositório publica o frontend estático do quiz no GitHub Pages. O diretório
`server/` fica fora do repositório: GitHub Pages não executa PHP, portanto a coleta
de respostas e o dashboard precisam continuar em um servidor PHP próprio. Antes do
primeiro envio ao público, configure em `config/tracking.json` a URL HTTPS desse
servidor para receber os eventos.
