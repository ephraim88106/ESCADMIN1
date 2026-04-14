import { useState, useEffect } from 'react';
import { NavLink, Outlet, useParams, useLocation } from 'react-router-dom';
import { STORES, getStoreById } from '../data/stores';

export default function Layout() {
  const { storeId } = useParams();
  const location = useLocation();
  const currentStore = storeId ? getStoreById(storeId) : null;
  const [menuOpen, setMenuOpen] = useState(false);

  // 페이지 이동 시 메뉴 닫기
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="layout">
      {/* 모바일 헤더 */}
      <header className="mobile-header">
        <button className="menu-btn" onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? '✕' : '☰'}
        </button>
        <span className="mobile-title">
          {currentStore ? currentStore.name : 'ESC Admin'}
        </span>
      </header>

      {/* 사이드바 오버레이 */}
      {menuOpen && (
        <div className="sidebar-overlay" onClick={() => setMenuOpen(false)} />
      )}

      <aside className={`sidebar${menuOpen ? ' open' : ''}`}>
        <h1 className="logo">ESC Admin</h1>
        <nav>
          <NavLink to="/" end className="nav-item">
            종합 대시보드
          </NavLink>
          <div className="nav-section-title">지점 목록</div>
          {STORES.map((store) => (
            <NavLink
              key={store.id}
              to={`/store/${store.id}/checklist`}
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
            <NavLink to={`/store/${storeId}/checklist`} className="tab">
              체크리스트
            </NavLink>
            <NavLink to={`/store/${storeId}/inventory`} className="tab">
              재고조사
            </NavLink>
            <NavLink
              to={`/store/${storeId}/board/orders`}
              className={({ isActive }) =>
                `tab${isActive || location.pathname.startsWith(`/store/${storeId}/board`) ? ' active' : ''}`
              }
            >
              게시판
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
