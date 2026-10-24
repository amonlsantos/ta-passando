# EPG API

API intermediária (Fastify) que baixa um documento **XMLTV**, normaliza a grade
e serve JSON ao aplicativo mobile.

## Stack

Node.js 24 · TypeScript (strict) · Fastify 4 · Zod · fast-xml-parser

Sem banco de dados, sem Redis e sem autenticação de usuário no MVP.

## Como executar

```bash
npm install
npm run dev            # http://localhost:3000
```

A configuração vem do ambiente (ou de um `.env` no seu `.gitignore`). A única
variável obrigatória é `EPG_XMLTV_URL`; veja a tabela abaixo.

> O `.env.example` é **de propósito** ignorado pelo Git: a fonte da grade é
> configuração sua, não do repositório.

Produção: `npm run build && npm start`.
Typecheck: `npm run type-check`. Lint: `npm run lint`.

## Fonte dos dados

A grade vem de um XMLTV público:

```
https://epg.pw/xmltv/epg_BR.xml
```

É um documento de ~2,2 MB com ~196 canais e ~7.300 programas. O backend baixa
uma vez, mantém o resultado parseado em memória e revalida com
`If-None-Match`/`If-Modified-Since` — quando nada mudou, o provedor responde
`304` e não há novo download.

**Não há token nem chave de API.** O endpoint é aberto.

### Limitações da fonte (importantes para o produto)

- **Cobertura de ~2 dias em UTC.** O arquivo traz a grade de hoje e, em parte
  dos canais, de amanhã. Como os horários são UTC, no fuso de Brasília isso
  aparece como até 3 dias parciais. Não existe "semana": por isso a API não
  aceita mais `?week=` e a tela de programação mostra apenas os dias
  disponíveis.
- **Descrição vazia na maioria dos programas.** Cerca de 59% vêm com
  `<desc />`; nesses casos o app simplesmente não mostra a seção de sinopse.
- **Sem categoria, logo, classificação ou país** — o XMLTV deste provedor só
  traz `title`, `desc`, `date` e `audio/stereo`. Os campos correspondentes do
  modelo ficam ausentes.
- **Horários em UTC** (`+0000`). A API entrega epoch em segundos e o app
  agrupa por dia no fuso do aparelho.
- **Nomes com prefixo de praça** ("São Paulo/SP Record News"). O prefixo é
  separado em `location`, porque o mesmo canal aparece em mais de uma praça e
  sem isso a lista teria nomes duplicados.

## Testes

```bash
npm test        # 25 testes de integração; compila antes (pretest)
```

Sobe a API compilada contra o mock em **portas efêmeras**, então roda em
paralelo com um servidor de desenvolvimento. Sem dependências extras de teste:
usa `node:test` e `fetch` nativo. Cobertura:

- normalização: ordenação, de-duplicação, janelas inválidas descartadas,
  atributos (`<title lang="pt">`), entidades XML, `<desc />` vazio, `year`
  apenas quando o `<date>` tem 4 dígitos, múltiplas categorias;
- separação de praça no nome do canal, inclusive nomes que colidem;
- programas de canais não declarados são ignorados; canal sem grade devolve
  `[]`; canal/programa inexistente devolve `404`;
- `GET /api/programs/now`: só canais com programa no ar, `progress` em `0..1`,
  `next` correto e a distinção entre filtro ausente, vazio e ids desconhecidos;
- cache: `304` revalidado (o `/__stats` do mock confirma que não houve novo
  download) e snapshot antigo servido quando o provedor cai;
- resiliência: HTTP 500, XML malformado, corpo vazio, raiz errada, timeout e
  documento acima do limite — todos `502`;
- config: não sobe sem `EPG_XMLTV_URL` ou com URL inválida.

### Sem rede: use o provedor simulado

```bash
npm run mock            # http://localhost:4010/epg.xml
EPG_XMLTV_URL=http://localhost:4010/epg.xml npm run dev
```

O mock gera um XMLTV com os casos difíceis do feed real: prefixo de praça,
entidades (`&amp;`), `<desc />`, programa duplicado, janela de duração zero e
canal fantasma.

`MOCK_FAIL_MODE` simula falhas: `http-500`, `malformed`, `empty` ou
`wrong-root`. `GET /__stats` e `GET /__reset` expõem contadores de requisição
(usados pelos testes).

## Variáveis de ambiente

| Variável              | Obrigatória | Default    | Descrição                                    |
| --------------------- | ----------- | ---------- | -------------------------------------------- |
| `EPG_XMLTV_URL`       | sim         | –          | URL do documento XMLTV                       |
| `PORT`                | não         | `3000`     | Porta do servidor                            |
| `HOST`                | não         | `0.0.0.0`  | Bind address                                 |
| `NODE_ENV`            | não         | `development` | `development` \| `test` \| `production`   |
| `CACHE_TTL`           | não         | `300`      | TTL (s) do snapshot em memória               |
| `UPSTREAM_TIMEOUT_MS` | não         | `20000`    | Timeout do download do XMLTV                 |
| `XMLTV_MAX_BYTES`     | não         | `33554432` | Tamanho máximo do documento, após descompressão |

A configuração é validada com Zod na inicialização: sem `EPG_XMLTV_URL` ou com
uma URL inválida o processo não sobe.

## Endpoints

### `GET /health`

Não dispara download; reporta apenas o estado do snapshot em memória.

```json
{
  "status": "ok",
  "xmltv": {
    "ready": true,
    "channels": 196,
    "programs": 7321,
    "updatedAt": "2026-10-24T19:39:14.292Z",
    "sourceDate": "20261024080003 +0000"
  }
}
```

Antes da primeira requisição de dados, `xmltv.ready` é `false`.

### `GET /api/channels`

```json
[
  { "id": "417184", "name": "Record News", "location": "São Paulo/SP" },
  { "id": "417185", "name": "Adult Swim HD" }
]
```

`location` só existe quando o feed prefixa o nome com a praça. `name` é o nome
limpo, com espaços normalizados.

### `GET /api/channels/:channelId/programs`

Todos os programas disponíveis para o canal, ordenados por início. Não há
parâmetro de semana: a fonte cobre ~2 dias em UTC (até 3 dias parciais no fuso
local).

```json
[
  {
    "id": "417184-1792800000",
    "channelId": "417184",
    "channelName": "Record News",
    "title": "Horário Eleitoral Gratuito",
    "start": 1792800000,
    "stop": 1792800600,
    "genres": []
  }
]
```

Regras de normalização:

- `start`/`stop` vêm de `YYYYMMDDHHMMSS ±ZZZZ`; o offset é aplicado e o
  resultado é epoch em segundos. Datas impossíveis (`20260231`) são rejeitadas.
- `id` é sintético e estável: `${channelId}-${start}`. Programas repetidos com
  o mesmo `id` são descartados (o primeiro vence).
- Programas com `stop <= start` ou sem título são descartados.
- `<desc />` vira `undefined` (o app não mostra sinopse vazia).
- `year` só é preenchido quando `<date>` tem exatamente 4 dígitos; o feed usa
  `YYYYMMDD`, que é data de exibição e não ano de produção.
- `category` é a primeira categoria e `genres` traz todas.

### `GET /api/programs/now`

Programas no ar (`start <= now < stop`) com progresso e o próximo programa.
Query opcional: `channelIds=id1,id2`.

```json
[
  {
    "channelId": "417184",
    "channelName": "Record News",
    "channelLocation": "São Paulo/SP",
    "progress": 0.154,
    "program": { "id": "417184-1792869262", "title": "Doc Investigação" },
    "next": { "id": "417184-1792871062", "title": "Jornal da Record" }
  }
]
```

`progress` é a **fração** decorrida do programa atual, de `0` a `1`.

`channelIds` distingue "sem filtro" de "filtro vazio": ausente devolve todos os
canais; `channelIds=` (vazio) ou só ids desconhecidos devolvem `[]`. É o que
permite ao app mostrar o estado "nenhum favorito" sem listar todos os canais.

Como o documento inteiro já está em memória, este endpoint não faz fan-out nem
requisição ao provedor — é uma varredura no snapshot.

### `GET /api/programs/:programId`

Detalhes de um programa pelo `id` derivado. Como todo o documento é indexado em
memória, não há chamada ao provedor. Ids desconhecidos devolvem `404`.

## Erros

Formato único:

```json
{ "error": "invalid_request", "message": "Invalid request parameters", "issues": [] }
```

| Situação                                  | Status |
| ----------------------------------------- | ------ |
| Parâmetros inválidos (ids)                | 400    |
| Canal ou programa não encontrado          | 404    |
| Configuração ausente/inválida             | fail-fast na inicialização |
| Provedor 4xx/5xx                          | 502    |
| XML malformado, vazio ou fora do schema   | 502    |
| Provedor inacessível ou timeout           | 502    |
| Documento acima de `XMLTV_MAX_BYTES`      | 502    |
| Erro inesperado                           | 500    |

Falhas do provedor nunca são expostas com o corpo original; o detalhe é apenas
logado. Requisições de rede respeitam `UPSTREAM_TIMEOUT_MS`; falha de DNS,
conexão recusada ou timeout viram `502 upstream_error`, nunca `500`.

## Cache e resiliência

Um único snapshot em memória (`src/services/epg.service.ts`), com TTL
(`CACHE_TTL`):

1. **Revalidação condicional.** O snapshot guarda `ETag`/`Last-Modified`. Ao
   expirar, a próxima requisição manda `If-None-Match`; um `304` renova o TTL
   sem reparsear o documento.
2. **Single-flight.** Requisições concorrentes durante um refresh aguardam a
   mesma promise, em vez de disparar vários downloads de 2 MB.
3. **Stale-on-error.** Se o refresh falhar e já houver snapshot, ele continua
   sendo servido (com log de erro) e o refresh é desencorajado por 30 s. Sem
   snapshot, a resposta é `502`.

## Estrutura

```
src/
├── config/env.ts             # env validado com Zod
├── models/                   # Channel, Program, NowPlaying + mappers XMLTV
├── routes/                   # apenas HTTP: validam entrada e delegam
├── schemas/xmltv.schema.ts   # contrato do documento XMLTV
├── services/
│   ├── xmltv.client.ts       # download, ETag e limites de tamanho
│   └── epg.service.ts        # parse, snapshot, cache e regras de negócio
├── types/fastify.d.ts        # augment do FastifyInstance
├── utils/                    # erros e mapeamento HTTP
└── server.ts
test/
├── mock-epg.mjs              # provedor XMLTV simulado (dev e testes)
├── helpers.mjs               # portas efêmeras, spawn, cliente HTTP
└── api.test.mjs              # testes de integração (node:test)
```
