import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonBackButton,
  IonBadge,
  IonButton,
  IonButtons,
  IonChip,
  IonContent,
  IonHeader,
  IonLabel,
  IonProgressBar,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { firstValueFrom } from 'rxjs';
import { EpgService } from '../../core/services/epg.service';
import { ClockService } from '../../core/services/clock.service';
import { DurationPipe } from '../../shared/pipes/duration.pipe';
import type { Program } from '../../core/models/program.model';

@Component({
  selector: 'app-program',
  standalone: true,
  imports: [
    DatePipe,
    DurationPipe,
    IonBackButton,
    IonBadge,
    IonButton,
    IonButtons,
    IonChip,
    IonContent,
    IonHeader,
      IonLabel,
    IonProgressBar,
    IonSpinner,
    IonTitle,
    IonToolbar,
  ],
  templateUrl: './program.page.html',
  styleUrl: './program.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgramPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly epg = inject(EpgService);
  private readonly clock = inject(ClockService);

  private readonly programId = this.route.snapshot.paramMap.get('programId') ?? '';

  readonly program = signal<Program | null>(this.programFromState() ?? null);
  readonly channelName = signal<string>(this.channelNameFromState());
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly isCurrent = computed(() => {
    const program = this.program();
    if (!program) {
      return false;
    }

    const now = this.clock.now();
    return program.start <= now && now < program.stop;
  });

  longDate(unixSeconds: number): string {
    return new Intl.DateTimeFormat('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(new Date(unixSeconds * 1000));
  }

  readonly progress = computed(() => {
    const program = this.program();
    if (!program) {
      return 0;
    }

    const now = this.clock.now();
    const duration = program.stop - program.start;

    if (duration <= 0) {
      return 0;
    }

    return Math.min(1, Math.max(0, (now - program.start) / duration));
  });

  async ngOnInit(): Promise<void> {
    if (this.program()) {
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const program = await firstValueFrom(this.epg.getProgram(this.programId));
      this.program.set(program);
      this.channelName.set(program.channelName ?? '');
    } catch {
      this.error.set('Não foi possível carregar os detalhes do programa.');
    } finally {
      this.loading.set(false);
    }
  }

  retry(): void {
    this.program.set(null);
    void this.ngOnInit();
  }

  private programFromState(): Program | undefined {
    return this.router.getCurrentNavigation()?.extras.state?.['program'] as Program | undefined;
  }

  private channelNameFromState(): string {
    const state = this.router.getCurrentNavigation()?.extras.state;
    const name = state?.['channelName'];

    return typeof name === 'string' ? name : '';
  }
}
