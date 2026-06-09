-- COD pilot: capture where the goods go and track fulfillment separately from saga/payment status.
-- delivery_status is orthogonal to status (PENDING/CONFIRMED/FAILED): a COD order CONFIRMS (payment is
-- a no-op) while still AWAITING_DELIVERY, then the founder flips it to DELIVERED after hand-off.
-- Text columns are NOT NULL DEFAULT '' so any pre-existing rows stay valid; the app's @NotBlank
-- validation enforces real values on every new order.
ALTER TABLE orders
    ADD COLUMN customer_name    VARCHAR(256)  NOT NULL DEFAULT '',
    ADD COLUMN customer_phone   VARCHAR(32)   NOT NULL DEFAULT '',
    ADD COLUMN delivery_address VARCHAR(1024) NOT NULL DEFAULT '',
    ADD COLUMN delivery_status  VARCHAR(20)   NOT NULL DEFAULT 'AWAITING_DELIVERY'
        CHECK (delivery_status IN ('AWAITING_DELIVERY', 'DELIVERED', 'CANCELLED'));

CREATE INDEX idx_orders_delivery_status ON orders (delivery_status);
