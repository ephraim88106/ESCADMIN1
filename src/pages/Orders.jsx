import { useParams } from 'react-router-dom';

export default function Orders() {
  const { storeId } = useParams();

  return (
    <div className="orders-page">
      <h3>주문내역</h3>
      <p style={{ color: 'var(--text-muted)', marginTop: 12 }}>
        준비 중입니다.
      </p>
    </div>
  );
}
