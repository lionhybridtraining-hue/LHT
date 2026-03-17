(function(){
  function getSlug(){
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get('post');
    if(fromQuery) return decodeURIComponent(fromQuery);
    const m = window.location.pathname.match(/^\/blog\/([^\/?#]+)\/?$/);
    if(m && m[1]) return decodeURIComponent(m[1]);
    return null;
  }
  function formatDate(iso){
    try{
      const d = new Date(iso);
      const fmt = new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' });
      const str = fmt.format(d);
      return str.charAt(0).toUpperCase() + str.slice(1);
    }catch(e){
      return iso;
    }
  }

  async function fetchArticleBySlug(slug){
    const res = await fetch(`/.netlify/functions/blog-articles?slug=${encodeURIComponent(slug)}`, { cache: 'no-cache' });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data && data.article ? data.article : null;
  }

  async function load(){
    const slug = getSlug();
    const titleEl = document.getElementById('post-title');
    const dateEl = document.getElementById('post-date');
    const catEl = document.getElementById('post-category');
    const contentEl = document.getElementById('post-content');

    if(!slug){
      titleEl.textContent = 'Artigo não encontrado';
      contentEl.innerHTML = '<p>Parâmetro ausente. Volta à <a href="blog.html">lista de artigos</a>.</p>';
      return;
    }

    try{
      const article = await fetchArticleBySlug(slug);
      if(!article) throw new Error('Conteudo nao encontrado');

      const date = article.publishedAt || article.createdAt || '';
      titleEl.textContent = article.title || 'Artigo';
      document.title = `${titleEl.textContent} — Lion Hybrid Training`;
      if(date){
        dateEl.setAttribute('datetime', date);
        dateEl.textContent = formatDate(date);
      }
      catEl.textContent = article.category || '';

      const conv = new showdown.Converter({
        tables: true,
        simplifiedAutoLink: true,
        strikethrough: true,
        tasklists: true
      });
      contentEl.innerHTML = conv.makeHtml(article.content || '');

      // Track article view with consent-aware Meta Pixel / GA4
      try{
        const consent = localStorage.getItem('lht_consent');
        const title = (titleEl.textContent||'').trim();
        const params = {
          content_name: title || slug || 'Artigo',
          content_category: 'Blog',
          content_ids: slug ? [slug] : undefined,
          content_type: 'article'
        };
        if(consent === 'accepted'){
          if(typeof window.fbq === 'function'){
            window.fbq('track','ViewContent', params);
          }
          if(typeof window.gtag === 'function'){
            window.gtag('event','ViewContent', params);
          }
        }
      }catch(_e){}
    }catch(err){
      console.error(err);
      titleEl.textContent = 'Artigo';
      contentEl.innerHTML = '<p>Nao foi possivel carregar este artigo a partir da base de dados.</p>';
    }
  }

  document.addEventListener('DOMContentLoaded', load);
})();
