# Tá Passando — App

Aplicativo mobile de guia de programação (EPG) com **Ionic 9 + Angular 22
(standalone) + Capacitor**. Ele consome **apenas** a API intermediária em
`../epg-api`, que baixa e normaliza o XMLTV — o app nunca vê o XML nem a fonte.

## Stack

Angular 22 (standalone, signals) · Ionic 9 · Capacitor 8 ·
`@capacitor/preferences` (favoritos) · RxJS

## Como executar

```bash
npm install
npx ionic serve          # http://localhost:8100
```

A URL da API vem de `src/environments/environment.ts` (usado em desenvolvimento)
e de `src/environments/environment.prod.ts` (build de produção, via file
replacement em `angular.json`).

| Ambiente                 | `apiUrl`                              |
| ------------------------ | ------------------------------------- |
| `ionic serve` / navegador| `http://localhost:3000`               |
| Emulador Android         | `http://10.0.2.2:3000`                |
| Device físico            | `http://<ip-da-máquina>:3000`         |

Para rodar o backend contra o mock, veja `npm run mock` em `../epg-api/README.md`.

Outros scripts: `npm run build`, `npm run lint`, `npm run type-check`.

## Testes end-to-end

Há um teste de UI em navegador real (Playwright) em `test/e2e/ui.e2e.mjs`.
O Playwright **não** é dependência do projeto, para não pesar o `npm install`:

```bash
npm i -D playwright
npx playwright install chromium

# terminal 1: app
npx ionic serve

# terminal 2: teste (sobe o mock e a API sozinho)
npm run e2e
```

Variáveis: `E2E_URL` (padrão `http://localhost:8100`), `API_PORT` (3000) e
`E2E_CHROMIUM_PATH` para reaproveitar um Chromium já instalado em vez de baixar
outro. Os 10 passos cobrem boot, "AGORA" com progresso, busca de canais,
favoritos (inclusive persistindo após reload e o estado vazio do filtro), a
grade com a faixa "AGORA" (e a faixa de dias quando há mais de um), a tela de
detalhes com data em pt-BR, navegação de volta e a ausência de erros no console.

## Telas

| Rota                    | Tela        | O que faz                                                          |
| ----------------------- | ----------- | ------------------------------------------------------------------ |
| `/tabs/now`             | Agora       | Programa no ar por canal, progresso, próximo, filtro de favoritos  |
| `/tabs/channels`        | Canais      | Lista com busca, favoritos e navegação para a programação           |
| `/schedule/:channelId`  | Programação | Dias disponíveis agrupados, faixa "AGORA" no programa atual        |
| `/program/:programId`   | Programa    | Detalhes, sinopse, progresso                                        |

A navegação entre telas passa o objeto já carregado pelo `state` do router
(canal e/ou programa), evitando uma segunda ida ao backend. Se o app for
aberto direto por URL, a página volta ao endpoint e, se ele não souber
resolver o id, exibe o estado de erro com "tentar novamente".

## Estrutura

```
src/app/
├── app.component.*        # ion-app + ion-router-outlet
├── app.config.ts          # provideIonicAngular, provideHttpClient, provideRouter
├── app.routes.ts          # rotas lazy por loadComponent
├── core/
│   ├── models/            # Channel, Program, NowPlaying
│   └── services/          # epg, favorites, clock, duration (pipe)
├── features/
│   ├── home/              # Agora
│   ├── channels/          # Canais
│   ├── schedule/          # Programação
│   └── program/           # Detalhes
└── shared/shell/          # ion-tabs (Agora | Canais)
```

## Notas de implementação

- **Favoritos** ficam em `localStorage`/`Preferences` sob
  `epg.favoriteChannels`. `FavoritesService.restore()` é assíncrono, então
  `whenReady()` é aguardado antes de ler ou alterar a lista — evita a corrida em
  que o restore sobrescreve um favorito recém-alterado.
- **"AGORA" e progresso** usam `ClockService`, que emite a cada 30 s; a tela não
  depende de polling da API para atualizar o que está no ar.
- **A grade agrupa por dia no fuso do dispositivo** (`toDayKey` usa a data
  local), enquanto os horários são exibidos no mesmo fuso, então a faixa de
  PROGRAMAÇÃO nunca contradiz as horas mostradas. A fonte cobre ~2 dias em UTC
  (até 3 dias parciais no fuso local), então a faixa de dias só aparece quando
  há mais de um.
- **Nomes de canal repetidos:** o XMLTV prefixa a praça ("São Paulo/SP Record
  News"). O backend separa isso em `location`, exibido como linha secundária na
  lista, para não haver dois "Record News" indistinguíveis.
- **Sinopse opcional:** ~59% dos programas vêm sem descrição; a tela de detalhes
  simplesmente omite a seção nesse caso.
- **Virtualização:** a lista de canais usa `ion-list` com `@for` e `track`.
  A EPG pode ter centenas de canais; se isso passar a pesar em aparelhos
  modestos, o caminho é trocar por `cdk-virtual-scroll-viewport` do
  `@angular/cdk` (`itemSize` fixo) — `IonVirtualScroll` não existe mais no
  `@ionic/angular` 9.
- **Filtro de favoritos:** a Home não faz requisição quando o filtro está ativo
  e não há favoritos; o backend também trata `channelIds=` vazio como lista
  vazia (e não como "todos").

## Android

```bash
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

Build verificado nesta máquina: **4,9 MB**, `com.example.epg`, `minSdk 24`,
`targetSdk 36`, assinado com a chave de debug.

Pré-requisitos usados:

- SDK em `~/Android/Sdk` com `platforms;android-36`, `build-tools;36.0.0` e
  `platform-tools`; `android/local.properties` aponta `sdk.dir` para ele
  (o arquivo é ignorado pelo Git).
- JDK 21 **completo** em `~/.local/jdk21`.

> **WSL:** o `java` do `PATH` pode ser um wrapper que chama o `java.exe` do
> Windows. Ele não resolve caminhos Linux e o Gradle falha com
> `ClassNotFoundException`. Force o JDK Linux:
>
> ```bash
> export JAVA_HOME="$HOME/.local/jdk21"
> export PATH="$JAVA_HOME/bin:$PATH"
> ```

Para instalar e abrir em um emulador/dispositivo:

```bash
npx cap run android       # precisa de device conectado ou AVD
# ou
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb reverse tcp:3000 tcp:3000   # para o app alcançar a API local
```

O `appId` é `com.example.epg` em `capacitor.config.ts` — troque antes de
publicar.

`android/app/src/debug/AndroidManifest.xml` libera tráfego HTTP em claro
(`usesCleartextTraffic`) só no build de **debug**, para permitir o backend local
em `http://`. Builds de release continuam exigindo HTTPS.
