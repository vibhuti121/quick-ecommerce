import { useQuery } from '@tanstack/react-query';
import { Package, ShoppingCart, Truck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { listProducts } from '@/api/catalog';
import { getOrders } from '@/api/orders';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

interface Stat {
  label: string;
  value: number | string;
  icon: LucideIcon;
}

export function Dashboard() {
  const products = useQuery({ queryKey: ['products'], queryFn: () => listProducts() });
  const orders = useQuery({ queryKey: ['orders'], queryFn: () => getOrders() });

  const ordersToday = orders.data?.filter((o) => isToday(o.createdAt)).length ?? 0;
  const awaiting =
    orders.data?.filter((o) => o.deliveryStatus === 'AWAITING_DELIVERY').length ?? 0;

  const stats: Stat[] = [
    { label: 'Total products', value: products.data?.length ?? '—', icon: Package },
    { label: 'Orders today', value: orders.data ? ordersToday : '—', icon: ShoppingCart },
    { label: 'Awaiting delivery', value: orders.data ? awaiting : '—', icon: Truck },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Store operations at a glance.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {label}
              </CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
