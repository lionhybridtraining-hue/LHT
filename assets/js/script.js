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
  }
  function closeMindset(){
    if(!mindsetVideo) return;
    mindsetVideo.pause();
    mindsetModal.hidden = true;
    mindsetModal.setAttribute('aria-hidden','true');
    document.body.style.overflow = '';
  }

  // Eventos de estado
  if(mindsetVideo){
    mindsetVideo.addEventListener('loadedmetadata', ()=>{
      if(fallback) fallback.hidden = true;
    });
    mindsetVideo.addEventListener('error', ()=>{
      if(fallback) fallback.hidden = false;
    });
    mindsetVideo.addEventListener('ended', ()=>{
      // mantém em pausa ao terminar (não loop)
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
  const GA_ID = 'G-K3EJSN5M4Y';
  const consentBanner = document.getElementById('consent-banner');
  const btnAccept = document.getElementById('consent-accept');
  const btnDecline = document.getElementById('consent-decline');

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

  const Analytics = {
    enabled: false,
    init(){
      // Gate GA behind consent
      loadGtag(GA_ID);
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
      if(typeof window.gtag === 'function'){
        window.gtag('event', name, meta);
      } else if(typeof window.plausible === 'function'){
        window.plausible(name, { props: meta });
      } else {
        console.info('[analytics] event', name, meta);
      }
    }
  };

  function getConsent(){ return localStorage.getItem(CONSENT_KEY); }
  function setConsent(val){ localStorage.setItem(CONSENT_KEY, val); }

  function maybeShowBanner(){
    if(!consentBanner) return;
    const c = getConsent();
    if(c === 'accepted'){
      consentBanner.hidden = true;
      // Update Consent Mode to granted before initializing analytics
      if(typeof window.gtag === 'function'){
        window.gtag('consent', 'update', { analytics_storage: 'granted' });
      }
      Analytics.init();
    } else if(c === 'denied'){
      consentBanner.hidden = true;
      // Ensure denied is explicit in Consent Mode
      if(typeof window.gtag === 'function'){
        window.gtag('consent', 'update', { analytics_storage: 'denied' });
      }
    } else {
      consentBanner.hidden = false;
    }
  }

  // Wire buttons
  if(btnAccept){
    btnAccept.addEventListener('click', ()=>{
      setConsent('accepted');
      consentBanner.hidden = true;
      if(typeof window.gtag === 'function'){
        window.gtag('consent', 'update', { analytics_storage: 'granted' });
      }
      Analytics.init();
      Analytics.event('consent_accept');
    });
  }
  if(btnDecline){
    btnDecline.addEventListener('click', ()=>{
      setConsent('denied');
      consentBanner.hidden = true;
      if(typeof window.gtag === 'function'){
        window.gtag('consent', 'update', { analytics_storage: 'denied' });
      }
      Analytics.event('consent_decline');
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
})();
