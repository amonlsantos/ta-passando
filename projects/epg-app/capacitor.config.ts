import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.example.epg',
  appName: 'EPG',
  webDir: 'www',
  android: {
    allowMixedContent: false,
  },
};

export default config;
