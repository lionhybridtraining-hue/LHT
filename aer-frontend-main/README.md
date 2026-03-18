# Frontend Plano de Corrida

Frontend React do plano de corrida gratuito.

## Configuracao

1. Copia `.env.example` para `.env`.
2. Ajusta as variaveis conforme o ambiente:

- `VITE_TRAININGPLAN_API_URL`: endpoint do backend de geracao do plano.
- `VITE_ROUTER_BASENAME`: base do router. Usa `/planocorrida` quando servido nesse subpath.
- `VITE_ASSET_BASE_PATH`: base dos assets no build. Usa `/planocorrida/` quando servido nesse subpath.

## Desenvolvimento

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Contrato de entrada (URL)

Parametros obrigatorios:

- `progression_rate`
- `phase_duration`
- `training_frequency`
- `program_distance`

Parametros opcionais:

- `race_dist`
- `race_time`
- `initial_volume`
- `name`