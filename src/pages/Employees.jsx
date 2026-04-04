import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { getStoreById } from '../data/stores';
import { useEmployees } from '../hooks/useFirestore';
import EmployeeModal from '../components/EmployeeModal';

export default function Employees() {
  const { storeId } = useParams();
  const store = getStoreById(storeId);
  const { employees, loading, addEmployee, updateEmployee, removeEmployee } =
    useEmployees(storeId);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const handleSave = async (data) => {
    if (editing) {
      await updateEmployee(editing.id, data);
    } else {
      await addEmployee(data);
    }
    setModalOpen(false);
    setEditing(null);
  };

  const handleEdit = (emp) => {
    setEditing(emp);
    setModalOpen(true);
  };

  const handleDelete = async (emp) => {
    if (window.confirm(`${emp.name} 직원을 삭제하시겠습니까?`)) {
      await removeEmployee(emp.id);
    }
  };

  if (!store) return <p>지점을 찾을 수 없습니다.</p>;

  return (
    <div className="employees-page">
      <div className="page-header">
        <h2>{store.name} - 직원 관리</h2>
        <button
          className="btn-primary"
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
        >
          + 직원 추가
        </button>
      </div>

      {loading ? (
        <p className="loading">불러오는 중...</p>
      ) : employees.length === 0 ? (
        <p className="empty-state">등록된 직원이 없습니다. 직원을 추가해주세요.</p>
      ) : (
        <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>이름</th>
              <th>직급</th>
              <th>연락처</th>
              <th>시급</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => (
              <tr key={emp.id}>
                <td>{emp.name}</td>
                <td>
                  <span className={`badge badge-${emp.position}`}>
                    {emp.position}
                  </span>
                </td>
                <td>{emp.phone || '-'}</td>
                <td>{emp.hourlyWage ? `${emp.hourlyWage.toLocaleString()}원` : '-'}</td>
                <td>
                  <button className="btn-sm" onClick={() => handleEdit(emp)}>
                    수정
                  </button>
                  <button
                    className="btn-sm btn-danger"
                    onClick={() => handleDelete(emp)}
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}

      {modalOpen && (
        <EmployeeModal
          employee={editing}
          onSave={handleSave}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
