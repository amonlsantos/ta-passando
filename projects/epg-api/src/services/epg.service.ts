import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { config } from '../config/env';
import { XmltvDocumentSchema } from '../schemas/xmltv.schema';
import { XmltvClient, type XmltvValidators } from './xmltv.client';
import { toChannel, toProgram } from '../models/mappers';
import type { Channel } from '../models/channel.model';
import type { NowPlaying, Program } from '../models/program.model';
import { UpstreamPayloadError } from '../utils/errors';

interface Snapshot {
  channels: Channel[];
  byChannel: Map<string, Program[]>;
  byId: Map<string, Program>;
  sourceDate?: string;
  updatedAt: number;
}

export interface EpgStatus {
  ready: boolean;
  channels?: number;
  programs?: number;
  updatedAt?: string;
  sourceDate?: string;
}

const RETRY_COOLDOWN_MS = 30_000;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => name === 'channel' || name === 'programme',
});

export class EpgService {
  private snapshot: Snapshot | null = null;
  private validators: XmltvValidators = {};
  private inflight: Promise<Snapshot> | null = null;
  private failedAt = 0;

  constructor(private readonly client: XmltvClient = new XmltvClient()) {}

  async getChannels(): Promise<Channel[]> {
    return (await this.getSnapshot()).channels;
  }

  async getChannelSchedule(channelId: string): Promise<Program[] | undefined> {
    const snapshot = await this.getSnapshot();
    return snapshot.byChannel.get(channelId);
  }

  async getNowPlaying(channelIds?: string[]): Promise<NowPlaying[]> {
    const snapshot = await this.getSnapshot();
    const now = Math.floor(Date.now() / 1000);

    const targets =
      channelIds === undefined
        ? snapshot.channels
        : snapshot.channels.filter((channel) => channelIds.includes(channel.id));

    return targets
      .map((channel) => buildNowPlaying(channel, snapshot.byChannel.get(channel.id) ?? [], now))
      .filter((entry): entry is NowPlaying => entry !== undefined);
  }

  async getProgramById(programId: string): Promise<Program | undefined> {
    return (await this.getSnapshot()).byId.get(programId);
  }

  /** Cached-state only: never triggers a fetch, so it is safe for health checks. */
  getStatus(): EpgStatus {
    if (!this.snapshot) {
      return { ready: false };
    }

    return {
      ready: true,
      channels: this.snapshot.channels.length,
      programs: this.snapshot.byId.size,
      updatedAt: new Date(this.snapshot.updatedAt).toISOString(),
      sourceDate: this.snapshot.sourceDate,
    };
  }

  private async getSnapshot(): Promise<Snapshot> {
    if (this.snapshot && this.isFresh(this.snapshot.updatedAt)) {
      return this.snapshot;
    }

    // After a failure keep serving the last good snapshot for a while instead
    // of hammering a provider that is already down.
    if (this.snapshot && Date.now() - this.failedAt < RETRY_COOLDOWN_MS) {
      return this.snapshot;
    }

    if (!this.inflight) {
      this.inflight = this.refresh().finally(() => {
        this.inflight = null;
      });
    }

    try {
      return await this.inflight;
    } catch (error) {
      this.failedAt = Date.now();

      if (this.snapshot) {
        console.error('[epg] refresh failed, serving stale snapshot', error);
        return this.snapshot;
      }

      throw error;
    }
  }

  private async refresh(): Promise<Snapshot> {
    const result = await this.client.fetch(this.validators);

    if (result.notModified) {
      if (!this.snapshot) {
        throw new UpstreamPayloadError('provider returned 304 without a cached snapshot');
      }

      this.snapshot = { ...this.snapshot, updatedAt: Date.now() };
      this.failedAt = 0;
      return this.snapshot;
    }

    if (!result.body) {
      throw new UpstreamPayloadError('provider returned an empty body');
    }

    const snapshot = this.parse(result.body);

    this.snapshot = snapshot;
    this.validators = { etag: result.etag, lastModified: result.lastModified };
    this.failedAt = 0;

    return snapshot;
  }

  private parse(xml: string): Snapshot {
    // The parser is lenient and would silently "repair" a truncated document,
    // so well-formedness is checked first.
    const validation = XMLValidator.validate(xml);

    if (validation !== true) {
      throw new UpstreamPayloadError(
        `XMLTV document is not well-formed XML: ${validation.err.msg} (line ${validation.err.line})`,
      );
    }

    let document: unknown;

    try {
      document = parser.parse(xml);
    } catch (error) {
      throw new UpstreamPayloadError('XMLTV document is not valid XML', { cause: error });
    }

    const parsed = XmltvDocumentSchema.safeParse(document);

    if (!parsed.success) {
      throw new UpstreamPayloadError(parsed.error.message, { cause: parsed.error });
    }

    const { tv } = parsed.data;

    const channels: Channel[] = [];
    const byChannel = new Map<string, Program[]>();
    const byId = new Map<string, Program>();
    const nameById = new Map<string, string>();

    for (const raw of tv.channel) {
      const channel = toChannel(raw);

      if (byChannel.has(channel.id)) {
        continue;
      }

      channels.push(channel);
      byChannel.set(channel.id, []);
      nameById.set(channel.id, channel.name);
    }

    for (const raw of tv.programme) {
      const channelId = raw['@_channel'];
      const programs = byChannel.get(channelId);

      if (!programs) {
        continue;
      }

      const program = toProgram(raw, channelId, nameById.get(channelId) ?? '');

      if (!program || byId.has(program.id)) {
        continue;
      }

      programs.push(program);
      byId.set(program.id, program);
    }

    for (const programs of byChannel.values()) {
      programs.sort((left, right) => left.start - right.start);
    }

    return {
      channels,
      byChannel,
      byId,
      sourceDate: tv['@_date'],
      updatedAt: Date.now(),
    };
  }

  private isFresh(storedAt: number): boolean {
    return Date.now() - storedAt < config.cache.ttl * 1000;
  }
}

function buildNowPlaying(
  channel: Channel,
  programs: Program[],
  now: number,
): NowPlaying | undefined {
  const currentIndex = programs.findIndex(
    (program) => program.start <= now && now < program.stop,
  );

  if (currentIndex === -1) {
    return undefined;
  }

  const program = programs[currentIndex];

  return {
    channelId: channel.id,
    channelName: channel.name,
    channelLocation: channel.location,
    program,
    progress: programProgress(program, now),
    next: programs[currentIndex + 1],
  };
}

function programProgress(program: Program, now: number): number {
  const duration = program.stop - program.start;
  if (duration <= 0) {
    return 0;
  }

  return Math.min(1, Math.max(0, (now - program.start) / duration));
}
