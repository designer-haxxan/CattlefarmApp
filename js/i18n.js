// Bilingual string table: English and Urdu.
// Usage: import { t, lang, setLang } from './i18n.js'; then t('animals')
import { storageKey } from './config.js';

const LANG_KEY = storageKey('lang');

const STR = {
  en: {
    appName: 'Cattle Farm Manager',
    // Nav sections
    secMain: 'Main', secHerd: 'Herd', secFinance: 'Finance', secAdmin: 'Administration',
    // Routes
    dashboard: 'Dashboard', animals: 'Animals', milk: 'Milk Production',
    health: 'Health Records', breeding: 'Breeding & Pregnancy', weights: 'Weight Records',
    milkSales: 'Milk Sales', animalTxns: 'Animal Transactions', expenses: 'Farm Expenses',
    buyers: 'Buyers', sellers: 'Sellers', accounts: 'Accounts',
    vouchers: 'Cash Book', reports: 'Reports', backup: 'Backup & Restore', settings: 'Settings',
    // Animals
    animal: 'Animal', tagNo: 'Tag No.', name: 'Name', species: 'Species',
    breed: 'Breed', gender: 'Gender', dob: 'Date of Birth', age: 'Age', status: 'Status',
    cattle: 'Cattle (Cow)', buffalo: 'Buffalo', goat: 'Goat', sheep: 'Sheep', other: 'Other',
    female: 'Female', male: 'Male',
    active: 'Active', sold: 'Sold', dead: 'Dead', culled: 'Culled',
    mother: 'Mother', father: 'Father (Sire)', color: 'Color / Markings',
    addAnimal: 'Add Animal', editAnimal: 'Edit Animal',
    photo: 'Photo', photoHint: 'Optional photo (auto-compressed)',
    purchaseDate: 'Purchase Date', purchasePrice: 'Purchase Price',
    // Common Pakistani breeds
    breedSahiwal: 'Sahiwal', breedNiliRavi: 'Nili-Ravi', breedCholistani: 'Cholistani',
    breedFrisian: 'Holstein Frisian', breedJersey: 'Jersey', breedTharparkar: 'Tharparkar',
    breedBhagnari: 'Bhagnari', breedKankrej: 'Kankrej', breedMurrah: 'Murrah',
    // Milk
    milkRecord: 'Milk Record', morning: 'Morning (L)', evening: 'Evening (L)',
    totalMilk: 'Total (L)', liters: 'Liters', addMilkRecord: 'Add Record',
    perAnimal: 'Per Animal', dailyTotal: 'Daily Total', avgPerDay: 'Avg / Day',
    todayMilk: "Today's Milk", thisMonthMilk: 'This Month',
    // Health
    healthEvent: 'Health Event', vaccination: 'Vaccination', treatment: 'Treatment',
    checkup: 'Checkup', deworming: 'Deworming', vitamin: 'Vitamin/Supplement', otherEvent: 'Other',
    medicine: 'Medicine / Vaccine', dose: 'Dose', vetName: 'Veterinarian',
    nextDue: 'Next Due Date', herdWide: 'Herd-wide (all animals)',
    addHealthEvent: 'Add Event', upcomingDue: 'Upcoming Due',
    // Common Pakistani vaccinations
    vacFMD: 'FMD (Foot & Mouth)', vacHS: 'HS (Haemorrhagic Septicaemia)',
    vacBQ: 'BQ (Black Quarter)', vacAnthrax: 'Anthrax', vacBrucella: 'Brucellosis',
    vacLSD: 'LSD (Lumpy Skin)', vacPPR: 'PPR', vacRabies: 'Rabies',
    // Breeding
    breedingRecord: 'Breeding Record', heat: 'Heat / Estrus', insemination: 'Insemination / Mating',
    pregnancyCheck: 'Pregnancy Check', calving: 'Calving', abortion: 'Abortion / Miscarriage',
    dryOff: 'Dry Off', pregnancyStatus: 'Pregnancy Status',
    open: 'Open (Not pregnant)', pregnant: 'Pregnant', calved: 'Calved', aborted: 'Aborted',
    expectedCalving: 'Expected Calving', calvingDate: 'Calving Date',
    calfGender: 'Calf Gender', bullDesc: 'Bull / Semen Used',
    dueForCalving: 'Due for Calving', pregnantAnimals: 'Pregnant Animals',
    addBreedingRecord: 'Add Record',
    // Weights
    weightRecord: 'Weight Record', weight: 'Weight (kg)', addWeight: 'Add Weight',
    latestWeight: 'Latest Weight', weightChange: 'Change',
    // Finance
    buyer: 'Buyer', seller: 'Seller', party: 'Party',
    amount: 'Amount', paid: 'Paid', balance: 'Balance',
    receivable: 'Receivable', payable: 'Payable',
    milkSale: 'Milk Sale', animalSale: 'Animal Sale', animalPurchase: 'Animal Purchase',
    rate: 'Rate / Liter', quantity: 'Quantity (L)', totalAmount: 'Total Amount',
    paymentAccount: 'Payment Account', credit: 'Credit (not paid now)',
    // Expenses
    expense: 'Expense', feedExpense: 'Feed & Fodder', vetExpense: 'Vet & Medicine',
    laborExpense: 'Labor & Wages', otherExpense: 'Other', description: 'Description',
    feed: 'Feed & Fodder', vet: 'Vet & Medicine', labor: 'Labor & Wages', other: 'Other',
    addExpense: 'Add Expense',
    // Accounts / Ledger
    cashBook: 'Cash Book', receive: 'Receive', pay: 'Pay', transfer: 'Transfer',
    ledger: 'Ledger', statement: 'Statement', opening: 'Opening Balance',
    debit: 'Debit', credit2: 'Credit', closing: 'Closing',
    // Reports
    profitLoss: 'Profit & Loss', balanceSheet: 'Balance Sheet',
    milkReport: 'Milk Report', herdReport: 'Herd Report',
    breedingReport: 'Breeding Report', healthReport: 'Health Report',
    receivables: 'Buyer Receivables', payables: 'Seller Payables',
    // Common actions
    add: 'Add', edit: 'Edit', delete: 'Delete', save: 'Save', cancel: 'Cancel',
    check: 'Check', receipt: 'Receipt', payment: 'Payment',
    confirm: 'Confirm', search: 'Search', print: 'Print', void: 'Void',
    date: 'Date', notes: 'Notes', cost: 'Cost', number: 'No.',
    from: 'From', to: 'To', today: 'Today', month: 'Month', all: 'All', apply: 'Apply',
    noRecords: 'No records found', loading: 'Loading…', pleaseWait: 'Please wait…',
    // Dashboard
    totalAnimals: 'Total Animals', activeCows: 'Active Cows / Buffaloes',
    totalBulls: 'Bulls', totalCalves: 'Calves',
    todayProduction: "Today's Production", buyerBalance: 'Buyer Balance',
    sellerBalance: 'Seller Balance', recentActivity: 'Recent Activity',
    quickActions: 'Quick Actions', recordMilk: 'Record Milk',
    // Login
    signIn: 'Sign In', username: 'Username', password: 'Password',
    signingIn: 'Signing in…', internetRequired: 'Internet is required to sign in. After sign-in, the app works offline.',
    logOut: 'Log Out', logOutConfirm: 'Log out of this device? Your data stays on this device.',
    sessionExpired: 'Your session has expired. Please sign in again.',
    // Settings
    farmProfile: 'Farm Profile', farmName: 'Farm Name', farmAddress: 'Farm / Village',
    phone: 'Phone', language: 'Language', theme: 'Theme',
    followDevice: 'Follow device', light: 'Light', dark: 'Dark',
    english: 'English', urdu: 'اردو',
    currency: 'Currency', numberPrefixes: 'Document Number Prefixes',
    myAccount: 'My Account', appData: 'App & Data', installApp: 'Install App',
    checkIntegrity: 'Check Data Integrity',
    // Backup
    backup2: 'Backup', restore: 'Restore', createBackup: 'Create Backup',
    restoreBackup: 'Restore from Backup', lastBackup: 'Last backup',
    backupWarning: 'Restoring will replace all current data. This cannot be undone.',
  },

  ur: {
    appName: 'مویشی فارم منیجر',
    // Nav sections
    secMain: 'مرکزی', secHerd: 'ریوڑ', secFinance: 'مالیات', secAdmin: 'انتظامیہ',
    // Routes
    dashboard: 'ڈیش بورڈ', animals: 'جانور', milk: 'دودھ کی پیداوار',
    health: 'صحت کے ریکارڈ', breeding: 'افزائش نسل', weights: 'وزن کے ریکارڈ',
    milkSales: 'دودھ کی فروخت', animalTxns: 'جانوروں کا لین دین', expenses: 'فارم اخراجات',
    buyers: 'خریدار', sellers: 'فروخت کنندہ', accounts: 'حسابات',
    vouchers: 'کیش بک', reports: 'رپورٹس', backup: 'بیک اپ', settings: 'ترتیبات',
    // Animals
    animal: 'جانور', tagNo: 'ٹیگ نمبر', name: 'نام', species: 'نوع',
    breed: 'نسل', gender: 'جنس', dob: 'تاریخ پیدائش', age: 'عمر', status: 'حالت',
    cattle: 'گائے', buffalo: 'بھینس', goat: 'بکری', sheep: 'بھیڑ', other: 'دیگر',
    female: 'مادہ', male: 'نر',
    active: 'فعال', sold: 'فروخت', dead: 'مردہ', culled: 'ہٹایا گیا',
    mother: 'ماں', father: 'باپ (سائر)', color: 'رنگ / نشانیاں',
    addAnimal: 'جانور شامل کریں', editAnimal: 'جانور ترمیم کریں',
    photo: 'تصویر', photoHint: 'اختیاری تصویر (خودکار سکڑاؤ)',
    purchaseDate: 'خریداری کی تاریخ', purchasePrice: 'خریداری کی قیمت',
    breedSahiwal: 'ساہیوال', breedNiliRavi: 'نیلی راوی', breedCholistani: 'چولستانی',
    breedFrisian: 'ہولسٹائن فریزین', breedJersey: 'جرسی', breedTharparkar: 'تھرپارکر',
    breedBhagnari: 'بھگناری', breedKankrej: 'کانکریج', breedMurrah: 'مرہ',
    // Milk
    milkRecord: 'دودھ ریکارڈ', morning: 'صبح (لیٹر)', evening: 'شام (لیٹر)',
    totalMilk: 'کل (لیٹر)', liters: 'لیٹر', addMilkRecord: 'ریکارڈ شامل کریں',
    perAnimal: 'فی جانور', dailyTotal: 'روزانہ کل', avgPerDay: 'اوسط فی دن',
    todayMilk: 'آج کا دودھ', thisMonthMilk: 'اس ماہ',
    // Health
    healthEvent: 'صحت واقعہ', vaccination: 'ٹیکہ', treatment: 'علاج',
    checkup: 'معائنہ', deworming: 'کیڑے مار دوائی', vitamin: 'وٹامن / سپلیمنٹ', otherEvent: 'دیگر',
    medicine: 'دوائی / ویکسین', dose: 'خوراک', vetName: 'ڈاکٹر کا نام',
    nextDue: 'اگلی تاریخ', herdWide: 'پورا ریوڑ (تمام جانور)',
    addHealthEvent: 'واقعہ شامل کریں', upcomingDue: 'آنے والی تاریخیں',
    vacFMD: 'منہ کھر (FMD)', vacHS: 'گلہ گھونٹو (HS)',
    vacBQ: 'کالی مہی (BQ)', vacAnthrax: 'انتھریکس', vacBrucella: 'بروسیلوسس',
    vacLSD: 'گانٹھ دار بیماری (LSD)', vacPPR: 'پی پی آر', vacRabies: 'ریبیز',
    // Breeding
    breedingRecord: 'افزائش ریکارڈ', heat: 'گرمی / حرارت', insemination: 'ہم بستری / مصنوعی بیج',
    pregnancyCheck: 'حمل کا معائنہ', calving: 'بچہ دینا', abortion: 'اسقاط حمل',
    dryOff: 'خشک کرنا', pregnancyStatus: 'حمل کی حالت',
    open: 'خالی (حاملہ نہیں)', pregnant: 'حاملہ', calved: 'بچہ دے دیا', aborted: 'اسقاط',
    expectedCalving: 'متوقع بچے کی تاریخ', calvingDate: 'بچے کی تاریخ',
    calfGender: 'بچے کی جنس', bullDesc: 'سانڈ / منی استعمال شدہ',
    dueForCalving: 'بچے کے قریب', pregnantAnimals: 'حاملہ جانور',
    addBreedingRecord: 'ریکارڈ شامل کریں',
    // Weights
    weightRecord: 'وزن ریکارڈ', weight: 'وزن (کلو)', addWeight: 'وزن شامل کریں',
    latestWeight: 'تازہ ترین وزن', weightChange: 'تبدیلی',
    // Finance
    buyer: 'خریدار', seller: 'فروخت کنندہ', party: 'فریق',
    amount: 'رقم', paid: 'ادا شدہ', balance: 'بقایا',
    receivable: 'وصولی', payable: 'ادائیگی',
    milkSale: 'دودھ فروخت', animalSale: 'جانور فروخت', animalPurchase: 'جانور خریداری',
    rate: 'نرخ / لیٹر', quantity: 'مقدار (لیٹر)', totalAmount: 'کل رقم',
    paymentAccount: 'ادائیگی کا کھاتہ', credit: 'ادھار (ابھی ادا نہیں)',
    // Expenses
    expense: 'اخراجات', feedExpense: 'چارہ و خوراک', vetExpense: 'ویٹرنری و دوائی',
    laborExpense: 'مزدوری و تنخواہ', otherExpense: 'دیگر', description: 'تفصیل',
    feed: 'چارہ و خوراک', vet: 'ویٹرنری و دوائی', labor: 'مزدوری و تنخواہ', other: 'دیگر',
    addExpense: 'اخراجات شامل کریں',
    // Accounts
    cashBook: 'کیش بک', receive: 'وصول کریں', pay: 'ادا کریں', transfer: 'منتقلی',
    ledger: 'کھاتہ', statement: 'بیان', opening: 'افتتاحی بقایا',
    debit: 'ڈیبٹ', credit2: 'کریڈٹ', closing: 'اختتامی',
    // Reports
    profitLoss: 'نفع و نقصان', balanceSheet: 'بیلنس شیٹ',
    milkReport: 'دودھ رپورٹ', herdReport: 'ریوڑ رپورٹ',
    breedingReport: 'افزائش رپورٹ', healthReport: 'صحت رپورٹ',
    receivables: 'خریداروں کی وصولی', payables: 'فروخت کنندگان کی ادائیگی',
    // Common actions
    add: 'شامل کریں', edit: 'ترمیم', delete: 'حذف', save: 'محفوظ کریں', cancel: 'منسوخ',
    check: 'جانچیں', receipt: 'رسید', payment: 'ادائیگی',
    confirm: 'تصدیق', search: 'تلاش', print: 'پرنٹ', void: 'منسوخ کریں',
    date: 'تاریخ', notes: 'نوٹس', cost: 'قیمت', number: 'نمبر',
    from: 'سے', to: 'تک', today: 'آج', month: 'مہینہ', all: 'سب', apply: 'لاگو',
    noRecords: 'کوئی ریکارڈ نہیں ملا', loading: 'لوڈ ہو رہا ہے…', pleaseWait: 'براہ کرم انتظار کریں…',
    // Dashboard
    totalAnimals: 'کل جانور', activeCows: 'فعال گائے / بھینسیں',
    totalBulls: 'سانڈ', totalCalves: 'بچھڑے',
    todayProduction: 'آج کی پیداوار', buyerBalance: 'خریداروں کا بقایا',
    sellerBalance: 'فروخت کنندگان کا بقایا', recentActivity: 'حالیہ سرگرمی',
    quickActions: 'فوری اعمال', recordMilk: 'دودھ ریکارڈ کریں',
    // Login
    signIn: 'لاگ ان', username: 'صارف نام', password: 'پاس ورڈ',
    signingIn: 'لاگ ان ہو رہا ہے…', internetRequired: 'لاگ ان کے لیے انٹرنیٹ ضروری ہے۔ لاگ ان کے بعد آف لائن کام ہوتا ہے۔',
    logOut: 'لاگ آؤٹ', logOutConfirm: 'اس آلے سے لاگ آؤٹ کریں؟ آپ کا ڈیٹا محفوظ رہے گا۔',
    sessionExpired: 'آپ کا سیشن ختم ہو گیا ہے۔ دوبارہ لاگ ان کریں۔',
    // Settings
    farmProfile: 'فارم پروفائل', farmName: 'فارم کا نام', farmAddress: 'فارم / گاؤں',
    phone: 'فون', language: 'زبان', theme: 'تھیم',
    followDevice: 'آلے کی ترتیب', light: 'روشن', dark: 'تاریک',
    english: 'English', urdu: 'اردو',
    currency: 'کرنسی', numberPrefixes: 'دستاویز نمبر کے سابقے',
    myAccount: 'میرا اکاؤنٹ', appData: 'ایپ اور ڈیٹا', installApp: 'ایپ انسٹال کریں',
    checkIntegrity: 'ڈیٹا کی سالمیت جانچیں',
    // Backup
    backup2: 'بیک اپ', restore: 'بحالی', createBackup: 'بیک اپ بنائیں',
    restoreBackup: 'بیک اپ سے بحالی', lastBackup: 'آخری بیک اپ',
    backupWarning: 'بحالی سے تمام موجودہ ڈیٹا حذف ہو جائے گا۔ یہ عمل واپس نہیں ہو سکتا۔',
  },
};

let _lang = null;

export function lang() {
  if (!_lang) _lang = localStorage.getItem(storageKey('lang')) || 'en';
  return _lang;
}

export function setLang(l) {
  _lang = l;
  localStorage.setItem(storageKey('lang'), l);
  const isUr = l === 'ur';
  document.documentElement.setAttribute('dir', isUr ? 'rtl' : 'ltr');
  document.documentElement.setAttribute('lang', l);
}

export function t(key) {
  const l = lang();
  return STR[l]?.[key] ?? STR.en[key] ?? key;
}

// Apply the currently stored language on page load.
export function applyLang() {
  setLang(lang());
}
