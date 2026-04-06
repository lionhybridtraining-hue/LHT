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
  let stripeInstance = null;
  let stripeElements = null;
  let paymentElement = null;
  let checkoutProgram = null;
  let checkoutClientSecret = '';
  let checkoutPaymentIntentId = '';
  let checkoutSubscriptionId = '';
  let checkoutBusy = false;
  let appliedCoupon = null;
  let selectedInterval = '';
  let lastSelectedProgramId = '';

  function animateDetailHeight(detail, fromHeight, toHeight){
    if(!detail || !fromHeight || !toHeight || fromHeight === toHeight) return;
    detail.style.overflow = 'hidden';
    detail.style.height = fromHeight + 'px';
    detail.getBoundingClientRect();
    detail.style.transition = 'height 460ms cubic-bezier(0.22, 1, 0.36, 1)';
    detail.style.height = toHeight + 'px';

    window.setTimeout(function(){
      detail.style.transition = '';
      detail.style.height = '';
      detail.style.overflow = '';
    }, 500);
  }

  function getQuery(){
    return new URLSearchParams(window.location.search);
  }

  function normalizeProgramIdFromPath(){
    var path = String(window.location.pathname || '');
    var clean = path.replace(/\/+$/, '');
    var match = clean.match(/\/programas\/([^/?#]+)/i);
    return match && match[1] ? decodeURIComponent(match[1]) : '';
  }

  function getSelectedProgramId(){
    return getQuery().get('program_id') || normalizeProgramIdFromPath() || '';
  }

  function buildProgramDetailUrl(programId){
    if(!programId) return '/programas';
    return '/programas?program_id=' + encodeURIComponent(programId);
  }

  function openProgramInline(programId, options){
    var detailUrl = buildProgramDetailUrl(programId);
    var method = options && options.replace ? 'replaceState' : 'pushState';
    window.history[method]({}, '', detailUrl);
    render();
  }

  function closeProgramInline(options){
    var method = options && options.replace ? 'replaceState' : 'pushState';
    window.history[method]({}, '', '/programas');
    render();
  }

  function normalizePlainText(value, fallback){
    var raw = String(value == null ? '' : value).trim();
    if(!raw) return fallback || '';

    var cleaned = raw
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/(p|div|li|ul|ol|h[1-6]|blockquote|section|article)>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/\s+/g, ' ')
      .trim();

    return cleaned || fallback || '';
  }

  function truncateSummary(value, maxChars){
    var text = String(value || '').trim();
    if(!text || text.length <= maxChars) return text;
    var shortened = text.slice(0, maxChars).replace(/\s+\S*$/, '').trim();
    return (shortened || text.slice(0, maxChars)).trim() + '...';
  }

  function escapeHtml(value){
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function sanitizeTechnicalHtml(value, fallback){
    var raw = String(value == null ? '' : value).trim();
    if(!raw){
      return escapeHtml(fallback || 'Detalhes técnicos indisponíveis para este programa no momento.');
    }

    var hasHtml = /<\/?[a-z][\s\S]*>/i.test(raw);
    if(!hasHtml){
      return escapeHtml(raw).replace(/\r?\n/g, '<br>');
    }

    var allowed = new Set(['p', 'br', 'strong', 'em', 'b', 'i', 'u', 'ul', 'ol', 'li', 'h3', 'h4', 'blockquote', 'div', 'span']);
    var cleaned = raw
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<!--([\s\S]*?)-->/g, '')
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/\s(href|src)\s*=\s*("\s*javascript:[^"]*"|'\s*javascript:[^']*'|\s*javascript:[^\s>]+)/gi, '')
      .replace(/<\/?([a-z0-9-]+)([^>]*)>/gi, function(match, tag){
        var normalizedTag = String(tag || '').toLowerCase();
        if(!allowed.has(normalizedTag)) return '';
        if(/^<\//.test(match)) return '</' + normalizedTag + '>';
        if(normalizedTag === 'br') return '<br>';
        return '<' + normalizedTag + '>';
      })
      .trim();

    return cleaned || escapeHtml(fallback || 'Detalhes técnicos indisponíveis para este programa no momento.');
  }

  function programCommercialDescription(program){
    var plain = normalizePlainText(
      program && (program.commercialDescription || program.description),
      'Programa ativo na plataforma Lion Hybrid Training.'
    );
    return truncateSummary(plain, 170);
  }

  function programTechnicalDescription(program){
    return sanitizeTechnicalHtml(
      program && (program.technicalDescription || program.description),
      'Detalhes técnicos indisponíveis para este programa no momento.'
    );
  }

  function formatProgramAvailability(value){
    var normalized = String(value || '').trim();
    if(!normalized) return 'Acesso imediato';
    if(!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
    try {
      return new Intl.DateTimeFormat('pt-PT', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      }).format(new Date(normalized + 'T00:00:00'));
    } catch(_err){
      return normalized;
    }
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
      stripePublishableKey: payload.stripePublishableKey || '',
      authMaxSessionSeconds: Number(payload.authMaxSessionSeconds) || DEFAULT_AUTH_MAX_SESSION_SECONDS
    };
    return publicConfig;
  }

  function getCheckoutNodes(){
    return {
      overlay: document.getElementById('checkout-overlay'),
      close: document.getElementById('checkout-close'),
      billingLabel: document.getElementById('checkout-billing-label'),
      name: document.getElementById('checkout-program-name'),
      price: document.getElementById('checkout-price'),
      summary: document.getElementById('checkout-program-summary'),
      pe: document.getElementById('checkout-payment-element'),
      error: document.getElementById('checkout-error'),
      processing: document.getElementById('checkout-processing'),
      submit: document.getElementById('checkout-submit'),
      submitText: document.getElementById('checkout-submit-text'),
      spinner: document.getElementById('checkout-spinner'),
      intervalContainer: document.getElementById('checkout-interval-container'),
      intervalOptions: document.getElementById('checkout-interval-options'),
      couponRow: document.getElementById('checkout-coupon-row'),
      couponInput: document.getElementById('checkout-coupon-input'),
      couponApply: document.getElementById('checkout-coupon-apply'),
      couponFeedback: document.getElementById('checkout-coupon-feedback')
    };
  }

  function setCheckoutError(message){
    const nodes = getCheckoutNodes();
    if(!nodes.error) return;
    if(message){
      nodes.error.hidden = false;
      nodes.error.textContent = message;
    } else {
      nodes.error.hidden = true;
      nodes.error.textContent = '';
    }
  }

  function setCheckoutBusy(nextBusy){
    checkoutBusy = !!nextBusy;
    const nodes = getCheckoutNodes();
    if(!nodes.submit || !nodes.submitText || !nodes.spinner) return;
    nodes.submit.disabled = checkoutBusy;
    nodes.submitText.textContent = checkoutBusy ? 'A processar...' : 'Pagar';
    nodes.spinner.hidden = !checkoutBusy;
  }

  function initStripe(){
    if(stripeInstance) return stripeInstance;
    if(!window.Stripe){
      throw new Error('Stripe.js indisponivel no browser.');
    }
    if(!publicConfig || !publicConfig.stripePublishableKey){
      throw new Error('Missing STRIPE_PUBLISHABLE_KEY');
    }
    stripeInstance = window.Stripe(publicConfig.stripePublishableKey);
    return stripeInstance;
  }

  function destroyPaymentElement(){
    if(paymentElement){
      paymentElement.unmount();
      paymentElement.destroy();
      paymentElement = null;
    }
    stripeElements = null;
  }

  function setCouponFeedback(message, type){
    const nodes = getCheckoutNodes();
    if(!nodes.couponFeedback) return;
    if(message){
      nodes.couponFeedback.hidden = false;
      nodes.couponFeedback.textContent = message;
      nodes.couponFeedback.className = 'checkout-coupon-feedback ' + (type || '');
    } else {
      nodes.couponFeedback.hidden = true;
      nodes.couponFeedback.textContent = '';
      nodes.couponFeedback.className = 'checkout-coupon-feedback';
    }
  }

  function buildIntervalOptions(program){
    const nodes = getCheckoutNodes();
    if(!nodes.intervalContainer || !nodes.intervalOptions) return;

    const prices = program.prices || {};
    const intervals = [];
    if(prices.monthly != null) intervals.push({ key: 'monthly', label: 'Mensal', cents: prices.monthly });
    if(prices.quarterly != null) intervals.push({ key: 'quarterly', label: 'Trimestral', cents: prices.quarterly });
    if(prices.annual != null) intervals.push({ key: 'annual', label: 'Anual', cents: prices.annual });

    if(intervals.length <= 1){
      nodes.intervalContainer.hidden = true;
      selectedInterval = intervals.length === 1 ? intervals[0].key : '';
      return;
    }

    nodes.intervalOptions.innerHTML = '';
    intervals.forEach(function(opt, i){
      var label = document.createElement('label');
      var radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'checkout-interval';
      radio.value = opt.key;
      if(i === 0) radio.checked = true;
      radio.addEventListener('change', function(){
        selectedInterval = opt.key;
        updateDisplayedPrice();
      });
      label.appendChild(radio);
      var span1 = document.createElement('span');
      span1.className = 'interval-label';
      span1.textContent = opt.label;
      label.appendChild(span1);
      var span2 = document.createElement('span');
      span2.className = 'interval-price';
      span2.textContent = formatPrice(opt.cents, program.currency);
      label.appendChild(span2);
      nodes.intervalOptions.appendChild(label);
    });

    selectedInterval = intervals[0].key;
    nodes.intervalContainer.hidden = false;
  }

  function getEffectivePriceCents(){
    if(!checkoutProgram) return 0;
    var prices = checkoutProgram.prices || {};
    var base = 0;
    if(selectedInterval && prices[selectedInterval] != null){
      base = prices[selectedInterval];
    } else {
      base = checkoutProgram.priceCents || 0;
    }
    if(appliedCoupon && appliedCoupon.amountOff){
      base = Math.max(0, base - appliedCoupon.amountOff);
    } else if(appliedCoupon && appliedCoupon.percentOff){
      base = Math.round(base * (1 - appliedCoupon.percentOff / 100));
    }
    return base;
  }

  function updateDisplayedPrice(){
    var nodes = getCheckoutNodes();
    if(!nodes.price || !checkoutProgram) return;
    var cents = getEffectivePriceCents();
    var label = formatPrice(cents, checkoutProgram.currency);
    if(appliedCoupon){
      label += ' (desconto aplicado)';
    }
    nodes.price.textContent = label;
  }

  async function applyCoupon(){
    var nodes = getCheckoutNodes();
    var code = (nodes.couponInput ? nodes.couponInput.value : '').trim();
    if(!code){
      setCouponFeedback('Insere um codigo de desconto.', 'error');
      return;
    }
    setCouponFeedback('');
    if(nodes.couponApply) nodes.couponApply.disabled = true;

    try {
      var token = await getValidAccessToken();
      if(!token) throw new Error('Sessao expirada.');
      var response = await fetch('/.netlify/functions/validate-coupon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ coupon_code: code, program_id: checkoutProgram ? checkoutProgram.id : '' })
      });
      var payload = await response.json().catch(function(){ return {}; });
      if(!response.ok) throw new Error((payload && payload.error) || 'Cupao invalido.');
      appliedCoupon = {
        code: code,
        promoId: payload.promoId || '',
        couponId: payload.couponId || '',
        amountOff: payload.amountOff || 0,
        percentOff: payload.percentOff || 0,
        name: payload.name || ''
      };
      var msg = appliedCoupon.name || code;
      if(appliedCoupon.percentOff) msg += ' (-' + appliedCoupon.percentOff + '%)';
      else if(appliedCoupon.amountOff) msg += ' (-' + formatPrice(appliedCoupon.amountOff, checkoutProgram ? checkoutProgram.currency : 'EUR') + ')';
      setCouponFeedback(msg, 'success');
      updateDisplayedPrice();
    } catch(err){
      appliedCoupon = null;
      setCouponFeedback(err.message || 'Cupao invalido.', 'error');
      updateDisplayedPrice();
    } finally {
      if(nodes.couponApply) nodes.couponApply.disabled = false;
    }
  }

  async function createPaymentIntentForModal(program){
    var token = await getValidAccessToken();
    if(!currentUser || !token){
      await signInGoogle(program.id);
      return null;
    }

    var body = {
      program_id: program.id,
      event_source_url: window.location.href
    };
    if(selectedInterval) body.billing_interval = selectedInterval;
    if(appliedCoupon && appliedCoupon.code) body.coupon_code = appliedCoupon.code;

    var response = await fetch('/.netlify/functions/create-payment-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(body)
    });
    var payload = await response.json();
    if(!response.ok){
      throw new Error((payload && payload.error) ? payload.error : 'Nao foi possivel iniciar checkout.');
    }
    if(!payload.clientSecret){
      throw new Error('Checkout sem client secret.');
    }
    return payload;
  }

  function mountPaymentElement(clientSecret){
    var stripe = initStripe();
    destroyPaymentElement();
    stripeElements = stripe.elements({
      clientSecret: clientSecret,
      appearance: {
        theme: 'night',
        variables: {
          colorPrimary: '#d4a54f',
          colorBackground: '#111111',
          colorText: '#f5f1e8',
          colorDanger: '#ff7d7d'
        }
      }
    });

    var peOptions = {};
    if(currentUser && currentUser.email){
      peOptions.defaultValues = { billingDetails: { email: currentUser.email } };
    }
    paymentElement = stripeElements.create('payment', peOptions);
    var nodes = getCheckoutNodes();
    paymentElement.mount(nodes.pe);
    paymentElement.on('change', function(event){
      if(event.complete){
        if(nodes.submit) nodes.submit.disabled = checkoutBusy;
      } else {
        if(nodes.submit) nodes.submit.disabled = true;
      }
    });
  }

  function openCheckoutModal(program, checkoutData){
    var nodes = getCheckoutNodes();
    if(!nodes.overlay || !nodes.billingLabel || !nodes.name || !nodes.price || !nodes.pe){
      throw new Error('Checkout modal indisponivel na pagina.');
    }

    checkoutProgram = program;
    checkoutClientSecret = checkoutData.clientSecret || '';
    checkoutPaymentIntentId = checkoutData.paymentIntentId || '';
    checkoutSubscriptionId = checkoutData.subscriptionId || '';
    appliedCoupon = null;
    selectedInterval = '';

    nodes.billingLabel.textContent = program.billingType === 'recurring' ? 'Subscricao' : 'Pagamento unico';
    nodes.name.textContent = program.name;
    nodes.price.textContent = formatPrice(program.priceCents, program.currency);
    if(nodes.summary){
      nodes.summary.textContent = programCommercialDescription(program);
    }
    setCheckoutError('');
    if(nodes.processing) nodes.processing.hidden = true;

    buildIntervalOptions(program);

    if(nodes.couponRow) nodes.couponRow.hidden = false;
    if(nodes.couponInput) nodes.couponInput.value = '';
    setCouponFeedback('');

    mountPaymentElement(checkoutClientSecret);

    nodes.overlay.hidden = false;
    document.body.classList.add('checkout-open');
    setCheckoutBusy(false);
    if(nodes.submit) nodes.submit.disabled = true;
  }

  function closeCheckoutModal(){
    var nodes = getCheckoutNodes();
    destroyPaymentElement();
    checkoutProgram = null;
    checkoutClientSecret = '';
    checkoutPaymentIntentId = '';
    checkoutSubscriptionId = '';
    appliedCoupon = null;
    selectedInterval = '';
    setCheckoutBusy(false);
    setCheckoutError('');
    setCouponFeedback('');
    if(nodes.processing) nodes.processing.hidden = true;
    if(nodes.intervalContainer) nodes.intervalContainer.hidden = true;
    if(nodes.couponRow) nodes.couponRow.hidden = true;
    if(nodes.overlay) nodes.overlay.hidden = true;
    document.body.classList.remove('checkout-open');
  }

  async function handleCheckoutSubmit(){
    if(checkoutBusy || !checkoutClientSecret || !checkoutProgram || !stripeElements){
      return;
    }

    try {
      setCheckoutError('');
      setCheckoutBusy(true);
      var nodes = getCheckoutNodes();
      var stripe = initStripe();
      var returnUrl = window.location.origin + '/onboarding?program_id=' + encodeURIComponent(checkoutProgram.id) + '&payment_intent=' + encodeURIComponent(checkoutPaymentIntentId);

      var result = await stripe.confirmPayment({
        elements: stripeElements,
        confirmParams: {
          return_url: returnUrl,
          payment_method_data: {
            billing_details: {
              email: (currentUser && currentUser.email) ? currentUser.email : undefined
            }
          }
        },
        redirect: 'if_required'
      });

      if(result.error){
        throw new Error(result.error.message || 'Nao foi possivel confirmar o pagamento.');
      }

      var pi = result.paymentIntent;
      if(!pi){
        throw new Error('Pagamento sem resposta valida do Stripe.');
      }

      if(pi.status === 'succeeded'){
        window.location.href = returnUrl;
        return;
      }

      if(pi.status === 'processing'){
        if(nodes.processing) nodes.processing.hidden = false;
        if(nodes.submit) nodes.submit.hidden = true;
        return;
      }

      if(pi.status === 'requires_payment_method'){
        throw new Error('O metodo de pagamento foi recusado. Tenta com outro cartao ou metodo.');
      }

      if(pi.status === 'requires_action'){
        // Delayed payment methods (Multibanco, etc.) – voucher was shown inline
        if(nodes.processing){
          nodes.processing.textContent = 'Referências geradas. Consulta o teu email para os detalhes de pagamento. O acesso será ativado automaticamente após o pagamento.';
          nodes.processing.hidden = false;
        }
        if(nodes.submit) nodes.submit.hidden = true;
        return;
      }

      throw new Error('Estado de pagamento inesperado: ' + pi.status);
    } catch (err) {
      setCheckoutError(err.message || 'Nao foi possivel concluir o pagamento.');
    } finally {
      setCheckoutBusy(false);
    }
  }

  function getSessionIssuedAt(session){
    return session && session.user
      ? (session.user.last_sign_in_at || session.user.created_at || null)
      : null;
  }

  function isSessionOverMaxAge(session){
    var issuedAt = getSessionIssuedAt(session);
    if(!issuedAt) return false;
    var issuedMs = new Date(issuedAt).getTime();
    if(!Number.isFinite(issuedMs)) return false;
    var maxAge = publicConfig && publicConfig.authMaxSessionSeconds
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
    var root = document.getElementById('programs-app');
    var detail = document.getElementById('program-detail');
    var hadVisibleDetail = Boolean(detail && !detail.hidden && detail.childElementCount > 0);
    var previousDetailHeight = hadVisibleDetail ? detail.offsetHeight : 0;
    var previousSelectedProgramId = lastSelectedProgramId;
    if(!root) return;
    root.innerHTML = '';
    if(detail){
      detail.classList.remove('animate-slide-in');
      detail.style.transition = '';
      detail.style.height = '';
      detail.style.overflow = '';
      detail.innerHTML = '';
      detail.hidden = true;
    }

    var auth = document.getElementById('programs-auth');
    if(auth){
      auth.textContent = !authReady
        ? 'A preparar autenticacao...'
        : currentUser
          ? 'Ligado: ' + (currentUser.email || currentUser.id)
          : 'Nao autenticado';
    }

    if(errorMessage){
      var error = document.createElement('div');
      error.className = 'notice error';
      error.textContent = errorMessage;
      root.appendChild(error);
    }

    if(getQuery().get('checkout') === 'cancelled'){
      var notice = document.createElement('div');
      notice.className = 'notice';
      notice.textContent = 'Checkout cancelado. Podes retomar quando quiseres.';
      root.appendChild(notice);
    }

    if(loadingPrograms){
      var loading = document.createElement('div');
      loading.className = 'notice';
      loading.textContent = 'A carregar programas...';
      root.appendChild(loading);
      return;
    }

    if(!programs.length){
      var empty = document.createElement('div');
      empty.className = 'notice';
      empty.textContent = 'Nao existem programas ativos neste momento.';
      root.appendChild(empty);
      return;
    }

    var selectedProgramId = getSelectedProgramId();
    var selectedProgram = null;
    programs.forEach(function(program){
      var card = document.createElement('article');
      card.className = 'program-card' + (selectedProgramId === program.id ? ' selected' : '');
      card.id = 'program-card-' + program.id;
      card.setAttribute('role', 'link');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', 'Ver detalhes de ' + (program.name || 'programa'));
      var detailUrl = buildProgramDetailUrl(program.id);

      function isInteractiveTarget(event){
        var target = event && event.target;
        return Boolean(target && target.closest && target.closest('a, button, input, select, textarea, label'));
      }

      card.addEventListener('click', function(event){
        if(isInteractiveTarget(event)) return;
        openProgramInline(program.id);
      });

      card.addEventListener('keydown', function(event){
        if(event.key !== 'Enter' && event.key !== ' ') return;
        if(isInteractiveTarget(event)) return;
        event.preventDefault();
        openProgramInline(program.id);
      });

      if(selectedProgramId === program.id) selectedProgram = program;

      if(program.imageUrl){
        var visual = document.createElement('div');
        visual.className = 'program-card-visual';
        var image = document.createElement('img');
        image.className = 'program-card-image';
        image.src = program.imageUrl;
        image.alt = (program.name || 'Programa LHT') + ' - imagem';
        image.loading = 'lazy';
        image.decoding = 'async';
        visual.appendChild(image);
        card.appendChild(visual);
      }

      var eyebrow = document.createElement('div');
      eyebrow.className = 'eyebrow';
      eyebrow.textContent = program.billingType === 'recurring' ? 'Subscricao' : 'Pagamento unico';
      card.appendChild(eyebrow);

      var title = document.createElement('h2');
      title.textContent = program.name;
      card.appendChild(title);

      var description = document.createElement('p');
      description.className = 'description';
      description.textContent = programCommercialDescription(program);
      card.appendChild(description);

      var meta = document.createElement('div');
      meta.className = 'meta';
      meta.innerHTML = '<span>' + escapeHtml(formatProgramPriceSummary(program)) + '</span><span>' + program.durationWeeks + ' semanas</span><span>' + escapeHtml(formatProgramAvailability(program.startDate)) + '</span>';
      card.appendChild(meta);

      var actions = document.createElement('div');
      actions.className = 'actions';
      var details = document.createElement('a');
      details.className = 'btn secondary program-card-link';
      details.textContent = 'Ver detalhes';
      details.href = detailUrl;
      details.addEventListener('click', function(event){
        event.preventDefault();
        openProgramInline(program.id);
      });
      actions.appendChild(details);
      var buy = document.createElement('button');
      buy.className = 'btn';
      buy.textContent = currentUser ? 'Comprar acesso' : 'Entrar e continuar';
      buy.addEventListener('click', function(){ startCheckout(program); });
      actions.appendChild(buy);
      card.appendChild(actions);
      root.appendChild(card);
    });

    if(detail && selectedProgram){
      var kicker = document.createElement('p');
      kicker.className = 'program-detail-kicker';
      kicker.textContent = 'Detalhe técnico do programa';
      detail.appendChild(kicker);

      var detailTitle = document.createElement('h3');
      detailTitle.className = 'program-detail-title';
      detailTitle.textContent = selectedProgram.name || 'Programa LHT';
      detail.appendChild(detailTitle);

      var detailMeta = document.createElement('div');
      detailMeta.className = 'meta';
      detailMeta.innerHTML = '<span>' + escapeHtml(formatProgramPriceSummary(selectedProgram)) + '</span><span>' + selectedProgram.durationWeeks + ' semanas</span><span>' + escapeHtml(formatProgramAvailability(selectedProgram.startDate)) + '</span>';
      detail.appendChild(detailMeta);

      var detailCopy = document.createElement('div');
      detailCopy.className = 'program-detail-copy';
      detailCopy.innerHTML = programTechnicalDescription(selectedProgram);
      detail.appendChild(detailCopy);

      var detailActions = document.createElement('div');
      detailActions.className = 'program-detail-actions';

      var backToCatalog = document.createElement('a');
      backToCatalog.className = 'btn secondary';
      backToCatalog.href = '/programas';
      backToCatalog.textContent = 'Voltar ao catálogo';
      backToCatalog.addEventListener('click', function(event){
        event.preventDefault();
        closeProgramInline();
      });
      detailActions.appendChild(backToCatalog);

      var openCheckout = document.createElement('button');
      openCheckout.className = 'btn';
      openCheckout.textContent = currentUser ? 'Comprar acesso' : 'Entrar e continuar';
      openCheckout.addEventListener('click', function(){ startCheckout(selectedProgram); });
      detailActions.appendChild(openCheckout);

      detail.appendChild(detailActions);
      detail.hidden = false;

      var isFirstLoad = !previousSelectedProgramId;
      var switchedProgram = previousSelectedProgramId && previousSelectedProgramId !== selectedProgramId;

      if(isFirstLoad){
        detail.classList.add('animate-slide-in');
      } else if(hadVisibleDetail && switchedProgram){
        animateDetailHeight(detail, previousDetailHeight, detail.scrollHeight);
      }

      lastSelectedProgramId = selectedProgramId;
    } else {
      lastSelectedProgramId = '';
    }

    if(selectedProgramId){
      var selectedNode = document.getElementById('program-card-' + selectedProgramId);
      if(selectedNode){
        selectedNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      if(detail && !detail.hidden){
        detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }

  function formatPrice(priceCents, currency){
    return new Intl.NumberFormat('pt-PT', {
      style: 'currency',
      currency: currency || 'EUR'
    }).format((Number(priceCents) || 0) / 100);
  }

  function formatProgramPriceSummary(program){
    if(!program) return formatPrice(0, 'EUR');
    if(program.billingType !== 'recurring') return formatPrice(program.priceCents, program.currency);

    var prices = program.prices || {};
    var parts = [];
    if(prices.monthly != null) parts.push(formatPrice(prices.monthly, program.currency) + '/mês');
    if(prices.quarterly != null) parts.push(formatPrice(prices.quarterly, program.currency) + '/trim');
    if(prices.annual != null) parts.push(formatPrice(prices.annual, program.currency) + '/ano');
    if(!parts.length) return formatPrice(program.priceCents, program.currency);
    return parts.join(' · ');
  }

  async function initializeAuth(){
    var attempts = 0;
    while(!window.supabase && attempts < 50){
      await new Promise(function(resolve){ setTimeout(resolve, 100); });
      attempts++;
    }
    if(!window.supabase){
      authReady = true;
      errorMessage = 'Supabase indisponivel no browser.';
      render();
      return;
    }

    var config = await loadPublicConfig();
    supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    var sessionResult = await supabaseClient.auth.getSession();
    var session = sessionResult.data.session;
    var expired = await enforceSessionMaxAge(session || null);
    authReady = true;
    currentUser = !expired && session && session.user ? session.user : null;
    accessToken = !expired && session && session.access_token ? session.access_token : '';
    render();

    supabaseClient.auth.onAuthStateChange(async function(_event, nextSession){
      var nextExpired = await enforceSessionMaxAge(nextSession || null);
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
      var response = await fetch('/.netlify/functions/list-programs');
      var payload = await response.json();
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
    var redirect = window.location.origin + (programId ? buildProgramDetailUrl(programId) : '/programas');
    var result = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirect }
    });
    if(result.error) alert(result.error.message || 'Erro ao iniciar login Google.');
  }

  async function getValidAccessToken(){
    if(!supabaseClient) return '';
    var sessionResult = await supabaseClient.auth.getSession();
    var session = sessionResult.data.session;
    var expired = await enforceSessionMaxAge(session || null);
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

    try {
      var payload = await createPaymentIntentForModal(program);
      if(!payload) return;
      openCheckoutModal(payload.program || program, payload);
    } catch (err) {
      errorMessage = err.message || 'Nao foi possivel iniciar checkout.';
      render();
    }
  }

  function bindCheckoutEvents(){
    var nodes = getCheckoutNodes();
    if(nodes.close){
      nodes.close.addEventListener('click', closeCheckoutModal);
    }
    if(nodes.overlay){
      nodes.overlay.addEventListener('click', function(event){
        if(event.target === nodes.overlay && !checkoutBusy){
          closeCheckoutModal();
        }
      });
    }
    if(nodes.submit){
      nodes.submit.addEventListener('click', handleCheckoutSubmit);
    }
    if(nodes.couponApply){
      nodes.couponApply.addEventListener('click', applyCoupon);
    }
    if(nodes.couponInput){
      nodes.couponInput.addEventListener('keydown', function(e){
        if(e.key === 'Enter'){ e.preventDefault(); applyCoupon(); }
      });
    }
    document.addEventListener('keydown', function(event){
      if(event.key === 'Escape'){
        var overlay = getCheckoutNodes().overlay;
        if(overlay && !overlay.hidden && !checkoutBusy){
          closeCheckoutModal();
        }
      }
    });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ render(); bindCheckoutEvents(); initializeAuth(); loadPrograms(); });
  } else {
    render(); bindCheckoutEvents(); initializeAuth(); loadPrograms();
  }

  window.addEventListener('popstate', function(){
    render();
  });
})();