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
  }
  function closeMindset(){
    if(!mindsetVideo) return;
    mindsetVideo.pause();
    mindsetModal.hidden = true;
    mindsetModal.setAttribute('aria-hidden','true');
    document.body.style.overflow = '';
  }

  // Eventos de estado
  if(mindsetVideo){
    mindsetVideo.addEventListener('loadedmetadata', ()=>{
      if(fallback) fallback.hidden = true;
    });
    mindsetVideo.addEventListener('error', ()=>{
      if(fallback) fallback.hidden = false;
    });
    mindsetVideo.addEventListener('ended', ()=>{
      // mantém em pausa ao terminar (não loop)
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
