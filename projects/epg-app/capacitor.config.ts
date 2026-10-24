import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.example.epg',
  appName: 'Tá Passando',
  webDir: 'www',
  android: {
    allowMixedContent: false,
  },
};

export default config;
