// ============================================================================
//  pitch.js — renderizador da página de Pitch (venda)
//  ⚠️  NÃO EDITE. O conteúdo vem de config/pitch.json e config/brand.json.
//  Lê ?offer= e ?s= vindos do quiz para continuidade de tracking.
// ============================================================================

import { loadJSON, applyBrand, logoElement } from "./brand.js";
import { Tracker, appendUtms } from "./events.js";

const root = document.getElementById("pitch-root");
const params = new URLSearchParams(location.search);
const offerParam = params.get("offer") || "";
let tracker;

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

async function boot() {
  try {
    const [brand, pitch, tracking] = await Promise.all([
      loadJSON("./config/brand.json"),
      loadJSON("./config/pitch.json"),
      loadJSON("./config/tracking.json"),
    ]);
    applyBrand(brand);
    tracker = new Tracker(tracking);
    // pitch_viewed (NÃO result_viewed) para não duplicar a conversão CompleteRegistration do quiz.
    tracker.track("pitch_viewed", { step_id: "pitch", result_id: offerParam });
    render(brand, pitch);
  } catch (e) {
    root.innerHTML = '<p style="text-align:center;padding:40px">Erro ao carregar a página. Verifique <code>config/pitch.json</code>.</p>';
    console.error(e);
  }
}

function render(brand, pitch) {
  const logo = logoElement(brand);
  if (logo) { logo.classList.add("pitch-logo"); root.appendChild(logo); }
  for (const block of pitch.blocks || []) {
    const fn = blocks[block.type];
    if (fn) root.appendChild(fn(block));
    else console.warn("Bloco de pitch desconhecido:", block.type);
  }
  if (pitch.floatingCta && pitch.floatingCta.enabled) mountFloating(pitch.floatingCta);
  revealOnScroll();
}

// Aparição suave das seções ao rolar (respeita prefers-reduced-motion via CSS).
function revealOnScroll() {
  const secs = document.querySelectorAll(".pitch-section");
  if (!("IntersectionObserver" in window)) { secs.forEach((s) => s.classList.add("is-visible")); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-visible"); io.unobserve(e.target); } });
  }, { threshold: 0.12 });
  secs.forEach((s) => { s.classList.add("pitch-reveal"); io.observe(s); });
}

// Iniciais para avatar de depoimento (evita imagem aleatória).
function initials(name) {
  return String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase();
}

function ctaButton(label, url, extraClass) {
  const a = el("a", "pitch-cta " + (extraClass || ""), label);
  // UTMs seguem até o checkout (links externos); âncoras (#oferta) ficam intactas.
  a.href = appendUtms(url || "#oferta", tracker ? tracker.utms : {});
  a.onclick = () => tracker && tracker.track("cta_clicked", { step_id: "pitch", result_id: offerParam });
  return a;
}

function section(cls) { return el("section", "pitch-section " + cls); }

const blocks = {
  hero(b) {
    const s = section("pitch-hero");
    s.appendChild(el("h1", "pitch-h1", b.headline));
    if (b.sub) s.appendChild(el("p", "pitch-sub", b.sub));
    if (Array.isArray(b.bullets) && b.bullets.length) {
      const ul = el("ul", "pitch-hero-bullets");
      for (const it of b.bullets) ul.appendChild(el("li", "pitch-hero-bullet", it));
      s.appendChild(ul);
    }
    if (b.cta) s.appendChild(ctaButton(b.cta.label, b.cta.url, "pitch-cta--lg"));
    if (b.badge) s.appendChild(el("div", "pitch-hero-badge", b.badge));
    return s;
  },
  problem(b) { return textSection("pitch-problem", b); },
  solution(b) { return textSection("pitch-solution", b); },
  modules(b) {
    const s = section("pitch-modules");
    s.appendChild(el("h2", "pitch-h2", b.title));
    const g = el("div", "pitch-grid");
    for (const it of b.items || []) {
      const c = el("div", "pitch-card");
      c.appendChild(el("h3", "pitch-card-title", it.title));
      if (it.desc) c.appendChild(el("p", "pitch-card-text", it.desc));
      g.appendChild(c);
    }
    s.appendChild(g);
    return s;
  },
  bonus(b) {
    const s = section("pitch-bonus");
    s.appendChild(el("h2", "pitch-h2", b.title));
    const g = el("div", "pitch-grid");
    for (const it of b.items || []) {
      const c = el("div", "pitch-card pitch-card--bonus");
      c.appendChild(el("h3", "pitch-card-title", it.name));
      if (it.value) c.appendChild(el("span", "pitch-bonus-value", it.value));
      if (it.desc) c.appendChild(el("p", "pitch-card-text", it.desc));
      g.appendChild(c);
    }
    s.appendChild(g);
    return s;
  },
  about(b) {
    const s = section("pitch-about");
    if (b.image) { const img = document.createElement("img"); img.src = b.image; img.alt = b.title || ""; img.className = "pitch-about-img"; s.appendChild(img); }
    else { s.appendChild(el("div", "pitch-about-ph", "👤")); }
    const box = el("div", "pitch-about-text");
    box.appendChild(el("h2", "pitch-h2", b.title));
    if (b.text) box.appendChild(el("p", "pitch-p", b.text));
    s.appendChild(box);
    return s;
  },
  proof(b) {
    const s = section("pitch-proof");
    s.appendChild(el("h2", "pitch-h2", b.title));
    const g = el("div", "pitch-grid");
    for (const it of b.items || []) {
      const c = el("div", "pitch-card pitch-card--depo");
      const head = el("div", "pitch-depo-head");
      head.appendChild(el("div", "pitch-depo-avatar", initials(it.name)));
      head.appendChild(el("span", "pitch-proof-name", it.name));
      c.appendChild(head);
      c.appendChild(el("p", "pitch-card-text", "“" + it.text + "”"));
      g.appendChild(c);
    }
    s.appendChild(g);
    return s;
  },
  objections(b) { return faqSection("pitch-objections", b); },
  faq(b) { return faqSection("pitch-faq", b); },
  guarantee(b) {
    const s = section("pitch-guarantee");
    if (b.days) s.appendChild(el("div", "pitch-seal", b.days + " dias"));
    s.appendChild(el("h2", "pitch-h2", b.title));
    if (b.text) s.appendChild(el("p", "pitch-p", b.text));
    return s;
  },
  offer(b) {
    const s = section("pitch-offer");
    s.id = "oferta";
    s.appendChild(el("h2", "pitch-h2", b.title));
    if (b.priceFrom) s.appendChild(el("span", "pitch-pricefrom", b.priceFrom));
    if (b.price) s.appendChild(el("div", "pitch-price", b.price));
    if (b.installments) s.appendChild(el("p", "pitch-install", b.installments));
    s.appendChild(ctaButton(b.cta, b.url, "pitch-cta--lg"));
    if (b.scarcity) s.appendChild(el("p", "pitch-scarcity", b.scarcity));
    return s;
  },
  cta(b) {
    const s = section("pitch-ctaband");
    s.appendChild(ctaButton(b.label, b.url, "pitch-cta--lg"));
    if (b.note) s.appendChild(el("p", "pitch-note", b.note));
    return s;
  },
};

function textSection(cls, b) {
  const s = section(cls);
  if (b.title) s.appendChild(el("h2", "pitch-h2", b.title));
  if (b.text) s.appendChild(el("p", "pitch-p", b.text));
  return s;
}

function faqSection(cls, b) {
  const s = section(cls);
  s.appendChild(el("h2", "pitch-h2", b.title));
  for (const it of b.items || []) {
    const d = el("div", "pitch-faq-item");
    d.appendChild(el("h3", "pitch-faq-q", it.q));
    d.appendChild(el("p", "pitch-faq-a", it.a));
    s.appendChild(d);
  }
  return s;
}

function mountFloating(cfg) {
  const bar = el("div", "pitch-floating");
  bar.appendChild(ctaButton(cfg.label, cfg.url, "pitch-cta--bar"));
  document.body.appendChild(bar);
}

boot();
