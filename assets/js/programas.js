(function(){
  const DEFAULT_AUTH_MAX_SESSION_SECONDS = 24 * 60 * 60;

  let supabaseClient = null;
  let publicConfig = null;
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

    const config = await loadPublicConfig();
    supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    const { data: { session } } = await supabaseClient.auth.getSession();
    const expired = await enforceSessionMaxAge(session || null);
    authReady = true;
    currentUser = !expired && session && session.user ? session.user : null;
    accessToken = !expired && session && session.access_token ? session.access_token : '';
    render();

    supabaseClient.auth.onAuthStateChange(async (_event, nextSession) => {
      const nextExpired = await enforceSessionMaxAge(nextSession || null);
      currentUser = !nextExpired && nextSession && nextSession.user ? nextSession.user : null;
      accessToken = !nextExpired && nextSession && nextSession.access_token ? nextSession.access_token : '';
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

  async function getValidAccessToken(){
    if(!supabaseClient) return '';
    const { data: { session } } = await supabaseClient.auth.getSession();
    const expired = await enforceSessionMaxAge(session || null);
    if(expired || !session || !session.access_token){
      currentUser = null;
      accessToken = '';
      render();
      return '';
    }
    currentUser = session.user || null;
    accessToken = session.access_token || '';
    return accessToken;
  }

  async function startCheckout(program){
    errorMessage = '';
    render();

    const token = await getValidAccessToken();
    if(!currentUser || !token){
      await signInGoogle(program.id);
      return;
    }

    try {
      const response = await fetch('/.netlify/functions/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token
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