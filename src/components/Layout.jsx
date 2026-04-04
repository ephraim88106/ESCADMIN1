import { NavLink, Outlet, useParams } from 'react-router-dom';
import { STORES, getStoreById } from '../data/stores';

export default function Layout() {
  const { storeId } = useParams();
  const currentStore = storeId ? getStoreById(storeId) : null;

  return (
    <div className="layout">
      <aside className="sidebar">
        <h1 className="logo">ESC Admin</h1>
        <nav>
          <NavLink to="/" end className="nav-item">
            종합 대시보드
          </NavLink>
          <div className="nav-section-title">지점 목록</div>
          {STORES.map((store) => (
            <NavLink
              key={store.id}
              to={`/store/${store.id}/employees`}
              className={({ isActive }) =>
                `nav-item store-link${isActive || storeId === store.id ? ' active' : ''}`
              }
            >
              {store.name}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="main-content">
        {currentStore && (
          <div className="store-tabs">
            <NavLink to={`/store/${storeId}/employees`} className="tab" end>
              직원 관리
            </NavLink>
            <NavLink to={`/store/${storeId}/schedule`} className="tab">
              스케줄 관리
            </NavLink>
            <NavLink to={`/store/${storeId}/handoff`} className="tab">
              인수인계
            </NavLink>
          </div>
        )}
        <div className="page-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
