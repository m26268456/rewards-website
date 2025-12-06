/**
 * 檢測是否為移動設備
 */
function isMobileDevice(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  // 方法 1: 檢查 User Agent
  const userAgent = navigator.userAgent.toLowerCase();
  const mobileKeywords = [
    'mobile', 'android', 'iphone', 'ipad', 'ipod', 
    'blackberry', 'windows phone', 'opera mini'
  ];
  
  if (mobileKeywords.some(keyword => userAgent.includes(keyword))) {
    return true;
  }

  // 方法 2: 檢查觸控支持
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    // 進一步檢查屏幕尺寸，避免平板被誤判
    const isSmallScreen = window.innerWidth <= 768;
    if (isSmallScreen) {
      return true;
    }
  }

  // 方法 3: 檢查屏幕尺寸（移動設備通常小於 768px）
  if (window.innerWidth <= 768) {
    return true;
  }

  return false;
}

/**
 * 檢測是否在 App 環境中
 * 優先級：
 * 1. 手動設置（URL 參數或 localStorage）
 * 2. 自動檢測移動設備
 */
export function isApp(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  // 優先級 1: 檢查 URL 參數（手動覆蓋）
  const urlParams = new URLSearchParams(window.location.search);
  const urlAppMode = urlParams.get('app');
  if (urlAppMode === 'true') {
    return true;
  }
  if (urlAppMode === 'false') {
    return false;
  }

  // 優先級 2: 檢查 localStorage（手動設置）
  const appMode = localStorage.getItem('appMode');
  if (appMode === 'true') {
    return true;
  }
  if (appMode === 'false') {
    return false;
  }

  // 優先級 3: 自動檢測移動設備
  return isMobileDevice();
}

/**
 * 設置 App 模式
 * @param enabled true=強制開啟, false=強制關閉, null=恢復自動檢測
 */
export function setAppMode(enabled: boolean | null) {
  if (typeof window !== 'undefined') {
    if (enabled === null) {
      // 恢復自動檢測
      localStorage.removeItem('appMode');
    } else if (enabled) {
      // 強制開啟
      localStorage.setItem('appMode', 'true');
    } else {
      // 強制關閉
      localStorage.setItem('appMode', 'false');
    }
    // 重新載入頁面以應用更改
    window.location.reload();
  }
}

