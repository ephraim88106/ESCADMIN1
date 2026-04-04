import { useState, useEffect } from 'react';

const POSITIONS_LIST = ['매니저', '부매니저', '직원', '알바'];

export default function EmployeeModal({ employee, onSave, onClose }) {
  const [form, setForm] = useState({
    name: '',
    phone: '',
    position: '직원',
    hourlyWage: '',
  });

  useEffect(() => {
    if (employee) {
      setForm({
        name: employee.name || '',
        phone: employee.phone || '',
        position: employee.position || '직원',
        hourlyWage: employee.hourlyWage || '',
      });
    }
  }, [employee]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSave({
      ...form,
      hourlyWage: Number(form.hourlyWage) || 0,
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{employee ? '직원 수정' : '직원 추가'}</h3>
        <form onSubmit={handleSubmit}>
          <label>
            이름
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </label>
          <label>
            연락처
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="010-0000-0000"
            />
          </label>
          <label>
            직급
            <select
              value={form.position}
              onChange={(e) => setForm({ ...form, position: e.target.value })}
            >
              {POSITIONS_LIST.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label>
            시급 (원)
            <input
              type="number"
              value={form.hourlyWage}
              onChange={(e) =>
                setForm({ ...form, hourlyWage: e.target.value })
              }
              placeholder="9860"
            />
          </label>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              취소
            </button>
            <button type="submit" className="btn-primary">
              {employee ? '수정' : '추가'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
