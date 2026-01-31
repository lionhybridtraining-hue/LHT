// Onboarding Stepper — Lion Hybrid Training
(function(){
  const COACH_LINK = 'https://home.trainingpeaks.com/attachtocoach?sharedKey=MV4HA6K2QLXYI';
  const COMMUNITY_LINK = 'https://chat.whatsapp.com/IIeEUlwh5oXCa87bNxWM5w';
  const FORM_CONDICAO = 'https://docs.google.com/forms/d/e/1FAIpQLSe_xuKz-C31Q_m2XpE-OUDWWPinhe4ZS0Bo3Kyvs-wnzRDTeg/viewform?usp=publish-editor';

  const STORAGE_KEY = 'lht_onboarding_state_v1';
  const state = loadState();

  const steps = [
    { id: 'welcome', title: 'Boas‑vindas', render: renderWelcome, canSkip: true },
    { id: 'community', title: 'Comunidade Lion Hybrid Training', render: renderCommunity, canSkip: true },
    { id: 'tp', title: 'TrainingPeaks', render: renderTP },
    { id: 'device', title: 'Dispositivo', render: renderDevice, canSkip: true },
    { id: 'condicao', title: 'Condição Física', render: renderCondicao },
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
    segments.forEach((seg, idx)=>{
      const fill = idx <= currentIndex ? '100%' : '0%';
      seg.style.width = fill;
      seg.style.backgroundColor = '';
    });
    const pct = Math.round((currentIndex / (steps.length-1)) * 100); // exclude finish
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
    // removed
    // next
    if(currentIndex < steps.length-1){
      const label = currentIndex === 0 ? 'Começar onboarding' : 'Continuar';
      const next = button(label, ()=> goto(currentIndex+1)); actions.appendChild(next);
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
    const p = document.createElement('p'); p.textContent = 'Em menos de um minuto vais ligar tudo o que precisas para treinar com estrutura: Comunidade e grupo exclusivo LHT, TrainingPeaks e sincronização do dispositivo.'; container.appendChild(p);
    const tips = document.createElement('div'); tips.className = 'tips'; tips.innerHTML = `
      <div>• TrainingPeaks → onde vês e registas os treinos.</div>
      <div>• Comunidade LHT → suporte, partilha e acompanhamento contínuo.</div>
    `; container.appendChild(tips);
    markDone('welcome');
    track('onboarding_started');
  }

  function renderCommunity(container){
    const p1 = document.createElement('p'); p1.textContent = 'Junta-te à nossa comunidade e entra no grupo exclusivo.'; p1.style.marginBottom = '8px'; container.appendChild(p1);
    const p2 = document.createElement('p'); p2.textContent = 'É aqui que vais esclarecer dúvidas, acompanhar o processo e ter suporte desde o primeiro treino.'; p2.style.marginTop = '0'; container.appendChild(p2);
    const actions = document.createElement('div'); actions.className = 'actions';
    const join = button('Entrar na Comunidade', ()=>{ markDone('community'); track('community_connected'); }, COMMUNITY_LINK);
    join.setAttribute('data-track','community_connected');
    actions.appendChild(join);
    const muted = document.createElement('p'); muted.className = 'mut'; muted.textContent = 'Garante que estás no grupo exclusivo: "Inner Circle"'; container.appendChild(actions); container.appendChild(muted);
  }

  function renderTP(container){
    const intro = document.createElement('p'); intro.textContent = 'O TrainingPeaks é onde vais receber, ver e registar todos os teus treinos.'; container.appendChild(intro);
    const ol = document.createElement('ol'); ol.innerHTML = `
      <li><strong>Criar conta</strong><br>Cria a tua conta gratuita no TrainingPeaks (ou faz login se já tiveres uma).</li>
      <li><strong>Associar ao coach</strong><br>Liga a tua conta ao treinador.</li>
      <li><strong>Instalar a app</strong><br>Instala a app do TrainingPeaks no teu telemóvel para teres acesso ao plano em qualquer lugar.</li>
      <li><strong>Ativar notificações</strong><br>Ativa as notificações para não perderes treinos, ajustes ou mensagens importantes.</li>
    `; container.appendChild(ol);
    const actions = document.createElement('div'); actions.className = 'actions';
    const connect = button('Conectar ao Coach', ()=>{ markDone('tp'); track('tp_connected'); }, COACH_LINK);
    connect.setAttribute('data-track','tp_connected');
    actions.appendChild(connect);
    const appDownload = button('Download App', ()=>{ track('tp_app_download'); }, 'https://www.trainingpeaks.com/app/');
    appDownload.setAttribute('data-track','tp_app_download');
    appDownload.classList.add('secondary');
    actions.appendChild(appDownload);
    const note = document.createElement('p'); note.className = 'mut'; note.textContent = 'Depois de começares o plano, os treinos surgem automaticamente no teu calendário e relógio.';
    container.appendChild(actions); container.appendChild(note);
  }

  function renderDevice(container){
    const p = document.createElement('p'); p.textContent = 'Segue as instruções oficiais para sincronizar o teu relógio, aplicação ou wearable com o TrainingPeaks:'; container.appendChild(p);
    const actions = document.createElement('div'); actions.className = 'actions';
    const link = button('Instruções TrainingPeaks', ()=>{ markDone('device'); track('device_connected'); }, 'https://www.trainingpeaks.com/upload/');
    actions.appendChild(link);
    container.appendChild(actions);
  }


  function renderCondicao(container){
    const p = document.createElement('p'); p.textContent = 'Preenche o formulário para registar a tua condição física atual. Isto ajuda-nos a personalizar o teu plano.'; container.appendChild(p);
    const actions = document.createElement('div'); actions.className = 'actions';
    const form = button('Preencher questionário', ()=>{ markDone('condicao'); track('condicao_fisica'); }, FORM_CONDICAO);
    actions.appendChild(form);
    container.appendChild(actions);
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
      { id:'community', label:'Comunidade Lion Hybrid Training' },
      { id:'tp', label:'TrainingPeaks' },
      { id:'device', label:'Dispositivo' },
      { id:'condicao', label:'Condição Física' }
    ];
    items.forEach(it=>{
      const ok = !!state.done[it.id];
      const row = document.createElement('div');
      row.innerHTML = `${it.label}: ${ok ? '<span class="badge-ok">conectado</span>' : '<span class="badge-pending">pendente</span>'}`;
      sum.appendChild(row);
    });
    container.appendChild(sum);

    const actions = document.createElement('div'); actions.className = 'actions';
    const openTP = button('Abrir calendário no TrainingPeaks', ()=>{ track('finish_open_tp'); }, 'https://app.trainingpeaks.com/#/calendar');
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
