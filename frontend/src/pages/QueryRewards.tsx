import { useState, useEffect } from 'react';
import api from '../utils/api';

// 輔助函數：將文字中的網址轉換為可點擊的連結
function linkify(text: string): string {
  if (!text) return '';
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
  return text.replace(urlRegex, (url) => {
    const href = url.startsWith('http') ? url : `https://${url}`;
    const escapedUrl = url
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
    return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-800 underline break-all">${escapedUrl}</a>`;
  });
}

// 格式化刷新規則
const formatRefreshRule = (r: any) => {
  if (r.quotaRefreshType === 'monthly') return `每月${r.quotaRefreshValue}號`;
  if (r.quotaRefreshType === 'date') return `指定${r.quotaRefreshValue}`;
  if (r.quotaRefreshType === 'activity') return '活動結束';
  return '不刷新';
};

// 格式化計算基準
const formatBasis = (basis?: string) => {
  return basis === 'statement' ? '帳單總額' : '單筆回饋';
};

interface Channel {
  id: string;
  name: string;
  isCommon: boolean;
}

interface QueryResult {
  keyword: string;
  channels: Array<{
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
      schemeChannelName?: string; // 方案中記錄的通路名稱
    }>;
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
      quotaCalculationBasis?: string;
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
  const [selectedItemSchemes, setSelectedItemSchemes] = useState<any[]>([]);
  const [selectedCardInfo, setSelectedCardInfo] = useState<Card | null>(null);
  const [selectedPaymentInfo, setSelectedPaymentInfo] = useState<PaymentMethod | null>(null);
  const [lastAction, setLastAction] = useState<'query' | 'scheme'>('query');

  useEffect(() => {
    api.get('/channels?commonOnly=true').then((res) => {
      setCommonChannels(res.data.data);
    });
    api.get('/schemes/overview').then((res) => {
      setCards(res.data.data);
    });
    api.get('/payment-methods/overview').then((res) => {
      setPaymentMethods(res.data.data);
    });
  }, []);

  useEffect(() => {
    if (selectedChannels.length > 0) {
      setLastAction('query');
      const realChannelIds: string[] = [];
      const keywords: string[] = [];
      
      selectedChannels.forEach((id) => {
        if (id.startsWith('keyword_')) {
          const parts = id.split('_');
          if (parts.length >= 2) {
            keywords.push(parts.slice(1, -1).join('_'));
          }
        } else {
          realChannelIds.push(id);
        }
      });

      const requestBody = keywords.length > 0 ? { keywords } : { channelIds: realChannelIds };

      api.post('/schemes/query-channels', requestBody)
        .then((res) => setQueryResults(res.data.data))
        .catch((error) => {
          console.error('查詢錯誤:', error);
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
      setSelectedChannels(selectedChannels.filter((id) => id !== channelId));
      const newMap = new Map(selectedChannelNames);
      newMap.delete(channelId);
      setSelectedChannelNames(newMap);
    } else {
      setSelectedChannels([...selectedChannels, channelId]);
      setSelectedChannelNames(new Map(selectedChannelNames.set(channelId, channel.name)));
    }
  };

  const handleManualInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && manualInput.trim()) {
      const keyword = manualInput.trim();
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
    setTimeout(() => {
      const el = document.getElementById('scheme-list');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handlePaymentClick = (pm: PaymentMethod) => {
    setLastAction('scheme');
    setSelectedCardInfo(null);
    setSelectedPaymentInfo(pm);
    const schemes: any[] = [];
    
    if (pm.ownRewardPercentage >= 0) {
       schemes.push({
        type: 'payment',
        name: pm.name,
        note: pm.note,
        ownRewardPercentage: pm.ownRewardPercentage,
        applications: pm.applications,
        rewards: [] 
      });
    }
    
    pm.linkedSchemes.forEach((linkedScheme) => {
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
    setTimeout(() => {
      const el = document.getElementById('scheme-list');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
        回饋查詢
      </h2>

      {/* 方案總覽 */}
      <div className="card bg-gradient-to-br from-white to-blue-50">
        <details className="group border-2 border-indigo-200 rounded-lg overflow-hidden">
          <summary className="cursor-pointer font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-4 py-3 flex items-center justify-between transition-colors">
            <span className="flex items-center gap-2"><span className="text-xl">☰</span><span>方案總覽</span></span>
            <span className="text-sm text-indigo-500 group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <div className="px-4 py-2 bg-white border-t border-indigo-200 space-y-2">
            <details className="group border-2 border-blue-200 rounded-lg overflow-hidden">
              <summary className="cursor-pointer font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 px-4 py-3 flex items-center justify-between transition-colors">
                <span className="flex items-center gap-2"><span className="text-xl">☰</span><span>信用卡</span></span>
                <span className="text-sm text-blue-500 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <div className="px-4 py-2 bg-white border-t border-blue-200">
                {cards.length > 0 ? cards.map((card) => (
                  <button key={card.id} onClick={() => handleCardClick(card)} className="w-full text-left py-2 px-3 hover:bg-blue-50 rounded transition-colors border-l-4 border-blue-300 mb-1">
                    <span className="font-medium text-blue-800">▶ {card.name}</span>
                  </button>
                )) : <div className="text-sm text-gray-500 py-2">尚無信用卡資料</div>}
              </div>
            </details>
            
            <details className="group border-2 border-purple-200 rounded-lg overflow-hidden">
              <summary className="cursor-pointer font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 px-4 py-3 flex items-center justify-between transition-colors">
                <span className="flex items-center gap-2"><span className="text-xl">☰</span><span>支付方式</span></span>
                <span className="text-sm text-purple-500 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <div className="px-4 py-2 bg-white border-t border-purple-200">
                {paymentMethods.length > 0 ? paymentMethods.map((pm) => (
                  <button key={pm.id} onClick={() => handlePaymentClick(pm)} className="w-full text-left py-2 px-3 hover:bg-purple-50 rounded transition-colors border-l-4 border-purple-300 mb-1">
                    <span className="font-medium text-purple-800">▶ {pm.name}</span>
                  </button>
                )) : <div className="text-sm text-gray-500 py-2">尚無支付方式資料</div>}
              </div>
            </details>
          </div>
        </details>
      </div>

      <div className="space-y-6">
          <div className="card bg-gradient-to-br from-white to-purple-50">
            <h3 className="text-xl font-semibold mb-4 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">回饋查詢</h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">常用通路</label>
              <div className="flex flex-wrap gap-2">
                {commonChannels.map((channel) => (
                  <button key={channel.id} onClick={() => handleToggleCommonChannel(channel.id)} className={`px-4 py-2 rounded-lg text-sm font-medium shadow-md transition-all duration-200 ${selectedChannels.includes(channel.id) ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white' : 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white'}`}>
                    {selectedChannels.includes(channel.id) ? '✓ ' : ''}{channel.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">手動輸入</label>
              <input type="text" value={manualInput} onChange={(e) => setManualInput(e.target.value)} onKeyDown={handleManualInput} placeholder="輸入通路名稱後按 Enter" className="w-full px-3 py-2 border rounded-md" />
            </div>

            {selectedChannels.length > 0 && (
              <div className="mb-4">
                <div className="flex justify-between mb-2"><label className="block text-sm font-medium text-gray-700">已選通路</label><button onClick={handleReset} className="text-sm bg-red-500 text-white px-3 py-1 rounded">重置</button></div>
                <div className="flex flex-wrap gap-2">
                  {selectedChannels.map((channelId) => (
                    <div key={channelId} className="flex items-center gap-1 px-3 py-1 bg-gray-100 rounded">
                      <span className="text-sm">{selectedChannelNames.get(channelId) || commonChannels.find((c) => c.id === channelId)?.name || channelId}</span>
                      <button onClick={() => handleRemoveChannel(channelId)} className="text-red-600">×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div id="scheme-list" className="card bg-gradient-to-br from-white to-green-50">
            {lastAction === 'query' && queryResults.length > 0 && (
              <>
                <h3 className="text-lg font-semibold mb-4 text-green-800">查詢結果</h3>
                <div className="space-y-6">
                  {/* 按關鍵字分組顯示 */}
                  {queryResults.map((keywordGroup, keywordIdx) => (
                    <div key={keywordIdx} className="border-2 border-blue-200 rounded-lg p-4 bg-white shadow-sm">
                      <h4 className="font-bold mb-4 text-xl border-b-2 border-blue-300 pb-2 text-blue-700">
                        {keywordGroup.keyword}
                      </h4>
                      <div className="space-y-4">
                        {/* 每個關鍵字下的通路 */}
                        {keywordGroup.channels.map((channel, channelIdx) => (
                          <div key={channelIdx} className="border rounded p-3 bg-gray-50">
                            <h5 className="font-semibold mb-2 text-base text-gray-700">
                              {channel.channelName}
                            </h5>
                            <div className="space-y-2">
                              {channel.results.map((item, idx) => (
                                <div key={idx} className={`p-3 rounded-lg ${item.isExcluded ? 'bg-red-50 border-l-4 border-red-500' : 'bg-green-50 border-l-4 border-green-500'}`}>
                                  {item.isExcluded ? (
                                    <div className="text-sm">
                                      <span className="badge-danger font-medium">排除</span> <span className="font-semibold">{item.excludedSchemeName}</span>
                                    </div>
                                  ) : (
                                    <div className="text-sm">
                                      <div className="flex flex-wrap items-center gap-2 mb-1">
                                        <span className="text-xl font-bold text-green-600">{item.totalRewardPercentage}%</span>
                                        <span className="font-semibold text-gray-800">{item.schemeInfo}</span>
                                        <span className={`badge ${item.requiresSwitch ? 'badge-warning' : 'badge-success'}`}>{item.requiresSwitch ? '需切換' : '免切換'}</span>
                                        {/* 顯示方案中的通路名稱 */}
                                        {item.schemeChannelName && (
                                          <span className="text-gray-500 text-xs bg-gray-100 px-2 py-0.5 rounded-full">
                                            通路: {item.schemeChannelName}
                                          </span>
                                        )}
                                      </div>
                                      {item.note && <div className="text-xs text-gray-600 bg-white/50 px-2 py-1 rounded">💡 {item.note}</div>}
                                      <div className="text-xs text-gray-500 mt-1">
                                        {item.rewardBreakdown && <span>📊 組成：{item.rewardBreakdown}</span>}
                                        {item.activityEndDate && <span className="ml-2">📅 期限：{new Date(item.activityEndDate).toLocaleDateString()}</span>}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
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
                  <button onClick={() => { setSelectedItemSchemes([]); setSelectedCardInfo(null); setSelectedPaymentInfo(null); setLastAction('query'); }} className="text-gray-500 hover:text-gray-700">✕</button>
                </div>
                <div className="space-y-4">
                  {selectedCardInfo && (
                    <div className="bg-white p-4 rounded-lg border-2 border-blue-200">
                      <div className="text-xl font-bold text-blue-800 mb-2">{selectedCardInfo.name}</div>
                      {selectedCardInfo.note && <div className="text-sm text-gray-600" dangerouslySetInnerHTML={{ __html: linkify(selectedCardInfo.note) }} />}
                    </div>
                  )}
                  {selectedPaymentInfo && (
                    <div className="bg-white p-4 rounded-lg border-2 border-purple-200">
                      <div className="text-xl font-bold text-purple-800 mb-2">{selectedPaymentInfo.name}</div>
                      {selectedPaymentInfo.note && <div className="text-sm text-gray-600" dangerouslySetInnerHTML={{ __html: linkify(selectedPaymentInfo.note) }} />}
                    </div>
                  )}
                  
                  {/* 方案詳細列表 [修正項目 7] */}
                  <div className="space-y-3">
                    {selectedItemSchemes.map((scheme, index) => (
                      <div key={index} className="bg-white p-4 rounded-lg border border-green-200 shadow-sm ml-2">
                        <div className="font-semibold text-base mb-2 flex items-center justify-between">
                          <span>{scheme.name}</span>
                          {scheme.requiresSwitch && <span className="text-xs bg-orange-100 text-orange-800 px-2 py-0.5 rounded">需切換</span>}
                        </div>
                        
                        {scheme.note && <div className="text-sm text-gray-600 mb-2 bg-gray-50 p-2 rounded" dangerouslySetInnerHTML={{ __html: linkify(scheme.note) }} />}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                          <div>
                            <div className="font-medium text-gray-700 mb-1">回饋規則</div>
                            <ul className="space-y-2 text-gray-600 text-xs">
                              {scheme.rewards?.map((r: any, idx: number) => (
                                <li key={idx} className="flex flex-col bg-gray-50 p-1.5 rounded">
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-green-600 text-sm">{r.percentage}%</span>
                                    <span className="text-purple-600 text-[10px] border border-purple-200 px-1 rounded">{formatBasis(r.quotaCalculationBasis)}</span>
                                  </div>
                                  <div className="flex flex-wrap gap-x-2 mt-1 text-gray-500">
                                    <div className="flex flex-col text-gray-700 text-sm space-y-1">
                                      <span>{r.calculationMethod === 'round' ? '四捨五入' : r.calculationMethod === 'floor' ? '無條件捨去' : '無條件進位'}</span>
                                      <span className="text-[11px] text-purple-700 border border-purple-200 rounded px-1 inline-block w-fit">
                                        {formatBasis(r.quotaCalculationBasis)}
                                      </span>
                                    </div>
                                    <span className="text-gray-400">|</span>
                                    <span>{r.quotaLimit ? `上限 ${r.quotaLimit}` : '無上限'}</span>
                                    <span className="text-gray-400">|</span>
                                    <span>{formatRefreshRule(r)}</span>
                                  </div>
                                  {/* 顯示額度資訊 */}
                                  {r.quotaLimit !== null && (
                                    <div className="mt-1 text-xs text-blue-600">
                                      額度: {r.usedQuota || 0} / {r.remainingQuota !== null ? r.remainingQuota : r.quotaLimit} / {r.quotaLimit}
                                    </div>
                                  )}
                                </li>
                              ))}
                              {!scheme.rewards?.length && <li>無回饋設定</li>}
                            </ul>
                          </div>
                          
                          {(scheme.activityStartDate || scheme.activityEndDate) && (
                            <div>
                              <div className="font-medium text-gray-700 mb-1">活動期限</div>
                              <div className="text-xs text-gray-600">
                                {scheme.activityStartDate && new Date(scheme.activityStartDate).toLocaleDateString()}
                                {scheme.activityStartDate && scheme.activityEndDate && ' ~ '}
                                {scheme.activityEndDate && new Date(scheme.activityEndDate).toLocaleDateString()}
                              </div>
                            </div>
                          )}
                        </div>

                        {scheme.applications?.length > 0 && (
                          <div className="mt-3 text-xs">
                            <span className="font-medium text-green-600">適用：</span>
                            <span className="text-gray-600 ml-1">
                              {scheme.applications.map((app: any) => app.channelName).join('、')}
                            </span>
                          </div>
                        )}
                        {scheme.exclusions?.length > 0 && (
                          <div className="mt-1 text-xs">
                            <span className="font-medium text-red-600">排除：</span>
                            <span className="text-gray-600 ml-1">
                              {scheme.exclusions.join('、')}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
      </div>
    </div>
  );
}