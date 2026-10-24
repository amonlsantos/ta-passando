/**
 * Mock XMLTV provider for local development and integration tests.
 *
 * Serves a single document that mirrors the real feed: region-prefixed channel
 * names, XML entities, attribute-carrying text nodes, empty <desc />, duplicate
 * programmes and programmes outside their own window.
 *
 * Usage: node test/mock-epg.mjs [port]
 * Env:   MOCK_FAIL_MODE=ok|http-500|malformed|empty|wrong-root
 */
import { createServer } from 'node:http';

const port = Number(process.argv[2] ?? process.env.MOCK_PORT ?? 4010);
const failMode = process.env.MOCK_FAIL_MODE ?? 'ok';

const escape = (value) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const xmltvDate = (unixSeconds) => {
  const iso = new Date(unixSeconds * 1000).toISOString();
  return `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)} +0000`;
};

const now = Math.floor(Date.now() / 1000);
const MINUTE = 60;
const HOUR = 3600;

const channels = [
  { id: 'ch-alpha', displayName: 'São Paulo/SP Canal Alpha' },
  { id: 'ch-beta', displayName: 'Canal Beta & Cia' },
  { id: 'ch-gamma', displayName: 'Canal Gamma' },
  { id: 'ch-empty', displayName: 'Canal Vazio' },
  { id: 'ch-regional', displayName: 'Rio de Janeiro/RJ Canal Alpha' },
];

/** @type {{channel: string, start: number, stop: number, title: string, extra?: string}[]} */
const programmes = [
  {
    channel: 'ch-alpha',
    start: now - 30 * MINUTE,
    stop: now + 30 * MINUTE,
    title: 'Programa no Ar',
    extra: '<sub-title lang="pt">Edição de hoje</sub-title><desc lang="pt">Sinopse do programa no ar.</desc><category lang="pt">Jornalismo</category><date>2024</date>',
  },
  {
    channel: 'ch-alpha',
    start: now - 3 * HOUR,
    stop: now - 2 * HOUR,
    title: 'Programa Anterior',
    extra: '<desc />',
  },
  {
    channel: 'ch-alpha',
    start: now + 30 * MINUTE,
    stop: now + 90 * MINUTE,
    title: 'A Seguir',
    extra: '<desc />',
  },
  {
    channel: 'ch-beta',
    start: now - 10 * MINUTE,
    stop: now + 50 * MINUTE,
    title: 'Jantar & Cia',
    extra: '<desc lang="pt">Conversa &amp; receitas.</desc><date>20261024</date>',
  },
  {
    channel: 'ch-gamma',
    start: now - 2 * HOUR,
    stop: now + 1 * HOUR,
    title: 'Maratona Gamma',
    extra: '<category lang="pt">Série</category><category lang="pt">Drama</category>',
  },
  {
    channel: 'ch-regional',
    start: now - 5 * MINUTE,
    stop: now + 55 * MINUTE,
    title: 'Canal Alpha Regional',
  },
  // Same channel and start as the first one: must be de-duplicated.
  {
    channel: 'ch-alpha',
    start: now - 30 * MINUTE,
    stop: now + 30 * MINUTE,
    title: 'Duplicado',
  },
  // Zero-length window: must be dropped.
  { channel: 'ch-alpha', start: now + 2 * HOUR, stop: now + 2 * HOUR, title: 'Duração Zero' },
  // Channel that is not declared in <tv>: must be skipped.
  { channel: 'ch-ghost', start: now, stop: now + HOUR, title: 'Fantasma' },
];

const document = `<?xml version="1.0" encoding="UTF-8"?>
<tv date="20261024080003 +0000" generator-info-name="mock-epg">
${channels
  .map(
    (channel) => `  <channel id="${channel.id}">
    <display-name lang="pt">${escape(channel.displayName)}</display-name>
    <icon src="" />
  </channel>`,
  )
  .join('\n')}
${programmes
  .map(
    (programme) => `  <programme channel="${programme.channel}" start="${xmltvDate(programme.start)}" stop="${xmltvDate(programme.stop)}">
    <title lang="pt">${escape(programme.title)}</title>
${programme.extra ? `    ${programme.extra}` : '    <desc />'}
  </programme>`,
  )
  .join('\n')}
</tv>
`;

const etag = `"mock-${Buffer.byteLength(document)}"`;

const stats = { requests: 0, conditional: 0, notModified: 0 };

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://localhost:${port}`);

  if (url.pathname === '/__stats') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(stats));
    return;
  }

  if (url.pathname === '/__reset') {
    for (const key of Object.keys(stats)) {
      stats[key] = 0;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(stats));
    return;
  }

  stats.requests += 1;

  if (failMode === 'http-500') {
    response.writeHead(500, { 'content-type': 'text/plain' });
    response.end('provider is down');
    return;
  }

  if (request.headers['if-none-match']) {
    stats.conditional += 1;

    if (request.headers['if-none-match'] === etag) {
      stats.notModified += 1;
      response.writeHead(304, { etag });
      response.end();
      return;
    }
  }

  if (failMode === 'malformed') {
    response.writeHead(200, { 'content-type': 'text/xml', etag });
    response.end('<tv><channel id="broken">');
    return;
  }

  if (failMode === 'empty') {
    response.writeHead(200, { 'content-type': 'text/xml', etag });
    response.end('');
    return;
  }

  if (failMode === 'wrong-root') {
    response.writeHead(200, { 'content-type': 'text/xml', etag });
    response.end('<?xml version="1.0"?><rss><channel><title>not xmltv</title></channel></rss>');
    return;
  }

  response.writeHead(200, { 'content-type': 'text/xml; charset=utf-8', etag });
  response.end(document);
});

server.listen(port, () => {
  console.log(`mock-epg (xmltv) listening on http://localhost:${port}`);
});
