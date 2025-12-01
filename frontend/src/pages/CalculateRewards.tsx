import { useState, useEffect } from 'react';
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
  const [selectedScheme, setSelectedScheme] = useState<string>('');
  const [schemes, setSchemes] = useState<Scheme[]>([]);
  const [amount, setAmount] = useState('');
  const [rewards, setRewards] = useState([
    { percentage: 0.3, calculationMethod: 'round' as const },
    { percentage: 2.7, calculationMethod: 'round' as const },
    { percentage: 0, calculationMethod: 'floor' as const },
  ]);
  const [calculationResult, setCalculationResult] = useState<any>(null);
  const [quotaInfo, setQuotaInfo] = useState<any>(null);

  useEffect(() => {
    loadSchemes();
    // 每5秒重新載入一次，以同步調整順序的變更
    const interval = setInterval(loadSchemes, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadSchemes = async () => {
    try {
      const res = await api.get('/calculation/schemes');
      setSchemes(res.data.data);
    } catch (error) {
      console.error('載入方案錯誤:', error);
    }
  };

  useEffect(() => {
    if (selectedScheme && amount) {
      calculateWithScheme();
    } else if (amount) {
      calculateWithoutScheme();
    } else {
      setCalculationResult(null);
      setQuotaInfo(null);
    }
  }, [selectedScheme, amount, rewards]);

  const calculateWithoutScheme = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      setCalculationResult(null);
      return;
    }

    try {
      const res = await api.post('/calculation/calculate', {
        amount: parseFloat(amount),
        rewards,
      });
      setCalculationResult(res.data.data);
      setQuotaInfo(null);
    } catch (error) {
      console.error('計算錯誤:', error);
    }
  };

  const calculateWithScheme = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      setCalculationResult(null);
      setQuotaInfo(null);
      return;
    }

    try {
      const scheme = schemes.find((s) => s.id === selectedScheme);
      if (!scheme) {
        setCalculationResult(null);
        setQuotaInfo(null);
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

      setCalculationResult(res.data.data);
      setQuotaInfo(res.data.data.quotaInfo || null);
    } catch (error: any) {
      console.error('計算錯誤:', error);
      alert(error.response?.data?.error || '計算失敗');
    }
  };

  const updateReward = (index: number, field: string, value: any) => {
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
          {/* 方案選擇 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              方案選擇
            </label>
            <select
              value={selectedScheme}
              onChange={(e) => {
                setSelectedScheme(e.target.value);
                if (!e.target.value) {
                  setRewards([
                    { percentage: 0.3, calculationMethod: 'round' },
                    { percentage: 2.7, calculationMethod: 'round' },
                    { percentage: 0, calculationMethod: 'floor' },
                  ]);
                  setCalculationResult(null);
                  setQuotaInfo(null);
                }
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">不帶入方案</option>
              {schemes.map((scheme) => (
                <option key={scheme.id} value={scheme.id}>
                  {scheme.name}
                </option>
              ))}
            </select>
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

          {/* 回饋組成設定 */}
          {!selectedScheme && (
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

          {/* 計算結果 */}
          {calculationResult && (
            <div className="mt-6 p-6 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border-2 border-green-200 shadow-lg">
              <h3 className="text-xl font-semibold mb-4 bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                ✨ 計算結果
              </h3>
              {selectedScheme && (
                <div className="mb-4 text-sm">
                  <div className="font-semibold mb-2">
                    {schemes.find((s) => s.id === selectedScheme)?.name} 金額 {parseFloat(amount).toLocaleString()}
                  </div>
                </div>
              )}
              
              {/* 計算結果表格 */}
              <div className="mb-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 bg-white rounded-lg">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">回饋%數</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">計算方式</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">計算結果</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {calculationResult.breakdown.map((item: any, index: number) => (
                      <tr key={index}>
                        <td className="px-4 py-3 text-sm">{item.percentage}%</td>
                        <td className="px-4 py-3 text-sm">
                          {item.calculationMethod === 'round' && '四捨五入'}
                          {item.calculationMethod === 'floor' && '無條件捨去'}
                          {item.calculationMethod === 'ceil' && '無條件進位'}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium">
                          {item.originalReward.toFixed(2)} → {item.calculatedReward}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 pt-4 border-t-2 border-green-300">
                <div className="text-2xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                  💰 總回饋: {calculationResult.totalReward}
                </div>
              </div>

              {/* 額度資訊 */}
              {quotaInfo && quotaInfo.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <h4 className="font-semibold mb-2">預計消費後餘額</h4>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 bg-white rounded-lg">
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

