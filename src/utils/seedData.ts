import { Customer, Lead, Product, ShelfScan, ShopProfile, Transaction } from '../types/index.js';

export const DEMO_SHOP_ID = 'shop-demo';

export const initialShopProfile: ShopProfile = {
  id: DEMO_SHOP_ID,
  name: 'Gupta Kirana & General Store',
  owner: 'Ramesh Gupta',
  owner_phone: '9811234567',
  upi_id: 'guptakirana@okaxis',
  language: 'hinglish',
  created_at: '2026-09-01T09:00:00Z',
  // false so the onboarding / data-use notice is shown on first launch
  consent_accepted: false,
  address: 'Shop No. 4, Main Market, Gali No. 2, New Delhi',
  reminder_settings: { default_tone: 'polite', language: 'hinglish' },
};

export const initialCustomers: Customer[] = [
  { shop_id: DEMO_SHOP_ID, id: 'c-1', name: 'Sharma Ji (Gali 3)', phone: '9871234501', note: 'Regular customer, school teacher', created_at: '2026-09-01T10:00:00Z', consent_given_at: '2026-09-01T10:00:00Z', avatar_color: 'bg-emerald-600' },
  { shop_id: DEMO_SHOP_ID, id: 'c-2', name: 'Sunita Verma', phone: '9811987602', note: 'Flat 204, pays 1st of every month', created_at: '2026-09-02T11:30:00Z', consent_given_at: '2026-09-02T11:30:00Z', avatar_color: 'bg-indigo-600' },
  { shop_id: DEMO_SHOP_ID, id: 'c-3', name: 'Manoj Tailor', phone: '9822334403', note: 'Near Post Office', created_at: '2026-09-05T14:15:00Z', consent_given_at: '2026-09-05T14:15:00Z', avatar_color: 'bg-amber-600' },
  { shop_id: DEMO_SHOP_ID, id: 'c-4', name: 'Pooja Tiwari', phone: '9711556604', note: 'House 12B, milk & dahi everyday', created_at: '2026-09-10T09:00:00Z', consent_given_at: '2026-09-10T09:00:00Z', avatar_color: 'bg-rose-600' },
  { shop_id: DEMO_SHOP_ID, id: 'c-5', name: 'Rajesh Sweet Shop', phone: '9910445505', note: 'Bulk sugar & maida buyer', created_at: '2026-09-12T16:20:00Z', consent_given_at: '2026-09-12T16:20:00Z', avatar_color: 'bg-cyan-600' },
  { shop_id: DEMO_SHOP_ID, id: 'c-6', name: 'Anil Auto Wale Bhaiya', phone: '9899112206', note: 'Corner auto stand', created_at: '2026-09-15T08:45:00Z', consent_given_at: '2026-09-15T08:45:00Z', avatar_color: 'bg-purple-600' },
  { shop_id: DEMO_SHOP_ID, id: 'c-7', name: 'Dr. Ashok Pandey', phone: '9810887707', note: 'Clinic next door, pays on Sunday', created_at: '2026-09-18T18:00:00Z', consent_given_at: '2026-09-18T18:00:00Z', avatar_color: 'bg-teal-600' },
  { shop_id: DEMO_SHOP_ID, id: 'c-8', name: 'Kavita Chachi', phone: '9873221108', note: 'Gali 1, monthly ration', created_at: '2026-09-20T12:00:00Z', consent_given_at: '2026-09-20T12:00:00Z', avatar_color: 'bg-orange-600' },
  { shop_id: DEMO_SHOP_ID, id: 'c-9', name: 'Vikram Singh (Contractor)', phone: '9818665509', note: 'Construction site tea & snacks', created_at: '2026-09-22T17:30:00Z', consent_given_at: '2026-09-22T17:30:00Z', avatar_color: 'bg-red-600' },
  { shop_id: DEMO_SHOP_ID, id: 'c-10', name: 'Deepak Barber', phone: '9870332210', note: 'Saloon nearby', created_at: '2026-09-25T11:00:00Z', consent_given_at: '2026-09-25T11:00:00Z', avatar_color: 'bg-blue-600' },
  { shop_id: DEMO_SHOP_ID, id: 'c-11', name: 'Geeta Bhabhi', phone: '9958774411', note: 'Daily dairy & biscuits', created_at: '2026-10-01T10:10:00Z', consent_given_at: '2026-10-01T10:10:00Z', avatar_color: 'bg-pink-600' },
  { shop_id: DEMO_SHOP_ID, id: 'c-12', name: 'Mohit Gym Trainer', phone: '', note: 'Brown bread, eggs, peanut butter', created_at: '2026-10-05T19:30:00Z', consent_given_at: null, avatar_color: 'bg-lime-600' },
];

// Helper to make dates relative to current time
const now = Date.now();
const dayMs = 24 * 60 * 60 * 1000;
const d = (daysAgo: number, hours = 10, minutes = 30) => {
  const dt = new Date(now - daysAgo * dayMs);
  dt.setHours(hours, minutes, 0, 0);
  return dt.toISOString();
};

export const initialTransactions: Transaction[] = [
  // Sharma Ji (c-1) - Overdue
  { shop_id: DEMO_SHOP_ID, id: 't-1', customer_id: 'c-1', type: 'credit', amount_paise: 120000, note: 'Atta 10kg, Mustard Oil 2L', confirmed_at: d(36), source: 'manual' },
  { shop_id: DEMO_SHOP_ID, id: 't-2', customer_id: 'c-1', type: 'payment', amount_paise: 40000, note: 'Cash payment', confirmed_at: d(32), source: 'manual' },
  { shop_id: DEMO_SHOP_ID, id: 't-3', customer_id: 'c-1', type: 'credit', amount_paise: 65000, note: 'Surf Excel, Bath Soap, Toothpaste', confirmed_at: d(28), source: 'voice' },
  { shop_id: DEMO_SHOP_ID, id: 't-4', customer_id: 'c-1', type: 'credit', amount_paise: 35000, note: 'Red Label Tea, Sugar 2kg', confirmed_at: d(15), source: 'voice' },
  // Sunita Verma (c-2) - High pending
  { shop_id: DEMO_SHOP_ID, id: 't-5', customer_id: 'c-2', type: 'credit', amount_paise: 240000, note: 'Monthly ration list 1', confirmed_at: d(38), source: 'manual' },
  { shop_id: DEMO_SHOP_ID, id: 't-6', customer_id: 'c-2', type: 'payment', amount_paise: 150000, note: 'UPI Google Pay', confirmed_at: d(25), source: 'manual' },
  { shop_id: DEMO_SHOP_ID, id: 't-7', customer_id: 'c-2', type: 'credit', amount_paise: 85000, note: 'Fortune Refined oil, Biscuits', confirmed_at: d(12), source: 'text' },
  { shop_id: DEMO_SHOP_ID, id: 't-8', customer_id: 'c-2', type: 'credit', amount_paise: 45000, note: 'Detergent & scrubber', confirmed_at: d(5), source: 'voice' },
  // Manoj Tailor (c-3) - Overdue 35+ days
  { shop_id: DEMO_SHOP_ID, id: 't-9', customer_id: 'c-3', type: 'credit', amount_paise: 180000, note: 'Groceries for shop opening', confirmed_at: d(42), source: 'manual' },
  { shop_id: DEMO_SHOP_ID, id: 't-10', customer_id: 'c-3', type: 'payment', amount_paise: 50000, note: 'Cash', confirmed_at: d(34), source: 'manual' },
  // Pooja Tiwari (c-4) - Regular
  { shop_id: DEMO_SHOP_ID, id: 't-11', customer_id: 'c-4', type: 'credit', amount_paise: 32000, note: 'Amul Butter, Bread, Milk', confirmed_at: d(18), source: 'voice' },
  { shop_id: DEMO_SHOP_ID, id: 't-12', customer_id: 'c-4', type: 'payment', amount_paise: 32000, note: 'PhonePe paid', confirmed_at: d(16), source: 'manual' },
  { shop_id: DEMO_SHOP_ID, id: 't-13', customer_id: 'c-4', type: 'credit', amount_paise: 46000, note: 'Eggs, Maggi 4 pack, Chips', confirmed_at: d(4), source: 'voice' },
  // Rajesh Sweet Shop (c-5) - Large numbers
  { shop_id: DEMO_SHOP_ID, id: 't-14', customer_id: 'c-5', type: 'credit', amount_paise: 650000, note: 'Sugar 50kg bag', confirmed_at: d(22), source: 'manual' },
  { shop_id: DEMO_SHOP_ID, id: 't-15', customer_id: 'c-5', type: 'payment', amount_paise: 400000, note: 'Bank transfer', confirmed_at: d(10), source: 'manual' },
  { shop_id: DEMO_SHOP_ID, id: 't-16', customer_id: 'c-5', type: 'credit', amount_paise: 280000, note: 'Refined Oil 15L tin', confirmed_at: d(3), source: 'manual' },
  // Anil Auto (c-6) - Small daily
  { shop_id: DEMO_SHOP_ID, id: 't-17', customer_id: 'c-6', type: 'credit', amount_paise: 18000, note: 'Cigarette, Cold drink', confirmed_at: d(20), source: 'voice' },
  { shop_id: DEMO_SHOP_ID, id: 't-18', customer_id: 'c-6', type: 'payment', amount_paise: 18000, note: 'Cash', confirmed_at: d(18), source: 'manual' },
  { shop_id: DEMO_SHOP_ID, id: 't-19', customer_id: 'c-6', type: 'credit', amount_paise: 24000, note: 'Snacks & water bottle', confirmed_at: d(2), source: 'voice' },
  // Dr. Ashok Pandey (c-7) - Settled & recent
  { shop_id: DEMO_SHOP_ID, id: 't-20', customer_id: 'c-7', type: 'credit', amount_paise: 95000, note: 'Dry fruits, Biscuits, Green tea', confirmed_at: d(14), source: 'manual' },
  { shop_id: DEMO_SHOP_ID, id: 't-21', customer_id: 'c-7', type: 'payment', amount_paise: 95000, note: 'Paytm UPI full settlement', confirmed_at: d(7), source: 'manual' },
  { shop_id: DEMO_SHOP_ID, id: 't-22', customer_id: 'c-7', type: 'credit', amount_paise: 38000, note: 'Tata Salt, Spices, Ghee 500g', confirmed_at: d(1), source: 'voice' },
  // Kavita Chachi (c-8) - Overdue
  { shop_id: DEMO_SHOP_ID, id: 't-23', customer_id: 'c-8', type: 'credit', amount_paise: 215000, note: 'Rice 10kg, Pulses, Masala', confirmed_at: d(39), source: 'manual' },
  { shop_id: DEMO_SHOP_ID, id: 't-24', customer_id: 'c-8', type: 'payment', amount_paise: 60000, note: 'Part payment', confirmed_at: d(27), source: 'manual' },
  { shop_id: DEMO_SHOP_ID, id: 't-25', customer_id: 'c-8', type: 'credit', amount_paise: 48000, note: 'Cooking oil 1L pouch', confirmed_at: d(11), source: 'text' },
  // Vikram Contractor (c-9) - High overdue
  { shop_id: DEMO_SHOP_ID, id: 't-26', customer_id: 'c-9', type: 'credit', amount_paise: 420000, note: 'Labour ration & tea supplies', confirmed_at: d(44), source: 'manual' },
  { shop_id: DEMO_SHOP_ID, id: 't-27', customer_id: 'c-9', type: 'payment', amount_paise: 120000, note: 'Cash part payment', confirmed_at: d(31), source: 'manual' },
  { shop_id: DEMO_SHOP_ID, id: 't-28', customer_id: 'c-9', type: 'credit', amount_paise: 110000, note: 'Biscuits cartons, sugar', confirmed_at: d(17), source: 'manual' },
  // Deepak Barber (c-10) - Good payer
  { shop_id: DEMO_SHOP_ID, id: 't-29', customer_id: 'c-10', type: 'credit', amount_paise: 52000, note: 'Dettol liquid, Savlon, Cotton', confirmed_at: d(15), source: 'manual' },
  { shop_id: DEMO_SHOP_ID, id: 't-30', customer_id: 'c-10', type: 'payment', amount_paise: 52000, note: 'UPI clear', confirmed_at: d(8), source: 'manual' },
  { shop_id: DEMO_SHOP_ID, id: 't-31', customer_id: 'c-10', type: 'credit', amount_paise: 34000, note: 'Shaving foam & blades', confirmed_at: d(2), source: 'voice' },
  // Geeta Bhabhi (c-11)
  { shop_id: DEMO_SHOP_ID, id: 't-32', customer_id: 'c-11', type: 'credit', amount_paise: 78000, note: 'Aashirvaad Atta 5kg, Haldi', confirmed_at: d(9), source: 'voice' },
  { shop_id: DEMO_SHOP_ID, id: 't-33', customer_id: 'c-11', type: 'payment', amount_paise: 50000, note: 'Cash', confirmed_at: d(3), source: 'manual' },
  // Mohit Gym (c-12)
  { shop_id: DEMO_SHOP_ID, id: 't-34', customer_id: 'c-12', type: 'credit', amount_paise: 89000, note: 'Oats 1kg, Peanut butter, Honey', confirmed_at: d(6), source: 'text' },
  { shop_id: DEMO_SHOP_ID, id: 't-35', customer_id: 'c-12', type: 'credit', amount_paise: 42000, note: 'Eggs 2 tray, Bread', confirmed_at: d(1), source: 'voice' },
  // Recent 7 days activity
  { shop_id: DEMO_SHOP_ID, id: 't-36', customer_id: 'c-1', type: 'payment', amount_paise: 30000, note: 'Payment received via UPI', confirmed_at: d(0, 9, 15), source: 'manual' },
  { shop_id: DEMO_SHOP_ID, id: 't-37', customer_id: 'c-4', type: 'credit', amount_paise: 15000, note: 'Doodh 2 packet, Bread', confirmed_at: d(0, 8, 30), source: 'voice' },
  { shop_id: DEMO_SHOP_ID, id: 't-38', customer_id: 'c-2', type: 'payment', amount_paise: 40000, note: 'Partial payment', confirmed_at: d(1, 17, 20), source: 'manual' },
  { shop_id: DEMO_SHOP_ID, id: 't-39', customer_id: 'c-11', type: 'credit', amount_paise: 26000, note: 'Good Day biscuits, namkeen', confirmed_at: d(0, 11, 45), source: 'voice' },
  { shop_id: DEMO_SHOP_ID, id: 't-40', customer_id: 'c-6', type: 'payment', amount_paise: 20000, note: 'Aaj ki vasooli', confirmed_at: d(0, 12, 10), source: 'manual' },
  // Counter sales (no customer) for the daily sales tile
  ...[0, 1, 2, 3, 4, 5, 6].map((daysAgo, i): Transaction => ({
    shop_id: DEMO_SHOP_ID,
    id: `s-${daysAgo}`,
    customer_id: null,
    type: 'sale',
    amount_paise: [412000, 386500, 451000, 298000, 520000, 377500, 405000][i],
    note: 'Din ki counter bikri',
    confirmed_at: d(daysAgo, 20, 30),
    source: 'manual',
  })),
];

export const initialProducts: Product[] = [
  { shop_id: DEMO_SHOP_ID, id: 'maggi-70g', name: 'Maggi 2-Minute Masala Noodles (70g)', aliases: ['maggi', 'noodles', 'megi'], category: 'Noodles & Pasta', low_stock_threshold: 24, stock_status: 'low', status_updated_at: d(1, 16, 45), unit: 'pkts', supplier_name: 'Nestle Agency Delhi', supplier_phone: '9811009988', mrp_paise: 1400 },
  { shop_id: DEMO_SHOP_ID, id: 'parle-g-std', name: 'Parle-G Glucose Biscuits (250g)', aliases: ['parle g', 'parle'], category: 'Biscuits', low_stock_threshold: 30, stock_status: 'ok', status_updated_at: d(1, 16, 45), unit: 'pkts', supplier_name: 'Vikas Traders', supplier_phone: '9822110044', mrp_paise: 2000 },
  { shop_id: DEMO_SHOP_ID, id: 'tata-salt', name: 'Tata Salt Vacuum Evaporated (1kg)', aliases: ['namak', 'salt', 'tata namak'], category: 'Staples', low_stock_threshold: 20, stock_status: 'out', status_updated_at: d(1, 16, 45), unit: 'packets', supplier_name: 'Tata Consumer Distributor', supplier_phone: '9876500011', mrp_paise: 2800 },
  { shop_id: DEMO_SHOP_ID, id: 'aashirvaad-atta-10k', name: 'Aashirvaad Superior MP Atta (10kg)', aliases: ['atta', 'aata', 'aashirvaad'], category: 'Flour & Grains', low_stock_threshold: 10, stock_status: 'low', status_updated_at: d(1, 16, 45), unit: 'bags', supplier_name: 'ITC Foods Agency', supplier_phone: '9810123499', mrp_paise: 46000 },
  { shop_id: DEMO_SHOP_ID, id: 'fortune-oil-1l', name: 'Fortune Sunlite Refined Sunflower Oil (1L)', aliases: ['tel', 'oil', 'fortune', 'refined'], category: 'Cooking Oil', low_stock_threshold: 15, stock_status: 'low', status_updated_at: d(1, 16, 45), unit: 'pouches', supplier_name: 'Adani Wilmar Depot', supplier_phone: '9818822334', mrp_paise: 14500 },
  { shop_id: DEMO_SHOP_ID, id: 'red-label-tea-500g', name: 'Brooke Bond Red Label Tea (500g)', aliases: ['chai patti', 'red label', 'chai'], category: 'Beverages', low_stock_threshold: 12, stock_status: 'ok', status_updated_at: d(1, 16, 45), unit: 'boxes', supplier_name: 'HUL Super Stockist', supplier_phone: '9819933445', mrp_paise: 28500 },
  { shop_id: DEMO_SHOP_ID, id: 'surf-excel-1kg', name: 'Surf Excel Easy Wash Detergent Powder (1kg)', aliases: ['surf', 'washing powder', 'sarf'], category: 'Detergents', low_stock_threshold: 12, stock_status: 'low', status_updated_at: d(1, 16, 45), unit: 'pkts', supplier_name: 'HUL Super Stockist', supplier_phone: '9819933445', mrp_paise: 14000 },
  { shop_id: DEMO_SHOP_ID, id: 'colgate-strong-150g', name: 'Colgate Strong Teeth Toothpaste (150g)', aliases: ['colgate', 'manjan', 'toothpaste'], category: 'Oral Care', low_stock_threshold: 15, stock_status: 'ok', status_updated_at: d(1, 16, 45), unit: 'tubes', supplier_name: 'Colgate Palmolive Agency', supplier_phone: '9820011223', mrp_paise: 11000 },
  { shop_id: DEMO_SHOP_ID, id: 'lifebuoy-soap-100g', name: 'Lifebuoy Total Germ Protection Soap (4x100g)', aliases: ['lifebuoy', 'sabun', 'soap'], category: 'Personal Care', low_stock_threshold: 18, stock_status: 'ok', status_updated_at: d(1, 16, 45), unit: 'packs', supplier_name: 'HUL Super Stockist', supplier_phone: '9819933445', mrp_paise: 12000 },
  { shop_id: DEMO_SHOP_ID, id: 'amul-butter-500g', name: 'Amul Pasteurised Butter (500g)', aliases: ['makhan', 'butter', 'amul'], category: 'Dairy & Cold', low_stock_threshold: 10, stock_status: 'low', status_updated_at: d(1, 16, 45), unit: 'bricks', supplier_name: 'Amul Dairy Van Point', supplier_phone: '9811445566', mrp_paise: 27500 },
  { shop_id: DEMO_SHOP_ID, id: 'good-day-cashew', name: 'Britannia Good Day Cashew Cookies (200g)', aliases: ['good day'], category: 'Biscuits', low_stock_threshold: 20, stock_status: 'ok', status_updated_at: d(1, 16, 45), unit: 'pkts', supplier_name: 'Britannia Depot', supplier_phone: '9810556677', mrp_paise: 3500 },
  { shop_id: DEMO_SHOP_ID, id: 'haldiram-aloo-bhujia', name: 'Haldiram Aloo Bhujia Namkeen (400g)', aliases: ['bhujia', 'namkeen', 'haldiram'], category: 'Snacks', low_stock_threshold: 15, stock_status: 'low', status_updated_at: d(1, 16, 45), unit: 'pkts', supplier_name: 'Haldiram Snacks Hub', supplier_phone: '9873344556', mrp_paise: 11500 },
  { shop_id: DEMO_SHOP_ID, id: 'kurkure-masala-munch', name: 'Kurkure Masala Munch (80g)', aliases: ['kurkure'], category: 'Snacks', low_stock_threshold: 25, stock_status: 'ok', status_updated_at: d(1, 16, 45), unit: 'pkts', supplier_name: 'PepsiCo Snack Line', supplier_phone: '9811667788', mrp_paise: 2000 },
  { shop_id: DEMO_SHOP_ID, id: 'dettol-liquid-250ml', name: 'Dettol Antiseptic Liquid (250ml)', aliases: ['dettol'], category: 'Personal Care', low_stock_threshold: 8, stock_status: 'ok', status_updated_at: d(1, 16, 45), unit: 'bottles', supplier_name: 'Reckitt Benckiser Stockist', supplier_phone: '9821122334', mrp_paise: 14800 },
  { shop_id: DEMO_SHOP_ID, id: 'vim-dishwash-bar-300g', name: 'Vim Dishwash Bar with Lemon (300g)', aliases: ['vim', 'bartan sabun'], category: 'Cleaning', low_stock_threshold: 30, stock_status: 'ok', status_updated_at: d(1, 16, 45), unit: 'bars', supplier_name: 'HUL Super Stockist', supplier_phone: '9819933445', mrp_paise: 2500 },
  { shop_id: DEMO_SHOP_ID, id: 'wagh-bakri-tea-500g', name: 'Wagh Bakri Premium Leaf Tea (500g)', aliases: ['wagh bakri', 'chai patti'], category: 'Beverages', low_stock_threshold: 10, stock_status: 'ok', status_updated_at: d(1, 16, 45), unit: 'pkts', supplier_name: 'Gujarat Tea Depot', supplier_phone: '9899114477', mrp_paise: 29000 },
  { shop_id: DEMO_SHOP_ID, id: 'catch-garam-masala-100g', name: 'Catch Super Garam Masala (100g)', aliases: ['garam masala', 'masala'], category: 'Spices', low_stock_threshold: 15, stock_status: 'low', status_updated_at: d(1, 16, 45), unit: 'boxes', supplier_name: 'DS Group Spices', supplier_phone: '9811223388', mrp_paise: 9200 },
  { shop_id: DEMO_SHOP_ID, id: 'daawat-rozana-rice-5k', name: 'Daawat Rozana Super Basmati Rice (5kg)', aliases: ['chawal', 'rice', 'basmati'], category: 'Flour & Grains', low_stock_threshold: 8, stock_status: 'ok', status_updated_at: d(1, 16, 45), unit: 'bags', supplier_name: 'LT Foods Agency', supplier_phone: '9810334455', mrp_paise: 41000 },
  { shop_id: DEMO_SHOP_ID, id: 'everest-turmeric-200g', name: 'Everest Turmeric / Haldi Powder (200g)', aliases: ['haldi', 'turmeric'], category: 'Spices', low_stock_threshold: 16, stock_status: 'ok', status_updated_at: d(1, 16, 45), unit: 'boxes', supplier_name: 'Everest Masala Agency', supplier_phone: '9820445566', mrp_paise: 6800 },
  { shop_id: DEMO_SHOP_ID, id: 'kissan-mixed-fruit-500g', name: 'Kissan Mixed Fruit Jam (500g)', aliases: ['jam', 'kissan'], category: 'Breakfast', low_stock_threshold: 8, stock_status: 'ok', status_updated_at: d(1, 16, 45), unit: 'jars', supplier_name: 'HUL Super Stockist', supplier_phone: '9819933445', mrp_paise: 17500 },
  { shop_id: DEMO_SHOP_ID, id: 'frooti-tetra-150ml', name: 'Frooti Mango Drink (150ml pack of 6)', aliases: ['frooti', 'mango drink'], category: 'Beverages', low_stock_threshold: 20, stock_status: 'ok', status_updated_at: d(1, 16, 45), unit: 'trays', supplier_name: 'Parle Agro Line', supplier_phone: '9811889900', mrp_paise: 6000 },
  { shop_id: DEMO_SHOP_ID, id: 'harpic-toilet-cleaner-1l', name: 'Harpic Power Plus Toilet Cleaner (1L)', aliases: ['harpic'], category: 'Cleaning', low_stock_threshold: 10, stock_status: 'low', status_updated_at: d(1, 16, 45), unit: 'bottles', supplier_name: 'Reckitt Benckiser Stockist', supplier_phone: '9821122334', mrp_paise: 19500 },
  { shop_id: DEMO_SHOP_ID, id: 'cadbury-dairy-milk-silky', name: 'Cadbury Dairy Milk Silk (60g)', aliases: ['dairy milk', 'chocolate', 'silk'], category: 'Chocolates', low_stock_threshold: 24, stock_status: 'ok', status_updated_at: d(1, 16, 45), unit: 'bars', supplier_name: 'Mondelez India Hub', supplier_phone: '9810778899', mrp_paise: 8500 },
  { shop_id: DEMO_SHOP_ID, id: 'bournvita-500g', name: 'Cadbury Bournvita Nutrition Drink (500g)', aliases: ['bournvita'], category: 'Beverages', low_stock_threshold: 10, stock_status: 'low', status_updated_at: d(1, 16, 45), unit: 'jars', supplier_name: 'Mondelez India Hub', supplier_phone: '9810778899', mrp_paise: 24000 },
  { shop_id: DEMO_SHOP_ID, id: 'colgate-maxfresh-150g', name: 'Colgate MaxFresh Spicy Fresh Gel (150g)', aliases: ['maxfresh', 'colgate'], category: 'Oral Care', low_stock_threshold: 12, stock_status: 'ok', status_updated_at: d(1, 16, 45), unit: 'tubes', supplier_name: 'Colgate Palmolive Agency', supplier_phone: '9820011223', mrp_paise: 12500 },
];

export const initialPastScans: ShelfScan[] = [
  {
    shop_id: DEMO_SHOP_ID,
    id: 'scan-1',
    created_at: d(6, 14, 0),
    image_ref: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=400&q=80',
    overall_notes: 'Section 1 (Staples & Noodles): Maggi and Parle-G were well stocked, Tata Salt running low.',
    quality_warning: null,
    detected_items: [
      { name: 'Maggi 2-Minute Masala Noodles', matched_sku: 'maggi-70g', status: 'ok', confidence: 0.94, note: 'Front row full' },
      { name: 'Parle-G Glucose Biscuits', matched_sku: 'parle-g-std', status: 'ok', confidence: 0.98, note: 'Double stacked' },
      { name: 'Tata Salt Vacuum Evaporated', matched_sku: 'tata-salt', status: 'low', confidence: 0.88, note: 'Front row sparse' },
    ],
  },
  {
    shop_id: DEMO_SHOP_ID,
    id: 'scan-2',
    created_at: d(3, 11, 30),
    image_ref: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=400&q=80',
    overall_notes: 'Section 2 (Oils & Detergents): Fortune Oil getting depleted, Surf Excel empty gaps visible.',
    quality_warning: null,
    detected_items: [
      { name: 'Fortune Sunlite Sunflower Oil 1L', matched_sku: 'fortune-oil-1l', status: 'low', confidence: 0.91, note: 'Gap on right side' },
      { name: 'Surf Excel Easy Wash', matched_sku: 'surf-excel-1kg', status: 'low', confidence: 0.86, note: 'Front row empty' },
      { name: 'Vim Dishwash Bar', matched_sku: 'vim-dishwash-bar-300g', status: 'ok', confidence: 0.95, note: 'Stock healthy' },
    ],
  },
  {
    shop_id: DEMO_SHOP_ID,
    id: 'scan-3',
    created_at: d(1, 16, 45),
    image_ref: 'https://images.unsplash.com/photo-1604719312566-8912e9227c6a?auto=format&fit=crop&w=400&q=80',
    overall_notes: 'Section 1 Re-check: Tata Salt completely Out of Stock! Maggi decreased from OK to Low.',
    quality_warning: null,
    detected_items: [
      { name: 'Tata Salt Vacuum Evaporated', matched_sku: 'tata-salt', status: 'out', confidence: 0.97, note: 'Empty gap on shelf' },
      { name: 'Maggi 2-Minute Masala Noodles', matched_sku: 'maggi-70g', status: 'low', confidence: 0.89, note: 'Down from OK to Low' },
      { name: 'Fortune Sunlite Sunflower Oil 1L', matched_sku: 'fortune-oil-1l', status: 'low', confidence: 0.92, note: 'Stock critical' },
    ],
  },
];

/* ------------------------------ CRM demo data ------------------------------ */

export const initialLeads: Lead[] = [
  { id: 'lead-1', shop_id: DEMO_SHOP_ID, name: 'Neha Kapoor', phone: '9811000111', consent_given_at: '2026-11-01T10:00:00Z', tags: ['naya society', 'home delivery'], status: 'new', source: 'Walk-in', note: 'Tower B, Green Park society mein naya shift hua', created_at: '2026-11-01T10:00:00Z' },
  { id: 'lead-2', shop_id: DEMO_SHOP_ID, name: 'Vikas Jain', phone: '9899000222', consent_given_at: '2026-11-03T12:00:00Z', tags: ['bulk', 'diwali'], status: 'interested', source: 'Phone call', note: 'Office pantry ke liye monthly saman', created_at: '2026-11-03T12:00:00Z' },
  { id: 'lead-3', shop_id: DEMO_SHOP_ID, name: 'Farida Khan', phone: '9711000333', consent_given_at: '2026-11-05T09:30:00Z', tags: ['home delivery', 'vip'], status: 'contacted', source: 'Pamphlet', note: '', created_at: '2026-11-05T09:30:00Z' },
  { id: 'lead-4', shop_id: DEMO_SHOP_ID, name: 'Rohit (Gym wale)', phone: '', consent_given_at: null, tags: ['bulk'], status: 'new', source: 'Referral', note: 'Number abhi nahi diya', created_at: '2026-11-08T17:00:00Z' },
];
