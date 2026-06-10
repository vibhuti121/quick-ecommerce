import type {
  DeliveryStatus,
  OrderStatus,
  OrderSummary,
  UserProfile,
  WishlistItem,
} from '../types';
import { formatPrice } from '../api';

// The four in-drawer sections. My Orders is the real feature; the other three round out the shell.
export type ProfileSection = 'profile' | 'orders' | 'address' | 'wishlist';

const SECTIONS: { key: ProfileSection; label: string; icon: string }[] = [
  { key: 'profile', label: 'My Profile', icon: '👤' },
  { key: 'orders', label: 'My Orders', icon: '📦' },
  { key: 'address', label: 'My Address', icon: '📍' },
  { key: 'wishlist', label: 'My Wishlist', icon: '♥' },
];

interface ProfileDrawerProps {
  open: boolean;
  onClose: () => void;
  activeSection: ProfileSection;
  onSection: (section: ProfileSection) => void;
  profile: UserProfile | null;
  orders: OrderSummary[];
  ordersLoading: boolean;
  onRefreshOrders: () => void;
  wishlist: WishlistItem[];
  onRemoveWishlist: (id: number) => void;
}

// ---- status badges ----------------------------------------------------------
// Order status comes from the saga (PENDING settles to CONFIRMED/FAILED); delivery status is the COD
// fulfilment state. Both map to a semantic colour class defined additively in index.css.
const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  FAILED: 'Failed',
};
const DELIVERY_STATUS_LABEL: Record<DeliveryStatus, string> = {
  AWAITING_DELIVERY: 'Awaiting delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`status-badge status-badge--${status.toLowerCase()}`}>
      {ORDER_STATUS_LABEL[status]}
    </span>
  );
}

function DeliveryStatusBadge({ status }: { status: DeliveryStatus }) {
  // class suffixes: awaiting_delivery → awaiting, delivered, cancelled
  const suffix = status === 'AWAITING_DELIVERY' ? 'awaiting' : status.toLowerCase();
  return (
    <span className={`status-badge status-badge--${suffix}`}>
      {DELIVERY_STATUS_LABEL[status]}
    </span>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---- panels -----------------------------------------------------------------

function ProfilePanel({ profile }: { profile: UserProfile | null }) {
  if (!profile) {
    return <p className="profile-empty">Loading your profile…</p>;
  }
  const initial = (profile.displayName || 'G').trim().charAt(0).toUpperCase();
  return (
    <div className="profile-panel">
      <div className="profile-identity">
        {profile.picture ? (
          <img className="profile-avatar" src={profile.picture} alt={profile.displayName} />
        ) : (
          <div className="profile-avatar profile-avatar--initial">{initial}</div>
        )}
        <div className="profile-identity-text">
          <span className="profile-name">{profile.displayName}</span>
          {profile.email && <span className="profile-email">{profile.email}</span>}
          <span className="profile-role">{profile.role}</span>
        </div>
      </div>
      {profile.isGuest && (
        <p className="profile-guest-note">
          You’re browsing as a <strong>guest</strong>. Your orders and wishlist are tied to this
          browser — sign in to keep them across devices.
        </p>
      )}
    </div>
  );
}

function OrdersPanel({
  orders,
  loading,
  onRefresh,
}: {
  orders: OrderSummary[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const hasPending = orders.some((o) => o.status === 'PENDING');
  return (
    <div className="orders-panel">
      <div className="panel-toolbar">
        <span className="panel-toolbar-note">
          {hasPending ? 'Updating live…' : `${orders.length} order${orders.length === 1 ? '' : 's'}`}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={onRefresh} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {orders.length === 0 ? (
        loading ? (
          <div className="state-message">
            <div className="spinner" />
            <p>Loading your orders…</p>
          </div>
        ) : (
          <div className="state-message">
            <p>No orders yet. Place your first order and it’ll show up here.</p>
          </div>
        )
      ) : (
        <ul className="order-list">
          {orders.map((o) => (
            <li className="order-card" key={o.orderId}>
              <div className="order-card-head">
                <span className="order-id">#{o.orderId}</span>
                <span className="order-total">{formatPrice(o.total)}</span>
              </div>
              <div className="order-card-badges">
                <OrderStatusBadge status={o.status} />
                <DeliveryStatusBadge status={o.deliveryStatus} />
              </div>
              <span className="order-date">{formatDate(o.placedAt)}</span>
              <ul className="order-lines">
                {o.items.map((it) => (
                  <li className="order-line" key={`${o.orderId}-${it.productId}-${it.sku}`}>
                    <span className="order-line-name">{it.name}</span>
                    <span className="order-line-qty">×{it.quantity}</span>
                    <span className="order-line-price">
                      {formatPrice(it.unitPrice * it.quantity)}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddressPanel({ orders }: { orders: OrderSummary[] }) {
  // Derived, read-only: the unique delivery addresses the user has actually shipped to. No address
  // book backend yet — this simply surfaces what past orders already carry.
  const seen = new Set<string>();
  const addresses = orders
    .filter((o) => o.deliveryAddress.trim() !== '')
    .filter((o) => {
      const key = o.deliveryAddress.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  if (addresses.length === 0) {
    return (
      <div className="state-message">
        <p>No saved addresses yet. The address from your next order will appear here.</p>
      </div>
    );
  }
  return (
    <div className="address-panel">
      <p className="panel-toolbar-note">From your past orders</p>
      <ul className="address-list">
        {addresses.map((o) => (
          <li className="address-row" key={o.orderId}>
            <span className="address-name">{o.customerName || 'Recipient'}</span>
            <span className="address-text">{o.deliveryAddress}</span>
            {o.customerPhone && <span className="address-phone">{o.customerPhone}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function WishlistPanel({
  wishlist,
  onRemove,
}: {
  wishlist: WishlistItem[];
  onRemove: (id: number) => void;
}) {
  if (wishlist.length === 0) {
    return (
      <div className="state-message">
        <p>Your wishlist is empty. Tap the ♥ on any product to save it here.</p>
      </div>
    );
  }
  return (
    <ul className="wishlist-list">
      {wishlist.map((w) => (
        <li className="wishlist-row" key={w.id}>
          <img className="wishlist-image" src={w.imageUrl} alt={w.name} />
          <div className="wishlist-info">
            <span className="wishlist-name">{w.name}</span>
            <span className="wishlist-price">{formatPrice(w.price)}</span>
          </div>
          <button
            className="remove-button"
            onClick={() => onRemove(w.id)}
            aria-label={`Remove ${w.name} from wishlist`}
          >
            Remove
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function ProfileDrawer({
  open,
  onClose,
  activeSection,
  onSection,
  profile,
  orders,
  ordersLoading,
  onRefreshOrders,
  wishlist,
  onRemoveWishlist,
}: ProfileDrawerProps) {
  return (
    <>
      <div className={`overlay ${open ? 'overlay-open' : ''}`} onClick={onClose} />
      <aside className={`profile-drawer ${open ? 'profile-drawer-open' : ''}`}>
        <div className="cart-header">
          <h2>My Profile</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close profile">
            ✕
          </button>
        </div>

        <nav className="profile-nav">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              className={`profile-nav-item ${activeSection === s.key ? 'profile-nav-item--active' : ''}`}
              onClick={() => onSection(s.key)}
            >
              <span className="profile-nav-icon" aria-hidden="true">
                {s.icon}
              </span>
              <span className="profile-nav-label">{s.label}</span>
            </button>
          ))}
        </nav>

        <div className="profile-body">
          {activeSection === 'profile' && <ProfilePanel profile={profile} />}
          {activeSection === 'orders' && (
            <OrdersPanel orders={orders} loading={ordersLoading} onRefresh={onRefreshOrders} />
          )}
          {activeSection === 'address' && <AddressPanel orders={orders} />}
          {activeSection === 'wishlist' && (
            <WishlistPanel wishlist={wishlist} onRemove={onRemoveWishlist} />
          )}
        </div>
      </aside>
    </>
  );
}
