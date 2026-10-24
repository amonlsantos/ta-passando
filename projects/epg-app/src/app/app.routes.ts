import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'tabs',
    loadComponent: () => import('./shared/shell/shell.page').then((m) => m.ShellPage),
    children: [
      {
        path: 'now',
        loadComponent: () => import('./features/home/home.page').then((m) => m.HomePage),
        title: 'Agora',
      },
      {
        path: 'channels',
        loadComponent: () => import('./features/channels/channels.page').then((m) => m.ChannelsPage),
        title: 'Canais',
      },
      { path: '', pathMatch: 'full', redirectTo: 'now' },
    ],
  },
  {
    path: 'schedule/:channelId',
    loadComponent: () => import('./features/schedule/schedule.page').then((m) => m.SchedulePage),
    title: 'Programação',
  },
  {
    path: 'program/:programId',
    loadComponent: () => import('./features/program/program.page').then((m) => m.ProgramPage),
    title: 'Programa',
  },
  { path: '', pathMatch: 'full', redirectTo: 'tabs/now' },
  { path: '**', redirectTo: 'tabs/now' },
];
