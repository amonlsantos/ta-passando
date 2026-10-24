import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  IonBackButton,
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonList,
  IonRefresher,
  IonRefresherContent,
  IonSpinner,
  IonTitle,
  IonToolbar,
  type RefresherCustomEvent,
} from '@ionic/angular';
import { firstValueFrom } from 'rxjs';
import { addIcons } from 'ionicons';
import { chevronForward, star, starOutline } from 'ionicons/icons';
import { EpgService } from '../../core/services/epg.service';
import { FavoritesService } from '../../core/services/favorites.service';
import { ClockService } from '../../core/services/clock.service';
import { DurationPipe } from '../../shared/pipes/duration.pipe';
import type { Channel } from '../../core/models/channel.model';
import type { Program } from '../../core/models/program.model';

interface ScheduleDay {
  key: string;
  label: string;
  weekday: string;
  isToday: boolean;
  programs: Program[];
}

@Component({
  selector: 'app-schedule',
  standalone: true,
  imports: [
    DatePipe,
    DurationPipe,
    RouterLink,
    IonBackButton,
    IonBadge,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonList,
    IonRefresher,
    IonRefresherContent,
    IonSpinner,
    IonTitle,
    IonToolbar,
  ],
  templateUrl: './schedule.page.html',
  styleUrl: './schedule.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SchedulePage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly epg = inject(EpgService);
  private readonly favorites = inject(FavoritesService);
  private readonly clock = inject(ClockService);

  readonly channelId = this.route.snapshot.paramMap.get('channelId') ?? '';
  readonly channelName = signal(this.channelFromState()?.name ?? '');
  readonly programs = signal<Program[]>([]);
  readonly selectedDay = signal<string | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly days = computed<ScheduleDay[]>(() => {
    const grouped = new Map<string, Program[]>();
    const formatter = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' });

    for (const program of this.programs()) {
      const key = toDayKey(program.start);
      const bucket = grouped.get(key);

      if (bucket) {
        bucket.push(program);
      } else {
        grouped.set(key, [program]);
      }
    }

    return [...grouped.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, programs]) => {
        const date = new Date(`${key}T00:00:00Z`);

        return {
          key,
          label: formatter.format(date),
          weekday: new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' })
            .format(date)
            .replace('.', ''),
          isToday: key === toDayKey(this.clock.now()),
          programs,
        };
      });
  });

  readonly visiblePrograms = computed(() => {
    const day = this.selectedDay();
    return this.days().find((entry) => entry.key === day)?.programs ?? [];
  });

  constructor() {
    addIcons({ chevronForward, star, starOutline });
  }

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const programs = await firstValueFrom(this.epg.getChannelPrograms(this.channelId));
      this.programs.set(programs);
      this.channelName.update((name) => name || (programs[0]?.channelName ?? ''));
      this.selectedDay.set(this.defaultDay(programs));
    } catch {
      this.error.set('Não foi possível carregar a programação deste canal.');
    } finally {
      this.loading.set(false);
    }
  }

  selectDay(key: string): void {
    this.selectedDay.set(key);
  }

  async handleRefresh(event: RefresherCustomEvent): Promise<void> {
    await this.load();
    event.target.complete();
  }

  isCurrent(program: Program): boolean {
    const now = this.clock.now();
    return program.start <= now && now < program.stop;
  }

  toggleFavorite(): void {
    void this.favorites.toggle(this.channelId);
  }

  isFavorite(): boolean {
    return this.favorites.ids().has(this.channelId);
  }

  private defaultDay(programs: Program[]): string | null {
    const today = toDayKey(this.clock.now());
    const hasToday = programs.some((program) => toDayKey(program.start) === today);

    if (hasToday) {
      return today;
    }

    return programs.length > 0 ? toDayKey(programs[0].start) : null;
  }

  private channelFromState(): Channel | undefined {
    return this.router.getCurrentNavigation()?.extras.state?.['channel'] as Channel | undefined;
  }
}

function toDayKey(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${date.getFullYear()}-${month}-${day}`;
}
