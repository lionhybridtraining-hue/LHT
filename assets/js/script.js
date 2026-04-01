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
    if (href && href.startsWith('#') && href.length > 1) {
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
  const CACHE_KEY = 'lht_dynamic_cache_v3';
  const HOME_PROGRAMS_CACHE_KEY = 'lht_home_programs_cache_v1';
  const HOME_PROGRAMS_ENDPOINT = '/.netlify/functions/list-programs';
  const HOME_PROGRAMS_LIMIT = 4;

  function syncAnchorTarget(node, href){
    if(!node || !href) return;
    const isExternal = /^https?:\/\//i.test(String(href));
    if(isExternal){
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener');
    } else {
      node.removeAttribute('target');
      node.removeAttribute('rel');
    }
  }

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

  function readCache(maxAgeMs, key){
    try {
      const raw = localStorage.getItem(key || CACHE_KEY);
      if(!raw) return null;
      const parsed = JSON.parse(raw);
      if(!parsed || !parsed.ts || !parsed.data) return null;
      if(Date.now() - parsed.ts > maxAgeMs) return null;
      return parsed.data;
    } catch(e){
      return null;
    }
  }

  function writeCache(data, key){
    try {
      localStorage.setItem(key || CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
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

      var featuredProgram = data && data.featuredProgram ? data.featuredProgram : null;

      setJsonLd('home-event-jsonld', {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: (featuredProgram && featuredProgram.name) || metadataValue(metadata, ['product_name'], 'Programa em destaque LHT'),
        brand: metadataValue(metadata, ['product_brand', 'organization_name', 'site_name'], 'Lion Hybrid Training'),
        image: (featuredProgram && featuredProgram.imageUrl) ? featuredProgram.imageUrl : undefined,
        description: (featuredProgram && (featuredProgram.subtitle || featuredProgram.description)) || metadataValue(metadata, ['event_description'], 'Programa em destaque da Lion Hybrid Training com progressao guiada, comunidade e acompanhamento.'),
        offers: {
          '@type': 'Offer',
          url: (featuredProgram && featuredProgram.ctaUrl) || metadataValue(metadata, ['event_offer_url'], 'https://lionhybridtraining.com/programas'),
          price: (featuredProgram && Number.isFinite(Number(featuredProgram.priceCents))) ? String(Number(featuredProgram.priceCents) / 100) : metadataValue(metadata, ['event_offer_price'], '0'),
          priceCurrency: (featuredProgram && featuredProgram.currency) ? String(featuredProgram.currency) : metadataValue(metadata, ['event_offer_currency'], 'EUR'),
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

  function bindFeaturedProgram(data){
    if(!data) return;
    var fp = data.featuredProgram || null;
    var defaultProgramsUrl = '/programas';
    var featuredProgramId = fp && fp.id ? String(fp.id) : '';
    var featuredCatalogUrl = featuredProgramId ? `${defaultProgramsUrl}?program_id=${encodeURIComponent(featuredProgramId)}` : defaultProgramsUrl;

    var tagline = document.getElementById('fp-tagline');
    if(tagline) text(tagline, (fp && fp.tagline) || 'Catalogo rapido');

    var nameEl = document.getElementById('fp-name');
    if(nameEl) text(nameEl, (fp && fp.name) || 'Programa em destaque LHT');

    var nextDate = document.getElementById('fp-next-date');
    var nextDateWrap = document.getElementById('fp-next-date-wrap');
    var nextDateValue = firstDefinedValue([fp && fp.eventDate ? fp.eventDate : ''], '');
    if(nextDate && nextDateValue) text(nextDate, nextDateValue);
    if(nextDateWrap) nextDateWrap.hidden = !nextDateValue;

    var subtitle = document.getElementById('fp-subtitle');
    var subtitleText = firstDefinedValue([
      fp && fp.subtitle ? fp.subtitle : '',
      fp && fp.description ? fp.description : ''
    ], 'Explora o destaque atual e entra no catalogo completo com o contexto certo para continuares a evoluir.');
    if(subtitle) subtitle.textContent = subtitleText;

    var price = document.getElementById('fp-price');
    if(price){
      text(price, firstDefinedValue([
        fp && fp.priceLabel ? fp.priceLabel : '',
      ], 'Catalogo LHT'));
    }

    var followup = document.getElementById('fp-followup');
    if(followup){
      text(followup, firstDefinedValue([
        fp && fp.followupLabel ? fp.followupLabel : '',
        'Progressao guiada'
      ], 'Progressao guiada'));
    }

    var features = document.getElementById('fp-features');
    if(features){
      var runtimeItems = Array.isArray(fp && fp.features) ? fp.features : [];
      var fallbackItems = ['Programa em destaque no catalogo LHT.'];
      var baseSubtitle = String(subtitleText || '').trim().toLowerCase();
      var seen = new Set();
      features.innerHTML = '';
      (runtimeItems.length ? runtimeItems : fallbackItems).forEach(function(item){
        var value = String(item || '').trim();
        var normalized = value.toLowerCase();
        if(!value) return;
        if(baseSubtitle && normalized === baseSubtitle) return;
        if(seen.has(normalized)) return;
        seen.add(normalized);
        var li = document.createElement('li');
        li.textContent = value;
        features.appendChild(li);
      });

      if(!features.childNodes.length){
        var li = document.createElement('li');
        li.textContent = 'Programa em destaque no catalogo LHT.';
        features.appendChild(li);
      }
    }

    var cta = document.getElementById('fp-cta');
    if(cta){
      var featuredProgramUrl = firstDefinedValue([featuredCatalogUrl, defaultProgramsUrl], defaultProgramsUrl);
      if(featuredProgramUrl) {
        cta.setAttribute('href', featuredProgramUrl);
        syncAnchorTarget(cta, featuredProgramUrl);
      }
      text(cta, 'Ver programa no catalogo');
    }
  }

  function formatProgramPrice(priceCents, currency){
    var value = Number(priceCents);
    if(!Number.isFinite(value)) return 'Catalogo LHT';
    try {
      return new Intl.NumberFormat('pt-PT', {
        style: 'currency',
        currency: currency || 'EUR'
      }).format(value / 100);
    } catch(e){
      return `${(value / 100).toFixed(2)} ${(currency || 'EUR').toUpperCase()}`;
    }
  }

  function buildProgramCatalogUrl(programId){
    if(!programId) return '/programas';
    return `/programas?program_id=${encodeURIComponent(programId)}`;
  }

  function createQuickProgramCard(program){
    var card = document.createElement('article');
    card.className = 'program-quick-card';

    if(program && program.imageUrl){
      var visual = document.createElement('div');
      visual.className = 'program-quick-visual';
      var image = document.createElement('img');
      image.className = 'program-quick-image';
      image.src = String(program.imageUrl);
      image.alt = (program && program.name ? program.name : 'Programa LHT') + ' - imagem';
      image.loading = 'lazy';
      image.decoding = 'async';
      visual.appendChild(image);
      card.appendChild(visual);
    }

    var eyebrow = document.createElement('p');
    eyebrow.className = 'program-quick-eyebrow';
    text(eyebrow, program && program.billingType === 'recurring' ? 'Subscricao' : 'Pagamento unico');

    var title = document.createElement('h4');
    text(title, program && program.name ? program.name : 'Programa LHT');

    var description = document.createElement('p');
    description.className = 'program-quick-description';
    text(description, program && program.description ? program.description : 'Explora o programa no catalogo completo e entra com o contexto certo.');

    var meta = document.createElement('div');
    meta.className = 'program-quick-meta';
    [
      formatProgramPrice(program && program.priceCents, program && program.currency),
      program && program.durationWeeks ? `${program.durationWeeks} semanas` : '',
      program && program.followupType ? program.followupType : ''
    ].filter(Boolean).slice(0, 3).forEach(function(item){
      var chip = document.createElement('span');
      text(chip, item);
      meta.appendChild(chip);
    });

    var cta = document.createElement('a');
    cta.className = 'program-quick-cta';
    cta.setAttribute('href', buildProgramCatalogUrl(program && program.id ? program.id : ''));
    cta.setAttribute('data-track', 'cta_programs_quick_card');
    if(program && program.id) cta.setAttribute('data-program-id', program.id);
    text(cta, 'Ver no catalogo');

    card.appendChild(eyebrow);
    card.appendChild(title);
    card.appendChild(description);
    if(meta.childNodes.length){
      card.appendChild(meta);
    }
    card.appendChild(cta);
    return card;
  }

  function bindHomePrograms(programs, featuredProgramId){
    var rail = document.getElementById('home-programs-rail');
    if(!rail) return;
    if(!Array.isArray(programs) || programs.length === 0) return;

    var featuredId = featuredProgramId ? String(featuredProgramId) : '';
    var items = programs.filter(function(program){
      return String(program && program.id ? program.id : '') !== featuredId;
    }).slice(0, HOME_PROGRAMS_LIMIT);

    if(items.length === 0){
      rail.innerHTML = '';
      var placeholder = document.createElement('article');
      placeholder.className = 'program-quick-card program-quick-card-fallback';
      placeholder.innerHTML = '' +
        '<p class="program-quick-eyebrow">Catalogo</p>' +
        '<h4>Mais programas em breve</h4>' +
        '<p class="program-quick-description program-quick-description-fallback">Estamos a preparar novas opcoes. Abre o catalogo completo para veres todas as atualizacoes.</p>' +
        '<div class="cta-row program-quick-fallback-actions">' +
          '<a class="btn ghost program-quick-fallback-btn" data-track="cta_programs_catalog_home" href="/programas">Ver catalogo completo</a>' +
        '</div>';
      rail.appendChild(placeholder);
      return;
    }

    if(items.length === 0) return;

    rail.innerHTML = '';
    items.forEach(function(program){
      rail.appendChild(createQuickProgramCard(program));
    });
  }

  async function fetchHomePrograms(featuredProgramId){
    if(currentPageKey() !== 'home') return;

    var cachedPrograms = readCache(10 * 60 * 1000, HOME_PROGRAMS_CACHE_KEY);
    if(Array.isArray(cachedPrograms) && cachedPrograms.length){
      bindHomePrograms(cachedPrograms, featuredProgramId);
    }

    try {
      var response = await fetch(HOME_PROGRAMS_ENDPOINT, {
        method: 'GET',
        cache: 'no-store'
      });
      var payload = await response.json().catch(function(){ return {}; });
      if(!response.ok) return;
      var programs = Array.isArray(payload.programs) ? payload.programs : [];
      if(!programs.length) return;
      writeCache(programs, HOME_PROGRAMS_CACHE_KEY);
      bindHomePrograms(programs, featuredProgramId);
    } catch(e){
      // keep fallback markup or cached data
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
      document.querySelectorAll(`[data-track="${key}"]`).forEach((node) => {
        if(node && node.tagName === 'A'){
          node.setAttribute('href', href);
        }
      });
    });
  }

  function bindFaqs(data){
    var wrap = document.getElementById('faq-list');
    if(!wrap || !data || !Array.isArray(data.faqs) || data.faqs.length === 0) return;

    wrap.innerHTML = '';
    data.faqs.forEach(function(item){
      var details = document.createElement('details');
      var summary = document.createElement('summary');
      text(summary, item.question || '');
      var p = document.createElement('p');
      text(p, item.answer || '');
      details.appendChild(summary);
      details.appendChild(p);
      wrap.appendChild(details);
    });

    // Update FAQ JSON-LD
    var jsonLdScript = document.getElementById('faq-jsonld');
    if(jsonLdScript){
      var mainEntity = data.faqs.map(function(item){
        return {
          '@type': 'Question',
          name: item.question || '',
          acceptedAnswer: { '@type': 'Answer', text: item.answer || '' }
        };
      });
      jsonLdScript.textContent = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: mainEntity
      });
    }
  }

  function applyDynamicData(data){
    if(!data || typeof data !== 'object') return;
    bindSeoMetadata(data);
    bindFeaturedProgram(data);
    fetchHomePrograms(data && data.featuredProgram && data.featuredProgram.id ? data.featuredProgram.id : '');
    bindMetrics(data);
    bindReviews(data);
    bindFaqs(data);
    bindLinks(data);
  }

  async function fetchDynamicData(){
    const cfg = getConfig();
    if(currentPageKey() === 'home') fetchHomePrograms('');
    if(!cfg.endpoint) return;

    const cacheMaxAgeMs = Math.max(1, cfg.cacheMinutes) * 60 * 1000;
    const cached = readCache(cacheMaxAgeMs);

    const { controller, timeoutId } = withTimeout(Math.max(1000, cfg.timeoutMs));
    try {
      const res = await fetch(cfg.endpoint, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-store',
        signal: controller.signal
      });
      if(!res.ok){
        if(cached) applyDynamicData(cached);
        return;
      }
      const data = await res.json();
      applyDynamicData(data);
      writeCache(data);
    } catch(e){
      if(cached) applyDynamicData(cached);
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
    cta_ser_notificado: { event: 'Subscribe', params: { content_name: 'Alertas Programas WhatsApp', content_category: 'Comunidade' } },
    // Reserva do AER (Stripe) — sem valor definido, manter 0
    cta_reserva_aer: { event: 'InitiateCheckout', params: { content_name: 'Reserva AER', content_category: 'AER', value: 97, currency: 'EUR' } },
    cta_programs_featured_home: { event: 'ViewContent', params: { content_name: 'Programa em destaque', content_category: 'Programas' } },
    cta_programs_catalog_home: { event: 'ViewContent', params: { content_name: 'Catalogo Programas', content_category: 'Programas' } },
    cta_programs_quick_card: { event: 'ViewContent', params: { content_name: 'Catalogo Rapido', content_category: 'Programas' } },
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
        const eventID = 'PageView_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
        window.fbq('track','PageView', {}, { eventID });
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
          cta_ser_notificado: { event: 'sign_up', params: { method: 'WhatsApp', content_name: 'Alertas Programas' } },
          // Checkout / Reserva AER
          cta_reserva_aer: { event: 'begin_checkout', params: { value: 97, currency: 'EUR', items: [{ item_id: 'AER', item_name: 'Reserva AER' }] } },
          // Featured program CTA
          cta_featured_program: { event: 'select_item', params: { items: [{ item_id: 'featured_program', item_name: 'Programa em Destaque' }] } },
          cta_programs_featured_home: { event: 'select_item', params: { items: [{ item_id: 'featured_program_home', item_name: 'Programa em Destaque Home' }] } },
          cta_programs_quick_card: { event: 'select_item', params: { item_list_name: 'Catalogo Rapido', content_name: 'Programa rapido Home' } },
          // Programas page
          cta_programas: { event: 'view_item_list', params: { item_list_name: 'Programas', content_name: 'Programas LHT' } },
          cta_programs_catalog_home: { event: 'view_item_list', params: { item_list_name: 'Programas', content_name: 'Catalogo Programas Home' } },
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
      // Meta Pixel custom events (with eventID for CAPI deduplication)
      if(typeof window.fbq === 'function'){
        const eventID = name + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
        const mapped = FB_STANDARD_EVENT_MAP[name];
        if(mapped){
          window.fbq('track', mapped.event, Object.assign({}, meta, mapped.params), { eventID });
        } else {
          window.fbq('trackCustom', name, meta, { eventID });
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
