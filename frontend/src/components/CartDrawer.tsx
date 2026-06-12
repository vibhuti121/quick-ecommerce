import { useState } from 'react';
import type { Cart, DeliveryDetails, Order } from '../types';
import { formatPrice } from '../api';
import { resolvePincode } from '../lib/pincode';

interface CartDrawerProps {
  open: boolean;
  cart: Cart | null;
  busy: boolean;
  order: Order | null;
  // Guests can browse and build a cart but must sign in to place an order (order-service rejects guest
  // tokens). When true we swap the delivery form + place button for a sign-in prompt.
  isGuest: boolean;
  onClose: () => void;
  onChangeQuantity: (productId: number, delta: number) => void;
  onRemove: (productId: number) => void;
  onCheckout: (delivery: DeliveryDetails) => void;
  onRequireSignIn: () => void;
  onDismissOrder: () => void;
}

export default function CartDrawer({
  open,
  cart,
  busy,
  order,
  isGuest,
  onClose,
  onChangeQuantity,
  onRemove,
  onCheckout,
  onRequireSignIn,
  onDismissOrder,
}: CartDrawerProps) {
  const items = cart?.items ?? [];
  const isEmpty = items.length === 0;

  // COD pilot: capture where the order goes. Checkout is blocked until all fields are filled.
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  // Serviceability pilot: a required 6-digit pincode auto-fills an editable city/state (lib/pincode,
  // API → offline fallback, never throws). City/state stay editable so a coarse resolve is correctable.
  const [pincode, setPincode] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [resolving, setResolving] = useState(false);
  const deliveryReady =
    customerName.trim() !== '' &&
    customerPhone.trim() !== '' &&
    deliveryAddress.trim() !== '' &&
    /^\d{6}$/.test(pincode) &&
    city.trim() !== '' &&
    state.trim() !== '';

  // On reaching 6 digits, resolve city/state. Keep digits only, cap at 6 (strictly numeric).
  function handlePincodeChange(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 6);
    setPincode(digits);
    if (digits.length === 6) {
      setResolving(true);
      void resolvePincode(digits)
        .then((res) => {
          if (res) {
            setCity(res.city);
            setState(res.state);
          }
        })
        .finally(() => setResolving(false));
    }
  }

  return (
    <>
      <div
        className={`overlay ${open ? 'overlay-open' : ''}`}
        onClick={onClose}
      />
      <aside className={`cart-drawer ${open ? 'cart-drawer-open' : ''}`}>
        <div className="cart-header">
          <h2>Your Cart</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close cart">
            ✕
          </button>
        </div>

        {order ? (
          <div className="order-success">
            <div className="success-mark">✓</div>
            <h3>Order placed!</h3>
            <p>
              Your order <strong>{order.orderId}</strong> was placed successfully.
            </p>
            <p className="success-total">Total paid: {formatPrice(order.total)}</p>
            <button className="btn btn-primary" onClick={onDismissOrder}>
              Continue shopping
            </button>
          </div>
        ) : (
          <>
            <div className="cart-body">
              {isEmpty ? (
                <p className="cart-empty">Your cart is empty.</p>
              ) : (
                items.map((item) => (
                  <div className="cart-item" key={item.product.id}>
                    <img
                      className="cart-item-image"
                      src={item.product.imageUrl}
                      alt={item.product.name}
                    />
                    <div className="cart-item-info">
                      <span className="cart-item-name">{item.product.name}</span>
                      <span className="cart-item-price">
                        {formatPrice(item.product.price)}
                      </span>
                      <div className="qty-control">
                        <button
                          className="qty-button"
                          onClick={() => onChangeQuantity(item.product.id, -1)}
                          disabled={busy}
                          aria-label="Decrease quantity"
                        >
                          −
                        </button>
                        <span className="qty-value">{item.quantity}</span>
                        <button
                          className="qty-button"
                          onClick={() => onChangeQuantity(item.product.id, 1)}
                          disabled={busy}
                          aria-label="Increase quantity"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <button
                      className="remove-button"
                      onClick={() => onRemove(item.product.id)}
                      disabled={busy}
                      aria-label="Remove item"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="cart-footer">
              {!isEmpty && (
                isGuest ? (
                  // Guests build a cart freely but can't order — prompt sign-in instead of a dead form.
                  // The cart is preserved across sign-in (App re-adds the lines under the new identity).
                  <p className="delivery-title signin-note">
                    Sign in to place your order — your cart will be saved.
                  </p>
                ) : (
                  <div className="delivery-form">
                    <p className="delivery-title">Delivery details (Cash on Delivery)</p>
                    <input
                      className="delivery-input"
                      type="text"
                      placeholder="Full name"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      disabled={busy}
                      aria-label="Full name"
                    />
                    <input
                      className="delivery-input"
                      type="tel"
                      placeholder="Phone number"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      disabled={busy}
                      aria-label="Phone number"
                    />
                    <textarea
                      className="delivery-input"
                      placeholder="Delivery address"
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      disabled={busy}
                      rows={3}
                      aria-label="Delivery address"
                    />
                    <input
                      className="delivery-input"
                      type="text"
                      inputMode="numeric"
                      autoComplete="postal-code"
                      maxLength={6}
                      placeholder="Pincode"
                      value={pincode}
                      onChange={(e) => handlePincodeChange(e.target.value)}
                      disabled={busy}
                      aria-label="Pincode"
                    />
                    {resolving && (
                      <span className="coming-soon-resolving" aria-live="polite">
                        resolving…
                      </span>
                    )}
                    <input
                      className="delivery-input"
                      type="text"
                      autoComplete="address-level2"
                      placeholder="City"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      disabled={busy}
                      aria-label="City"
                    />
                    <input
                      className="delivery-input"
                      type="text"
                      autoComplete="address-level1"
                      placeholder="State"
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      disabled={busy}
                      aria-label="State"
                    />
                  </div>
                )
              )}
              <div className="cart-total-row">
                <span>Total</span>
                <span className="cart-total">
                  {formatPrice(cart?.total ?? 0)}
                </span>
              </div>
              {!isEmpty && isGuest ? (
                <button
                  className="btn btn-primary btn-block"
                  onClick={onRequireSignIn}
                  disabled={busy}
                >
                  Sign in to place your order
                </button>
              ) : (
                <button
                  className="btn btn-primary btn-block"
                  onClick={() =>
                    onCheckout({
                      customerName: customerName.trim(),
                      customerPhone: customerPhone.trim(),
                      deliveryAddress: deliveryAddress.trim(),
                      pincode: pincode.trim(),
                      city: city.trim(),
                      state: state.trim(),
                    })
                  }
                  disabled={isEmpty || busy || !deliveryReady}
                >
                  {busy ? 'Processing…' : 'Place COD order'}
                </button>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
}
