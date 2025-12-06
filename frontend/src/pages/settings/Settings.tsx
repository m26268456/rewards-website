import { useState, useEffect } from 'react';
// 工具路徑往上兩層回到 src/utils
import { isApp } from '../../utils/isApp'; 

// 因為 Settings.tsx 現在跟這些元件在同一個資料夾，所以移除 './settings/' 前綴
import CardManagement from './CardManagement';
import PaymentManagement from './PaymentManagement';
import ChannelManagement from './ChannelManagement';
import CalculationSchemeSettings from './CalculationSchemeSettings';
import TransactionSettings from './TransactionSettings';
import QuotaManagement from './QuotaManagement';
import AppSettings from './AppSettings';

export default function Settings() {
  // 定義 Tab 的型別，確保 TypeScript 不會報錯
  type TabType = 'cards' | 'payments' | 'channels' | 'calculation' | 'transactions' | 'quota' | 'app';
  
  const [activeTab, setActiveTab] = useState<TabType>('cards');
  const [appModeEnabled, setAppModeEnabled] = useState(false);

  useEffect(() => {
    setAppModeEnabled(isApp());
  }, []);

  const tabs = [
    { id: 'cards', label: '信用卡' },
    { id: 'payments', label: '支付方式' },
    { id: 'channels', label: '常用通路' },
    { id: 'calculation', label: '回饋計算' },
    { id: 'transactions', label: '記帳設定' },
    { id: 'quota', label: '額度管理' },
    { id: 'app', label: 'App 設定' },
  ];

  return (
    <div className="space-y-6 pb-20"> {/* pb-20 預留底部空間給 App 導航 */}
      <h2 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-blue-600 bg-clip-text text-transparent">
        管理設定
      </h2>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        {/* Tab 導航區塊 */}
        <div className="border-b border-gray-200 overflow-x-auto no-scrollbar">
          <nav className="flex min-w-max">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors duration-200 whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600 bg-blue-50'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* 內容顯示區塊 */}
        <div className="p-4 sm:p-6">
          {activeTab === 'cards' && <CardManagement />}
          {activeTab === 'payments' && <PaymentManagement />}
          {activeTab === 'channels' && <ChannelManagement />}
          {activeTab === 'calculation' && <CalculationSchemeSettings />}
          {activeTab === 'transactions' && <TransactionSettings />}
          {activeTab === 'quota' && <QuotaManagement />}
          
          {/* 注意：原本的程式碼傳遞了 appModeEnabled 和 onToggle 
             請確保 AppSettings.tsx 元件有定義這些 props，否則會報錯。
             如果 AppSettings 很簡單不需要這些，可以只寫 <AppSettings /> 
          */}
          {activeTab === 'app' && (
             <AppSettings 
                // 如果您的 AppSettings 尚未接受這些 props，請暫時註解掉下面兩行，或修改 AppSettings 定義
                // appModeEnabled={appModeEnabled} 
                // onToggle={setAppModeEnabled} 
             />
          )}
        </div>
      </div>
    </div>
  );
}