import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.goroute.sfa',
  appName: 'GoRoute SFA',
  webDir: 'dist',
  server: {
    // Points directly to your live production deployment
    url: 'https://goroute-sfa-dms--you-can-touch-me-8919838-dba1d.asia-southeast1.hosted.app/',
    cleartext: false,
    allowNavigation: [
      'goroute-sfa-dms--you-can-touch-me-8919838-dba1d.asia-southeast1.hosted.app',
      '*.hosted.app',
      '*.firebaseapp.com',
      '*.googleapis.com',
      '*.google.com'
    ]
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false
  }
};

export default config;
