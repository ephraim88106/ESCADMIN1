import { NavLink, Outlet, useParams } from 'react-router-dom';

export default function Board() {
  const { storeId } = useParams();

  return (
    <div className="board-page">
      <div className="sub-tabs">
        <NavLink to={`/store/${storeId}/board/orders`} className="sub-tab">
          주문내역
        </NavLink>
        <NavLink to={`/store/${storeId}/board/handoff`} className="sub-tab">
          인수인계
        </NavLink>
        <NavLink to={`/store/${storeId}/board/notices`} className="sub-tab">
          공지
        </NavLink>
      </div>
      <Outlet />
    </div>
  );
}
