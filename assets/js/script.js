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

// ===== Dynamic content via Netlify Function =====
(function(){
  const CACHE_KEY = 'lht_dynamic_cache_v2';

  function withTimeout(ms){
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ms);
    return { controller, timeoutId };
  }

  function getConfig(){
    const cfg = window.LHT_DYNAMIC || {};
    return {
      endpoint: (cfg.endpoint || '').trim(),
      cacheMinutes: Number(cfg.cacheMinutes || 10),
      timeoutMs: Number(cfg.timeoutMs || 8000)
    };
  }

  function readCache(maxAgeMs){
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if(!raw) return null;
      const parsed = JSON.parse(raw);
      if(!parsed || !parsed.ts || !parsed.data) return null;
      if(Date.now() - parsed.ts > maxAgeMs) return null;
      return parsed.data;
    } catch(e){
      return null;
    }
  }

  function writeCache(data){
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
    } catch(e){
      // no-op
    }
  }

  function text(node, value){
    if(!node) return;
    node.textContent = String(value == null ? '' : value);
  }

  function firstDefinedValue(values, fallback){
    for(const value of values){
      if(value == null) continue;
      const normalized = String(value).trim();
      if(normalized) return normalized;
    }
    return fallback;
  }

  function metadataValue(metadata, keys, fallback){
    const values = (keys || []).map((key) => metadata && Object.prototype.hasOwnProperty.call(metadata, key) ? metadata[key] : undefined);
    return firstDefinedValue(values, fallback);
  }

  function pathName(){
    return (window.location.pathname || '/').toLowerCase();
  }

  function currentPageKey(){
    const path = pathName();
    if(path === '/' || path === '/index.html') return 'home';
    if(path === '/calendario' || path === '/calendario.html') return 'calendar';
    if(path === '/sobre' || path === '/sobre.html') return 'about';
    if(path === '/onboarding' || path === '/onboarding.html') return 'onboarding';
    return null;
  }

  function upsertMeta(attribute, key, content){
    if(!content) return;
    let node = document.head.querySelector(`meta[${attribute}="${key}"]`);
    if(!node){
      node = document.createElement('meta');
      node.setAttribute(attribute, key);
      document.head.appendChild(node);
    }
    node.setAttribute('content', content);
  }

  function setCanonical(href){
    if(!href) return;
    let node = document.head.querySelector('link[rel="canonical"]');
    if(!node){
      node = document.createElement('link');
      node.setAttribute('rel', 'canonical');
      document.head.appendChild(node);
    }
    node.setAttribute('href', href);
  }

  function setJsonLd(id, payload){
    const node = document.getElementById(id);
    if(!node || !payload) return;
    node.textContent = JSON.stringify(payload);
  }

  function buildOrganizationSameAs(metadata){
    return [
      metadataValue(metadata, ['organization_same_as_instagram'], ''),
      metadataValue(metadata, ['organization_same_as_youtube'], ''),
      metadataValue(metadata, ['organization_same_as_whatsapp'], '')
    ].filter(Boolean);
  }

  function bindSeoMetadata(data){
    if(!data || !data.metadata) return;

    const metadata = data.metadata;
    const pageKey = currentPageKey();
    if(!pageKey) return;

    const pagePrefix = `${pageKey}_`;
    const siteName = metadataValue(metadata, ['site_name', 'organization_name'], 'Lion Hybrid Training');
    const siteUrl = metadataValue(metadata, ['site_url', 'organization_url'], 'https://lionhybridtraining.com/');
    const locale = metadataValue(metadata, ['site_locale'], 'pt_PT');
    const defaultRobots = metadataValue(metadata, ['default_robots'], 'index, follow');
    const defaultOgType = metadataValue(metadata, ['default_og_type'], 'website');
    const defaultTwitterCard = metadataValue(metadata, ['default_twitter_card'], 'summary_large_image');
    const defaultImage = metadataValue(metadata, ['default_share_image'], 'https://lionhybridtraining.com/assets/img/logo_lht.jpg');
    const defaultImageType = metadataValue(metadata, ['default_share_image_type'], 'image/jpeg');
    const defaultImageWidth = metadataValue(metadata, ['default_share_image_width'], '1024');
    const defaultImageHeight = metadataValue(metadata, ['default_share_image_height'], '1024');

    const title = metadataValue(metadata, [`${pagePrefix}title`], document.title);
    const description = metadataValue(metadata, [`${pagePrefix}description`], '');
    const canonicalUrl = metadataValue(metadata, [`${pagePrefix}canonical_url`], '');
    const robots = metadataValue(metadata, [`${pagePrefix}robots`], defaultRobots);
    const ogType = metadataValue(metadata, [`${pagePrefix}og_type`], defaultOgType);
    const ogLocale = metadataValue(metadata, [`${pagePrefix}og_locale`], locale);
    const ogSiteName = metadataValue(metadata, [`${pagePrefix}og_site_name`], siteName);
    const ogTitle = metadataValue(metadata, [`${pagePrefix}og_title`], title);
    const ogDescription = metadataValue(metadata, [`${pagePrefix}og_description`], description);
    const ogUrl = metadataValue(metadata, [`${pagePrefix}og_url`], canonicalUrl || window.location.href);
    const ogImage = metadataValue(metadata, [`${pagePrefix}og_image`], defaultImage);
    const ogImageType = metadataValue(metadata, [`${pagePrefix}og_image_type`], defaultImageType);
    const ogImageWidth = metadataValue(metadata, [`${pagePrefix}og_image_width`], defaultImageWidth);
    const ogImageHeight = metadataValue(metadata, [`${pagePrefix}og_image_height`], defaultImageHeight);
    const ogImageAlt = metadataValue(metadata, [`${pagePrefix}og_image_alt`], title);
    const twitterCard = metadataValue(metadata, [`${pagePrefix}twitter_card`], defaultTwitterCard);
    const twitterTitle = metadataValue(metadata, [`${pagePrefix}twitter_title`], ogTitle);
    const twitterDescription = metadataValue(metadata, [`${pagePrefix}twitter_description`], ogDescription);
    const twitterImage = metadataValue(metadata, [`${pagePrefix}twitter_image`], ogImage);
    const twitterImageAlt = metadataValue(metadata, [`${pagePrefix}twitter_image_alt`], ogImageAlt);

    if(title) document.title = title;
    upsertMeta('name', 'description', description);
    upsertMeta('name', 'robots', robots);
    setCanonical(canonicalUrl);

    upsertMeta('property', 'og:site_name', ogSiteName);
    upsertMeta('property', 'og:type', ogType);
    upsertMeta('property', 'og:locale', ogLocale);
    upsertMeta('property', 'og:title', ogTitle);
    upsertMeta('property', 'og:description', ogDescription);
    upsertMeta('property', 'og:url', ogUrl);
    upsertMeta('property', 'og:image', ogImage);
    upsertMeta('property', 'og:image:type', ogImageType);
    upsertMeta('property', 'og:image:width', ogImageWidth);
    upsertMeta('property', 'og:image:height', ogImageHeight);
    upsertMeta('property', 'og:image:alt', ogImageAlt);

    upsertMeta('name', 'twitter:card', twitterCard);
    upsertMeta('name', 'twitter:title', twitterTitle);
    upsertMeta('name', 'twitter:description', twitterDescription);
    upsertMeta('name', 'twitter:image', twitterImage);
    upsertMeta('name', 'twitter:image:alt', twitterImageAlt);

    if(pageKey === 'home') {
      setJsonLd('home-org-jsonld', {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: metadataValue(metadata, ['organization_name', 'site_name'], siteName),
        url: metadataValue(metadata, ['organization_url', 'site_url'], siteUrl),
        logo: metadataValue(metadata, ['organization_logo_url'], ogImage),
        sameAs: buildOrganizationSameAs(metadata)
      });

      setJsonLd('home-website-jsonld', {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: metadataValue(metadata, ['website_name', 'site_name'], siteName),
        url: metadataValue(metadata, ['website_url', 'site_url'], siteUrl)
      });

      setJsonLd('home-event-jsonld', {
        '@context': 'https://schema.org',
        '@type': 'Event',
        name: metadataValue(metadata, ['event_name'], 'Lançamento AER — Athletic Endurance Runner'),
        startDate: metadataValue(metadata, ['event_start_date'], '2026-02-02'),
        eventAttendanceMode: metadataValue(metadata, ['event_attendance_mode'], 'https://schema.org/OnlineEventAttendanceMode'),
        eventStatus: metadataValue(metadata, ['event_status'], 'https://schema.org/EventScheduled'),
        location: {
          '@type': 'VirtualLocation',
          url: metadataValue(metadata, ['event_location_url'], 'https://aer.lionhybridtraining.com')
        },
        image: metadataValue(metadata, ['event_image'], 'https://lionhybridtraining.com/assets/img/logo-aer.png'),
        description: metadataValue(metadata, ['event_description'], 'Lançamento do programa AER. Reserva a tua vaga.'),
        offers: {
          '@type': 'Offer',
          url: metadataValue(metadata, ['event_offer_url'], 'https://buy.stripe.com/14AcN63Qi7p451SbkY97G00'),
          price: metadataValue(metadata, ['event_offer_price'], '0'),
          priceCurrency: metadataValue(metadata, ['event_offer_currency'], 'EUR'),
          availability: metadataValue(metadata, ['event_offer_availability'], 'https://schema.org/InStock')
        }
      });
    }

    if(pageKey === 'calendar') {
      setJsonLd('calendar-webpage-jsonld', {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: metadataValue(metadata, ['calendar_page_name', 'calendar_title'], title),
        url: metadataValue(metadata, ['calendar_page_url', 'calendar_canonical_url'], canonicalUrl || ogUrl),
        description: metadataValue(metadata, ['calendar_page_description', 'calendar_description'], description),
        isPartOf: {
          '@type': 'WebSite',
          name: metadataValue(metadata, ['website_name', 'site_name'], siteName),
          url: metadataValue(metadata, ['website_url', 'site_url'], siteUrl)
        }
      });
    }

    if(pageKey === 'about') {
      setJsonLd('about-page-jsonld', {
        '@context': 'https://schema.org',
        '@type': 'AboutPage',
        name: metadataValue(metadata, ['about_page_name', 'about_title'], title),
        url: metadataValue(metadata, ['about_page_url', 'about_canonical_url'], canonicalUrl || ogUrl),
        description: metadataValue(metadata, ['about_page_description', 'about_description'], description),
        primaryImageOfPage: metadataValue(metadata, ['about_page_primary_image'], ogImage)
      });

      setJsonLd('about-person-jsonld', {
        '@context': 'https://schema.org',
        '@type': 'Person',
        name: metadataValue(metadata, ['about_person_name'], 'Rodrigo Libânio'),
        affiliation: {
          '@type': 'Organization',
          name: metadataValue(metadata, ['about_person_affiliation_name', 'organization_name', 'site_name'], siteName)
        }
      });
    }

    if(pageKey === 'onboarding') {
      setJsonLd('onboarding-webpage-jsonld', {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: metadataValue(metadata, ['onboarding_page_name', 'onboarding_title'], title),
        url: metadataValue(metadata, ['onboarding_page_url', 'onboarding_canonical_url'], canonicalUrl || ogUrl),
        description: metadataValue(metadata, ['onboarding_page_description', 'onboarding_description'], description)
      });
    }
  }

  function bindAerDate(data){
    const node = document.getElementById('aer-next-date');
    if(!node || !data || !data.metadata) return;
    if(data.metadata.aer_next_date){
      text(node, data.metadata.aer_next_date);
    }
  }

  function bindMetrics(data){
    const wrap = document.getElementById('metrics-grid');
    if(!wrap || !data || !Array.isArray(data.metrics) || data.metrics.length === 0) return;

    wrap.innerHTML = '';
    data.metrics.forEach((item) => {
      const metric = document.createElement('div');
      metric.className = 'metric';

      const num = document.createElement('span');
      num.className = 'm-num';
      text(num, item && item.value ? item.value : '');

      const label = document.createElement('span');
      label.className = 'm-label';
      text(label, item && item.label ? item.label : '');

      metric.appendChild(num);
      metric.appendChild(label);
      wrap.appendChild(metric);
    });
  }

  function bindReviews(data){
    const wrap = document.getElementById('reviews-grid');
    if(!wrap || !data || !Array.isArray(data.reviews) || data.reviews.length === 0) return;

    wrap.innerHTML = '';

    data.reviews.forEach((item) => {
      const card = document.createElement('article');
      card.className = 'review-card';

      const stars = document.createElement('div');
      stars.className = 'stars';
      const starCount = Math.max(1, Math.min(5, Number(item && item.stars ? item.stars : 5)));
      const starText = '★★★★★'.slice(0, starCount);
      stars.setAttribute('aria-label', `${starCount} em 5`);
      text(stars, starText);

      const reviewText = document.createElement('p');
      reviewText.className = 'review-text';
      text(reviewText, `“${item && item.text ? item.text : ''}”`);

      const reviewer = document.createElement('div');
      reviewer.className = 'reviewer';
      text(reviewer, item && item.name ? item.name : '');

      const reviewMeta = document.createElement('div');
      reviewMeta.className = 'review-meta';
      text(reviewMeta, item && item.meta ? item.meta : 'ATHLETIC ENDURANCE RUNNER');

      card.appendChild(stars);
      card.appendChild(reviewText);
      card.appendChild(reviewer);
      card.appendChild(reviewMeta);
      wrap.appendChild(card);
    });

    setupReviewsLoop();

    const jsonLdScript = document.getElementById('reviews-jsonld');
    if(jsonLdScript){
      const metadata = data.metadata || {};
      const ratingValue = Number(data.aggregateRating && data.aggregateRating.ratingValue ? data.aggregateRating.ratingValue : 4.9);
      const reviewCount = Number(data.aggregateRating && data.aggregateRating.reviewCount ? data.aggregateRating.reviewCount : data.reviews.length);

      const reviewJson = data.reviews.map((item) => ({
        '@type': 'Review',
        author: { '@type': 'Person', name: item && item.name ? item.name : 'Atleta LHT' },
        datePublished: item && item.date ? item.date : new Date().toISOString().slice(0, 10),
        reviewBody: item && item.text ? item.text : '',
        reviewRating: { '@type': 'Rating', ratingValue: String(Math.max(1, Math.min(5, Number(item && item.stars ? item.stars : 5)))) }
      }));

      const payload = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: metadataValue(metadata, ['product_name'], 'AER — Athletic Endurance Runner'),
        brand: metadataValue(metadata, ['product_brand', 'organization_name', 'site_name'], 'Lion Hybrid Training'),
        aggregateRating: { '@type': 'AggregateRating', ratingValue: String(ratingValue), reviewCount: String(reviewCount) },
        review: reviewJson
      };

      jsonLdScript.textContent = JSON.stringify(payload);
    }
  }

  function bindLinks(data){
    if(!data || !data.links || typeof data.links !== 'object') return;
    Object.keys(data.links).forEach((key) => {
      const href = data.links[key];
      if(!href) return;
      const node = document.querySelector(`[data-track="${key}"]`);
      if(node && node.tagName === 'A'){
        node.setAttribute('href', href);
      }
    });
  }

  function applyDynamicData(data){
    if(!data || typeof data !== 'object') return;
    bindSeoMetadata(data);
    bindAerDate(data);
    bindMetrics(data);
    bindReviews(data);
    bindLinks(data);
  }

  async function fetchDynamicData(){
    const cfg = getConfig();
    if(!cfg.endpoint) return;

    const cacheMaxAgeMs = Math.max(1, cfg.cacheMinutes) * 60 * 1000;
    const cached = readCache(cacheMaxAgeMs);
    if(cached){
      applyDynamicData(cached);
    }

    const { controller, timeoutId } = withTimeout(Math.max(1000, cfg.timeoutMs));
    try {
      const res = await fetch(cfg.endpoint, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-store',
        signal: controller.signal
      });
      if(!res.ok) return;
      const data = await res.json();
      applyDynamicData(data);
      writeCache(data);
    } catch(e){
      // fallback to cached data already applied
    } finally {
      clearTimeout(timeoutId);
    }
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', fetchDynamicData);
  } else {
    fetchDynamicData();
  }
})();

function setupReviewsLoop(){
  const wrap = document.getElementById('reviews-grid');
  if(!wrap) return;

  const cards = Array.from(wrap.querySelectorAll('.review-card')).filter((card) => card.parentElement === wrap);
  if(cards.length === 0) return;

  const track = document.createElement('div');
  track.className = 'reviews-track';

  cards.forEach((card) => {
    track.appendChild(card);
  });

  cards.forEach((card) => {
    const clone = card.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    track.appendChild(clone);
  });

  wrap.innerHTML = '';
  wrap.appendChild(track);

  requestAnimationFrame(() => {
    const gapValue = getComputedStyle(track).gap;
    const gap = Number.parseFloat(gapValue) || 0;
    const originalWidth = cards.reduce((total, card) => total + card.getBoundingClientRect().width, 0);
    const segmentWidth = originalWidth + (gap * cards.length);
    wrap.style.setProperty('--reviews-loop-distance', `${segmentWidth}px`);
  });
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', setupReviewsLoop);
} else {
  setupReviewsLoop();
}

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
  const DENIED_SESSION_FLAG = 'lht_denied_prompted_session';
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
      if(c === 'denied'){
        // Se recusou, mostramos no máximo uma vez por sessão e sem delay.
        const deniedPromptedThisSession = sessionStorage.getItem(DENIED_SESSION_FLAG) === '1';
        consentBanner.hidden = deniedPromptedThisSession;
        if(!deniedPromptedThisSession){
          sessionStorage.setItem(DENIED_SESSION_FLAG, '1');
        }

        if(typeof window.gtag === 'function'){
          window.gtag('consent', 'update', { analytics_storage: 'denied' });
        }
        Analytics.enabled = false;
        return;
      }

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
      sessionStorage.removeItem(DENIED_SESSION_FLAG);
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
      if(allowAnalytics){
        sessionStorage.removeItem(DENIED_SESSION_FLAG);
      } else {
        sessionStorage.setItem(DENIED_SESSION_FLAG, '1');
      }
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
