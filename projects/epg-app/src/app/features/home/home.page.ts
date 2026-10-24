import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonList,
  IonProgressBar,
  IonRefresher,
  IonRefresherContent,
  IonSpinner,
  IonTitle,
  IonToolbar,
  type RefresherCustomEvent,
} from '@ionic/angular';
import { firstValueFrom } from 'rxjs';
import { addIcons } from 'ionicons';
import { star, starOutline } from 'ionicons/icons';
import { EpgService } from '../../core/services/epg.service';
import { FavoritesService } from '../../core/services/favorites.service';
import { ClockService } from '../../core/services/clock.service';
import { DurationPipe } from '../../shared/pipes/duration.pipe';
import type { NowPlaying, Program } from '../../core/models/program.model';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    DatePipe,
    DurationPipe,
    RouterLink,
    IonBadge,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonList,
    IonProgressBar,
    IonRefresher,
    IonRefresherContent,
    IonSpinner,
    IonTitle,
    IonToolbar,
  ],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage implements OnInit {
  private readonly epg = inject(EpgService);
  private readonly favorites = inject(FavoritesService);
  private readonly clock = inject(ClockService);

  readonly entries = signal<NowPlaying[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly favoritesOnly = signal(false);
  readonly favoriteCount = computed(() => this.favorites.count());

  readonly isEmpty = computed(() => !this.loading() && this.entries().length === 0);

  constructor() {
    addIcons({ star, starOutline });
  }

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    await this.favorites.whenReady();

    const channelIds = this.favoritesOnly() ? this.favorites.asList() : undefined;

    if (channelIds && channelIds.length === 0) {
      this.entries.set([]);
      this.loading.set(false);
      return;
    }

    try {
      this.entries.set(await firstValueFrom(this.epg.getNowPlaying(channelIds)));
    } catch {
      this.error.set('Não foi possível carregar a programação.');
    } finally {
      this.loading.set(false);
    }
  }

  async toggleFavoritesOnly(): Promise<void> {
    this.favoritesOnly.update((value) => !value);
    await this.load();
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
    return this.favorites.isFavorite(channelId);
  }

  progress(program: Program): number {
    const now = this.clock.now();
    const duration = program.stop - program.start;

    if (duration <= 0) {
      return 0;
    }

    return Math.min(1, Math.max(0, (now - program.start) / duration));
  }
}
