import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type { FilterFn } from '@tanstack/react-table';
import { AxiosError } from 'axios';
import { Plus } from 'lucide-react';
import { listStock, addStock } from '@/api/inventory';
import { listProductsAdmin } from '@/api/catalog';
import type { StockItem } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { RoleGate } from '@/components/RoleGate';

// UI heuristic only (not enforced server-side): rows at or below this available-qty are badged "Low"
// so the operator knows to restock. Tune freely — it never blocks a sale.
const LOW_STOCK_THRESHOLD = 10;

// One table row: a product joined to its stock record. We join OFF the product list so a product
// that was never stocked still appears (available 0, "no stock record"); any stock row without a
// matching product (e.g. a variant SKU) is appended so nothing is hidden.
interface StockRow {
  sku: string;
  name: string;
  available: number;
  reserved: number;
  updatedAt: string | null;
  hasRecord: boolean;
}

const columnHelper = createColumnHelper<StockRow>();

const globalFilter: FilterFn<StockRow> = (row, _columnId, value) => {
  const q = String(value).toLowerCase();
  const r = row.original;
  return r.sku.toLowerCase().includes(q) || r.name.toLowerCase().includes(q);
};

function serverMessage(err: unknown, fallback: string): string {
  if (err instanceof AxiosError) {
    const data = err.response?.data as { message?: string } | undefined;
    if (data?.message) return data.message;
  }
  return fallback;
}

export function Inventory() {
  const queryClient = useQueryClient();
  const stockQuery = useQuery({ queryKey: ['inventory'], queryFn: () => listStock() });
  const productsQuery = useQuery({ queryKey: ['products'], queryFn: () => listProductsAdmin() });

  const [search, setSearch] = useState('');
  const [restocking, setRestocking] = useState<StockRow | null>(null);

  const isLoading = stockQuery.isLoading || productsQuery.isLoading;
  const isError = stockQuery.isError || productsQuery.isError;

  const rows = useMemo<StockRow[]>(() => {
    const stock = stockQuery.data ?? [];
    const products = productsQuery.data ?? [];
    const bySku = new Map<string, StockItem>(stock.map((s) => [s.sku, s]));
    const productSkus = new Set(products.map((p) => p.sku));

    const out: StockRow[] = products.map((p) => {
      const s = bySku.get(p.sku);
      return {
        sku: p.sku,
        name: p.name,
        available: s?.availableQty ?? 0,
        reserved: s?.reservedQty ?? 0,
        updatedAt: s?.updatedAt ?? null,
        hasRecord: s !== undefined,
      };
    });
    // Stock rows with no product (e.g. variant SKUs) — append so stock is never hidden.
    for (const s of stock) {
      if (!productSkus.has(s.sku)) {
        out.push({
          sku: s.sku,
          name: '—',
          available: s.availableQty,
          reserved: s.reservedQty,
          updatedAt: s.updatedAt,
          hasRecord: true,
        });
      }
    }
    return out;
  }, [stockQuery.data, productsQuery.data]);

  const addMutation = useMutation({
    mutationFn: (vars: { sku: string; quantity: number }) =>
      addStock(vars.sku, vars.quantity),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setRestocking(null);
    },
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor('sku', { header: 'SKU' }),
      columnHelper.accessor('name', { header: 'Product' }),
      columnHelper.accessor('available', {
        header: 'Available',
        cell: (info) => {
          const r = info.row.original;
          return (
            <span className="flex items-center gap-2">
              {info.getValue()}
              {!r.hasRecord ? (
                <Badge variant="muted">no stock record</Badge>
              ) : info.getValue() <= LOW_STOCK_THRESHOLD ? (
                <Badge variant="warning">Low</Badge>
              ) : null}
            </span>
          );
        },
      }),
      columnHelper.accessor('reserved', { header: 'Reserved' }),
      columnHelper.accessor('updatedAt', {
        header: 'Updated',
        cell: (info) => {
          const v = info.getValue();
          return v ? new Date(v).toLocaleString() : '—';
        },
      }),
      columnHelper.display({
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: (info) => (
          <div className="flex justify-end">
            <RoleGate permission="inventory:write">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRestocking(info.row.original)}
              >
                <Plus className="h-4 w-4" />
                Add stock
              </Button>
            </RoleGate>
          </div>
        ),
      }),
    ],
    [],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { globalFilter: search },
    onGlobalFilterChange: setSearch,
    globalFilterFn: globalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
        <p className="text-sm text-muted-foreground">
          Stock on hand per SKU — Available is sellable now, Reserved is held for open orders. Restock
          is additive (+N).
        </p>
      </div>

      <Input
        placeholder="Search by SKU or product…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center text-destructive">
                  Failed to load inventory.
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center text-muted-foreground">
                  No products found.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={restocking !== null}
        onClose={() => setRestocking(null)}
        title="Add stock"
        description={
          restocking ? `Add units to ${restocking.sku} — ${restocking.name}.` : undefined
        }
      >
        {restocking && (
          <AddStockForm
            currentAvailable={restocking.available}
            submitting={addMutation.isPending}
            error={addMutation.isError ? serverMessage(addMutation.error, 'Could not add stock.') : null}
            onSubmit={(quantity) => addMutation.mutate({ sku: restocking.sku, quantity })}
            onCancel={() => setRestocking(null)}
          />
        )}
      </Dialog>
    </div>
  );
}

function AddStockForm({
  currentAvailable,
  submitting,
  error,
  onSubmit,
  onCancel,
}: {
  currentAvailable: number;
  submitting: boolean;
  error: string | null;
  onSubmit: (quantity: number) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState('');
  const quantity = Number(value);
  const valid = Number.isInteger(quantity) && quantity > 0;

  return (
    <form
      className="space-y-4 pt-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit(quantity);
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="add-qty">Quantity to add (+N)</Label>
        <Input
          id="add-qty"
          type="number"
          min={1}
          step={1}
          autoFocus
          placeholder="e.g. 50"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Adds to the current {currentAvailable} available
          {valid ? ` → ${currentAvailable + quantity}` : ''}. Restock is additive only.
        </p>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={!valid || submitting}>
          {submitting ? 'Adding…' : 'Add stock'}
        </Button>
      </div>
    </form>
  );
}
