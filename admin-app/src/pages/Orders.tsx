import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getOrders, markDelivered, type OrderFilter } from '@/api/orders';
import type { AdminOrder, DeliveryStatus } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { BadgeProps } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { RoleGate } from '@/components/RoleGate';
import { formatPrice, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

type FilterKey =
  | 'ALL'
  | 'AWAITING_DELIVERY'
  | 'DELIVERED'
  | 'CONFIRMED'
  | 'PENDING'
  | 'FAILED';

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

function deliveryVariant(s: DeliveryStatus): BadgeProps['variant'] {
  if (s === 'DELIVERED') return 'success';
  if (s === 'CANCELLED') return 'destructive';
  return 'warning';
}

function statusVariant(s: AdminOrder['status']): BadgeProps['variant'] {
  if (s === 'CONFIRMED') return 'success';
  if (s === 'FAILED') return 'destructive';
  return 'warning';
}

export function Orders() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterKey>('ALL');

  const { data: orders = [], isLoading, isError } = useQuery({
    queryKey: ['orders', filter],
    queryFn: () => getOrders(toFilter(filter)),
  });

  const deliverMutation = useMutation({
    mutationFn: (orderId: string) => markDelivered(orderId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
        <p className="text-sm text-muted-foreground">
          Track the saga outcome and mark confirmed orders delivered.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              filter === f.key
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:bg-secondary',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Delivery</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  Loading orders…
                </TableCell>
              </TableRow>
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-destructive">
                  Failed to load orders.
                </TableCell>
              </TableRow>
            ) : orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No orders for this filter.
                </TableCell>
              </TableRow>
            ) : (
              orders.map((o) => (
                <TableRow key={o.orderId}>
                  <TableCell>
                    <code className="font-mono text-xs">{o.orderId.slice(0, 8)}</code>
                    <div className="text-xs text-muted-foreground">
                      {formatDateTime(o.createdAt)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>{o.customerName || <span className="text-muted-foreground">—</span>}</div>
                    <div className="text-xs text-muted-foreground">{o.customerPhone}</div>
                  </TableCell>
                  <TableCell>
                    {o.items.map((i) => (
                      <div key={i.sku} className="text-xs">
                        {i.quantity}× {i.name}
                      </div>
                    ))}
                  </TableCell>
                  <TableCell>{formatPrice(o.totalAmount, o.currency)}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(o.status)}>{o.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={deliveryVariant(o.deliveryStatus)}>
                      {o.deliveryStatus.replace(/_/g, ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <RoleGate permission="order:write">
                      <Button
                        size="sm"
                        disabled={
                          o.status !== 'CONFIRMED' ||
                          o.deliveryStatus === 'DELIVERED' ||
                          (deliverMutation.isPending &&
                            deliverMutation.variables === o.orderId)
                        }
                        onClick={() => deliverMutation.mutate(o.orderId)}
                        title={
                          o.status !== 'CONFIRMED'
                            ? 'Only CONFIRMED orders can be delivered'
                            : 'Mark this order delivered'
                        }
                      >
                        Mark delivered
                      </Button>
                    </RoleGate>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
