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

  async function fetchPostsMeta(){
    const candidates = [
      '/blog/posts.json'
    ];

    for(const url of candidates){
      try{
        const res = await fetch(url, { cache: 'no-cache' });
        if(!res.ok) continue;
        let data = await res.json();
        if(Array.isArray(data)) return data;
        if(data && Array.isArray(data.items)) return data.items;
        if(data && Array.isArray(data.posts)) return data.posts;
      }catch(e){
        // try next
      }
    }
    return [];
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
      // Load metadata
      const posts = await fetchPostsMeta();
      const meta = posts.find(p=> p.slug === slug);
      if(meta){
        titleEl.textContent = meta.title;
        document.title = `${meta.title} — Lion Hybrid Training`;
        dateEl.setAttribute('datetime', meta.date);
        dateEl.textContent = formatDate(meta.date);
        catEl.textContent = meta.category || '';
      }

      // Load markdown
      const mdRes = await fetch(`/blog/posts/${encodeURIComponent(slug)}.md`, { cache: 'no-cache' });
      if(!mdRes.ok) throw new Error('Conteúdo não encontrado');
      const md = await mdRes.text();
      let mdBody = md;

      // Try front matter for meta
      const fmMatch = md.match(/^---\s*[\s\S]*?\n---\s*\n?/);
      if(fmMatch){
        const fmBlock = fmMatch[0];
        mdBody = md.slice(fmBlock.length);
        const fm = fmBlock
          .replace(/^---\s*/, '')
          .replace(/\s*---\s*$/, '');
        fm.split(/\n+/).forEach(line=>{
          const m = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
          if(!m) return;
          const key = m[1].trim();
          const val = m[2].trim().replace(/^"|"$/g,'');
          if(key === 'title' && val) { titleEl.textContent = val; document.title = `${val} — Lion Hybrid Training`; }
          if(key === 'date' && val) { dateEl.setAttribute('datetime', val); dateEl.textContent = formatDate(val); }
          if(key === 'category' && val) { catEl.textContent = val; }
          if(key === 'excerpt' && val && !document.querySelector('.header-subtitle')) { /* no-op: could add meta description */ }
        });
      }
      const conv = new showdown.Converter({
        tables: true,
        simplifiedAutoLink: true,
        strikethrough: true,
        tasklists: true
      });
      contentEl.innerHTML = conv.makeHtml(mdBody);
    }catch(err){
      console.error(err);
      titleEl.textContent = 'Artigo';
      contentEl.innerHTML = '<p>Não foi possível carregar este artigo. Verifica se o ficheiro existe em <strong>blog/posts/SLUG.md</strong>.</p>';
    }
  }

  document.addEventListener('DOMContentLoaded', load);
})();
