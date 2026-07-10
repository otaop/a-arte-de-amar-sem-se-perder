// ============================================================================
//  brand.js — utilidades compartilhadas (quiz + pitch)
//  Carrega JSON, aplica a identidade visual (cores, fundo, largura) e o logo.
//  NÃO PRECISA EDITAR. Configure em config/brand.json.
// ============================================================================

export async function loadJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error("Falha ao carregar " + path + " (" + res.status + ")");
  return res.json();
}

export function applyBrand(brand) {
  const c = brand.colors || {};
  const r = document.documentElement.style;
  const vars = {
    "--fq-primary": c.primary, "--fq-primary-hover": c.primaryHover, "--fq-accent": c.accent,
    "--fq-bg": c.bg, "--fq-surface": c.surface, "--fq-border": c.border,
    "--fq-text": c.text, "--fq-muted": c.muted, "--fq-radius": brand.radius,
    "--fq-font": brand.font, "--fq-font-heading": brand.fontHeading || brand.font,
  };
  for (const [k, v] of Object.entries(vars)) if (v) r.setProperty(k, v);

  if (brand.fontImport) loadFont(brand.fontImport);
  if (brand.layout && brand.layout.maxWidth) r.setProperty("--fq-maxwidth", brand.layout.maxWidth);
  document.documentElement.dataset.fqLayout = (brand.layout && brand.layout.style) || "card";

  const bg = brand.background;
  if (bg && bg.value) {
    document.body.style.background =
      bg.type === "image" ? "url('" + bg.value + "') center / cover no-repeat fixed" : bg.value;
  }

  if (brand.name) document.title = brand.name;
  if (brand.favicon) setFavicon(brand.favicon);
}

export function logoElement(brand) {
  // Sem logo configurado: usa o nome da marca como texto (evita placeholder genérico).
  if (!brand.logo) {
    if (!brand.name) return null;
    const txt = document.createElement("div");
    txt.className = "fq-logo fq-logo--text";
    txt.textContent = brand.name;
    txt.style.cssText =
      "font-family:var(--fq-font-heading,var(--fq-font));font-weight:700;" +
      "font-size:1.15rem;color:var(--fq-primary);letter-spacing:-0.01em;";
    return txt;
  }
  const wrap = document.createElement("div");
  wrap.className = "fq-logo";
  const img = document.createElement("img");
  img.src = brand.logo;
  img.alt = brand.name || "";
  if (brand.logoHeight) img.style.height = brand.logoHeight;
  wrap.appendChild(img);
  return wrap;
}

function setFavicon(href) {
  let link = document.querySelector("link[rel~='icon']");
  if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
  link.href = href;
}

function loadFont(href) {
  if (document.querySelector("link[data-fq-font]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.setAttribute("data-fq-font", "1");
  document.head.appendChild(link);
}
