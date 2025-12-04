// path: main/frontend/src/pages/settings/AppSettings.tsx
import { useState, useEffect } from 'react';
import { setAppMode } from '../../utils/isApp';

export default function AppSettings({ appModeEnabled, onToggle }: { appModeEnabled: boolean; onToggle: (enabled: boolean) => void }) {
  const [manualOverride, setManualOverride] = useState<string | null>(null);

  useEffect(() => {
    setManualOverride(localStorage.getItem('appMode'));
  }, []);

  const handleToggle = () => {
    if (manualOverride === null) {
      if (confirm('手動開啟 App 模式？(頁面將重新載入)')) setAppMode(true);
    } else if (manualOverride === 'true') {
      if (confirm('手動關閉 App 模式？(頁面將重新載入)')) setAppMode(false);
    } else {
      if (confirm('恢復自動檢測？(頁面將重新載入)')) setAppMode(null);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">App 模式設定</h3>
      <div className="p-4 bg-white rounded shadow flex justify-between items-center">
        <div>
          <div className="font-medium">App 模式狀態</div>
          <div className="text-sm text-gray-500">
            {manualOverride === null ? '自動檢測中' : manualOverride === 'true' ? '手動強制開啟' : '手動強制關閉'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={handleToggle}
            className={`px-4 py-2 rounded text-white ${appModeEnabled ? 'bg-blue-600' : 'bg-gray-400'}`}
          >
            {appModeEnabled ? '已開啟' : '已關閉'}
          </button>
          {manualOverride !== null && (
            <button onClick={() => setAppMode(null)} className="text-sm text-blue-600 underline">重置</button>
          )}
        </div>
      </div>
      <div className="text-sm text-gray-500 p-2 bg-gray-50 rounded">
        <p>App 模式會將導航列移至底部，並優化觸控體驗。</p>
      </div>
    </div>
  );
}