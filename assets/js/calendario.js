const LHT_CALENDAR_CONFIG = {
  embedUrl: 'https://calendar.google.com/calendar/embed?src=912e82e3fded609ada172e79c94251f92bc8f0ba03fffc7fb230ac6afe1b759f%40group.calendar.google.com&ctz=Europe%2FLisbon',
  googleCalendarUrl: 'https://calendar.google.com/calendar/u/1?cid=OTEyZTgyZTNmZGVkNjA5YWRhMTcyZTc5Yzk0MjUxZjkyYmM4ZjBiYTAzZmZmYzdmYjIzMGFjNmFmZTFiNzU5ZkBncm91cC5jYWxlbmRhci5nb29nbGUuY29t',
  icalUrl: 'https://calendar.google.com/calendar/ical/912e82e3fded609ada172e79c94251f92bc8f0ba03fffc7fb230ac6afe1b759f%40group.calendar.google.com/public/basic.ics',
  nextChallenge: {
    name: 'Desafio LHT em preparação',
    dateLabel: 'Data por definir',
    location: 'Portugal',
    focus: 'Programa de treino por definir',
    description: 'Escolhe a prova que te motiva, junta-te a comunidade e prepara-te com um programa associado.'
  },
  challenges: []
};

(function(){
  const CACHE_KEY = 'lht_dynamic_cache_v2';
  const CHALLENGES_CACHE_KEY = 'lht_calendar_challenges_cache_v1';
  const CHALLENGES_ENDPOINT = '/.netlify/functions/list-programs?mode=calendar';

  function text(node, value){
    if(node && value){
      node.textContent = value;
    }
  }

  function configured(url){
    return typeof url === 'string' && url.trim() !== '';
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

  function writeCache(cacheKey, data){
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data }));
    } catch(e){
      // Best effort cache only.
    }
  }

  function readScopedCache(cacheKey, maxAgeMs){
    try {
      const raw = localStorage.getItem(cacheKey);
      if(!raw) return null;
      const parsed = JSON.parse(raw);
      if(!parsed || !parsed.ts || !parsed.data) return null;
      if(Date.now() - parsed.ts > maxAgeMs) return null;
      return parsed.data;
    } catch(e){
      return null;
    }
  }

  function withTimeout(ms){
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ms);
    return { controller, timeoutId };
  }

  function applyMetadata(data){
    // Calendar challenge data now comes from programs (via list-programs?mode=calendar).
    // This function only processes non-challenge metadata if needed in the future.
  }

  function formatPtDate(isoDate){
    if(!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return 'Data por definir';
    const dt = new Date(isoDate + 'T00:00:00');
    if(Number.isNaN(dt.getTime())) return isoDate;
    return dt.toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  function toProgramUrl(programId){
    if(!programId) return 'programas.html';
    return 'programas.html?program_id=' + encodeURIComponent(programId);
  }

  function normalizeChallenges(data){
    const challenges = data && Array.isArray(data.challenges) ? data.challenges : [];
    return challenges.map((item)=>({
      id: item.id,
      name: item.eventName || item.name || 'Desafio LHT',
      date: item.eventDate || null,
      location: item.eventLocation || 'Portugal',
      description: item.eventDescription || item.description || 'Programa de treino da comunidade LHT.',
      programName: item.name || 'Programa LHT',
      programId: item.id || '',
      priceCents: Number(item.priceCents || 0),
      currency: item.currency || 'EUR'
    }));
  }

  function formatPrice(priceCents, currency){
    return new Intl.NumberFormat('pt-PT', {
      style: 'currency',
      currency: currency || 'EUR'
    }).format((Number(priceCents) || 0) / 100);
  }

  function renderChallengeList(){
    const body = document.getElementById('challenges-list-body');
    const empty = document.getElementById('challenges-list-empty');
    if(!body) return;

    body.innerHTML = '';
    const items = Array.isArray(LHT_CALENDAR_CONFIG.challenges) ? LHT_CALENDAR_CONFIG.challenges : [];
    if(!items.length){
      if(empty) empty.hidden = false;
      return;
    }
    if(empty) empty.hidden = true;

    const fragment = document.createDocumentFragment();
    items.forEach((challenge, idx)=>{
      const card = document.createElement('article');
      card.className = 'card challenge-list-card anim-in' + (idx < 3 ? (' delay-' + (idx + 1)) : '');

      const title = document.createElement('h3');
      title.textContent = challenge.name;
      card.appendChild(title);

      const meta = document.createElement('p');
      meta.className = 'micro';
      meta.textContent = formatPtDate(challenge.date) + ' · ' + (challenge.location || 'Portugal');
      card.appendChild(meta);

      const program = document.createElement('p');
      program.className = 'challenge-list-program';
      program.textContent = 'Programa: ' + (challenge.programName || 'Programa LHT');
      card.appendChild(program);

      const price = document.createElement('p');
      price.className = 'micro';
      price.textContent = 'Preco: ' + formatPrice(challenge.priceCents, challenge.currency);
      card.appendChild(price);

      const actions = document.createElement('div');
      actions.className = 'cta-row challenge-list-actions';
      const cta = document.createElement('a');
      cta.className = 'btn gold';
      cta.href = toProgramUrl(challenge.programId);
      cta.setAttribute('data-track', 'cta_calendar_list_program');
      cta.textContent = 'Ver programa';
      actions.appendChild(cta);
      card.appendChild(actions);

      fragment.appendChild(card);
    });

    body.appendChild(fragment);
  }

  function applyFeaturedChallenge(challenge){
    if(!challenge) return;
    LHT_CALENDAR_CONFIG.nextChallenge = {
      name: challenge.name || LHT_CALENDAR_CONFIG.nextChallenge.name,
      dateLabel: formatPtDate(challenge.date),
      location: challenge.location || LHT_CALENDAR_CONFIG.nextChallenge.location,
      focus: challenge.programName || LHT_CALENDAR_CONFIG.nextChallenge.focus,
      description: challenge.description || LHT_CALENDAR_CONFIG.nextChallenge.description,
      programId: challenge.programId || ''
    };
  }

  function applyLinks(data){
    if(!data || !data.links) return;

    const links = data.links;

    if(configured(links.calendar_embed_url)){
      LHT_CALENDAR_CONFIG.embedUrl = links.calendar_embed_url;
    }
    if(configured(links.calendar_google_url)){
      LHT_CALENDAR_CONFIG.googleCalendarUrl = links.calendar_google_url;
    }
    if(configured(links.calendar_ical_url)){
      LHT_CALENDAR_CONFIG.icalUrl = links.calendar_ical_url;
    }

    if(configured(links.calendar_embed)){
      LHT_CALENDAR_CONFIG.embedUrl = links.calendar_embed;
    }
    if(configured(links.calendar_google)){
      LHT_CALENDAR_CONFIG.googleCalendarUrl = links.calendar_google;
    }
    if(configured(links.calendar_ical)){
      LHT_CALENDAR_CONFIG.icalUrl = links.calendar_ical;
    }

    if(configured(links.google_calendar_url)){
      LHT_CALENDAR_CONFIG.googleCalendarUrl = links.google_calendar_url;
    }
    if(configured(links.ical_url)){
      LHT_CALENDAR_CONFIG.icalUrl = links.ical_url;
    }
    if(configured(links.embed_url)){
      LHT_CALENDAR_CONFIG.embedUrl = links.embed_url;
    }
  }

  function applyDynamicData(data){
    applyMetadata(data);
    applyLinks(data);
  }

  function applyChallenge(){
    const challenge = LHT_CALENDAR_CONFIG.nextChallenge || {};
    text(document.getElementById('challenge-name'), challenge.name);
    text(document.getElementById('challenge-date-pill'), challenge.dateLabel);
    text(document.getElementById('challenge-location'), challenge.location);
    text(document.getElementById('challenge-focus-copy'), challenge.focus);
    text(document.getElementById('challenge-description'), challenge.description);

    const cta = document.getElementById('challenge-program-link');
    if(cta){
      cta.href = toProgramUrl(challenge.programId || '');
    }
  }

  function setLink(node, href, statusNode, readyText){
    if(!node) return;
    if(configured(href)){
      node.href = href;
      node.removeAttribute('aria-disabled');
      if(/^https?:\/\//i.test(href)){
        node.target = '_blank';
        node.rel = 'noopener';
      }
      if(statusNode && readyText){
        statusNode.textContent = readyText;
      }
      return;
    }
    node.href = '#';
    node.setAttribute('aria-disabled', 'true');
  }

  function applyCalendar(){
    const iframe = document.getElementById('calendar-embed');
    const placeholder = document.getElementById('calendar-placeholder');
    const statusCopy = document.getElementById('calendar-status-copy');

    if(iframe){
      if(configured(LHT_CALENDAR_CONFIG.embedUrl)){
        iframe.src = LHT_CALENDAR_CONFIG.embedUrl;
        iframe.hidden = false;
        if(placeholder) placeholder.hidden = true;
        if(statusCopy) statusCopy.textContent = 'Calendário ativo. Podes abri-lo no Google Calendar ou subscrever via iCal.';
      } else {
        iframe.hidden = true;
        if(placeholder) placeholder.hidden = false;
      }
    }

    setLink(
      document.getElementById('calendar-google-link'),
      LHT_CALENDAR_CONFIG.googleCalendarUrl,
      statusCopy,
      'Calendário ativo. Podes abri-lo no Google Calendar ou subscrever via iCal.'
    );
    setLink(
      document.getElementById('calendar-ical-link'),
      LHT_CALENDAR_CONFIG.icalUrl,
      statusCopy,
      'Calendário ativo. Podes abri-lo no Google Calendar ou subscrever via iCal.'
    );
  }

  async function hydrateFromDynamicSource(){
    const cfg = getConfig();
    if(!cfg.endpoint) return;

    const cacheMaxAgeMs = Math.max(1, cfg.cacheMinutes) * 60 * 1000;
    const cached = readCache(cacheMaxAgeMs);
    if(cached){
      applyDynamicData(cached);
      applyChallenge();
      applyCalendar();
      writeCache(CACHE_KEY, cached);
    }

    const { controller, timeoutId } = withTimeout(Math.max(1000, cfg.timeoutMs));
    try {
      const response = await fetch(cfg.endpoint, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-store',
        signal: controller.signal
      });
      if(!response.ok) return;
      const data = await response.json();
      applyDynamicData(data);
      applyChallenge();
      applyCalendar();
      writeCache(CACHE_KEY, data);
    } catch(e){
      // Keep static fallback values when the dynamic source is unavailable.
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function hydrateChallenges(){
    const cfg = getConfig();
    const cacheMaxAgeMs = Math.max(1, cfg.cacheMinutes) * 60 * 1000;
    const cached = readScopedCache(CHALLENGES_CACHE_KEY, cacheMaxAgeMs);
    if(cached && Array.isArray(cached.challenges)){
      const normalizedCached = normalizeChallenges(cached);
      if(normalizedCached.length){
        LHT_CALENDAR_CONFIG.challenges = normalizedCached;
        applyFeaturedChallenge(normalizedCached[0]);
        applyChallenge();
        renderChallengeList();
      }
    }

    try {
      const response = await fetch(CHALLENGES_ENDPOINT, { method: 'GET', cache: 'no-store' });
      if(!response.ok) return;
      const data = await response.json();
      const normalized = normalizeChallenges(data);
      LHT_CALENDAR_CONFIG.challenges = normalized;
      if(normalized.length){
        applyFeaturedChallenge(normalized[0]);
      }
      applyChallenge();
      renderChallengeList();
      writeCache(CHALLENGES_CACHE_KEY, data);
    } catch(e){
      // Keep cached/static fallback when challenges endpoint is unavailable.
    }
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', ()=>{
      applyChallenge();
      applyCalendar();
      hydrateFromDynamicSource();
      hydrateChallenges();
    });
  } else {
    applyChallenge();
    applyCalendar();
    hydrateFromDynamicSource();
    hydrateChallenges();
  }
})();