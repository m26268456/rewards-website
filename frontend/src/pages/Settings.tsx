// path: main/frontend/src/pages/Settings.tsx
import { useState, useEffect } from 'react';
import { isApp } from '../utils/isApp';
import CardManagement from './settings/CardManagement';
import PaymentManagement from './settings/PaymentManagement';
import ChannelManagement from './settings/ChannelManagement';
import CalculationSchemeSettings from './settings/CalculationSchemeSettings';
import TransactionSettings from './settings/TransactionSettings';
import QuotaManagement from './settings/QuotaManagement';
import AppSettings from './settings/AppSettings';

export default function Settings() {
  const [activeTab, setActiveTab] = useState<'cards' | 'payments' | 'channels' | 'calculation' | 'transactions' | 'quota' | 'app'>('cards');
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
        <div className="border-b border-gray-200 overflow-x-auto no-scrollbar">
          <nav className="flex min-w-max">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
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

        <div className="p-4 sm:p-6">
          {activeTab === 'cards' && <CardManagement />}
          {activeTab === 'payments' && <PaymentManagement />}
          {activeTab === 'channels' && <ChannelManagement />}
          {activeTab === 'calculation' && <CalculationSchemeSettings />}
          {activeTab === 'transactions' && <TransactionSettings />}
          {activeTab === 'quota' && <QuotaManagement />}
          {activeTab === 'app' && <AppSettings appModeEnabled={appModeEnabled} onToggle={setAppModeEnabled} />}
        </div>
      </div>
    </div>
  );
}