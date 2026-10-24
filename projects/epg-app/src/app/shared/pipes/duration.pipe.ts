import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'duration', standalone: true })
export class DurationPipe implements PipeTransform {
  transform(start: number, stop: number): string {
    const totalMinutes = Math.max(0, Math.round((stop - start) / 60));

    if (totalMinutes < 60) {
      return `${totalMinutes}min`;
    }

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return minutes === 0 ? `${hours}h` : `${hours}h${minutes.toString().padStart(2, '0')}`;
  }
}
