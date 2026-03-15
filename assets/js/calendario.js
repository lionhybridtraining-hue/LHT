const LHT_CALENDAR_CONFIG = {
  embedUrl: 'https://calendar.google.com/calendar/embed?src=912e82e3fded609ada172e79c94251f92bc8f0ba03fffc7fb230ac6afe1b759f%40group.calendar.google.com&ctz=Europe%2FLisbon',
  googleCalendarUrl: 'https://calendar.google.com/calendar/u/1?cid=OTEyZTgyZTNmZGVkNjA5YWRhMTcyZTc5Yzk0MjUxZjkyYmM4ZjBiYTAzZmZmYzdmYjIzMGFjNmFmZTFiNzU5ZkBncm91cC5jYWxlbmRhci5nb29nbGUuY29t',
  icalUrl: 'https://calendar.google.com/calendar/ical/912e82e3fded609ada172e79c94251f92bc8f0ba03fffc7fb230ac6afe1b759f%40group.calendar.google.com/public/basic.ics',
  nextChallenge: {
    name: 'Desafio LHT em preparação',
    dateLabel: 'Data por definir',
    location: 'Portugal',
    format: 'Corrida, trail ou desafio híbrido',
    focus: 'Base aeróbica, resiliência e progressão',
    description: 'Escolhe a prova que te motiva, junta-te à comunidade e usa o AER para transformar intenção em execução semana após semana.'
  }
};

(function(){
  const CACHE_KEY = 'lht_dynamic_cache_v1';

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

  function withTimeout(ms){
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ms);
    return { controller, timeoutId };
  }

  function applyMetadata(data){
    if(!data || !data.metadata) return;

    const metadata = data.metadata;
    LHT_CALENDAR_CONFIG.nextChallenge = {
      name: metadata.challenge_name || metadata.next_challenge_name || LHT_CALENDAR_CONFIG.nextChallenge.name,
      dateLabel: metadata.challenge_date_label || metadata.next_challenge_date || metadata.aer_next_date || LHT_CALENDAR_CONFIG.nextChallenge.dateLabel,
      location: metadata.challenge_location || metadata.next_challenge_location || LHT_CALENDAR_CONFIG.nextChallenge.location,
      format: metadata.challenge_format || metadata.next_challenge_format || LHT_CALENDAR_CONFIG.nextChallenge.format,
      focus: metadata.challenge_focus || metadata.next_challenge_focus || LHT_CALENDAR_CONFIG.nextChallenge.focus,
      description: metadata.challenge_description || metadata.next_challenge_description || LHT_CALENDAR_CONFIG.nextChallenge.description
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
    text(document.getElementById('challenge-format'), challenge.format);
    text(document.getElementById('challenge-focus-copy'), challenge.focus);
    text(document.getElementById('challenge-description'), challenge.description);
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
    } catch(e){
      // Keep static fallback values when the dynamic source is unavailable.
    } finally {
      clearTimeout(timeoutId);
    }
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', ()=>{
      applyChallenge();
      applyCalendar();
      hydrateFromDynamicSource();
    });
  } else {
    applyChallenge();
    applyCalendar();
    hydrateFromDynamicSource();
  }
})();