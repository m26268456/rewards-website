// path: main/frontend/src/pages/settings/ChannelManagement.tsx
import { useState, useEffect, FormEvent } from 'react';
import api from '../../utils/api';

export default function ChannelManagement() {
  const [channels, setChannels] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingChannel, setEditingChannel] = useState<any>(null);
  const [isReordering, setIsReordering] = useState(false);
  const [reorderedChannels, setReorderedChannels] = useState<any[]>([]);

  useEffect(() => { loadChannels(); }, []);

  const loadChannels = async () => {
    const res = await api.get('/channels?commonOnly=true');
    setChannels(res.data.data);
  };

  const saveChannelOrder = async () => {
    try {
      await Promise.all(
        reorderedChannels.map((ch, idx) =>
          api.put(`/channels/${ch.id}`, { ...ch, displayOrder: idx, isCommon: true })
        )
      );
      setIsReordering(false);
      loadChannels();
    } catch (e) {
      alert('排序更新失敗');
    }
  };

  const moveChannel = (index: number, direction: 'up' | 'down' | 'top' | 'bottom') => {
    const newArr = [...reorderedChannels];
    const item = newArr[index];
    newArr.splice(index, 1);
    if (direction === 'top') newArr.unshift(item);
    else if (direction === 'bottom') newArr.push(item);
    else {
      const target = direction === 'up' ? index - 1 : index + 1;
      newArr.splice(Math.max(0, Math.min(target, newArr.length)), 0, item);
    }
    setReorderedChannels(newArr);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const data = {
      name: (form.elements.namedItem('name') as HTMLInputElement).value,
      isCommon: true,
      displayOrder: editingChannel ? editingChannel.display_order : 0
    };

    if (editingChannel) await api.put(`/channels/${editingChannel.id}`, data);
    else await api.post('/channels', data);

    setShowForm(false);
    setEditingChannel(null);
    loadChannels();
  };

  const handleDelete = async (id: string) => {
    if (confirm('確定刪除？')) {
      await api.delete(`/channels/${id}`);
      loadChannels();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="font-medium">常用通路列表</h4>
        <div className="flex gap-2">
          <button
            onClick={() => {
              if (isReordering) saveChannelOrder();
              else { setIsReordering(true); setReorderedChannels([...channels]); }
            }}
            className={`px-3 py-1 rounded text-sm text-white ${isReordering ? 'bg-green-500' : 'bg-gray-500'}`}
          >
            {isReordering ? '儲存順序' : '調整順序'}
          </button>
          {isReordering ? (
            <button onClick={() => setIsReordering(false)} className="px-3 py-1 bg-red-500 text-white rounded text-sm">取消</button>
          ) : (
            <button onClick={() => { setEditingChannel(null); setShowForm(true); }} className="px-3 py-1 bg-blue-600 text-white rounded text-sm">新增通路</button>
          )}
        </div>
      </div>

      {showForm && !editingChannel && (
        <div className="p-4 bg-gray-50 rounded border">
          <form onSubmit={handleSubmit} className="space-y-3">
            <input name="name" defaultValue={editingChannel?.name} placeholder="通路名稱" required className="w-full border p-2 rounded" />
            <div className="flex gap-2">
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">儲存</button>
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 bg-gray-300 rounded">取消</button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-2">
        {(isReordering ? reorderedChannels : channels).map((ch, idx) => (
          <div key={ch.id} className="p-3 border rounded bg-white space-y-2 shadow-sm">
            <div className="flex justify-between items-center">
              <span className="font-medium text-gray-800">{ch.name}</span>
              <div className="flex gap-1">
                {isReordering ? (
                  <div className="flex gap-1">
                    <button onClick={() => moveChannel(idx, 'top')} className="px-2 py-1 text-xs rounded bg-gray-600 text-white disabled:opacity-40" disabled={idx === 0}>⏫ 置頂</button>
                    <button onClick={() => moveChannel(idx, 'up')} className="px-2 py-1 text-xs rounded bg-blue-600 text-white disabled:opacity-40" disabled={idx === 0}>▲ 上移</button>
                    <button onClick={() => moveChannel(idx, 'down')} className="px-2 py-1 text-xs rounded bg-blue-600 text-white disabled:opacity-40" disabled={idx === (isReordering ? reorderedChannels.length - 1 : channels.length - 1)}>▼ 下移</button>
                    <button onClick={() => moveChannel(idx, 'bottom')} className="px-2 py-1 text-xs rounded bg-gray-600 text-white disabled:opacity-40" disabled={idx === (isReordering ? reorderedChannels.length - 1 : channels.length - 1)}>⏬ 置底</button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => { setEditingChannel(ch); setShowForm(true); }} className="px-2 py-1 bg-yellow-500 text-white rounded text-xs">編輯</button>
                    <button onClick={() => handleDelete(ch.id)} className="px-2 py-1 bg-red-500 text-white rounded text-xs">刪除</button>
                  </div>
                )}
              </div>
            </div>
            {!isReordering && editingChannel?.id === ch.id && showForm && (
              <div className="p-2 bg-gray-50 border rounded">
                <form onSubmit={handleSubmit} className="space-y-2">
                  <input name="name" defaultValue={editingChannel?.name} placeholder="通路名稱" required className="w-full border p-2 rounded text-sm" />
                  <div className="flex gap-2">
                    <button type="submit" className="px-3 py-1 bg-blue-600 text-white rounded text-xs">儲存</button>
                    <button type="button" onClick={() => { setShowForm(false); setEditingChannel(null); }} className="px-3 py-1 bg-gray-400 text-white rounded text-xs">取消</button>
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