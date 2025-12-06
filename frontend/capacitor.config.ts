import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rewards.app',
  appName: '回饋系統',
  webDir: 'dist',
  server: {
    // 生產環境：使用您的 Railway 前端域名
    // 開發環境：可以設置為 localhost 或留空使用本地構建
    url: process.env.CAPACITOR_SERVER_URL || undefined,
    cleartext: true, // 允許 HTTP（開發環境）
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#3b82f6',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      androidSpinnerStyle: 'large',
      iosSpinnerStyle: 'small',
      spinnerColor: '#ffffff',
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#3b82f6',
    },
  },
};

export default config;

