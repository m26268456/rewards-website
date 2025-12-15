import { useState, useEffect, useRef } from 'react';
import { isApp } from '../utils/isApp';
import api from '../utils/api';
import { calculateReward } from '../utils/rewardCalculation';

interface Scheme {
  id: string;
  name: string;
  type: 'scheme' | 'payment' | 'payment_scheme';
  schemeId?: string;
  paymentId?: string;
}

export default function CalculateRewards() {
  type Mode = 'none' | 'channel' | 'scheme';
  const [mode, setMode] = useState<Mode>('none');
  const [channelKeyword, setChannelKeyword] = useState('');
  const [selectedScheme, setSelectedScheme] = useState<string>('');
  const [schemes, setSchemes] = useState<Scheme[]>([]);
  const selectedSchemeRef = useRef<string>('');
  const [amount, setAmount] = useState('');
  const [rewards, setRewards] = useState([
    { percentage: 0.3, calculationMethod: 'round' as const },
    { percentage: 2.7, calculationMethod: 'round' as const },
    { percentage: 0, calculationMethod: 'floor' as const },
  ]);
  interface CalculationResult {
    totalReward: number;
    breakdown: Array<{
      percentage: number;
      calculatedReward: number;
      calculationMethod: string;
    }>;
    quotaInfo?: Array<{
      percentage: number;
      quotaLimit: number | null;
      remainingQuota: number | null;
      usedQuota: number;
      newRemainingQuota: number | null;
      referenceAmount: number | null;
    }>;
  }
  
  const [calculationResult, setCalculationResult] = useState<any>(null);
  const [quotaInfo, setQuotaInfo] = useState<CalculationResult['quotaInfo']>(null);

  useEffect(() => {
    loadSchemes();
    // 每5秒重新載入一次，以同步調整順序的變更
    const interval = setInterval(loadSchemes, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadSchemes = async () => {
    try {
      const res = await api.get('/calculation/schemes');
      const data = res.data.data || [];
      setSchemes(data);
      const currentSelection = selectedSchemeRef.current;
      if (data.length > 0) {
        const stillExists = currentSelection && data.some((s: any) => s.id === currentSelection);
        if (!stillExists) {
          selectedSchemeRef.current = data[0].id;
          setSelectedScheme(data[0].id);
        }
      }
    } catch (error) {
      console.error('載入方案錯誤:', error);
    }
  };

  useEffect(() => {
    selectedSchemeRef.current = selectedScheme;
  }, [selectedScheme]);

  useEffect(() => {
    let cancelled = false;
    
    const performCalculation = async () => {
      if (mode === 'scheme' && selectedScheme && amount) {
        if (!amount || parseFloat(amount) <= 0) {
          if (!cancelled) {
            setCalculationResult(null);
            setQuotaInfo(null);
          }
          return;
        }

        try {
          const scheme = schemes.find((s) => s.id === selectedScheme);
          if (!scheme) {
            if (!cancelled) {
              setCalculationResult(null);
              setQuotaInfo(null);
            }
            return;
          }

          let schemeId: string | undefined;
          let paymentMethodId: string | undefined;

          if (scheme.type === 'scheme') {
            schemeId = scheme.id;
          } else if (scheme.type === 'payment_scheme' && scheme.schemeId && scheme.paymentId) {
            schemeId = scheme.schemeId;
            paymentMethodId = scheme.paymentId;
          } else if (scheme.type === 'payment') {
            paymentMethodId = scheme.id;
          }

          const res = await api.post('/calculation/calculate-with-scheme', {
            amount: parseFloat(amount),
            schemeId: schemeId || null,
            paymentMethodId: paymentMethodId || null,
          });

          if (!cancelled) {
            setCalculationResult(res.data.data);
            setQuotaInfo(res.data.data.quotaInfo || null);
          }
        } catch (error: unknown) {
          if (!cancelled) {
            console.error('計算錯誤:', error);
            const err = error as { response?: { data?: { error?: string } } };
            alert(err.response?.data?.error || '計算失敗');
          }
        }
      } else if (mode === 'channel' && channelKeyword.trim() && amount) {
        if (parseFloat(amount) <= 0) {
          if (!cancelled) {
            setCalculationResult(null);
            setQuotaInfo(null);
          }
          return;
        }
        try {
          const res = await api.post('/schemes/query-channels', { keywords: [channelKeyword.trim()] });
          const data = res.data?.data || [];

          // 展開所有群組與通路結果，保留方案設定的通路名稱
          const allResults = (Array.isArray(data) ? data : []).flatMap((g: any) =>
            (g.channels || []).flatMap((ch: any) =>
              (ch.results || []).map((r: any) => ({
                ...r,
                channelName: ch.channelName,
                schemeChannelName: r.schemeChannelName,
                sourceChannelName: r.sourceChannelName,
                keyword: g.keyword,
              }))
            )
          );

          // 逐組成依計算方式計算，並攜帶方案/通路資訊
          const breakdown = allResults.map((r: any) => {
            const amountNum = parseFloat(amount);
            const items = Array.isArray(r.rewardItems) && r.rewardItems.length > 0
              ? r.rewardItems
              : (r.rewardBreakdown || '').split('+').map((p: string) => ({
                  percentage: parseFloat(p.replace('%', '').trim()),
                  calculationMethod: r.calculationMethod || 'round',
                }));
            const perItemRewards = items.map((it: any) => {
              const pct = parseFloat(it.percentage);
              if (!isFinite(pct)) return { ...it, originalReward: 0, calculatedReward: 0 };
              const method = (it.calculationMethod || 'round') as 'round' | 'floor' | 'ceil';
              const orig = (amountNum * pct) / 100;
              const calc = calculateReward(amountNum, pct, method);
              return { ...it, originalReward: orig, calculatedReward: calc };
            });
            const totalReward = perItemRewards.reduce((a: number, b: any) => a + (b.calculatedReward || 0), 0);
            const totalPct = items
              .map((it: any) => parseFloat(it.percentage))
              .filter((n: number) => isFinite(n))
              .reduce((a: number, b: number) => a + b, 0);
            return {
              percentage: totalPct,
              calculatedReward: totalReward,
              originalReward: perItemRewards.reduce((a: number, b: any) => a + (b.originalReward || 0), 0),
              calculationMethod: 'mixed',
              isExcluded: r.isExcluded,
              schemeInfo: r.schemeInfo,
              channelName: r.channelName || r.sourceChannelName || r.keyword,
              schemeChannelName: r.schemeChannelName,
              rewardItems: perItemRewards,
            };
          });

          const sorted = breakdown
            .sort((a: any, b: any) => {
              // 排除優先，其次按回饋金額排序
              if (a.isExcluded !== b.isExcluded) return a.isExcluded ? -1 : 1;
              return (b.calculatedReward || 0) - (a.calculatedReward || 0);
            });

          const totalReward = sorted.length > 0 ? sorted[0].calculatedReward : 0;

          if (!cancelled) {
            setCalculationResult({
              totalReward,
              breakdown: sorted,
            } as any);
            setQuotaInfo(null);
          }
        } catch (error: unknown) {
          if (!cancelled) {
            console.error('通路計算錯誤:', error);
            const err = error as { response?: { data?: { error?: string } } };
            alert(err.response?.data?.error || '通路計算失敗');
          }
        }
      } else if (mode === 'none' && amount) {
        if (!amount || parseFloat(amount) <= 0) {
          if (!cancelled) {
            setCalculationResult(null);
          }
          return;
        }

        try {
          const res = await api.post('/calculation/calculate', {
            amount: parseFloat(amount),
            rewards,
          });
          if (!cancelled) {
            setCalculationResult(res.data.data);
            setQuotaInfo(null);
          }
        } catch (error) {
          if (!cancelled) {
            console.error('計算錯誤:', error);
          }
        }
      } else {
        if (!cancelled) {
          setCalculationResult(null);
          setQuotaInfo(null);
        }
      }
    };

    performCalculation();

    return () => {
      cancelled = true;
    };
  }, [selectedScheme, amount, rewards, schemes]);

  const updateReward = (index: number, field: string, value: string | number) => {
    const newRewards = [...rewards];
    newRewards[index] = { ...newRewards[index], [field]: value };
    setRewards(newRewards);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
        回饋計算
      </h2>

      <div className="card bg-gradient-to-br from-white to-purple-50">
        <div className="space-y-4">
          {/* 模式選擇 + 互斥欄位 */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">方案選擇</label>
            <div className="flex flex-wrap gap-4 text-sm text-gray-700">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="mode"
                  value="none"
                  checked={mode === 'none'}
                  onChange={() => { setMode('none'); setSelectedScheme(''); setChannelKeyword(''); setCalculationResult(null); setQuotaInfo(null); }}
                />
                不使用
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="mode"
                  value="scheme"
                  checked={mode === 'scheme'}
                  onChange={() => { setMode('scheme'); setChannelKeyword(''); setCalculationResult(null); setQuotaInfo(null); }}
                />
                方案
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="mode"
                  value="channel"
                  checked={mode === 'channel'}
                  onChange={() => { setMode('channel'); setSelectedScheme(''); setCalculationResult(null); setQuotaInfo(null); }}
                />
                通路
              </label>
            </div>

            {mode === 'scheme' && (
              <select
                value={selectedScheme}
                onChange={(e) => {
                  setSelectedScheme(e.target.value);
                  if (!e.target.value) {
                    setCalculationResult(null);
                    setQuotaInfo(null);
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {schemes.map((scheme) => (
                  <option key={scheme.id} value={scheme.id}>
                    {scheme.name}
                  </option>
                ))}
              </select>
            )}

            {mode === 'channel' && (
              <input
                type="text"
                value={channelKeyword}
                onChange={(e) => setChannelKeyword(e.target.value)}
                placeholder="輸入通路名稱（手動輸入，單一關鍵字）"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
          </div>

          {/* 金額輸入 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              金額
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="輸入消費金額"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 回饋組成設定（僅不使用方案/通路時可自訂） */}
          {mode === 'none' && (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">回饋%數</label>
              <div className="grid grid-cols-3 gap-2">
                {rewards.map((reward, index) => (
                  <input
                    key={index}
                    type="number"
                    step="0.1"
                    value={reward.percentage}
                    onChange={(e) =>
                      updateReward(index, 'percentage', parseFloat(e.target.value) || 0)
                    }
                    className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ))}
              </div>

              <label className="block text-sm font-medium text-gray-700">計算方式</label>
              <div className="grid grid-cols-3 gap-2">
                {rewards.map((reward, index) => (
                  <select
                    key={index}
                    value={reward.calculationMethod}
                    onChange={(e) =>
                      updateReward(index, 'calculationMethod', e.target.value)
                    }
                    className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="round">四捨五入</option>
                    <option value="floor">無條件捨去</option>
                    <option value="ceil">無條件進位</option>
                  </select>
                ))}
              </div>
            </div>
          )}

          {/* 計算結果（回到表格呈現） */}
          {calculationResult && (
            <div className="mt-6 p-6 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border-2 border-green-200 shadow-lg">
              <h3 className="text-xl font-semibold mb-4 bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                ✨ 計算結果
              </h3>

              <div className="mb-4 overflow-x-auto w-full">
                <div className={isApp() ? 'inline-block min-w-max' : undefined}>
                  <table
                    className={
                      isApp()
                        ? 'w-auto min-w-max divide-y divide-gray-200 bg-white rounded-lg'
                        : 'min-w-full divide-y divide-gray-200 bg-white rounded-lg'
                    }
                  >
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">總計</th>
                      {(mode === 'channel') && (
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">方案 / 通路</th>
                      )}
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">回饋%數</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">計算方式</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">計算結果</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {calculationResult.breakdown.map((item: any, index: number) => {
                      const methodText = (m: string) =>
                        m === 'floor' ? '無條件捨去' : m === 'ceil' ? '無條件進位' : '四捨五入';
                      // 計算總計：所有取整後的值加總（calculatedReward 已經是取整後的值）
                      const totalCalculated = item.rewardItems?.length
                        ? item.rewardItems.reduce((sum: number, it: any) => sum + (it.calculatedReward ?? 0), 0)
                        : (item.calculatedReward ?? 0);
                      
                      return (
                        <tr key={index} className="align-top">
                          <td className={`px-4 py-3 text-sm font-semibold ${item.isExcluded ? 'text-red-600' : 'text-green-700'}`}>
                            {item.isExcluded ? '排除' : totalCalculated}
                          </td>
                          {(mode === 'channel') && (
                          <td className="px-4 py-3 text-sm space-y-1">
                            <div className="font-semibold text-gray-800">{item.schemeInfo || '—'}</div>
                            <div>
                              <span className="text-gray-500 text-xs bg-gray-100 px-2 py-0.5 rounded-full">
                                {item.schemeChannelName || '—'}
                              </span>
                            </div>
                          </td>
                          )}
                          <td className="px-4 py-3 text-sm">
                          {item.rewardItems?.length
                            ? item.rewardItems.map((it: any, i: number) => (
                              <div key={i}>{(it.percentage ?? 0).toFixed(2)}%</div>
                              ))
                            : <div>{(item.percentage ?? 0).toFixed(2)}%</div>
                          }
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {item.rewardItems?.length
                              ? item.rewardItems.map((it: any, i: number) => (
                              <div key={i}>{methodText(it.calculationMethod || 'round')}</div>
                                ))
                              : <div>{methodText(item.calculationMethod || 'round')}</div>
                            }
                          </td>
                          <td className="px-4 py-3 text-sm font-medium">
                            {item.rewardItems?.length
                              ? item.rewardItems.map((it: any, i: number) => (
                              <div key={i}>
                                {(it.originalReward ?? 0).toFixed(2)} → {it.calculatedReward ?? 0}
                              </div>
                                ))
                              : (
                                  <div>
                                    {(item.originalReward ?? 0).toFixed(2)} → {item.calculatedReward ?? 0}
                                  </div>
                                )
                            }
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  </table>
                </div>
              </div>

              {/* 額度資訊 */}
              {quotaInfo && quotaInfo.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <h4 className="font-semibold mb-2">預計消費後餘額</h4>
                  <div className="overflow-x-auto w-full">
                    <table className="table-auto min-w-max divide-y divide-gray-200 bg-white rounded-lg">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">回饋%數</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">當前餘額</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">扣除餘額</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">剩餘額度</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {quotaInfo.map((quota: any, index: number) => {
                          const currentQuota = quota.currentQuota !== undefined 
                            ? (quota.currentQuota === null || quota.currentQuota === '無上限' 
                                ? '無上限' 
                                : typeof quota.currentQuota === 'number' 
                                  ? Math.round(quota.currentQuota).toLocaleString() 
                                  : quota.currentQuota)
                            : '無上限';
                          const deductedQuota = quota.deductedQuota !== undefined 
                            ? (typeof quota.deductedQuota === 'number' 
                                ? Math.round(quota.deductedQuota).toLocaleString() 
                                : quota.deductedQuota)
                            : '0';
                          const remainingQuotaStr = quota.remainingQuota === null || quota.remainingQuota === '無上限' 
                            ? '無上限' 
                            : typeof quota.remainingQuota === 'number' 
                              ? Math.round(quota.remainingQuota).toLocaleString() 
                              : quota.remainingQuota;
                          return (
                            <tr key={index}>
                              <td className="px-4 py-3 text-sm">{quota.rewardPercentage}%</td>
                              <td className="px-4 py-3 text-sm">{currentQuota}</td>
                              <td className="px-4 py-3 text-sm">{deductedQuota}</td>
                              <td className="px-4 py-3 text-sm">{remainingQuotaStr}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

