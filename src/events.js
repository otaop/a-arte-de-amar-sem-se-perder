// ============================================================================
//  events.js  —  Camada de tracking do funil de quiz
//  NÃO PRECISA EDITAR. Configure tudo em config/tracking.json.
//
//  Responsabilidades:
//   - Gerar/persistir um session_id por visitante
//   - Capturar UTMs da URL
//   - Emitir os eventos internos do funil (schema documentado em docs/tecnico)
//   - Enviar eventos para o backend próprio (quando o endpoint estiver configurado)
//   - Disparar pixels externos (Meta / Google Ads / GTM) quando configurados
// ============================================================================

const SESSION_KEY = "fq_session_id";
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

function uuid() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function getSessionId() {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = uuid();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

function getUtms() {
  const params = new URLSearchParams(location.search);
  const utms = {};
  for (const k of UTM_KEYS) utms[k] = params.get(k) || "";
  return utms;
}

// Anexa as UTMs da sessão a um link de navegação (pitch, checkout, redirect),
// preservando a atribuição da campanha até o fim do funil. Âncoras ficam intactas.
export function appendUtms(url, utms = {}) {
  if (!url || url.startsWith("#")) return url;
  const pairs = Object.entries(utms).filter(([, v]) => v);
  if (!pairs.length) return url;
  try {
    const u = new URL(url, location.href);
    for (const [k, v] of pairs) if (!u.searchParams.has(k)) u.searchParams.set(k, v);
    return u.href;
  } catch (e) {
    return url;
  }
}

export class Tracker {
  constructor(config = {}) {
    this.config = config;
    this.sessionId = getSessionId();
    this.utms = config.captureUtms === false ? {} : getUtms();
    this.queue = [];
    this._loadExternalPixels();
  }

  // ---- Eventos internos --------------------------------------------------
  track(eventName, extra = {}) {
    const payload = {
      session_id: this.sessionId,
      event_name: eventName,
      step_id: extra.step_id || null,
      question_id: extra.question_id || null,
      answer_id: extra.answer_id || null,
      result_id: extra.result_id || null,
      timestamp: new Date().toISOString(),
      page_url: location.href,
      referrer: document.referrer || "",
      user_agent: navigator.userAgent,
      ...this.utms,
    };

    // Dados de lead (PII) só seguem junto quando a etapa de lead os fornece
    // (e só saem do navegador se houver endpoint configurado).
    if (extra.lead) payload.lead = extra.lead;
    // Texto livre pode conter dados sensíveis. Ele segue apenas ao backend próprio.
    if (extra.answer_text) payload.answer_text = extra.answer_text;

    // 1) Log local (sempre) — facilita debug e funciona sem backend
    console.debug("[quiz event]", eventName, payload);

    // 2) Backend próprio (quando configurado)
    if (this.config.endpoint) {
      const body = JSON.stringify(payload);
      // sendBeacon sobrevive a navegação/fechamento de aba
      if (navigator.sendBeacon) {
        navigator.sendBeacon(this.config.endpoint, body);
      } else {
        fetch(this.config.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => {});
      }
    } else {
      this.queue.push(payload); // guarda em memória até existir um endpoint
    }

    // 3) Pixels externos — NUNCA com PII. O lead (nome/e-mail/WhatsApp) fica só no backend próprio.
    const publicPayload = { ...payload };
    delete publicPayload.lead;
    delete publicPayload.answer_text;
    this._fireExternal(eventName, publicPayload);
    return payload;
  }

  // ---- Pixels externos ---------------------------------------------------
  _loadExternalPixels() {
    const ext = this.config.external || {};

    if (ext.metaPixelId) {
      /* eslint-disable */
      !(function (f, b, e, v, n, t, s) {
        if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
        if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = [];
        t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
      })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
      /* eslint-enable */
      window.fbq("init", ext.metaPixelId);
      window.fbq("track", "PageView");
    }

    // gtag.js cobre GA4 e Google Ads (carrega uma vez, configura os IDs presentes)
    if (ext.ga4Id || ext.googleAdsId) {
      const firstId = ext.ga4Id || ext.googleAdsId;
      const s = document.createElement("script");
      s.async = true;
      s.src = "https://www.googletagmanager.com/gtag/js?id=" + firstId;
      document.head.appendChild(s);
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag("js", new Date());
      if (ext.ga4Id) window.gtag("config", ext.ga4Id);
      if (ext.googleAdsId) window.gtag("config", ext.googleAdsId);
    }

    if (ext.gtmId) {
      window.dataLayer = window.dataLayer || [];
      (function (w, d, s, l, i) {
        w[l] = w[l] || []; w[l].push({ "gtm.start": new Date().getTime(), event: "gtm.js" });
        const f = d.getElementsByTagName(s)[0], j = d.createElement(s);
        j.async = true; j.src = "https://www.googletagmanager.com/gtm.js?id=" + i; f.parentNode.insertBefore(j, f);
      })(window, document, "script", "dataLayer", ext.gtmId);
    }
  }

  _fireExternal(eventName, payload) {
    const ext = this.config.external || {};
    const map = this.config.metaEvents || {};
    const metaEvent = map[eventName];

    // Meta Pixel
    if (window.fbq && metaEvent) {
      window.fbq("track", metaEvent);
    }
    // GA4 / GTM dataLayer — evento bruto (já SEM PII), o cliente mapeia no GTM
    if (window.dataLayer) {
      window.dataLayer.push({ event: "quiz_" + eventName, quiz: payload });
    }
    if (window.gtag) {
      window.gtag("event", eventName, { quiz_step: payload.step_id, quiz_session: payload.session_id });
      // Conversão Google Ads: lead automático. O CTA fica a cargo do GTM para evitar dupla contagem.
      if (ext.googleAdsId && ext.googleAdsLeadLabel && eventName === "lead_submitted") {
        window.gtag("event", "conversion", { send_to: ext.googleAdsId + "/" + ext.googleAdsLeadLabel });
      }
    }
  }
}
