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

  const handleMemoChange = async (id, memo) => {
    await updateTask(id, { memo });
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
            <div key={task.id} className={`task-item${task.checked ? ' checked' : ''}`}>
              <input
                type="checkbox"
                className="task-checkbox"
                checked={!!task.checked}
                onChange={() => handleToggle(task.id, task.checked)}
              />
              <span className={`task-text${task.checked ? ' done' : ''}`}>{task.text}</span>
              {isRegular && (
                <input
                  type="date"
                  className="task-date"
                  value={task.date || ''}
                  onChange={(e) => handleDateChange(task.id, e.target.value)}
                />
              )}
              {!isRegular && (
                <input
                  type="text"
                  className="task-memo"
                  placeholder="메모"
                  value={task.memo || ''}
                  onChange={(e) => handleMemoChange(task.id, e.target.value)}
                />
              )}
              <button className="task-delete" onClick={() => handleRemove(task.id)}>✕</button>
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
      <TaskSection title="정기리스트" icon="📅" storeId={storeId} type="regular" />
      <TaskSection title="비정기리스트" icon="📋" storeId={storeId} type="irregular" />
    </div>
  );
}
