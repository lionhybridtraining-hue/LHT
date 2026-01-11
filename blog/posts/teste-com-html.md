---
title: Teste com html
date: 2026-01-11
category: Artigo teste
excerpt: >-
  Vivemos numa era em que “estar em forma” já não chega.

  Queremos correr melhor. Ser mais fortes. Ter mais energia. Pensar com clareza. Durar mais anos com qualidade.


  A Lion Hybrid Training (LHT) nasce dessa visão:

  unir força + resistência + inteligência de treino num único sistema, acessível a atletas do dia-a-dia que querem evoluir de forma consistente, sustentável e baseada em ciência.


  Aqui não há atalhos mágicos.

  Há método. Há estrutura. Há propósito.
---


```
<!doctype html>
<html lang="pt-PT">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Lion Hybrid Training — Onde a ciência encontra a mentalidade de leão</title>
  <meta name="description" content="A Lion Hybrid Training (LHT) une força, resistência e ciência de treino num sistema simples, sustentável e orientado à performance — para atletas do dia-a-dia." />
  <style>
    :root{
      --bg: #0b0b0d;
      --card: #121216;
      --text: #f3f3f5;
      --muted: #b7b7c2;
      --gold: #d6b25e;
      --gold-2: #a8842c;
      --border: rgba(255,255,255,.10);
      --shadow: 0 18px 60px rgba(0,0,0,.55);
      --radius: 18px;
      --max: 860px;
    }
    *{box-sizing:border-box}
    body{
      margin:0;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji";
      background: radial-gradient(1200px 800px at 30% -10%, rgba(214,178,94,.18), transparent 55%),
                  radial-gradient(900px 700px at 90% 10%, rgba(214,178,94,.10), transparent 50%),
                  var(--bg);
      color: var(--text);
      line-height: 1.65;
    }
    a{color: var(--gold); text-decoration:none}
    a:hover{color: #f0d48a; text-decoration:underline}
    header{
      padding: 56px 22px 26px;
    }
    .wrap{
      max-width: var(--max);
      margin: 0 auto;
    }
    .kicker{
      display:inline-flex;
      align-items:center;
      gap:10px;
      padding: 8px 12px;
      border: 1px solid var(--border);
      border-radius: 999px;
      color: var(--muted);
      background: rgba(255,255,255,.03);
      font-size: 13px;
      letter-spacing:.2px;
    }
    .kicker .dot{
      width:8px;height:8px;border-radius:50%;
      background: linear-gradient(135deg, var(--gold), var(--gold-2));
      box-shadow: 0 0 0 4px rgba(214,178,94,.12);
    }
    h1{
      margin: 16px 0 10px;
      font-size: clamp(30px, 4vw, 44px);
      line-height: 1.12;
      letter-spacing: -0.6px;
    }
    .sub{
      margin: 0 0 18px;
      color: var(--muted);
      font-size: 17px;
      max-width: 60ch;
    }
    .meta{
      display:flex;
      flex-wrap:wrap;
      gap:10px 14px;
      color: var(--muted);
      font-size: 13px;
      padding-top: 10px;
      border-top: 1px solid var(--border);
      margin-top: 18px;
    }
    .meta span{
      display:inline-flex;
      align-items:center;
      gap:8px;
      padding: 6px 10px;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: rgba(255,255,255,.02);
    }
    main{padding: 0 22px 70px}
    article{
      background: linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.02));
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      overflow:hidden;
    }
    .hero{
      padding: 26px 26px 0;
    }
    .hero-card{
      border: 1px solid var(--border);
      border-radius: calc(var(--radius) - 6px);
      padding: 22px;
      background:
        radial-gradient(800px 300px at 20% 0%, rgba(214,178,94,.18), transparent 55%),
        rgba(0,0,0,.18);
    }
    .quote{
      margin: 18px 0 0;
      padding: 16px 16px 16px 14px;
      border-left: 3px solid var(--gold);
      color: var(--text);
      background: rgba(255,255,255,.03);
      border-radius: 10px;
      font-size: 16px;
    }
    .content{
      padding: 10px 26px 26px;
    }
    h2{
      margin: 26px 0 10px;
      font-size: 22px;
      letter-spacing: -0.3px;
    }
    p{margin: 0 0 14px}
    ul{
      margin: 10px 0 16px 20px;
      color: var(--text);
    }
    li{margin: 6px 0}
    .callout{
      margin: 20px 0;
      padding: 16px 16px;
      border: 1px solid rgba(214,178,94,.35);
      border-radius: 14px;
      background: rgba(214,178,94,.08);
      color: var(--text);
    }
    .cta{
      margin-top: 18px;
      display:flex;
      flex-wrap:wrap;
      gap: 12px;
      align-items:center;
    }
    .btn{
      display:inline-flex;
      align-items:center;
      justify-content:center;
      gap:10px;
      padding: 12px 16px;
      border-radius: 999px;
      border: 1px solid rgba(214,178,94,.55);
      background: linear-gradient(135deg, rgba(214,178,94,.22), rgba(214,178,94,.06));
      color: var(--text);
      font-weight: 650;
      letter-spacing: .2px;
      text-decoration:none;
    }
    .btn:hover{
      border-color: rgba(240,212,138,.85);
      background: linear-gradient(135deg, rgba(240,212,138,.24), rgba(214,178,94,.08));
      text-decoration:none;
    }
    .btn.secondary{
      border: 1px solid var(--border);
      background: rgba(255,255,255,.03);
      color: var(--muted);
      font-weight: 600;
    }
    .btn.secondary:hover{color: var(--text)}
    footer{
      padding: 18px 26px 26px;
      border-top: 1px solid var(--border);
      color: var(--muted);
      font-size: 13px;
      display:flex;
      flex-wrap:wrap;
      gap:10px 14px;
      align-items:center;
      justify-content:space-between;
    }
    .tags{
      display:flex;
      flex-wrap:wrap;
      gap:8px;
    }
    .tag{
      padding: 6px 10px;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: rgba(255,255,255,.02);
    }
  </style>
</head>

<body>
  <header>
    <div class="wrap">
      <div class="kicker">
        <span class="dot" aria-hidden="true"></span>
        Lion Hybrid Training • Blog
      </div>

      <h1>Onde a ciência encontra a mentalidade de leão</h1>
      <p class="sub">
        Força + resistência + inteligência de treino num sistema simples, sustentável e orientado à performance —
        para atletas do dia-a-dia que querem evoluir de forma consistente.
      </p>

      <div class="meta" aria-label="Metadados do artigo">
        <span>🦁 LHT</span>
        <span>📍 Portugal</span>
        <span>🧬 Base científica</span>
        <span>🏃‍♂️ Treino híbrido</span>
      </div>
    </div>
  </header>

  <main>
    <div class="wrap">
      <article>
        <div class="hero">
          <div class="hero-card">
            <p style="margin:0;color:var(--muted)">
              Vivemos numa era em que “estar em forma” já não chega.
              Queremos correr melhor, ser mais fortes, ter mais energia e durar mais anos com qualidade.
            </p>

            <div class="quote">
              <strong>Treinar não é cansar.</strong> É adaptar —
              <em>estimular o corpo certo, na dose certa, no momento certo</em>.
            </div>
          </div>
        </div>

        <div class="content">
          <h2>🧠 Treinar não é “dar tudo”. É construir.</h2>
          <p>
            Muita gente ainda associa treino a suar até cair, “dar tudo” em cada sessão e achar que quanto mais duro, melhor.
            Na LHT acreditamos no oposto: o que cria resultados é <strong>estrutura</strong>, <strong>progressão</strong> e
            <strong>gestão inteligente da carga</strong>.
          </p>
          <p>
            É assim que evitas lesão, estagnação e frustração. É assim que evoluis em performance de forma sustentável —
            e não apenas durante 4 semanas “motivadas”.
          </p>

          <h2>🏃‍♂️ O atleta híbrido</h2>
          <p>
            O atleta híbrido não é um especialista extremo. É um atleta completo — alguém que corre com eficiência,
            tem força para suportar o impacto, entende o próprio corpo e treina com intenção.
          </p>
          <ul>
            <li>Corre com eficiência</li>
            <li>Constrói força útil (não só estética)</li>
            <li>Controla a respiração e a intensidade</li>
            <li>Evolui ao longo dos anos, não só de ciclos</li>
          </ul>

          <h2>📊 Ciência simplificada. Aplicação real.</h2>
          <p>
            Usamos princípios sólidos da fisiologia do exercício (zonas, testes, progressão, gestão de fadiga e feedback contínuo),
            comunicados de forma <strong>simples, prática e humana</strong>.
          </p>
          <p>
            O objetivo não é impressionar com termos técnicos. É fazer-te <strong>treinar melhor todos os dias</strong>.
          </p>

          <div class="callout">
            <strong>Nota LHT:</strong> resultados consistentes vêm de boas decisões repetidas.
            Uma semana perfeita não vence um ano desorganizado.
          </div>

          <h2>🚀 O primeiro passo: o programa gratuito</h2>
          <p>
            Criámos um ponto de entrada acessível a todos:
            um <strong>plano de corrida personalizado gratuito</strong>, baseado nos teus dados, alinhado com metodologias modernas
            e enviado automaticamente após preencheres o questionário.
          </p>
          <p>
            A partir daí, podes evoluir para o <strong>AER – Athletic Endurance Runner</strong> e ter acesso exclusivo à
            <strong>Comunidade LHT</strong>, com orientação, conteúdo e estrutura para levar o teu treino a sério.
          </p>

          <h2>🦁 Não é só treino. É identidade.</h2>
          <p>
            A Lion Hybrid Training é uma forma de estar:
            disciplina sem rigidez, ambição sem ego, consistência sem obsessão — e ciência sem complicação.
          </p>
          <p>
            Treinamos porque isso nos torna melhores: no corpo, na mente e na forma como vivemos.
          </p>

          <div class="cta">
            <a class="btn" href="https://lionhybridtraining.com" target="_blank" rel="noopener noreferrer">
              Começar agora em lionhybridtraining.com →
            </a>
            <a class="btn secondary" href="https://lionhybridtraining.com" target="_blank" rel="noopener noreferrer">
              Gerar plano gratuito
            </a>
          </div>
        </div>

        <footer>
          <div>© <span id="year"></span> Lion Hybrid Training • Strength meets endurance. Lion mentality.</div>
          <div class="tags" aria-label="Tags do artigo">
            <span class="tag">Treino híbrido</span>
            <span class="tag">Corrida</span>
            <span class="tag">Força</span>
            <span class="tag">Fisiologia</span>
          </div>
        </footer>
      </article>
    </div>
  </main>

  <script>
    document.getElementById("year").textContent = new Date().getFullYear();
  </script>
</body>
</html>

```
