import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { PRODUCT_TYPES } from '@/types';
import type { Product, ProductType, ProductWriteRequest } from '@/types';

const schema = z.object({
  sku: z.string().min(1, 'SKU is required'),
  name: z.string().min(1, 'Name is required'),
  description: z.string(),
  productType: z.enum(['PHYSICAL', 'DIGITAL', 'SERVICE', 'SUBSCRIPTION', 'RENTAL']),
  category: z.string(),
  basePrice: z.coerce.number().min(0, 'Price must be ≥ 0'),
  currency: z.string().min(1, 'Currency is required'),
  imageUrl: z.string(),
  active: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

function toDefaults(product: Product | null): FormValues {
  return {
    sku: product?.sku ?? '',
    name: product?.name ?? '',
    description: product?.description ?? '',
    productType: (product?.productType ?? 'PHYSICAL') as ProductType,
    category: product?.category ?? '',
    basePrice: product?.basePrice ?? 0,
    currency: product?.currency ?? 'INR',
    imageUrl: product?.imageUrl ?? '',
    active: product?.active ?? true,
  };
}

function toRequest(v: FormValues): ProductWriteRequest {
  return {
    sku: v.sku.trim(),
    name: v.name.trim(),
    description: v.description.trim() || null,
    productType: v.productType,
    category: v.category.trim() || null,
    basePrice: v.basePrice,
    currency: v.currency.trim().toUpperCase(),
    imageUrl: v.imageUrl.trim() || null,
    active: v.active,
  };
}

interface ProductFormProps {
  product: Product | null;
  submitting: boolean;
  serverError: string | null;
  onSubmit: (body: ProductWriteRequest) => void;
  onCancel: () => void;
}

export function ProductForm({
  product,
  submitting,
  serverError,
  onSubmit,
  onCancel,
}: ProductFormProps) {
  const isEdit = product !== null;
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: toDefaults(product) });

  return (
    <form onSubmit={handleSubmit((v) => onSubmit(toRequest(v)))} className="space-y-4" noValidate>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="sku">SKU</Label>
          <Input id="sku" disabled={isEdit} {...register('sku')} />
          {errors.sku ? <p className="text-xs text-destructive">{errors.sku.message}</p> : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" {...register('name')} />
          {errors.name ? <p className="text-xs text-destructive">{errors.name.message}</p> : null}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Input id="description" {...register('description')} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="productType">Type</Label>
          <Select id="productType" {...register('productType')}>
            {PRODUCT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="category">Category</Label>
          <Input id="category" {...register('category')} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="basePrice">Base price</Label>
          <Input id="basePrice" type="number" step="0.01" min="0" {...register('basePrice')} />
          {errors.basePrice ? (
            <p className="text-xs text-destructive">{errors.basePrice.message}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="currency">Currency</Label>
          <Input id="currency" {...register('currency')} />
          {errors.currency ? (
            <p className="text-xs text-destructive">{errors.currency.message}</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="imageUrl">Image URL</Label>
        <Input id="imageUrl" {...register('imageUrl')} />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4" {...register('active')} />
        Active (visible in storefront)
      </label>

      {serverError ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {serverError}
        </p>
      ) : null}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create product'}
        </Button>
      </div>
    </form>
  );
}
