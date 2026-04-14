import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { getStoreById } from '../data/stores';
import { useInventory } from '../hooks/useFirestore';

export default function Inventory() {
  const { storeId } = useParams();
  const store = getStoreById(storeId);
  const { items, loading, addItem, updateItem, removeItem } = useInventory(storeId);
  const [newName, setNewName] = useState('');
  const [checkedIds, setCheckedIds] = useState(new Set());

  if (!store) return <p>지점을 찾을 수 없습니다.</p>;

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    await addItem({ name });
    setNewName('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleAdd();
  };

  const toggleCheck = (id) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleNumberChange = async (id, field, value) => {
    const num = Math.max(0, parseInt(value) || 0);
    if (field === 'stock') {
      const item = items.find((i) => i.id === id);
      const prev = item?.stock ?? 0;
      if (num < prev) {
        const diff = prev - num;
        await updateItem(id, { stock: num, opened: (item?.opened ?? 0) + diff });
        return;
      }
    }
    await updateItem(id, { [field]: num });
  };

  const handleRemove = async (id) => {
    if (!window.confirm('이 항목을 삭제하시겠습니까?')) return;
    await removeItem(id);
    setCheckedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  return (
    <div className="inventory-page">
      <div className="page-header">
        <h2>재고조사</h2>
      </div>

      <div className="inventory-add-row">
        <input
          type="text"
          className="inventory-add-input"
          placeholder="항목 이름 (예: 간식, 음료, 종이컵...)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button className="btn-primary" onClick={handleAdd}>추가</button>
      </div>

      {loading ? (
        <p className="loading">불러오는 중...</p>
      ) : items.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: 32 }}>
          항목을 추가해주세요.
        </p>
      ) : (
        <div className="inventory-list">
          {items.map((item) => {
            const checked = checkedIds.has(item.id);
            return (
              <div key={item.id} className={`inventory-item${checked ? ' editing' : ''}`}>
                <input
                  type="checkbox"
                  className="inventory-checkbox"
                  checked={checked}
                  onChange={() => toggleCheck(item.id)}
                />
                <span className="inventory-name">{item.name}</span>
                <div className="inventory-counts">
                  <label className="inventory-count-label">
                    <span>재고</span>
                    {checked ? (
                      <input
                        type="number"
                        className="inventory-count-input"
                        value={item.stock ?? 0}
                        min="0"
                        onChange={(e) => handleNumberChange(item.id, 'stock', e.target.value)}
                      />
                    ) : (
                      <span className="inventory-count-value">{item.stock ?? 0}</span>
                    )}
                  </label>
                  <label className="inventory-count-label">
                    <span>개봉</span>
                    {checked ? (
                      <input
                        type="number"
                        className="inventory-count-input"
                        value={item.opened ?? 0}
                        min="0"
                        onChange={(e) => handleNumberChange(item.id, 'opened', e.target.value)}
                      />
                    ) : (
                      <span className="inventory-count-value">{item.opened ?? 0}</span>
                    )}
                  </label>
                </div>
                {checked && (
                  <button className="inventory-delete-btn" onClick={() => handleRemove(item.id)}>
                    삭제
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
