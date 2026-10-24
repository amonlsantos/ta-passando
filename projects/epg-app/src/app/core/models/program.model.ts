export interface Program {
  id: string;
  channelId: string;
  channelName?: string;
  title: string;
  subtitle?: string;
  description?: string;
  start: number;
  stop: number;
  category?: string;
  genres: string[];
  year?: string;
}

export interface NowPlaying {
  channelId: string;
  channelName: string;
  channelLocation?: string;
  program: Program;
  progress: number;
  next?: Program;
}
