# Tá Passando

Guia de programação de TV para Android. O app baixa o XMLTV público do
[epg.pw](https://epg.pw/xmltv/epg_BR.xml), valida, converte para os modelos
locais e popula a interface. Não há backend: o feed manda
`access-control-allow-origin: *` e o documento comprimido tem ~220 KB.

## Requisitos

- Node.js 24+
- Para o APK: JDK 21 (com `javac`, não só JRE) e Android SDK com platform 36
  e build-tools 36

## Rodando

```bash
cd projects/epg-app
npm install
npm start
```

O app busca `https://epg.pw/xmltv/epg_BR.xml` direto do navegador/WebView
(`src/environments/environment.ts`).

## Como os dados entram

1. `fetch` do XMLTV, com timeout de 20 s e limite de 32 MB.
2. `XMLValidator` antes do parse, para não aceitar documento truncado.
3. `mappers.ts` converte datas (`20261024000000 +0000`), limpa nomes
   prefixados pela praça (`São Paulo/SP Record News`), descarta programas sem
   título ou com `stop <= start` e deduplica.
4. O snapshot parseado fica em IndexedDB por 5 minutos; se o download falhar,
   o app segue com o último snapshot e espera 30 s antes de tentar de novo.

Limitações da fonte, visíveis na interface:

- cobertura de ~2 dias em UTC (até 3 dias parciais no fuso de Brasília)
- 59% dos programas sem sinopse
- sem categoria, logo, avaliação ou país
- 25 nomes de canal colidem sem separar a praça

## Testes

```bash
cd projects/epg-app
npm run type-check
npm run lint
npm run e2e   # 10 passos de UI, com XMLTV de fixture
```

`npm run e2e` exige Playwright (`npm i -D playwright && npx playwright install
chromium`) ou `E2E_CHROMIUM_PATH` apontando para um Chromium. O app precisa
estar rodando em `http://localhost:8100` (ou ajuste `E2E_URL`).

## Android

```bash
cd projects/epg-app
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`.

O Gradle precisa do SDK localizado; use `ANDROID_HOME` ou um
`android/local.properties` com `sdk.dir=<caminho do SDK>`.

Antes de publicar: troque o `appId` (`com.example.epg`) e assine com uma
keystore própria.
