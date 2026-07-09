import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.darknigthmare.canieatit',
  appName: 'Can I Eat It',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
