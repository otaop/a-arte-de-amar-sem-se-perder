// dashboard.js — lê /api/stats.php + config/quiz.json e desenha o painel (CSS + SVG, sem dependências).

const $ = (id) => document.getElementById(id);
// Paleta enxuta: variações de azul + um amarelo + preto (sem verde/rosa/ciano).
const CORES = ["#2563EB", "#1E3A8A", "#60A5FA", "#EAB308", "#93C5FD", "#0F172A"];
const TIPOS_PERGUNTA = ["single", "multi", "calc", "slider", "boolean", "number", "textarea"];
const QUIZ = { stepInfo: {}, perguntas: [], ordem: [] };
const DASHBOARD_CSRF = $("app")?.dataset.csrf || "";
let periodoAtual = "tudo";
let leadPendente = null;

const ICON = {
  olho: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><polygon points="6 4 20 12 6 20 6 4"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
  cursor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 4 7 17 2.5-7L21 11.5Z"/></svg>',
  alvo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/></svg>',
  lista: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  relogio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
};

function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
const pad2 = (n) => String(n).padStart(2, "0");
function fmtTempo(seg) {
  seg = Math.max(0, seg | 0);
  const m = Math.floor(seg / 60), s = seg % 60;
  if (m >= 60) { const h = Math.floor(m / 60); return h + "h " + (m % 60) + "m"; }
  if (m > 0) return m + "m " + (s < 10 ? "0" : "") + s + "s";
  return s + "s";
}
function fmtData(iso) {
  const s = (iso || "").replace("T", " ");
  return s.length >= 16 ? s.slice(8, 10) + "/" + s.slice(5, 7) + " " + s.slice(11, 16) : s;
}

async function carregarQuiz() {
  try {
    const rq = await fetch("../../config/quiz.json");
    if (rq.ok) montarQuiz(await rq.json());
  } catch (e) { /* sem quiz: o painel ainda funciona, só não nomeia perguntas */ }
}

async function carregar(periodo) {
  periodoAtual = periodo;
  let d;
  try {
    const rs = await fetch("../api/stats.php?periodo=" + encodeURIComponent(periodo), { credentials: "same-origin" });
    if (rs.status === 401) { mostrarEstado("Sessão expirada. Recarregue e entre de novo."); return; }
    if (!rs.ok) throw new Error("status " + rs.status);
    d = await rs.json();
  } catch (e) {
    mostrarEstado("Não foi possível carregar os dados.");
    return;
  }
  $("estado").style.display = "none";
  atualizarExport(periodo);
  renderKpis(d.totais || {});
  renderInsights(d);
  renderCusto(d.totais || {});
  renderTimeline(d.timeline || []);
  renderFunil(d.funil || []);
  renderTempoEtapa(d.tempo_etapa || []);
  renderKanban(d.respostas || [], d.respostas_abertas || []);
  renderAbertas(d.respostas_abertas || []);
  renderDonut("origens", d.origens || [], "origem");
  renderDonut("dispositivos", d.dispositivos || [], "dispositivo");
  renderBarras("campanhas", d.campanhas || [], "campanha");
  renderCriativos(d.criativos || []);
  renderLista("ofertas", d.ofertas || [], (x) => [x.result_id, x.sessions]);
  renderHorarios(d.horarios || []);
  renderLeads(d.leads_lista || []);
  renderRecentes(d.recentes || []);
}

function mostrarEstado(msg) {
  const e = $("estado");
  e.style.display = "";
  e.textContent = msg;
}

// Os botões de exportar carregam o período selecionado na hora do clique.
function atualizarExport(periodo) {
  document.querySelectorAll(".btn-export").forEach((a) => {
    const base = a.dataset.base || (a.dataset.base = a.getAttribute("href"));
    a.setAttribute("href", base + "&periodo=" + encodeURIComponent(periodo));
  });
}

// Filtro de período (24h / 7d / 30d / tudo), guardado no navegador.
function setupFiltros(periodo) {
  const box = $("filtros");
  if (!box) return;
  box.querySelectorAll(".filtro").forEach((b) => {
    b.classList.toggle("ativo", b.dataset.p === periodo);
    b.addEventListener("click", () => {
      const p = b.dataset.p;
      localStorage.setItem("fb_periodo", p);
      box.querySelectorAll(".filtro").forEach((x) => x.classList.toggle("ativo", x === b));
      mostrarEstado("Carregando…");
      carregar(p);
    });
  });
}

async function init() {
  await carregarQuiz();
  const periodo = localStorage.getItem("fb_periodo") || "tudo";
  setupFiltros(periodo);
  configurarModalExclusao();
  carregar(periodo);
}

function montarQuiz(quiz) {
  const steps = quiz.steps || [];
  let num = 0;
  for (const s of steps) {
    QUIZ.ordem.push(s.id);
    const info = { tipo: s.type, options: {} };
    if (TIPOS_PERGUNTA.includes(s.type)) { num++; info.numero = num; info.texto = s.question || s.id; }
    else if (s.type === "intro") info.texto = "Início";
    else if (s.type === "lead") info.texto = "Captura do lead";
    else if (s.type === "result") info.texto = "Diagnóstico";
    else info.texto = s.id;
    if (Array.isArray(s.options)) for (const o of s.options) info.options[o.value] = o.label;
    QUIZ.stepInfo[s.id] = info;
    if (TIPOS_PERGUNTA.includes(s.type)) {
      QUIZ.perguntas.push({ id: s.id, numero: info.numero, texto: info.texto, options: info.options, tipo: s.type });
    }
  }
}
function rotuloEtapa(stepId) {
  if (stepId === "pitch_viewed") return { num: null, texto: "Página de vendas" };
  if (stepId === "cta_clicked") return { num: null, texto: "Clique na oferta" };
  const i = QUIZ.stepInfo[stepId];
  return i ? { num: i.numero ?? null, texto: i.texto || stepId } : { num: null, texto: stepId };
}

// ---- Resumo (KPIs com ícone + % de contexto) ------------------------------
function renderKpis(t) {
  const itens = [
    { ic: "olho", num: t.iniciaram ?? 0, lbl: "Iniciaram o quiz" },
    { ic: "play", num: t.resp_iniciadas ?? 0, lbl: "Responderam", pct: t.taxa_resp_iniciada },
    { ic: "doc", num: t.resultados ?? 0, lbl: "Viram o diagnóstico", pct: t.taxa_resultado },
    { ic: "mail", num: t.leads ?? 0, lbl: "Leads capturados", pct: t.taxa_lead, d: true },
    { ic: "cursor", num: t.cliques_cta ?? 0, lbl: "Cliques na oferta", pct: t.conversao },
    { ic: "alvo", num: (t.conversao ?? 0) + "%", lbl: "Conversão", d: true },
    { ic: "lista", num: (t.media_etapas ?? 0) + " / " + (t.total_etapas ?? 0), lbl: "Média de etapas" },
    { ic: "relogio", num: fmtTempo(t.tempo_medio ?? 0), lbl: "Tempo médio" },
  ];
  const box = $("kpis");
  box.innerHTML = "";
  for (const it of itens) {
    const c = el("div", "kpi" + (it.d ? " kpi--destaque" : ""));
    c.appendChild(el("div", "kpi-ic", ICON[it.ic] || ""));
    c.appendChild(el("div", "kpi-num", String(it.num)));
    c.appendChild(el("div", "kpi-lbl", it.lbl));
    if (it.pct != null) c.appendChild(el("div", "kpi-pct", it.pct + "% dos visitantes"));
    box.appendChild(c);
  }
}

// ---- Insights automáticos --------------------------------------------------
function renderInsights(d) {
  const box = $("insights");
  box.innerHTML = "";
  const t = d.totais || {};
  const out = [];
  const fun = (d.funil || []).filter((f) => f.dropoff > 0);
  if (fun.length) {
    const g = fun.reduce((a, b) => (b.dropoff > a.dropoff ? b : a));
    const r = rotuloEtapa(g.step_id);
    out.push({ cor: "var(--danger)", txt: `O maior gargalo é a etapa ${r.num ? pad2(r.num) + ". " : ""}<b>${escapeHtml(r.texto)}</b>, com <b>${g.dropoff}%</b> de abandono. É aqui que o funil mais perde gente.` });
  }
  if ((d.origens || []).length) {
    const o = d.origens[0], tot = d.origens.reduce((s, x) => s + Number(x.sessions), 0) || 1;
    out.push({ cor: "var(--primary)", txt: `A maior parte do tráfego vem de <b>${escapeHtml(o.origem)}</b> (${Math.round(100 * o.sessions / tot)}% das sessões).` });
  }
  if ((d.dispositivos || []).length) {
    const o = d.dispositivos[0], tot = d.dispositivos.reduce((s, x) => s + Number(x.sessions), 0) || 1;
    out.push({ cor: "var(--warn)", txt: `<b>${Math.round(100 * o.sessions / tot)}%</b> acessam pelo <b>${escapeHtml(o.dispositivo)}</b>. Garanta que a página fica perfeita nesse formato.` });
  }
  out.push({ cor: "var(--ink)", txt: `De cada 100 que iniciam, <b>${t.taxa_lead ?? 0}</b> viram lead e <b>${t.conversao ?? 0}</b> clicam na oferta.` });
  for (const i of out) {
    const c = el("div", "insight");
    c.innerHTML = `<span class="insight-dot" style="background:${i.cor}"></span><p>${i.txt}</p>`;
    box.appendChild(c);
  }
}

// ---- Investimento e custo (CPL) — gasto salvo no navegador -----------------
function renderCusto(t) {
  const box = $("custo");
  const salvo = parseFloat(localStorage.getItem("fb_gasto") || "") || 0;
  box.innerHTML =
    `<label class="custo-input">Investimento em anúncios (R$)<input type="number" id="gasto" min="0" step="10" placeholder="ex: 500" value="${salvo || ""}"></label>` +
    `<div class="custo-grid" id="custo-grid"></div>`;
  const fmt = (v) => v.toFixed(2).replace(".", ",");
  const calc = () => {
    const g = parseFloat($("gasto").value) || 0;
    localStorage.setItem("fb_gasto", String(g));
    const grid = $("custo-grid");
    if (g <= 0) { grid.innerHTML = `<p class="muted">Digite o quanto investiu para ver o custo por lead.</p>`; return; }
    const cards = [
      [t.leads ? g / t.leads : 0, "Custo por lead"],
      [t.iniciaram ? g / t.iniciaram : 0, "Custo por início"],
      [t.cliques_cta ? g / t.cliques_cta : 0, "Custo por clique na oferta"],
    ];
    grid.innerHTML = cards.map(([v, l]) => `<div class="custo-card"><div class="custo-num"><span class="custo-cifra">R$</span>${fmt(v)}</div><div class="custo-lbl">${l}</div></div>`).join("");
  };
  $("gasto").addEventListener("input", calc);
  calc();
}

// ---- Linha do tempo (visitas e leads por dia) ------------------------------
function renderTimeline(tl) {
  const box = $("timeline");
  box.innerHTML = "";
  if (!tl.length) { box.appendChild(el("p", "muted", "Sem dados ainda.")); return; }
  const W = 660, H = 200, pad = 30, padB = 34;
  const maxV = Math.max(...tl.map((d) => Math.max(d.visitas, d.leads)), 1);
  const x = (i) => pad + i * ((W - 2 * pad) / Math.max(1, tl.length - 1));
  const y = (v) => H - padB - (v / maxV) * (H - pad - padB);
  const path = (key) => tl.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(d[key]).toFixed(1)}`).join(" ");
  const dots = (key, cor) => tl.map((d, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(d[key]).toFixed(1)}" r="3.5" fill="${cor}"/>`).join("");
  const xlabels = tl.map((d, i) => `<text x="${x(i).toFixed(1)}" y="${H - 12}" text-anchor="middle" class="tl-x">${d.dia.slice(8, 10)}/${d.dia.slice(5, 7)}</text>`).join("");
  const grid = [0, 0.5, 1].map((f) => `<line x1="${pad}" x2="${W - pad}" y1="${y(maxV * f).toFixed(1)}" y2="${y(maxV * f).toFixed(1)}" class="tl-grid"/><text x="${pad - 8}" y="${(y(maxV * f) + 3).toFixed(1)}" text-anchor="end" class="tl-y">${Math.round(maxV * f)}</text>`).join("");
  box.innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" class="tl-svg" preserveAspectRatio="xMidYMid meet">${grid}` +
    `<path d="${path("visitas")}" fill="none" stroke="#2563EB" stroke-width="2.5"/>${dots("visitas", "#2563EB")}` +
    `<path d="${path("leads")}" fill="none" stroke="#0F172A" stroke-width="2.5"/>${dots("leads", "#0F172A")}` +
    `${xlabels}</svg>` +
    `<div class="tl-leg"><span class="leg"><span class="dot" style="background:#2563EB"></span>Visitas</span><span class="leg"><span class="dot" style="background:#0F172A"></span>Leads</span></div>`;
}

// ---- Funil de conversão (centralizado, afunilando) ------------------------
function renderFunil(funil) {
  const box = $("funil");
  box.innerHTML = "";
  if (!funil.length) { box.appendChild(el("p", "muted", "Sem dados ainda. Rode tráfego e volte aqui.")); return; }
  for (const f of funil) {
    const r = rotuloEtapa(f.step_id);
    const row = el("div", "fstep");
    const num = r.num != null ? `<span class="fstep-num">${pad2(r.num)}</span>` : "";
    row.appendChild(el("div", "fstep-head", `${num}<span class="fstep-txt">${escapeHtml(r.texto)}</span>`));
    const barwrap = el("div", "fstep-barwrap");
    const bar = el("div", "fstep-bar" + (f.dropoff >= 30 ? " gargalo" : ""));
    bar.style.width = Math.max(6, f.retencao) + "%";
    bar.appendChild(el("span", "fstep-pct", f.retencao + "%"));
    barwrap.appendChild(bar);
    row.appendChild(barwrap);
    row.appendChild(el("div", "fstep-meta",
      `${f.sessions} sessões` + (f.dropoff > 0 ? ` · <span class="${f.dropoff >= 30 ? "drop-alto" : "drop"}">&minus;${f.dropoff}% nesta etapa</span>` : "")));
    box.appendChild(row);
  }
}

// ---- Tempo médio por etapa -------------------------------------------------
function renderTempoEtapa(te) {
  const box = $("tempo-etapa");
  box.innerHTML = "";
  if (!te.length) { box.appendChild(el("p", "muted", "Sem dados ainda.")); return; }
  const ordem = QUIZ.ordem.length ? QUIZ.ordem : te.map((x) => x.step_id);
  const lista = te.slice().sort((a, b) => ordem.indexOf(a.step_id) - ordem.indexOf(b.step_id));
  const max = Math.max(...lista.map((x) => Number(x.media)), 1);
  for (const e of lista) {
    const r = rotuloEtapa(e.step_id);
    const row = el("div", "te-row");
    const lento = Number(e.media) >= 45;
    row.innerHTML =
      `<div class="te-top"><span class="te-nome">${r.num ? pad2(r.num) + ". " : ""}${escapeHtml(r.texto)}</span><b class="${lento ? "drop-alto" : ""}">${fmtTempo(e.media)}</b></div>` +
      `<div class="te-track"><div class="te-fill${lento ? " lento" : ""}" style="width:${Math.round(100 * e.media / max)}%"></div></div>`;
    box.appendChild(row);
  }
}

// ---- Respostas por pergunta (colunas = pergunta; cards = respostas) --------
function renderKanban(respostas, abertas) {
  const box = $("kanban");
  box.innerHTML = "";
  if (!QUIZ.perguntas.length) { box.appendChild(el("p", "muted", "Conecte o quiz para ver as respostas por pergunta.")); return; }
  const porPergunta = {};
  for (const r of respostas) (porPergunta[r.question_id] = porPergunta[r.question_id] || []).push(r);
  const abertasPorPergunta = {};
  for (const r of abertas) (abertasPorPergunta[r.question_id] = abertasPorPergunta[r.question_id] || []).push(r);
  let algum = false;
  for (const p of QUIZ.perguntas) {
    const lista = (porPergunta[p.id] || []).slice().sort((a, b) => b.n - a.n);
    const textos = abertasPorPergunta[p.id] || [];
    if (!lista.length && !textos.length) continue;
    algum = true;
    const total = lista.reduce((s, x) => s + Number(x.n), 0) || 1;
    const col = el("div", "kcol");
    col.appendChild(el("div", "kcol-head", `<span class="kcol-num">${pad2(p.numero)}</span><span class="kcol-q">${escapeHtml(p.texto)}</span>`));
    const body = el("div", "kcol-body");
    lista.forEach((r, i) => {
      const label = p.options[r.answer_id] || r.answer_id;
      const pct = Math.round(100 * r.n / total);
      const card = el("div", "kcard" + (i === 0 ? " kcard--top" : ""));
      card.innerHTML =
        `<div class="kcard-top"><span class="kcard-label">${escapeHtml(label)}</span><span class="kcard-n">${r.n}</span></div>` +
        `<div class="kcard-bar"><div class="kcard-fill" style="width:${Math.max(4, pct)}%"></div></div>` +
        `<div class="kcard-pct">${pct}%</div>`;
      body.appendChild(card);
    });
    textos.forEach((r) => {
      const card = el("div", "kcard kcard--open");
      const meta = [r.nome || "Resposta anônima", fmtData(r.created_at)].filter(Boolean).join(" · ");
      card.innerHTML = `<div class="kcard-text">${escapeHtml(r.answer_text || "")}</div><div class="kcard-meta">${escapeHtml(meta)}</div>`;
      body.appendChild(card);
    });
    col.appendChild(body);
    box.appendChild(col);
  }
  if (!algum) box.appendChild(el("p", "muted", "Sem respostas registradas ainda."));
}

// ---- Donut genérico (origens, dispositivos) -------------------------------
function renderDonut(id, dados, key) {
  const box = $(id);
  box.innerHTML = "";
  if (!dados.length) { box.appendChild(el("p", "muted", "Sem dados.")); return; }
  const total = dados.reduce((s, o) => s + Number(o.sessions), 0) || 1;
  const r = 54, circ = 2 * Math.PI * r;
  let acc = 0;
  const segs = dados.map((o, i) => {
    const dash = circ * (Number(o.sessions) / total);
    const seg = `<circle r="${r}" cx="70" cy="70" fill="none" stroke="${CORES[i % CORES.length]}" stroke-width="18" stroke-dasharray="${dash} ${circ - dash}" stroke-dashoffset="${-acc}" transform="rotate(-90 70 70)"></circle>`;
    acc += dash;
    return seg;
  }).join("");
  const svg = `<svg viewBox="0 0 140 140" class="donut"><circle r="${r}" cx="70" cy="70" fill="none" stroke="#EDF0F6" stroke-width="18"></circle>${segs}<text x="70" y="66" text-anchor="middle" class="donut-num">${total}</text><text x="70" y="84" text-anchor="middle" class="donut-lbl">sessões</text></svg>`;
  const leg = dados.map((o, i) =>
    `<div class="leg"><span class="dot" style="background:${CORES[i % CORES.length]}"></span><span class="leg-nome">${escapeHtml(o[key])}</span><b>${o.sessions}</b><span class="leg-pct">${Math.round(100 * o.sessions / total)}%</span></div>`).join("");
  box.innerHTML = `<div class="donut-wrap">${svg}<div class="leg-list">${leg}</div></div>`;
}

// ---- Barras horizontais (campanhas) ---------------------------------------
function renderBarras(id, dados, key) {
  const box = $(id);
  box.innerHTML = "";
  if (!dados.length) { box.appendChild(el("p", "muted", "Sem dados.")); return; }
  const max = Math.max(...dados.map((d) => Number(d.sessions)), 1);
  dados.forEach((d, i) => {
    const row = el("div", "barra-row");
    row.innerHTML =
      `<div class="barra-top"><span class="barra-nome">${escapeHtml(d[key])}</span><b>${d.sessions}</b></div>` +
      `<div class="barra-track"><div class="barra-fill" style="width:${Math.round(100 * d.sessions / max)}%;background:${CORES[i % CORES.length]}"></div></div>`;
    box.appendChild(row);
  });
}

// ---- Desempenho por criativo (utm_content) --------------------------------
function renderCriativos(dados) {
  const box = $("criativos");
  if (!box) return;
  box.innerHTML = "";
  if (!dados.length) {
    box.appendChild(el("p", "muted", "Sem dados por criativo ainda. Use utm_content nos links dos anúncios (ex.: conversao-custo_inacao-cena_vivida-v2) — o /funil-anuncio já gera esse código."));
    return;
  }
  const head = `<thead><tr><th>Criativo (utm_content)</th><th>Sessões</th><th>Leads</th><th>Taxa de lead</th><th>Conversão</th></tr></thead>`;
  const rows = dados.map((d) =>
    `<tr><td>${escapeHtml(d.criativo)}</td><td>${d.sessions}</td><td>${d.leads}</td><td>${d.taxa_lead}%</td><td>${d.conversao}%</td></tr>`).join("");
  box.innerHTML = `<div class="tabela-wrap"><table class="tabela">${head}<tbody>${rows}</tbody></table></div>`;
}

// ---- Horários de pico (barras por hora) -----------------------------------
function renderHorarios(h) {
  const box = $("horarios");
  box.innerHTML = "";
  if (!h.length) { box.appendChild(el("p", "muted", "Sem dados.")); return; }
  const max = Math.max(...h.map((x) => Number(x.sessions)), 1);
  const wrap = el("div", "horas");
  for (const x of h) {
    const col = el("div", "hora");
    const alt = Math.round(100 * x.sessions / max);
    col.innerHTML =
      `<div class="hora-barwrap"><div class="hora-bar${x.sessions === max ? " pico" : ""}" style="height:${Math.max(2, alt)}%" title="${x.sessions} sessões"></div></div>` +
      `<div class="hora-lbl">${pad2(x.hora)}</div>`;
    wrap.appendChild(col);
  }
  box.appendChild(wrap);
}

// ---- Tabela de leads -------------------------------------------------------
function renderLeads(ll) {
  const box = $("leads");
  box.innerHTML = "";
  if (!ll.length) { box.appendChild(el("p", "muted", "Nenhum lead capturado ainda.")); return; }
  const head = `<thead><tr><th>Nome</th><th>E-mail</th><th>WhatsApp</th><th>Origem</th><th>Data</th><th>Ação</th></tr></thead>`;
  const rows = ll.map((l) =>
    `<tr><td>${escapeHtml(l.nome || "")}</td><td>${escapeHtml(l.email || "")}</td><td>${escapeHtml(l.whatsapp || "")}</td><td>${escapeHtml(l.utm_source || "(direto)")}</td><td class="td-data">${fmtData(l.created_at)}</td><td><button type="button" class="btn-excluir" data-lead-id="${Number(l.id)}" data-lead-nome="${escapeHtml(l.nome || "")}">Excluir</button></td></tr>`).join("");
  box.innerHTML = `<div class="tabela-wrap"><table class="tabela">${head}<tbody>${rows}</tbody></table></div>`;
  box.querySelectorAll(".btn-excluir").forEach((btn) => {
    btn.addEventListener("click", () => abrirExclusaoLead(Number(btn.dataset.leadId), btn.dataset.leadNome || "este lead"));
  });
}

function configurarModalExclusao() {
  const modal = $("delete-modal");
  const campo = $("delete-confirmation");
  const form = $("delete-form");
  if (!modal || !campo || !form) return;

  campo.addEventListener("input", atualizarConfirmacaoExclusao);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    confirmarExclusaoLead();
  });
  modal.querySelectorAll("[data-delete-cancel]").forEach((btn) => {
    btn.addEventListener("click", fecharModalExclusao);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) fecharModalExclusao();
  });
}

function abrirExclusaoLead(leadId, nome) {
  if (!Number.isInteger(leadId) || leadId < 1) return;
  leadPendente = { id: leadId, nome };
  $("delete-lead-name").textContent = nome || "este registro";
  $("delete-confirmation").value = "";
  atualizarConfirmacaoExclusao();
  $("delete-modal").hidden = false;
  $("delete-confirmation").focus();
}

function fecharModalExclusao() {
  const modal = $("delete-modal");
  if (modal) modal.hidden = true;
  leadPendente = null;
}

function atualizarConfirmacaoExclusao() {
  const campo = $("delete-confirmation");
  const submit = $("delete-submit");
  if (campo && submit) submit.disabled = campo.value.trim().toLowerCase() !== "delete";
}

async function confirmarExclusaoLead() {
  if (!leadPendente || $("delete-confirmation").value.trim().toLowerCase() !== "delete") return;
  const leadId = leadPendente.id;
  const submit = $("delete-submit");
  submit.disabled = true;

  try {
    const rs = await fetch("../api/lead-delete.php", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-FB-CSRF": DASHBOARD_CSRF },
      body: JSON.stringify({ lead_id: leadId }),
    });
    if (rs.status === 401 || rs.status === 403) throw new Error("sessao");
    if (!rs.ok) throw new Error("status " + rs.status);
    fecharModalExclusao();
    await carregar(periodoAtual);
  } catch (e) {
    mostrarEstado("Não foi possível excluir o registro. Recarregue a página e tente novamente.");
    atualizarConfirmacaoExclusao();
  }
}

function renderAbertas(rows) {
  const box = $("abertas");
  if (!box) return;
  box.innerHTML = "";
  if (!rows.length) { box.appendChild(el("p", "muted", "Nenhuma resposta aberta registrada ainda.")); return; }
  const head = "<thead><tr><th>Nome</th><th>E-mail</th><th>Pergunta</th><th>Resposta</th><th>Data</th></tr></thead>";
  const body = rows.map((r) => {
    const info = QUIZ.stepInfo[r.question_id] || { texto: r.question_id };
    return `<tr><td>${escapeHtml(r.nome || "")}</td><td>${escapeHtml(r.email || "")}</td><td>${escapeHtml(info.texto || r.question_id)}</td><td class="resposta-texto">${escapeHtml(r.answer_text || "")}</td><td class="td-data">${fmtData(r.created_at)}</td></tr>`;
  }).join("");
  box.innerHTML = `<div class="tabela-wrap"><table class="tabela">${head}<tbody>${body}</tbody></table></div>`;
}

// ---- Listas e recentes -----------------------------------------------------
function renderLista(id, dados, mapper) {
  const box = $(id);
  box.innerHTML = "";
  if (!dados.length) { box.appendChild(el("p", "muted", "Sem dados.")); return; }
  for (const d of dados) {
    const [label, valor] = mapper(d);
    const item = el("div", "linha-item");
    item.appendChild(el("span", "tag", escapeHtml(String(label))));
    item.appendChild(el("span", "linha-val", String(valor)));
    box.appendChild(item);
  }
}
function renderRecentes(recentes) {
  const box = $("recentes");
  box.innerHTML = "";
  if (!recentes.length) { box.appendChild(el("p", "muted", "Sem eventos ainda.")); return; }
  for (const r of recentes) {
    const hora = (r.created_at || "").replace("T", " ").slice(0, 19);
    box.appendChild(el("div", "rec", `<span class="rec-h">${hora}</span> <b>${escapeHtml(r.event_name)}</b> <span class="rec-s">${escapeHtml(r.step_id || "")}</span>`));
  }
}

init();
