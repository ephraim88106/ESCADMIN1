import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { getStoreById } from '../data/stores';
import { useOrders } from '../hooks/useFirestore';

function formatTime(ts) {
  const d = new Date(ts);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${month}/${day} ${h}:${m}`;
}

export default function Orders() {
  const { storeId } = useParams();
  const store = getStoreById(storeId);
  const { orders, loading, addOrder, updateOrder, removeOrder } = useOrders(storeId);
  const [newItem, setNewItem] = useState('');

  if (!store) return <p>지점을 찾을 수 없습니다.</p>;

  const pending = orders.filter((o) => o.status === 'pending');
  const completed = orders.filter((o) => o.status === 'completed');

  const handleAdd = async () => {
    const item = newItem.trim();
    if (!item) return;
    await addOrder({ item, author: '직접 입력', status: 'pending' });
    setNewItem('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleAdd();
  };

  const handleComplete = async (id) => {
    await updateOrder(id, { status: 'completed', completedAt: Date.now() });
  };

  const handleRevert = async (id) => {
    await updateOrder(id, { status: 'pending', completedAt: null });
  };

  const handleDelete = async (id) => {
    await removeOrder(id);
  };

  const handleClearCompleted = async () => {
    if (!window.confirm('완료된 주문을 모두 삭제하시겠습니까?')) return;
    for (const o of completed) {
      await removeOrder(o.id);
    }
  };

  return (
    <div className="orders-page">
      <div className="page-header">
        <h2>주문내역</h2>
      </div>

      <div className="orders-add-row">
        <input
          type="text"
          className="orders-add-input"
          placeholder="주문 항목 직접 추가..."
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button className="btn-primary" onClick={handleAdd}>추가</button>
      </div>

      {loading ? (
        <p className="loading">불러오는 중...</p>
      ) : pending.length === 0 && completed.length === 0 ? (
        <p className="empty-state">주문내역이 없습니다.</p>
      ) : (
        <>
          {pending.length > 0 && (
            <div className="orders-section">
              <div className="orders-section-title">
                📦 주문 필요 <span className="orders-count">{pending.length}건</span>
              </div>
              <div className="orders-list">
                {pending.map((o) => (
                  <div key={o.id} className="order-item pending">
                    <div className="order-item-info">
                      <span className="order-item-name">{o.item}</span>
                      <span className="order-item-meta">
                        {o.author} · {formatTime(o.createdAt)}
                      </span>
                    </div>
                    <div className="order-item-actions">
                      <button className="btn-sm btn-check" onClick={() => handleComplete(o.id)}>
                        완료
                      </button>
                      <button className="btn-sm btn-danger" onClick={() => handleDelete(o.id)}>
                        삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {completed.length > 0 && (
            <div className="orders-section">
              <div className="orders-section-title">
                ✅ 완료
                <button className="btn-sm btn-danger" style={{ marginLeft: 'auto' }} onClick={handleClearCompleted}>
                  전체 삭제
                </button>
              </div>
              <div className="orders-list">
                {completed.map((o) => (
                  <div key={o.id} className="order-item completed">
                    <div className="order-item-info">
                      <span className="order-item-name line-through">{o.item}</span>
                      <span className="order-item-meta">
                        {o.author} · {formatTime(o.createdAt)}
                        {o.completedAt && ` → ${formatTime(o.completedAt)}`}
                      </span>
                    </div>
                    <div className="order-item-actions">
                      <button className="btn-sm" onClick={() => handleRevert(o.id)}>
                        되돌리기
                      </button>
                      <button className="btn-sm btn-danger" onClick={() => handleDelete(o.id)}>
                        삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
