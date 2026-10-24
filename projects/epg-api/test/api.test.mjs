/**
 * Integration tests for the XMLTV-backed API.
 *
 * Each scenario boots the compiled server against the mock provider on
 * ephemeral ports, so the suite runs in parallel with a development server.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  freePort,
  startApi,
  startApiExpectingFailure,
  startBlackHole,
  startMock,
  startOversizedProvider,
} from './helpers.mjs';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function setup({ failMode = 'ok', apiEnv = {} } = {}) {
  const port = await freePort();
  const mock = await startMock(port, { failMode });
  const api = await startApi({ xmltvUrl: mock.url, env: apiEnv });

  return {
    mock,
    api,
    async close() {
      await api.stop();
      await mock.stop();
    },
  };
}

describe('health', () => {
  let ctx;

  before(async () => {
    ctx = await setup();
  });

  after(() => ctx.close());

  it('reports readiness without touching the provider', async () => {
    const { status, body } = await ctx.api.request('/health');

    assert.equal(status, 200);
    assert.equal(body.status, 'ok');
    assert.equal(body.xmltv.ready, false);
    assert.equal((await ctx.mock.stats()).requests, 0);
  });

  it('reports the cached snapshot after the first data request', async () => {
    await ctx.api.request('/api/channels');

    const { body } = await ctx.api.request('/health');

    assert.equal(body.xmltv.ready, true);
    assert.equal(body.xmltv.channels, 5);
    assert.equal(body.xmltv.programs, 6);
    assert.equal(typeof body.xmltv.updatedAt, 'string');
  });
});

describe('channels', () => {
  let ctx;

  before(async () => {
    ctx = await setup();
  });

  after(() => ctx.close());

  it('lists every declared channel and splits the region prefix', async () => {
    const { status, body } = await ctx.api.request('/api/channels');

    assert.equal(status, 200);
    assert.equal(body.length, 5);

    const alpha = body.find((channel) => channel.id === 'ch-alpha');
    assert.deepEqual(alpha, { id: 'ch-alpha', name: 'Canal Alpha', location: 'São Paulo/SP' });

    const beta = body.find((channel) => channel.id === 'ch-beta');
    assert.equal(beta.name, 'Canal Beta & Cia', 'XML entities must be decoded');
    assert.equal(beta.location, undefined);

    const regional = body.find((channel) => channel.id === 'ch-regional');
    assert.equal(regional.name, 'Canal Alpha', 'same name as the São Paulo feed');
    assert.equal(regional.location, 'Rio de Janeiro/RJ');
  });
});

describe('channel schedule', () => {
  let ctx;

  before(async () => {
    ctx = await setup();
  });

  after(() => ctx.close());

  it('normalises, sorts, de-duplicates and drops invalid windows', async () => {
    const { status, body } = await ctx.api.request('/api/channels/ch-alpha/programs');

    assert.equal(status, 200);
    assert.deepEqual(
      body.map((program) => program.title),
      ['Programa Anterior', 'Programa no Ar', 'A Seguir'],
    );
  });

  it('maps attributes, empty descriptions and the year field', async () => {
    const { body } = await ctx.api.request('/api/channels/ch-alpha/programs');
    const onAir = body.find((program) => program.title === 'Programa no Ar');
    const previous = body.find((program) => program.title === 'Programa Anterior');

    assert.equal(onAir.subtitle, 'Edição de hoje');
    assert.equal(onAir.description, 'Sinopse do programa no ar.');
    assert.equal(onAir.category, 'Jornalismo');
    assert.deepEqual(onAir.genres, ['Jornalismo']);
    assert.equal(onAir.year, '2024');
    assert.equal(onAir.channelName, 'Canal Alpha');
    assert.equal(onAir.id, `ch-alpha-${onAir.start}`);

    assert.equal(previous.description, undefined, 'empty <desc /> becomes undefined');
    assert.equal(previous.year, undefined, 'an 8-digit <date> is not a year');
  });

  it('keeps repeated categories as genres', async () => {
    const { body } = await ctx.api.request('/api/channels/ch-gamma/programs');

    assert.equal(body.length, 1);
    assert.equal(body[0].category, 'Série');
    assert.deepEqual(body[0].genres, ['Série', 'Drama']);
  });

  it('returns an empty list for a channel without programmes', async () => {
    const { status, body } = await ctx.api.request('/api/channels/ch-empty/programs');

    assert.equal(status, 200);
    assert.deepEqual(body, []);
  });

  it('returns 404 for an unknown channel', async () => {
    const { status, body } = await ctx.api.request('/api/channels/nope/programs');

    assert.equal(status, 404);
    assert.equal(body.error, 'not_found');
  });

  it('skips programmes for undeclared channels', async () => {
    const { body } = await ctx.api.request('/api/channels');
    const ids = body.map((channel) => channel.id);

    assert.ok(!ids.includes('ch-ghost'));
  });
});

describe('now playing', () => {
  let ctx;

  before(async () => {
    ctx = await setup();
  });

  after(() => ctx.close());

  it('returns only channels with a programme on air', async () => {
    const { status, body } = await ctx.api.request('/api/programs/now');

    assert.equal(status, 200);
    assert.deepEqual(
      body.map((entry) => entry.channelId).sort(),
      ['ch-alpha', 'ch-beta', 'ch-gamma', 'ch-regional'],
    );

    const alpha = body.find((entry) => entry.channelId === 'ch-alpha');
    assert.equal(alpha.channelName, 'Canal Alpha');
    assert.equal(alpha.program.title, 'Programa no Ar');
    assert.ok(alpha.progress >= 0 && alpha.progress <= 1, 'progress is a fraction');
    assert.equal(alpha.next.title, 'A Seguir');
  });

  it('filters by channelIds', async () => {
    const { body } = await ctx.api.request('/api/programs/now?channelIds=ch-alpha,ch-beta');

    assert.deepEqual(
      body.map((entry) => entry.channelId).sort(),
      ['ch-alpha', 'ch-beta'],
    );
  });

  it('treats an empty channelIds as no channels', async () => {
    const { status, body } = await ctx.api.request('/api/programs/now?channelIds=');

    assert.equal(status, 200);
    assert.deepEqual(body, []);
  });

  it('ignores unknown channelIds', async () => {
    const { body } = await ctx.api.request('/api/programs/now?channelIds=ghost');

    assert.deepEqual(body, []);
  });
});

describe('programme details', () => {
  let ctx;

  before(async () => {
    ctx = await setup();
  });

  after(() => ctx.close());

  it('finds a programme by its derived id', async () => {
    const { body: programs } = await ctx.api.request('/api/channels/ch-beta/programs');
    const target = programs[0];

    const { status, body } = await ctx.api.request(`/api/programs/${target.id}`);

    assert.equal(status, 200);
    assert.equal(body.title, 'Jantar & Cia');
    assert.equal(body.description, 'Conversa & receitas.');
    assert.equal(body.channelName, 'Canal Beta & Cia');
  });

  it('returns 404 for an unknown programme', async () => {
    const { status, body } = await ctx.api.request('/api/programs/does-not-exist');

    assert.equal(status, 404);
    assert.equal(body.error, 'not_found');
  });
});

describe('caching', () => {
  it('revalidates with the stored ETag and serves 304 from the snapshot', async () => {
    const ctx = await setup({ apiEnv: { CACHE_TTL: '1' } });

    try {
      await ctx.api.request('/api/channels');
      assert.equal((await ctx.mock.stats()).requests, 1);

      await wait(1200);
      await ctx.api.request('/api/channels');

      const stats = await ctx.mock.stats();
      assert.equal(stats.requests, 2, 'the snapshot expired');
      assert.equal(stats.notModified, 1, 'the second request was conditional');

      await ctx.api.request('/api/channels');
      assert.equal((await ctx.mock.stats()).requests, 2, 'still inside the TTL');
    } finally {
      await ctx.close();
    }
  });

  it('serves the last good snapshot when a refresh fails', async () => {
    const ctx = await setup({ apiEnv: { CACHE_TTL: '1' } });

    try {
      const first = await ctx.api.request('/api/channels');
      assert.equal(first.body.length, 5);

      await ctx.mock.stop();
      await wait(1200);

      const { status, body } = await ctx.api.request('/api/channels');

      assert.equal(status, 200, 'stale data beats an outage');
      assert.equal(body.length, 5);
    } finally {
      await ctx.close();
    }
  });
});

describe('upstream failures', () => {
  const scenarios = [
    ['http-500', 'the provider answers 500'],
    ['malformed', 'the document is not well-formed XML'],
    ['empty', 'the document is empty'],
    ['wrong-root', 'the document is not XMLTV'],
  ];

  for (const [failMode, description] of scenarios) {
    it(`returns 502 when ${description}`, async () => {
      const ctx = await setup({ failMode });

      try {
        const { status, body } = await ctx.api.request('/api/channels');

        assert.equal(status, 502);
        assert.equal(body.error, 'upstream_error');
      } finally {
        await ctx.close();
      }
    });
  }

  it('returns 502 when the provider hangs past the timeout', async () => {
    const provider = await startBlackHole();
    const api = await startApi({
      xmltvUrl: provider.url,
      env: { UPSTREAM_TIMEOUT_MS: '300' },
    });

    try {
      const { status, body } = await api.request('/api/channels');

      assert.equal(status, 502);
      assert.equal(body.error, 'upstream_error');
    } finally {
      await api.stop();
      await provider.stop();
    }
  });

  it('returns 502 when the document exceeds the size limit', async () => {
    const provider = await startOversizedProvider(5000);
    const api = await startApi({
      xmltvUrl: provider.url,
      env: { XMLTV_MAX_BYTES: '1000' },
    });

    try {
      const { status, body } = await api.request('/api/channels');

      assert.equal(status, 502);
      assert.equal(body.error, 'upstream_error');
    } finally {
      await api.stop();
      await provider.stop();
    }
  });
});

describe('configuration', () => {
  it('refuses to start without EPG_XMLTV_URL', async () => {
    const { code, output } = await startApiExpectingFailure({ EPG_XMLTV_URL: '' });

    assert.equal(code, 1);
    assert.match(output, /EPG_XMLTV_URL/);
  });

  it('refuses to start with an invalid URL', async () => {
    const { code, output } = await startApiExpectingFailure({ EPG_XMLTV_URL: 'not-a-url' });

    assert.equal(code, 1);
    assert.match(output, /EPG_XMLTV_URL/);
  });
});
