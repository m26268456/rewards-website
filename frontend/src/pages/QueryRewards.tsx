import { useState, useEffect } from 'react';
import api from '../utils/api';

// 輔助函數：將文字中的網址轉換為可點擊的連結
function linkify(text: string): string {
  if (!text) return '';
  
  // URL 正則表達式：匹配 http://, https://, 或 www. 開頭的網址
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
  
  // 將網址轉換為 HTML 連結
  return text.replace(urlRegex, (url) => {
    // 如果網址沒有協議，添加 https://
    const href = url.startsWith('http') ? url : `https://${url}`;
    // 轉義 HTML 特殊字符
    const escapedUrl = url
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
    return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-800 underline break-all">${escapedUrl}</a>`;
  });
}

interface Channel {
  id: string;
  name: string;
  isCommon: boolean;
}

interface QueryResult {
  channelId: string;
  channelName: string;
  results: Array<{
    isExcluded: boolean;
    excludedSchemeName?: string;
    totalRewardPercentage: number;
    rewardBreakdown: string;
    schemeInfo: string;
    requiresSwitch: boolean;
    note?: string;
    activityEndDate?: string;
  }>;
}

interface Card {
  id: string;
  name: string;
  note?: string;
  displayOrder: number;
  schemes: Array<{
    id: string;
    name: string;
    note?: string;
    requiresSwitch: boolean;
    activityStartDate?: string;
    activityEndDate?: string;
    rewards: Array<{
      percentage: number;
      calculationMethod: string;
      quotaLimit: number | null;
      quotaRefreshType: string | null;
      quotaRefreshValue: number | null;
      quotaRefreshDate: string | null;
    }>;
    exclusions: string[];
    applications: Array<{
      channelId: string;
      channelName: string;
      note?: string;
    }>;
  }>;
}

interface PaymentMethod {
  id: string;
  name: string;
  note?: string;
  ownRewardPercentage: number;
  displayOrder: number;
  linkedSchemes: Array<{
    schemeId: string;
    cardName: string;
    schemeName: string;
  }>;
  applications: Array<{
    channelId: string;
    channelName: string;
    note?: string;
  }>;
}

export default function QueryRewards() {
  const [commonChannels, setCommonChannels] = useState<Channel[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [selectedChannelNames, setSelectedChannelNames] = useState<Map<string, string>>(new Map());
  const [manualInput, setManualInput] = useState('');
  const [queryResults, setQueryResults] = useState<QueryResult[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedItemSchemes, setSelectedItemSchemes] = useState<any[]>([]); // 點擊卡片或支付方式後顯示的方案列表
  const [selectedCardInfo, setSelectedCardInfo] = useState<Card | null>(null); // 選中的卡片信息（用於顯示卡片名稱和備註）
  const [selectedPaymentInfo, setSelectedPaymentInfo] = useState<PaymentMethod | null>(null); // 選中的支付方式信息
  const [lastAction, setLastAction] = useState<'query' | 'scheme'>('query'); // 記錄最後的操作

  // 載入常用通路
  useEffect(() => {
    api.get('/channels?commonOnly=true').then((res) => {
      setCommonChannels(res.data.data);
    });
  }, []);

  // 載入方案總覽
  useEffect(() => {
    api.get('/schemes/overview').then((res) => {
      setCards(res.data.data);
    });
    api.get('/payment-methods/overview').then((res) => {
      setPaymentMethods(res.data.data);
    });
  }, []);

  // 查詢通路回饋
  useEffect(() => {
    if (selectedChannels.length > 0) {
      setLastAction('query');
      // 分離真實的通路ID和關鍵字
      const realChannelIds: string[] = [];
      const keywords: string[] = [];
      
      selectedChannels.forEach((id) => {
        if (id.startsWith('keyword_')) {
          // 提取關鍵字（格式：keyword_關鍵字_時間戳）
          const parts = id.split('_');
          if (parts.length >= 2) {
            keywords.push(parts.slice(1, -1).join('_')); // 移除 keyword_ 和時間戳
          }
        } else {
          realChannelIds.push(id);
        }
      });

      // 如果有關鍵字，使用關鍵字查詢；否則使用通路ID查詢
      const requestBody = keywords.length > 0 
        ? { keywords } 
        : { channelIds: realChannelIds };

      api
        .post('/schemes/query-channels', requestBody)
        .then((res) => {
          setQueryResults(res.data.data);
        })
        .catch((error) => {
          console.error('查詢通路回饋錯誤:', error);
          alert('查詢失敗: ' + (error.response?.data?.error || error.message || '未知錯誤'));
          setQueryResults([]);
        });
    } else {
      setQueryResults([]);
    }
  }, [selectedChannels]);

  const handleToggleCommonChannel = (channelId: string) => {
    const channel = commonChannels.find((c) => c.id === channelId);
    if (!channel) return;

    if (selectedChannels.includes(channelId)) {
      // 如果已選中，則移除
      setSelectedChannels(selectedChannels.filter((id) => id !== channelId));
      const newMap = new Map(selectedChannelNames);
      newMap.delete(channelId);
      setSelectedChannelNames(newMap);
    } else {
      // 如果未選中，則添加
      setSelectedChannels([...selectedChannels, channelId]);
      setSelectedChannelNames(new Map(selectedChannelNames.set(channelId, channel.name)));
    }
  };

  const handleManualInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && manualInput.trim()) {
      const keyword = manualInput.trim();
      // 使用關鍵字查詢，允許未設定的通路
      // 創建一個虛擬的通路ID（使用關鍵字作為ID）
      const virtualChannelId = `keyword_${keyword}_${Date.now()}`;
      if (!selectedChannels.includes(virtualChannelId)) {
        setSelectedChannels([...selectedChannels, virtualChannelId]);
        setSelectedChannelNames(new Map(selectedChannelNames.set(virtualChannelId, keyword)));
      }
      setManualInput('');
    }
  };

  const handleRemoveChannel = (channelId: string) => {
    setSelectedChannels(selectedChannels.filter((id) => id !== channelId));
    const newMap = new Map(selectedChannelNames);
    newMap.delete(channelId);
    setSelectedChannelNames(newMap);
  };

  const handleReset = () => {
    setSelectedChannels([]);
    setQueryResults([]);
    setSelectedItemSchemes([]);
    setSelectedCardInfo(null);
    setSelectedPaymentInfo(null);
    setSelectedChannelNames(new Map());
    setLastAction('query');
  };

  // 點擊卡片顯示該卡片的所有方案
  const handleCardClick = (card: Card) => {
    setLastAction('scheme');
    setSelectedCardInfo(card);
    setSelectedPaymentInfo(null);
    setSelectedItemSchemes(
      card.schemes.map((scheme) => ({
        type: 'scheme',
        cardName: card.name,
        ...scheme,
      }))
    );
    // 自動滾動到方案列表
    setTimeout(() => {
      const schemeListElement = document.getElementById('scheme-list');
      if (schemeListElement) {
        schemeListElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  // 點擊支付方式顯示該支付方式的所有方案
  const handlePaymentClick = (pm: PaymentMethod) => {
    setLastAction('scheme');
    setSelectedCardInfo(null);
    setSelectedPaymentInfo(pm);
    interface PaymentScheme {
      id: string;
      name: string;
      rewards: Array<{ percentage: number; method: string }>;
      applications: Array<{ channelId: string; channelName: string; note?: string }>;
    }
    const schemes: PaymentScheme[] = [];
    
    // 支付方式本身的回饋
    if (pm.ownRewardPercentage > 0) {
      schemes.push({
        type: 'payment',
        name: pm.name,
        note: pm.note,
        ownRewardPercentage: pm.ownRewardPercentage,
        applications: pm.applications,
      });
    }
    
    // 支付方式連結的方案
    pm.linkedSchemes.forEach((linkedScheme) => {
      // 從 cards 中找到對應的方案
      cards.forEach((card) => {
        if (card.name === linkedScheme.cardName) {
          const scheme = card.schemes.find((s) => s.id === linkedScheme.schemeId);
          if (scheme) {
            schemes.push({
              type: 'payment_scheme',
              cardName: card.name,
              paymentName: pm.name,
              ...scheme,
            });
          }
        }
      });
    });
    
    setSelectedItemSchemes(schemes);
    // 自動滾動到方案列表
    setTimeout(() => {
      const schemeListElement = document.getElementById('scheme-list');
      if (schemeListElement) {
        schemeListElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  return (
    <div className="space-y-6">
      {/* 回饋查詢標題 */}
      <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
        回饋查詢
      </h2>

      {/* 方案總覽 */}
      <div className="card bg-gradient-to-br from-white to-blue-50">
        {/* 方案總覽漢堡選單 */}
        <details className="group border-2 border-indigo-200 rounded-lg overflow-hidden">
          <summary className="cursor-pointer font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-4 py-3 flex items-center justify-between transition-colors">
            <span className="flex items-center gap-2">
              <span className="text-xl">☰</span>
              <span>方案總覽</span>
            </span>
            <span className="text-sm text-indigo-500 group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <div className="px-4 py-2 bg-white border-t border-indigo-200 space-y-2">
            {/* 信用卡漢堡選單 */}
            <details className="group border-2 border-blue-200 rounded-lg overflow-hidden">
              <summary className="cursor-pointer font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 px-4 py-3 flex items-center justify-between transition-colors">
                <span className="flex items-center gap-2">
                  <span className="text-xl">☰</span>
                  <span>信用卡</span>
                </span>
                <span className="text-sm text-blue-500 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <div className="px-4 py-2 bg-white border-t border-blue-200">
                {cards.length > 0 ? (
                  cards.map((card) => (
                    <button
                      key={card.id}
                      onClick={() => handleCardClick(card)}
                      className="w-full text-left py-2 px-3 hover:bg-blue-50 rounded transition-colors border-l-4 border-blue-300 mb-1"
                    >
                      <span className="font-medium text-blue-800">▶ {card.name}</span>
                    </button>
                  ))
                ) : (
                  <div className="text-sm text-gray-500 py-2">尚無信用卡資料</div>
                )}
              </div>
            </details>
            
            {/* 支付方式漢堡選單 */}
            <details className="group border-2 border-purple-200 rounded-lg overflow-hidden">
              <summary className="cursor-pointer font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 px-4 py-3 flex items-center justify-between transition-colors">
                <span className="flex items-center gap-2">
                  <span className="text-xl">☰</span>
                  <span>支付方式</span>
                </span>
                <span className="text-sm text-purple-500 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <div className="px-4 py-2 bg-white border-t border-purple-200">
                {paymentMethods.length > 0 ? (
                  paymentMethods.map((pm) => (
                    <button
                      key={pm.id}
                      onClick={() => handlePaymentClick(pm)}
                      className="w-full text-left py-2 px-3 hover:bg-purple-50 rounded transition-colors border-l-4 border-purple-300 mb-1"
                    >
                      <span className="font-medium text-purple-800">▶ {pm.name}</span>
                    </button>
                  ))
                ) : (
                  <div className="text-sm text-gray-500 py-2">尚無支付方式資料</div>
                )}
              </div>
            </details>
          </div>
        </details>
      </div>

      {/* 回饋查詢和結果/方案顯示 */}
      <div className="space-y-6">
          {/* 回饋查詢輸入 */}
          <div className="card bg-gradient-to-br from-white to-purple-50">
            <h3 className="text-xl font-semibold mb-4 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              回饋查詢
            </h3>

            {/* 常用通路 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">常用通路</label>
              <div className="flex flex-wrap gap-2">
                {commonChannels.map((channel) => {
                  const isSelected = selectedChannels.includes(channel.id);
                  return (
                    <button
                      key={channel.id}
                      onClick={() => handleToggleCommonChannel(channel.id)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium shadow-md hover:shadow-lg transition-all duration-200 ${
                        isSelected
                          ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-600 hover:to-emerald-600'
                          : 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:from-blue-600 hover:to-cyan-600'
                      }`}
                    >
                      {isSelected ? '✓ ' : ''}{channel.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 手動輸入通路 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">手動輸入通路</label>
              <input
                type="text"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                onKeyDown={handleManualInput}
                placeholder="輸入通路名稱後按 Enter"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* 已選擇的通路 */}
            {selectedChannels.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">已選擇的通路</label>
                  <button
                    onClick={handleReset}
                    className="text-sm bg-gradient-to-r from-red-500 to-pink-500 text-white px-3 py-1 rounded-lg hover:from-red-600 hover:to-pink-600 transition-all duration-200 shadow-md"
                  >
                    一鍵重置
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedChannels.map((channelId) => {
                    const channelName = selectedChannelNames.get(channelId) || 
                      commonChannels.find((c) => c.id === channelId)?.name || 
                      channelId;
                    return (
                      <div
                        key={channelId}
                        className="flex items-center gap-1 px-3 py-1 bg-gray-100 rounded"
                      >
                        <span className="text-sm">{channelName}</span>
                        <button
                          onClick={() => handleRemoveChannel(channelId)}
                          className="text-red-600 hover:text-red-800"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 查詢結果或方案列表 - 同一個區塊，根據最後操作顯示 */}
          <div id="scheme-list" className="card bg-gradient-to-br from-white to-green-50">
            {lastAction === 'query' && queryResults.length > 0 && (
              <>
                <h3 className="text-lg font-semibold mb-4 text-green-800">查詢結果</h3>
                <div className="space-y-4">
                  {queryResults.map((result) => (
                    <div key={result.channelId} className="border rounded p-4 bg-white">
                      <h4 className="font-semibold mb-2 text-lg">{result.channelName}</h4>
                      <div className="space-y-2">
                        {result.results.map((item, idx) => (
                          <div
                            key={idx}
                            className={`p-3 rounded-lg ${
                              item.isExcluded ? 'bg-red-50 border-l-4 border-red-500' : 'bg-green-50 border-l-4 border-green-500'
                            }`}
                          >
                            {item.isExcluded ? (
                              <div className="text-sm">
                                <span className="badge-danger font-medium">X排除</span>{' '}
                                <span className="font-semibold">{item.excludedSchemeName}</span>{' '}
                                <span className="badge-warning">{item.requiresSwitch ? '需切換' : '免切換'}</span>{' '}
                                <span className="text-gray-700">{result.channelName}</span>
                              </div>
                            ) : (
                              <div className="text-sm">
                                {(() => {
                                  // 檢查方案是否已逾期
                                  const isExpired = item.activityEndDate 
                                    ? new Date(item.activityEndDate) < new Date()
                                    : false;
                                  
                                  return (
                                    <div className={isExpired ? 'bg-yellow-50 border-l-4 border-yellow-500 p-2 rounded' : ''}>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-2xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                                          {item.totalRewardPercentage}%
                                        </span>{' '}
                                        <span className="font-semibold text-gray-800">{item.schemeInfo}</span>{' '}
                                        <span className={`badge ${item.requiresSwitch ? 'badge-warning' : 'badge-success'}`}>
                                          {item.requiresSwitch ? '需切換' : '免切換'}
                                        </span>{' '}
                                        {isExpired && (
                                          <span className="badge-danger text-xs font-semibold">
                                            ⚠️ 方案已逾期
                                          </span>
                                        )}
                                        <span className="text-gray-700">{result.channelName}</span>
                                      </div>
                                      {isExpired && item.activityEndDate && (
                                        <div className="mt-1 text-xs text-yellow-700">
                                          活動結束日期：{new Date(item.activityEndDate).toLocaleDateString('zh-TW')}
                                        </div>
                                      )}
                                      {item.note && (
                                        <div className="mt-1 text-xs text-gray-600 bg-white/50 px-2 py-1 rounded">
                                          💡 {item.note}
                                        </div>
                                      )}
                                      {item.rewardBreakdown && (
                                        <div className="mt-1 text-xs text-gray-500">
                                          📊 組成：{item.rewardBreakdown}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {lastAction === 'scheme' && selectedItemSchemes.length > 0 && (
              <>
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-lg font-semibold text-green-800">方案列表</h3>
                  <button
                    onClick={() => {
                      setSelectedItemSchemes([]);
                      setSelectedCardInfo(null);
                      setSelectedPaymentInfo(null);
                      setLastAction('query');
                    }}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    ✕
                  </button>
                </div>
                <div className="space-y-4">
                  {/* 顯示卡片/支付方式名稱和備註 */}
                  {selectedCardInfo && (
                    <div className="bg-white p-4 rounded-lg border-2 border-blue-200 shadow-sm">
                      <div className="text-xl font-bold text-blue-800 mb-2">{selectedCardInfo.name}</div>
                      {selectedCardInfo.note && (
                        <div 
                          className="text-sm text-gray-600 border-l-2 border-gray-300 pl-2" 
                          dangerouslySetInnerHTML={{ __html: linkify(selectedCardInfo.note) }} 
                        />
                      )}
                    </div>
                  )}
                  {selectedPaymentInfo && (
                    <div className="bg-white p-4 rounded-lg border-2 border-purple-200 shadow-sm">
                      <div className="text-xl font-bold text-purple-800 mb-2">{selectedPaymentInfo.name}</div>
                      {selectedPaymentInfo.note && (
                        <div 
                          className="text-sm text-gray-600 border-l-2 border-gray-300 pl-2" 
                          dangerouslySetInnerHTML={{ __html: linkify(selectedPaymentInfo.note) }} 
                        />
                      )}
                    </div>
                  )}
                  
                  {/* 顯示方案列表 */}
                  <div className="space-y-3">
                    {selectedItemSchemes.map((scheme, index) => (
                      <div key={index} className="bg-white p-4 rounded-lg border-2 border-green-200 shadow-sm ml-4">
                        {scheme.type === 'scheme' && (
                          <>
                            <div className="font-semibold text-base mb-1">
                              {scheme.name}
                              {scheme.requiresSwitch && <span className="ml-2 text-orange-600">⚠️ 需切換</span>}
                            </div>
                            <div className="text-sm mb-2">
                            <span className="font-medium">回饋組成：</span>
                            {scheme.rewards.map((r, idx: number) => (
                              <span key={idx}>
                                {r.percentage}%
                                {idx < scheme.rewards.length - 1 && '+'}
                              </span>
                            ))}
                            {scheme.rewards.length > 1 && (
                              <span className="ml-2 text-blue-600 font-semibold">
                                = {scheme.rewards.reduce((sum, r) => sum + r.percentage, 0)}%
                              </span>
                            )}
                          </div>
                          {(scheme.activityStartDate || scheme.activityEndDate) && (
                            <div className="text-sm mb-2">
                              <span className="font-medium">方案期限：</span>
                              {scheme.activityStartDate && (
                                <span>{new Date(scheme.activityStartDate).toLocaleDateString('zh-TW')}</span>
                              )}
                              {scheme.activityStartDate && scheme.activityEndDate && <span> ~ </span>}
                              {scheme.activityEndDate && (
                                <span>{new Date(scheme.activityEndDate).toLocaleDateString('zh-TW')}</span>
                              )}
                            </div>
                          )}
                          {scheme.exclusions && scheme.exclusions.length > 0 && (
                            <div className="text-sm mb-2">
                              <span className="font-medium text-red-600">排除通路：</span>
                              {scheme.exclusions.join('、')}
                            </div>
                          )}
                          {scheme.applications && scheme.applications.length > 0 && (
                            <div className="text-sm mb-2">
                              <span className="font-medium text-green-600">適用通路：</span>
                              <div className="ml-4 mt-1 space-y-1">
                                {scheme.applications.map((app, idx: number) => (
                                  <div key={idx} className="text-xs">
                                    {app.channelName}{app.note && ` (${app.note})`}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                      {scheme.type === 'payment' && (
                        <>
                          <div className="font-semibold text-base mb-1">{scheme.name}</div>
                          <div className="text-sm mb-2">
                            <span className="font-medium">本身回饋：</span>
                            {scheme.ownRewardPercentage}%
                          </div>
                          {scheme.applications && scheme.applications.length > 0 && (
                            <div className="text-sm mb-2">
                              <span className="font-medium text-green-600">適用通路：</span>
                              <div className="ml-4 mt-1 space-y-1">
                                {scheme.applications.map((app, idx: number) => (
                                  <div key={idx} className="text-xs">
                                    {app.channelName}{app.note && ` (${app.note})`}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                      {scheme.type === 'payment_scheme' && (
                        <>
                          <div className="font-semibold text-base mb-1">
                            {scheme.cardName} - {scheme.name} - {scheme.paymentName}
                            {scheme.requiresSwitch && <span className="ml-2 text-orange-600">⚠️ 需切換</span>}
                          </div>
                          <div className="text-sm mb-2">
                            <span className="font-medium">回饋組成：</span>
                            {scheme.rewards.map((r, idx: number) => (
                              <span key={idx}>
                                {r.percentage}%
                                {idx < scheme.rewards.length - 1 && '+'}
                              </span>
                            ))}
                            {scheme.rewards.length > 1 && (
                              <span className="ml-2 text-blue-600 font-semibold">
                                = {scheme.rewards.reduce((sum, r) => sum + r.percentage, 0)}%
                              </span>
                            )}
                          </div>
                          {(scheme.activityStartDate || scheme.activityEndDate) && (
                            <div className="text-sm mb-2">
                              <span className="font-medium">方案期限：</span>
                              {scheme.activityStartDate && (
                                <span>{new Date(scheme.activityStartDate).toLocaleDateString('zh-TW')}</span>
                              )}
                              {scheme.activityStartDate && scheme.activityEndDate && <span> ~ </span>}
                              {scheme.activityEndDate && (
                                <span>{new Date(scheme.activityEndDate).toLocaleDateString('zh-TW')}</span>
                              )}
                            </div>
                          )}
                          {scheme.exclusions && scheme.exclusions.length > 0 && (
                            <div className="text-sm mb-2">
                              <span className="font-medium text-red-600">排除通路：</span>
                              {scheme.exclusions.join('、')}
                            </div>
                          )}
                          {scheme.applications && scheme.applications.length > 0 && (
                            <div className="text-sm mb-2">
                              <span className="font-medium text-green-600">適用通路：</span>
                              <div className="ml-4 mt-1 space-y-1">
                                {scheme.applications.map((app, idx: number) => (
                                  <div key={idx} className="text-xs">
                                    {app.channelName}{app.note && ` (${app.note})`}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {lastAction === 'query' && queryResults.length === 0 && selectedItemSchemes.length === 0 && (
              <div className="text-center text-gray-500 py-8">
                請選擇通路進行查詢，或點擊方案總覽中的項目查看方案詳情
              </div>
            )}
          </div>
      </div>
    </div>
  );
}
