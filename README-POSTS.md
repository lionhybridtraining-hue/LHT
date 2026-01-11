# Gestão de Posts — LHT

Este site está preparado para gerir artigos sem mexer em código, usando Decap CMS (Netlify CMS).

## Abrir painel Admin
- Depois de publicado (GitHub Pages/Netlify), acede a `/admin/` no teu site.
- Faz login (Netlify Identity ou GitHub, conforme configuração).

## Fluxo recomendado
1. Cria o artigo em **Artigos** (collection `posts`):
   - Título, Data, Categoria, Resumo, Conteúdo (Markdown)
   - Guarda e publica.
2. Adiciona o artigo à **Lista de Artigos** (collection `posts_index`):
   - Em `Posts`, adiciona um item com `slug` (igual ao nome do ficheiro .md), título, data, categoria e resumo.
   - Guarda e publica.

A lista do blog lê de `blog/posts.json`; a página do artigo lê o ficheiro `.md` e usa o front matter para meta.

## Imagens
- Faz upload em `assets/img/uploads` pelo Admin.
- No Markdown: `![alt](/assets/img/uploads/minha-imagem.jpg)`

## Configuração do backend
- Atualiza `admin/config.yml`:
  - `repo: CHANGE_ME_OWNER/CHANGE_ME_REPO` para o teu repositório.
  - Se usares Netlify, podes mudar `backend.name` para `git-gateway`.

## Servir localmente
Alguns browsers bloqueiam `fetch` em ficheiros locais. Usa um servidor:

```bash
# Node
npx serve .

# Python
python -m http.server 5500
```

Abre `http://localhost:5500/blog.html`.

## Dicas
- `slug` = nome do ficheiro sem `.md`.
- `date` no formato `YYYY-MM-DD`.
- Mantém `posts.json` alinhado com os `.md` para aparecer na lista.
