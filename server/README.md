# Server — backend de eventos + dashboard (PHP + SQLite)

Grava os eventos que o motor já emite e mostra o **dashboard de retenção por etapa**. Roda em
qualquer hospedagem com **PHP** (cPanel, Hostinger, host de WordPress) ou numa VPS. Sem
dependências externas (PDO SQLite vem no PHP).

## Estrutura

```
server/
  config.example.php   copie para config.php e ajuste (senha + CORS)
  api/
    db.php             conexão SQLite + criação do schema (events, leads)
    event.php          POST: recebe e grava os eventos do funil
    stats.php          GET: devolve os dados agregados (JSON) — exige login
  dashboard/
    index.php          login por senha + página do painel
    dashboard.js       lê stats.php e desenha (barras em CSS, zero dependência)
    dashboard.css
  database/            o .sqlite é criado aqui na 1ª gravação (fora do git)
```

## Como ativar (3 passos)

1. **Config:** copie `config.example.php` para `config.php` e defina:
   - `dashboard_senha` (troque!), `cors_origin` (a URL do seu funil em produção).
2. **Apontar o motor:** em `funil/config/tracking.json`, preencha
   `"endpoint": "https://seudominio.com/server/api/event.php"` (ou caminho relativo se o funil e o
   server estiverem no mesmo host).
3. **Publicar num host com PHP.** Pronto: o banco é criado sozinho na primeira gravação.

> Host estático (GitHub Pages/Netlify) não roda PHP. Nesse caso, hospede a pasta `server/` num
> host PHP separado e use a URL completa no `endpoint` (o CORS já está tratado).

## Dashboard

Acesse `…/server/dashboard/` no navegador, entre com a senha e veja:
- **KPIs:** iniciaram, leads, taxa de lead, cliques no CTA, conversão.
- **Retenção por etapa:** % que chegou em cada pergunta + **abandono** (destacado em vermelho quando ≥ 30%).
- **Origem do tráfego** (por `utm_source`) e **resultados por oferta**.
- **Eventos recentes.**

## Eventos e dados

Eventos: `quiz_started`, `step_viewed`, `answer_selected`, `lead_submitted`, `result_viewed`,
`cta_clicked` (com `session_id`, `step_id`, UTMs, timestamp do servidor). Quando o lead é enviado,
os dados de contato vão para a tabela `leads` (upsert por `session_id`).

Fórmulas:
```
retenção_etapa = sessões_que_viram_a_etapa / sessões_que_iniciaram
abandono_etapa = 1 − sessões_da_etapa / sessões_da_etapa_anterior
```

## Segurança
- `config.php` e o `.sqlite` ficam fora do git (ver `.gitignore`).
- Acesso direto ao banco e ao `config.php` por URL é bloqueado por `.htaccess` (em `server/` e `server/database/`). Em produção, prefira `db_path` fora do `public_html`. Para Nginx, ver as regras comentadas no `.htaccess`.
- O dashboard exige senha (sessão PHP). Troque a senha padrão antes de publicar.
- Nenhum token/segredo no código: só em `config.php` / `.env`.
