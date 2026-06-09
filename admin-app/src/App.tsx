import { useCallback, useEffect, useState } from 'react';
import { formatPrice, getOrders, markDelivered, type OrderFilter } from './api';
import type { AdminOrder, DeliveryStatus } from './types';

type FilterKey = 'ALL' | 'AWAITING_DELIVERY' | 'DELIVERED' | 'CONFIRMED' | 'PENDING' | 'FAILED';

// Maps a UI filter chip to the order-service query params (saga status vs delivery status).
function toFilter(key: FilterKey): OrderFilter {
  switch (key) {
    case 'AWAITING_DELIVERY':
    case 'DELIVERED':
      return { deliveryStatus: key };
    case 'CONFIRMED':
    case 'PENDING':
    case 'FAILED':
      return { status: key };
    default:
      return {};
  }
}

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'AWAITING_DELIVERY', label: 'Awaiting delivery' },
  { key: 'DELIVERED', label: 'Delivered' },
  { key: 'CONFIRMED', label: 'Confirmed' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'FAILED', label: 'Failed' },
];

function deliveryBadgeClass(s: DeliveryStatus): string {
  if (s === 'DELIVERED') return 'badge badge-green';
  if (s === 'CANCELLED') return 'badge badge-red';
  return 'badge badge-amber';
}

function statusBadgeClass(s: AdminOrder['status']): string {
  if (s === 'CONFIRMED') return 'badge badge-green';
  if (s === 'FAILED') return 'badge badge-red';
  return 'badge badge-amber';
}

export default function App() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [filter, setFilter] = useState<FilterKey>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = useCallback(async (key: FilterKey) => {
    setLoading(true);
    setError(null);
    try {
      setOrders(await getOrders(toFilter(key)));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load orders.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(filter);
  }, [filter, load]);

  const handleMarkDelivered = useCallback(
    async (orderId: string) => {
      setPendingId(orderId);
      setError(null);
      try {
        const updated = await markDelivered(orderId);
        // Patch the row in place so the table reflects the new delivery status immediately.
        setOrders((prev) =>
          prev.map((o) => (o.orderId === orderId ? updated : o)),
        );
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to mark delivered.');
      } finally {
        setPendingId(null);
      }
    },
    [],
  );

  return (
    <div className="app">
      <header className="topbar">
        <h1>MaLLADE · Orders</h1>
        <button className="btn" onClick={() => void load(filter)} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      <div className="filters">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`chip ${filter === f.key ? 'chip-active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <div className="banner-error">{error}</div>}

      {loading ? (
        <p className="muted">Loading orders…</p>
      ) : orders.length === 0 ? (
        <p className="muted">No orders for this filter.</p>
      ) : (
        <table className="orders">
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Address</th>
              <th>Items</th>
              <th className="num">Total</th>
              <th>Status</th>
              <th>Delivery</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.orderId}>
                <td>
                  <code className="mono">{o.orderId.slice(0, 8)}</code>
                  <div className="muted small">{new Date(o.createdAt).toLocaleString()}</div>
                </td>
                <td>
                  <div>{o.customerName || <span className="muted">—</span>}</div>
                  <div className="muted small">{o.customerPhone}</div>
                </td>
                <td className="addr">{o.deliveryAddress || <span className="muted">—</span>}</td>
                <td>
                  {o.items.map((i) => (
                    <div key={i.sku} className="small">
                      {i.quantity}× {i.name}
                    </div>
                  ))}
                </td>
                <td className="num">{formatPrice(o.totalAmount, o.currency)}</td>
                <td>
                  <span className={statusBadgeClass(o.status)}>{o.status}</span>
                </td>
                <td>
                  <span className={deliveryBadgeClass(o.deliveryStatus)}>
                    {o.deliveryStatus.replace(/_/g, ' ')}
                  </span>
                </td>
                <td>
                  <button
                    className="btn btn-primary"
                    disabled={
                      o.status !== 'CONFIRMED' ||
                      o.deliveryStatus === 'DELIVERED' ||
                      pendingId === o.orderId
                    }
                    onClick={() => void handleMarkDelivered(o.orderId)}
                    title={
                      o.status !== 'CONFIRMED'
                        ? 'Only CONFIRMED orders can be delivered'
                        : 'Mark this order delivered'
                    }
                  >
                    {pendingId === o.orderId ? '…' : 'Mark delivered'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
