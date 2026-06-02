export type CategoryId = "all" | "jeans";
export type ProductCategory = Exclude<CategoryId, "all">;

export interface Product {
  id: string;
  title: string;
  price: number;
  category: ProductCategory;
  fulfillment?: "stock" | "preorder";
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

export interface CatalogData {
  products: Product[];
  categories: Category[];
  catalogHeroPhotos: string[];
  celebrityLooks: CelebrityLook[];
}

export interface PromoCode {
  code: string;
  type: "percent" | "fixed";
  value: number;
  active: boolean;
}

export interface StoreData {
  version: number;
  admins: {
    telegramIds: number[];
    usernames: string[];
  };
  catalog: CatalogData;
  promocodes: PromoCode[];
  orders: unknown[];
  botSessions?: Record<string, unknown>;
}
