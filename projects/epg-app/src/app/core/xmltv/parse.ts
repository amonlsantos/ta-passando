import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { Channel } from '../models/channel.model';
import type { NowPlaying, Program } from '../models/program.model';
import { toChannel, toProgram, type XmltvChannel, type XmltvProgramme } from './mappers';

export interface EpgSnapshot {
  channels: Channel[];
  programs: Program[];
  sourceDate?: string;
  updatedAt: number;
}

export interface EpgIndex {
  channels: Channel[];
  byChannel: Map<string, Program[]>;
  byId: Map<string, Program>;
  sourceDate?: string;
  updatedAt: number;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => name === 'channel' || name === 'programme',
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const asArray = <T>(value: unknown): T[] =>
  value === undefined || value === null ? [] : Array.isArray(value) ? (value as T[]) : [value as T];

export function parseXmltv(xml: string): EpgSnapshot {
  // The parser is lenient and would silently "repair" a truncated document,
  // so well-formedness is checked first.
  const validation = XMLValidator.validate(xml);

  if (validation !== true) {
    throw new Error(`XMLTV inválido: ${validation.err.msg} (linha ${validation.err.line})`);
  }

  const document: unknown = parser.parse(xml);
  const tv = isRecord(document) && isRecord(document['tv']) ? document['tv'] : undefined;

  if (!tv) {
    throw new Error('Documento XMLTV sem <tv>');
  }

  const channels: Channel[] = [];
  const programs: Program[] = [];
  const nameById = new Map<string, string>();
  const seenPrograms = new Set<string>();

  for (const raw of asArray<XmltvChannel>(tv['channel'])) {
    if (!isRecord(raw) || typeof raw['@_id'] !== 'string' || raw['@_id'].length === 0) {
      continue;
    }
    if (nameById.has(raw['@_id'])) {
      continue;
    }

    const channel = toChannel(raw as unknown as XmltvChannel);
    channels.push(channel);
    nameById.set(channel.id, channel.name);
  }

  for (const raw of asArray<XmltvProgramme>(tv['programme'])) {
    if (!isRecord(raw)) {
      continue;
    }

    const channelId = raw['@_channel'];
    const channelName = typeof channelId === 'string' ? nameById.get(channelId) : undefined;

    if (channelName === undefined) {
      continue;
    }

    const program = toProgram(raw as unknown as XmltvProgramme, channelId as string, channelName);

    if (!program || seenPrograms.has(program.id)) {
      continue;
    }

    seenPrograms.add(program.id);
    programs.push(program);
  }

  programs.sort((left, right) =>
    left.channelId === right.channelId
      ? left.start - right.start
      : left.channelId.localeCompare(right.channelId),
  );

  return {
    channels,
    programs,
    sourceDate: typeof tv['@_date'] === 'string' ? tv['@_date'] : undefined,
    updatedAt: Date.now(),
  };
}

export function buildIndex(snapshot: EpgSnapshot): EpgIndex {
  const byChannel = new Map<string, Program[]>();
  const byId = new Map<string, Program>();

  for (const channel of snapshot.channels) {
    byChannel.set(channel.id, []);
  }

  for (const program of snapshot.programs) {
    byChannel.get(program.channelId)?.push(program);
    byId.set(program.id, program);
  }

  return {
    channels: snapshot.channels,
    byChannel,
    byId,
    sourceDate: snapshot.sourceDate,
    updatedAt: snapshot.updatedAt,
  };
}

export function buildNowPlaying(
  index: EpgIndex,
  channelIds: string[] | undefined,
  now: number,
): NowPlaying[] {
  const targets =
    channelIds === undefined
      ? index.channels
      : index.channels.filter((channel) => channelIds.includes(channel.id));

  return targets
    .map((channel) => currentProgram(channel, index.byChannel.get(channel.id) ?? [], now))
    .filter((entry): entry is NowPlaying => entry !== undefined);
}

function currentProgram(
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
