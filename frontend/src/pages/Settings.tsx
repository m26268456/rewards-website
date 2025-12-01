import { useState, useEffect, FormEvent, ChangeEvent, useRef } from 'react';
import api from '../utils/api';
import { isApp, setAppMode } from '../utils/isApp';
import type { Card, Scheme, PaymentMethod, TransactionType, CalculationScheme, Channel } from '../types';

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

export default function Settings() {
  const [activeTab, setActiveTab] = useState<'query' | 'calculate' | 'transactions' | 'quota' | 'app'>(
    'query'
  );
  const [appModeEnabled, setAppModeEnabled] = useState(false);

  useEffect(() => {
    setAppModeEnabled(isApp());
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-blue-600 bg-clip-text text-transparent">
        管理設定
      </h2>

      {/* 標籤頁 */}
      <div className="bg-white shadow rounded-lg">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px overflow-x-auto">
            {[
              { id: 'query', label: '回饋查詢' },
              { id: 'calculate', label: '回饋計算' },
              { id: 'transactions', label: '記帳功能' },
              { id: 'quota', label: '額度查詢' },
              { id: 'app', label: '應用程式設定' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as 'query' | 'calculate' | 'transactions' | 'quota' | 'app')}
                className={`px-6 py-3 text-sm font-medium border-b-2 whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'query' && <QuerySettings />}
          {activeTab === 'calculate' && <CalculateSettings />}
          {activeTab === 'transactions' && <TransactionSettings />}
          {activeTab === 'quota' && <QuotaSettings />}
          {activeTab === 'app' && <AppSettings appModeEnabled={appModeEnabled} onToggle={setAppModeEnabled} />}
        </div>
      </div>
    </div>
  );
}

// 方案詳細管理組件
function SchemeDetailManager({
  scheme,
  isExpanded,
  onExpand,
  onEdit,
  onDelete,
}: {
  scheme: Scheme;
  isExpanded: boolean;
  onExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [schemeDetails, setSchemeDetails] = useState<{
    applications: Array<{ id: string; name: string; note?: string }>;
    exclusions: Array<{ id: string; name: string }>;
    rewards: Array<{
      id: string;
      reward_percentage: number;
      calculation_method: string;
      quota_limit: number | null;
      quota_refresh_type: string | null;
      quota_refresh_value: number | null;
      quota_refresh_date: string | null;
      display_order: number;
    }>;
  } | null>(null);

  useEffect(() => {
    if (isExpanded) {
      loadSchemeDetails();
    }
  }, [isExpanded, scheme.id]);

  const loadSchemeDetails = async () => {
    try {
      const res = await api.get(`/schemes/${scheme.id}/details`);
      const data = res.data.data;
      setSchemeDetails(data);
    } catch (error) {
      console.error('載入方案詳細錯誤:', error);
    }
  };

  return (
    <div className="p-2 bg-white rounded text-sm border">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0 w-full sm:w-auto">
          <div className="font-medium">{scheme.name}</div>
          {scheme.note && (
            <div 
              className="text-xs text-gray-600 break-words mt-1 overflow-wrap-anywhere" 
              dangerouslySetInnerHTML={{ __html: linkify(scheme.note) }}
            />
          )}
          <div className="text-xs text-gray-500 mt-1">
            {scheme.requires_switch ? '需切換' : '免切換'}
          </div>
        </div>
        <div className="flex gap-1 flex-shrink-0 flex-wrap">
          <button
            onClick={onExpand}
            className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 whitespace-nowrap"
          >
            {isExpanded ? '收起' : '展開'}
          </button>
          <button
            onClick={onEdit}
            className="px-2 py-1 bg-yellow-500 text-white rounded text-xs hover:bg-yellow-600"
          >
            編輯
          </button>
          <button
            onClick={onDelete}
            className="px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
          >
            刪除
          </button>
        </div>
      </div>

      {isExpanded && schemeDetails && (
        <div className="mt-2 pt-2 border-t space-y-4">
          {/* 通路顯示 */}
          <div>
            <span className="text-xs font-medium">通路設定</span>
            <div className="text-xs space-y-1 mt-1">
              <div>
                <span className="font-medium">適用通路：</span>
                {schemeDetails.applications.length > 0 ? (
                  schemeDetails.applications.map((app, idx) => (
                    <span key={idx}>
                      {app.name}
                      {app.note && ` (${app.note})`}
                      {idx < schemeDetails.applications.length - 1 && ', '}
                    </span>
                  ))
                ) : (
                  <span className="text-gray-500">無</span>
                )}
              </div>
              <div>
                <span className="font-medium">排除通路：</span>
                {schemeDetails.exclusions.length > 0 ? (
                  schemeDetails.exclusions.map((exc, idx) => (
                    <span key={idx}>
                      {exc.name}
                      {idx < schemeDetails.exclusions.length - 1 && ', '}
                    </span>
                  ))
                ) : (
                  <span className="text-gray-500">無</span>
                )}
              </div>
            </div>
          </div>

          {/* 回饋組成顯示 */}
          <div>
            <span className="text-xs font-medium">回饋組成</span>
            <div className="text-xs mt-1">
              {schemeDetails.rewards.length > 0 ? (
                schemeDetails.rewards.map((r, idx) => (
                  <div key={idx}>
                    {r.reward_percentage}% ({r.calculation_method === 'round' ? '四捨五入' : r.calculation_method === 'floor' ? '無條件捨去' : '無條件進位'})
                  </div>
                ))
              ) : (
                <span className="text-gray-500">無回饋組成</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 卡片項目組件（包含方案管理）
function CardItem({
  card,
  onEdit,
  onDelete,
  onReload,
}: {
  card: Card;
  onEdit: () => void;
  onDelete: () => void;
  onReload: () => void;
}) {
  const [showSchemes, setShowSchemes] = useState(false);
  const [schemes, setSchemes] = useState<Scheme[]>([]);
  const [showSchemeForm, setShowSchemeForm] = useState(false);
  const [editingScheme, setEditingScheme] = useState<Scheme | null>(null);
  const [expandedSchemeId, setExpandedSchemeId] = useState<string | null>(null);
  const [isReorderingSchemes, setIsReorderingSchemes] = useState(false);
  const [reorderedSchemes, setReorderedSchemes] = useState<Scheme[]>([]);

  // channels 已移除，現在使用文字輸入方式
  const [channelApplicationsText, setChannelApplicationsText] = useState<string>(''); // 適用通路文字（每行一個通路名稱）
  const [channelExclusionsText, setChannelExclusionsText] = useState<string>(''); // 排除通路文字（每行一個通路名稱）
  const [rewards, setRewards] = useState<Array<{
    percentage: number;
    calculationMethod: string;
    quotaLimit: number | null;
    quotaRefreshType: string | null;
    quotaRefreshValue: number | null;
    quotaRefreshDate: string | null;
    displayOrder: number;
  }>>([]);
  const [schemeFormData, setSchemeFormData] = useState({
    name: '',
    note: '',
    requiresSwitch: false,
    activityStartDate: '',
    activityEndDate: '',
    displayOrder: 0,
  });

  // 用於追蹤表單和展開區域的 ref
  const schemeFormRef = useRef<HTMLDivElement>(null);
  const expandedSchemeRef = useRef<HTMLDivElement>(null);
  const schemesListRef = useRef<HTMLDivElement>(null);

  // ESC 鍵取消編輯/展開，點擊空白處關閉
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showSchemeForm || editingScheme) {
          setShowSchemeForm(false);
          setEditingScheme(null);
          setChannelApplicationsText('');
          setChannelExclusionsText('');
          setRewards([]);
        }
        if (expandedSchemeId) {
          setExpandedSchemeId(null);
        }
        if (showSchemes) {
          setShowSchemes(false);
        }
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      // 如果點擊在表單外部，關閉表單
      if (showSchemeForm && schemeFormRef.current && !schemeFormRef.current.contains(target)) {
        // 檢查是否點擊在按鈕上（不關閉）
        if (target.closest('button')) {
          return;
        }
        setShowSchemeForm(false);
        setEditingScheme(null);
        setChannelApplicationsText('');
        setChannelExclusionsText('');
        setRewards([]);
      }
      
      // 如果點擊在展開的方案外部，關閉展開
      if (expandedSchemeId && expandedSchemeRef.current && !expandedSchemeRef.current.contains(target)) {
        // 檢查是否點擊在表單內或按鈕上
        if (schemeFormRef.current?.contains(target) || target.closest('button')) {
          return;
        }
        setExpandedSchemeId(null);
      }
      
      // 如果點擊在方案列表外部，關閉方案列表
      if (showSchemes && schemesListRef.current && !schemesListRef.current.contains(target)) {
        // 檢查是否點擊在按鈕上（不關閉，因為按鈕是用來切換顯示的）
        const clickedButton = target.closest('button');
        if (clickedButton && clickedButton.textContent?.includes('管理方案')) {
          return; // 點擊"管理方案"按鈕不關閉
        }
        // 檢查是否點擊在表單內
        if (schemeFormRef.current?.contains(target) || expandedSchemeRef.current?.contains(target)) {
          return;
        }
        setShowSchemes(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSchemeForm, editingScheme, expandedSchemeId, showSchemes]);

  const loadSchemes = async () => {
    try {
      const res = await api.get(`/schemes/card/${card.id}`);
      setSchemes(res.data.data);
    } catch (error) {
      console.error('載入方案錯誤:', error);
    }
  };

  // loadChannels 已移除，現在使用文字輸入方式，不需要預先載入所有通路

  const handleSchemeDelete = async (schemeId: string) => {
    if (!confirm('確定要刪除這個方案嗎？這將同時刪除該方案的所有回饋組成、排除通路、適用通路等相關資料。')) return;
    try {
      await api.delete(`/schemes/${schemeId}`);
      alert('方案已刪除');
      loadSchemes();
      onReload();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      alert(err.response?.data?.error || '刪除失敗');
    }
  };

  const handleNewScheme = () => {
    setEditingScheme(null);
    setSchemeFormData({
      name: '',
      note: '',
      requiresSwitch: false,
      activityStartDate: '',
      activityEndDate: '',
      displayOrder: schemes.length > 0 ? Math.max(...schemes.map(s => s.display_order ?? 0)) + 1 : 0,
    });
    // 清空回饋組成、適用通路、排除通路
    setRewards([]);
    setChannelApplicationsText('');
    setChannelExclusionsText('');
    setShowSchemeForm(true);
  };

  const handleEditScheme = async (scheme: Scheme) => {
    if (editingScheme && editingScheme.id !== scheme.id) {
      if (!confirm('您正在編輯另一個方案，是否取消當前編輯並編輯此方案？')) {
        return;
      }
      setShowSchemeForm(false);
      setEditingScheme(null);
      setExpandedSchemeId(null);
    }
    setEditingScheme(scheme);
    setSchemeFormData({
      name: scheme.name,
      note: scheme.note || '',
      requiresSwitch: scheme.requires_switch,
      activityStartDate: scheme.activity_start_date ? scheme.activity_start_date.split('T')[0] : '',
      activityEndDate: scheme.activity_end_date ? scheme.activity_end_date.split('T')[0] : '',
      displayOrder: scheme.display_order ?? 0,
    });
    // 載入方案的詳細資訊（回饋組成、適用通路、排除通路）
    try {
      const res = await api.get(`/schemes/${scheme.id}/details`);
      const data = res.data.data;
      // 載入回饋組成
      setRewards(
        data.rewards.map((r: any) => ({
          percentage: parseFloat(r.reward_percentage) || 0,
          calculationMethod: r.calculation_method || 'round',
          quotaLimit: r.quota_limit ? parseFloat(r.quota_limit) : null,
          quotaRefreshType: r.quota_refresh_type || null,
          quotaRefreshValue: r.quota_refresh_value || null,
          quotaRefreshDate: r.quota_refresh_date ? r.quota_refresh_date.split('T')[0] : null,
          displayOrder: r.display_order || 0,
        }))
      );
      // 載入適用通路（轉換為文字，每行一個通路名稱）
      setChannelApplicationsText(
        data.applications.map((app: { name: string; note?: string }) => 
          app.note ? `${app.name} (${app.note})` : app.name
        ).join('\n')
      );
      // 載入排除通路（轉換為文字，每行一個通路名稱）
      setChannelExclusionsText(
        data.exclusions.map((exc: { name: string }) => exc.name).join('\n')
      );
    } catch (error) {
      console.error('載入方案詳細錯誤:', error);
      // 如果載入失敗，至少清空這些資料
      setRewards([]);
      setChannelApplicationsText('');
      setChannelExclusionsText('');
    }
    setShowSchemeForm(true);
    setExpandedSchemeId(scheme.id);
  };

  // 輔助函數：將通路名稱文字轉換為通路ID陣列
  const convertChannelNamesToIds = async (channelText: string): Promise<string[]> => {
    const channelNames = channelText.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    const channelIds: string[] = [];
    for (const channelName of channelNames) {
      // 移除備註（如果有）
      const nameOnly = channelName.split('(')[0].trim();
      if (!nameOnly) continue;
      
      // 搜尋通路
      try {
        const searchRes = await api.get(`/channels/search?name=${encodeURIComponent(nameOnly)}`);
        const matchingChannels = searchRes.data.data;
        
        if (matchingChannels.length > 0) {
          // 使用第一個匹配的通路
          channelIds.push(matchingChannels[0].id);
        } else {
          // 如果找不到，創建新通路
          const createRes = await api.post('/channels', {
            name: nameOnly,
            isCommon: false,
            displayOrder: 0,
          });
          channelIds.push(createRes.data.data.id);
        }
      } catch (error) {
        console.error(`處理通路 "${nameOnly}" 時發生錯誤:`, error);
      }
    }
    return channelIds;
  };

  // 輔助函數：將適用通路文字轉換為通路ID和備註陣列
  const convertApplicationTextToIds = async (applicationText: string): Promise<Array<{ channelId: string; note: string }>> => {
    const lines = applicationText.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    const applications: Array<{ channelId: string; note: string }> = [];
    for (const line of lines) {
      // 解析通路名稱和備註（格式：通路名稱 (備註) 或 通路名稱）
      let channelName = line;
      let note = '';
      
      const noteMatch = line.match(/^(.+?)\s*\((.+?)\)$/);
      if (noteMatch) {
        channelName = noteMatch[1].trim();
        note = noteMatch[2].trim();
      }
      
      if (!channelName) continue;
      
      // 搜尋或創建通路
      try {
        const searchRes = await api.get(`/channels/search?name=${encodeURIComponent(channelName)}`);
        const matchingChannels = searchRes.data.data;
        
        let channelId: string;
        if (matchingChannels.length > 0) {
          channelId = matchingChannels[0].id;
        } else {
          const createRes = await api.post('/channels', {
            name: channelName,
            isCommon: false,
            displayOrder: 0,
          });
          channelId = createRes.data.data.id;
        }
        
        applications.push({ channelId, note });
      } catch (error) {
        console.error(`處理適用通路 "${channelName}" 時發生錯誤:`, error);
      }
    }
    return applications;
  };

  const handleSchemeSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      // 轉換通路文字為ID
      const applications = await convertApplicationTextToIds(channelApplicationsText);
      const exclusions = await convertChannelNamesToIds(channelExclusionsText);

      if (editingScheme) {
        // 更新方案基本資訊
        await api.put(`/schemes/${editingScheme.id}`, {
          name: schemeFormData.name,
          note: schemeFormData.note || null,
          requiresSwitch: schemeFormData.requiresSwitch,
          activityStartDate: schemeFormData.activityStartDate || null,
          activityEndDate: schemeFormData.activityEndDate || null,
          displayOrder: schemeFormData.displayOrder,
        });
        // 更新通路設定
        await api.put(`/schemes/${editingScheme.id}/channels`, {
          applications: applications.map(app => ({
            channelId: app.channelId,
            note: app.note || null,
          })),
          exclusions: exclusions,
        });
        // 更新回饋組成
        await api.put(`/schemes/${editingScheme.id}/rewards`, {
          rewards: rewards.map((r, idx) => ({
            percentage: r.percentage,
            calculationMethod: r.calculationMethod,
            quotaLimit: r.quotaLimit,
            quotaRefreshType: r.quotaRefreshType,
            quotaRefreshValue: r.quotaRefreshValue,
            quotaRefreshDate: r.quotaRefreshDate,
            displayOrder: idx,
          })),
        });
        alert('方案已更新');
        setEditingScheme(null);
      } else {
        // 新增方案
        await api.post('/schemes', {
          cardId: card.id,
          name: schemeFormData.name,
          note: schemeFormData.note || null,
          requiresSwitch: schemeFormData.requiresSwitch,
          activityStartDate: schemeFormData.activityStartDate || null,
          activityEndDate: schemeFormData.activityEndDate || null,
          displayOrder: schemeFormData.displayOrder,
          rewards: rewards.map((r, idx) => ({
            percentage: r.percentage,
            calculationMethod: r.calculationMethod,
            quotaLimit: r.quotaLimit,
            quotaRefreshType: r.quotaRefreshType,
            quotaRefreshValue: r.quotaRefreshValue,
            quotaRefreshDate: r.quotaRefreshDate,
            displayOrder: idx,
          })),
        });
        // 新增後也需要設定通路
        const res = await api.get(`/schemes/card/${card.id}`);
        const newScheme = res.data.data.find((s: Scheme) => s.name === schemeFormData.name);
        if (newScheme) {
          await api.put(`/schemes/${newScheme.id}/channels`, {
            applications: applications.map(app => ({
              channelId: app.channelId,
              note: app.note || null,
            })),
            exclusions: exclusions,
          });
        }
        alert('方案已新增');
      }
      setShowSchemeForm(false);
      setEditingScheme(null);
      setExpandedSchemeId(null);
      setChannelApplicationsText('');
      setChannelExclusionsText('');
      setRewards([]);
      loadSchemes();
      onReload();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      alert(err.response?.data?.error || '操作失敗');
    }
  };

  const addReward = () => {
    setRewards([
      ...rewards,
      {
        percentage: 0,
        calculationMethod: 'round',
        quotaLimit: null,
        quotaRefreshType: null,
        quotaRefreshValue: null,
        quotaRefreshDate: null,
        displayOrder: rewards.length,
      },
    ]);
  };

  const removeReward = (index: number) => {
    setRewards(rewards.filter((_, i) => i !== index));
  };

  return (
    <div className="p-3 bg-gray-50 rounded border">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0 w-full sm:w-auto">
          <div className="font-medium">{card.name}</div>
          {card.note && (
            <div 
              className="text-sm text-gray-600 break-words mt-1 overflow-wrap-anywhere" 
              dangerouslySetInnerHTML={{ __html: linkify(card.note) }}
            />
          )}
        </div>
        <div className="flex gap-2 flex-shrink-0 flex-wrap">
          <button
            onClick={() => {
              setShowSchemes(!showSchemes);
              if (!showSchemes) {
                loadSchemes();
              }
            }}
            className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 whitespace-nowrap"
          >
            {showSchemes ? '隱藏方案' : '管理方案'}
          </button>
          <button
            onClick={onEdit}
            className="px-3 py-1 bg-yellow-500 text-white rounded text-sm hover:bg-yellow-600 whitespace-nowrap"
          >
            編輯
          </button>
          <button
            onClick={onDelete}
            className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600 whitespace-nowrap"
          >
            刪除
          </button>
        </div>
      </div>

      {/* 方案列表 */}
      {showSchemes && (
        <div ref={schemesListRef} className="mt-2 pt-2 border-t">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium">方案列表</span>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  if (isReorderingSchemes) {
                    // 保存順序
                    try {
                      const orders = reorderedSchemes.map((scheme, index) => ({
                        id: scheme.id,
                        displayOrder: index,
                      }));
                      await api.put(`/schemes/card/${card.id}/order`, { orders });
                      alert('順序已更新');
                      setIsReorderingSchemes(false);
                      loadSchemes();
                      onReload();
                    } catch (error: unknown) {
                      const err = error as { response?: { data?: { error?: string } } };
                      alert(err.response?.data?.error || '更新失敗');
                    }
                  } else {
                    // 進入調整順序模式
                    setIsReorderingSchemes(true);
                    setReorderedSchemes([...schemes]);
                  }
                }}
                className={`px-2 py-1 rounded text-xs ${
                  isReorderingSchemes
                    ? 'bg-green-500 text-white hover:bg-green-600'
                    : 'bg-gray-500 text-white hover:bg-gray-600'
                }`}
              >
                {isReorderingSchemes ? '儲存順序' : '調整順序'}
              </button>
              {isReorderingSchemes && (
                <button
                  onClick={() => {
                    setIsReorderingSchemes(false);
                    setReorderedSchemes([...schemes]);
                  }}
                  className="px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
                >
                  取消
                </button>
              )}
              {!isReorderingSchemes && (
                <button
                  onClick={handleNewScheme}
                  className="px-2 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600"
                >
                  新增方案
                </button>
              )}
            </div>
          </div>

          {/* 新增方案表單（在方案列表上方） */}
          {showSchemeForm && !editingScheme && (
            <div ref={schemeFormRef} className="mb-4 p-3 bg-white rounded border">
              <h4 className="font-medium mb-2">新增方案</h4>
              <form onSubmit={handleSchemeSubmit} className="space-y-4">
                {/* 方案名稱 */}
                <div>
                  <label className="block text-xs text-gray-600 mb-1">方案名稱 *</label>
                  <input
                    type="text"
                    value={schemeFormData.name}
                    onChange={(e) => setSchemeFormData({ ...schemeFormData, name: e.target.value })}
                    className="w-full px-2 py-1 border rounded text-sm"
                    required
                  />
                </div>
                {/* 備註 */}
                <div>
                  <label className="block text-xs text-gray-600 mb-1">備註</label>
                  <input
                    type="text"
                    value={schemeFormData.note}
                    onChange={(e) => setSchemeFormData({ ...schemeFormData, note: e.target.value })}
                    className="w-full px-2 py-1 border rounded text-sm"
                  />
                </div>
                {/* 回饋組成 */}
                <div>
                  <label className="block text-xs text-gray-600 mb-1">回饋組成</label>
                  <div className="space-y-2">
                    {rewards.map((reward, index) => (
                      <div key={index} className="p-2 border rounded space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs block mb-1">回饋%數</label>
                            <input
                              type="number"
                              step="0.1"
                              value={reward.percentage}
                              onChange={(e) => {
                                const newRewards = [...rewards];
                                newRewards[index].percentage = parseFloat(e.target.value) || 0;
                                setRewards(newRewards);
                              }}
                              className="w-full px-2 py-1 border rounded text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-xs block mb-1">計算方式</label>
                            <select
                              value={reward.calculationMethod}
                              onChange={(e) => {
                                const newRewards = [...rewards];
                                newRewards[index].calculationMethod = e.target.value;
                                setRewards(newRewards);
                              }}
                              className="w-full px-2 py-1 border rounded text-xs"
                            >
                              <option value="round">四捨五入</option>
                              <option value="floor">無條件捨去</option>
                              <option value="ceil">無條件進位</option>
                            </select>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs block mb-1">額度上限（留空為無上限）</label>
                            <input
                              type="number"
                              step="0.01"
                              value={reward.quotaLimit || ''}
                              onChange={(e) => {
                                const newRewards = [...rewards];
                                newRewards[index].quotaLimit = e.target.value ? parseFloat(e.target.value) : null;
                                setRewards(newRewards);
                              }}
                              className="w-full px-2 py-1 border rounded text-xs"
                              placeholder="無上限"
                            />
                          </div>
                          <div>
                            <label className="text-xs block mb-1">刷新類型</label>
                            <select
                              value={reward.quotaRefreshType || ''}
                              onChange={(e) => {
                                const newRewards = [...rewards];
                                newRewards[index].quotaRefreshType = e.target.value || null;
                                if (e.target.value !== 'date') {
                                  newRewards[index].quotaRefreshDate = null;
                                }
                                setRewards(newRewards);
                              }}
                              className="w-full px-2 py-1 border rounded text-xs"
                            >
                              <option value="">不刷新</option>
                              <option value="monthly">每月固定日期</option>
                              <option value="date">指定日期</option>
                              <option value="activity">活動結束日</option>
                            </select>
                          </div>
                        </div>
                        {(reward.quotaRefreshType === 'monthly' || reward.quotaRefreshType === 'date') && (
                          <div className="grid grid-cols-2 gap-2">
                            {reward.quotaRefreshType === 'monthly' && (
                              <div>
                                <label className="text-xs block mb-1">每月幾號（1-31）</label>
                                <input
                                  type="number"
                                  min="1"
                                  max="31"
                                  value={reward.quotaRefreshValue || ''}
                                  onChange={(e) => {
                                    const newRewards = [...rewards];
                                    newRewards[index].quotaRefreshValue = e.target.value ? parseInt(e.target.value) : null;
                                    setRewards(newRewards);
                                  }}
                                  className="w-full px-2 py-1 border rounded text-xs"
                                />
                              </div>
                            )}
                            {reward.quotaRefreshType === 'date' && (
                              <div>
                                <label className="text-xs block mb-1">刷新日期</label>
                                <input
                                  type="date"
                                  value={reward.quotaRefreshDate || ''}
                                  onChange={(e) => {
                                    const newRewards = [...rewards];
                                    newRewards[index].quotaRefreshDate = e.target.value || null;
                                    setRewards(newRewards);
                                  }}
                                  className="w-full px-2 py-1 border rounded text-xs"
                                />
                              </div>
                            )}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => removeReward(index)}
                          className="px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
                        >
                          刪除
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addReward}
                      className="px-2 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600"
                    >
                      新增回饋組成
                    </button>
                  </div>
                </div>
                {/* 方案期限 */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">活動開始日期</label>
                    <input
                      type="date"
                      value={schemeFormData.activityStartDate}
                      onChange={(e) => setSchemeFormData({ ...schemeFormData, activityStartDate: e.target.value })}
                      className="w-full px-2 py-1 border rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">活動結束日期</label>
                    <input
                      type="date"
                      value={schemeFormData.activityEndDate}
                      onChange={(e) => setSchemeFormData({ ...schemeFormData, activityEndDate: e.target.value })}
                      className="w-full px-2 py-1 border rounded text-sm"
                    />
                  </div>
                </div>
                {/* 適用通路 */}
                <div>
                  <label className="block text-xs text-gray-600 mb-1">
                    適用通路（每行一個通路名稱，可在名稱後加上備註，格式：通路名稱 (備註)）
                  </label>
                  <textarea
                    value={channelApplicationsText}
                    onChange={(e) => setChannelApplicationsText(e.target.value)}
                    className="w-full px-2 py-1 border rounded text-xs"
                    rows={6}
                    placeholder="例如：&#10;環球影城&#10;7-11 (便利商店)&#10;全聯福利中心"
                  />
                </div>
                {/* 排除通路 */}
                <div>
                  <label className="block text-xs text-gray-600 mb-1">排除通路（每行一個通路名稱）</label>
                  <textarea
                    value={channelExclusionsText}
                    onChange={(e) => setChannelExclusionsText(e.target.value)}
                    className="w-full px-2 py-1 border rounded text-xs"
                    rows={6}
                    placeholder="例如：&#10;通路A&#10;通路B"
                  />
                </div>
                {/* 需切換 */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="requiresSwitch"
                    checked={schemeFormData.requiresSwitch}
                    onChange={(e) => setSchemeFormData({ ...schemeFormData, requiresSwitch: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <label htmlFor="requiresSwitch" className="text-xs text-gray-600">需切換</label>
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="px-3 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
                  >
                    {editingScheme ? '更新' : '新增'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSchemeForm(false);
                      setEditingScheme(null);
                      setChannelApplicationsText('');
                      setChannelExclusionsText('');
                      setRewards([]);
                    }}
                    className="px-3 py-1 bg-gray-500 text-white rounded text-xs hover:bg-gray-600"
                  >
                    取消
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="space-y-1">
            {(isReorderingSchemes ? reorderedSchemes : schemes).length > 0 ? (
              (isReorderingSchemes ? reorderedSchemes : schemes).map((scheme: Scheme, index: number) => (
                <div 
                  key={scheme.id} 
                  ref={expandedSchemeId === scheme.id ? expandedSchemeRef : null}
                  className="flex items-start gap-2"
                >
                  <div className="flex-1">
                    <SchemeDetailManager
                      scheme={scheme}
                      isExpanded={expandedSchemeId === scheme.id}
                      onExpand={() => {
                        if (!isReorderingSchemes) {
                          if (editingScheme && editingScheme.id !== scheme.id) {
                            if (!confirm('您正在編輯另一個方案，是否取消當前編輯並展開此方案？')) {
                              return;
                            }
                            setShowSchemeForm(false);
                            setEditingScheme(null);
                          }
                          setExpandedSchemeId(expandedSchemeId === scheme.id ? null : scheme.id);
                        }
                      }}
                      onEdit={() => {
                        if (!isReorderingSchemes) {
                          handleEditScheme(scheme);
                        }
                      }}
                      onDelete={() => {
                        if (!isReorderingSchemes) {
                          handleSchemeDelete(scheme.id);
                        }
                      }}
                    />
                    {/* 編輯方案表單（在方案下方展開） */}
                    {editingScheme && editingScheme.id === scheme.id && (
                      <div ref={schemeFormRef} className="mt-2 p-3 bg-white rounded border">
                        <h4 className="font-medium mb-2">編輯方案</h4>
                        <form onSubmit={handleSchemeSubmit} className="space-y-4">
                          {/* 方案名稱 */}
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">方案名稱 *</label>
                            <input
                              type="text"
                              value={schemeFormData.name}
                              onChange={(e) => setSchemeFormData({ ...schemeFormData, name: e.target.value })}
                              className="w-full px-2 py-1 border rounded text-sm"
                              required
                            />
                          </div>
                          {/* 備註 */}
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">備註</label>
                            <input
                              type="text"
                              value={schemeFormData.note}
                              onChange={(e) => setSchemeFormData({ ...schemeFormData, note: e.target.value })}
                              className="w-full px-2 py-1 border rounded text-sm"
                            />
                          </div>
                          {/* 回饋組成 */}
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">回饋組成</label>
                            <div className="space-y-2">
                              {rewards.map((reward, rewardIndex) => (
                                <div key={rewardIndex} className="p-2 border rounded space-y-2">
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="text-xs block mb-1">回饋%數</label>
                                      <input
                                        type="number"
                                        step="0.1"
                                        value={reward.percentage}
                                        onChange={(e) => {
                                          const newRewards = [...rewards];
                                          newRewards[rewardIndex].percentage = parseFloat(e.target.value) || 0;
                                          setRewards(newRewards);
                                        }}
                                        className="w-full px-2 py-1 border rounded text-xs"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-xs block mb-1">計算方式</label>
                                      <select
                                        value={reward.calculationMethod}
                                        onChange={(e) => {
                                          const newRewards = [...rewards];
                                          newRewards[rewardIndex].calculationMethod = e.target.value;
                                          setRewards(newRewards);
                                        }}
                                        className="w-full px-2 py-1 border rounded text-xs"
                                      >
                                        <option value="round">四捨五入</option>
                                        <option value="floor">無條件捨去</option>
                                        <option value="ceil">無條件進位</option>
                                      </select>
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="text-xs block mb-1">額度上限（留空為無上限）</label>
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={reward.quotaLimit || ''}
                                        onChange={(e) => {
                                          const newRewards = [...rewards];
                                          newRewards[rewardIndex].quotaLimit = e.target.value ? parseFloat(e.target.value) : null;
                                          setRewards(newRewards);
                                        }}
                                        className="w-full px-2 py-1 border rounded text-xs"
                                        placeholder="無上限"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-xs block mb-1">刷新類型</label>
                                      <select
                                        value={reward.quotaRefreshType || ''}
                                        onChange={(e) => {
                                          const newRewards = [...rewards];
                                          newRewards[rewardIndex].quotaRefreshType = e.target.value || null;
                                          if (e.target.value !== 'date') {
                                            newRewards[rewardIndex].quotaRefreshDate = null;
                                          }
                                          setRewards(newRewards);
                                        }}
                                        className="w-full px-2 py-1 border rounded text-xs"
                                      >
                                        <option value="">不刷新</option>
                                        <option value="monthly">每月固定日期</option>
                                        <option value="date">指定日期</option>
                                        <option value="activity">活動結束日</option>
                                      </select>
                                    </div>
                                  </div>
                                  {(reward.quotaRefreshType === 'monthly' || reward.quotaRefreshType === 'date') && (
                                    <div className="grid grid-cols-2 gap-2">
                                      {reward.quotaRefreshType === 'monthly' && (
                                        <div>
                                          <label className="text-xs block mb-1">每月幾號（1-31）</label>
                                          <input
                                            type="number"
                                            min="1"
                                            max="31"
                                            value={reward.quotaRefreshValue || ''}
                                            onChange={(e) => {
                                              const newRewards = [...rewards];
                                              newRewards[rewardIndex].quotaRefreshValue = e.target.value ? parseInt(e.target.value) : null;
                                              setRewards(newRewards);
                                            }}
                                            className="w-full px-2 py-1 border rounded text-xs"
                                          />
                                        </div>
                                      )}
                                      {reward.quotaRefreshType === 'date' && (
                                        <div>
                                          <label className="text-xs block mb-1">刷新日期</label>
                                          <input
                                            type="date"
                                            value={reward.quotaRefreshDate || ''}
                                            onChange={(e) => {
                                              const newRewards = [...rewards];
                                              newRewards[rewardIndex].quotaRefreshDate = e.target.value || null;
                                              setRewards(newRewards);
                                            }}
                                            className="w-full px-2 py-1 border rounded text-xs"
                                          />
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => removeReward(rewardIndex)}
                                    className="px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
                                  >
                                    刪除
                                  </button>
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={addReward}
                                className="px-2 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600"
                              >
                                新增回饋組成
                              </button>
                            </div>
                          </div>
                          {/* 方案期限 */}
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">活動開始日期</label>
                              <input
                                type="date"
                                value={schemeFormData.activityStartDate}
                                onChange={(e) => setSchemeFormData({ ...schemeFormData, activityStartDate: e.target.value })}
                                className="w-full px-2 py-1 border rounded text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">活動結束日期</label>
                              <input
                                type="date"
                                value={schemeFormData.activityEndDate}
                                onChange={(e) => setSchemeFormData({ ...schemeFormData, activityEndDate: e.target.value })}
                                className="w-full px-2 py-1 border rounded text-sm"
                              />
                            </div>
                          </div>
                          {/* 適用通路 */}
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">
                              適用通路（每行一個通路名稱，可在名稱後加上備註，格式：通路名稱 (備註)）
                            </label>
                            <textarea
                              value={channelApplicationsText}
                              onChange={(e) => setChannelApplicationsText(e.target.value)}
                              className="w-full px-2 py-1 border rounded text-xs"
                              rows={6}
                              placeholder="例如：&#10;環球影城&#10;7-11 (便利商店)&#10;全聯福利中心"
                            />
                          </div>
                          {/* 排除通路 */}
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">排除通路（每行一個通路名稱）</label>
                            <textarea
                              value={channelExclusionsText}
                              onChange={(e) => setChannelExclusionsText(e.target.value)}
                              className="w-full px-2 py-1 border rounded text-xs"
                              rows={6}
                              placeholder="例如：&#10;通路A&#10;通路B"
                            />
                          </div>
                          {/* 需切換 */}
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id={`requiresSwitch-${scheme.id}`}
                              checked={schemeFormData.requiresSwitch}
                              onChange={(e) => setSchemeFormData({ ...schemeFormData, requiresSwitch: e.target.checked })}
                              className="w-4 h-4"
                            />
                            <label htmlFor={`requiresSwitch-${scheme.id}`} className="text-xs text-gray-600">需切換</label>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="submit"
                              className="px-3 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
                            >
                              更新
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setShowSchemeForm(false);
                                setEditingScheme(null);
                                setChannelApplicationsText('');
                                setChannelExclusionsText('');
                                setRewards([]);
                              }}
                              className="px-3 py-1 bg-gray-500 text-white rounded text-xs hover:bg-gray-600"
                            >
                              取消
                            </button>
                          </div>
                        </form>
                      </div>
                    )}
                  </div>
                  {isReorderingSchemes && (
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => {
                          const newSchemes = [...reorderedSchemes];
                          if (index > 0) {
                            [newSchemes[index - 1], newSchemes[index]] = [newSchemes[index], newSchemes[index - 1]];
                            setReorderedSchemes(newSchemes);
                          }
                        }}
                        className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
                        disabled={index === 0}
                        title="上移"
                      >
                        ⬆️
                      </button>
                      <button
                        onClick={() => {
                          const newSchemes = [...reorderedSchemes];
                          if (index < newSchemes.length - 1) {
                            [newSchemes[index], newSchemes[index + 1]] = [newSchemes[index + 1], newSchemes[index]];
                            setReorderedSchemes(newSchemes);
                          }
                        }}
                        className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
                        disabled={index === reorderedSchemes.length - 1}
                        title="下移"
                      >
                        ⬇️
                      </button>
                      <button
                        onClick={() => {
                          const newSchemes = [...reorderedSchemes];
                          const item = newSchemes.splice(index, 1)[0];
                          newSchemes.unshift(item);
                          setReorderedSchemes(newSchemes);
                        }}
                        className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
                        title="置頂"
                      >
                        ⬆️⬆️
                      </button>
                      <button
                        onClick={() => {
                          const newSchemes = [...reorderedSchemes];
                          const item = newSchemes.splice(index, 1)[0];
                          newSchemes.push(item);
                          setReorderedSchemes(newSchemes);
                        }}
                        className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
                        title="置底"
                      >
                        ⬇️⬇️
                      </button>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-xs text-gray-500">尚無方案</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// 支付方式項目組件（包含連結方案管理）
function PaymentMethodItem({
  paymentMethod,
  onEdit,
  onDelete,
  onReload,
}: {
  paymentMethod: PaymentMethod;
  onEdit: () => void;
  onDelete: () => void;
  onReload: () => void;
}) {
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [showChannels, setShowChannels] = useState(false);
  const [showRewards, setShowRewards] = useState(false);
  const [allCards, setAllCards] = useState<Card[]>([]);
  const [allSchemes, setAllSchemes] = useState<Scheme[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [paymentChannels, setPaymentChannels] = useState<Array<{ id: string; name: string; note?: string }>>([]);
  const [editingChannels, setEditingChannels] = useState(false);
  const [channelApplicationsText, setChannelApplicationsText] = useState<string>(''); // 適用通路文字（每行一個通路名稱）
  const [selectedCardId, setSelectedCardId] = useState('');
  const [selectedSchemeId, setSelectedSchemeId] = useState('');
  const [rewards, setRewards] = useState<Array<{
    id?: string;
    percentage: number;
    calculationMethod: string;
    quotaLimit: number | null;
    quotaRefreshType: string | null;
    quotaRefreshValue: number | null;
    quotaRefreshDate: string | null;
    displayOrder: number;
  }>>([]);

  // 用於追蹤表單和展開區域的 ref
  const linkFormRef = useRef<HTMLDivElement>(null);
  const channelsRef = useRef<HTMLDivElement>(null);
  const rewardsRef = useRef<HTMLDivElement>(null);

  // ESC 鍵取消編輯/展開，點擊空白處關閉
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showLinkForm) {
          setShowLinkForm(false);
          setSelectedCardId('');
          setSelectedSchemeId('');
        }
        if (editingChannels) {
          setEditingChannels(false);
          loadPaymentChannels();
        }
        if (showChannels) {
          setShowChannels(false);
        }
        if (showRewards) {
          setShowRewards(false);
        }
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      // 如果點擊在連結表單外部，關閉表單
      if (showLinkForm && linkFormRef.current && !linkFormRef.current.contains(target)) {
        setShowLinkForm(false);
        setSelectedCardId('');
        setSelectedSchemeId('');
      }
      
      // 如果點擊在通路設定外部，關閉編輯或展開
      if (showChannels && channelsRef.current && !channelsRef.current.contains(target)) {
        if (editingChannels) {
          setEditingChannels(false);
          loadPaymentChannels();
        } else {
          setShowChannels(false);
        }
      }
      
      // 如果點擊在回饋設定外部，關閉展開
      if (showRewards && rewardsRef.current && !rewardsRef.current.contains(target)) {
        setShowRewards(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showLinkForm, showChannels, editingChannels, showRewards]);

  useEffect(() => {
    loadCards();
    if (showChannels) {
      loadChannels();
      loadPaymentChannels();
    }
    if (showRewards) {
      loadRewards();
    }
  }, [showChannels, showRewards]);

  const loadCards = async () => {
    try {
      const cardsRes = await api.get('/cards');
      setAllCards(cardsRes.data.data);
    } catch (error) {
      console.error('載入卡片錯誤:', error);
    }
  };

  const loadChannels = async () => {
    try {
      const res = await api.get('/channels');
      setChannels(res.data.data);
    } catch (error) {
      console.error('載入通路錯誤:', error);
    }
  };

  const loadPaymentChannels = async () => {
    try {
      const res = await api.get(`/payment-methods/${paymentMethod.id}/channels`);
      setPaymentChannels(res.data.data);
      // 轉換為文字格式（每行一個通路名稱，可在名稱後加上備註）
      setChannelApplicationsText(
        res.data.data
          .map((app: { id: string; name: string; note?: string }) => {
            if (app.note) {
              return `${app.name} (${app.note})`;
            }
            return app.name;
          })
          .join('\n')
      );
    } catch (error) {
      console.error('載入支付方式通路錯誤:', error);
    }
  };

  // 輔助函數：將適用通路文字轉換為通路ID和備註陣列
  const convertApplicationTextToIds = async (applicationText: string): Promise<Array<{ channelId: string; note: string }>> => {
    const lines = applicationText.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    const applications: Array<{ channelId: string; note: string }> = [];
    for (const line of lines) {
      // 解析通路名稱和備註（格式：通路名稱 (備註) 或 通路名稱）
      let channelName = line;
      let note = '';
      
      const noteMatch = line.match(/^(.+?)\s*\((.+?)\)$/);
      if (noteMatch) {
        channelName = noteMatch[1].trim();
        note = noteMatch[2].trim();
      }
      
      if (!channelName) continue;
      
      // 搜尋或創建通路
      try {
        const searchRes = await api.get(`/channels/search?name=${encodeURIComponent(channelName)}`);
        const matchingChannels = searchRes.data.data;
        
        let channelId: string;
        if (matchingChannels.length > 0) {
          channelId = matchingChannels[0].id;
        } else {
          const createRes = await api.post('/channels', {
            name: channelName,
            isCommon: false,
            displayOrder: 0,
          });
          channelId = createRes.data.data.id;
        }
        
        applications.push({ channelId, note });
      } catch (error) {
        console.error(`處理適用通路 "${channelName}" 時發生錯誤:`, error);
      }
    }
    return applications;
  };

  const handleSaveChannels = async () => {
    try {
      // 轉換通路文字為ID
      const applications = await convertApplicationTextToIds(channelApplicationsText);
      
      await api.put(`/payment-methods/${paymentMethod.id}/channels`, {
        applications: applications,
        exclusions: [],
      });
      alert('通路設定已更新');
      setEditingChannels(false);
      loadPaymentChannels();
      onReload();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      alert(err.response?.data?.error || '更新失敗');
    }
  };

  const loadSchemes = async (cardId: string) => {
    try {
      const res = await api.get(`/schemes/card/${cardId}`);
      setAllSchemes(res.data.data);
    } catch (error) {
      console.error('載入方案錯誤:', error);
    }
  };

  const handleLinkScheme = async () => {
    if (!selectedSchemeId) {
      alert('請選擇方案');
      return;
    }
    try {
      await api.post(`/payment-methods/${paymentMethod.id}/link-scheme`, {
        schemeId: selectedSchemeId,
        displayOrder: 0,
      });
      alert('方案已連結');
      setShowLinkForm(false);
      setSelectedCardId('');
      setSelectedSchemeId('');
      onReload();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      alert(err.response?.data?.error || '連結失敗');
    }
  };

  const handleUnlinkScheme = async (schemeId: string) => {
    if (!confirm('確定要取消連結這個方案嗎？')) return;
    try {
      await api.delete(`/payment-methods/${paymentMethod.id}/unlink-scheme/${schemeId}`);
      alert('連結已取消');
      onReload();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      alert(err.response?.data?.error || '取消連結失敗');
    }
  };

  const loadRewards = async () => {
    try {
      const res = await api.get(`/payment-methods/${paymentMethod.id}/rewards`);
      setRewards(
        res.data.data.map((r: any) => ({
          id: r.id,
          percentage: parseFloat(r.reward_percentage) || 0,
          calculationMethod: r.calculation_method || 'round',
          quotaLimit: r.quota_limit ? parseFloat(r.quota_limit) : null,
          quotaRefreshType: r.quota_refresh_type || null,
          quotaRefreshValue: r.quota_refresh_value || null,
          quotaRefreshDate: r.quota_refresh_date ? r.quota_refresh_date.split('T')[0] : null,
          displayOrder: r.display_order || 0,
        }))
      );
    } catch (error) {
      console.error('載入回饋組成錯誤:', error);
      setRewards([]);
    }
  };

  const addReward = () => {
    setRewards([
      ...rewards,
      {
        percentage: 0,
        calculationMethod: 'round',
        quotaLimit: null,
        quotaRefreshType: null,
        quotaRefreshValue: null,
        quotaRefreshDate: null,
        displayOrder: rewards.length,
      },
    ]);
  };

  const removeReward = (index: number) => {
    setRewards(rewards.filter((_, i) => i !== index));
  };

  const handleSaveRewards = async () => {
    try {
      await api.put(`/payment-methods/${paymentMethod.id}/rewards`, {
        rewards: rewards.map((r, idx) => ({
          percentage: r.percentage,
          calculationMethod: r.calculationMethod,
          quotaLimit: r.quotaLimit,
          quotaRefreshType: r.quotaRefreshType,
          quotaRefreshValue: r.quotaRefreshValue,
          quotaRefreshDate: r.quotaRefreshDate || null,
          displayOrder: idx,
        })),
      });
      alert('回饋組成已更新');
      setShowRewards(false); // 保存成功後收合回饋組成區域
      loadRewards();
      onReload();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      alert(err.response?.data?.error || '更新失敗');
    }
  };

  return (
    <div className="p-3 bg-gray-50 rounded border">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0 w-full sm:w-auto">
          <div className="font-medium">{paymentMethod.name}</div>
          {paymentMethod.note && (
            <div 
              className="text-sm text-gray-600 break-words mt-1 overflow-wrap-anywhere" 
              dangerouslySetInnerHTML={{ __html: linkify(paymentMethod.note) }}
            />
          )}
        </div>
        <div className="flex gap-2 flex-shrink-0 flex-wrap">
          <button
            onClick={onEdit}
            className="px-3 py-1 bg-yellow-500 text-white rounded text-sm hover:bg-yellow-600 whitespace-nowrap"
          >
            編輯
          </button>
          <button
            onClick={onDelete}
            className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600 whitespace-nowrap"
          >
            刪除
          </button>
        </div>
      </div>

      {/* 通路管理 */}
      <div className="mt-2 pt-2 border-t">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium">通路設定</span>
          <button
            onClick={() => {
              setShowChannels(!showChannels);
              if (!showChannels) {
                loadChannels();
                loadPaymentChannels();
              }
            }}
            className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
          >
            {showChannels ? '隱藏通路' : '管理通路'}
          </button>
        </div>

        {showChannels && (
          <div ref={channelsRef} className="mt-2 space-y-2">
            {!editingChannels ? (
              <div className="text-xs space-y-1">
                <div>
                  <span className="font-medium">適用通路：</span>
                  {paymentChannels.length > 0 ? (
                    paymentChannels.map((ch, idx) => (
                      <span key={idx}>
                        {ch.name}
                        {ch.note && ` (${ch.note})`}
                        {idx < paymentChannels.length - 1 && ', '}
                      </span>
                    ))
                  ) : (
                    <span className="text-gray-500">無</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div>
                  <label className="text-xs font-medium block mb-1">
                    適用通路（每行一個通路名稱，可在名稱後加上備註，格式：通路名稱 (備註)）
                  </label>
                  <textarea
                    value={channelApplicationsText}
                    onChange={(e) => setChannelApplicationsText(e.target.value)}
                    className="w-full px-2 py-1 border rounded text-xs"
                    rows={6}
                    placeholder="例如：&#10;環球影城&#10;7-11 (便利商店)&#10;全聯福利中心"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveChannels}
                    className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
                  >
                    儲存
                  </button>
                  <button
                    onClick={() => {
                      setEditingChannels(false);
                      loadPaymentChannels();
                    }}
                    className="px-2 py-1 bg-gray-500 text-white rounded text-xs hover:bg-gray-600"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}
            {!editingChannels && (
              <button
                onClick={() => setEditingChannels(true)}
                className="px-2 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600"
              >
                編輯
              </button>
            )}
          </div>
        )}
      </div>

      {/* 回饋組成管理 */}
      <div className="mt-2 pt-2 border-t">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium">回饋組成</span>
          <button
            onClick={() => {
              setShowRewards(!showRewards);
              if (!showRewards) {
                loadRewards();
              }
            }}
            className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
          >
            {showRewards ? '隱藏回饋組成' : '管理回饋組成'}
          </button>
        </div>

        {showRewards && (
          <div ref={rewardsRef} className="mt-2 space-y-2">
            {rewards.length > 0 ? (
              <div className="space-y-2">
                {rewards.map((reward, index) => (
                  <div key={index} className="p-2 bg-white rounded border space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-medium block mb-1">回饋%數</label>
                        <input
                          type="number"
                          step="0.01"
                          value={reward.percentage}
                          onChange={(e) => {
                            const newRewards = [...rewards];
                            newRewards[index].percentage = parseFloat(e.target.value) || 0;
                            setRewards(newRewards);
                          }}
                          className="w-full px-2 py-1 border rounded text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium block mb-1">計算方式</label>
                        <select
                          value={reward.calculationMethod}
                          onChange={(e) => {
                            const newRewards = [...rewards];
                            newRewards[index].calculationMethod = e.target.value;
                            setRewards(newRewards);
                          }}
                          className="w-full px-2 py-1 border rounded text-xs"
                        >
                          <option value="round">四捨五入</option>
                          <option value="floor">無條件捨去</option>
                          <option value="ceil">無條件進位</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium block mb-1">額度上限</label>
                        <input
                          type="number"
                          step="0.01"
                          value={reward.quotaLimit || ''}
                          onChange={(e) => {
                            const newRewards = [...rewards];
                            newRewards[index].quotaLimit = e.target.value ? parseFloat(e.target.value) : null;
                            setRewards(newRewards);
                          }}
                          placeholder="無上限"
                          className="w-full px-2 py-1 border rounded text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium block mb-1">刷新類型</label>
                        <select
                          value={reward.quotaRefreshType || ''}
                          onChange={(e) => {
                            const newRewards = [...rewards];
                            newRewards[index].quotaRefreshType = e.target.value || null;
                            setRewards(newRewards);
                          }}
                          className="w-full px-2 py-1 border rounded text-xs"
                        >
                          <option value="">無</option>
                          <option value="monthly">每月</option>
                          <option value="date">指定日期</option>
                          <option value="activity">活動期間</option>
                        </select>
                      </div>
                      {reward.quotaRefreshType === 'monthly' && (
                        <div>
                          <label className="text-xs font-medium block mb-1">每月幾號</label>
                          <input
                            type="number"
                            min="1"
                            max="31"
                            value={reward.quotaRefreshValue || ''}
                            onChange={(e) => {
                              const newRewards = [...rewards];
                              newRewards[index].quotaRefreshValue = e.target.value ? parseInt(e.target.value) : null;
                              setRewards(newRewards);
                            }}
                            className="w-full px-2 py-1 border rounded text-xs"
                          />
                        </div>
                      )}
                      {reward.quotaRefreshType === 'date' && (
                        <div>
                          <label className="text-xs font-medium block mb-1">刷新日期</label>
                          <input
                            type="date"
                            value={reward.quotaRefreshDate || ''}
                            onChange={(e) => {
                              const newRewards = [...rewards];
                              newRewards[index].quotaRefreshDate = e.target.value || null;
                              setRewards(newRewards);
                            }}
                            className="w-full px-2 py-1 border rounded text-xs"
                          />
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => removeReward(index)}
                      className="px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
                    >
                      刪除
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-gray-500">尚無回饋組成</div>
            )}
            <div className="flex gap-2">
              <button
                onClick={addReward}
                className="px-2 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600"
              >
                新增回饋組成
              </button>
              {rewards.length > 0 && (
                <button
                  onClick={handleSaveRewards}
                  className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
                >
                  儲存
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 連結的方案 */}
      <div className="mt-2 pt-2 border-t">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium">連結的卡片方案</span>
          <button
            onClick={() => setShowLinkForm(!showLinkForm)}
            className="px-2 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600"
          >
            {showLinkForm ? '取消' : '新增連結'}
          </button>
        </div>

        {showLinkForm && (
          <div ref={linkFormRef} className="p-3 bg-white rounded border mb-2">
            <div className="space-y-2">
              <div>
                <label className="block text-xs font-medium mb-1">選擇卡片</label>
                <select
                  value={selectedCardId}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                    setSelectedCardId(e.target.value);
                    if (e.target.value) {
                      loadSchemes(e.target.value);
                    } else {
                      setAllSchemes([]);
                    }
                    setSelectedSchemeId('');
                  }}
                  className="w-full px-2 py-1 border rounded text-sm"
                >
                  <option value="">請選擇卡片</option>
                  {allCards.map((card: Card) => (
                    <option key={card.id} value={card.id}>
                      {card.name}
                    </option>
                  ))}
                </select>
              </div>
              {selectedCardId && (
                <div>
                  <label className="block text-xs font-medium mb-1">選擇方案</label>
                  <select
                    value={selectedSchemeId}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => setSelectedSchemeId(e.target.value)}
                    className="w-full px-2 py-1 border rounded text-sm"
                  >
                    <option value="">請選擇方案</option>
                    {allSchemes.map((scheme: Scheme) => (
                      <option key={scheme.id} value={scheme.id}>
                        {scheme.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <button
                onClick={handleLinkScheme}
                className="w-full px-2 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
              >
                連結
              </button>
            </div>
          </div>
        )}

        <div className="space-y-1">
          {paymentMethod.linked_schemes && paymentMethod.linked_schemes.length > 0 ? (
            paymentMethod.linked_schemes.map((link) => (
              <div
                key={link.schemeId}
                className="flex items-center justify-between p-2 bg-white rounded text-sm"
              >
                <span>
                  {link.cardName}-{link.schemeName}
                </span>
                <button
                  onClick={() => handleUnlinkScheme(link.schemeId)}
                  className="px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
                >
                  取消連結
                </button>
              </div>
            ))
          ) : (
            <div className="text-xs text-gray-500">尚無連結的方案</div>
          )}
        </div>
      </div>
    </div>
  );
}

// 回饋查詢設定
function QuerySettings() {
  const [cards, setCards] = useState<Card[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [channels, setChannels] = useState<Array<{ id: string; name: string; display_order: number }>>([]);
  const [activeSection, setActiveSection] = useState<'cards' | 'payments' | 'channels'>('cards');
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [editingPayment, setEditingPayment] = useState<PaymentMethod | null>(null);
  const [editingChannel, setEditingChannel] = useState<{ id: string; name: string; display_order: number } | null>(null);
  const [showCardForm, setShowCardForm] = useState<string | false>(false);
  const [showPaymentForm, setShowPaymentForm] = useState<string | false>(false);
  const [showChannelForm, setShowChannelForm] = useState<string | false>(false);

  // ESC 鍵取消編輯，點擊空白處關閉
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showCardForm || editingCard) {
          setShowCardForm(false);
          setEditingCard(null);
        }
        if (showPaymentForm || editingPayment) {
          setShowPaymentForm(false);
          setEditingPayment(null);
        }
        if (showChannelForm || editingChannel) {
          setShowChannelForm(false);
          setEditingChannel(null);
        }
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      // 檢查點擊是否在任何表單內
      const isInsideForm = target.closest('.card-form-container, .payment-form-container, .channel-form-container');
      
      // 如果點擊在卡片表單外部，關閉表單
      if ((showCardForm || editingCard) && !isInsideForm?.classList.contains('card-form-container')) {
        setShowCardForm(false);
        setEditingCard(null);
      }
      
      // 如果點擊在支付方式表單外部，關閉表單
      if ((showPaymentForm || editingPayment) && !isInsideForm?.classList.contains('payment-form-container')) {
        setShowPaymentForm(false);
        setEditingPayment(null);
      }
      
      // 如果點擊在通路表單外部，關閉表單
      if ((showChannelForm || editingChannel) && !isInsideForm?.classList.contains('channel-form-container')) {
        setShowChannelForm(false);
        setEditingChannel(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showCardForm, editingCard, showPaymentForm, editingPayment, showChannelForm, editingChannel]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [cardsRes, paymentsRes, channelsRes] = await Promise.all([
        api.get('/cards'),
        api.get('/payment-methods'),
        api.get('/channels?commonOnly=true'),
      ]);
      setCards(cardsRes.data.data);
      // 支付方式API返回的數據已經包含linked_schemes
      setPaymentMethods(paymentsRes.data.data);
      setChannels(channelsRes.data.data);
    } catch (error) {
      console.error('載入資料錯誤:', error);
    }
  };

  // 卡片管理
  const handleCardSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const data = {
      name: formData.get('name'),
      note: formData.get('note') || null,
      displayOrder: parseInt(formData.get('displayOrder') as string) || 0,
    };

    try {
      if (editingCard) {
        await api.put(`/cards/${editingCard.id}`, data);
      } else {
        await api.post('/cards', data);
      }
      alert(editingCard ? '卡片已更新' : '卡片已新增');
      setShowCardForm(false);
      setEditingCard(null);
      loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      alert(err.response?.data?.error || '操作失敗');
    }
  };

  const handleCardDelete = async (id: string) => {
    if (!confirm('確定要刪除這張卡片嗎？這將同時刪除該卡片的所有方案。')) return;
    try {
      await api.delete(`/cards/${id}`);
      alert('卡片已刪除');
      loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      alert(err.response?.data?.error || '刪除失敗');
    }
  };

  const [isReorderingCards, setIsReorderingCards] = useState(false);
  const [reorderedCards, setReorderedCards] = useState<Card[]>([]);

  const handleCardOrderUpdate = async () => {
    if (isReorderingCards) {
      // 保存順序
      try {
        const orders = reorderedCards.map((card: Card, index: number) => ({
          id: card.id,
          displayOrder: index,
        }));
        await api.put('/settings/cards/order', { orders });
        alert('順序已更新');
        setIsReorderingCards(false);
        loadData();
      } catch (error: unknown) {
        const err = error as { response?: { data?: { error?: string } } };
        alert(err.response?.data?.error || '更新失敗');
      }
    } else {
      // 進入調整順序模式
      setIsReorderingCards(true);
      setReorderedCards([...cards]);
    }
  };

  const moveCard = (index: number, direction: 'up' | 'down' | 'top' | 'bottom') => {
    const newCards = [...reorderedCards];
    if (direction === 'up' && index > 0) {
      [newCards[index - 1], newCards[index]] = [newCards[index], newCards[index - 1]];
    } else if (direction === 'down' && index < newCards.length - 1) {
      [newCards[index], newCards[index + 1]] = [newCards[index + 1], newCards[index]];
    } else if (direction === 'top') {
      const item = newCards.splice(index, 1)[0];
      newCards.unshift(item);
    } else if (direction === 'bottom') {
      const item = newCards.splice(index, 1)[0];
      newCards.push(item);
    }
    setReorderedCards(newCards);
  };

  // 支付方式管理
  const handlePaymentSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const data = {
      name: formData.get('name'),
      note: formData.get('note') || null,
      displayOrder: parseInt(formData.get('displayOrder') as string) || 0,
    };

    try {
      if (editingPayment) {
        await api.put(`/payment-methods/${editingPayment.id}`, data);
      } else {
        await api.post('/payment-methods', data);
      }
      alert(editingPayment ? '支付方式已更新' : '支付方式已新增');
      setShowPaymentForm(false);
      setEditingPayment(null);
      loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      alert(err.response?.data?.error || '操作失敗');
    }
  };

  const handlePaymentDelete = async (id: string) => {
    if (!confirm('確定要刪除這個支付方式嗎？')) return;
    try {
      await api.delete(`/payment-methods/${id}`);
      alert('支付方式已刪除');
      loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      alert(err.response?.data?.error || '刪除失敗');
    }
  };

  const [isReorderingPayments, setIsReorderingPayments] = useState(false);
  const [reorderedPayments, setReorderedPayments] = useState<PaymentMethod[]>([]);

  const handlePaymentOrderUpdate = async () => {
    if (isReorderingPayments) {
      // 保存順序
      try {
        const orders = reorderedPayments.map((pm: PaymentMethod, index: number) => ({
          id: pm.id,
          displayOrder: index,
        }));
        await api.put('/settings/payment-methods/order', { orders });
        alert('順序已更新');
        setIsReorderingPayments(false);
        loadData();
      } catch (error: unknown) {
        const err = error as { response?: { data?: { error?: string } } };
        alert(err.response?.data?.error || '更新失敗');
      }
    } else {
      // 進入調整順序模式
      setIsReorderingPayments(true);
      setReorderedPayments([...paymentMethods]);
    }
  };

  const movePayment = (index: number, direction: 'up' | 'down' | 'top' | 'bottom') => {
    const newPayments = [...reorderedPayments];
    if (direction === 'up' && index > 0) {
      [newPayments[index - 1], newPayments[index]] = [newPayments[index], newPayments[index - 1]];
    } else if (direction === 'down' && index < newPayments.length - 1) {
      [newPayments[index], newPayments[index + 1]] = [newPayments[index + 1], newPayments[index]];
    } else if (direction === 'top') {
      const item = newPayments.splice(index, 1)[0];
      newPayments.unshift(item);
    } else if (direction === 'bottom') {
      const item = newPayments.splice(index, 1)[0];
      newPayments.push(item);
    }
    setReorderedPayments(newPayments);
  };

  // 通路管理
  const handleChannelSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const data = {
      name: formData.get('name'),
      isCommon: true, // 常用通路
      displayOrder: parseInt(formData.get('displayOrder') as string) || 0,
    };

    try {
      if (editingChannel) {
        await api.put(`/channels/${editingChannel.id}`, data);
      } else {
        await api.post('/channels', data);
      }
      alert(editingChannel ? '通路已更新' : '通路已新增');
      setShowChannelForm(false);
      setEditingChannel(null);
      loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      alert(err.response?.data?.error || '操作失敗');
    }
  };

  const handleChannelDelete = async (id: string) => {
    if (!confirm('確定要刪除這個通路嗎？')) return;
    try {
      await api.delete(`/channels/${id}`);
      alert('通路已刪除');
      loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      alert(err.response?.data?.error || '刪除失敗');
    }
  };

  const [isReorderingChannels, setIsReorderingChannels] = useState(false);
  const [reorderedChannels, setReorderedChannels] = useState<Array<{ id: string; name: string; display_order: number }>>([]);

  const handleChannelOrderUpdate = async () => {
    if (isReorderingChannels) {
      // 保存順序
      try {
        const orders = reorderedChannels.map((channel: { id: string; name: string; display_order: number }, index: number) => ({
          id: channel.id,
          displayOrder: index,
        }));
        await api.put('/settings/channels/common/order', { orders });
        alert('順序已更新');
        setIsReorderingChannels(false);
        loadData();
      } catch (error: unknown) {
        const err = error as { response?: { data?: { error?: string } } };
        alert(err.response?.data?.error || '更新失敗');
      }
    } else {
      // 進入調整順序模式
      setIsReorderingChannels(true);
      setReorderedChannels([...channels]);
    }
  };

  const moveChannel = (index: number, direction: 'up' | 'down' | 'top' | 'bottom') => {
    const newChannels = [...reorderedChannels];
    if (direction === 'up' && index > 0) {
      [newChannels[index - 1], newChannels[index]] = [newChannels[index], newChannels[index - 1]];
    } else if (direction === 'down' && index < newChannels.length - 1) {
      [newChannels[index], newChannels[index + 1]] = [newChannels[index + 1], newChannels[index]];
    } else if (direction === 'top') {
      const item = newChannels.splice(index, 1)[0];
      newChannels.unshift(item);
    } else if (direction === 'bottom') {
      const item = newChannels.splice(index, 1)[0];
      newChannels.push(item);
    }
    setReorderedChannels(newChannels);
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">回饋查詢設定</h3>

      {/* 標籤切換 */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveSection('cards')}
          className={`px-4 py-2 font-medium ${
            activeSection === 'cards'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-500'
          }`}
        >
          信用卡管理
        </button>
        <button
          onClick={() => setActiveSection('payments')}
          className={`px-4 py-2 font-medium ${
            activeSection === 'payments'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-500'
          }`}
        >
          支付方式管理
        </button>
        <button
          onClick={() => setActiveSection('channels')}
          className={`px-4 py-2 font-medium ${
            activeSection === 'channels'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-500'
          }`}
        >
          常用通路管理
        </button>
      </div>

      {/* 卡片管理 */}
      {activeSection === 'cards' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h4 className="font-medium">卡片列表</h4>
            <div className="flex gap-2">
              <button
                onClick={handleCardOrderUpdate}
                className={`px-3 py-1 rounded text-sm ${
                  isReorderingCards
                    ? 'bg-green-500 text-white hover:bg-green-600'
                    : 'bg-gray-500 text-white hover:bg-gray-600'
                }`}
              >
                {isReorderingCards ? '儲存順序' : '調整順序'}
              </button>
              {isReorderingCards && (
                <button
                  onClick={() => {
                    setIsReorderingCards(false);
                    setReorderedCards([...cards]);
                  }}
                  className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
                >
                  取消
                </button>
              )}
              <button
                onClick={() => {
                  setEditingCard(null);
                  setShowCardForm('new');
                }}
                className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
              >
                新增卡片
              </button>
            </div>
          </div>

          {showCardForm === 'new' && (
            <div className="card-form-container mb-4 p-4 bg-gray-50 rounded-lg border">
              <form onSubmit={handleCardSubmit} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">卡片名稱 *</label>
                  <input
                    type="text"
                    name="name"
                    defaultValue=""
                    required
                    className="w-full px-3 py-2 border rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">備註</label>
                  <input
                    type="text"
                    name="note"
                    defaultValue=""
                    className="w-full px-3 py-2 border rounded"
                  />
                </div>
                <input
                  type="hidden"
                  name="displayOrder"
                  defaultValue={0}
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    新增
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCardForm(false);
                      setEditingCard(null);
                    }}
                    className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                  >
                    取消
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="space-y-2">
            {(isReorderingCards ? reorderedCards : cards).map((card, index) => (
              <div key={card.id}>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <CardItem
                      card={card}
                      onEdit={() => {
                        if (!isReorderingCards) {
                          setEditingCard(card);
                          setShowCardForm(card.id);
                        }
                      }}
                      onDelete={() => {
                        if (!isReorderingCards) {
                          handleCardDelete(card.id);
                        }
                      }}
                      onReload={loadData}
                    />
                  </div>
                  {isReorderingCards && (
                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={() => moveCard(index, 'top')}
                        className="px-1.5 py-0.5 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 text-[10px] leading-tight"
                        title="置頂"
                      >
                        ⬆⬆
                      </button>
                      <button
                        onClick={() => moveCard(index, 'up')}
                        className="px-1.5 py-0.5 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 text-[10px] leading-tight"
                        disabled={index === 0}
                        title="上移"
                      >
                        ⬆
                      </button>
                      <button
                        onClick={() => moveCard(index, 'down')}
                        className="px-1.5 py-0.5 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 text-[10px] leading-tight"
                        disabled={index === (isReorderingCards ? reorderedCards : cards).length - 1}
                        title="下移"
                      >
                        ⬇
                      </button>
                      <button
                        onClick={() => moveCard(index, 'bottom')}
                        className="px-1.5 py-0.5 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 text-[10px] leading-tight"
                        title="置底"
                      >
                        ⬇⬇
                      </button>
                    </div>
                  )}
                </div>
                {showCardForm === card.id && (
                  <div className="card-form-container mt-2 p-4 bg-gray-50 rounded-lg border">
                    <form onSubmit={handleCardSubmit} className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium mb-1">卡片名稱 *</label>
                        <input
                          type="text"
                          name="name"
                          defaultValue={editingCard?.name || ''}
                          required
                          className="w-full px-3 py-2 border rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">備註</label>
                        <input
                          type="text"
                          name="note"
                          defaultValue={editingCard?.note || ''}
                          className="w-full px-3 py-2 border rounded"
                        />
                      </div>
                      <input
                        type="hidden"
                        name="displayOrder"
                        defaultValue={editingCard?.display_order || 0}
                      />
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          更新
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowCardForm(false);
                            setEditingCard(null);
                          }}
                          className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                        >
                          取消
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 支付方式管理 */}
      {activeSection === 'payments' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h4 className="font-medium">支付方式列表</h4>
            <div className="flex gap-2">
              <button
                onClick={handlePaymentOrderUpdate}
                className={`px-3 py-1 rounded text-sm ${
                  isReorderingPayments
                    ? 'bg-green-500 text-white hover:bg-green-600'
                    : 'bg-gray-500 text-white hover:bg-gray-600'
                }`}
              >
                {isReorderingPayments ? '儲存順序' : '調整順序'}
              </button>
              {isReorderingPayments && (
                <button
                  onClick={() => {
                    setIsReorderingPayments(false);
                    setReorderedPayments([...paymentMethods]);
                  }}
                  className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
                >
                  取消
                </button>
              )}
              <button
                onClick={() => {
                  setEditingPayment(null);
                  setShowPaymentForm('new');
                }}
                className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
              >
                新增支付方式
              </button>
            </div>
          </div>

          {showPaymentForm === 'new' && (
            <div className="payment-form-container mb-4 p-4 bg-gray-50 rounded-lg border">
              <form onSubmit={handlePaymentSubmit} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">支付方式名稱 *</label>
                  <input
                    type="text"
                    name="name"
                    defaultValue={editingPayment?.name || ''}
                    required
                    className="w-full px-3 py-2 border rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">備註</label>
                  <input
                    type="text"
                    name="note"
                    defaultValue={editingPayment?.note || ''}
                    className="w-full px-3 py-2 border rounded"
                  />
                </div>
                <input
                  type="hidden"
                  name="displayOrder"
                  defaultValue={editingPayment?.display_order || 0}
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    {editingPayment ? '更新' : '新增'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowPaymentForm(false);
                      setEditingPayment(null);
                    }}
                    className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                  >
                    取消
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="space-y-2">
            {(isReorderingPayments ? reorderedPayments : paymentMethods).map((pm, index) => (
              <div key={pm.id}>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <PaymentMethodItem
                      paymentMethod={pm}
                      onEdit={() => {
                        if (!isReorderingPayments) {
                          setEditingPayment(pm);
                          setShowPaymentForm(pm.id);
                        }
                      }}
                      onDelete={() => {
                        if (!isReorderingPayments) {
                          handlePaymentDelete(pm.id);
                        }
                      }}
                      onReload={loadData}
                    />
                  </div>
                  {isReorderingPayments && (
                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={() => movePayment(index, 'top')}
                        className="px-1.5 py-0.5 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 text-[10px] leading-tight"
                        title="置頂"
                      >
                        ⬆⬆
                      </button>
                      <button
                        onClick={() => movePayment(index, 'up')}
                        className="px-1.5 py-0.5 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 text-[10px] leading-tight"
                        disabled={index === 0}
                        title="上移"
                      >
                        ⬆
                      </button>
                      <button
                        onClick={() => movePayment(index, 'down')}
                        className="px-1.5 py-0.5 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 text-[10px] leading-tight"
                        disabled={index === (isReorderingPayments ? reorderedPayments : paymentMethods).length - 1}
                        title="下移"
                      >
                        ⬇
                      </button>
                      <button
                        onClick={() => movePayment(index, 'bottom')}
                        className="px-1.5 py-0.5 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 text-[10px] leading-tight"
                        title="置底"
                      >
                        ⬇⬇
                      </button>
                    </div>
                  )}
                </div>
                {showPaymentForm === pm.id && (
                  <div className="payment-form-container mt-2 p-4 bg-gray-50 rounded-lg border">
                    <form onSubmit={handlePaymentSubmit} className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium mb-1">支付方式名稱 *</label>
                        <input
                          type="text"
                          name="name"
                          defaultValue={editingPayment?.name || ''}
                          required
                          className="w-full px-3 py-2 border rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">備註</label>
                        <input
                          type="text"
                          name="note"
                          defaultValue={editingPayment?.note || ''}
                          className="w-full px-3 py-2 border rounded"
                        />
                      </div>
                      <div>
                      </div>
                      <input
                        type="hidden"
                        name="displayOrder"
                        defaultValue={editingPayment?.display_order || 0}
                      />
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          更新
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowPaymentForm(false);
                            setEditingPayment(null);
                          }}
                          className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                        >
                          取消
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 常用通路管理 */}
      {activeSection === 'channels' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h4 className="font-medium">常用通路列表</h4>
            <div className="flex gap-2">
              <button
                onClick={handleChannelOrderUpdate}
                className={`px-3 py-1 rounded text-sm ${
                  isReorderingChannels
                    ? 'bg-green-500 text-white hover:bg-green-600'
                    : 'bg-gray-500 text-white hover:bg-gray-600'
                }`}
              >
                {isReorderingChannels ? '儲存順序' : '調整順序'}
              </button>
              {isReorderingChannels && (
                <button
                  onClick={() => {
                    setIsReorderingChannels(false);
                    setReorderedChannels([...channels]);
                  }}
                  className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
                >
                  取消
                </button>
              )}
              <button
                onClick={() => {
                  setEditingChannel(null);
                  setShowChannelForm('new');
                }}
                className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
              >
                新增通路
              </button>
            </div>
          </div>

          {showChannelForm === 'new' && (
            <div className="channel-form-container mb-4 p-4 bg-gray-50 rounded-lg border">
              <form onSubmit={handleChannelSubmit} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">通路名稱 *</label>
                  <input
                    type="text"
                    name="name"
                    defaultValue={editingChannel?.name || ''}
                    required
                    className="w-full px-3 py-2 border rounded"
                  />
                </div>
                <input
                  type="hidden"
                  name="displayOrder"
                  defaultValue={editingChannel?.display_order || 0}
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    {editingChannel ? '更新' : '新增'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowChannelForm(false);
                      setEditingChannel(null);
                    }}
                    className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                  >
                    取消
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="space-y-2">
            {(isReorderingChannels ? reorderedChannels : channels).map((channel, index) => (
              <div key={channel.id}>
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center justify-between p-3 bg-gray-50 rounded border">
                    <div>
                      <div className="font-medium">{channel.name}</div>
                    </div>
                    {!isReorderingChannels && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditingChannel(channel);
                            setShowChannelForm(channel.id);
                          }}
                          className="px-3 py-1 bg-yellow-500 text-white rounded text-sm hover:bg-yellow-600"
                        >
                          編輯
                        </button>
                        <button
                          onClick={() => handleChannelDelete(channel.id)}
                          className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
                        >
                          刪除
                        </button>
                      </div>
                    )}
                  </div>
                  {isReorderingChannels && (
                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={() => moveChannel(index, 'top')}
                        className="px-1.5 py-0.5 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 text-[10px] leading-tight"
                        title="置頂"
                      >
                        ⬆⬆
                      </button>
                      <button
                        onClick={() => moveChannel(index, 'up')}
                        className="px-1.5 py-0.5 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 text-[10px] leading-tight"
                        disabled={index === 0}
                        title="上移"
                      >
                        ⬆
                      </button>
                      <button
                        onClick={() => moveChannel(index, 'down')}
                        className="px-1.5 py-0.5 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 text-[10px] leading-tight"
                        disabled={index === (isReorderingChannels ? reorderedChannels : channels).length - 1}
                        title="下移"
                      >
                        ⬇
                      </button>
                      <button
                        onClick={() => moveChannel(index, 'bottom')}
                        className="px-1.5 py-0.5 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 text-[10px] leading-tight"
                        title="置底"
                      >
                        ⬇⬇
                      </button>
                    </div>
                  )}
                </div>
                {showChannelForm === channel.id && (
                  <div className="channel-form-container mt-2 p-4 bg-gray-50 rounded-lg border">
                    <form onSubmit={handleChannelSubmit} className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium mb-1">通路名稱 *</label>
                        <input
                          type="text"
                          name="name"
                          defaultValue={editingChannel?.name || ''}
                          required
                          className="w-full px-3 py-2 border rounded"
                        />
                      </div>
                      <input
                        type="hidden"
                        name="displayOrder"
                        defaultValue={editingChannel?.display_order || 0}
                      />
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          更新
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowChannelForm(false);
                            setEditingChannel(null);
                          }}
                          className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                        >
                          取消
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// 回饋計算設定
function CalculateSettings() {
  const [schemes, setSchemes] = useState<CalculationScheme[]>([]);
  const [allCards, setAllCards] = useState<Card[]>([]);
  const [allPaymentMethods, setAllPaymentMethods] = useState<PaymentMethod[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    selectedType: '', // 'card' 或 'payment'
    selectedCardId: '',
    selectedSchemeId: '',
    selectedPaymentMethodId: '',
    displayOrder: 0,
  });
  const [selectedCardSchemes, setSelectedCardSchemes] = useState<Scheme[]>([]);
  const [selectedSchemePaymentMethods, setSelectedSchemePaymentMethods] = useState<PaymentMethod[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [schemesRes, cardsRes, paymentsRes] = await Promise.all([
        api.get('/settings/calculation-schemes'),
        api.get('/cards'),
        api.get('/payment-methods'),
      ]);
      setSchemes(schemesRes.data.data);
      setAllCards(cardsRes.data.data);
      setAllPaymentMethods(paymentsRes.data.data);
    } catch (error) {
      console.error('載入資料錯誤:', error);
    }
  };

  const handleAdd = async () => {
    if (formData.selectedType === 'card') {
      if (!formData.selectedSchemeId) {
        alert('請選擇方案');
        return;
      }
    } else if (formData.selectedType === 'payment') {
      if (!formData.selectedPaymentMethodId) {
        alert('請選擇支付方式');
        return;
      }
    } else {
      alert('請選擇卡片或支付方式');
      return;
    }
    try {
      const submitData: {
        schemeId?: string;
        paymentMethodId?: string;
        displayOrder: number;
      } = {
        displayOrder: formData.displayOrder,
      };
      if (formData.selectedType === 'card') {
        submitData.schemeId = formData.selectedSchemeId;
        if (formData.selectedPaymentMethodId) {
          submitData.paymentMethodId = formData.selectedPaymentMethodId;
        }
      } else {
        submitData.paymentMethodId = formData.selectedPaymentMethodId;
      }
      await api.post('/settings/calculation-schemes', submitData);
      alert('方案已新增');
      setShowForm(false);
      setFormData({ 
        selectedType: '', 
        selectedCardId: '', 
        selectedSchemeId: '', 
        selectedPaymentMethodId: '', 
        displayOrder: 0 
      });
      setSelectedCardSchemes([]);
      setSelectedSchemePaymentMethods([]);
      loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      alert(err.response?.data?.error || '新增失敗');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('確定要刪除這個計算方案嗎？')) return;
    try {
      await api.delete(`/settings/calculation-schemes/${id}`);
      alert('方案已刪除');
      loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      alert(err.response?.data?.error || '刪除失敗');
    }
  };

  const [isReorderingSchemes, setIsReorderingSchemes] = useState(false);
  const [reorderedSchemes, setReorderedSchemes] = useState<CalculationScheme[]>([]);

  const handleOrderUpdate = async () => {
    if (isReorderingSchemes) {
      // 保存順序
      try {
        const orders = reorderedSchemes.map((scheme, index) => ({
          id: scheme.id,
          displayOrder: index,
        }));
        await api.put('/settings/calculation-schemes/order', { orders });
        alert('順序已更新');
        setIsReorderingSchemes(false);
        loadData();
      } catch (error: unknown) {
        const err = error as { response?: { data?: { error?: string } } };
        alert(err.response?.data?.error || '更新失敗');
      }
    } else {
      // 進入調整順序模式
      setIsReorderingSchemes(true);
      setReorderedSchemes([...schemes]);
    }
  };

  const moveScheme = (index: number, direction: 'up' | 'down' | 'top' | 'bottom') => {
    const newSchemes = [...reorderedSchemes];
    if (direction === 'up' && index > 0) {
      [newSchemes[index - 1], newSchemes[index]] = [newSchemes[index], newSchemes[index - 1]];
    } else if (direction === 'down' && index < newSchemes.length - 1) {
      [newSchemes[index], newSchemes[index + 1]] = [newSchemes[index + 1], newSchemes[index]];
    } else if (direction === 'top') {
      const item = newSchemes.splice(index, 1)[0];
      newSchemes.unshift(item);
    } else if (direction === 'bottom') {
      const item = newSchemes.splice(index, 1)[0];
      newSchemes.push(item);
    }
    setReorderedSchemes(newSchemes);
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">回饋計算設定</h3>

      <div className="flex justify-between items-center">
        <h4 className="font-medium">計算方案列表</h4>
        <div className="flex gap-2">
          <button
            onClick={handleOrderUpdate}
            className={`px-3 py-1 rounded text-sm ${
              isReorderingSchemes
                ? 'bg-green-500 text-white hover:bg-green-600'
                : 'bg-gray-500 text-white hover:bg-gray-600'
            }`}
          >
            {isReorderingSchemes ? '儲存順序' : '調整順序'}
          </button>
          {isReorderingSchemes && (
            <button
              onClick={() => {
                setIsReorderingSchemes(false);
                setReorderedSchemes([...schemes]);
              }}
              className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
            >
              取消
            </button>
          )}
          <button
            onClick={() => setShowForm(true)}
            className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
          >
            新增方案
          </button>
        </div>
      </div>

      {showForm && (
        <div className="p-4 bg-gray-50 rounded-lg border">
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">選擇卡片/支付方式 *</label>
              <select
                value={formData.selectedType === 'card' ? `card_${formData.selectedCardId}` : formData.selectedType === 'payment' ? `payment_${formData.selectedPaymentMethodId}` : ''}
                onChange={async (e: ChangeEvent<HTMLSelectElement>) => {
                  const value = e.target.value;
                  if (value.startsWith('card_')) {
                    const cardId = value.replace('card_', '');
                    setFormData({ 
                      selectedType: 'card', 
                      selectedCardId: cardId, 
                      selectedSchemeId: '', 
                      selectedPaymentMethodId: '', 
                      displayOrder: 0 
                    });
                    setSelectedSchemePaymentMethods([]);
                    try {
                      const res = await api.get(`/schemes/card/${cardId}`);
                      setSelectedCardSchemes(res.data.data);
                    } catch (error) {
                      console.error('載入方案錯誤:', error);
                      setSelectedCardSchemes([]);
                    }
                  } else if (value.startsWith('payment_')) {
                    const paymentId = value.replace('payment_', '');
                    setFormData({ 
                      selectedType: 'payment', 
                      selectedCardId: '', 
                      selectedSchemeId: '', 
                      selectedPaymentMethodId: paymentId, 
                      displayOrder: 0 
                    });
                    setSelectedCardSchemes([]);
                    setSelectedSchemePaymentMethods([]);
                  } else {
                    setFormData({ 
                      selectedType: '', 
                      selectedCardId: '', 
                      selectedSchemeId: '', 
                      selectedPaymentMethodId: '', 
                      displayOrder: 0 
                    });
                    setSelectedCardSchemes([]);
                    setSelectedSchemePaymentMethods([]);
                  }
                }}
                className="w-full px-3 py-2 border rounded"
              >
                <option value="">請選擇卡片或支付方式</option>
                <optgroup label="卡片">
                  {allCards.map((card: Card) => (
                    <option key={`card_${card.id}`} value={`card_${card.id}`}>
                      {card.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="支付方式">
                  {allPaymentMethods.map((pm) => (
                    <option key={`payment_${pm.id}`} value={`payment_${pm.id}`}>
                      {pm.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
            {formData.selectedType === 'card' && selectedCardSchemes.length > 0 && (
              <div>
                <label className="block text-sm font-medium mb-1">選擇方案 *</label>
                <select
                  value={formData.selectedSchemeId}
                  onChange={async (e: ChangeEvent<HTMLSelectElement>) => {
                    const schemeId = e.target.value;
                    setFormData({ ...formData, selectedSchemeId: schemeId, selectedPaymentMethodId: '' });
                    setSelectedSchemePaymentMethods([]);
                    if (schemeId) {
                      try {
                        const res = await api.get(`/payment-methods/scheme/${schemeId}`);
                        setSelectedSchemePaymentMethods(res.data.data || []);
                      } catch (error) {
                        console.error('載入支付方式錯誤:', error);
                        setSelectedSchemePaymentMethods([]);
                      }
                    }
                  }}
                  className="w-full px-3 py-2 border rounded"
                >
                  <option value="">請選擇方案</option>
                  {selectedCardSchemes.map((scheme) => (
                    <option key={scheme.id} value={scheme.id}>
                      {scheme.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {formData.selectedType === 'card' && formData.selectedSchemeId && selectedSchemePaymentMethods.length > 0 && (
              <div>
                <label className="block text-sm font-medium mb-1">選擇支付方式（可選）</label>
                <select
                  value={formData.selectedPaymentMethodId}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, selectedPaymentMethodId: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                >
                  <option value="">不使用支付方式</option>
                  {selectedSchemePaymentMethods.map((pm) => (
                    <option key={pm.id} value={pm.id}>
                      {pm.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <input
                type="hidden"
                value={formData.displayOrder}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setFormData({ ...formData, displayOrder: parseInt(e.target.value) || 0 })
                }
                className="w-full px-3 py-2 border rounded"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAdd}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                新增
              </button>
              <button
                onClick={() => {
                  setShowForm(false);
                  setFormData({ 
                    selectedType: '', 
                    selectedCardId: '', 
                    selectedSchemeId: '', 
                    selectedPaymentMethodId: '', 
                    displayOrder: 0 
                  });
                  setSelectedCardSchemes([]);
                  setSelectedSchemePaymentMethods([]);
                }}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
            {(isReorderingSchemes ? reorderedSchemes : schemes).map((scheme, index) => (
              <div key={scheme.id} className="flex items-center gap-2">
                <div className="flex-1 flex items-center justify-between p-3 bg-gray-50 rounded border">
                  <div>
                    <div className="font-medium">{scheme.name}</div>
                  </div>
                  {!isReorderingSchemes && (
                    <button
                      onClick={() => handleDelete(scheme.id)}
                      className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
                    >
                      刪除
                    </button>
                  )}
                </div>
                {isReorderingSchemes && (
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => moveScheme(index, 'top')}
                      className="px-1.5 py-0.5 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 text-[10px] leading-tight"
                      title="置頂"
                    >
                      ⬆⬆
                    </button>
                    <button
                      onClick={() => moveScheme(index, 'up')}
                      className="px-1.5 py-0.5 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 text-[10px] leading-tight"
                      disabled={index === 0}
                      title="上移"
                    >
                      ⬆
                    </button>
                    <button
                      onClick={() => moveScheme(index, 'down')}
                      className="px-1.5 py-0.5 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 text-[10px] leading-tight"
                      disabled={index === (isReorderingSchemes ? reorderedSchemes : schemes).length - 1}
                      title="下移"
                    >
                      ⬇
                    </button>
                    <button
                      onClick={() => moveScheme(index, 'bottom')}
                      className="px-1.5 py-0.5 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 text-[10px] leading-tight"
                      title="置底"
                    >
                      ⬇⬇
                    </button>
                  </div>
                )}
              </div>
            ))}
      </div>
    </div>
  );
}

// 記帳功能設定
function TransactionSettings() {
  const [reasonString, setReasonString] = useState('');
  const [transactionTypes, setTransactionTypes] = useState<TransactionType[]>([]);
  const [schemes, setSchemes] = useState<CalculationScheme[]>([]);
  const [editingType, setEditingType] = useState<TransactionType | null>(null);
  const [showTypeForm, setShowTypeForm] = useState(false);
  // showClearForm 已移除，清除明細區塊現在常態顯示
  const [clearDateRange, setClearDateRange] = useState({ startDate: '', endDate: '' });
  const [isReorderingSchemes, setIsReorderingSchemes] = useState(false);
  const [reorderedSchemes, setReorderedSchemes] = useState<CalculationScheme[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    selectedType: '',
    selectedCardId: '',
    selectedSchemeId: '',
    selectedPaymentMethodId: '',
    displayOrder: 0,
  });
  const [selectedCardSchemes, setSelectedCardSchemes] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedSchemePaymentMethods, setSelectedSchemePaymentMethods] = useState<Array<{ id: string; name: string }>>([]);
  const [allCards, setAllCards] = useState<Card[]>([]);
  const [allPaymentMethods, setAllPaymentMethods] = useState<PaymentMethod[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [reasonRes, typesRes, schemesRes, paymentMethodsRes] = await Promise.all([
        api.get('/settings/reason-strings'),
        api.get('/settings/transaction-types'),
        api.get('/settings/calculation-schemes'),
        api.get('/payment-methods'),
      ]);
      if (reasonRes.data.data.length > 0) {
        setReasonString(reasonRes.data.data[0].content);
      }
      setTransactionTypes(typesRes.data.data);
      setSchemes(schemesRes.data.data);
      setAllPaymentMethods(paymentMethodsRes.data.data);
    } catch (error) {
      console.error('載入資料錯誤:', error);
    }
  };

  const handleUpdateReason = async () => {
    try {
      await api.put('/settings/reason-strings', { content: reasonString });
      alert('事由字串已更新');
    } catch (error) {
      console.error('更新錯誤:', error);
      alert('更新失敗');
    }
  };

  const handleTypeSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const data = {
      name: formData.get('name'),
      displayOrder: parseInt(formData.get('displayOrder') as string) || 0,
    };

    try {
      if (editingType) {
        await api.put(`/settings/transaction-types/${editingType.id}`, data);
      } else {
        await api.post('/settings/transaction-types', data);
      }
      alert(editingType ? '交易類型已更新' : '交易類型已新增');
      setShowTypeForm(false);
      setEditingType(null);
      loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      alert(err.response?.data?.error || '操作失敗');
    }
  };

  const handleTypeDelete = async (id: string) => {
    if (!confirm('確定要刪除這個交易類型嗎？')) return;
    try {
      await api.delete(`/settings/transaction-types/${id}`);
      alert('交易類型已刪除');
      loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      alert(err.response?.data?.error || '刪除失敗');
    }
  };

  const [isReorderingTypes, setIsReorderingTypes] = useState(false);
  const [reorderedTypes, setReorderedTypes] = useState<TransactionType[]>([]);

  const handleTypeOrderUpdate = async () => {
    if (isReorderingTypes) {
      // 保存順序
      try {
        const orders = reorderedTypes.map((type, index) => ({
          id: type.id,
          displayOrder: index,
        }));
        await api.put('/settings/transaction-types/order', { orders });
        alert('順序已更新');
        setIsReorderingTypes(false);
        loadData();
      } catch (error: unknown) {
        const err = error as { response?: { data?: { error?: string } } };
        alert(err.response?.data?.error || '更新失敗');
      }
    } else {
      // 進入調整順序模式
      setIsReorderingTypes(true);
      setReorderedTypes([...transactionTypes]);
    }
  };

  const moveType = (index: number, direction: 'up' | 'down' | 'top' | 'bottom') => {
    const newTypes = [...reorderedTypes];
    if (direction === 'up' && index > 0) {
      [newTypes[index - 1], newTypes[index]] = [newTypes[index], newTypes[index - 1]];
    } else if (direction === 'down' && index < newTypes.length - 1) {
      [newTypes[index], newTypes[index + 1]] = [newTypes[index + 1], newTypes[index]];
    } else if (direction === 'top') {
      const item = newTypes.splice(index, 1)[0];
      newTypes.unshift(item);
    } else if (direction === 'bottom') {
      const item = newTypes.splice(index, 1)[0];
      newTypes.push(item);
    }
    setReorderedTypes(newTypes);
  };

  const handleSchemeOrderUpdate = async () => {
    if (isReorderingSchemes) {
      // 保存順序
      try {
        const orders = reorderedSchemes.map((scheme, index) => ({
          id: scheme.id,
          displayOrder: index,
        }));
        await api.put('/settings/calculation-schemes/order', { orders });
        alert('順序已更新');
        setIsReorderingSchemes(false);
        loadData();
      } catch (error: unknown) {
        const err = error as { response?: { data?: { error?: string } } };
        alert(err.response?.data?.error || '更新失敗');
      }
    } else {
      // 進入調整順序模式
      setIsReorderingSchemes(true);
      setReorderedSchemes([...schemes]);
    }
  };

  const moveScheme = (index: number, direction: 'up' | 'down' | 'top' | 'bottom') => {
    const newSchemes = [...reorderedSchemes];
    if (direction === 'up' && index > 0) {
      [newSchemes[index - 1], newSchemes[index]] = [newSchemes[index], newSchemes[index - 1]];
    } else if (direction === 'down' && index < newSchemes.length - 1) {
      [newSchemes[index], newSchemes[index + 1]] = [newSchemes[index + 1], newSchemes[index]];
    } else if (direction === 'top') {
      const item = newSchemes.splice(index, 1)[0];
      newSchemes.unshift(item);
    } else if (direction === 'bottom') {
      const item = newSchemes.splice(index, 1)[0];
      newSchemes.push(item);
    }
    setReorderedSchemes(newSchemes);
  };

  const handleAdd = async () => {
    if (formData.selectedType === 'card' && !formData.selectedSchemeId) {
      alert('請選擇方案');
      return;
    } else if (formData.selectedType === 'payment' && !formData.selectedPaymentMethodId) {
      alert('請選擇支付方式');
      return;
    } else if (!formData.selectedType) {
      alert('請選擇卡片或支付方式');
      return;
    }
    try {
      const submitData: {
        schemeId?: string;
        paymentMethodId?: string;
        displayOrder: number;
      } = {
        displayOrder: schemes.length,
      };
      if (formData.selectedType === 'card') {
        submitData.schemeId = formData.selectedSchemeId;
        if (formData.selectedPaymentMethodId) {
          submitData.paymentMethodId = formData.selectedPaymentMethodId;
        }
      } else {
        submitData.paymentMethodId = formData.selectedPaymentMethodId;
      }
      await api.post('/settings/calculation-schemes', submitData);
      alert('方案已新增');
      setShowForm(false);
      setFormData({ 
        selectedType: '', 
        selectedCardId: '', 
        selectedSchemeId: '', 
        selectedPaymentMethodId: '', 
        displayOrder: 0 
      });
      setSelectedCardSchemes([]);
      setSelectedSchemePaymentMethods([]);
      loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      alert(err.response?.data?.error || '新增失敗');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('確定要刪除這個計算方案嗎？')) return;
    try {
      await api.delete(`/settings/calculation-schemes/${id}`);
      alert('方案已刪除');
      loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      alert(err.response?.data?.error || '刪除失敗');
    }
  };

  useEffect(() => {
    if (showForm) {
      loadCards();
    }
  }, [showForm]);

  const loadCards = async () => {
    try {
      const cardsRes = await api.get('/cards');
      setAllCards(cardsRes.data.data);
    } catch (error) {
      console.error('載入卡片錯誤:', error);
    }
  };

  useEffect(() => {
    if (formData.selectedCardId) {
      loadCardSchemes();
    } else {
      setSelectedCardSchemes([]);
    }
  }, [formData.selectedCardId]);

  const loadCardSchemes = async () => {
    try {
      const res = await api.get(`/schemes/card/${formData.selectedCardId}`);
      setSelectedCardSchemes(res.data.data.map((s: Scheme) => ({ id: s.id, name: s.name })));
    } catch (error) {
      console.error('載入方案錯誤:', error);
    }
  };

  useEffect(() => {
    if (formData.selectedSchemeId) {
      loadSchemePaymentMethods();
    } else {
      setSelectedSchemePaymentMethods([]);
    }
  }, [formData.selectedSchemeId]);

  const loadSchemePaymentMethods = async () => {
    try {
      const res = await api.get(`/payment-methods/scheme/${formData.selectedSchemeId}`);
      setSelectedSchemePaymentMethods(res.data.data || []);
    } catch (error) {
      console.error('載入支付方式錯誤:', error);
    }
  };

  const handleClearTransactions = async () => {
    if (
      !confirm(
        `確定要清除 ${clearDateRange.startDate} 至 ${clearDateRange.endDate} 的所有交易明細嗎？此操作無法復原！`
      )
    ) {
      return;
    }
    if (
      !confirm(
        '請再次確認：這將永久刪除該時間區間內的所有交易記錄，且會影響額度計算。確定要繼續嗎？'
      )
    ) {
      return;
    }

    try {
      const res = await api.delete(
        `/settings/transactions/clear?startDate=${clearDateRange.startDate}&endDate=${clearDateRange.endDate}`
      );
      alert(res.data.message || '交易明細已清除');
      setClearDateRange({ startDate: '', endDate: '' });
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      alert(err.response?.data?.error || '清除失敗');
    }
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">記帳功能設定</h3>

      <div className="space-y-6">
        {/* 事由字串 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">事由字串</label>
          <textarea
            value={reasonString}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setReasonString(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          />
          <button
            onClick={handleUpdateReason}
            className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            更新
          </button>
        </div>

        {/* 交易類型 */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <h4 className="font-medium">交易類型</h4>
            <div className="flex gap-2">
              <button
                onClick={handleTypeOrderUpdate}
                className={`px-3 py-1 rounded text-sm ${
                  isReorderingTypes
                    ? 'bg-green-500 text-white hover:bg-green-600'
                    : 'bg-gray-500 text-white hover:bg-gray-600'
                }`}
              >
                {isReorderingTypes ? '儲存順序' : '調整順序'}
              </button>
              {isReorderingTypes && (
                <button
                  onClick={() => {
                    setIsReorderingTypes(false);
                    setReorderedTypes([...transactionTypes]);
                  }}
                  className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
                >
                  取消
                </button>
              )}
              <button
                onClick={() => {
                  setEditingType(null);
                  setShowTypeForm(true);
                }}
                className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
              >
                新增類型
              </button>
            </div>
          </div>

          {showTypeForm && (
            <div className="p-4 bg-gray-50 rounded-lg border mb-4">
              <form onSubmit={handleTypeSubmit} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">類型名稱 *</label>
                  <input
                    type="text"
                    name="name"
                    defaultValue={editingType?.name || ''}
                    required
                    className="w-full px-3 py-2 border rounded"
                  />
                </div>
                <input
                  type="hidden"
                  name="displayOrder"
                  defaultValue={editingType?.display_order || 0}
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    {editingType ? '更新' : '新增'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowTypeForm(false);
                      setEditingType(null);
                    }}
                    className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                  >
                    取消
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="space-y-2">
            {(isReorderingTypes ? reorderedTypes : transactionTypes).map((type, index) => (
              <div key={type.id} className="flex items-center gap-2">
                <div className="flex-1 flex items-center justify-between p-3 bg-gray-50 rounded border">
                  <div>
                    <div className="font-medium">{type.name}</div>
                  </div>
                  {!isReorderingTypes && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditingType(type);
                          setShowTypeForm(true);
                        }}
                        className="px-3 py-1 bg-yellow-500 text-white rounded text-sm hover:bg-yellow-600"
                      >
                        編輯
                      </button>
                      <button
                        onClick={() => handleTypeDelete(type.id)}
                        className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
                      >
                        刪除
                      </button>
                    </div>
                  )}
                </div>
                {isReorderingTypes && (
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => moveType(index, 'top')}
                      className="px-1.5 py-0.5 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 text-[10px] leading-tight"
                      title="置頂"
                    >
                      ⬆⬆
                    </button>
                    <button
                      onClick={() => moveType(index, 'up')}
                      className="px-1.5 py-0.5 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 text-[10px] leading-tight"
                      disabled={index === 0}
                      title="上移"
                    >
                      ⬆
                    </button>
                    <button
                      onClick={() => moveType(index, 'down')}
                      className="px-1.5 py-0.5 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 text-[10px] leading-tight"
                      disabled={index === (isReorderingTypes ? reorderedTypes : transactionTypes).length - 1}
                      title="下移"
                    >
                      ⬇
                    </button>
                    <button
                      onClick={() => moveType(index, 'bottom')}
                      className="px-1.5 py-0.5 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 text-[10px] leading-tight"
                      title="置底"
                    >
                      ⬇⬇
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 可用方案 */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <h4 className="font-medium">可用方案</h4>
            <div className="flex gap-2">
              <button
                onClick={handleSchemeOrderUpdate}
                className={`px-3 py-1 rounded text-sm ${
                  isReorderingSchemes
                    ? 'bg-green-500 text-white hover:bg-green-600'
                    : 'bg-gray-500 text-white hover:bg-gray-600'
                }`}
              >
                {isReorderingSchemes ? '儲存順序' : '調整順序'}
              </button>
              {isReorderingSchemes && (
                <button
                  onClick={() => {
                    setIsReorderingSchemes(false);
                    setReorderedSchemes([...schemes]);
                  }}
                  className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
                >
                  取消
                </button>
              )}
              <button
                onClick={() => {
                  setShowForm(true);
                }}
                className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
              >
                新增方案
              </button>
            </div>
          </div>
          {showForm && (
            <div className="p-4 bg-gray-50 rounded-lg border mb-4">
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">選擇卡片/支付方式 *</label>
                  <select
                    value={formData.selectedType === 'card' ? `card_${formData.selectedCardId}` : formData.selectedType === 'payment' ? `payment_${formData.selectedPaymentMethodId}` : ''}
                    onChange={async (e: ChangeEvent<HTMLSelectElement>) => {
                      const value = e.target.value;
                      if (value.startsWith('card_')) {
                        const cardId = value.replace('card_', '');
                        setFormData({ 
                          selectedType: 'card', 
                          selectedCardId: cardId, 
                          selectedSchemeId: '', 
                          selectedPaymentMethodId: '', 
                          displayOrder: 0 
                        });
                        setSelectedSchemePaymentMethods([]);
                      } else if (value.startsWith('payment_')) {
                        const paymentId = value.replace('payment_', '');
                        setFormData({ 
                          selectedType: 'payment', 
                          selectedCardId: '', 
                          selectedSchemeId: '', 
                          selectedPaymentMethodId: paymentId, 
                          displayOrder: 0 
                        });
                        setSelectedCardSchemes([]);
                        setSelectedSchemePaymentMethods([]);
                      } else {
                        setFormData({ 
                          selectedType: '', 
                          selectedCardId: '', 
                          selectedSchemeId: '', 
                          selectedPaymentMethodId: '', 
                          displayOrder: 0 
                        });
                        setSelectedCardSchemes([]);
                        setSelectedSchemePaymentMethods([]);
                      }
                    }}
                    className="w-full px-3 py-2 border rounded"
                  >
                    <option value="">請選擇卡片或支付方式</option>
                    <optgroup label="卡片">
                      {allCards.map((card: Card) => (
                        <option key={`card_${card.id}`} value={`card_${card.id}`}>
                          {card.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="支付方式">
                      {allPaymentMethods.map((pm) => (
                        <option key={`payment_${pm.id}`} value={`payment_${pm.id}`}>
                          {pm.name}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>
                {formData.selectedType === 'card' && selectedCardSchemes.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium mb-1">選擇方案 *</label>
                    <select
                      value={formData.selectedSchemeId}
                      onChange={async (e: ChangeEvent<HTMLSelectElement>) => {
                        const schemeId = e.target.value;
                        setFormData({ ...formData, selectedSchemeId: schemeId, selectedPaymentMethodId: '' });
                        setSelectedSchemePaymentMethods([]);
                        if (schemeId) {
                          try {
                            const res = await api.get(`/payment-methods/scheme/${schemeId}`);
                            setSelectedSchemePaymentMethods(res.data.data || []);
                          } catch (error) {
                            console.error('載入支付方式錯誤:', error);
                            setSelectedSchemePaymentMethods([]);
                          }
                        }
                      }}
                      className="w-full px-3 py-2 border rounded"
                    >
                      <option value="">請選擇方案</option>
                      {selectedCardSchemes.map((scheme) => (
                        <option key={scheme.id} value={scheme.id}>
                          {scheme.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {formData.selectedType === 'card' && formData.selectedSchemeId && selectedSchemePaymentMethods.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium mb-1">選擇支付方式（可選）</label>
                    <select
                      value={formData.selectedPaymentMethodId}
                      onChange={(e: ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, selectedPaymentMethodId: e.target.value })}
                      className="w-full px-3 py-2 border rounded"
                    >
                      <option value="">不使用支付方式</option>
                      {selectedSchemePaymentMethods.map((pm) => (
                        <option key={pm.id} value={pm.id}>
                          {pm.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={handleAdd}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    新增
                  </button>
                  <button
                    onClick={() => {
                      setShowForm(false);
                      setFormData({ 
                        selectedType: '', 
                        selectedCardId: '', 
                        selectedSchemeId: '', 
                        selectedPaymentMethodId: '', 
                        displayOrder: 0 
                      });
                      setSelectedCardSchemes([]);
                      setSelectedSchemePaymentMethods([]);
                    }}
                    className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                  >
                    取消
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="space-y-2">
            {(isReorderingSchemes ? reorderedSchemes : schemes).map((scheme, index) => (
              <div key={scheme.id} className="flex items-center gap-2">
                <div className="flex-1 flex items-center justify-between p-3 bg-gray-50 rounded border">
                  <div>
                    <div className="font-medium">{scheme.name}</div>
                  </div>
                  {!isReorderingSchemes && (
                    <button
                      onClick={() => handleDelete(scheme.id)}
                      className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
                    >
                      刪除
                    </button>
                  )}
                </div>
                {isReorderingSchemes && (
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => moveScheme(index, 'top')}
                      className="px-1.5 py-0.5 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 text-[10px] leading-tight"
                      title="置頂"
                    >
                      ⬆⬆
                    </button>
                    <button
                      onClick={() => moveScheme(index, 'up')}
                      className="px-1.5 py-0.5 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 text-[10px] leading-tight"
                      disabled={index === 0}
                      title="上移"
                    >
                      ⬆
                    </button>
                    <button
                      onClick={() => moveScheme(index, 'down')}
                      className="px-1.5 py-0.5 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 text-[10px] leading-tight"
                      disabled={index === (isReorderingSchemes ? reorderedSchemes : schemes).length - 1}
                      title="下移"
                    >
                      ⬇
                    </button>
                    <button
                      onClick={() => moveScheme(index, 'bottom')}
                      className="px-1.5 py-0.5 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 text-[10px] leading-tight"
                      title="置底"
                    >
                      ⬇⬇
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 清除交易明細 */}
        <div>
          <h4 className="font-medium text-red-600 mb-2">清除交易明細</h4>
          <div className="p-4 bg-red-50 rounded-lg border border-red-200">
            <div className="space-y-3">
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">開始日期 *</label>
                  <input
                    type="date"
                    value={clearDateRange.startDate}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      setClearDateRange({ ...clearDateRange, startDate: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">結束日期 *</label>
                  <input
                    type="date"
                    value={clearDateRange.endDate}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      setClearDateRange({ ...clearDateRange, endDate: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded"
                  />
                </div>
                <button
                  onClick={() => {
                    // 計算上上個月的日期範圍
                    const now = new Date();
                    const lastLastMonth = new Date(now.getFullYear(), now.getMonth() - 2, 1);
                    const lastLastMonthEnd = new Date(now.getFullYear(), now.getMonth() - 1, 0);
                    
                    setClearDateRange({
                      startDate: `${lastLastMonth.getFullYear()}-${String(lastLastMonth.getMonth() + 1).padStart(2, '0')}-01`,
                      endDate: `${lastLastMonthEnd.getFullYear()}-${String(lastLastMonthEnd.getMonth() + 1).padStart(2, '0')}-${String(lastLastMonthEnd.getDate()).padStart(2, '0')}`,
                    });
                  }}
                  className="px-3 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 text-sm whitespace-nowrap"
                  title="設定為上上個月的日期範圍"
                >
                  快速設定
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleClearTransactions}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                >
                  確認清除
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// 額度查詢設定
function QuotaSettings() {
  const [quotas, setQuotas] = useState<Array<{
    schemeId: string | null;
    paymentMethodId: string | null;
    name: string;
    rewardComposition: string;
    calculationMethods: string[];
    quotaLimits: Array<number | null>;
    currentAmounts: number[];
    usedQuotas: number[];
    remainingQuotas: Array<number | null>;
    referenceAmounts: Array<number | null>;
    refreshTimes: string[];
    rewardIds: string[];
  }>>([]);
  const [editingQuota, setEditingQuota] = useState<{
    quotaIndex: number;
    rewardIndex: number;
  } | null>(null);
  const [editForm, setEditForm] = useState({
    usedQuotaAdjustment: '', // 僅允許增減，例如 +7 或 -5
  });

  useEffect(() => {
    loadQuotas();
  }, []);

  const loadQuotas = async () => {
    try {
      const res = await api.get('/quota');
      if (res.data && res.data.success && Array.isArray(res.data.data)) {
        // 處理支付方式：如果 rewardIds 都是空值，但 rewardComposition 有值，則創建對應的 rewardIds
        const processedData = res.data.data.map((quota: any) => {
          // 如果是支付方式且 rewardIds 為空或都是空值，但 rewardComposition 有值
          if (!quota.schemeId && quota.paymentMethodId) {
            if ((!quota.rewardIds || quota.rewardIds.length === 0 || quota.rewardIds.every((id: string) => !id || id.trim() === '')) 
                && quota.rewardComposition && quota.rewardComposition.trim() !== '') {
              // 根據 rewardComposition 的數量創建對應的 rewardIds（使用空字串作為佔位符）
              const count = quota.rewardComposition.split('/').length;
              quota.rewardIds = Array(count).fill('');
            }
          }
          return quota;
        });
        setQuotas(processedData);
      } else {
        setQuotas([]);
      }
    } catch (error) {
      console.error('載入額度錯誤:', error);
      setQuotas([]);
    }
  };

  // 格式化額度資訊（已使用/剩餘/上限）
  const formatQuotaInfo = (
    used: number,
    remaining: number | null,
    limit: number | null,
    isEditing: boolean = false,
    editingValue?: string,
    onEditingChange?: (value: string) => void
  ) => {
    const usedStr = used.toLocaleString();
    const remainingStr = remaining === null ? '無上限' : remaining.toLocaleString();
    const limitStr = limit === null ? '無上限' : limit.toLocaleString();
    return (
      <div className="space-y-1">
        <div className="text-xs text-gray-600">
          <span className="font-medium">已用：</span>
          {isEditing ? (
            <div className="flex items-center gap-1 mt-1">
              <span className="text-gray-500">{usedStr}</span>
              <span className="text-gray-400">+</span>
              <input
                type="text"
                value={editingValue || ''}
                onChange={(e) => onEditingChange?.(e.target.value)}
                placeholder="+7 或 -5"
                className="w-20 px-2 py-1 border rounded text-xs"
              />
            </div>
          ) : (
            <span className={used > 0 ? 'text-orange-600' : 'text-gray-500'}>{usedStr}</span>
          )}
        </div>
        <div className="text-xs text-gray-600">
          <span className="font-medium">剩餘：</span>
          <span className={remaining !== null && remaining < (limit || 0) * 0.2 ? 'text-red-600 font-semibold' : 'text-green-600'}>{remainingStr}</span>
        </div>
        <div className="text-xs text-gray-500">
          <span className="font-medium">上限：</span>
          {limitStr}
        </div>
      </div>
    );
  };

  // 格式化消費資訊（當前消費/參考餘額）
  const formatConsumptionInfo = (
    current: number,
    reference: number | null
  ) => {
    const currentStr = current.toLocaleString();
    const referenceStr = reference === null ? '無上限' : Math.round(reference).toLocaleString();
    return (
      <div className="space-y-1">
        <div className="text-xs text-gray-600">
          <span className="font-medium">消費：</span>
          <span className={current > 0 ? 'text-blue-600' : 'text-gray-500'}>{currentStr}</span>
        </div>
        <div className="text-xs text-gray-600">
          <span className="font-medium">參考：</span>
          <span className="text-purple-600">{referenceStr}</span>
        </div>
      </div>
    );
  };

  const handleEdit = (quotaIndex: number, rewardIndex: number) => {
    setEditingQuota({ quotaIndex, rewardIndex });
    setEditForm({
      usedQuotaAdjustment: '', // 空值，用戶可以輸入 +7 或 -5
    });
  };

  const handleSave = async () => {
    if (!editingQuota) return;
    const quota = quotas[editingQuota.quotaIndex];
    const rewardId = quota.rewardIds[editingQuota.rewardIndex];

    if (!quota.schemeId || !rewardId) {
      alert('無法編輯：缺少必要資訊');
      return;
    }

    // 解析增減值（支援 +7 或 -5 格式）
    const adjustmentText = editForm.usedQuotaAdjustment.trim();
    let adjustment = 0;
    if (adjustmentText) {
      if (adjustmentText.startsWith('+')) {
        adjustment = parseFloat(adjustmentText.substring(1)) || 0;
      } else if (adjustmentText.startsWith('-')) {
        adjustment = parseFloat(adjustmentText) || 0;
      } else {
        adjustment = parseFloat(adjustmentText) || 0;
      }
    }

    if (adjustment === 0) {
      alert('請輸入增減值（例如：+7 或 -5）');
      return;
    }

    // 計算新的已使用額度 = 當前已使用額度 + 增減值
    const currentUsedQuota = quota.usedQuotas[editingQuota.rewardIndex] || 0;
    const newUsedQuota = currentUsedQuota + adjustment;

    // 計算剩餘額度
    const quotaLimit = quota.quotaLimits[editingQuota.rewardIndex];
    let newRemainingQuota: number | null = null;
    if (quotaLimit !== null) {
      newRemainingQuota = Math.max(0, quotaLimit - newUsedQuota);
    }

    try {
      await api.put(`/quota/${quota.schemeId}`, {
        paymentMethodId: quota.paymentMethodId || null,
        rewardId,
        quotaLimit: quotaLimit, // 保持不變
        usedQuota: newUsedQuota,
        remainingQuota: newRemainingQuota,
      });
      alert('額度已更新');
      setEditingQuota(null);
      loadQuotas();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      alert(err.response?.data?.error || '更新失敗');
    }
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">額度查詢設定</h3>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto" style={{ maxHeight: 'calc(100vh - 250px)' }}>
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gradient-to-r from-gray-50 to-gray-100 sticky top-0 z-20 shadow-sm">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider sticky left-0 bg-gradient-to-r from-gray-50 to-gray-100 z-30 border-r border-gray-200">
                  名稱
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  回饋組成
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  計算方式
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider min-w-[140px]">
                  額度狀態
                  <div className="text-[10px] font-normal text-gray-500 mt-1">
                    已用/剩餘/上限
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider min-w-[120px]">
                  消費資訊
                  <div className="text-[10px] font-normal text-gray-500 mt-1">
                    消費/參考餘額
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  刷新時間
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {quotas.map((quota, quotaIndex) => {
                // 處理 rewardIds：如果為空但 rewardComposition 有值，則使用 rewardComposition 的長度
                let validRewardIndices: number[] = [];
                
                if (quota.rewardIds && quota.rewardIds.length > 0) {
                  // 如果有 rewardIds，允許空字串（用於只有 own_reward_percentage 的支付方式）
                  quota.rewardIds.forEach((_id, index) => {
                    validRewardIndices.push(index);
                  });
                } else if (quota.rewardComposition && quota.rewardComposition.trim() !== '') {
                  // 如果沒有 rewardIds 但有 rewardComposition，根據 rewardComposition 創建索引
                  const count = quota.rewardComposition.split('/').length;
                  validRewardIndices = Array.from({ length: count }, (_, i) => i);
                } else {
                  // 完全沒有資料，顯示一行空資料
                  validRewardIndices = [0];
                }
                
                const rewardCount = validRewardIndices.length;
                // 使用更明顯的顏色區別不同方案
                const bgColor = quotaIndex % 2 === 0 ? 'bg-white' : 'bg-blue-50';
                const borderColor = quotaIndex % 2 === 0 ? 'border-gray-200' : 'border-blue-200';
                
                return validRewardIndices.map((originalIndex, displayIndex) => {
                  const isFirstRow = displayIndex === 0;
                  const rewardPercentage = quota.rewardComposition?.split('/')[originalIndex]?.replace('%', '') || '';
                  const calculationMethod = quota.calculationMethods?.[originalIndex] || 'round';
                  const calculationMethodText = 
                    calculationMethod === 'round' ? '四捨五入' :
                    calculationMethod === 'floor' ? '無條件捨去' :
                    calculationMethod === 'ceil' ? '無條件進位' : '四捨五入';
                  
                  const usedQuota = quota.usedQuotas?.[originalIndex] || 0;
                  const remainingQuota = quota.remainingQuotas?.[originalIndex] ?? null;
                  const quotaLimit = quota.quotaLimits?.[originalIndex] ?? null;
                  const currentAmount = quota.currentAmounts?.[originalIndex] || 0;
                  const referenceAmount = quota.referenceAmounts?.[originalIndex] ?? null;
                  const isEditing = editingQuota?.quotaIndex === quotaIndex && editingQuota?.rewardIndex === originalIndex;
                  
                  return (
                    <tr key={`${quotaIndex}-${originalIndex}`} className={`${bgColor} ${borderColor} border-l-4 hover:bg-blue-100 transition-colors`}>
                      {isFirstRow && (
                        <td
                          className={`px-4 py-3 text-sm font-medium sticky left-0 ${bgColor} z-10 border-r border-gray-200`}
                          rowSpan={rewardCount}
                        >
                          <div className="font-semibold text-gray-900">{quota.name}</div>
                        </td>
                      )}
                      <td className="px-4 py-3 text-sm">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                          {rewardPercentage || '-'}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {calculationMethodText}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {formatQuotaInfo(
                          usedQuota,
                          remainingQuota,
                          quotaLimit,
                          isEditing,
                          editForm.usedQuotaAdjustment,
                          (value) => setEditForm({ ...editForm, usedQuotaAdjustment: value })
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {formatConsumptionInfo(currentAmount, referenceAmount)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        <div className="text-xs">
                          {quota.refreshTimes?.[originalIndex] || '-'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {isEditing ? (
                          <div className="flex gap-1">
                            <button
                              onClick={handleSave}
                              className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 transition-colors"
                            >
                              儲存
                            </button>
                            <button
                              onClick={() => setEditingQuota(null)}
                              className="px-2 py-1 bg-gray-500 text-white rounded text-xs hover:bg-gray-600 transition-colors"
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleEdit(quotaIndex, originalIndex)}
                            className="px-2 py-1 bg-yellow-500 text-white rounded text-xs hover:bg-yellow-600 transition-colors"
                          >
                            編輯
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// 應用程式設定組件
function AppSettings({ appModeEnabled, onToggle }: { appModeEnabled: boolean; onToggle: (enabled: boolean) => void }) {
  const [manualOverride, setManualOverride] = useState<string | null>(null);

  useEffect(() => {
    // 檢查是否有手動設置
    const appMode = localStorage.getItem('appMode');
    setManualOverride(appMode);
  }, []);

  const handleToggle = () => {
    if (manualOverride === null) {
      // 當前是自動模式，切換為手動開啟
      if (window.confirm('確定要手動開啟 App 模式嗎？這將覆蓋自動檢測。頁面將重新載入。')) {
        setAppMode(true);
      }
    } else if (manualOverride === 'true') {
      // 當前是手動開啟，切換為手動關閉
      if (window.confirm('確定要手動關閉 App 模式嗎？頁面將重新載入。')) {
        setAppMode(false);
      }
    } else {
      // 當前是手動關閉，恢復自動檢測
      if (window.confirm('確定要恢復自動檢測嗎？頁面將重新載入。')) {
        setAppMode(null);
      }
    }
  };

  const handleReset = () => {
    if (window.confirm('確定要恢復自動檢測嗎？頁面將重新載入。')) {
      setAppMode(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">App 模式設定</h3>
        
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-blue-800">
              <strong>自動檢測：</strong>系統會自動偵測您的設備類型（移動設備或桌面設備），並自動切換到最適合的導航模式。
            </p>
            <p className="text-sm text-blue-700 mt-2">
              當前模式：<strong>{appModeEnabled ? 'App 模式（底部導航）' : '桌面模式（頂部導航）'}</strong>
            </p>
            {manualOverride && (
              <p className="text-sm text-orange-700 mt-2">
                <strong>手動設置：</strong>已覆蓋自動檢測
              </p>
            )}
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex-1">
              <h4 className="font-medium text-gray-900">
                {manualOverride === null ? '手動設置' : manualOverride === 'true' ? '手動開啟（已覆蓋）' : '手動關閉（已覆蓋）'}
              </h4>
              <p className="text-sm text-gray-500 mt-1">
                {manualOverride === null 
                  ? '點擊切換可手動覆蓋自動檢測結果'
                  : '點擊切換可更改手動設置，或點擊「恢復自動」恢復自動檢測'}
              </p>
            </div>
            <div className="flex items-center gap-2 ml-4">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={appModeEnabled}
                  onChange={handleToggle}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
              {manualOverride && (
                <button
                  onClick={handleReset}
                  className="px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
                >
                  恢復自動
                </button>
              )}
            </div>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm text-green-800">
              <strong>自動檢測規則：</strong>
            </p>
            <ul className="text-sm text-green-700 mt-2 list-disc list-inside space-y-1">
              <li>移動設備（手機、平板）：自動使用底部導航</li>
              <li>桌面設備（PC、筆電）：自動使用頂部導航</li>
              <li>檢測方式：User Agent、觸控支持、屏幕尺寸</li>
            </ul>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-800">
              <strong>注意：</strong>手動切換模式後，頁面會自動重新載入以應用更改。手動設置會覆蓋自動檢測。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
