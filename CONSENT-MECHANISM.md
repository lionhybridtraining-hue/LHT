# Sistema de Consentimento de Cookies - Lion Hybrid Training

## 📋 Resumo

Este documento explica como funciona o sistema de consentimento de cookies (GDPR-compliant) implementado no site Lion Hybrid Training e como o utilizador aceita ou recusa o pedido de consentimento.

## 🎯 Como Funciona o Sistema

### 1. **Banner de Consentimento**

O banner de consentimento aparece na parte inferior da página quando o utilizador visita o site pela primeira vez (quando não há preferência guardada).

**Localização no código:**
- HTML: `index.html` (linhas 363-371)
- CSS: `assets/css/style.css` (linhas 621-631)
- JavaScript: `assets/js/script.js` (linhas 98-230)

### 2. **Mensagem Apresentada**

```
Usamos cookies para medir visitas e cliques (melhorar a experiência). Queres permitir?
```

Com dois botões:
- **"Aceitar"** (botão dourado)
- **"Recusar"** (botão ghost/transparente)

### 3. **Como o Utilizador Aceita**

#### Opção A: Aceitar Cookies
1. O utilizador vê o banner na parte inferior da página
2. Clica no botão **"Aceitar"**
3. O sistema:
   - Guarda `'accepted'` no localStorage com a chave `'lht_consent'`
   - Oculta o banner
   - Atualiza o Google Consent Mode v2 para `'granted'`
   - Inicializa o Google Analytics (GA4)
   - Regista o evento `consent_accept`

#### Opção B: Recusar Cookies
1. O utilizador vê o banner na parte inferior da página
2. Clica no botão **"Recusar"**
3. O sistema:
   - Guarda `'denied'` no localStorage com a chave `'lht_consent'`
   - Oculta o banner
   - Mantém o Google Consent Mode v2 em `'denied'`
   - NÃO inicializa o Google Analytics
   - Regista o evento `consent_decline` (apenas console log)

### 4. **Persistência**

A escolha do utilizador é guardada no **localStorage** do navegador:
- **Chave**: `lht_consent`
- **Valores possíveis**: `'accepted'`, `'denied'`, ou `null` (não definido)
- **Duração**: Permanece até o utilizador limpar os dados do navegador

### 5. **Comportamento em Visitas Subsequentes**

- **Se aceitou**: O banner não aparece e o Google Analytics funciona normalmente
- **Se recusou**: O banner não aparece e o Google Analytics NÃO é carregado
- **Primeira visita**: O banner aparece automaticamente

## 🔧 Implementação Técnica

### Google Consent Mode v2

O site utiliza o Google Consent Mode v2, que é o padrão recomendado para conformidade com GDPR:

```javascript
// Configuração inicial (index.html)
gtag('consent', 'default', {
  analytics_storage: 'denied',      // Negado por padrão
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied'
});
```

### Fluxo do JavaScript

```javascript
// 1. Verificar se já existe consentimento
const consent = localStorage.getItem('lht_consent');

// 2. Se não existe, mostrar banner
if (!consent) {
  consentBanner.hidden = false;
}

// 3. Se o utilizador aceitar
if (btnAccept.clicked) {
  localStorage.setItem('lht_consent', 'accepted');
  gtag('consent', 'update', { analytics_storage: 'granted' });
  Analytics.init(); // Carrega Google Analytics
}

// 4. Se o utilizador recusar
if (btnDecline.clicked) {
  localStorage.setItem('lht_consent', 'denied');
  gtag('consent', 'update', { analytics_storage: 'denied' });
  // Analytics NÃO é inicializado
}
```

### Rastreamento de Eventos

O sistema também rastreia eventos de utilizadores (cliques em botões, links) quando o consentimento é aceite:

```javascript
// Elementos com data-track são automaticamente rastreados
<a data-track="cta_plano_gratuito" href="...">Plano de Corrida Gratuito</a>
```

## ✅ Conformidade GDPR

O sistema está em conformidade com o GDPR porque:

1. ✅ **Consent por defeito negado**: Analytics bloqueado até aceitação explícita
2. ✅ **Escolha clara**: Botões "Aceitar" e "Recusar" bem visíveis
3. ✅ **Informação clara**: Mensagem explica o propósito dos cookies
4. ✅ **Persistência**: Escolha é guardada e respeitada
5. ✅ **Sem cookies antes do consentimento**: Consent Mode v2 garante isto
6. ✅ **Links para políticas**: Link para "Política de Privacidade" no rodapé

## 🧪 Como Testar

### Teste 1: Primeira Visita
1. Abrir o site em modo privado/incógnito
2. O banner deve aparecer na parte inferior
3. Verificar que o Google Analytics NÃO está ativo (localStorage vazio)

### Teste 2: Aceitar Cookies
1. Clicar em "Aceitar"
2. Banner desaparece
3. Verificar localStorage: `localStorage.getItem('lht_consent')` deve retornar `'accepted'`
4. Google Analytics está ativo

### Teste 3: Recusar Cookies
1. Limpar localStorage: `localStorage.clear()`
2. Recarregar página
3. Clicar em "Recusar"
4. Banner desaparece
5. Verificar localStorage: `localStorage.getItem('lht_consent')` deve retornar `'denied'`
6. Google Analytics NÃO está ativo

### Teste 4: Persistência
1. Aceitar/Recusar cookies
2. Fechar e reabrir o navegador (na mesma janela)
3. Banner não deve aparecer
4. Escolha anterior deve ser respeitada

## 🐛 Resolução de Problemas

### Banner não aparece
- Verificar se o localStorage já tem uma escolha guardada
- Limpar localStorage: `localStorage.removeItem('lht_consent')`
- Recarregar a página

### Banner não desaparece após clicar
- Verificar consola do navegador para erros JavaScript
- Verificar se o `script.js` está a carregar corretamente

### Analytics não funciona após aceitar
- Verificar se o script do Google Tag Manager está bloqueado por adblockers
- Verificar se o ID do GA está correto: `G-K3EJSN5M4Y`

## 📝 Ficheiros Relacionados

- **HTML**: `/index.html` (linha 363-371)
- **CSS**: `/assets/css/style.css` (linha 621-631)
- **JavaScript**: `/assets/js/script.js` (linha 98-230)
- **Política de Privacidade**: `/politica-privacidade.html`
- **Termos e Condições**: `/termos.html`

## 🎨 Aparência Visual

O banner tem:
- **Fundo**: Semi-transparente escuro (`rgba(10,10,10,.92)`)
- **Borda**: Sutil com glow dourado
- **Posição**: Fixo na parte inferior central
- **Botão Aceitar**: Dourado (`--gold: #d4a54f`)
- **Botão Recusar**: Ghost/transparente com borda

## 📞 Contacto

Para questões sobre privacidade e dados:
- **Email**: info@lionhybridtraining.com
- **Política de Privacidade**: https://lionhybridtraining.com/politica-privacidade

---

**Última atualização**: Janeiro 2026  
**Versão**: 1.0  
**Status**: ✅ Funcional e GDPR-compliant
