import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import type { Channel } from '../models/channel.model';
import type { NowPlaying, Program } from '../models/program.model';
import { buildIndex, buildNowPlaying, parseXmltv, type EpgIndex } from '../xmltv/parse';
import { readSnapshot, writeSnapshot } from './epg-cache';

const CACHE_TTL_MS = 5 * 60 * 1000;
const RETRY_COOLDOWN_MS = 30 * 1000;
const FETCH_TIMEOUT_MS = 20 * 1000;
const MAX_BYTES = 32 * 1024 * 1024;

@Injectable({ providedIn: 'root' })
export class EpgService {
  private index: EpgIndex | null = null;
  private inflight: Promise<EpgIndex> | null = null;
  private failedAt = 0;

  getChannels(): Observable<Channel[]> {
    return from(this.load()).pipe(map((index) => index.channels));
  }

  getChannelPrograms(channelId: string): Observable<Program[]> {
    return from(this.load()).pipe(
      map((index) => {
        const programs = index.byChannel.get(channelId);
        if (!programs) {
          throw new Error('Canal não encontrado');
        }
        return programs;
      }),
    );
  }

  getNowPlaying(channelIds?: string[]): Observable<NowPlaying[]> {
    return from(this.load()).pipe(
      map((index) => buildNowPlaying(index, channelIds, Math.floor(Date.now() / 1000))),
    );
  }

  getProgram(programId: string): Observable<Program> {
    return from(this.load()).pipe(
      map((index) => {
        const program = index.byId.get(programId);
        if (!program) {
          throw new Error('Programa não encontrado');
        }
        return program;
      }),
    );
  }

  private async load(): Promise<EpgIndex> {
    if (!this.index) {
      const cached = await readSnapshot();
      if (cached) {
        this.index = buildIndex(cached);
      }
    }

    if (this.index && Date.now() - this.index.updatedAt < CACHE_TTL_MS) {
      return this.index;
    }

    // After a failure keep serving the last good snapshot for a while instead
    // of hammering a feed that is already down.
    if (this.index && Date.now() - this.failedAt < RETRY_COOLDOWN_MS) {
      return this.index;
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

      if (this.index) {
        console.error('[epg] refresh failed, serving stale snapshot', error);
        return this.index;
      }

      throw error;
    }
  }

  private async refresh(): Promise<EpgIndex> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(environment.xmltvUrl, { signal: controller.signal });

      if (!response.ok) {
        throw new Error(`Falha ao baixar o XMLTV (HTTP ${response.status})`);
      }

      const xml = await response.text();

      if (xml.length > MAX_BYTES) {
        throw new Error('Documento XMLTV maior que o limite');
      }

      const snapshot = parseXmltv(xml);

      void writeSnapshot(snapshot).catch(() => undefined);

      this.index = buildIndex(snapshot);
      this.failedAt = 0;

      return this.index;
    } finally {
      clearTimeout(timer);
    }
  }
}
