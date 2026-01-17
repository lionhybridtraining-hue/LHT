// LHT Landing — pequenas interações e animações on-scroll

// Intersection Observer para revelar elementos com .anim-in
const io = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('visible');
      io.unobserve(e.target);
    }
  });
}, { threshold: 0.15 });

document.querySelectorAll('.anim-in').forEach(el => io.observe(el));

// Suavizar scroll para âncoras internas
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', (ev) => {
    const href = a.getAttribute('href');
    if (href.length > 1) {
      ev.preventDefault();
      document.querySelector(href)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// Oculta o indicador de scroll quando o utilizador começa a descer
function handleScrollIndicator(){
  const indicator = document.querySelector('.scroll-indicator');
  const hero = document.getElementById('hero');
  if(!indicator || !hero) return;
  const threshold = hero.offsetHeight * 0.3;
  if(window.scrollY > threshold){
    indicator.classList.add('hide');
  } else {
    indicator.classList.remove('hide');
  }
}
window.addEventListener('scroll', handleScrollIndicator, { passive: true });
window.addEventListener('load', handleScrollIndicator);

// ===== Modal Vídeo Mindset =====
function setupMindsetModal(){
  const mindsetTrigger = document.querySelector('.mindset-trigger');
  const mindsetModal = document.getElementById('mindset-video-modal');
  if(!mindsetModal) return;
  const mindsetVideo = mindsetModal.querySelector('video');
  const fallback = mindsetModal.querySelector('.mindset-fallback');

  function openMindset(){
    if(!mindsetVideo) return;
    mindsetModal.hidden = false;
    mindsetModal.setAttribute('aria-hidden','false');
    document.body.style.overflow = 'hidden';
    mindsetVideo.muted = false;
    mindsetVideo.currentTime = 0;
    // Força reload de metadata (útil após erros intermitentes)
    mindsetVideo.load();
    const playPromise = mindsetVideo.play();
    if(playPromise && playPromise.catch){ playPromise.catch(()=>{}); }
    // Track modal open
    try { window.LHT && window.LHT.Analytics && window.LHT.Analytics.event('mindset_modal_open'); } catch(e){}
  }
  function closeMindset(){
    if(!mindsetVideo) return;
    mindsetVideo.pause();
    mindsetModal.hidden = true;
    mindsetModal.setAttribute('aria-hidden','true');
    document.body.style.overflow = '';
    // Track modal close
    try { window.LHT && window.LHT.Analytics && window.LHT.Analytics.event('mindset_modal_close'); } catch(e){}
  }

  // Eventos de estado
  if(mindsetVideo){
    mindsetVideo.addEventListener('loadedmetadata', ()=>{
      if(fallback) fallback.hidden = true;
    });
    mindsetVideo.addEventListener('error', ()=>{
      if(fallback) fallback.hidden = false;
      try {
        window.LHT && window.LHT.Analytics && window.LHT.Analytics.event('video_error', { video_title: 'Mindset', poster: mindsetVideo.getAttribute('poster')||undefined });
      } catch(e){}
    });
    mindsetVideo.addEventListener('play', ()=>{
      try {
        window.LHT && window.LHT.Analytics && window.LHT.Analytics.event('video_start', { video_title: 'Mindset' });
      } catch(e){}
    });
    mindsetVideo.addEventListener('pause', ()=>{
      try {
        const d = mindsetVideo.duration || 1;
        const pct = Math.round((mindsetVideo.currentTime / d) * 100);
        window.LHT && window.LHT.Analytics && window.LHT.Analytics.event('video_progress', { video_title: 'Mindset', video_percent: pct });
      } catch(e){}
    });
    mindsetVideo.addEventListener('ended', ()=>{
      // mantém em pausa ao terminar (não loop)
      try { window.LHT && window.LHT.Analytics && window.LHT.Analytics.event('video_complete', { video_title: 'Mindset' }); } catch(e){}
    });
  }

  if(mindsetTrigger){ mindsetTrigger.addEventListener('click', openMindset); }
  // Fechar ao clicar fora do vídeo
  mindsetModal.addEventListener('click', (e)=>{
    if(e.target === mindsetModal) closeMindset();
  });
  // ESC fecha
  window.addEventListener('keydown', (e)=>{ if(e.key === 'Escape') closeMindset(); });
}

// Garante montagem após o DOM estar pronto
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', setupMindsetModal);
} else {
  setupMindsetModal();
}

// ===== Consent + Analytics =====

(function(){
  const CONSENT_KEY = 'lht_consent';
  const LAST_PROMPT_KEY = 'lht_last_prompt';
  const SESSION_FLAG = 'lht_session_prompted';
  const REMIND_INTERVAL_MS = 24 * 60 * 60 * 1000; // re-perguntar após 24h
  const GA_ID = 'G-K3EJSN5M4Y';
  const FB_PIXEL_ID = '1575754910283247';
  const FB_STANDARD_EVENT_MAP = {
    // Leads para plano gratuito (Google Forms)
    cta_plano_gratuito: { event: 'Lead', params: { content_name: 'Plano de Corrida Gratuito', content_category: 'Planos' } },
    cta_plano_gratuito_card: { event: 'Lead', params: { content_name: 'Plano de Corrida Gratuito', content_category: 'Planos' } },
    cta_final_plano_gratuito: { event: 'Lead', params: { content_name: 'Plano de Corrida Gratuito', content_category: 'Planos' } },
    // Subscrição / notificações via WhatsApp
    cta_whatsapp_newsletter: { event: 'Subscribe', params: { content_name: 'Newsletter WhatsApp', content_category: 'Comunidade' } },
    cta_ser_notificado: { event: 'Subscribe', params: { content_name: 'Alertas AER WhatsApp', content_category: 'Comunidade' } },
    // Reserva do AER (Stripe) — sem valor definido, manter 0
    cta_reserva_aer: { event: 'InitiateCheckout', params: { content_name: 'Reserva AER', content_category: 'AER', value: 97, currency: 'EUR' } },
    // Passo final para começar AER (ancora interna)
    cta_final_comecar_aer: { event: 'ViewContent', params: { content_name: 'Começar AER', content_category: 'AER' } }
  };
  const consentBanner = document.getElementById('consent-banner');
  const btnAccept = document.getElementById('consent-accept');
  const btnPrefs = document.getElementById('consent-preferences');
  const modal = document.getElementById('consent-modal');
  const toggleAnalytics = document.getElementById('toggle-analytics');
  const btnSave = document.getElementById('consent-save');
  const btnCancel = document.getElementById('consent-cancel');

  // Lightweight analytics adapter: console, gtag (GA4) or plausible
  // Load Google Analytics (gtag) only after consent
  function loadGtag(id){
    if(window.gtag) return; // already loaded/initialized
    // Define dataLayer + gtag before loading script so events are queued
    window.dataLayer = window.dataLayer || [];
    function gtag(){ window.dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', id, { anonymize_ip: true });
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
    document.head.appendChild(s);
  }

  // Load Meta Pixel (fbq) only after consent
  function loadFbq(id){
    if(window.fbq) return; // already loaded/initialized
    !function(f,b,e,v,n,t,s){
      if(f.fbq) return; n = f.fbq = function(){
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      }; if(!f._fbq) f._fbq = n; n.push = n; n.loaded = true; n.version = '2.0';
      n.queue = []; t = b.createElement(e); t.async = true; t.src = v;
      s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', id);
  }

  const Analytics = {
    enabled: false,
    init(){
      // Gate GA behind consent
      loadGtag(GA_ID);
      // Gate Meta Pixel behind consent
      loadFbq(FB_PIXEL_ID);
      this.enabled = true;
      this.pageview();
    },
    pageview(){
      if(!this.enabled) return;
      // Google Analytics (gtag)
      if(typeof window.gtag === 'function'){
        window.gtag('event','page_view',{
          page_title: document.title,
          page_location: window.location.href,
          page_path: window.location.pathname
        });
      }
      // Meta Pixel (fbq)
      if(typeof window.fbq === 'function'){
        window.fbq('track','PageView');
      }
      // Plausible
      else if(typeof window.plausible === 'function'){
        window.plausible('pageview');
      }
      // Fallback: console
      else {
        console.info('[analytics] pageview', { path: window.location.pathname });
      }
    },
    event(name, meta={}){
      if(!this.enabled) return;

      // GA4 mapping to recommended event names/params
      function mapGaEvent(n, m){
        const GA_EVENT_MAP = {
          // Leads (Google Forms)
          cta_plano_gratuito: { event: 'generate_lead', params: { content_name: 'Plano de Corrida Gratuito' } },
          cta_plano_gratuito_card: { event: 'generate_lead', params: { content_name: 'Plano de Corrida Gratuito' } },
          cta_final_plano_gratuito: { event: 'generate_lead', params: { content_name: 'Plano de Corrida Gratuito' } },
          // Newsletter / notificações via WhatsApp
          cta_whatsapp_newsletter: { event: 'sign_up', params: { method: 'WhatsApp', content_name: 'Newsletter WhatsApp' } },
          cta_whatsapp_newsletter_card: { event: 'sign_up', params: { method: 'WhatsApp', content_name: 'Newsletter WhatsApp' } },
          cta_ser_notificado: { event: 'sign_up', params: { method: 'WhatsApp', content_name: 'Alertas AER' } },
          // Checkout / Reserva AER
          cta_reserva_aer: { event: 'begin_checkout', params: { value: 97, currency: 'EUR', items: [{ item_id: 'AER', item_name: 'Reserva AER' }] } },
          // AER view
          cta_final_comecar_aer: { event: 'view_item', params: { item_id: 'AER', item_name: 'Começar AER' } },
          // Steps selections
          step_experimenta: { event: 'select_item', params: { items: [{ item_id: 'step_experimenta', item_name: 'Experimenta' }] } },
          step_partilha: { event: 'select_item', params: { items: [{ item_id: 'step_partilha', item_name: 'Partilha' }] } },
          step_evolui: { event: 'select_item', params: { items: [{ item_id: 'step_evolui', item_name: 'Evolui' }] } },
          // Mindset open click
          mindset_open_click: { event: 'click', params: { content_type: 'video_modal', link_text: 'Ver vídeo Mindset' } },
          // Footer nav
          footer_nav_sobre: { event: 'click', params: { link_text: 'Sobre' } },
          footer_nav_blog: { event: 'click', params: { link_text: 'Blog' } },
          footer_nav_privacidade: { event: 'click', params: { link_text: 'Política de Privacidade' } },
          footer_nav_termos: { event: 'click', params: { link_text: 'Termos e Condições' } },
          // Socials (use share)
          social_instagram: { event: 'share', params: { method: 'Instagram', content_type: 'profile' } },
          social_youtube: { event: 'share', params: { method: 'YouTube', content_type: 'channel' } },
          social_whatsapp: { event: 'share', params: { method: 'WhatsApp', content_type: 'community' } },
          // Section views
          section_view: { event: 'view_item_list' },
          // Scroll depth
          scroll_depth: { event: 'scroll' },
          // Outbound click
          outbound_click: { event: 'click', params: { outbound: true } },
          // Video events
          video_start: { event: 'video_start' },
          video_progress: { event: 'video_progress' },
          video_complete: { event: 'video_complete' },
          video_error: { event: 'video_error' }
        };
        const mapped = GA_EVENT_MAP[n];
        if(!mapped) return { event: n, params: m };
        const params = Object.assign({}, m, mapped.params||{});
        // Normalize common param names
        if(m.href){ params.link_url = m.href; delete params.href; }
        if(m.text){ params.link_text = m.text; delete params.text; }
        if(m.percent != null){ params.percent_scrolled = m.percent; delete params.percent; }
        if(n === 'section_view' && m.section_id){ params.item_list_id = m.section_id; }
        return { event: mapped.event, params };
      }

      const ga = mapGaEvent(name, meta);
      if(typeof window.gtag === 'function'){
        window.gtag('event', ga.event, ga.params);
      }
      // Meta Pixel custom events
      if(typeof window.fbq === 'function'){
        const mapped = FB_STANDARD_EVENT_MAP[name];
        if(mapped){
          window.fbq('track', mapped.event, Object.assign({}, meta, mapped.params));
        } else {
          window.fbq('trackCustom', name, meta);
        }
      } else if(typeof window.plausible === 'function'){
        window.plausible(ga.event, { props: ga.params });
      } else {
        console.info('[analytics] event', ga.event, ga.params);
      }
    }
  };

  // Expose analytics to window for instrumentation outside this scope
  window.LHT = window.LHT || {};
  window.LHT.Analytics = Analytics;

  function getConsent(){ return localStorage.getItem(CONSENT_KEY); }
  function setConsent(val){ localStorage.setItem(CONSENT_KEY, val); }

  function openModal(){
    if(!modal) return;
    // Reflect stored preference when opening; default to enabled if none
    if(toggleAnalytics){
      const c = getConsent();
      if(c === 'accepted') toggleAnalytics.checked = true;
      else if(c === 'denied') toggleAnalytics.checked = false;
      else toggleAnalytics.checked = true; // default pre-selected
    }
    modal.hidden = false;
    modal.setAttribute('aria-hidden','false');
  }
  function closeModal(){ if(!modal) return; modal.hidden = true; modal.setAttribute('aria-hidden','true'); }

  function maybeShowBanner(){
    const c = getConsent();
    // If banner is absent on this page, still respect stored consent
    if(!consentBanner){
      if(typeof window.gtag === 'function'){
        window.gtag('consent', 'update', { analytics_storage: c === 'accepted' ? 'granted' : 'denied' });
      }
      if(c === 'accepted'){
        Analytics.init();
      } else {
        Analytics.enabled = false;
      }
      return;
    }

    if(c === 'accepted'){
      consentBanner.hidden = true;
      if(typeof window.gtag === 'function'){
        window.gtag('consent', 'update', { analytics_storage: 'granted' });
      }
      Analytics.init();
    } else {
      // Prompt next session or after X time
      const now = Date.now();
      const lastPrompt = Number(localStorage.getItem(LAST_PROMPT_KEY) || 0);
      const sessionPrompted = sessionStorage.getItem(SESSION_FLAG) === '1';

      const shouldPrompt = !sessionPrompted || (now - lastPrompt >= REMIND_INTERVAL_MS);

      consentBanner.hidden = !shouldPrompt ? true : false;

      if(shouldPrompt){
        sessionStorage.setItem(SESSION_FLAG, '1');
        localStorage.setItem(LAST_PROMPT_KEY, String(now));
      }

      if(typeof window.gtag === 'function'){
        window.gtag('consent', 'update', { analytics_storage: 'denied' });
      }
      Analytics.enabled = false;
    }
  }

  // Wire buttons
  if(btnAccept){
    btnAccept.addEventListener('click', ()=>{
      setConsent('accepted');
      consentBanner.hidden = true;
      if(typeof window.gtag === 'function'){
        window.gtag('consent', 'update', {
          analytics_storage: 'granted',
          ad_storage: 'denied',
          ad_user_data: 'denied',
          ad_personalization: 'denied'
        });
      }
      // Reflect state in modal toggle
      if(toggleAnalytics) toggleAnalytics.checked = true;
      // mark session as already prompted
      sessionStorage.setItem(SESSION_FLAG, '1');
      localStorage.setItem(LAST_PROMPT_KEY, String(Date.now()));
      Analytics.init();
      Analytics.event('consent_accept');
    });
  }

  if(btnPrefs){ btnPrefs.addEventListener('click', openModal); }
  if(btnCancel){ btnCancel.addEventListener('click', closeModal); }
  if(btnSave){
    btnSave.addEventListener('click', ()=>{
      const allowAnalytics = !!(toggleAnalytics && toggleAnalytics.checked);
      setConsent(allowAnalytics ? 'accepted' : 'denied');
      // If not accepted, keep banner hidden for this page but re-prompt next session or after interval
      consentBanner.hidden = true;
      if(typeof window.gtag === 'function'){
        window.gtag('consent', 'update', {
          analytics_storage: allowAnalytics ? 'granted' : 'denied',
          ad_storage: 'denied',
          ad_user_data: 'denied',
          ad_personalization: 'denied'
        });
      }
      if(allowAnalytics){
        if(!Analytics.enabled) Analytics.init();
        else Analytics.pageview();
      } else {
        Analytics.enabled = false;
      }
      // update prompt bookkeeping
      sessionStorage.setItem(SESSION_FLAG, '1');
      localStorage.setItem(LAST_PROMPT_KEY, String(Date.now()));
      Analytics.event('consent_save', { analytics_allowed: allowAnalytics });
      closeModal();
    });
  }

  // Delegate click events for elements tagged with data-track
  document.addEventListener('click', (e)=>{
    const target = e.target.closest('[data-track]');
    if(!target) return;
    const name = target.getAttribute('data-track');
    const meta = {
      text: (target.textContent||'').trim().slice(0,60),
      href: target.getAttribute('href')||undefined,
      id: target.id||undefined,
      role: target.getAttribute('role')||undefined
    };
    if(getConsent() === 'accepted'){
      Analytics.event(name, meta);
    }
  }, { capture: true });

  // Initialize on DOM ready
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', maybeShowBanner);
  } else {
    maybeShowBanner();
  }

  // ===== Additional instrumentation: section views, scroll depth, outbound links =====

  function setupSectionViewTracking(){
    const seen = new Set();
    const observer = new IntersectionObserver((entries)=>{
      entries.forEach((e)=>{
        if(e.isIntersecting){
          const id = e.target.id || e.target.getAttribute('data-section') || 'unknown';
          if(!seen.has(id)){
            seen.add(id);
            Analytics.event('section_view', { section_id: id });
            observer.unobserve(e.target);
          }
        }
      });
    }, { threshold: 0.5 });
    document.querySelectorAll('section[id]').forEach((el)=>observer.observe(el));
  }

  function setupScrollDepthTracking(){
    const thresholds = [25, 50, 75, 100];
    const fired = new Set();
    function check(){
      const doc = document.documentElement;
      const scrollTop = window.scrollY || doc.scrollTop || 0;
      const viewport = window.innerHeight;
      const total = Math.max(doc.scrollHeight, document.body.scrollHeight);
      const maxScrollable = Math.max(total - viewport, 1);
      const pct = Math.min(100, Math.round((scrollTop / maxScrollable) * 100));
      thresholds.forEach((t)=>{
        if(pct >= t && !fired.has(t)){
          fired.add(t);
          Analytics.event('scroll_depth', { percent: t });
        }
      });
    }
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('load', check);
    check();
  }

  function setupOutboundLinkTracking(){
    document.addEventListener('click', (e)=>{
      const anchor = e.target.closest('a');
      if(!anchor) return;
      if(anchor.getAttribute('data-track')) return; // already tracked via data-track
      const href = anchor.getAttribute('href') || '';
      if(!href) return;
      const isMail = href.startsWith('mailto:');
      const isTel = href.startsWith('tel:');
      const isExternal = /^https?:\/\//i.test(href) && (function(){
        try { return new URL(href, window.location.href).host !== window.location.host; } catch(e){ return false; }
      })();
      if(isExternal || isMail || isTel){
        const meta = {
          href,
          text: (anchor.textContent||'').trim().slice(0,60),
          target: anchor.getAttribute('target')||undefined,
          kind: isMail ? 'email' : isTel ? 'tel' : 'external'
        };
        Analytics.event('outbound_click', meta);
      }
    }, { capture: true });
  }

  function setupExtraInstrumentation(){
    setupSectionViewTracking();
    setupScrollDepthTracking();
    setupOutboundLinkTracking();
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', setupExtraInstrumentation);
  } else {
    setupExtraInstrumentation();
  }
})();
