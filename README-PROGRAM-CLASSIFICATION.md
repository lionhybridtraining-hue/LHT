# Classificacao De Programas

Atualizado: 2026-04-07

Este documento descreve a estrutura de classificacao guardada em `training_programs.classification`.

## Objetivo

Estes metadados servem para:

- filtrar programas no admin
- suportar regras automáticas por tipo de programa
- distinguir rapidamente se o programa inclui força, endurance ou ambos
- explicitar modalidades e nível recomendado

## Estrutura

O campo `classification` é um objeto JSON com esta forma:

```json
{
  "primaryCategory": "hybrid",
  "secondaryCategories": ["event_prep"],
  "trainingComponents": ["strength", "endurance"],
  "modalities": ["running", "strength_training"],
  "experienceLevel": {
    "overall": "intermediate",
    "byModality": {
      "running": "beginner",
      "strength_training": "intermediate"
    }
  },
  "automationTags": ["requires_strength_plan", "coach_review"],
  "notes": "Programa híbrido orientado para preparação de prova."
}
```

## Campos

- `primaryCategory`: ângulo principal do programa. Valores atuais: `hybrid`, `endurance`, `strength`, `mobility`, `skill`, `recovery`, `other`.
- `secondaryCategories`: categorias adicionais para segmentação mais fina.
- `trainingComponents`: componentes efetivamente incluídos no plano. Valores atuais: `strength`, `endurance`, `mobility`, `skill`, `recovery`.
- `modalities`: modalidades específicas do programa. Ex.: `running`, `trail_running`, `cycling`, `hyrox`, `strength_training`.
- `experienceLevel.overall`: nível global recomendado. Valores: `beginner`, `intermediate`, `advanced`.
- `experienceLevel.byModality`: nível mínimo por modalidade quando o programa mistura requisitos diferentes.
- `automationTags`: tags livres mas normalizadas para regras operacionais.
- `notes`: contexto interno que ajude decisões manuais.

## Regras Práticas

- Usa `trainingComponents` para responder a perguntas do tipo "inclui força?" ou "inclui endurance?".
- Usa `modalities` para filtros específicos e roteamento de experiência por modalidade.
- Usa `experienceLevel.byModality` quando o nível de corrida e o nível de força não são iguais.
- Usa `automationTags` apenas para gatilhos operacionais ou segmentação interna, não para copy comercial.
- Mantém tokens em minúsculas com `_` em vez de espaços.

## Base De Dados

- Migration: `scripts/migration-program-classification.sql`
- Coluna: `training_programs.classification`
- Índices: GIN sobre `classification` e índice por `primaryCategory`