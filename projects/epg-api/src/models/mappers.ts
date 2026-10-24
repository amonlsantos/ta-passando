import type { Channel } from './channel.model';
import type { Program } from './program.model';
import type { XmltvChannel, XmltvProgramme } from '../schemas/xmltv.schema';

const XMLTV_DATETIME = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*(?:([+-])(\d{2})(\d{2}))?$/;

/**
 * XMLTV timestamps look like `20261024000000 +0000`. They are always local to
 * the declared offset, so the epoch is built in UTC and then shifted.
 */
export function parseXmltvDate(value: string): number | undefined {
  const match = XMLTV_DATETIME.exec(value.trim());
  if (!match) {
    return undefined;
  }

  const [, year, month, day, hour, minute, second, sign, offsetHours, offsetMinutes] = match;
  const utc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );

  if (Number.isNaN(utc)) {
    return undefined;
  }

  // Reject impossible dates such as 20260231, which Date.UTC would roll over.
  const check = new Date(utc);
  if (
    check.getUTCFullYear() !== Number(year) ||
    check.getUTCMonth() + 1 !== Number(month) ||
    check.getUTCDate() !== Number(day) ||
    check.getUTCHours() !== Number(hour) ||
    check.getUTCMinutes() !== Number(minute) ||
    check.getUTCSeconds() !== Number(second)
  ) {
    return undefined;
  }

  const offset =
    sign === undefined
      ? 0
      : (sign === '-' ? -1 : 1) * (Number(offsetHours) * 60 + Number(offsetMinutes));

  return Math.floor(utc / 1000) - offset * 60;
}

/** Reads a text node that may be a bare string or `{ '#text': ... }`. */
export function toText(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (value && typeof value === 'object' && '#text' in value) {
    const text = (value as { '#text': unknown })['#text'];
    return text === undefined || text === null ? '' : String(text).trim();
  }
  return '';
}

export function toTextArray(value: unknown): string[] {
  const entries = Array.isArray(value) ? value : [value];
  return entries.map(toText).filter((entry) => entry.length > 0);
}

/**
 * The feed prefixes some channels with their region ("São Paulo/SP Record
 * News"). Splitting it keeps names readable while still telling apart the
 * regional duplicates.
 */
export function splitChannelName(raw: string): { name: string; location?: string } {
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  const match = /^(.+?)\/([A-Z]{2})\s+(.+)$/.exec(collapsed);

  if (match) {
    const [, city, state, name] = match;
    return { name: name.trim(), location: `${city.trim()}/${state}` };
  }

  return { name: collapsed };
}

export function toChannel(raw: XmltvChannel): Channel {
  const { name, location } = splitChannelName(toText(raw['display-name']));
  return { id: raw['@_id'], name, location };
}

export function toProgram(
  raw: XmltvProgramme,
  channelId: string,
  channelName: string,
): Program | undefined {
  const start = parseXmltvDate(raw['@_start']);
  const stop = parseXmltvDate(raw['@_stop']);

  if (start === undefined || stop === undefined || stop <= start) {
    return undefined;
  }

  const title = toText(raw.title);
  if (title.length === 0) {
    return undefined;
  }

  const description = toText(raw.desc);
  const categories = toTextArray(raw.category);
  const date = toText(raw.date);

  return {
    id: `${channelId}-${start}`,
    channelId,
    channelName,
    title,
    subtitle: toText(raw['sub-title']) || undefined,
    description: description.length > 0 ? description : undefined,
    start,
    stop,
    category: categories[0],
    genres: categories,
    year: /^\d{4}$/.test(date) ? date : undefined,
  };
}
