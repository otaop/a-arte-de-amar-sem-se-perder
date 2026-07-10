# Contrato de configuração do quiz

Tudo o que o comprador edita está nesta pasta. **O motor (`/src`) nunca precisa ser tocado.**
Como JSON não aceita comentários, este arquivo é a referência de cada campo.

> Regra de ouro para editar com IA: peça para a IA alterar **apenas os arquivos `.json` desta pasta**.
> Se um JSON ficar inválido, o quiz mostra uma mensagem de erro — valide em https://jsonlint.com.

---

## `brand.json` — identidade visual

| Campo | O que é |
| --- | --- |
| `name` | Nome da marca (vai no `<title>`). |
| `logo` | Caminho do logo exibido no topo (ex.: `assets/logo.svg`). Vazio = sem logo. |
| `logoHeight` | Altura do logo (ex.: `30px`). |
| `favicon` | Caminho do favicon (opcional). |
| `font` | Pilha de fontes CSS. |
| `colors.primary` | Cor principal (botões, destaques). |
| `colors.primaryHover` | Cor do botão principal no hover. |
| `colors.accent` | Cor de ação do resultado (CTA final). |
| `colors.bg` / `surface` / `border` / `text` / `muted` | Cores de fundo, cartão, bordas e textos. |
| `radius` | Arredondamento dos cantos (ex.: `16px`). |
| `background.type` | Fundo da página: `solid`, `gradient` ou `image`. |
| `background.value` | A cor, o gradiente CSS ou a URL da imagem de fundo. |
| `layout.maxWidth` | Largura máxima da coluna (ex.: `560px`, `640px`). |
| `layout.style` | `card` (padrão) ou `organic` (layout 01: perguntas em duas colunas e cartões orgânicos). |

## `quiz.json` — etapas e perguntas

`settings`:

| Campo | Efeito |
| --- | --- |
| `showProgress` | Mostra a barra de progresso. |
| `allowBack` | Permite o botão "Voltar". |
| `autoAdvanceSingle` | Avança sozinho ao escolher (perguntas de resposta única). |
| `scoring` | Liga a pontuação que decide a oferta. |
| `permitirPular` | (Opcional) `true` deixa avançar sem responder. Padrão (ausente): o "Continuar" só libera com resposta válida — número preenchido, barra movida, opção marcada. |

`steps[]` — cada etapa tem um `type`:

- **`intro`**: `headline`, `subhead`, `cta`, `disclaimer`.
- **`single`** (resposta única): `question`, `help` (opcional), `spin` (rótulo SPIN), `options[]`.
- **`multi`** (múltipla escolha): igual ao `single`, mas soma várias respostas.
- **`textarea`** (resposta aberta): `question`, `placeholder` (opcional), `rows` (opcional), `maxLength` (opcional). Salva o texto somente no backend próprio.
- **`content`** (aquecimento, sem pergunta): `eyebrow`, `headline`, `text`, `image`, `cta`. Ver seção própria abaixo.
- **`lead`**: `headline`, `subhead`, `cta`, `fields[]`, `consentText` (LGPD).
- **`result`**: `routing` decide qual oferta exibir.

Cada `option` aceita:

| Campo | O que é |
| --- | --- |
| `label` | Texto que aparece. |
| `value` | Identificador da resposta (sem espaços). |
| `score` | Pontos somados (alimenta o roteamento da oferta). |
| `next` | (Opcional) **branching**: pula direto para o `id` de outra etapa. |
| `emoji` | (Opcional) emoji exibido antes do texto da opção (ex.: `"🚀"`). |
| `image` | (Opcional) URL de imagem da opção (combina com `layout: "grid"`). |
| `exclusive` | (Opcional, em `multi`) torna uma opção incompatível com as demais, como “Ainda não investi em nada”. |

> Em qualquer etapa `single`/`multi`, adicione `"layout": "grid"` para exibir as opções em
> 2 colunas (ótimo para opções com imagem).

### Captura de lead é opcional

A etapa `lead` é só mais um item de `steps`. **Para não capturar lead, remova a etapa.**
Para usá-la como "portão" (pedir contato para liberar o resultado), coloque-a **antes** do
`result`; para pedir depois, coloque **depois**. A skill de montagem pergunta isso ao usuário.

### Final do quiz — `result.ending`

Decide o que acontece depois do resultado (diagnóstico) ser exibido:

| Campo | O que é |
| --- | --- |
| `ending.type` | `pitch` (vai para a página de venda), `redirect` (link externo) ou `none` (só mostra o resultado). |
| `ending.mode` | `button` (botão) ou `auto` (redireciona sozinho). |
| `ending.redirectDelay` | Segundos de espera quando `mode: "auto"`. |
| `ending.pitchUrl` | Caminho da página de pitch (padrão `./pitch.html`). |

No modo `redirect`, o destino é o `url` da oferta escolhida (`offers.json`).
No modo `pitch`, o motor envia `?offer=<perfil>&s=<sessão>` para a página de pitch.

### Tipos avançados de pergunta

Além de `single`/`multi`, o motor suporta:

| Tipo | Campos principais | Para que serve |
| --- | --- | --- |
| `boolean` | `yesLabel`, `noLabel`, `scoreYes`, `scoreNo` | Sim/Não (gera comprometimento) |
| `number` | `label`, `unit`, `key`, `score?` | Captura um número (guardado em `key` para usar depois) |
| `calc` | `fields[] {name,label,unit}`, `formula`, `resultText`, `score?`, `continueLabel?` | Calculadora: confronta o lead com um número real |
| `slider` | `min`, `max`, `minLabel`, `maxLabel`, `key`, `scorePerPoint?` | Escala 1–10 (autopercepção / urgência) |
| `textarea` | `question`, `placeholder?`, `rows?`, `maxLength?`, `required?` | Resposta aberta, útil para pesquisa qualitativa. |

- `calc.formula` aceita **uma operação** (`a * b`, `a / b`, `a + b`, `a - b`). Os operandos podem ser
  nomes de campos da própria calculadora **ou chaves (`key`) guardadas por perguntas `number`/`slider` anteriores**.
- `calc.resultText` usa `{resultado}` como marcador (formatado em pt-BR).
- `textarea` exige texto por padrão. Use `"required": false` para tornar a resposta opcional.
- O texto livre é gravado apenas no backend próprio e fica disponível no dashboard protegido e no CSV de respostas abertas. Pixels, GA4 e GTM recebem somente o identificador da pergunta.

### Passo de aquecimento/conteúdo — `content` (sem pergunta)

Um interstício entre perguntas: texto + imagem + **um único botão** para avançar. Não pontua, não
grava resposta e **não conta** na barra de progresso nem no total de perguntas. Serve para aquecer
a consciência do lead entre etapas do diagnóstico — prova social, FOMO, notícia do nicho, história
de transformação.

| Campo | O que é |
| --- | --- |
| `eyebrow` | (Opcional) etiqueta curta acima do título (ex.: "NOTÍCIA", "VOCÊ SABIA?"). |
| `headline` | Título do passo. |
| `text` | Parágrafo de apoio. |
| `image` | (Opcional) imagem de apoio (mesmo campo usado em `stepImage`). |
| `cta` | Texto do botão (padrão: "Continuar"). |
| `next` | (Opcional) branching — pula direto para o `id` de outra etapa. |

```jsonc
{ "id": "noticia_bolsa", "type": "content",
  "eyebrow": "Notícia",
  "headline": "Cresce o número de novos investidores na bolsa",
  "text": "Em 2025, mais de 1 milhão de brasileiros abriram sua primeira conta em corretora — a maioria começou sem experiência nenhuma.",
  "image": "assets/noticia-bolsa.jpg",
  "cta": "Entendi, continuar" }
```

> **Compliance (financeiro):** um passo `content` nesse nicho nunca promete rentabilidade, retorno
> ou ganho específico (regra CVM) — só contextualiza um cenário ou comportamento observado.

### Diagnóstico personalizado — `result.diagnostico`

Mostra um diagnóstico antes da oferta, com mensagem que muda conforme uma resposta de segmentação:

| Campo | O que é |
| --- | --- |
| `diagnostico.titulo` | Título do diagnóstico (igual para todos). |
| `diagnostico.personalizarPor` | `id` da etapa de segmentação (ex.: a P1). |
| `diagnostico.mensagens` | Objeto `{ valorDaOpcao: "texto" }` (+ `default` opcional). |
| `diagnostico.final` | Parágrafo de fechamento (igual para todos). |

`spin` aceita: `segmentation`, `situation`, `problem`, `implication`, `need`, `needpayoff`. O **badge**
exibido ao lead agrupa esses valores em 4 pilares: `segmentation`/`situation` → **Perfil**;
`problem`/`implication` → **Problema**; `need` → **Necessidades**; `needpayoff` → **Objetivo**.
Distribua os passos nessa ordem (Perfil → Problema → Necessidades → Objetivo) para o badge progredir.

`result.routing.rules[]`: lista de `{ "max": N, "offer": "low" }`. A pontuação total é
comparada do menor `max` para o maior; a primeira regra cujo `max >= pontuação` define a oferta.

## `offers.json` — ofertas Low / Mid / High

Uma chave por oferta (`low`, `mid`, `high` — você pode renomear/criar outras, basta
referenciar em `routing`). Campos: `badge`, `headline`, `text`, `kicker` (opcional), `signature`
(opcional), `cta`, `url`. `kicker` e `signature` são úteis em uma tela final de pesquisa sem CTA.

## `tracking.json` — eventos e pixels

| Campo | O que é |
| --- | --- |
| `endpoint` | URL do backend que recebe os eventos (ex.: `/api/event`). Vazio = só `console`. |
| `captureUtms` | Captura `utm_*` da URL automaticamente. |
| `external.metaPixelId` | ID do Meta Pixel (carregado automaticamente se preenchido). |
| `external.ga4Id` | ID de medição do GA4. |
| `external.googleAdsId` / `googleAdsLeadLabel` | Conversão do Google Ads. |
| `external.gtmId` | Container do Google Tag Manager. |
| `metaEvents` | Mapeia evento interno → evento padrão do Meta (ex.: `lead_submitted → Lead`). |

**Eventos internos disparados pelo motor:** `quiz_started`, `step_viewed`,
`answer_selected`, `lead_submitted`, `result_viewed`, `cta_clicked` (no quiz) e
`pitch_viewed` (na página de pitch — separado de `result_viewed` para não duplicar a conversão).

> **Privacidade (LGPD):** os dados do lead (nome, e-mail, WhatsApp) só são enviados ao **backend
> próprio** (`endpoint`). Eles **nunca** vão para Meta Pixel, GA4, Google Ads ou `dataLayer`/GTM.
> Conversão do **Google Ads** dispara automaticamente no `lead_submitted` quando `googleAdsId` e
> `googleAdsLeadLabel` estão preenchidos; o CTA fica a cargo do GTM (evita dupla contagem).

## `pitch.json` — página de venda (quando `ending.type = "pitch"`)

Página de venda montada por **blocos em ordem** (`blocks[]`). Você pode repetir o bloco
`cta` quantas vezes quiser entre as seções, e há uma barra fixa flutuante (`floatingCta`).

Tipos de bloco disponíveis:

| Bloco | Campos principais |
| --- | --- |
| `hero` | `headline`, `sub`, `bullets[]` (opcional, 3 itens), `badge` (opcional, prova), `cta { label, url }` |
| `problem` / `solution` | `title`, `text` |
| `modules` | `title`, `items[] { title, desc }` |
| `bonus` | `title`, `items[] { name, value, desc }` |
| `about` | `title`, `text`, `image` (quem sou eu / autoridade) |
| `proof` | `title`, `items[] { name, text }` (prova social) |
| `objections` | `title`, `items[] { q, a }` (quebra de objeções) |
| `guarantee` | `title`, `days`, `text` |
| `offer` | `title`, `priceFrom`, `price`, `installments`, `cta`, `url`, `scarcity` |
| `faq` | `title`, `items[] { q, a }` |
| `cta` | `label`, `url`, `note` — **CTA solto entre seções** |

`floatingCta`: `{ enabled, label, url }`. Use `url: "#oferta"` para rolar até o bloco
`offer`, ou um link de checkout externo. Todo CTA dispara o evento `cta_clicked`.
