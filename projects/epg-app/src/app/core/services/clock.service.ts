import { Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { interval, map, startWith } from 'rxjs';

const TICK_MS = 30_000;

@Injectable({ providedIn: 'root' })
export class ClockService {
  readonly now = toSignal(
    interval(TICK_MS).pipe(
      startWith(0),
      map(() => Math.floor(Date.now() / 1000)),
    ),
    { initialValue: Math.floor(Date.now() / 1000) },
  );
}
