import { useState, useEffect, useRef, FormEvent } from 'react';
import api from '../../utils/api';

function linkify(text: string): string {
  if (!text) return '';
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
  return text.replace(urlRegex, (url) => {
    const href = url.startsWith('http') ? url : `https://${url}`;
    const escapedUrl = url.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-800 underline break-all">${escapedUrl}</a>`;
  });
}

interface Card {
  id: string;
  name: string;
  note?: string;
  display_order: number;
}

interface Scheme {
  id: string;
  name: string;
  note?: string;
  requires_switch: boolean;
  activity_start_date?: string;
  activity_end_date?: string;
  display_order?: number;
  shared_reward_group_id?: string;
  shared_reward_group_name?: string;
}

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
      quota_calculation_basis?: string;
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
      setSchemeDetails(res.data.data);
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
          {scheme.shared_reward_group_id && (
            <div className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded mt-1 inline-block">
              🔗 共用回饋：{scheme.shared_reward_group_name || '載入中...'}
            </div>
          )}
        </div>
        <div className="flex gap-1 flex-shrink-0 flex-wrap">
          <button onClick={onExpand} className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 whitespace-nowrap">
            {isExpanded ? '收起' : '展開'}
          </button>
          <button onClick={onEdit} className="px-2 py-1 bg-yellow-500 text-white rounded text-xs hover:bg-yellow-600">
            編輯
          </button>
          <button onClick={onDelete} className="px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600">
            刪除
          </button>
        </div>
      </div>

      {isExpanded && schemeDetails && (
        <div className="mt-2 pt-2 border-t space-y-4">
          <div>
            <span className="text-xs font-medium">通路設定</span>
            <div className="text-xs space-y-1 mt-1">
              <div>
                <span className="font-medium">適用：</span>
                {schemeDetails.applications.length > 0 ? (
                  schemeDetails.applications.map((app, idx) => (
                    <span key={idx}>
                      {app.name}{app.note && ` (${app.note})`}
                      {idx < schemeDetails.applications.length - 1 && ', '}
                    </span>
                  ))
                ) : <span className="text-gray-500">無</span>}
              </div>
              <div>
                <span className="font-medium">排除：</span>
                {schemeDetails.exclusions.length > 0 ? (
                  schemeDetails.exclusions.map((exc, idx) => (
                    <span key={idx}>
                      {exc.name}{exc.note && ` (${exc.note})`}
                      {idx < schemeDetails.exclusions.length - 1 && ', '}
                    </span>
                  ))
                ) : <span className="text-gray-500">無</span>}
              </div>
            </div>
          </div>

          <div>
            <span className="text-xs font-medium">回饋組成</span>
            {schemeDetails.rewards.length > 0 ? (
              <div className="mt-2 overflow-x-auto rounded border border-gray-200">
                <table className="min-w-full text-xs text-gray-700">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-1 text-left font-semibold text-gray-600 whitespace-nowrap">回饋 %</th>
                      <th className="px-2 py-1 text-left font-semibold text-gray-600 whitespace-nowrap">方式</th>
                      <th className="px-2 py-1 text-left font-semibold text-gray-600 whitespace-nowrap">基準</th>
                      <th className="px-2 py-1 text-left font-semibold text-gray-600 whitespace-nowrap">上限</th>
                      <th className="px-2 py-1 text-left font-semibold text-gray-600 whitespace-nowrap">刷新</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schemeDetails.rewards.map((reward, idx) => {
                      const methodMap: Record<string, string> = { round: '四捨五入', floor: '無條件捨去', ceil: '無條件進位' };
                      const basisMap: Record<string, string> = { transaction: '單筆', statement: '帳單總額' };
                      let refreshText = '無';
                      if (reward.quota_refresh_type === 'monthly' && reward.quota_refresh_value) {
                        refreshText = `每月 ${reward.quota_refresh_value} 日`;
                      } else if (reward.quota_refresh_type === 'date' && reward.quota_refresh_date) {
                        refreshText = `指定 ${reward.quota_refresh_date.split('T')[0]}`;
                      } else if (reward.quota_refresh_type === 'activity') {
                        refreshText = '活動結束';
                      }
                      
                      return (
                        <tr key={reward.id || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-2 py-1">{reward.reward_percentage}%</td>
                          <td className="px-2 py-1">{methodMap[reward.calculation_method] || reward.calculation_method}</td>
                          <td className="px-2 py-1">{basisMap[reward.quota_calculation_basis || 'transaction']}</td>
                          <td className="px-2 py-1">{reward.quota_limit ?? '無上限'}</td>
                          <td className="px-2 py-1">{refreshText}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : <div className="text-xs text-gray-500 mt-1">無回饋組成</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function CardItem({ card, onEdit, onDelete, onReload }: { card: Card; onEdit: () => void; onDelete: () => void; onReload: () => void; }) {
  const [showSchemes, setShowSchemes] = useState(false);
  const [schemes, setSchemes] = useState<Scheme[]>([]);
  const [showSchemeForm, setShowSchemeForm] = useState(false);
  const [editingScheme, setEditingScheme] = useState<Scheme | null>(null);
  const [expandedSchemeId, setExpandedSchemeId] = useState<string | null>(null);
  const [isReorderingSchemes, setIsReorderingSchemes] = useState(false);
  const [reorderedSchemes, setReorderedSchemes] = useState<Scheme[]>([]);
  const itemRef = useRef<HTMLDivElement | null>(null);

  const [appsText, setAppsText] = useState('');
  const [excsText, setExcsText] = useState('');
  const [schemeForm, setSchemeForm] = useState({
    name: '', note: '', requiresSwitch: false,
    activityStartDate: '', activityEndDate: '', displayOrder: 0,
  });

  // ESC / 點擊空白收合或取消編輯
  useEffect(() => {
    const shouldCancelEdit = () => {
      const hasUnsaved = !!(appsText || excsText || schemeForm.name || schemeForm.note || schemeForm.activityStartDate || schemeForm.activityEndDate);
      return !hasUnsaved || confirm('確定要取消編輯嗎？未儲存的變更將遺失。');
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showSchemeForm || editingScheme) {
          if (!shouldCancelEdit()) return;
          setShowSchemeForm(false);
          setEditingScheme(null);
          setAppsText('');
          setExcsText('');
        } else if (expandedSchemeId) {
          setExpandedSchemeId(null);
        } else if (showSchemes) {
          setShowSchemes(false);
        }
      }
    };
    const onClickOutside = (e: MouseEvent) => {
      if (itemRef.current && !itemRef.current.contains(e.target as Node)) {
        if (showSchemeForm || editingScheme) {
          if (!shouldCancelEdit()) return;
          setShowSchemeForm(false);
          setEditingScheme(null);
          setAppsText('');
          setExcsText('');
        } else if (expandedSchemeId) {
          setExpandedSchemeId(null);
        } else if (showSchemes) {
          setShowSchemes(false);
        }
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [showSchemeForm, editingScheme, expandedSchemeId, showSchemes, appsText, excsText, schemeForm]);

  // ESC / 點擊空白收合或取消編輯
  useEffect(() => {
    const shouldCancelEdit = () => {
      const hasUnsaved = !!(appsText || excsText || schemeForm.name || schemeForm.note || schemeForm.activityStartDate || schemeForm.activityEndDate);
      return !hasUnsaved || confirm('確定要取消編輯嗎？未儲存的變更將遺失。');
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showSchemeForm || editingScheme) {
          if (!shouldCancelEdit()) return;
          setShowSchemeForm(false);
          setEditingScheme(null);
          setAppsText('');
          setExcsText('');
        } else if (expandedSchemeId) {
          setExpandedSchemeId(null);
        } else if (showSchemes) {
          setShowSchemes(false);
        }
      }
    };
    const onClickOutside = (e: MouseEvent) => {
      if (itemRef.current && !itemRef.current.contains(e.target as Node)) {
        if (showSchemeForm || editingScheme) {
          if (!shouldCancelEdit()) return;
          setShowSchemeForm(false);
          setEditingScheme(null);
          setAppsText('');
          setExcsText('');
        } else if (expandedSchemeId) {
          setExpandedSchemeId(null);
        } else if (showSchemes) {
          setShowSchemes(false);
        }
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [showSchemeForm, editingScheme, expandedSchemeId, showSchemes, appsText, excsText, schemeForm]);

  const loadSchemes = async () => {
    try {
      const res = await api.get(`/schemes/card/${card.id}`);
      const data = res.data.data;
      const nameMap = new Map();
      data.forEach((s: any) => nameMap.set(s.id, s.name));
      const enriched = data.map((s: any) => ({
        ...s,
        shared_reward_group_name: s.shared_reward_group_id ? nameMap.get(s.shared_reward_group_id) || '（來源已移除）' : undefined
      }));
      setSchemes(enriched);
    } catch (error) { console.error('載入方案錯誤:', error); }
  };

  const channelCache = useRef<Map<string, string>>(new Map());
  const resolveChannels = async (names: string[]) => {
    const pending = names.filter(n => !channelCache.current.has(n.toLowerCase()));
    if (pending.length > 0) {
      try {
        const res = await api.post('/channels/batch-resolve', { items: pending.map(name => ({ name })), createIfMissing: true });
        res.data.data.forEach((item: any) => {
          if (item.inputName && item.channelId) channelCache.current.set(item.inputName.toLowerCase(), item.channelId);
        });
      } catch (e) { console.error('解析通路失敗', e); }
    }
  };

  const handleSchemeSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const appLines = appsText.split('\n').map(l => l.trim()).filter(l => l);
      const appEntries = appLines.map(line => {
        const match = line.match(/^(.+?)\s*\((.+?)\)$/);
        return match ? { name: match[1].trim(), note: match[2].trim() } : { name: line, note: '' };
      });
      const excLines = excsText.split('\n').map(l => l.trim()).filter(l => l);
      // 解析排除通路的括號（支援備註）
      const excEntries = excLines.map(line => {
        const match = line.match(/^(.+?)\s*\((.+?)\)$/);
        return match ? { name: match[1].trim(), note: match[2].trim() } : { name: line, note: '' };
      });
      
      await resolveChannels([...appEntries.map(a => a.name), ...excEntries.map(e => e.name)]);
      
      const applications = appEntries.map(a => ({ 
        channelId: channelCache.current.get(a.name.toLowerCase()), 
        note: a.note 
      })).filter(a => a.channelId);
      
      const exclusions = excEntries.map(entry => ({
        channelId: channelCache.current.get(entry.name.toLowerCase()),
        note: entry.note
      })).filter(e => e.channelId);

      if (editingScheme) {
        await api.put(`/schemes/${editingScheme.id}/batch`, {
          ...schemeForm,
          applications,
          exclusions
        });
        alert('方案已更新');
      } else {
        const createRes = await api.post('/schemes', { cardId: card.id, ...schemeForm });
        const newId = createRes.data.data.id;
        if (newId) {
          await api.put(`/schemes/${newId}/channels`, { applications, exclusions });
        }
        alert('方案已新增');
      }
      setShowSchemeForm(false);
      setEditingScheme(null);
      loadSchemes();
    } catch (error: any) {
      alert(error.response?.data?.error || '操作失敗');
    }
  };

  const handleNewScheme = () => {
    setEditingScheme(null);
    setSchemeForm({
      name: '', note: '', requiresSwitch: false,
      activityStartDate: '', activityEndDate: '', displayOrder: 0,
      // 共同綁定由額度管理控制，表單不再設置
    });
    setAppsText(''); setExcsText('');
    setShowSchemeForm(true);
  };

  const handleEditScheme = async (scheme: Scheme) => {
    setEditingScheme(scheme);
    setSchemeForm({
      name: scheme.name, note: scheme.note || '', requiresSwitch: scheme.requires_switch,
      activityStartDate: scheme.activity_start_date ? String(scheme.activity_start_date).split('T')[0] : '',
      activityEndDate: scheme.activity_end_date ? String(scheme.activity_end_date).split('T')[0] : '',
      displayOrder: scheme.display_order || 0,
      // 共同綁定由額度管理控制，表單不再設置
    });
    try {
      const res = await api.get(`/schemes/${scheme.id}/details`);
      const { applications, exclusions } = res.data.data;
      setAppsText(applications.map((a: any) => a.note ? `${a.name} (${a.note})` : a.name).join('\n'));
      setExcsText(exclusions.map((e: any) => e.note ? `${e.name} (${e.note})` : e.name).join('\n'));
    } catch (e) { console.error(e); }
    setShowSchemeForm(true);
  };

  const handleSchemeDelete = async (id: string) => {
    if (confirm('確定刪除此方案？')) {
      try {
        await api.delete(`/schemes/${id}`);
        loadSchemes();
      } catch (e: any) { alert(e.response?.data?.error || '刪除失敗'); }
    }
  };

  const saveOrder = async () => {
    try {
      const orders = reorderedSchemes.map((s, i) => ({ id: s.id, displayOrder: i }));
      await api.put(`/schemes/card/${card.id}/order`, { orders });
      setIsReorderingSchemes(false);
      loadSchemes();
    } catch (e) { alert('排序更新失敗'); }
  };

  const moveScheme = (index: number, direction: 'up' | 'down' | 'top' | 'bottom') => {
    const newArr = [...reorderedSchemes];
    const item = newArr[index];
    newArr.splice(index, 1);
    if (direction === 'top') {
      newArr.unshift(item);
    } else if (direction === 'bottom') {
      newArr.push(item);
    } else {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
      newArr.splice(Math.max(0, Math.min(targetIndex, newArr.length)), 0, item);
    }
      setReorderedSchemes(newArr);
  };

  return (
    <div className="p-3 bg-gray-50 rounded border" ref={itemRef}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="font-medium">{card.name}</div>
          {card.note && <div className="text-sm text-gray-600 mt-1" dangerouslySetInnerHTML={{ __html: linkify(card.note) }} />}
        </div>
        <div className="flex gap-2 flex-wrap">
          <button 
            onClick={(e) => { 
              e.preventDefault();
              e.stopPropagation(); 
              setShowSchemes(!showSchemes); 
              if (!showSchemes) loadSchemes(); 
            }} 
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
          >
            {showSchemes ? '隱藏方案' : '管理方案'}
          </button>
          <button onClick={onEdit} className="px-3 py-1 bg-yellow-500 text-white rounded text-sm hover:bg-yellow-600">編輯</button>
          <button onClick={onDelete} className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600">刪除</button>
        </div>
      </div>

      {showSchemes && (
        <div className="mt-2 pt-2 border-t">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium">方案列表</span>
            <div className="flex gap-2">
              <button onClick={() => {
                if (isReorderingSchemes) saveOrder();
                else { setIsReorderingSchemes(true); setReorderedSchemes([...schemes]); }
              }} className={`px-2 py-1 rounded text-xs text-white ${isReorderingSchemes ? 'bg-green-500' : 'bg-gray-500'}`}>
                {isReorderingSchemes ? '儲存排序' : '調整排序'}
              </button>
              {isReorderingSchemes ? (
                <button onClick={() => setIsReorderingSchemes(false)} className="px-2 py-1 bg-red-500 text-white rounded text-xs">取消</button>
              ) : (
                <button onClick={handleNewScheme} className="px-2 py-1 bg-green-500 text-white rounded text-xs">新增方案</button>
              )}
            </div>
          </div>

          <div className="space-y-3">
            {(isReorderingSchemes ? reorderedSchemes : schemes).map((s, idx) => (
              <div key={s.id} className="space-y-2">
                <div className="flex gap-2 items-start flex-wrap">
                <div className="flex-1">
                  <SchemeDetailManager 
                    scheme={s} 
                    isExpanded={expandedSchemeId === s.id}
                    onExpand={() => {
                      if (isReorderingSchemes) return;
                      if (showSchemeForm || editingScheme) {
                        const hasUnsaved = !!(appsText || excsText || schemeForm.name || schemeForm.note || schemeForm.activityStartDate || schemeForm.activityEndDate);
                        if (hasUnsaved && !confirm('確定要取消編輯嗎？未儲存的變更將遺失。')) return;
                        setShowSchemeForm(false);
                        setEditingScheme(null);
                        setAppsText('');
                        setExcsText('');
                      }
                      setExpandedSchemeId(expandedSchemeId === s.id ? null : s.id);
                    }}
                    onEdit={() => !isReorderingSchemes && handleEditScheme(s)}
                    onDelete={() => !isReorderingSchemes && handleSchemeDelete(s.id)}
                  />
                </div>
                {isReorderingSchemes && (
                  <div className="flex flex-col gap-1">
                      <button onClick={() => moveScheme(idx, 'top')} className="px-2 py-1 bg-gray-600 text-white rounded text-xs disabled:opacity-40" disabled={idx === 0}>⏫ 置頂</button>
                      <button onClick={() => moveScheme(idx, 'up')} className="px-2 py-1 bg-blue-600 text-white rounded text-xs disabled:opacity-40" disabled={idx === 0}>▲ 上移</button>
                      <button onClick={() => moveScheme(idx, 'down')} className="px-2 py-1 bg-blue-600 text-white rounded text-xs disabled:opacity-40" disabled={idx === (isReorderingSchemes ? reorderedSchemes.length - 1 : schemes.length - 1)}>▼ 下移</button>
                      <button onClick={() => moveScheme(idx, 'bottom')} className="px-2 py-1 bg-gray-600 text-white rounded text-xs disabled:opacity-40" disabled={idx === (isReorderingSchemes ? reorderedSchemes.length - 1 : schemes.length - 1)}>⏬ 置底</button>
                    </div>
                  )}
                </div>

                {!isReorderingSchemes && editingScheme?.id === s.id && showSchemeForm && (
                  <div className="p-3 bg-white rounded border shadow-sm">
                    <form onSubmit={handleSchemeSubmit} className="space-y-3">
                      <input 
                        placeholder="方案名稱" 
                        value={schemeForm.name} 
                        onChange={e => setSchemeForm({...schemeForm, name: e.target.value})} 
                        className="w-full border p-1 rounded text-sm" required 
                      />
                      <input 
                        placeholder="備註" 
                        value={schemeForm.note} 
                        onChange={e => setSchemeForm({...schemeForm, note: e.target.value})} 
                        className="w-full border p-1 rounded text-sm" 
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input type="date" value={schemeForm.activityStartDate} onChange={e => setSchemeForm({...schemeForm, activityStartDate: e.target.value})} onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()} className="border p-1 rounded text-sm" />
                        <input type="date" value={schemeForm.activityEndDate} onChange={e => setSchemeForm({...schemeForm, activityEndDate: e.target.value})} onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()} className="border p-1 rounded text-sm" />
                      </div>
                      <textarea placeholder="適用通路 (每行一個)" value={appsText} onChange={e => setAppsText(e.target.value)} className="w-full border p-1 rounded text-sm" rows={3} />
                      <textarea placeholder="排除通路 (每行一個)" value={excsText} onChange={e => setExcsText(e.target.value)} className="w-full border p-1 rounded text-sm" rows={3} />
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={schemeForm.requiresSwitch} onChange={e => setSchemeForm({...schemeForm, requiresSwitch: e.target.checked})} />
                        需切換
                      </label>
                      <div className="flex gap-2">
                        <button type="submit" className="px-3 py-1 bg-blue-600 text-white rounded text-xs">儲存</button>
                        <button type="button" onClick={() => { setShowSchemeForm(false); setEditingScheme(null); }} className="px-3 py-1 bg-gray-400 text-white rounded text-xs">取消</button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            ))}

            {/* 新增方案：放在列表末尾，保持上下文位置 */}
            {!isReorderingSchemes && !editingScheme && showSchemeForm && (
              <div className="p-3 bg-white rounded border shadow-sm">
                <h4 className="font-medium mb-2">新增方案</h4>
                <form onSubmit={handleSchemeSubmit} className="space-y-3">
                  <input 
                    placeholder="方案名稱" 
                    value={schemeForm.name} 
                    onChange={e => setSchemeForm({...schemeForm, name: e.target.value})} 
                    className="w-full border p-1 rounded text-sm" required 
                  />
                  <input 
                    placeholder="備註" 
                    value={schemeForm.note} 
                    onChange={e => setSchemeForm({...schemeForm, note: e.target.value})} 
                    className="w-full border p-1 rounded text-sm" 
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input type="date" value={schemeForm.activityStartDate} onChange={e => setSchemeForm({...schemeForm, activityStartDate: e.target.value})} onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()} className="border p-1 rounded text-sm" />
                    <input type="date" value={schemeForm.activityEndDate} onChange={e => setSchemeForm({...schemeForm, activityEndDate: e.target.value})} onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()} className="border p-1 rounded text-sm" />
                  </div>
                  <textarea placeholder="適用通路 (每行一個)" value={appsText} onChange={e => setAppsText(e.target.value)} className="w-full border p-1 rounded text-sm" rows={3} />
                  <textarea placeholder="排除通路 (每行一個)" value={excsText} onChange={e => setExcsText(e.target.value)} className="w-full border p-1 rounded text-sm" rows={3} />
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={schemeForm.requiresSwitch} onChange={e => setSchemeForm({...schemeForm, requiresSwitch: e.target.checked})} />
                    需切換
                  </label>
                  <div className="flex gap-2">
                    <button type="submit" className="px-3 py-1 bg-blue-500 text-white rounded text-xs">儲存</button>
                    <button type="button" onClick={() => setShowSchemeForm(false)} className="px-3 py-1 bg-gray-500 text-white rounded text-xs">取消</button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CardManagement() {
  const [cards, setCards] = useState<Card[]>([]);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [showCardForm, setShowCardForm] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const [reorderedCards, setReorderedCards] = useState<Card[]>([]);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { loadCards(); }, []);
  // ESC / 點擊空白收合編輯
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingCard || showCardForm) {
          setEditingCard(null);
          setShowCardForm(false);
        }
      }
    };
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        if (editingCard || showCardForm) {
          setEditingCard(null);
          setShowCardForm(false);
        }
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [editingCard, showCardForm]);

  const loadCards = async () => {
    try {
      const res = await api.get('/cards');
      setCards(res.data.data);
    } catch (e) { console.error(e); }
  };

  const handleCardSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const data = {
      name: (form.elements.namedItem('name') as HTMLInputElement).value,
      note: (form.elements.namedItem('note') as HTMLInputElement).value,
      displayOrder: editingCard ? editingCard.display_order : (cards.length > 0 ? Math.max(...cards.map(c => c.display_order)) + 1 : 0)
    };

    try {
      if (editingCard) await api.put(`/cards/${editingCard.id}`, data);
      else await api.post('/cards', data);
      setShowCardForm(false);
      setEditingCard(null);
      loadCards();
    } catch (e: any) { alert(e.response?.data?.error || '操作失敗'); }
  };

  const handleDeleteCard = async (id: string) => {
    if (confirm('確定刪除此卡片？將連同刪除所有方案！')) {
      try {
        await api.delete(`/cards/${id}`);
        loadCards();
      } catch (e: any) { alert(e.response?.data?.error || '刪除失敗'); }
    }
  };

  const handleOrderSave = async () => {
    try {
      const orders = reorderedCards.map((c, i) => ({ id: c.id, displayOrder: i }));
      await api.put('/settings/cards/order', { orders });
      setIsReordering(false);
      loadCards();
    } catch (e) { alert('排序更新失敗'); }
  };

  const moveCard = (index: number, direction: 'up' | 'down' | 'top' | 'bottom') => {
    const newArr = [...reorderedCards];
    const item = newArr[index];
    newArr.splice(index, 1);
    if (direction === 'top') newArr.unshift(item);
    else if (direction === 'bottom') newArr.push(item);
    else {
    const target = direction === 'up' ? index - 1 : index + 1;
      newArr.splice(Math.max(0, Math.min(target, newArr.length)), 0, item);
    }
      setReorderedCards(newArr);
  };

  // ESC / 點擊空白 收合/取消卡片編輯
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingCard || showCardForm) {
          setEditingCard(null);
          setShowCardForm(false);
        }
    }
  };
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        if (editingCard || showCardForm) {
          setEditingCard(null);
          setShowCardForm(false);
        }
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [editingCard, showCardForm]);

  return (
    <div className="space-y-4" ref={rootRef}>
      <div className="flex justify-between items-center">
        <h4 className="font-medium">卡片列表</h4>
        <div className="flex gap-2">
          <button 
            onClick={() => { if (isReordering) handleOrderSave(); else { setIsReordering(true); setReorderedCards([...cards]); } }}
            className={`px-3 py-1 rounded text-sm text-white ${isReordering ? 'bg-green-500' : 'bg-gray-500'}`}
          >
            {isReordering ? '儲存順序' : '調整順序'}
          </button>
          {isReordering ? (
            <button onClick={() => setIsReordering(false)} className="px-3 py-1 bg-red-500 text-white rounded text-sm">取消</button>
          ) : (
            <button onClick={() => { setEditingCard(null); setShowCardForm(true); }} className="px-3 py-1 bg-blue-600 text-white rounded text-sm">新增卡片</button>
          )}
        </div>
      </div>

      {/* 新增卡片表單：僅在非編輯狀態時顯示 */}
      {showCardForm && !editingCard && (
        <div className="p-4 bg-gray-50 rounded border mb-4">
          <form onSubmit={handleCardSubmit} className="space-y-3">
            <input name="name" defaultValue={editingCard?.name} placeholder="卡片名稱" required className="w-full border p-2 rounded" />
            <input name="note" defaultValue={editingCard?.note} placeholder="備註" className="w-full border p-2 rounded" />
            <div className="flex gap-2">
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">{editingCard ? '更新' : '新增'}</button>
              <button type="button" onClick={() => setShowCardForm(false)} className="px-4 py-2 bg-gray-300 rounded">取消</button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-2">
        {(isReordering ? reorderedCards : cards).map((card, idx) => (
          <div key={card.id} className="space-y-2">
            {/* 卡片資訊與排序按鈕同一行 */}
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <CardItem 
                  card={card} 
                  onEdit={() => !isReordering && (setEditingCard(card), setShowCardForm(true))}
                  onDelete={() => !isReordering && handleDeleteCard(card.id)}
                  onReload={loadCards}
                />
              </div>
              {isReordering && (
                <div className="flex flex-col gap-1">
                  <button onClick={() => moveCard(idx, 'top')} className="px-2 py-1 bg-gray-600 text-white rounded text-xs disabled:opacity-40" disabled={idx === 0}>⏫ 置頂</button>
                  <button onClick={() => moveCard(idx, 'up')} className="px-2 py-1 bg-blue-600 text-white rounded text-xs disabled:opacity-40" disabled={idx === 0}>▲ 上移</button>
                  <button onClick={() => moveCard(idx, 'down')} className="px-2 py-1 bg-blue-600 text-white rounded text-xs disabled:opacity-40" disabled={idx === (isReordering ? reorderedCards.length - 1 : cards.length - 1)}>▼ 下移</button>
                  <button onClick={() => moveCard(idx, 'bottom')} className="px-2 py-1 bg-gray-600 text-white rounded text-xs disabled:opacity-40" disabled={idx === (isReordering ? reorderedCards.length - 1 : cards.length - 1)}>⏬ 置底</button>
                </div>
              )}
            </div>
            {/* 編輯表單向下延展 */}
            {!isReordering && editingCard?.id === card.id && showCardForm && (
              <div className="p-3 bg-gray-50 border rounded">
                <form onSubmit={handleCardSubmit} className="space-y-3">
                  <input name="name" defaultValue={editingCard?.name} placeholder="卡片名稱" required className="w-full border p-2 rounded text-sm" />
                  <input name="note" defaultValue={editingCard?.note} placeholder="備註" className="w-full border p-2 rounded text-sm" />
                  <div className="flex gap-2">
                    <button type="submit" className="px-3 py-1 bg-blue-600 text-white rounded text-xs">儲存</button>
                    <button type="button" onClick={() => { setShowCardForm(false); setEditingCard(null); }} className="px-3 py-1 bg-gray-400 text-white rounded text-xs">取消</button>
                  </div>
                </form>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}