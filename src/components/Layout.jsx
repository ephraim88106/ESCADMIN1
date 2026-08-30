import { useState, useEffect } from 'react';
import { NavLink, Outlet, useParams, useLocation } from 'react-router-dom';
import { STORES, getStoreById } from '../data/stores';
import { useHandoffAlerts } from '../hooks/useHandoffAlerts';
import { usePushSubscription } from '../hooks/usePushSubscription';
import { notificationSupported } from '../lib/handoffAlert';
import { ALL_STORES } from '../lib/webPush';
import HandoffToasts from './HandoffToasts';
import PushSubscribeModal from './PushSubscribeModal';

export default function Layout() {
  const { storeId } = useParams();
  const location = useLocation();
  const currentStore = storeId ? getStoreById(storeId) : null;
  const [menuOpen, setMenuOpen] = useState(false);
  const [pushModalOpen, setPushModalOpen] = useState(false);

  // 지금 이 지점 인수인계 화면을 보고 있으면 그 지점 알림은 띄우지 않는다 — 목록에 바로 나온다
  const viewingHandoffStoreId = location.pathname.endsWith('/board/handoff') ? storeId : null;

  const {
    toasts,
    dismissToast,
    unreadByStore,
    unreadTotal,
    markStoreRead,
    permission,
    enableNotifications,
    soundOn,
    toggleSound,
  } = useHandoffAlerts(viewingHandoffStoreId);

  const push = usePushSubscription();
  const pushLabel = !push.subscribed
    ? '📱 휴대폰 알림 받기'
    : push.stores.includes(ALL_STORES)
      ? '📱 휴대폰 알림 — 전 지점'
      : `📱 휴대폰 알림 — ${push.stores.length}개 지점`;

  // 페이지 이동 시 메뉴 닫기
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // 인수인계 화면을 열면 그 지점에 쌓여 있던 표시를 지운다
  useEffect(() => {
    if (viewingHandoffStoreId) markStoreRead(viewingHandoffStoreId);
  }, [viewingHandoffStoreId, markStoreRead]);

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
        {unreadTotal > 0 && (
          <span className="header-unread" title="확인하지 않은 새 인수인계">
            📝 {unreadTotal}
          </span>
        )}
      </header>

      {/* 사이드바 오버레이 */}
      {menuOpen && (
        <div className="sidebar-overlay" onClick={() => setMenuOpen(false)} />
      )}

      <aside className={`sidebar${menuOpen ? ' open' : ''}`}>
        <h1 className="logo">ESC Admin</h1>
        <div className="alert-settings">
          {push.configured && push.supported && (
            <button
              type="button"
              className={push.subscribed ? 'alert-sound-btn' : 'alert-enable-btn'}
              onClick={() => setPushModalOpen(true)}
            >
              {pushLabel}
            </button>
          )}
          {push.configured && !push.supported && push.needsHomeScreen && (
            <p className="alert-hint">
              📱 아이폰은 공유 버튼 → &lsquo;홈 화면에 추가&rsquo;를 하면, 앱을 껐어도 알림을 받을 수
              있습니다.
            </p>
          )}
          {notificationSupported && permission === 'default' && (
            <button type="button" className="alert-enable-btn" onClick={enableNotifications}>
              🔔 브라우저 알림 켜기
            </button>
          )}
          {notificationSupported && permission === 'granted' && (
            <p className="alert-hint">🔔 브라우저 알림 켜짐</p>
          )}
          {notificationSupported && permission === 'denied' && (
            <p className="alert-hint">
              브라우저에서 알림이 차단됐습니다. 주소창 자물쇠 → 알림 허용으로 바꿔주세요.
            </p>
          )}
          <button type="button" className="alert-sound-btn" onClick={toggleSound}>
            {soundOn ? '🔊 알림음 켜짐' : '🔇 알림음 꺼짐'}
          </button>
        </div>
        <nav>
          <NavLink to="/" end className="nav-item">
            종합 대시보드
          </NavLink>
          <NavLink to="/stock" end className="nav-item">
            재고 현황
          </NavLink>
          <div className="nav-section-title">지점 목록</div>
          {STORES.map((store) => (
            <NavLink
              key={store.id}
              to={`/store/${store.id}/tasks`}
              className={({ isActive }) =>
                `nav-item store-link${isActive || storeId === store.id ? ' active' : ''}`
              }
            >
              {store.name}
              {unreadByStore[store.id] > 0 && (
                <span className="nav-unread">{unreadByStore[store.id]}</span>
              )}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="main-content">
        {currentStore && (
          <div className="store-tabs">
            <NavLink to={`/store/${storeId}/tasks`} className="tab">
              리스트
            </NavLink>
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

      <HandoffToasts toasts={toasts} onDismiss={dismissToast} />

      {pushModalOpen && (
        <PushSubscribeModal
          subscribed={push.subscribed}
          stores={push.stores}
          busy={push.busy}
          error={push.error}
          onEnable={async (next) => {
            if (await push.enable(next)) setPushModalOpen(false);
          }}
          onDisable={async () => {
            if (await push.disable()) setPushModalOpen(false);
          }}
          onClose={() => setPushModalOpen(false)}
        />
      )}
    </div>
  );
}
