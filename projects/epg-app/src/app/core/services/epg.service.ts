import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { Channel } from '../models/channel.model';
import type { NowPlaying, Program } from '../models/program.model';

@Injectable({ providedIn: 'root' })
export class EpgService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  getChannels(): Observable<Channel[]> {
    return this.http.get<Channel[]>(`${this.baseUrl}/api/channels`);
  }

  getChannelPrograms(channelId: string): Observable<Program[]> {
    return this.http.get<Program[]>(`${this.baseUrl}/api/channels/${channelId}/programs`);
  }

  getNowPlaying(channelIds?: string[]): Observable<NowPlaying[]> {
    const params = channelIds?.length ? new HttpParams().set('channelIds', channelIds.join(',')) : undefined;
    return this.http.get<NowPlaying[]>(`${this.baseUrl}/api/programs/now`, { params });
  }

  getProgram(programId: string): Observable<Program> {
    return this.http.get<Program>(`${this.baseUrl}/api/programs/${programId}`);
  }
}
