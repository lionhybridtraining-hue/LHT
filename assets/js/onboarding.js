// Onboarding Stepper — Lion Hybrid Training
(function(){
  const COACH_LINK = 'https://home.trainingpeaks.com/attachtocoach?sharedKey=MV4HA6K2QLXYI';
  const COMMUNITY_LINK = 'https://chat.whatsapp.com/IIeEUlwh5oXCa87bNxWM5w';
  const DEFAULT_AUTH_MAX_SESSION_SECONDS = 24 * 60 * 60;

  const STORAGE_KEY = 'lht_onboarding_state_v1';
  const INTAKE_SCHEMA = [
    {
      id: 'dados_gerais',
      title: 'Dados Gerais e Contactos',
      fields: [
        { key: 'nome_completo', label: 'Nome (primeiro e ultimo nome)', type: 'text', required: true },
        { key: 'sexo', label: 'Sexo', type: 'radio', required: true, options: ['Masculino', 'Feminino'] },
        { key: 'data_nascimento', label: 'Data de Nascimento', type: 'date', required: true }
      ]
    },
    {
      id: 'antropometria',
      title: 'Dados Antropometricos e Biometricos',
      fields: [
        { key: 'peso_kg', label: 'Peso (kg)', type: 'number', required: true },
        { key: 'peso_ideal_kg', label: 'Peso Ideal (kg)', type: 'number', required: true, hint: 'Que peso te fez sentir mais confortavel/atletico(a)?' },
        { key: 'altura_m', label: 'Altura (m)', type: 'number', step: '0.01', required: true },
        { key: 'massa_gorda_percent', label: 'Massa Gorda (%)', type: 'number', step: '0.1', required: false },
        { key: 'perimetro_abdominal_cm', label: 'Perimetro Abdominal (cm)', type: 'number', required: false }
      ]
    },
    {
      id: 'estilo_vida',
      title: 'Estilo de Vida, Rotinas e Profissao',
      fields: [
        { key: 'profissao', label: 'Profissao', type: 'text', required: true },
        { key: 'nivel_atividade_diaria', label: 'Nivel de atividade diaria', type: 'radio', required: true, options: ['Predominantemente sedentario', 'Levemente ativo', 'Moderadamente ativo', 'Fisicamente exigente'] },
        { key: 'media_passos_diarios', label: 'Media de passos diarios', type: 'radio', required: true, options: ['Menos de 4.000 passos', 'Entre 4.000 e 6.000 passos', 'Entre 6.000 e 10.000 passos', 'Mais de 10.000 passos'] },
        { key: 'habitos_ajudam', label: 'Que comportamentos/habitos te ajudam mais neste momento?', type: 'textarea', required: true },
        { key: 'habitos_atrapalham', label: 'O que te esta a atrapalhar mais?', type: 'textarea', required: true }
      ]
    },
    {
      id: 'sono',
      title: 'Sono',
      fields: [
        { key: 'horas_sono_media', label: 'Quantas horas dormes em media?', type: 'number', step: '0.5', required: true },
        { key: 'qualidade_sono', label: 'Classifica qualidade do sono (1-5)', type: 'rating', required: true },
        { key: 'sono_reparador', label: 'Sentes que o teu sono e reparador?', type: 'textarea', required: true }
      ]
    },
    {
      id: 'alimentacao_hidratacao',
      title: 'Alimentacao, Hidratacao e Suplementacao',
      fields: [
        { key: 'qualidade_alimentacao', label: 'Classifica a qualidade da tua alimentacao (1-5)', type: 'rating', required: true },
        { key: 'padrao_alimentar', label: 'Assinala com as que melhor te identificas', type: 'checkbox-group', required: true, options: ['Como de tudo mas por vezes demasiado', 'Quando me desleixo deixo de comer suficiente', 'Sou bastante moderado(a) nas quantidades'] },
        { key: 'apetites_dia', label: 'Sentes muitos apetites ao longo do dia?', type: 'radio', required: true, options: ['Sim', 'Por vezes mas consigo gerir', 'Estou sempre saciado(a)'] },
        { key: 'melhoria_alimentacao', label: 'Se so melhorasses uma coisa na tua alimentacao o que seria?', type: 'textarea', required: true },
        { key: 'litros_agua_dia', label: 'Quantos litros bebes por dia?', type: 'number', step: '0.1', required: true },
        { key: 'dificuldade_hidratacao', label: 'Tens dificuldade em ingerir agua? Porquê?', type: 'textarea', required: true },
        { key: 'suplementos', label: 'Que suplementos usas?', type: 'checkbox-group', required: false, options: ['Creatina', 'Proteina', 'Multivitaminico', 'Omega-3', 'Eletrolitos', 'Magnesio', 'Geis energeticos'] },
        { key: 'opiniao_suplementacao', label: 'Qual a tua opiniao sobre suplementacao?', type: 'textarea', required: true }
      ]
    },
    {
      id: 'saude',
      title: 'Anamnese - Saude, Lesoes e Limitacoes',
      fields: [
        { key: 'condicao_saude_diagnosticada', label: 'Tens alguma condicao de saude diagnosticada?', type: 'textarea', required: true },
        { key: 'checkup_recente', label: 'Fizeste algum check up recentemente?', type: 'radio', required: true, options: ['Sim', 'Nao'] },
        { key: 'medicacao_diaria', label: 'Tomas medicacao diaria? Se sim, qual?', type: 'textarea', required: true },
        { key: 'acompanhamento_profissional', label: 'Tens acompanhamento profissional? Se sim, em que especialidade?', type: 'textarea', required: true },
        { key: 'lesao_atual', label: 'Tens alguma lesao (muscular, articular, ossea)?', type: 'textarea', required: true },
        { key: 'dores_regulares', label: 'Tens tido dores regularmente?', type: 'textarea', required: true },
        { key: 'intervencao_cirurgica', label: 'Fizeste alguma intervencao cirurgica? Qual?', type: 'textarea', required: true },
        { key: 'sintomas_treino', label: 'Sintomas durante/apos treino', type: 'checkbox-group', required: false, options: ['Falta de ar', 'Tonturas', 'Enjoos', 'Dor no peito', 'Palpitacoes', 'Arritmia cardiaca', 'Dores articulares agudas', 'Dormencia/Formigueiros'] },
        { key: 'condicao_mental_emocional', label: 'Existe alguma condicao fisica, mental ou emocional importante para o acompanhamento?', type: 'textarea', required: true }
      ]
    },
    {
      id: 'experiencia',
      title: 'Historico de Treino e Experiencia',
      fields: [
        { key: 'treina_ginasio_atualmente', label: 'Estas a treinar num ginasio atualmente?', type: 'radio', required: true, options: ['Nao/raramente', 'Em media 1/2 vezes por semana', 'Em media 2/3 vezes por semana', 'Em media 3/4 vezes por semana', 'Mais de 4 vezes por semana'] },
        { key: 'consistency_level', label: 'Nivel de consistencia atual', type: 'radio', required: true, options: ['low', 'medium', 'high'] },
        { key: 'experience_level', label: 'Nivel de experiencia atual', type: 'radio', required: true, options: ['starter', 'building', 'performance'] },
        { key: 'desporto_regular', label: 'Praticas ou ja praticaste algum desporto de forma regular?', type: 'textarea', required: true },
        { key: 'acompanhamento_pt', label: 'Ja fizeste acompanhamento com um PT?', type: 'textarea', required: true },
        { key: 'partilha_experiencia_treino', label: 'Ha algo relativo a tua experiencia de treino que queiras partilhar?', type: 'textarea', required: true }
      ]
    },
    {
      id: 'motivacao',
      title: 'Motivacao, Objetivos e Expectativas',
      fields: [
        { key: 'porque_agora', label: 'O que te trouxe ate aqui neste momento da tua vida?', type: 'textarea', required: true },
        { key: 'mudanca_desejada', label: 'Se este processo correr como imaginas, o que mudaria na tua vida?', type: 'textarea', required: true },
        { key: 'tentativas_anteriores', label: 'O que ja tentaste antes que nao funcionou? Porquê?', type: 'textarea', required: true },
        { key: 'auto_sabotagem', label: 'O que te costuma sabotar quando tentas melhorar?', type: 'checkbox-group', required: false, options: ['Falta de consistencia', 'Desmotivacao apos 2-3 semanas', 'Excesso de exigencia/perfeccionismo', 'Falta de apoio', 'Nao saber o que fazer', 'Falta de paciencia com resultados', 'Vontade de fazer tudo ao mesmo tempo'] },
        { key: 'falo_comigo_dificil', label: 'Como e que falas contigo proprio(a) nos momentos dificeis?', type: 'checkbox-group', required: false, options: ['Sou duro(a) demais comigo', 'Tenho pensamentos negativos que me bloqueiam', 'Tento ser positivo(a), mas as vezes nao acredito', 'Sou otimista e resiliente na maioria dos dias'] },
        { key: 'gatilho_dias_dificeis', label: 'Nos dias dificeis, o que te faz levantar e agir?', type: 'textarea', required: true },
        { key: 'frase_motivacao', label: 'Qual e a frase que mais te motiva?', type: 'radio', required: true, options: ['Bora! Tu es capaz! Ja passaste por tanta coisa', 'Duvido que consigas! Nao eras capaz de...', 'E agora ou nunca', 'Aguenta so mais um pouco', 'Outra'] },
        { key: 'maior_objetivo', label: 'Qual o teu maior objetivo que este acompanhamento te ajudara a atingir?', type: 'textarea', required: true },
        { key: 'notas_finais', label: 'Existe mais alguma coisa que possas partilhar para estarmos 100% alinhados?', type: 'textarea', required: false }
      ]
    }
  ];

  const state = loadState();
  state.intake = state.intake || { submitted: false };

  const steps = [
    { id: 'welcome', title: 'Boas‑vindas', render: renderWelcome, canSkip: true },
    { id: 'community', title: 'Comunidade Lion Hybrid Training', render: renderCommunity, canSkip: true },
    { id: 'tp', title: 'TrainingPeaks', render: renderTP },
    { id: 'device', title: 'Dispositivo', render: renderDevice, canSkip: true },
    { id: 'condicao', title: 'Condição Física', render: renderCondicao },
    { id: 'finish', title: 'Próximos passos', render: renderFinish }
  ];

  let currentIndex = clampIndex(steps.findIndex(s => s.id === state.current) >= 0 ? steps.findIndex(s => s.id === state.current) : 0);
  let supabaseClient = null;
  let publicConfig = null;
  let currentUser = null;
  let accessToken = '';
  let intakeDraft = null;
  let loadingIntake = false;
  let authReady = false;
  let accessState = { status: 'idle', program: null, purchase: null, message: '' };

  function clampIndex(i){ if(i < 0) return 0; if(i >= steps.length) return steps.length-1; return i; }

  function loadState(){ try{ return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { done: {}, current: 'welcome' }; } catch{ return { done: {}, current: 'welcome' }; } }
  function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

  function getProgramSelection(){
    const params = new URLSearchParams(window.location.search);
    return {
      programId: params.get('program_id') || '',
      programExternalId: params.get('program') || params.get('program_external_id') || '',
      sessionId: params.get('session_id') || ''
    };
  }

  function buildProgramQuery(){
    const selection = getProgramSelection();
    const params = new URLSearchParams();
    if(selection.programId) params.set('program_id', selection.programId);
    if(selection.programExternalId) params.set('program', selection.programExternalId);
    if(selection.sessionId) params.set('session_id', selection.sessionId);
    return params.toString();
  }

  function getProgramsPageUrl(){
    const params = new URLSearchParams();
    const selection = getProgramSelection();
    if(selection.programId) params.set('program_id', selection.programId);
    if(selection.programExternalId) params.set('program', selection.programExternalId);
    const query = params.toString();
    return '/programas' + (query ? '?' + query : '');
  }

  function track(name, meta){
    // Respect consent: script.js gates gtag/plausible behind consent, but we can call safely
    if(typeof window.gtag === 'function'){ window.gtag('event', name, meta||{}); }
    else if(typeof window.plausible === 'function'){ window.plausible(name, { props: meta||{} }); }
    else { console.info('[onboarding.event]', name, meta||{}); }
  }

  async function loadPublicConfig(){
    if(publicConfig) return publicConfig;
    const response = await fetch('/.netlify/functions/public-config');
    const payload = await response.json().catch(() => ({}));
    if(!response.ok){
      throw new Error((payload && payload.error) ? payload.error : 'Nao foi possivel carregar configuracao publica.');
    }
    publicConfig = {
      supabaseUrl: payload.supabaseUrl,
      supabaseAnonKey: payload.supabaseAnonKey,
      authMaxSessionSeconds: Number(payload.authMaxSessionSeconds) || DEFAULT_AUTH_MAX_SESSION_SECONDS
    };
    return publicConfig;
  }

  function getSessionIssuedAt(session){
    return session && session.user
      ? (session.user.last_sign_in_at || session.user.created_at || null)
      : null;
  }

  function isSessionOverMaxAge(session){
    const issuedAt = getSessionIssuedAt(session);
    if(!issuedAt) return false;
    const issuedMs = new Date(issuedAt).getTime();
    if(!Number.isFinite(issuedMs)) return false;
    const maxAge = publicConfig && publicConfig.authMaxSessionSeconds
      ? publicConfig.authMaxSessionSeconds
      : DEFAULT_AUTH_MAX_SESSION_SECONDS;
    return Math.floor((Date.now() - issuedMs) / 1000) > maxAge;
  }

  async function enforceSessionMaxAge(session){
    if(supabaseClient && isSessionOverMaxAge(session)){
      await supabaseClient.auth.signOut({ scope: 'local' });
      return true;
    }
    return false;
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

  async function initializeAuth(){
    let attempts = 0;
    while(!window.supabase && attempts < 50){
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    if(!window.supabase){
      authReady = true;
      accessState = { status: 'error', program: null, purchase: null, message: 'Supabase indisponivel no browser.' };
      render();
      return;
    }

    const config = await loadPublicConfig();
    supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

    const { data: { session } } = await supabaseClient.auth.getSession();
    authReady = true;
    const expired = await enforceSessionMaxAge(session || null);
    setSession(expired ? null : (session || null));

    supabaseClient.auth.onAuthStateChange(async (_event, sessionState) => {
      const nextExpired = await enforceSessionMaxAge(sessionState || null);
      setSession(nextExpired ? null : (sessionState || null));
    });
  }

  function setSession(session){
    currentUser = session && session.user ? session.user : null;
    accessToken = session && session.access_token ? session.access_token : '';
    if(!currentUser){
      intakeDraft = null;
      loadingIntake = false;
      accessState = { status: 'idle', program: null, purchase: null, message: '' };
    }
    refreshAccessState();
    render();
  }

  async function getValidAccessToken(){
    if(!supabaseClient) return '';
    const { data: { session } } = await supabaseClient.auth.getSession();
    const expired = await enforceSessionMaxAge(session || null);
    if(expired || !session || !session.access_token){
      setSession(null);
      return '';
    }
    currentUser = session.user || null;
    accessToken = session.access_token || '';
    return accessToken;
  }

  async function refreshAccessState(){
    const token = await getValidAccessToken();
    if(!currentUser || !token){
      accessState = { status: 'idle', program: null, purchase: null, message: '' };
      render();
      return;
    }

    accessState = { status: 'checking', program: accessState.program, purchase: null, message: '' };
    render();

    try {
      const response = await fetch('/.netlify/functions/check-access?' + buildProgramQuery(), {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + token }
      });
      const payload = await response.json();
      if(!response.ok){
        throw new Error((payload && payload.error) ? payload.error : 'Nao foi possivel validar o teu acesso.');
      }

      accessState = {
        status: payload.hasAccess ? 'allowed' : 'denied',
        program: payload.program || null,
        purchase: payload.purchase || null,
        message: payload.message || ''
      };

      if(payload.hasAccess && !loadingIntake && intakeDraft === null){
        loadIntakeDraft();
      }
    } catch (err) {
      accessState = {
        status: 'error',
        program: null,
        purchase: null,
        message: err.message || 'Nao foi possivel validar o teu acesso.'
      };
    }

    render();
  }

  async function signInGoogle(){
    if(!supabaseClient) return;
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/onboarding' + window.location.search }
    });
    if(error) alert(error.message || 'Erro ao iniciar login Google.');
  }

  async function signOutGoogle(){
    if(!supabaseClient) return;
    await supabaseClient.auth.signOut({ scope: 'local' });
    setSession(null);
  }

  async function loadIntakeDraft(){
    const token = await getValidAccessToken();
    if(!token) return;
    loadingIntake = true;
    try {
      const response = await fetch('/.netlify/functions/onboarding-intake?' + buildProgramQuery(), {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + token }
      });
      if(response.ok){
        const payload = await response.json();
        intakeDraft = payload && payload.answers ? payload.answers : {};
        // Seed structured name from profile so the intake form pre-fills even if
        // the user came via planocorrida.
        if(payload && payload.profile) {
          if(payload.profile.fullName && !intakeDraft.nome_completo) {
            intakeDraft.nome_completo = payload.profile.fullName;
          }
        }
        if(payload && payload.submittedAt){
          state.intake.submitted = true;
          state.done.condicao = true;
          saveState();
        }
      } else {
        intakeDraft = {};
      }
    } catch {
      intakeDraft = {};
    } finally {
      loadingIntake = false;
      render();
    }
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

    if(!authReady){
      renderGate(root, 'A preparar o acesso', 'Estamos a validar a tua sessão antes de abrir o onboarding.');
      return;
    }

    if(!currentUser){
      renderLoginGate(root);
      return;
    }

    if(accessState.status === 'checking' || accessState.status === 'idle'){
      renderGate(root, 'A validar acesso', 'Estamos a confirmar se este programa esta associado a tua conta.');
      return;
    }

    if(accessState.status === 'denied'){
      renderPaymentGate(root);
      return;
    }

    if(accessState.status === 'error'){
      renderErrorGate(root);
      return;
    }

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
    if(currentIndex < steps.length-1 && step.id !== 'condicao'){
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
    if(href){
      a.href = href;
      if(/^https?:\/\//i.test(href)){
        a.target = '_blank';
        a.rel = 'noopener';
      }
    }
    a.textContent = label;
    a.addEventListener('click', (e)=>{ if(!href) e.preventDefault(); onClick && onClick(e); });
    return a;
  }

  function renderGate(root, title, message){
    const card = document.createElement('div');
    card.className = 'card';
    const h3 = document.createElement('h3');
    h3.textContent = title;
    card.appendChild(h3);
    const p = document.createElement('p');
    p.textContent = message;
    card.appendChild(p);
    root.appendChild(card);
  }

  function renderLoginGate(root){
    const card = document.createElement('div');
    card.className = 'card';
    const h3 = document.createElement('h3');
    h3.textContent = 'Entrar antes de iniciar';
    card.appendChild(h3);

    const p = document.createElement('p');
    p.textContent = 'O onboarding esta reservado a atletas com conta autenticada e acesso pago confirmado.';
    card.appendChild(p);

    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.appendChild(button('Entrar com Google', ()=> signInGoogle()));
    actions.appendChild(button('Ver programas', null, getProgramsPageUrl()));
    card.appendChild(actions);
    root.appendChild(card);
  }

  function renderPaymentGate(root){
    const card = document.createElement('div');
    card.className = 'card';
    const h3 = document.createElement('h3');
    h3.textContent = 'Pagamento necessario';
    card.appendChild(h3);

    const p = document.createElement('p');
    p.textContent = accessState.program
      ? 'A tua conta esta autenticada, mas ainda nao tem acesso confirmado ao programa ' + accessState.program.name + '.'
      : 'A tua conta esta autenticada, mas ainda nao tem acesso confirmado ao onboarding.';
    card.appendChild(p);

    const meta = document.createElement('p');
    meta.className = 'mut';
    meta.textContent = 'Assim que o pagamento ficar confirmado, o acesso e libertado automaticamente.';
    card.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.appendChild(button('Ver programas', null, getProgramsPageUrl()));
    const logout = button('Terminar sessao', ()=> signOutGoogle());
    logout.classList.add('secondary');
    actions.appendChild(logout);
    card.appendChild(actions);
    root.appendChild(card);
  }

  function renderErrorGate(root){
    const card = document.createElement('div');
    card.className = 'card';
    const h3 = document.createElement('h3');
    h3.textContent = 'Nao foi possivel validar o acesso';
    card.appendChild(h3);

    const p = document.createElement('p');
    p.textContent = accessState.message || 'Tenta novamente dentro de instantes.';
    card.appendChild(p);

    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.appendChild(button('Tentar novamente', ()=> refreshAccessState()));
    actions.appendChild(button('Ver programas', null, getProgramsPageUrl()));
    card.appendChild(actions);
    root.appendChild(card);
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
    const p = document.createElement('p');
    p.textContent = 'Este questionario e guardado na tua ficha para personalizar o plano e o acompanhamento.';
    container.appendChild(p);

    const authBox = document.createElement('div');
    authBox.className = 'auth-box';
    const authMeta = document.createElement('div');
    authMeta.className = 'auth-meta';

    const authChip = document.createElement('span');
    authChip.className = 'auth-chip';
    authChip.textContent = currentUser ? ('Ligado: ' + (currentUser.email || currentUser.id)) : 'Nao autenticado';
    authMeta.appendChild(authChip);

    const authButton = button('Terminar sessao', async ()=>{
      await signOutGoogle();
    });
    authMeta.appendChild(authButton);
    authBox.appendChild(authMeta);
    container.appendChild(authBox);

    if(loadingIntake){
      const loading = document.createElement('p');
      loading.className = 'mut';
      loading.textContent = 'A carregar respostas guardadas...';
      container.appendChild(loading);
      return;
    }

    const form = document.createElement('form');
    form.className = 'intake-form';
    renderIntakeForm(form);

    const status = document.createElement('div');
    status.className = 'status';
    status.hidden = true;
    form.appendChild(status);

    const actions = document.createElement('div');
    actions.className = 'actions';
    const submit = document.createElement('button');
    submit.className = 'btn';
    submit.type = 'submit';
    submit.textContent = state.intake.submitted ? 'Atualizar respostas' : 'Guardar questionario';
    actions.appendChild(submit);

    const next = button('Continuar', ()=> goto(currentIndex+1));
    next.disabled = !state.done.condicao;
    next.style.opacity = state.done.condicao ? '1' : '.6';
    next.style.pointerEvents = state.done.condicao ? 'auto' : 'none';
    actions.appendChild(next);
    form.appendChild(actions);

    form.addEventListener('submit', async (e)=>{
      e.preventDefault();
      status.hidden = true;
      const { answers, errors } = collectIntakeAnswers(form);
      if(errors.length){
        status.hidden = false;
        status.className = 'status error';
        status.textContent = errors[0];
        return;
      }

      submit.disabled = true;
      try {
        const response = await fetch('/.netlify/functions/onboarding-intake?' + buildProgramQuery(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + accessToken
          },
          body: JSON.stringify({ answers })
        });

        const payload = await response.json();
        if(!response.ok){
          throw new Error((payload && payload.error) ? payload.error : 'Nao foi possivel guardar o questionario.');
        }

        intakeDraft = answers;
        state.intake.submitted = true;
        state.done.condicao = true;
        saveState();
        track('condicao_fisica');

        next.disabled = false;
        next.style.opacity = '1';
        next.style.pointerEvents = 'auto';

        status.hidden = false;
        status.className = 'status ok';
        status.textContent = 'Questionario guardado com sucesso.';
      } catch (err) {
        status.hidden = false;
        status.className = 'status error';
        status.textContent = err.message || 'Erro inesperado ao guardar o questionario.';
      } finally {
        submit.disabled = false;
      }
    });

    container.appendChild(form);
  }

  function renderIntakeForm(form){
    INTAKE_SCHEMA.forEach(section => {
      const sec = document.createElement('section');
      sec.className = 'intake-section';
      const title = document.createElement('h4');
      title.textContent = section.title;
      sec.appendChild(title);

      const grid = document.createElement('div');
      grid.className = 'intake-grid';
      section.fields.forEach(field => {
        grid.appendChild(renderField(field));
      });
      sec.appendChild(grid);
      form.appendChild(sec);
    });
  }

  function renderField(field){
    const wrap = document.createElement('div');
    wrap.className = 'field';

    const label = document.createElement('label');
    label.setAttribute('for', field.key);
    label.textContent = field.label + (field.required ? ' *' : '');
    wrap.appendChild(label);

    if(field.hint){
      const hint = document.createElement('div');
      hint.className = 'hint';
      hint.textContent = field.hint;
      wrap.appendChild(hint);
    }

    const value = getInitialValue(field.key);

    if(field.type === 'radio' || field.type === 'checkbox-group'){
      const options = document.createElement('div');
      options.className = 'options';
      const currentValues = Array.isArray(value) ? value : [value].filter(Boolean);
      field.options.forEach((opt, idx) => {
        const row = document.createElement('label');
        row.className = 'option-row';
        const input = document.createElement('input');
        input.type = field.type === 'radio' ? 'radio' : 'checkbox';
        input.name = field.key;
        input.value = opt;
        input.id = field.key + '_' + idx;
        if(field.type === 'radio' && value === opt) input.checked = true;
        if(field.type === 'checkbox-group' && currentValues.includes(opt)) input.checked = true;
        row.appendChild(input);
        const txt = document.createElement('span');
        txt.textContent = opt;
        row.appendChild(txt);
        options.appendChild(row);
      });
      wrap.appendChild(options);
      return wrap;
    }

    if(field.type === 'rating'){
      const rating = document.createElement('div');
      rating.className = 'rating';
      for(let i=1;i<=5;i++){
        const row = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = field.key;
        input.value = String(i);
        if(String(value) === String(i)) input.checked = true;
        row.appendChild(input);
        const txt = document.createElement('span'); txt.textContent = String(i);
        row.appendChild(txt);
        rating.appendChild(row);
      }
      wrap.appendChild(rating);
      return wrap;
    }

    const input = document.createElement(field.type === 'textarea' ? 'textarea' : 'input');
    input.id = field.key;
    input.name = field.key;
    if(field.type !== 'textarea') input.type = field.type;
    if(field.step && field.type === 'number') input.step = field.step;
    input.placeholder = 'A tua resposta';
    if(value !== undefined && value !== null) input.value = value;
    if(field.key === 'email' && currentUser && currentUser.email){
      input.value = currentUser.email;
    }
    wrap.appendChild(input);

    return wrap;
  }

  function getInitialValue(key){
    if(intakeDraft && Object.prototype.hasOwnProperty.call(intakeDraft, key)) return intakeDraft[key];
    if(key === 'email' && currentUser && currentUser.email) return currentUser.email;
    if(key === 'nome_completo' && currentUser && currentUser.user_metadata && currentUser.user_metadata.full_name) {
      return currentUser.user_metadata.full_name;
    }
    return '';
  }

  function collectIntakeAnswers(form){
    const answers = {};
    const errors = [];

    INTAKE_SCHEMA.forEach(section => {
      section.fields.forEach(field => {
        let value;
        if(field.type === 'radio' || field.type === 'rating'){
          const checked = form.querySelector('input[name="' + field.key + '"]:checked');
          value = checked ? checked.value : '';
        } else if(field.type === 'checkbox-group'){
          const checked = form.querySelectorAll('input[name="' + field.key + '"]:checked');
          value = Array.from(checked).map(i => i.value);
        } else {
          const input = form.querySelector('[name="' + field.key + '"]');
          value = input ? String(input.value || '').trim() : '';
          if(field.type === 'number' && value !== ''){
            const numeric = Number(value);
            value = Number.isFinite(numeric) ? numeric : '';
          }
        }

        if(field.required){
          const isEmptyArray = Array.isArray(value) && value.length === 0;
          const isEmptyScalar = !Array.isArray(value) && (value === '' || value === null || value === undefined);
          if(isEmptyArray || isEmptyScalar){
            errors.push('Campo obrigatorio por preencher: ' + field.label);
          }
        }
        answers[field.key] = value;
      });
    });

    return { answers, errors };
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
    document.addEventListener('DOMContentLoaded', ()=>{ render(); initializeAuth(); });
  } else { render(); initializeAuth(); }
})();
