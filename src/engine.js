// ============================================================================
//  engine.js  —  Motor do funil de quiz (FunilBox)
//  ⚠️  NÃO EDITE ESTE ARQUIVO. Todo o conteúdo vem de /config/*.json.
//
//  Etapas: intro | single | multi | calc | slider | boolean | number | textarea | content | lead | result
//  Recursos: logo, progresso, voltar, auto-avanço, emoji/imagem nas opções,
//  layout em grade, calculadora/slider/sim-não/input numérico, scoring,
//  branching (option.next), roteamento de oferta, diagnóstico condicional,
//  captura de lead (LGPD), passo de aquecimento/conteúdo (content, sem pergunta)
//  e final configurável (ending: redirect | pitch | none).
// ============================================================================

import { Tracker, appendUtms } from "./events.js";
import { loadJSON, applyBrand, logoElement } from "./brand.js";

const root = document.getElementById("quiz-root");
const state = {
  brand: null, quiz: null, offers: null, tracker: null,
  index: 0, answers: {}, values: {}, score: 0, scoreByStep: {}, history: [],
};

const assetVersion = new URL(import.meta.url).searchParams.get("v");
const versionedAsset = (path) => assetVersion ? path + "?v=" + encodeURIComponent(assetVersion) : path;

// ---------------------------------------------------------------------------
//  Boot
// ---------------------------------------------------------------------------
async function boot() {
  if (location.protocol === "file:") {
    root.innerHTML =
      '<div class="fq-card"><h2>Abra pelo servidor local</h2><p class="fq-muted">' +
      "Este funil precisa rodar por um servidor — o navegador bloqueia o carregamento dos arquivos " +
      "quando você abre o <code>.html</code> direto (<code>file://</code>). Use o atalho de " +
      "pré-visualização do FunilBox, ou rode <code>python -m http.server</code> na pasta do funil e " +
      "abra o endereço que aparecer (ex.: <code>http://localhost:8000</code>).</p></div>";
    return;
  }
  try {
    const [brand, quiz, offers, tracking] = await Promise.all([
      loadJSON(versionedAsset("./config/brand.json")),
      loadJSON(versionedAsset("./config/quiz.json")),
      loadJSON(versionedAsset("./config/offers.json")),
      loadJSON(versionedAsset("./config/tracking.json")),
    ]);
    state.brand = brand; state.quiz = quiz; state.offers = offers;
    state.tracker = new Tracker(tracking);

    applyBrand(brand);
    state.tracker.track("quiz_started", { step_id: currentStep().id });
    document.addEventListener("keydown", onEnterAdvance);
    render();
  } catch (err) {
    root.innerHTML =
      '<div class="fq-card"><h2>Erro ao carregar o quiz</h2><p class="fq-muted">' +
      "Verifique se os arquivos em <code>/config</code> são JSON válidos e se a página " +
      "está sendo servida por um servidor (não abra via file://).</p></div>";
    console.error(err);
  }
}

// ---------------------------------------------------------------------------
//  Navegação
// ---------------------------------------------------------------------------
const QUESTION_TYPES = ["single", "multi", "calc", "slider", "boolean", "number", "textarea"];
// Por padrão o lead não avança sem responder; settings.permitirPular = true afrouxa isso.
const requireAnswer = () => state.quiz.settings.permitirPular !== true;
const steps = () => state.quiz.steps;
const currentStep = () => steps()[state.index];
const totalAnswerable = () => steps().filter((s) => QUESTION_TYPES.includes(s.type)).length;

function goToIndex(i) { state.history.push(state.index); state.index = i; render(); }
function goToStepId(id) { const i = steps().findIndex((s) => s.id === id); if (i >= 0) goToIndex(i); else next(); }
function next(branchTo) { if (branchTo) return goToStepId(branchTo); if (state.index < steps().length - 1) goToIndex(state.index + 1); }
function back() { if (state.history.length) { state.index = state.history.pop(); render(); } }

// Enter avança: dispara a ação primária do passo. Não interfere no formulário do lead (Enter nativo).
function onEnterAdvance(e) {
  if (e.key !== "Enter") return;
  const ae = document.activeElement;
  if (ae && (ae.tagName === "TEXTAREA" || (ae.closest && ae.closest("form")))) return;
  const btn = root.querySelector(".fq-continue") || root.querySelector(".fq-btn-accent") || root.querySelector(".fq-btn-primary");
  if (btn) { e.preventDefault(); btn.click(); }
}

// ---------------------------------------------------------------------------
//  Render principal
// ---------------------------------------------------------------------------
function render() {
  const step = currentStep();
  state.tracker.track("step_viewed", { step_id: step.id });

  const renderer = {
    intro: renderIntro, single: renderSingle, multi: renderMulti,
    calc: renderCalc, slider: renderSlider, boolean: renderBoolean, number: renderNumber, textarea: renderTextarea,
    content: renderContent, lead: renderLead, result: renderResult,
  }[step.type] || renderUnknown;

  root.innerHTML = "";
  root.classList.toggle("fq-layout--organic", state.brand.layout && state.brand.layout.style === "organic");
  const logo = logoElement(state.brand);
  if (root.classList.contains("fq-layout--organic")) {
    const topbar = el("div", "fq-organic-topbar");
    if (logo) topbar.appendChild(logo);
    topbar.appendChild(el("span", "fq-step-tag", organicStepTag(step)));
    root.appendChild(topbar);
  } else if (logo) root.appendChild(logo);
  root.appendChild(progressBar());

  const card = el("div", "fq-card");
  card.dataset.stepId = step.id;
  card.classList.add("fq-card--" + step.type);
  if (QUESTION_TYPES.includes(step.type)) card.classList.add("fq-card--question");
  if (root.classList.contains("fq-layout--organic") && ["intro", "lead", "result"].includes(step.type)) {
    card.classList.add("fq-card--organic-static");
  }
  renderer(step, card);
  root.appendChild(card);

  if (state.quiz.settings.allowBack && state.history.length) root.appendChild(backButton());
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderUnknown(step, card) {
  card.appendChild(el("p", "fq-muted", "Tipo de etapa desconhecido: " + step.type));
}

function progressBar() {
  const wrap = el("div", "fq-progress-wrap");
  if (!state.quiz.settings.showProgress) return wrap;
  const answered = Object.keys(state.answers).filter((k) => k !== "__lead__").length;
  const pct = Math.min(100, Math.round((answered / Math.max(1, totalAnswerable())) * 100));
  const bar = el("div", "fq-progress");
  const fill = el("div", "fq-progress-fill");
  fill.style.width = pct + "%";
  bar.appendChild(fill);
  wrap.appendChild(bar);
  return wrap;
}

function backButton() { const b = el("button", "fq-back", "← Voltar"); b.onclick = back; return b; }

// ---------------------------------------------------------------------------
//  Etapas estáticas
// ---------------------------------------------------------------------------
function renderIntro(step, card) {
  card.appendChild(el("h1", "fq-title", step.headline));
  if (step.subhead) card.appendChild(el("p", "fq-sub", step.subhead));
  const cta = el("button", "fq-btn fq-btn-primary", step.cta || "Começar");
  cta.onclick = () => next();
  card.appendChild(cta);
  if (step.disclaimer) card.appendChild(el("p", "fq-disclaimer", step.disclaimer));
}

// Passo de aquecimento/conteúdo (sem pergunta): prova social, FOMO, notícia, transformação.
// Não pontua e não conta como "resposta" — é um interstício informativo entre perguntas.
function renderContent(step, card) {
  if (step.eyebrow) card.appendChild(el("span", "fq-eyebrow", step.eyebrow));
  if (step.headline) card.appendChild(el("h2", "fq-title", step.headline));
  if (step.image) card.appendChild(stepImage(step.image));
  if (step.text) card.appendChild(el("p", "fq-sub", step.text));
  const cta = el("button", "fq-btn fq-btn-primary", step.cta || "Continuar");
  cta.onclick = () => next(step.next);
  card.appendChild(cta);
}

// ---------------------------------------------------------------------------
//  Perguntas: escolha
// ---------------------------------------------------------------------------
function renderSingle(step, card) {
  questionHeader(step, card);
  const list = el("div", "fq-options");
  if (step.layout === "grid") list.classList.add("fq-options--grid");
  for (const opt of step.options) {
    const btn = buildOption(opt);
    btn.onclick = () => {
      recordChoice(step, opt);
      state.tracker.track("answer_selected", { step_id: step.id, question_id: step.id, answer_id: opt.value });
      markSelected(list, btn);
      if (state.quiz.settings.autoAdvanceSingle) {
        list.classList.add("fq-options--locked");
        [...list.children].forEach((option) => { option.disabled = true; });
        window.setTimeout(() => next(opt.next), 420);
      } else showContinue(card, () => next(opt.next));
    };
    list.appendChild(btn);
  }
  card.appendChild(list);
}

function renderMulti(step, card) {
  questionHeader(step, card);
  const list = el("div", "fq-options");
  if (step.layout === "grid") list.classList.add("fq-options--grid");
  const chosen = new Map();
  const maxSelections = Number(step.maxSelections) || 0;
  const gate = requireAnswer();
  const buttons = new Map();
  const refreshChoices = () => {
    for (const [value, button] of buttons) {
      button.disabled = Boolean(maxSelections && chosen.size >= maxSelections && !chosen.has(value));
    }
  };
  for (const opt of step.options) {
    const btn = buildOption(opt);
    buttons.set(opt.value, btn);
    btn.onclick = () => {
      if (chosen.has(opt.value)) { chosen.delete(opt.value); btn.classList.remove("selected"); }
      else {
        if (opt.exclusive) {
          for (const [value, selected] of chosen) {
            chosen.delete(value);
            buttons.get(selected.value).classList.remove("selected");
          }
        } else {
          for (const [value, selected] of chosen) {
            if (selected.exclusive) {
              chosen.delete(value);
              buttons.get(selected.value).classList.remove("selected");
            }
          }
        }
        chosen.set(opt.value, opt); btn.classList.add("selected");
      }
      refreshChoices();
      if (gate) enableBtn(cont, chosen.size > 0);
    };
    list.appendChild(btn);
  }
  card.appendChild(list);
  const cont = showContinue(card, () => {
    const opts = [...chosen.values()];
    state.answers[step.id] = opts.map((o) => ({ value: o.value, label: o.label, score: o.score || 0 }));
    setStepScore(step.id, opts.reduce((s, o) => s + (o.score || 0), 0));
    state.tracker.track("answer_selected", { step_id: step.id, question_id: step.id, answer_id: opts.map((o) => o.value).join(",") });
    next();
  }, null, gate);
}

function renderTextarea(step, card) {
  questionHeader(step, card);
  const field = el("label", "fq-field fq-field--textarea");
  const input = document.createElement("textarea");
  input.name = step.id;
  input.rows = step.rows || 5;
  input.maxLength = step.maxLength || 1200;
  input.placeholder = step.placeholder || "";
  input.className = "fq-textarea";
  if (step.required !== false) input.required = true;
  field.appendChild(input);
  card.appendChild(field);
  const gate = requireAnswer() && step.required !== false;
  const cont = showContinue(card, () => {
    const answer = input.value.trim();
    if (gate && !answer) return;
    state.answers[step.id] = { value: answer };
    state.tracker.track("answer_selected", {
      step_id: step.id, question_id: step.id, answer_id: "texto_livre", answer_text: answer,
    });
    next(step.next);
  }, null, gate);
  if (gate) input.addEventListener("input", () => enableBtn(cont, input.value.trim().length > 0));
}

function renderBoolean(step, card) {
  questionHeader(step, card);
  const list = el("div", "fq-options fq-options--bool");
  const opts = [
    { value: "sim", label: step.yesLabel || "Sim", emoji: "✅", score: step.scoreYes || 0 },
    { value: "nao", label: step.noLabel || "Não", emoji: "❌", score: step.scoreNo || 0 },
  ];
  for (const opt of opts) {
    const btn = buildOption(opt);
    btn.onclick = () => {
      recordChoice(step, opt);
      state.tracker.track("answer_selected", { step_id: step.id, question_id: step.id, answer_id: opt.value });
      next(step.next);
    };
    list.appendChild(btn);
  }
  card.appendChild(list);
}

// ---------------------------------------------------------------------------
//  Perguntas: numéricas
// ---------------------------------------------------------------------------
function renderNumber(step, card) {
  questionHeader(step, card);
  const field = numberField(step.label || "Valor", step.unit);
  card.appendChild(field.wrap);
  const gate = requireAnswer();
  const cont = showContinue(card, () => {
    const v = readNumber(field.input);
    if (step.key) state.values[step.key] = v;
    state.answers[step.id] = { value: v };
    setStepScore(step.id, step.score || 0);
    state.tracker.track("answer_selected", { step_id: step.id, question_id: step.id, answer_id: String(v) });
    next(step.next);
  }, null, gate);
  if (gate) field.input.addEventListener("input", () => enableBtn(cont, field.input.value.trim() !== ""));
}

function renderCalc(step, card) {
  questionHeader(step, card);
  const fields = (step.fields || []).map((f) => {
    const nf = numberField(f.label, f.unit);
    nf.name = f.name;
    card.appendChild(nf.wrap);
    return nf;
  });

  const calcBtn = el("button", "fq-btn fq-btn-primary", "Calcular");
  const resultBox = el("div", "fq-calc-result");
  resultBox.style.display = "none";
  card.appendChild(calcBtn);
  card.appendChild(resultBox);

  // Exige preencher os campos antes de calcular (e, portanto, de avançar).
  if (requireAnswer() && fields.length) {
    const refreshCalc = () => enableBtn(calcBtn, fields.every((nf) => nf.input.value.trim() !== ""));
    fields.forEach((nf) => nf.input.addEventListener("input", refreshCalc));
    refreshCalc();
  }

  calcBtn.onclick = () => {
    const scope = Object.assign({}, state.values);
    for (const nf of fields) { const v = readNumber(nf.input); scope[nf.name] = v; state.values[nf.name] = v; }
    const resultado = evalFormula(step.formula, scope);
    state.values[step.id] = resultado;
    const txt = (step.resultText || "Resultado: {resultado}").replace("{resultado}", formatNumber(resultado));
    resultBox.textContent = txt;
    resultBox.style.display = "block";
    fields.forEach((nf) => { nf.wrap.style.display = "none"; }); // colapsa os campos: mostra só o resultado + continuar
    calcBtn.style.display = "none";
    state.answers[step.id] = { value: resultado };
    setStepScore(step.id, step.score || 0);
    state.tracker.track("answer_selected", { step_id: step.id, question_id: step.id, answer_id: String(resultado) });
    showContinue(card, () => next(step.next), step.continueLabel || "Entendi, continuar →");
  };
}

function renderSlider(step, card) {
  questionHeader(step, card);
  const wrap = el("div", "fq-slider-wrap");
  const input = document.createElement("input");
  input.type = "range";
  input.min = step.min != null ? step.min : 1;
  input.max = step.max != null ? step.max : 10;
  input.value = step.default != null ? step.default : Math.round(((+input.min) + (+input.max)) / 2);
  input.className = "fq-slider";
  const valueTag = el("div", "fq-slider-value", input.value);
  const indicatorLabels = step.indicatorLabels && typeof step.indicatorLabels === "object" ? step.indicatorLabels : null;
  const indicator = indicatorLabels ? el("div", "fq-slider-indicator") : null;
  const stages = el("div", "fq-slider-stages");
  const stageButtons = [];
  const min = Number(input.min);
  const max = Number(input.max);
  if (step.showStages === true && max - min <= 11) {
    for (let value = min; value <= max; value += 1) {
      const stage = el("button", "fq-slider-stage", String(value));
      stage.type = "button";
      stage.setAttribute("aria-label", "Selecionar valor " + value);
      stage.onclick = () => {
        input.value = String(value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      };
      stageButtons.push({ value, stage });
      stages.appendChild(stage);
    }
  }
  const paint = () => {
    const pct = Math.round(((+input.value - +input.min) / ((+input.max - +input.min) || 1)) * 100);
    input.style.setProperty("--fq-slider-pct", pct + "%"); // CSS desenha o gradiente fraco→intenso
    valueTag.textContent = input.value;
    if (indicator) {
      indicator.textContent = indicatorLabels[String(input.value)] || String(input.value);
      indicator.dataset.level = String(input.value);
    }
    for (const item of stageButtons) item.stage.classList.toggle("is-active", item.value === Number(input.value));
  };
  input.oninput = paint;
  wrap.appendChild(valueTag);
  if (indicator) wrap.appendChild(indicator);
  const control = el("div", "fq-slider-control");
  control.appendChild(input);
  if (stageButtons.length) control.appendChild(stages);
  wrap.appendChild(control);
  if (!indicator) {
    const labels = el("div", "fq-slider-labels");
    labels.appendChild(el("span", "", step.minLabel || String(input.min)));
    labels.appendChild(el("span", "", step.maxLabel || String(input.max)));
    wrap.appendChild(labels);
  }
  card.appendChild(wrap);
  paint();

  const gate = requireAnswer();
  const cont = showContinue(card, () => {
    const v = parseInt(input.value, 10);
    if (step.key) state.values[step.key] = v;
    state.answers[step.id] = { value: v };
    setStepScore(step.id, step.scorePerPoint ? v * step.scorePerPoint : (step.score || 0));
    state.tracker.track("answer_selected", { step_id: step.id, question_id: step.id, answer_id: String(v) });
    next(step.next);
  }, null, gate);
  // Exige interação: o lead precisa mover a barra (o valor inicial sozinho não conta).
  if (gate) input.addEventListener("input", () => enableBtn(cont, true), { once: true });
}

// ---------------------------------------------------------------------------
//  Lead + Resultado
// ---------------------------------------------------------------------------
function renderLead(step, card) {
  const copy = el("div", "fq-lead-copy");
  if (step.headline) copy.appendChild(el("h2", "fq-title", step.headline));
  if (step.subhead) copy.appendChild(el("p", "fq-sub", step.subhead));
  if (copy.childElementCount) card.appendChild(copy);
  const form = el("form", "fq-form fq-lead-form");
  const inputs = {};
  for (const f of step.fields) {
    const field = el("label", "fq-field");
    field.appendChild(el("span", "fq-label", f.label + (f.required ? " *" : "")));
    const input = document.createElement("input");
    input.type = f.type || "text";
    input.name = f.name;
    input.placeholder = f.placeholder || "";
    if (f.required) input.required = true;
    if (f.type === "email" || /mail/i.test(f.name)) input.type = "email";
    const isTel = f.type === "tel" || /(whats|tel|fone|celular|phone)/i.test(f.name);
    if (isTel) {
      input.type = "tel"; input.inputMode = "tel"; input.maxLength = 16; input.dataset.tel = "1";
      input.oninput = () => { input.value = maskPhoneBR(input.value); input.setCustomValidity(""); };
    }
    inputs[f.name] = input;
    field.appendChild(input);
    form.appendChild(field);
  }
  let consent = null;
  if (step.consentText) {
    const c = el("label", "fq-consent");
    consent = document.createElement("input");
    consent.type = "checkbox"; consent.required = true;
    c.appendChild(consent);
    c.appendChild(el("span", "", step.consentText));
    form.appendChild(c);
  }
  const submit = el("button", "fq-btn fq-btn-primary", step.cta || "Continuar");
  submit.type = "submit";
  form.appendChild(submit);
  form.onsubmit = (e) => {
    e.preventDefault();
    for (const input of Object.values(inputs)) {
      if (input.dataset.tel) {
        const digits = input.value.replace(/\D/g, "");
        if (digits.length < 10) { input.setCustomValidity("Informe um WhatsApp válido com DDD (ex.: (47) 99999-9999)."); input.reportValidity(); return; }
        input.setCustomValidity("");
      }
    }
    const lead = {};
    for (const [name, input] of Object.entries(inputs)) lead[name] = input.value.trim();
    lead.consent = consent ? consent.checked : null;
    state.answers["__lead__"] = lead;
    state.tracker.track("lead_submitted", { step_id: step.id, lead });
    next();
  };
  card.appendChild(form);
}

function renderResult(step, card) {
  const offerKey = routeOffer(step);
  const offer = (state.offers || {})[offerKey] || {};
  const ending = step.ending || { type: "none" };
  const diag = step.diagnostico;
  state.tracker.track("result_viewed", { step_id: step.id, result_id: offerKey });

  // Diagnóstico personalizado (opcional)
  if (diag) {
    if (diag.titulo) card.appendChild(el("h1", "fq-title", diag.titulo));
    if (diag.imagem) card.appendChild(stepImage(diag.imagem));
    if (diag.personalizarPor && diag.mensagens) {
      const seg = state.answers[diag.personalizarPor];
      const key = seg && seg.value;
      const msg = (key && diag.mensagens[key]) || diag.mensagens.default || "";
      if (msg) card.appendChild(el("p", "fq-sub", msg));
    }
    if (diag.final) card.appendChild(el("p", "fq-sub", diag.final));
    card.appendChild(el("hr", "fq-div"));
  }

  // Recomendação / oferta
  if (offer.image) card.appendChild(stepImage(offer.image));
  if (offer.badge) card.appendChild(el("span", "fq-badge", offer.badge));
  card.appendChild(el(diag ? "h2" : "h1", "fq-title", offer.headline || "Sua recomendação"));
  if (offer.text) card.appendChild(el("p", "fq-sub", offer.text));
  if (offer.kicker) card.appendChild(el("p", "fq-result-kicker", offer.kicker));
  if (offer.signature) card.appendChild(el("p", "fq-result-signature", offer.signature));

  let url = offer.url || "#";
  if (ending.type === "pitch") {
    const base = ending.pitchUrl || "./pitch.html";
    url = base + "?" + new URLSearchParams({ offer: offerKey, s: state.tracker.sessionId }).toString();
  }
  url = appendUtms(url, state.tracker.utms); // atribuição preservada até o checkout

  if (ending.type === "redirect" && ending.mode === "auto") {
    card.appendChild(el("p", "fq-disclaimer", "Redirecionando…"));
    setTimeout(() => {
      state.tracker.track("cta_clicked", { step_id: step.id, result_id: offerKey });
      location.href = url;
    }, (ending.redirectDelay || 0) * 1000);
  } else if (ending.type !== "none") {
    const cta = el("a", "fq-btn fq-btn-accent", offer.cta || "Continuar");
    cta.href = url;
    cta.onclick = () => state.tracker.track("cta_clicked", { step_id: step.id, result_id: offerKey });
    card.appendChild(cta);
  }

  const lead = state.answers["__lead__"];
  if (lead && lead.nome && step.showLeadGreeting !== false) card.appendChild(el("p", "fq-disclaimer", "Pronto, " + lead.nome + "!"));
}

// ---------------------------------------------------------------------------
//  Pontuação / roteamento
// ---------------------------------------------------------------------------
// Pontuação idempotente por etapa: ao voltar e refazer, troca o valor em vez de somar de novo.
function setStepScore(stepId, value) {
  if (!state.quiz.settings.scoring) return;
  const v = value || 0;
  state.score += v - (state.scoreByStep[stepId] || 0);
  state.scoreByStep[stepId] = v;
}

function recordChoice(step, opt) {
  state.answers[step.id] = { value: opt.value, label: opt.label, score: opt.score || 0 };
  setStepScore(step.id, opt.score || 0);
}

function routeOffer(step) {
  const routing = step.routing || {};
  if (routing.rules) {
    const sorted = [...routing.rules].sort((a, b) => a.max - b.max);
    for (const rule of sorted) if (state.score <= rule.max) return rule.offer;
    return sorted[sorted.length - 1].offer;
  }
  return routing.default || Object.keys(state.offers || {})[0];
}

// ---------------------------------------------------------------------------
//  Fórmula segura (uma operação binária: a [*/+-] b)
// ---------------------------------------------------------------------------
function evalFormula(formula, scope) {
  const m = String(formula || "").match(/^\s*([\w.]+)\s*([*/+\-])\s*([\w.]+)\s*$/);
  if (!m) return 0;
  const a = operand(m[1], scope), b = operand(m[3], scope);
  switch (m[2]) { case "*": return a * b; case "/": return b ? a / b : 0; case "+": return a + b; case "-": return a - b; }
  return 0;
}
function operand(tok, scope) {
  tok = tok.trim();
  if (tok === "") return 0;
  const n = parseFloat(tok);
  if (!isNaN(n) && String(n) === tok) return n;
  return parseFloat(scope[tok]) || 0;
}
function formatNumber(n) {
  return (Math.round((n + Number.EPSILON) * 100) / 100).toLocaleString("pt-BR");
}

// ---------------------------------------------------------------------------
//  Helpers de UI
// ---------------------------------------------------------------------------
function numberField(label, unit) {
  const wrap = el("label", "fq-field");
  if (label) wrap.appendChild(el("span", "fq-label", label + (unit ? " (" + unit + ")" : "")));
  const input = document.createElement("input");
  input.type = "number"; input.inputMode = "decimal"; input.className = "fq-number";
  wrap.appendChild(input);
  return { wrap, input };
}
function organicStepTag(step) {
  const total = totalAnswerable();
  const current = step.type === "result"
    ? total
    : steps().slice(0, state.index + 1).filter((s) => QUESTION_TYPES.includes(s.type)).length;
  return String(current).padStart(2, "0") + " / " + String(total).padStart(2, "0");
}
function readNumber(input) { return parseFloat(String(input.value).replace(",", ".")) || 0; }

// Máscara de telefone BR: (47) 99999-9999 ou (11) 9999-9999.
function maskPhoneBR(v) {
  const d = String(v).replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d ? "(" + d : d;
  if (d.length <= 6) return "(" + d.slice(0, 2) + ") " + d.slice(2);
  if (d.length <= 10) return "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
  return "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
}

function buildOption(opt) {
  const btn = el("button", "fq-option");
  if (opt.image) {
    btn.classList.add("fq-option--image");
    const img = document.createElement("img");
    img.src = opt.image; img.alt = ""; img.className = "fq-option-img";
    btn.appendChild(img);
  }
  const emoji = optionEmoji(opt.value) || opt.emoji;
  if (emoji) btn.appendChild(el("span", "fq-emoji", emoji));
  btn.appendChild(el("span", "fq-option-label", opt.label));
  return btn;
}

function optionEmoji(value) {
  return {
    solteira: "🌿", conhecendo: "✨", namorando: "💞", casada: "🏡", separada: "🌅", prefiro_nao_dizer: "🤍",
    realizada: "☀️", falta_algo: "🌤️", confusa: "🌀", cansada: "🌧️", recomecando: "🌱",
    agora: "🕊️", meses: "📆", mais_de_um_ano: "⏳", normalizado: "🫧",
    dizer_o_que_sinto: "🗣️", vira_briga: "🔥", falta_reciprocidade: "🤝", me_anulo: "🫥", sem_limites: "🚧", aceito_menos: "🪞", rotina: "🧊", repito_padrao: "🔁", nenhuma: "🌼",
    guardo: "🤐", explodo: "💥", evito: "🚪", nao_ouvida: "📣", converso: "💬",
    sempre: "😔", quase_sempre: "😟", as_vezes: "🤔", quase_nunca: "🌤️",
    comunicar: "🗨️", nao_me_anular: "🌷", reacender: "❤️‍🔥", limites: "🛡️", entender_padroes: "🧩", me_amar: "🫶", paz_e_leveza: "🍃",
    terapia: "🛋️", curso_ebook: "📚", livros: "📖", mentoria: "🤝", nada: "🌱",
  }[value];
}

function questionHeader(step, card) {
  const copy = el("div", "fq-question-copy");
  if (step.spin) copy.appendChild(el("span", "fq-spin fq-spin--" + step.spin, spinLabel(step.spin)));
  copy.appendChild(questionTitle(step));
  if (step.help) copy.appendChild(el("p", "fq-help", step.help));
  if (step.image) copy.appendChild(stepImage(step.image));
  card.appendChild(copy);
}

// Destaca trechos configurados sem interpretar a copy como HTML.
function questionTitle(step) {
  const title = el("h2", "fq-question");
  const question = String(step.question || "");
  const allowedTones = ["peach", "sun", "lilac", "sage"];
  const allowedStyles = ["marker", "box"];
  const highlights = (Array.isArray(step.highlights) ? step.highlights : [])
    .map((highlight) => {
      const text = typeof highlight === "string" ? highlight : highlight && highlight.text;
      const start = text ? question.toLocaleLowerCase("pt-BR").indexOf(String(text).toLocaleLowerCase("pt-BR")) : -1;
      if (start < 0) return null;
      return {
        start,
        end: start + String(text).length,
        tone: allowedTones.includes(highlight.tone) ? highlight.tone : "sun",
        style: allowedStyles.includes(highlight.style) ? highlight.style : "marker",
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);

  let cursor = 0;
  for (const highlight of highlights) {
    if (highlight.start < cursor) continue;
    title.append(document.createTextNode(question.slice(cursor, highlight.start)));
    const marked = el("span", "fq-highlight fq-highlight--" + highlight.style + " fq-highlight--" + highlight.tone);
    marked.textContent = question.slice(highlight.start, highlight.end);
    title.append(marked);
    cursor = highlight.end;
  }
  title.append(document.createTextNode(question.slice(cursor)));
  return title;
}

// Imagem de apoio em um passo (pergunta, slider, diagnóstico). Caminho relativo em funil/assets/.
function stepImage(src) {
  const fig = el("div", "fq-step-image");
  const img = document.createElement("img");
  img.src = src; img.alt = ""; img.loading = "lazy";
  fig.appendChild(img);
  return fig;
}
function spinLabel(spin) {
  // Pilares visíveis do funil (no lugar dos termos de SPIN): Perfil · Problema · Necessidades · Objetivo.
  return {
    segmentation: "Perfil", situation: "Perfil",
    problem: "Problema", implication: "Problema",
    need: "Necessidades", needpayoff: "Objetivo",
  }[spin] || "";
}
function markSelected(list, btn) { [...list.children].forEach((c) => c.classList.remove("selected")); btn.classList.add("selected"); }

function showContinue(card, onClick, label, startDisabled) {
  let cont = card.querySelector(".fq-continue");
  if (!cont) { cont = el("button", "fq-btn fq-btn-primary fq-continue", label || "Continuar"); card.appendChild(cont); }
  else if (label) cont.textContent = label;
  cont.onclick = onClick;
  if (startDisabled) enableBtn(cont, false);
  return cont;
}

// Liga/desliga um botão (usado para exigir resposta antes de avançar).
function enableBtn(btn, on) {
  if (!btn) return;
  btn.disabled = !on;
  btn.classList.toggle("fq-btn--disabled", !on);
}

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

boot();
