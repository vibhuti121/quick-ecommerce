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
import { Pencil, Plus, Trash2 } from 'lucide-react';
import {
  createProduct,
  deleteProduct,
  listProducts,
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

export function Products() {
  const queryClient = useQueryClient();
  const { data: products = [], isLoading, isError } = useQuery({
    queryKey: ['products'],
    queryFn: () => listProducts(),
  });

  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

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

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteProduct(id),
    onSuccess: async () => {
      await invalidate();
      setDeleting(null);
    },
  });

  const columns = useMemo(
    () => [
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
        cell: (info) => (
          <div className="flex justify-end gap-1">
            <RoleGate permission="product:write">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Edit"
                onClick={() => {
                  setFormError(null);
                  setEditing(info.row.original);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </RoleGate>
            <RoleGate permission="product:delete">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete"
                onClick={() => setDeleting(info.row.original)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </RoleGate>
          </div>
        ),
      }),
    ],
    [],
  );

  const table = useReactTable({
    data: products,
    columns,
    state: { globalFilter: search },
    onGlobalFilterChange: setSearch,
    globalFilterFn: globalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const dialogOpen = creating || editing !== null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground">
            Manage the catalog — create, edit, and remove products.
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

      <Input
        placeholder="Search by SKU, name, or category…"
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

      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete product"
        description={
          deleting ? `This permanently removes ${deleting.sku} — ${deleting.name}.` : undefined
        }
      >
        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => setDeleting(null)}
            disabled={deleteMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => deleting && deleteMutation.mutate(deleting.id)}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
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
