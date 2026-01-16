// Onboarding Stepper — Lion Hybrid Training
(function(){
  const COACH_LINK = 'https://home.trainingpeaks.com/attachtocoach?sharedKey=MV4HA6K2QLXYI';
  const COMMUNITY_LINK = 'https://chat.whatsapp.com/JVsqO05fm4kLhbSaSiKL8n?mode=ems_copy_t';
  const FORM_AER = 'https://docs.google.com/forms/d/1bNLLOiE4W3bXSuhx07NcGhgisFNYe9_AGm11UbcSQUA/viewform';

  const STORAGE_KEY = 'lht_onboarding_state_v1';
  const state = loadState();

  const steps = [
    { id: 'welcome', title: 'Boas‑vindas', render: renderWelcome, canSkip: true },
    { id: 'community', title: 'Comunidade', render: renderCommunity, canSkip: true },
    { id: 'tp', title: 'TrainingPeaks', render: renderTP },
    { id: 'device', title: 'Relógio/App', render: renderDevice, canSkip: true },
    { id: 'zones', title: 'Zonas iniciais', render: renderZones },
    { id: 'finish', title: 'Próximos passos', render: renderFinish }
  ];

  let currentIndex = clampIndex(steps.findIndex(s => s.id === state.current) >= 0 ? steps.findIndex(s => s.id === state.current) : 0);

  function clampIndex(i){ if(i < 0) return 0; if(i >= steps.length) return steps.length-1; return i; }

  function loadState(){ try{ return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { done: {}, current: 'welcome' }; } catch{ return { done: {}, current: 'welcome' }; } }
  function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

  function track(name, meta){
    // Respect consent: script.js gates gtag/plausible behind consent, but we can call safely
    if(typeof window.gtag === 'function'){ window.gtag('event', name, meta||{}); }
    else if(typeof window.plausible === 'function'){ window.plausible(name, { props: meta||{} }); }
    else { console.info('[onboarding.event]', name, meta||{}); }
  }

  function setProgress(){
    const el = document.getElementById('onb-progress');
    if(!el) return;
    const segments = el.querySelectorAll('.step > span');
    const completedCount = Object.values(state.done).filter(Boolean).length;
    const now = Math.max(completedCount, currentIndex);
    segments.forEach((seg, idx)=>{
      const fill = idx < now ? '100%' : '0%';
      seg.style.width = fill;
    });
    const pct = Math.round((completedCount / (steps.length-1)) * 100); // exclude finish
    el.setAttribute('aria-valuenow', String(pct));
  }

  function goto(index){
    currentIndex = clampIndex(index);
    state.current = steps[currentIndex].id;
    saveState();
    render();
  }
  function markDone(id){ state.done[id] = true; saveState(); setProgress(); }

  function render(){
    const root = document.getElementById('onboarding-app');
    if(!root) return;
    root.innerHTML = '';
    const step = steps[currentIndex];
    const card = document.createElement('div');
    card.className = 'card';
    const h3 = document.createElement('h3'); h3.textContent = `${currentIndex+1}) ${step.title}`; card.appendChild(h3);
    const content = document.createElement('div'); content.className = 'content'; card.appendChild(content);
    step.render(content);

    const actions = document.createElement('div'); actions.className = 'actions';
    // back
    if(currentIndex > 0){
      const back = button('Voltar', ()=> goto(currentIndex-1)); back.classList.add('secondary'); actions.appendChild(back);
    }
    // skip
    if(step.canSkip){ const skip = button('Fazer depois', ()=> goto(currentIndex+1)); skip.classList.add('secondary'); actions.appendChild(skip); }
    // next
    if(currentIndex < steps.length-1){
      const next = button('Continuar', ()=> goto(currentIndex+1)); actions.appendChild(next);
    }
    card.appendChild(actions);
    root.appendChild(card);
    setProgress();
  }

  function button(label, onClick, href){
    const a = document.createElement(href ? 'a' : 'button');
    a.className = 'btn';
    if(href){ a.href = href; a.target = '_blank'; a.rel = 'noopener'; }
    a.textContent = label;
    a.addEventListener('click', (e)=>{ if(!href) e.preventDefault(); onClick && onClick(e); });
    return a;
  }

  // Step renders
  function renderWelcome(container){
    const p = document.createElement('p'); p.textContent = 'Em poucos minutos ficas com comunidade, TP e dispositivo ligados. Podes avançar em qualquer ordem.'; container.appendChild(p);
    const tips = document.createElement('div'); tips.className = 'tips'; tips.innerHTML = `
      <div>• Valor: TP organiza treinos e mede carga; comunidade dá suporte diário.</div>
      <div>• Podes interromper e retomar — guardamos o teu progresso.</div>
    `; container.appendChild(tips);
    markDone('welcome');
    track('onboarding_started');
  }

  function renderCommunity(container){
    const p = document.createElement('p'); p.textContent = 'Entra no grupo exclusivo para anúncios, conteúdos e suporte inicial.'; container.appendChild(p);
    const actions = document.createElement('div'); actions.className = 'actions';
    const join = button('Entrar na Comunidade', ()=>{ markDone('community'); track('community_connected'); }, COMMUNITY_LINK);
    join.setAttribute('data-track','community_connected');
    actions.appendChild(join);
    const muted = document.createElement('p'); muted.className = 'mut'; muted.textContent = 'Dica: fixa as mensagens e ativa notificações para não perderes updates.'; container.appendChild(actions); container.appendChild(muted);
  }

  function renderTP(container){
    const ol = document.createElement('ol'); ol.innerHTML = `
      <li>Criar conta TP ou conectar ao coach.</li>
      <li>No TP: <code>Library → Plans</code> e começa o teu programa.</li>
      <li>Conecta o relógio em <code>Settings → Connections</code>.</li>
    `; container.appendChild(ol);
    const actions = document.createElement('div'); actions.className = 'actions';
    const connect = button('Conectar ao Coach', ()=>{ markDone('tp'); track('tp_connected'); }, COACH_LINK);
    connect.setAttribute('data-track','tp_connected');
    actions.appendChild(connect);
    const help = document.createElement('a'); help.className = 'btn secondary'; help.href = 'https://support.trainingpeaks.com/'; help.target = '_blank'; help.rel = 'noopener'; help.textContent = 'Ajuda TP';
    help.setAttribute('data-track','tp_help');
    actions.appendChild(help);
    const note = document.createElement('p'); note.className = 'mut'; note.textContent = 'Depois de começares o plano, os treinos surgem automaticamente no teu calendário e relógio.';
    container.appendChild(actions); container.appendChild(note);
  }

  function renderDevice(container){
    const p = document.createElement('p'); p.textContent = 'Conecta o teu relógio ou app para registar treinos automaticamente.'; container.appendChild(p);
    const grid = document.createElement('div'); grid.className = 'grid-2';
    const providers = [
      { name:'Garmin', url:'https://connect.garmin.com/' },
      { name:'Polar', url:'https://flow.polar.com/' },
      { name:'COROS', url:'https://www.coros.com/' },
      { name:'Strava', url:'https://www.strava.com/' },
      { name:'Apple Health', url:'https://www.apple.com/ios/health/' },
      { name:'Google Fit', url:'https://www.google.com/fit/' }
    ];
    providers.forEach(pv=>{
      const a = document.createElement('a');
      a.className = 'btn secondary'; a.href = pv.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = pv.name;
      a.setAttribute('data-track','device_connect');
      grid.appendChild(a);
    });
    container.appendChild(grid);
    const tips = document.createElement('div'); tips.className = 'tips'; tips.innerHTML = `
      <div>• No TP: Settings → Connections para ligar serviços suportados.</div>
      <div>• Sem dispositivo? Regista manualmente os treinos no TP.</div>
    `; container.appendChild(tips);
    const done = button('Marcar como ligado', ()=>{ markDone('device'); track('device_connected'); }); container.appendChild(done);
  }

  function renderZones(container){
    const p = document.createElement('p'); p.textContent = 'Define as tuas primeiras zonas. Usa histórico/FTP ou um teste rápido.'; container.appendChild(p);
    const actions = document.createElement('div'); actions.className = 'actions';
    const aer = button('Abrir Questionário AER', ()=>{ track('zones_aer_open'); }, FORM_AER); aer.setAttribute('data-track','zones_aer_open'); actions.appendChild(aer);
    container.appendChild(actions);

    // Simple HR-based calculator
    const calcCard = document.createElement('div'); calcCard.className = 'card';
    const h4 = document.createElement('h3'); h4.textContent = 'Calculadora (FC)'; calcCard.appendChild(h4);
    const fcInput = document.createElement('input'); fcInput.type = 'number'; fcInput.min = '80'; fcInput.max = '220'; fcInput.placeholder = 'Limiar FC (bpm)'; fcInput.style.cssText = 'background:#1a1a1a;border:1px solid #333;color:#f5f5f5;border-radius:8px;padding:10px;width:180px';
    calcCard.appendChild(fcInput);
    const out = document.createElement('div'); out.className = 'tips'; calcCard.appendChild(out);
    const btn = button('Calcular zonas', ()=>{
      const lthr = Number(fcInput.value);
      if(!lthr || lthr < 80 || lthr > 220){ out.textContent = 'Introduce um valor de LTHR válido.'; return; }
      const zones = calcZonesHR(lthr);
      out.innerHTML = `
        <div>Z1 (Recuperação): ${zones[0][0]}–${zones[0][1]} bpm</div>
        <div>Z2 (Endurance): ${zones[1][0]}–${zones[1][1]} bpm</div>
        <div>Z3 (Tempo): ${zones[2][0]}–${zones[2][1]} bpm</div>
        <div>Z4 (Limiar): ${zones[3][0]}–${zones[3][1]} bpm</div>
        <div>Z5 (VO2): ≥ ${zones[4][0]} bpm</div>
      `;
      track('zones_calculated', { method: 'hr' });
    });
    calcCard.appendChild(btn);
    const note = document.createElement('p'); note.className = 'mut'; note.textContent = 'Atualiza as tuas zonas no TP em Settings → Zones para que os treinos usem as intensidades corretas.'; calcCard.appendChild(note);
    container.appendChild(calcCard);

    const done = button('Marcar zonas definidas', ()=>{ markDone('zones'); track('zones_set'); }); container.appendChild(done);
  }

  function calcZonesHR(lthr){
    // Basic model based on %LTHR (illustrative; ajustar se necessário)
    const pct = [0.60, 0.70, 0.80, 0.87, 0.93, 1.00];
    const z1 = [Math.round(lthr*pct[0]), Math.round(lthr*pct[1]-1)];
    const z2 = [Math.round(lthr*pct[1]), Math.round(lthr*pct[2]-1)];
    const z3 = [Math.round(lthr*pct[2]), Math.round(lthr*pct[3]-1)];
    const z4 = [Math.round(lthr*pct[3]), Math.round(lthr*pct[4]-1)];
    const z5 = [Math.round(lthr*pct[4])];
    return [z1,z2,z3,z4,z5];
  }

  function renderFinish(container){
    const sum = document.createElement('div'); sum.className = 'summary';
    const items = [
      { id:'community', label:'Comunidade' },
      { id:'tp', label:'TrainingPeaks' },
      { id:'device', label:'Dispositivo' },
      { id:'zones', label:'Zonas' }
    ];
    items.forEach(it=>{
      const ok = !!state.done[it.id];
      const row = document.createElement('div');
      row.innerHTML = `${it.label}: ${ok ? '<span class="badge-ok">conectado</span>' : '<span class="badge-pending">pendente</span>'}`;
      sum.appendChild(row);
    });
    container.appendChild(sum);

    const actions = document.createElement('div'); actions.className = 'actions';
    const openTP = button('Abrir calendário no TP', ()=>{ track('finish_open_tp'); }, 'https://app.trainingpeaks.com/#/calendar');
    openTP.setAttribute('data-track','finish_open_tp');
    actions.appendChild(openTP);

    const reset = button('Recomeçar onboarding', ()=>{ localStorage.removeItem(STORAGE_KEY); state.done = {}; state.current = 'welcome'; saveState(); track('onboarding_reset'); goto(0); });
    reset.classList.add('secondary');
    actions.appendChild(reset);

    container.appendChild(actions);
    track('onboarding_completed', { completed: Object.keys(state.done).length });
  }

  // Mount
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', ()=>{ render(); });
  } else { render(); }
})();
