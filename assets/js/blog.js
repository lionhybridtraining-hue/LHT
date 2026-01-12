(function(){
  function formatDate(iso){
    try{
      const d = new Date(iso);
      const fmt = new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' });
      const str = fmt.format(d); // ex: "11 de janeiro de 2026"
      return str.charAt(0).toUpperCase() + str.slice(1);
    }catch(e){
      return iso;
    }
  }

  async function fetchJson(url){
    const res = await fetch(url, { cache: 'no-cache' });
    if(!res.ok) return null;
    return res.json();
  }

  function normalizeList(data){
    if(Array.isArray(data)) return data;
    if(data && Array.isArray(data.items)) return data.items;
    if(data && Array.isArray(data.posts)) return data.posts;
    return [];
  }

  function mergePosts(indexPosts, apiPosts){
    const bySlug = new Map();
    apiPosts.forEach(p=> { if(p && p.slug) bySlug.set(p.slug, p); });

    const used = new Set();
    const merged = [];

    // Keep curated order from posts.json, but fill missing fields from API
    indexPosts.forEach(p=>{
      if(!p || !p.slug) return;
      const fromApi = bySlug.get(p.slug) || {};
      used.add(p.slug);
      merged.push({
        ...fromApi,
        ...p
      });
    });

    // Append any new posts not yet in posts.json
    apiPosts.forEach(p=>{
      if(!p || !p.slug) return;
      if(used.has(p.slug)) return;
      merged.push(p);
    });

    return merged;
  }

  async function fetchPosts(){
    let apiPosts = [];
    let indexPosts = [];

    try{
      apiPosts = normalizeList(await fetchJson('/api/posts'));
    }catch(e){}

    try{
      // Use absolute path so clean URL "/blog" doesn't resolve to "/blog/blog/posts.json"
      indexPosts = normalizeList(await fetchJson('/blog/posts.json'));
    }catch(e){}

    if(indexPosts.length && apiPosts.length) return mergePosts(indexPosts, apiPosts);
    if(apiPosts.length) return apiPosts;
    if(indexPosts.length) return indexPosts;
    return [];
  }

  function createCard(post){
    const article = document.createElement('article');
    article.className = 'article-card';

    const a = document.createElement('a');
    a.className = 'card-link';
    a.href = `artigo.html?post=${encodeURIComponent(post.slug)}`;
    a.setAttribute('aria-label', `Ler artigo: ${post.title}`);
    article.appendChild(a);

    const meta = document.createElement('div');
    meta.className = 'article-meta';
    const time = document.createElement('time');
    time.setAttribute('datetime', post.date);
    time.textContent = formatDate(post.date);
    const cat = document.createElement('span');
    cat.className = 'category';
    cat.textContent = post.category || 'Artigo';
    meta.appendChild(time);
    meta.appendChild(cat);
    article.appendChild(meta);

    const h3 = document.createElement('h3');
    h3.className = 'article-title';
    h3.textContent = post.title;
    article.appendChild(h3);

    if(post.excerpt){
      const p = document.createElement('p');
      p.className = 'article-excerpt';
      p.textContent = post.excerpt;
      article.appendChild(p);
    }

    const span = document.createElement('span');
    span.className = 'read-more';
    span.setAttribute('aria-hidden','true');
    span.textContent = 'Ler artigo →';
    article.appendChild(span);

    return article;
  }

  async function load(){
    const grid = document.getElementById('articles-grid');
    if(!grid) return;
    try{
      const posts = await fetchPosts();

      // sort by date desc
      posts.sort((a,b)=> (a.date>b.date?-1: a.date<b.date?1:0));

      if(!posts.length){
        const empty = document.createElement('div');
        empty.className = 'article-card coming-soon';
        const h3 = document.createElement('h3');
        h3.className='article-title';
        h3.textContent = 'Ainda sem artigos';
        const p = document.createElement('p');
        p.className='article-excerpt';
        p.textContent = 'Publica um novo post no Admin para aparecer aqui.';
        empty.appendChild(h3);
        empty.appendChild(p);
        grid.appendChild(empty);
        return;
      }

      const frag = document.createDocumentFragment();
      posts.forEach(post=> frag.appendChild(createCard(post)));
      grid.innerHTML = '';
      grid.appendChild(frag);
    }catch(err){
      console.error(err);
      const error = document.createElement('div');
      error.className = 'article-card coming-soon';
      const h3 = document.createElement('h3');
      h3.className='article-title';
      h3.textContent = 'Erro a carregar artigos';
      const p = document.createElement('p');
      p.className='article-excerpt';
      p.textContent = 'Tenta recarregar a página ou confirma que existe conteúdo em blog/posts.';
      error.appendChild(h3);
      error.appendChild(p);
      document.getElementById('articles-grid')?.appendChild(error);
    }
  }

  document.addEventListener('DOMContentLoaded', load);
})();
