// path: main/frontend/src/pages/settings/ChannelManagement.tsx
import { useState, useEffect, FormEvent } from 'react';
import api from '../../utils/api';

export default function ChannelManagement() {
  const [channels, setChannels] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingChannel, setEditingChannel] = useState<any>(null);

  useEffect(() => { loadChannels(); }, []);

  const loadChannels = async () => {
    const res = await api.get('/channels?commonOnly=true');
    setChannels(res.data.data);
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
        <button onClick={() => { setEditingChannel(null); setShowForm(true); }} className="px-3 py-1 bg-blue-600 text-white rounded text-sm">新增通路</button>
      </div>

      {showForm && (
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

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {channels.map(ch => (
          <div key={ch.id} className="p-2 border rounded flex justify-between items-center bg-white">
            <span>{ch.name}</span>
            <div className="flex gap-1">
              <button onClick={() => { setEditingChannel(ch); setShowForm(true); }} className="text-yellow-600 text-xs">編輯</button>
              <button onClick={() => handleDelete(ch.id)} className="text-red-600 text-xs">刪除</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}