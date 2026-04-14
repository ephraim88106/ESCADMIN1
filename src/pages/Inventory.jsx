import { useParams } from 'react-router-dom';

export default function Inventory() {
  const { storeId } = useParams();

  return (
    <div className="inventory-page">
      <h3>재고조사</h3>
      <p style={{ color: 'var(--text-muted)', marginTop: 12 }}>
        준비 중입니다.
      </p>
    </div>
  );
}
