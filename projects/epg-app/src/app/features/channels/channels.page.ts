import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonRefresher,
  IonRefresherContent,
  IonSearchbar,
  IonSpinner,
  IonTitle,
  IonToolbar,
  type RefresherCustomEvent,
  type SearchbarCustomEvent,
} from '@ionic/angular';
import { firstValueFrom } from 'rxjs';
import { addIcons } from 'ionicons';
import { star, starOutline } from 'ionicons/icons';
import { EpgService } from '../../core/services/epg.service';
import { FavoritesService } from '../../core/services/favorites.service';
import type { Channel } from '../../core/models/channel.model';

@Component({
  selector: 'app-channels',
  standalone: true,
  imports: [
    RouterLink,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonRefresher,
    IonRefresherContent,
    IonSearchbar,
    IonSpinner,
    IonTitle,
    IonToolbar,
  ],
  templateUrl: './channels.page.html',
  styleUrl: './channels.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChannelsPage implements OnInit {
  private readonly epg = inject(EpgService);
  private readonly favorites = inject(FavoritesService);

  readonly channels = signal<Channel[]>([]);
  readonly term = signal('');
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly favoritesOnly = signal(false);
  readonly favoriteCount = computed(() => this.favorites.count());

  readonly filtered = computed(() => {
    const term = this.term().trim().toLowerCase();
    const favoritesOnly = this.favoritesOnly();
    const favorites = this.favorites.ids();

    return this.channels().filter((channel) => {
      const matchesTerm = term.length === 0 || channel.name.toLowerCase().includes(term);
      const matchesFavorite = !favoritesOnly || favorites.has(channel.id);
      return matchesTerm && matchesFavorite;
    });
  });

  constructor() {
    addIcons({ star, starOutline });
  }

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      this.channels.set(await firstValueFrom(this.epg.getChannels()));
    } catch {
      this.error.set('Não foi possível carregar os canais.');
    } finally {
      this.loading.set(false);
    }
  }

  onSearch(event: SearchbarCustomEvent): void {
    this.term.set(event.detail.value ?? '');
  }

  toggleFavoritesOnly(): void {
    this.favoritesOnly.update((value) => !value);
  }

  async handleRefresh(event: RefresherCustomEvent): Promise<void> {
    await this.load();
    event.target.complete();
  }

  toggleFavorite(event: Event, channelId: string): void {
    event.preventDefault();
    event.stopPropagation();
    void this.favorites.toggle(channelId);
  }

  isFavorite(channelId: string): boolean {
    return this.favorites.ids().has(channelId);
  }

  trackChannel(_index: number, channel: Channel): string {
    return channel.id;
  }
}
