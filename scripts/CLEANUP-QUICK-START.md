# Quick Start: Using the Test Account Cleanup Scripts

Você tem **três opções** para resetar a conta de teste `rodrigolibanio1999@gmail.com` e testar fluxos do funil como um atleta novo.

---

## 🚀 Opção 1: Via Dashboard Supabase (Mais Fácil)

**Quando usar:** Teste rápido, não requer código

### Passos:

1. **Abrir Supabase SQL Editor**
   - Ir para [console.supabase.com](https://console.supabase.com)
   - Selecionar projeto LHT
   - Clicar em **SQL Editor** (esquerda)
   - Clicar em "New query"

2. **Colar script de cleanup**
   - Abrir arquivo: `scripts/cleanup-athlete-test-account.sql`
   - Copiar todo o conteúdo
   - Colar no SQL Editor

3. **Executar**
   - Clicar em **Run** (ou Cmd+Enter)
   - Ver output confirmando deleção

4. **Verificar resultado**
   - Abrir Query: `SELECT * FROM athletes WHERE email = 'rodrigolibanio1999@gmail.com';`
   - Deve retornar vazio (0 rows)

### Se quiser mais detalhes:
Use o arquivo `cleanup-athlete-test-account-v2.sql` em vez do primeiro (tem mais logs)

---

## 🔧 Opção 2: Via Função Netlify (Mais Automatizado)

**Quando usar:** Integração com testes automatizados, API programática

### Setup:

1. **Fazer deploy do código Netlify**
   - A função já existe em: `netlify/functions/admin-cleanup-athlete.js`
   - Fazer build/deploy normal: `npm run build`
   - Função estará disponível em: `https://lht.app/.netlify/functions/admin-cleanup-athlete`

2. **Chamar a função via cURL:**

```bash
curl -X POST \
  https://lht.app/.netlify/functions/admin-cleanup-athlete \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"rodrigolibanio1999@gmail.com"}'
```

3. **Ou via JavaScript:**

```javascript
// No browser console (depois de fazer admin login):
const cleanup = new TestAthleteCleanup(localStorage.getItem('sb-admin-token'));
await cleanup.cleanup('rodrigolibanio1999@gmail.com');
```

4. **Requisitos:**
   - Precisa estar autenticado como **admin**
   - Token de autenticação (Supabase Auth)

---

## 📝 Opção 3: Integração com Testes Automatizados

**Quando usar:** CI/CD, E2E tests, validação automática

### Exemplo com Jest/Puppeteer:

```javascript
// test/funnel.e2e.test.js
const TestAthleteCleanup = require('../scripts/test-cleanup-client.js');

describe('Free plan funnel', () => {
  let cleanup;

  beforeAll(() => {
    const adminToken = process.env.ADMIN_API_TOKEN;
    cleanup = new TestAthleteCleanup(adminToken);
  });

  beforeEach(async () => {
    // Reset test account antes de cada teste
    console.log('🧹 Resetting test account...');
    const result = await cleanup.cleanup('rodrigolibanio1999@gmail.com');
    console.log('Deleted:', result.deletedCounts);
  });

  it('landing → form → plan_generated → plan_accessed', async () => {
    // 1. Carregar landing
    await page.goto('https://lht.app/planocorrida');
    
    // 2. Preencher landing form
    await page.fill('[name="name"]', 'Test Athlete');
    await page.fill('[name="goalDistance"]', '42');
    
    // ... mais passos ...
    
    // 3. Verificar database
    const lead = await queryAPI('/admin/athlete-by-email?email=...');
    expect(lead.funnel_stage).toBe('plan_generated');
  });
});
```

**Rodar testes:**
```bash
ADMIN_API_TOKEN=your_token npm run test:e2e
```

---

## 🎯 Fluxo Completo de Teste Manual

Depois de limpar a conta, seguir estes passos:

### 1️⃣ **Fresh Landing (Sem Auth)**
```
1. Abrir https://lht.app/planocorrida em incógnito
2. Dever ver página de landing (não autenticado)
3. Preencher: nome, objetivo, frequência, experiência, consistência
4. Clicar em submit
5. ✅ Validar em DB:
   - athletes.funnel_stage = 'landing_submitted'
   - leads_central.last_activity_type = 'landing_submitted'
```

### 2️⃣ **Multi-Step Form (Continuação)**
```
1. Redirecionado para /planocorrida/formulario
2. Preencher informações de treino/métricas
3. Clicar em "Gerar Plano"
4. ✅ Validar database:
   - athletes.funnel_stage = 'plan_generated'
   - athletes.plan_generated_at = agora
   - leads_central.last_activity_type = 'plan_generated'
   - onboarding_answers.planocorrida_landing.formCompleted = true
```

### 3️⃣ **Plano Gerado - Acesso Autenticado**
```
1. Login com rodrigolibanio1999@gmail.com
2. Ir para /programas (meus programas)
3. Clicar para acessar o plano
4. ✅ Validar database:
   - leads_central.last_activity_type = 'plan_accessed'
   - leads_central.last_activity_at = agora
```

### 4️⃣ **Perfil - Preenchimento Mínimo**
```
1. Ir para /perfil
2. Preencher APENAS:
   - Nome completo
   - Telefone
   - Data nascimento
   - Altura (cm)
   - Peso (kg)
   - Sexo
3. NÃO preencher: objetivo, frequência, experiência, consistência
4. ✅ Deve aceitar SEM erros de validação
5. ✅ Validar: athletes.profileComplete = true
```

### 5️⃣ **Sinais de Engajamento (PWA)**
```
1. Em Chrome: Simular beforeinstallprompt
2. Instalar PWA
3. ✅ Validar database:
   - onboarding_answers.pwa.installPromptedAt = timestamp
   - onboarding_answers.pwa.installedAt = timestamp
   - leads_central.last_activity_type = 'app_installed'
```

---

## 🔍 Verificação na Database

Depois de cada passo, você pode verificar os dados rodando queries no Supabase:

```sql
-- Ver athlete
SELECT id, email, funnel_stage, plan_generated_at, onboarding_answers
FROM athletes
WHERE email = 'rodrigolibanio1999@gmail.com';

-- Ver lead tracking
SELECT 
  funnel_stage, 
  lead_status, 
  last_activity_type, 
  last_activity_at, 
  profile,
  raw_payload
FROM leads_central
WHERE email = 'rodrigolibanio1999@gmail.com'
ORDER BY last_activity_at DESC
LIMIT 1;

-- Ver onboarding
SELECT athlete_id, email, answers
FROM onboarding_intake
WHERE email = 'rodrigolibanio1999@gmail.com'
ORDER BY created_at DESC
LIMIT 1;
```

---

## 📋 Checklist de Validação É2E

Depois de testar completo, confirme:

- [ ] Landing carrega sem auth
- [ ] Landing form criou entrada no DB
- [ ] Form multi-step preenchível
- [ ] Plan generated após form completo
- [ ] funnel_stage transicionou: landing → landing_submitted → plan_generated
- [ ] formCompleted=true na DB após submit
- [ ] App login funciona para test account
- [ ] plan_accessed ativado ao acessar programa
- [ ] /perfil só exige 5 campos (sem goal/frequency/experience/consistency)
- [ ] Perfil marcado como completo
- [ ] PWA install signals capturados (se testado)

---

## 🚨 Troubleshooting

| Problema | Solução |
|----------|---------|
| "Athlete not found" em cleanup | Verificar se email é exatamente `rodrigolibanio1999@gmail.com` (case-sensitive) |
| Cleanup fails com permission error | Verificar se usando Supabase service role key (admin policy) |
| Dados não deletados completamente | Usar v2 script com mais detalhes: `cleanup-athlete-test-account-v2.sql` |
| Profile validation falha | Verificar se `REQUIRED_FIELDS` foi atualizado em `perfil.tsx` |
| funnel_stage não transiciona | Verificar `onboarding-intake.js` - procurar `canPromoteToPlanGenerated` |

---

## 💡 Dica: Automatizar no Browser

Adicionar bookmark para limpeza rápida:

```javascript
javascript:(async function() {
  const token = localStorage.getItem('sb-admin-token');
  if (!token) { alert('Not logged in as admin'); return; }
  const cleanup = new TestAthleteCleanup(token);
  try {
    const result = await cleanup.cleanup('rodrigolibanio1999@gmail.com');
    alert(`✅ Cleanup done!\n\nDeleted:\n${JSON.stringify(result.deletedCounts, null, 2)}`);
  } catch (err) {
    alert(`❌ Error: ${err.message}`);
  }
})();
```

1. Criar novo bookmark em browser
2. Name: "🧹 Cleanup Test Account"
3. URL: ^acima^
4. Clicar bookmark quando precisar limpar

---

## 📚 Arquivos Relacionados

```
scripts/
  ├── cleanup-athlete-test-account.sql       # Script SQL simples
  ├── cleanup-athlete-test-account-v2.sql    # Script SQL com logs detalhados
  ├── CLEANUP-README.md                      # Documentação completa
  ├── test-cleanup-client.js                 # Cliente JavaScript/Node.js
  └── CLEANUP-QUICK-START.md                 # Este arquivo ✓

netlify/functions/
  └── admin-cleanup-athlete.js               # Função Netlify
```

---

## ❓ FAQ

**P: Posso usar este script em produção?**
R: Não! Está hard-coded apenas para `rodrigolibanio1999@gmail.com` e exige role `admin`. Totalmente seguro.

**P: O que é exatamente deletado?**
R: Tudo associado ao athlete: workouts, assignments, plans, leads, checkins, logs. Ver lista em `CLEANUP-README.md`.

**P: Quando devo usar cada opção?**
- **Opção 1 (SQL):** Teste rápido manual, você quer ver output
- **Opção 2 (API):** Integração com outras ferramentas, programática
- **Opção 3 (Testes):** CI/CD automático, regression testing

**P: E se eu não quiser deletar TUDO?**
R: Editar o script SQL e comentar as linhas do que não quer deletar.

---

**Pronto para testar! 🚀**
