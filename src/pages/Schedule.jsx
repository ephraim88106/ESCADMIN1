import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { getStoreById } from '../data/stores';
import { useEmployees, useSchedules } from '../hooks/useFirestore';

const SHIFT_TYPES = ['오픈', '미들', '마감', '휴무'];
const SHIFT_COLORS = { '오픈': '#3b82f6', '미들': '#f59e0b', '마감': '#8b5cf6', '휴무': '#94a3b8' };

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function getDayName(year, month, day) {
  const names = ['일', '월', '화', '수', '목', '금', '토'];
  return names[new Date(year, month - 1, day).getDay()];
}

export default function Schedule() {
  const { storeId } = useParams();
  const store = getStoreById(storeId);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const { employees } = useEmployees(storeId);
  const { schedules, addSchedule, updateSchedule, removeSchedule } =
    useSchedules(storeId, year, month);

  if (!store) return <p>지점을 찾을 수 없습니다.</p>;

  const daysInMonth = getDaysInMonth(year, month);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const getSchedule = (employeeId, day) =>
    schedules.find((s) => s.employeeId === employeeId && s.day === day);

  const handleCellClick = async (employeeId, day) => {
    const existing = getSchedule(employeeId, day);
    if (existing) {
      const currentIdx = SHIFT_TYPES.indexOf(existing.shift);
      const nextIdx = (currentIdx + 1) % (SHIFT_TYPES.length + 1);
      if (nextIdx === SHIFT_TYPES.length) {
        await removeSchedule(existing.id);
      } else {
        await updateSchedule(existing.id, { shift: SHIFT_TYPES[nextIdx] });
      }
    } else {
      await addSchedule({ employeeId, day, shift: SHIFT_TYPES[0] });
    }
  };

  const prevMonth = () => {
    if (month === 1) { setYear(year - 1); setMonth(12); }
    else setMonth(month - 1);
  };

  const nextMonth = () => {
    if (month === 12) { setYear(year + 1); setMonth(1); }
    else setMonth(month + 1);
  };

  return (
    <div className="schedule-page">
      <div className="page-header">
        <h2>{store.name} - 스케줄 관리</h2>
        <div className="month-nav">
          <button className="btn-sm" onClick={prevMonth}>&lt;</button>
          <span className="month-label">{year}년 {month}월</span>
          <button className="btn-sm" onClick={nextMonth}>&gt;</button>
        </div>
      </div>

      <div className="shift-legend">
        {SHIFT_TYPES.map((type) => (
          <span key={type} className="legend-item">
            <span
              className="legend-dot"
              style={{ backgroundColor: SHIFT_COLORS[type] }}
            />
            {type}
          </span>
        ))}
        <span className="legend-hint">셀 클릭으로 순환 변경</span>
      </div>

      {employees.length === 0 ? (
        <p className="empty-state">
          등록된 직원이 없습니다. 직원 관리 탭에서 먼저 직원을 추가해주세요.
        </p>
      ) : (
        <div className="schedule-table-wrapper">
          <table className="schedule-table">
            <thead>
              <tr>
                <th className="sticky-col">직원</th>
                {days.map((d) => {
                  const dayName = getDayName(year, month, d);
                  const isWeekend = dayName === '토' || dayName === '일';
                  return (
                    <th key={d} className={isWeekend ? 'weekend' : ''}>
                      <div>{d}</div>
                      <div className="day-name">{dayName}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.id}>
                  <td className="sticky-col emp-name">{emp.name}</td>
                  {days.map((d) => {
                    const sched = getSchedule(emp.id, d);
                    return (
                      <td
                        key={d}
                        className="schedule-cell"
                        onClick={() => handleCellClick(emp.id, d)}
                        style={
                          sched
                            ? { backgroundColor: SHIFT_COLORS[sched.shift] + '22', color: SHIFT_COLORS[sched.shift] }
                            : {}
                        }
                      >
                        {sched ? sched.shift : ''}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
