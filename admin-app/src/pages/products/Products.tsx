import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type { FilterFn, RowSelectionState } from '@tanstack/react-table';
import { AxiosError } from 'axios';
import { Pencil, Plus, Power, PowerOff } from 'lucide-react';
import {
  createProduct,
  listProductsAdmin,
  setProductsActive,
  updateProduct,
} from '@/api/catalog';
import type { Product, ProductWriteRequest } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { formatPrice } from '@/lib/format';
import { ProductForm } from './ProductForm';

function serverMessage(err: unknown, fallback: string): string {
  if (err instanceof AxiosError) {
    if (err.response?.status === 409) return 'A product with that SKU already exists.';
    const data = err.response?.data as { message?: string } | undefined;
    if (data?.message) return data.message;
  }
  return fallback;
}

const columnHelper = createColumnHelper<Product>();

const globalFilter: FilterFn<Product> = (row, _columnId, value) => {
  const q = String(value).toLowerCase();
  const p = row.original;
  return (
    p.sku.toLowerCase().includes(q) ||
    p.name.toLowerCase().includes(q) ||
    (p.category ?? '').toLowerCase().includes(q)
  );
};

// A small native checkbox — the design system has no Checkbox primitive yet, so we style the
// browser control directly (keeps row-selection dependency-free and accessible).
function Check({
  checked,
  indeterminate = false,
  onChange,
  'aria-label': ariaLabel,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  'aria-label': string;
}) {
  return (
    <input
      type="checkbox"
      className="h-4 w-4 cursor-pointer rounded border-border accent-primary"
      checked={checked}
      ref={(el) => {
        if (el) el.indeterminate = indeterminate && !checked;
      }}
      onChange={onChange}
      aria-label={ariaLabel}
    />
  );
}

export function Products() {
  const queryClient = useQueryClient();
  // Admin list: the ADMIN endpoint returns EVERY product (active + inactive), active-first — so
  // disabled products are visible and re-enable-able (the public browse hides active=false).
  const { data: products = [], isLoading, isError } = useQuery({
    queryKey: ['products'],
    queryFn: () => listProductsAdmin(),
  });

  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['products'] });

  const saveMutation = useMutation({
    mutationFn: (vars: { id: number | null; body: ProductWriteRequest }) =>
      vars.id === null ? createProduct(vars.body) : updateProduct(vars.id, vars.body),
    onSuccess: async () => {
      await invalidate();
      setEditing(null);
      setCreating(false);
      setFormError(null);
    },
    onError: (err) => setFormError(serverMessage(err, 'Could not save the product.')),
  });

  // Enable/disable — drives both the bulk toolbar (selected ids) and the per-row toggle (one id).
  // Disabling sets active=false, which hides the product from every customer path; it is the
  // "soft delete" that replaced hard delete.
  const activeMutation = useMutation({
    mutationFn: (vars: { ids: number[]; active: boolean }) =>
      setProductsActive(vars.ids, vars.active),
    onSuccess: async () => {
      await invalidate();
      setRowSelection({});
    },
  });

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'select',
        header: ({ table }) => (
          <Check
            aria-label="Select all"
            checked={table.getIsAllRowsSelected()}
            indeterminate={table.getIsSomeRowsSelected()}
            onChange={() => table.toggleAllRowsSelected()}
          />
        ),
        cell: ({ row }) => (
          <Check
            aria-label={`Select ${row.original.sku}`}
            checked={row.getIsSelected()}
            onChange={() => row.toggleSelected()}
          />
        ),
      }),
      columnHelper.accessor('sku', { header: 'SKU' }),
      columnHelper.accessor('name', { header: 'Name' }),
      columnHelper.accessor('productType', {
        header: 'Type',
        cell: (info) => <Badge variant="muted">{info.getValue()}</Badge>,
      }),
      columnHelper.accessor('basePrice', {
        header: 'Price',
        cell: (info) => formatPrice(info.getValue(), info.row.original.currency),
      }),
      columnHelper.accessor('active', {
        header: 'Status',
        cell: (info) =>
          info.getValue() ? (
            <Badge variant="success">Active</Badge>
          ) : (
            <Badge variant="warning">Inactive</Badge>
          ),
      }),
      columnHelper.display({
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: (info) => {
          const p = info.row.original;
          return (
            <div className="flex justify-end gap-1">
              <RoleGate permission="product:write">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Edit"
                  onClick={() => {
                    setFormError(null);
                    setEditing(p);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </RoleGate>
              <RoleGate permission="product:write">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={p.active ? 'Disable' : 'Enable'}
                  title={p.active ? 'Disable' : 'Enable'}
                  disabled={activeMutation.isPending}
                  onClick={() => activeMutation.mutate({ ids: [p.id], active: !p.active })}
                >
                  {p.active ? (
                    <PowerOff className="h-4 w-4 text-destructive" />
                  ) : (
                    <Power className="h-4 w-4 text-emerald-600" />
                  )}
                </Button>
              </RoleGate>
            </div>
          );
        },
      }),
    ],
    [activeMutation.isPending],
  );

  const table = useReactTable({
    data: products,
    columns,
    state: { globalFilter: search, rowSelection },
    onGlobalFilterChange: setSearch,
    onRowSelectionChange: setRowSelection,
    globalFilterFn: globalFilter,
    getRowId: (p) => String(p.id),
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const selectedIds = table
    .getSelectedRowModel()
    .rows.map((r) => r.original.id);

  const dialogOpen = creating || editing !== null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground">
            Manage the catalog — create, edit, and enable or disable products.
          </p>
        </div>
        <RoleGate permission="product:write">
          <Button
            onClick={() => {
              setFormError(null);
              setCreating(true);
            }}
          >
            <Plus className="h-4 w-4" />
            New product
          </Button>
        </RoleGate>
      </div>

      <div className="flex items-center gap-3">
        <Input
          placeholder="Search by SKU, name, or category…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        {selectedIds.length > 0 && (
          <RoleGate permission="product:write">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {selectedIds.length} selected
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={activeMutation.isPending}
                onClick={() => activeMutation.mutate({ ids: selectedIds, active: true })}
              >
                <Power className="h-4 w-4" />
                Enable
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={activeMutation.isPending}
                onClick={() => activeMutation.mutate({ ids: selectedIds, active: false })}
              >
                <PowerOff className="h-4 w-4" />
                Disable
              </Button>
            </div>
          </RoleGate>
        )}
      </div>

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
                  Failed to load products.
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
                <TableRow key={row.id} className={row.original.active ? undefined : 'opacity-60'}>
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
        open={dialogOpen}
        onClose={() => {
          setEditing(null);
          setCreating(false);
        }}
        title={editing ? 'Edit product' : 'New product'}
        description={editing ? `Editing ${editing.sku}` : 'Add a product to the catalog.'}
      >
        <ProductFormSection
          editing={editing}
          submitting={saveMutation.isPending}
          formError={formError}
          onSubmit={(body) =>
            saveMutation.mutate({ id: editing ? editing.id : null, body })
          }
          onCancel={() => {
            setEditing(null);
            setCreating(false);
          }}
        />
      </Dialog>
    </div>
  );
}

function ProductFormSection({
  editing,
  submitting,
  formError,
  onSubmit,
  onCancel,
}: {
  editing: Product | null;
  submitting: boolean;
  formError: string | null;
  onSubmit: (body: ProductWriteRequest) => void;
  onCancel: () => void;
}) {
  // Remount the form when switching between create/edit/different rows so RHF re-seeds defaults.
  return (
    <ProductForm
      key={editing?.id ?? 'new'}
      product={editing}
      submitting={submitting}
      serverError={formError}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />
  );
}
