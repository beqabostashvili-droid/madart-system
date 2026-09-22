/**
 * Sample catalog used by the seed. Prices in tetri.
 * Production settings are internal data and live next to the product here
 * only for seeding convenience – in the DB they are separate rows.
 */
export interface SeedCategory {
  code: string;
  nameKa: string;
  nameEn: string;
  nameRu: string;
  sortOrder: number;
}

export interface SeedProduct {
  sku: string;
  category: string;
  nameKa: string;
  nameEn: string;
  nameRu: string;
  descriptionKa?: string;
  descriptionEn?: string;
  price: number;
  imageUrl?: string;
  production: {
    required: boolean;
    station?: string;
    minutes: number;
    buffer?: number;
    capacityUnits?: number;
  };
  availableMobile?: boolean;
  recommends?: string[];
}

export const seedCategories: SeedCategory[] = [
  { code: 'CAKES', nameKa: 'ტორტები', nameEn: 'Cakes', nameRu: 'Торты', sortOrder: 1 },
  { code: 'PASTRIES', nameKa: 'ნამცხვრები', nameEn: 'Pastries', nameRu: 'Пирожные', sortOrder: 2 },
  { code: 'ECLAIRS', nameKa: 'ეკლერები', nameEn: 'Eclairs', nameRu: 'Эклеры', sortOrder: 3 },
  { code: 'CHOUX', nameKa: 'შუ', nameEn: 'Choux', nameRu: 'Шу', sortOrder: 4 },
  { code: 'KHACHAPURI', nameKa: 'ხაჭაპური', nameEn: 'Khachapuri', nameRu: 'Хачапури', sortOrder: 5 },
  { code: 'LOBIANI', nameKa: 'ლობიანი', nameEn: 'Lobiani', nameRu: 'Лобиани', sortOrder: 6 },
  { code: 'DRINKS', nameKa: 'სასმელები', nameEn: 'Drinks', nameRu: 'Напитки', sortOrder: 7 },
  { code: 'OTHER', nameKa: 'სხვა', nameEn: 'Other', nameRu: 'Другое', sortOrder: 8 },
];

export const seedStations = [
  { code: 'HOT_KITCHEN', name: 'ცხელი სამზარეულო', color: '#ea580c', sortOrder: 1 },
  { code: 'PASTRY', name: 'საკონდიტრო', color: '#db2777', sortOrder: 2 },
  { code: 'CAKE', name: 'ტორტები', color: '#7c3aed', sortOrder: 3 },
  { code: 'COFFEE', name: 'ყავა / ბარი', color: '#92400e', sortOrder: 4 },
  { code: 'PACKAGING', name: 'შეფუთვა', color: '#0891b2', sortOrder: 5 },
];

// Real product photos from the public madart.ge catalog (same thumb endpoint the importer uses).
const madart = (file: string) => `https://madart.ge/thumb.php?img=product/${file}.jpg&x=800&y=600&render=crop`;
const PLACEHOLDER = 'https://madart.ge/inc_files/images/product_icon.png';
const IMAGES: Record<string, string> = {
  khachapuri: madart('e71b4066cc3c60127446a56002a07844'),
  acharuli: madart('926eb24094b9ea452ca63b80f2fea4ac'),
  lobiani: madart('087dbae1724570245f3f42c2372f7c99'),
  'eclair-vanilla': madart('3fdfdc73f62cb281311da1d4214c53f7'),
  'eclair-choco': madart('3db37d1d31c6bf8da03b1a893c031603'),
  choux: madart('553c09c330f3bc215d4c026dc2482b44'),
  napoleon: madart('3b62aa6e82641f423f63bbbc7fc15bf5'),
  medovik: madart('cdd6d43053dd1733f283c7bc4f13e617'),
  tiramisu: madart('d1d8df92b02f93be9350ba857c0894ec'),
  'cake-choco': madart('98bf05e3c4054f26a7dcc851a4ddf53c'),
  'cake-fruit': madart('1c16251f8d3192f29180add4a80c90ba'),
  americano: PLACEHOLDER,
  cappuccino: PLACEHOLDER,
  lemonade: madart('d81a2c9e4db961b11fcb2d962cfd8403'),
  water: madart('5df936155314faf12428a594ac0cae8a'),
  giftbox: madart('13f102d984a148a146d4f6c342951b92'),
};
const img = (name: string) => IMAGES[name] ?? PLACEHOLDER;

export const seedProducts: SeedProduct[] = [
  // Khachapuri / hot kitchen – the critical scenario products
  {
    sku: 'KH-IMERULI',
    category: 'KHACHAPURI',
    nameKa: 'ხაჭაპური იმერული',
    nameEn: 'Imeruli Khachapuri',
    nameRu: 'Хачапури по-имеретински',
    descriptionKa: 'ტრადიციული იმერული ხაჭაპური ცხელ-ცხელი',
    descriptionEn: 'Traditional Imeretian cheese bread, served hot',
    price: 1400,
    imageUrl: img('khachapuri'),
    production: { required: true, station: 'HOT_KITCHEN', minutes: 30, buffer: 0, capacityUnits: 1 },
    recommends: ['DR-LEMONADE', 'LB-CLASSIC'],
  },
  {
    sku: 'KH-ACHARULI',
    category: 'KHACHAPURI',
    nameKa: 'ხაჭაპური აჭარული',
    nameEn: 'Acharuli Khachapuri',
    nameRu: 'Хачапури по-аджарски',
    price: 1800,
    imageUrl: img('acharuli'),
    production: { required: true, station: 'HOT_KITCHEN', minutes: 35, buffer: 0, capacityUnits: 2 },
  },
  {
    sku: 'LB-CLASSIC',
    category: 'LOBIANI',
    nameKa: 'ლობიანი',
    nameEn: 'Lobiani',
    nameRu: 'Лобиани',
    descriptionKa: 'ლობიოთი გამომცხვარი ტრადიციული ღვეზელი',
    price: 900,
    imageUrl: img('lobiani'),
    production: { required: true, station: 'HOT_KITCHEN', minutes: 10, buffer: 0 },
  },
  // Pastry
  {
    sku: 'EC-VANILLA',
    category: 'ECLAIRS',
    nameKa: 'ეკლერი ვანილით',
    nameEn: 'Vanilla Eclair',
    nameRu: 'Эклер ванильный',
    price: 650,
    imageUrl: img('eclair-vanilla'),
    production: { required: true, station: 'PASTRY', minutes: 2, buffer: 0 },
  },
  {
    sku: 'EC-CHOCO',
    category: 'ECLAIRS',
    nameKa: 'ეკლერი შოკოლადით',
    nameEn: 'Chocolate Eclair',
    nameRu: 'Эклер шоколадный',
    price: 690,
    imageUrl: img('eclair-choco'),
    production: { required: true, station: 'PASTRY', minutes: 2, buffer: 0 },
  },
  {
    sku: 'SH-CARAMEL',
    category: 'CHOUX',
    nameKa: 'შუ კარამელით',
    nameEn: 'Caramel Choux',
    nameRu: 'Шу с карамелью',
    price: 580,
    imageUrl: img('choux'),
    production: { required: true, station: 'PASTRY', minutes: 2 },
  },
  {
    sku: 'PS-NAPOLEON',
    category: 'PASTRIES',
    nameKa: 'ნაპოლეონი',
    nameEn: 'Napoleon',
    nameRu: 'Наполеон',
    price: 850,
    imageUrl: img('napoleon'),
    production: { required: true, station: 'PASTRY', minutes: 3 },
  },
  {
    sku: 'PS-MEDOVIK',
    category: 'PASTRIES',
    nameKa: 'მედოვიკი',
    nameEn: 'Medovik',
    nameRu: 'Медовик',
    price: 820,
    imageUrl: img('medovik'),
    production: { required: true, station: 'PASTRY', minutes: 3 },
  },
  {
    sku: 'PS-TIRAMISU',
    category: 'PASTRIES',
    nameKa: 'ტირამისუ',
    nameEn: 'Tiramisu',
    nameRu: 'Тирамису',
    price: 990,
    imageUrl: img('tiramisu'),
    production: { required: true, station: 'PASTRY', minutes: 3 },
  },
  // Cakes
  {
    sku: 'CK-CHOCO-1KG',
    category: 'CAKES',
    nameKa: 'შოკოლადის ტორტი 1 კგ',
    nameEn: 'Chocolate Cake 1 kg',
    nameRu: 'Шоколадный торт 1 кг',
    price: 6500,
    imageUrl: img('cake-choco'),
    production: { required: true, station: 'CAKE', minutes: 20, buffer: 5, capacityUnits: 4 },
  },
  {
    sku: 'CK-FRUIT-1KG',
    category: 'CAKES',
    nameKa: 'ხილის ტორტი 1 კგ',
    nameEn: 'Fruit Cake 1 kg',
    nameRu: 'Фруктовый торт 1 кг',
    price: 7200,
    imageUrl: img('cake-fruit'),
    production: { required: true, station: 'CAKE', minutes: 20, buffer: 5, capacityUnits: 4 },
  },
  // Drinks
  {
    sku: 'DR-AMERICANO',
    category: 'DRINKS',
    nameKa: 'ამერიკანო',
    nameEn: 'Americano',
    nameRu: 'Американо',
    price: 550,
    imageUrl: img('americano'),
    production: { required: true, station: 'COFFEE', minutes: 3 },
  },
  {
    sku: 'DR-CAPPUCCINO',
    category: 'DRINKS',
    nameKa: 'კაპუჩინო',
    nameEn: 'Cappuccino',
    nameRu: 'Капучино',
    price: 700,
    imageUrl: img('cappuccino'),
    production: { required: true, station: 'COFFEE', minutes: 4 },
  },
  {
    sku: 'DR-LEMONADE',
    category: 'DRINKS',
    nameKa: 'ლიმონათი 0.5 ლ',
    nameEn: 'Lemonade 0.5 l',
    nameRu: 'Лимонад 0.5 л',
    price: 350,
    imageUrl: img('lemonade'),
    production: { required: false, minutes: 0 },
  },
  {
    sku: 'DR-WATER',
    category: 'DRINKS',
    nameKa: 'წყალი 0.5 ლ',
    nameEn: 'Water 0.5 l',
    nameRu: 'Вода 0.5 л',
    price: 200,
    imageUrl: img('water'),
    production: { required: false, minutes: 0 },
  },
  // Other – a deterministic mock-failure product (total ending in 99, A-10)
  {
    sku: 'OT-GIFTBOX',
    category: 'OTHER',
    nameKa: 'სასაჩუქრე ყუთი',
    nameEn: 'Gift Box',
    nameRu: 'Подарочная коробка',
    price: 1299,
    imageUrl: img('giftbox'),
    production: { required: true, station: 'PACKAGING', minutes: 5 },
  },
];
