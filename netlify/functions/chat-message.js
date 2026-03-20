const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { getAuthenticatedUser } = require("./_lib/auth-supabase");

/**
 * Chat message handler - integrates with Google Gemini API
 * 
 * Expected POST body:
 * {
 *   message: string,
 *   conversationHistory: [ { role: "user"|"assistant", content: string } ]
 * }
 */
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    
    // Authentication is optional for MVP (can be added later)
    // const user = await getAuthenticatedUser(event, config);
    // if (!user) return json(401, { error: "Authentication required" });

    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch (err) {
      return json(400, { error: "Invalid JSON body" });
    }

    const { message, conversationHistory = [] } = body;

    if (!message || !message.trim()) {
      return json(400, { error: "Message is required" });
    }

    // Get Gemini API key from environment
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return json(500, { error: "Gemini API key not configured" });
    }

    // Build conversation context for Gemini
    const systemPrompt = `Tu es o assistente LHT (Lion Hybrid Training), um especialista em treinamento de corrida de fundo.

Tuas características:
- Forneces conselhos baseados em principios de treinamento moderno (VDOT, periodizacao, recuperacao)
- Usas linguagem simples mas precisa, sempre em português
- Respondas com recomendacoes praticas e seguras
- Menciones quando é importante consultar um treinador ou medico
- Aproveitas o contexto da conversa para dar respostas personalizadas

Tópicos principais em que podes ajudar:
- Estrutura e uso do plano de treino LHT
- Ajustes de carga e progressao semanal
- Tecnicas de corrida e prevencao de lesoes
- Recuperacao, sono e nutricao basica
- Interpretacao de dados de treino (paces, volumes, intensidades)

Instrucoes:
- Sé conciso mas completo (maximo 2-3 paragrafos)
- Sempre questiona sobrecarga se o utilizador mencione dor ou fadiga
- Recomenda reduzir volume antes de aumentar
- Enfatiza a importancia de consistencia a longo prazo`;

    // Prepare messages for Gemini API
    const messages = [
      ...conversationHistory.map(msg => ({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }]
      })),
      {
        role: "user",
        parts: [{ text: message }]
      }
    ];

    // Call Gemini API
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          system: {
            instructions: systemPrompt
          },
          contents: messages,
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024
          },
          safetySettings: [
            {
              category: "HARM_CATEGORY_DANGEROUS_CONTENT",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            }
          ]
        })
      }
    );

    if (!geminiResponse.ok) {
      const errorData = await geminiResponse.text();
      console.error("Gemini API error:", errorData);
      return json(500, { error: "Error calling Gemini API" });
    }

    const geminiData = await geminiResponse.json();

    // Extract the response text
    if (!geminiData.candidates || !geminiData.candidates[0] || !geminiData.candidates[0].content) {
      return json(500, { error: "Invalid response from Gemini API" });
    }

    const assistantMessage = geminiData.candidates[0].content.parts[0].text;

    return json(200, {
      success: true,
      message: assistantMessage,
      usage: {
        input_tokens: geminiData.usageMetadata?.promptTokenCount || 0,
        output_tokens: geminiData.usageMetadata?.candidatesTokenCount || 0
      }
    });

  } catch (err) {
    console.error("Error in chat handler:", err);
    return json(500, { error: err.message || "Error processing message" });
  }
};
