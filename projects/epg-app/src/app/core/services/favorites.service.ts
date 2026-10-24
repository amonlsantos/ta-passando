import { Injectable, computed, inject, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

const STORAGE_KEY = 'epg.favoriteChannels';

@Injectable({ providedIn: 'root' })
export class FavoritesService {
  private readonly channelIds = signal<ReadonlySet<string>>(new Set());
  private readonly restored = signal(false);
  private readonly restorePromise: Promise<void>;

  readonly ids = this.channelIds.asReadonly();
  readonly count = computed(() => this.channelIds().size);
  readonly ready = this.restored.asReadonly();

  constructor() {
    this.restorePromise = this.restore();
  }

  isFavorite(channelId: string): boolean {
    return this.channelIds().has(channelId);
  }

  asList(): string[] {
    return [...this.channelIds()];
  }

  async whenReady(): Promise<void> {
    await this.restorePromise;
  }

  async toggle(channelId: string): Promise<void> {
    await this.restorePromise;

    const next = new Set(this.channelIds());

    if (next.has(channelId)) {
      next.delete(channelId);
    } else {
      next.add(channelId);
    }

    this.channelIds.set(next);
    await Preferences.set({ key: STORAGE_KEY, value: JSON.stringify([...next]) });
  }

  private async restore(): Promise<void> {
    try {
      const { value } = await Preferences.get({ key: STORAGE_KEY });
      const stored: unknown = value ? JSON.parse(value) : [];

      this.channelIds.set(new Set(Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : []));
    } catch {
      this.channelIds.set(new Set());
    } finally {
      this.restored.set(true);
    }
  }
}
