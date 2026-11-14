import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lumen.notes',
  appName: 'Lumen',
  webDir: 'public',
  server: {
    url: 'https://lumen-ai-notepad.vercel.app'
  }
};

export default config;
