import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IonIcon, IonLabel, IonTabBar, IonTabButton, IonTabs } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { radio, tv } from 'ionicons/icons';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [IonIcon, IonLabel, IonTabBar, IonTabButton, IonTabs],
  templateUrl: './shell.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShellPage {
  constructor() {
    addIcons({ radio, tv });
  }
}
