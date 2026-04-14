import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { getStoreById } from '../data/stores';
import { useTaskList } from '../hooks/useFirestore';

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function SeatSection({ storeId }) {
  const { tasks: seats, loading, addTask: addSeat, updateTask: updateSeat, removeTask: removeSeat } = useTaskList(storeId, 'seats');
  const [newSeat, setNewSeat] = useState('');

  const handleAdd = async () => {
    const text = newSeat.trim();
    if (!text) return;
    await addSeat({ text, memo: '' });
    setNewSeat('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleAdd();
  };

  const handleMemoChange = async (id, memo) => {
    await updateSeat(id, { memo });
  };

  const handleDateChange = async (id, date) => {
    await updateSeat(id, { date });
  };

  return (
    <div className="task-section">
      <div className="task-section-title">💺 지정석 목록</div>

      <div className="task-add-row">
        <input
          type="text"
          className="task-add-input"
          placeholder="좌석번호 (예: 12번, A3...)"
          value={newSeat}
          onChange={(e) => setNewSeat(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button className="btn-primary" onClick={handleAdd}>추가</button>
      </div>

      {loading ? (
        <p className="loading">불러오는 중...</p>
      ) : seats.length === 0 ? (
        <p className="empty-hint">지정석이 없습니다.</p>
      ) : (
        <div className="task-list">
          {seats.map((seat) => (
            <div key={seat.id} className="task-item">
              <span className="seat-number">{seat.text}</span>
              <input
                type="text"
                className="task-memo"
                placeholder="메모"
                value={seat.memo || ''}
                onChange={(e) => handleMemoChange(seat.id, e.target.value)}
              />
              <input
                type="date"
                className="task-date"
                value={seat.date || ''}
                onChange={(e) => handleDateChange(seat.id, e.target.value)}
              />
              <button className="task-delete" onClick={() => removeSeat(seat.id)}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TaskSection({ title, icon, storeId, type }) {
  const { tasks, loading, addTask, updateTask, removeTask } = useTaskList(storeId, type);
  const [newText, setNewText] = useState('');
  const isRegular = type === 'regular';

  const handleAdd = async () => {
    const text = newText.trim();
    if (!text) return;
    await addTask({ text, date: isRegular ? todayStr() : null });
    setNewText('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleAdd();
  };

  const handleToggle = async (id, checked) => {
    await updateTask(id, { checked: !checked });
  };

  const handleDateChange = async (id, date) => {
    await updateTask(id, { date });
  };

  const handleAddMemo = async (id, memos) => {
    await updateTask(id, { memos: [...(memos || []), ''] });
  };

  const handleMemoChange = async (id, memos, idx, value) => {
    const next = [...(memos || [])];
    next[idx] = value;
    await updateTask(id, { memos: next });
  };

  const handleRemoveMemo = async (id, memos, idx) => {
    const next = (memos || []).filter((_, i) => i !== idx);
    await updateTask(id, { memos: next });
  };

  const handleRemove = async (id) => {
    await removeTask(id);
  };

  return (
    <div className="task-section">
      <div className="task-section-title">{icon} {title}</div>

      <div className="task-add-row">
        <input
          type="text"
          className="task-add-input"
          placeholder="항목 추가..."
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button className="btn-primary" onClick={handleAdd}>추가</button>
      </div>

      {loading ? (
        <p className="loading">불러오는 중...</p>
      ) : tasks.length === 0 ? (
        <p className="empty-hint">항목이 없습니다.</p>
      ) : (
        <div className="task-list">
          {tasks.map((task) => (
            <div key={task.id} className={`task-item-wrapper${task.checked ? ' checked' : ''}`}>
              <div className="task-item">
                <input
                  type="checkbox"
                  className="task-checkbox"
                  checked={!!task.checked}
                  onChange={() => handleToggle(task.id, task.checked)}
                />
                <span className={`task-text${task.checked ? ' done' : ''}`}>{task.text}</span>
                <input
                  type="date"
                  className="task-date"
                  value={task.date || ''}
                  onChange={(e) => handleDateChange(task.id, e.target.value)}
                />
                <button className="task-delete" onClick={() => handleRemove(task.id)}>✕</button>
              </div>
              {!isRegular && (
                <div className="task-memos">
                  {(task.memos || []).map((memo, mi) => (
                    <div key={mi} className="task-memo-row">
                      <input
                        type="text"
                        className="task-memo"
                        placeholder="메모"
                        value={memo}
                        onChange={(e) => handleMemoChange(task.id, task.memos, mi, e.target.value)}
                      />
                      <button className="task-memo-delete" onClick={() => handleRemoveMemo(task.id, task.memos, mi)}>✕</button>
                    </div>
                  ))}
                  <button className="task-memo-add" onClick={() => handleAddMemo(task.id, task.memos)}>+ 메모 추가</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TaskListPage() {
  const { storeId } = useParams();
  const store = getStoreById(storeId);

  if (!store) return <p>지점을 찾을 수 없습니다.</p>;

  return (
    <div className="tasklist-page">
      <SeatSection storeId={storeId} />
      <TaskSection title="정기리스트" icon="📅" storeId={storeId} type="regular" />
      <TaskSection title="비정기리스트" icon="📋" storeId={storeId} type="irregular" />
    </div>
  );
}
