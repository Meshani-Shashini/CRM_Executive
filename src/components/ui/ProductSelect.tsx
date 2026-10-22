import type { Pipeline, ProductCode } from '../../types';
import { useApp } from '../../store/AppContext';

interface ProductSelectProps {
  pipelines: Pipeline[];
  value: string;
  name?: string;
  required?: boolean;
  onChange: (product?: ProductCode) => void;
}

const PRODUCT_CATEGORIES = ['Bonds', 'Engineering', 'Fire', 'Marine', 'Miscellaneous', 'Health'];

/** Selects from the shared product catalog. Product creation and editing is admin-only in Settings. */
export default function ProductSelect({ value, name = 'productCode', required, onChange }: ProductSelectProps) {
  const { products } = useApp();

  return (
    <select
      className="input"
      name={name}
      value={value}
      required={required}
      onChange={(event) => onChange(products.find((product) => product.code === event.target.value))}
    >
      <option value="">Select product</option>
      {PRODUCT_CATEGORIES.map((category) => (
        <optgroup key={category} label={category}>
          {products.filter((product) => product.category === category).map((product) => (
            <option key={product.code} value={product.code}>{product.code} · {product.name}</option>
          ))}
        </optgroup>
      ))}
      {products.filter((product) => !PRODUCT_CATEGORIES.includes(product.category)).map((product) => (
        <option key={product.code} value={product.code}>{product.code} · {product.name}</option>
      ))}
    </select>
  );
}
