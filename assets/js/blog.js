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
      const res = await fetch('blog/posts.json', { cache: 'no-cache' });
      if(!res.ok) throw new Error('Falha a carregar posts.json');
      let posts = await res.json();
      if(!Array.isArray(posts)){
        if(Array.isArray(posts.posts)) posts = posts.posts;
        else if(Array.isArray(posts.items)) posts = posts.items;
        else posts = [];
      }

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
        p.textContent = 'Adiciona um novo post para aparecer aqui.';
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
      p.textContent = 'Verifica o ficheiro blog/posts.json.';
      error.appendChild(h3);
      error.appendChild(p);
      document.getElementById('articles-grid')?.appendChild(error);
    }
  }

  document.addEventListener('DOMContentLoaded', load);
})();