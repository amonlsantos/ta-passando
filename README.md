# Tá Passando

Guia de programação de TV. App mobile (Ionic + Angular + Capacitor) e uma API
intermediária (Fastify) que baixa o XMLTV público e serve JSON ao app.

```
projects/
├── epg-api/   # Fastify + XMLTV
└── epg-app/   # Ionic + Angular standalone + Capacitor
```

## Requisitos

- Node.js 24+
- Android: JDK 21 (com `javac`, não só JRE) e Android SDK com platform 36 e
  build-tools 36

## Rodando

API:

```bash
cd projects/epg-api
npm install
EPG_XMLTV_URL=https://epg.pw/xmltv/epg_BR.xml npm run dev
```

Sem internet, use o provedor simulado:

```bash
npm run mock                                   # terminal 1
EPG_XMLTV_URL=http://localhost:4010/epg.xml npm run dev   # terminal 2
```

App:

```bash
cd projects/epg-app
npm install
npm start
```

O app chama `http://localhost:3000` em desenvolvimento (`src/environments`).

## API

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/health` | Status do snapshot XMLTV |
| GET | `/api/channels` | Canais (com `location` quando o nome traz a praça) |
| GET | `/api/channels/:channelId/programs` | Grade do canal |
| GET | `/api/programs/now?channelIds=a,b` | No ar agora (filtro opcional) |
| GET | `/api/programs/:programId` | Detalhe do programa |

Variáveis de ambiente: `EPG_XMLTV_URL` (obrigatória), `CACHE_TTL`,
`UPSTREAM_TIMEOUT_MS`, `XMLTV_MAX_BYTES`.

## Fonte dos dados

XMLTV público do epg.pw. Sem token ou chave de API. Limitações da fonte, que
aparecem na interface:

- cobertura de ~2 dias em UTC (até 3 dias parciais no fuso de Brasília)
- 59% dos programas sem sinopse
- sem categoria, logo, avaliação ou país
- nomes prefixados pela praça (`São Paulo/SP Record News`); 25 nomes colidem
  sem separar a praça

## Testes

```bash
cd projects/epg-api && npm test      # 25 testes de integração
cd projects/epg-app && npm run e2e   # 10 passos de UI
```

`npm run e2e` usa Playwright se instalado, ou `E2E_CHROMIUM_PATH` apontando
para um Chromium.

## Android

```bash
cd projects/epg-app
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`.

O Gradle precisa do SDK localizado; use `ANDROID_HOME` ou um
`android/local.properties` com `sdk.dir=<caminho do SDK>`. Para o app alcançar
a API rodando na máquina: `adb reverse tcp:3000 tcp:3000`.

Antes de publicar: troque o `appId` (`com.example.epg`), configure HTTPS em
`src/environments/environment.prod.ts` e assine com uma keystore própria.
