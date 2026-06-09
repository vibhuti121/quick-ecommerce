-- Co-purchase recommendations self-join the order_items table on order_id, then filter by
-- product_id (the "anchor" side oi1). V1 already indexes order_items(order_id) for the join;
-- this index makes the oi1.product_id = :productId lookup (the anchor lookup) fast as orders grow.
CREATE INDEX idx_order_items_product ON order_items (product_id);
