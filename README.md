# Tá Passando — EPG

Guia de programação de TV: aplicativo mobile (Ionic + Angular + Capacitor) e uma
API intermediária em Node.js/TypeScript que baixa um documento **XMLTV**,
normaliza a grade e serve JSON ao app.

```
projects/
├── epg-api/    # Fastify: baixa o XMLTV, normaliza e faz cache
└── epg-app/    # Ionic + Angular standalone + Capacitor
```

## Decisões do MVP

- **O app fala só com a API própria.** A fonte da grade é um XMLTV público
  (`https://epg.pw/xmltv/epg_BR.xml`), sem token; o app nunca baixa o XML.
- **Sem banco, sem Redis e sem login.** Favoritos são locais
  (`@capacitor/preferences`), cache é um snapshot em memória.
- **Normalização no backend.** O app nunca vê XMLTV; recebe apenas `Channel`,
  `Program` e `NowPlaying`.
- **A fonte cobre ~2 dias em UTC**, não uma semana. No fuso local isso vira
  até 3 dias parciais; a tela mostra os dias que existirem e a API não tem
  parâmetro de semana.

## Requisitos

- Node.js 24.15+ (o Angular 22 exige; use `nvm use 24`)
- JDK 21 e Android SDK, apenas para o build Android

## Subindo

Terminal 1 — provedor simulado (útil sem rede):

```bash
cd projects/epg-api
npm install
npm run mock            # http://localhost:4010/epg.xml
```

Terminal 2 — API:

```bash
cd projects/epg-api
# a única variável obrigatória é EPG_XMLTV_URL (tabela no README do api).
# para usar o mock:
EPG_XMLTV_URL=http://localhost:4010/epg.xml npm run dev   # http://localhost:3000
```

Sem definir a variável, a API usa o feed real:

```bash
EPG_XMLTV_URL=https://epg.pw/xmltv/epg_BR.xml npm run dev
```

Terminal 3 — app:

```bash
cd projects/epg-app
npm install
npx ionic serve         # http://localhost:8100
```

## Testes

```bash
cd projects/epg-api
npm test        # 25 testes de integração (node:test, sem deps extras)
```

A integração sobe a API compilada contra o mock em portas efêmeras: normalização
do XMLTV, de-duplicação, "AGORA", cache com `304`, snapshot antigo em caso de
queda e falhas do provedor (HTTP 500, XML malformado, timeout, documento grande).
Detalhes em `projects/epg-api/README.md`.

O app tem um teste de UI em navegador real, opcional (Playwright):

```bash
cd projects/epg-app
npm i -D playwright && npx playwright install chromium
npx ionic serve            # em outro terminal
npm run e2e
```

Detalhes de cada projeto nos READMEs próprios:
[`projects/epg-api/README.md`](projects/epg-api/README.md) ·
[`projects/epg-app/README.md`](projects/epg-app/README.md)

## O que ainda depende de você

- **`EPG_XMLTV_URL`**: o feed padrão é público e já funciona, mas nada garante
  disponibilidade ou estabilidade — é um serviço gratuito de terceiros.
- **`appId` do Android**: `com.example.epg` é um placeholder.
- **Cobertura de ~2 dias**: se você precisar de uma semana, essa fonte não
  atende; seria necessário outro provedor (pago) ou acumular snapshots.
- **Build Android**: o código está pronto, mas nunca foi compilado nesta
  máquina por falta do SDK.
