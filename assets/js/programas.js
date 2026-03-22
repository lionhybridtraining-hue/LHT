(function(){
  const SUPABASE_URL = 'https://rlivxjarqpqmvjtgmxhh.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJsaXZ4amFycXBxbXZqdGdteGhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2MDk3NzcsImV4cCI6MjA4OTE4NTc3N30.MHwkQnytSCOBleYVOF5hJHWiV8d_-2V9UGIqsLTgjIY';

  let supabaseClient = null;
  let currentUser = null;
  let accessToken = '';
  let authReady = false;
  let programs = [];
  let loadingPrograms = true;
  let errorMessage = '';

  function getQuery(){
    return new URLSearchParams(window.location.search);
  }

  function getSelectedProgramId(){
    return getQuery().get('program_id') || '';
  }

  function render(){
    const root = document.getElementById('programs-app');
    if(!root) return;
    root.innerHTML = '';

    const auth = document.getElementById('programs-auth');
    if(auth){
      auth.textContent = !authReady
        ? 'A preparar autenticacao...'
        : currentUser
          ? 'Ligado: ' + (currentUser.email || currentUser.id)
          : 'Nao autenticado';
    }

    if(errorMessage){
      const error = document.createElement('div');
      error.className = 'notice error';
      error.textContent = errorMessage;
      root.appendChild(error);
    }

    if(getQuery().get('checkout') === 'cancelled'){
      const notice = document.createElement('div');
      notice.className = 'notice';
      notice.textContent = 'Checkout cancelado. Podes retomar quando quiseres.';
      root.appendChild(notice);
    }

    if(loadingPrograms){
      const loading = document.createElement('div');
      loading.className = 'notice';
      loading.textContent = 'A carregar programas...';
      root.appendChild(loading);
      return;
    }

    if(!programs.length){
      const empty = document.createElement('div');
      empty.className = 'notice';
      empty.textContent = 'Nao existem programas ativos neste momento.';
      root.appendChild(empty);
      return;
    }

    const selectedProgramId = getSelectedProgramId();
    programs.forEach((program) => {
      const card = document.createElement('article');
      card.className = 'program-card' + (selectedProgramId === program.id ? ' selected' : '');

      const eyebrow = document.createElement('div');
      eyebrow.className = 'eyebrow';
      eyebrow.textContent = program.billingType === 'recurring' ? 'Subscricao' : 'Pagamento unico';
      card.appendChild(eyebrow);

      const title = document.createElement('h2');
      title.textContent = program.name;
      card.appendChild(title);

      const description = document.createElement('p');
      description.className = 'description';
      description.textContent = program.description || 'Programa ativo na plataforma Lion Hybrid Training.';
      card.appendChild(description);

      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.innerHTML = '<span>' + formatPrice(program.priceCents, program.currency) + '</span><span>' + program.durationWeeks + ' semanas</span><span>' + program.followupType + '</span>';
      card.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'actions';
      const buy = document.createElement('button');
      buy.className = 'btn';
      buy.textContent = currentUser ? 'Comprar acesso' : 'Entrar e continuar';
      buy.addEventListener('click', ()=> startCheckout(program));
      actions.appendChild(buy);

      const toOnboarding = document.createElement('a');
      toOnboarding.className = 'btn secondary';
      toOnboarding.href = '/onboarding?program_id=' + encodeURIComponent(program.id);
      toOnboarding.textContent = 'Abrir onboarding';
      actions.appendChild(toOnboarding);
      card.appendChild(actions);
      root.appendChild(card);
    });
  }

  function formatPrice(priceCents, currency){
    return new Intl.NumberFormat('pt-PT', {
      style: 'currency',
      currency: currency || 'EUR'
    }).format((Number(priceCents) || 0) / 100);
  }

  async function initializeAuth(){
    let attempts = 0;
    while(!window.supabase && attempts < 50){
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    if(!window.supabase){
      authReady = true;
      errorMessage = 'Supabase indisponivel no browser.';
      render();
      return;
    }

    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: { session } } = await supabaseClient.auth.getSession();
    authReady = true;
    currentUser = session && session.user ? session.user : null;
    accessToken = session && session.access_token ? session.access_token : '';
    render();

    supabaseClient.auth.onAuthStateChange((_event, nextSession) => {
      currentUser = nextSession && nextSession.user ? nextSession.user : null;
      accessToken = nextSession && nextSession.access_token ? nextSession.access_token : '';
      render();
    });
  }

  async function loadPrograms(){
    loadingPrograms = true;
    errorMessage = '';
    render();
    try {
      const response = await fetch('/.netlify/functions/list-programs');
      const payload = await response.json();
      if(!response.ok){
        throw new Error((payload && payload.error) ? payload.error : 'Nao foi possivel carregar programas.');
      }
      programs = Array.isArray(payload.programs) ? payload.programs : [];
    } catch (err) {
      programs = [];
      errorMessage = err.message || 'Nao foi possivel carregar programas.';
    } finally {
      loadingPrograms = false;
      render();
    }
  }

  async function signInGoogle(programId){
    if(!supabaseClient) return;
    const redirect = window.location.origin + '/programas.html' + (programId ? ('?program_id=' + encodeURIComponent(programId)) : '');
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirect }
    });
    if(error) alert(error.message || 'Erro ao iniciar login Google.');
  }

  async function startCheckout(program){
    errorMessage = '';
    render();

    if(!currentUser || !accessToken){
      await signInGoogle(program.id);
      return;
    }

    try {
      const response = await fetch('/.netlify/functions/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + accessToken
        },
        body: JSON.stringify({ program_id: program.id })
      });
      const payload = await response.json();
      if(!response.ok){
        throw new Error((payload && payload.error) ? payload.error : 'Nao foi possivel iniciar checkout.');
      }
      if(payload.url){
        window.location.href = payload.url;
      }
    } catch (err) {
      errorMessage = err.message || 'Nao foi possivel iniciar checkout.';
      render();
    }
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', ()=>{ render(); initializeAuth(); loadPrograms(); });
  } else {
    render(); initializeAuth(); loadPrograms();
  }
})();