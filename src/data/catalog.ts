import type { CatalogData, Category, CelebrityLook, Product } from "../types";

export const productPhotos = [
  "/assets/look-01.jpg",
  "/assets/look-02.jpg",
  "/assets/wax-front.jpg",
  "/assets/wax-waist.jpg",
  "/assets/wax-detail.jpg",
  "/assets/wax-back.jpg",
  "/assets/look-03.jpg",
];

export const catalogHeroPhotos = [
  "/assets/catalog-01.jpg",
  "/assets/catalog-02.jpg",
  "/assets/catalog-03.jpg",
];

export const celebrityLooks: CelebrityLook[] = [
  {
    name: "",
    image: "/assets/star-look-01.jpg",
    showText: false,
  },
  {
    name: "",
    image: "/assets/star-prince.jpg",
    showText: false,
  },
  {
    name: "",
    image: "/assets/star-look-03.jpg",
    showText: false,
  },
  {
    name: "",
    image: "/assets/star-after.jpg",
    showText: false,
  },
];

export const products: Product[] = [
  {
    id: "BLPFJ",
    title: "Black Leather Patch Flared Jeans",
    price: 12000,
    category: "jeans",
    fulfillment: "stock",
    sizes: ["ONE SIZE"],
    images: [
      productPhotos[2],
      productPhotos[3],
      productPhotos[4],
      productPhotos[5],
      productPhotos[0],
      productPhotos[1],
      productPhotos[6],
    ],
    desc:
      "Прокрашивание в несколько слоев с серебрянным напылением, скини клеш фит, множество фурнитуры и деталей сделанных вручную.\nВставки и подкладки из натуральной кожи.\nНа шнуровке с регулировкой талии. В ЕДИНСТВЕННОМ ЭКЗЕМПЛЯРЕ.",
  },
];

export const catalogCategories: Category[] = [
  { id: "all", label: "Все" },
  { id: "jeans", label: "Джинсы" },
];

export const fallbackCatalog: CatalogData = {
  products,
  categories: catalogCategories,
  catalogHeroPhotos,
  celebrityLooks,
};

export function getProducts() {
  return products;
}

export function getProductById(id: string) {
  return products.find((product) => product.id === id) ?? products[0];
}
