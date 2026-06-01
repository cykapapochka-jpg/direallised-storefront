export type CategoryId = "all" | "jeans";

export type ProductCategory = Exclude<CategoryId, "all">;

export interface Product {
  id: string;
  title: string;
  price: number;
  category: ProductCategory;
  sizes: string[];
  images: string[];
  desc: string;
}

export interface Category {
  id: CategoryId;
  label: string;
}

export interface CelebrityLook {
  name: string;
  image: string;
  showText: boolean;
}

export interface CartItem {
  key: string;
  id: string;
  size: string;
  qty: number;
}

export interface CartLine extends CartItem {
  product: Product;
  total: number;
}

export interface OrderFormData {
  contact: string;
  name: string;
  phone: string;
  city: string;
  address: string;
  comment: string;
}
