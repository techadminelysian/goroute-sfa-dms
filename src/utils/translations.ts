import { AppLanguage } from '../types';

export const translations = {
  // Common Navigation & Top Bars
  mobileTerminalMode: {
    en: 'Mobile Handheld Terminal Mode',
    hi: 'मोबाइल टर्मिनल मोड'
  },
  commissionAgentTerminal: {
    en: 'Commission Agent Terminal',
    hi: 'कमीशन एजेंट टर्मिनल'
  },
  cfCommissionAgentApp: {
    en: 'C&F Commission Agent / Sub-Distributor App',
    hi: 'सी एंड एफ कमीशन एजेंट / उप-वितरक ऐप'
  },
  depotDispatcherApp: {
    en: 'Depot Dispatcher Dock App',
    hi: 'डिपो डिस्पैचर डॉक ऐप'
  },
  depotDispatchControl: {
    en: 'Depot Dispatch Control',
    hi: 'डिपो डिस्पैच कंट्रोल'
  },
  dockDispatcher: {
    en: 'Dock Dispatcher',
    hi: 'डॉक डिस्पैचर'
  },
  agent: {
    en: 'Agent',
    hi: 'एजेंट'
  },
  dispatcher: {
    en: 'Dispatcher',
    hi: 'डिस्पैचर'
  },
  activeShift: {
    en: 'Active Shift',
    hi: 'सक्रिय शिफ्ट'
  },
  vanCrates: {
    en: 'Van Crates',
    hi: 'गाड़ी में क्रेट्स'
  },
  cratesInCustody: {
    en: 'Crates in Custody',
    hi: 'कब्जे में क्रेट्स'
  },
  fieldBeatActive: {
    en: 'Field Beat Active',
    hi: 'फील्ड बीट सक्रिय'
  },
  assignedBeatTerritory: {
    en: 'Assigned Beat Territory',
    hi: 'आवंटित बीट क्षेत्र'
  },
  storesMapped: {
    en: 'stores mapped',
    hi: 'दुकानें संबद्ध'
  },
  primaryBeat: {
    en: 'Primary Beat',
    hi: 'मुख्य बीट'
  },
  allBeats: {
    en: 'All Beats',
    hi: 'सभी बीट्स'
  },
  agencyNetworkTitle: {
    en: 'Agency Network',
    hi: 'एजेंसी नेटवर्क'
  },
  agencyNetworkDesc: {
    en: 'Orders punched today across your assigned beat stores are consolidated company SKU-wise by Admin and sent to Dispatcher early tomorrow morning for bulk depot dispatch.',
    hi: 'आज आपकी निर्धारित बीट की दुकानों से बनाए गए सभी ऑर्डर्स को एडमिन द्वारा कंपनी और उत्पाद अनुसार संकलित कर कल सुबह डिपो डिस्पैचर को थोक डिलीवरी के लिए भेजा जाएगा।'
  },
  retailOutlets: {
    en: 'Retail Outlets',
    hi: 'खुदरा दुकानें'
  },

  // Agent Bottom Navigation Tabs
  dailyBeat: {
    en: 'Daily Beat',
    hi: 'दैनिक बीट'
  },
  catalog: {
    en: 'Catalog',
    hi: 'कैटलॉग'
  },
  collections: {
    en: 'Collections',
    hi: 'भुगतान'
  },
  crates: {
    en: 'Crates',
    hi: 'क्रेट्स'
  },
  history: {
    en: 'History',
    hi: 'इतिहास'
  },
  orders: {
    en: 'Orders',
    hi: 'ऑर्डर्स'
  },
  myStores: {
    en: 'Stores',
    hi: 'दुकानें'
  },
  paymentLog: {
    en: 'Log',
    hi: 'इतिहास'
  },

  // Agent Beat & Metrics
  todaysBeat: {
    en: "Today's Beat",
    hi: 'आज की बीट'
  },
  visitsProgress: {
    en: 'Visits / Outlets',
    hi: 'विज़िट / दुकानें'
  },
  todaysSales: {
    en: "Today's Orders",
    hi: 'आज के ऑर्डर'
  },
  checkedInOutlet: {
    en: 'Checked In Store',
    hi: 'चेक-इन दुकान'
  },
  checkIn: {
    en: 'Check In',
    hi: 'चेक इन'
  },
  checkOut: {
    en: 'Check Out',
    hi: 'चेक आउट'
  },
  orderPunch: {
    en: 'Punch Order',
    hi: 'ऑर्डर बनाएं'
  },
  newOrder: {
    en: 'New Order',
    hi: 'नया ऑर्डर'
  },
  returns: {
    en: 'Returns',
    hi: 'वापसी माल'
  },
  cart: {
    en: 'Review Cart',
    hi: 'कार्ट देखें'
  },
  selectStoreOutlet: {
    en: 'Select Store / Outlet *',
    hi: 'दुकान / रिटेलर चुनें *'
  },
  onboardNewStore: {
    en: 'Onboard New Store',
    hi: 'नई दुकान जोड़ें'
  },
  outstanding: {
    en: 'Outstanding',
    hi: 'बकाया'
  },
  quickSearchSkuPlaceholder: {
    en: 'Quick Search SKU across all companies...',
    hi: 'सभी कंपनियों के उत्पाद (SKU) खोजें...'
  },
  subtotal: {
    en: 'Subtotal',
    hi: 'उप-योग'
  },
  prevOrder: {
    en: 'Prev. Order',
    hi: 'पिछला ऑर्डर'
  },
  currStock: {
    en: 'Curr. Stock',
    hi: 'मौजूदा स्टॉक'
  },
  freshOrder: {
    en: 'Fresh Order *',
    hi: 'नया ऑर्डर *'
  },
  rate: {
    en: 'Rate (₹)',
    hi: 'दर (₹)'
  },
  lineTotal: {
    en: 'Line Total',
    hi: 'पंक्ति योग'
  },
  addSkuFromCompany: {
    en: '+ Add SKU from',
    hi: '+ उत्पाद जोड़ें:'
  },
  allProductsAddedFromCompany: {
    en: 'All products from this company added to order',
    hi: 'इस कंपनी के सभी उत्पाद ऑर्डर में शामिल हैं'
  },
  addAnotherPrincipalCompany: {
    en: '+ Add Another Principal Company',
    hi: '+ दूसरी कंपनी (Principal) जोड़ें'
  },
  allPrincipalCompaniesAdded: {
    en: 'All Principal Companies Added',
    hi: 'सभी प्रमुख कंपनियां जुड़ चुकी हैं'
  },
  visitNotesLabel: {
    en: 'Visit Notes & Delivery Exceptions (Optional)',
    hi: 'दुकान विजिट नोट्स व विशेष डिलीवरी निर्देश (वैकल्पिक)'
  },
  visitNotesPlaceholder: {
    en: 'e.g., Deliver before 11 AM; Retailer requested scheme credit...',
    hi: 'जैसे: सुबह 11 बजे से पहले डिलीवरी करें; स्कीम छूट अनुरोध...'
  },
  companiesAndItems: {
    en: 'Companies & Items',
    hi: 'कंपनियां और उत्पाद'
  },
  grossTotalCombined: {
    en: 'Gross Total (Combined)',
    hi: 'सकल योग (कुल)'
  },
  gstEstimated: {
    en: 'GST (18% Estimated)',
    hi: 'जीएसटी (GST 18%)'
  },
  consolidatedOrderValue: {
    en: 'Consolidated Order Value',
    hi: 'कुल ऑर्डर मूल्य'
  },
  punchCombinedOrder: {
    en: 'Punch Combined Order (1 Single Order ID)',
    hi: 'संयुक्त ऑर्डर दर्ज करें (1 सिंगल ऑर्डर ID)'
  },
  orderPunchingDisabledNoBeats: {
    en: 'Order Punching Disabled (No Beats Assigned)',
    hi: 'ऑर्डर अक्षम (कोई बीट आवंटित नहीं)'
  },
  orderPunchingDisabledNoStores: {
    en: 'Order Punching Disabled (No Stores in Beat)',
    hi: 'ऑर्डर अक्षम (बीट में कोई दुकान नहीं)'
  },
  paymentCollection: {
    en: 'Payment Collection',
    hi: 'भुगतान संग्रह'
  },
  crateTracking: {
    en: 'Crate Tracking',
    hi: 'क्रेट ट्रैकिंग'
  },
  selectBeat: {
    en: 'Select Route / Beat',
    hi: 'रूट / बीट चुनें'
  },
  noBeatAssigned: {
    en: 'No Beat Assigned',
    hi: 'कोई बीट नहीं'
  },
  stores: {
    en: 'Stores',
    hi: 'दुकानें'
  },
  taxGst: {
    en: 'Tax (GST)',
    hi: 'टैक्स (GST)'
  },
  netPayable: {
    en: 'Net Payable',
    hi: 'देय कुल राशि'
  },
  outstandingDue: {
    en: 'Outstanding Due',
    hi: 'बकाया राशि'
  },
  creditLimit: {
    en: 'Credit Limit',
    hi: 'उधार सीमा'
  },
  creditAvailable: {
    en: 'Available Credit',
    hi: 'उपलब्ध उधार'
  },
  exceeded: {
    en: 'Exceeded',
    hi: 'सीमा पार'
  },
  paymentMode: {
    en: 'Payment Mode',
    hi: 'भुगतान का प्रकार'
  },
  cash: {
    en: 'Cash',
    hi: 'नकद'
  },
  cheque: {
    en: 'Cheque',
    hi: 'चेक'
  },
  upiOnline: {
    en: 'UPI / Online',
    hi: 'UPI / ऑनलाइन'
  },
  bankTransfer: {
    en: 'Bank Transfer (NEFT/RTGS)',
    hi: 'बैंक ट्रांसफर'
  },
  amountReceived: {
    en: 'Amount Received',
    hi: 'प्राप्त राशि'
  },
  referenceNo: {
    en: 'Reference / UTR / Cheque No.',
    hi: 'रेफरेंस / चेक / UTR नंबर'
  },
  notesRemarks: {
    en: 'Notes / Remarks',
    hi: 'विवरण / टिप्पणी'
  },
  recordPayment: {
    en: 'Record Payment',
    hi: 'भुगतान दर्ज करें'
  },

  // Dispatcher Demand & Dock
  consolidatedDemand: {
    en: 'Consolidated Demand',
    hi: 'कुल मांग / चालान'
  },
  inwardDockGrn: {
    en: 'Inward Dock GRN',
    hi: 'आवक स्टॉक (GRN)'
  },
  institutionalDirect: {
    en: 'Institutional Direct',
    hi: 'संस्थागत डिलीवरी'
  },
  receiverProofs: {
    en: 'Receiver Proofs',
    hi: 'प्राप्ति प्रमाण'
  },
  warehouseStock: {
    en: 'Warehouse Stock',
    hi: 'गोदाम स्टॉक'
  },
  outwardDemand: {
    en: 'Outward Demand',
    hi: 'जावक मांग'
  },
  allEntities: {
    en: 'All Recipients',
    hi: 'सभी प्राप्तकर्ता'
  },
  commissionAgents: {
    en: 'Commission Agents',
    hi: 'कमीशन एजेंट्स'
  },
  subDistributors: {
    en: 'Sub-Distributors',
    hi: 'उप-वितरक'
  },
  deliveryExecutives: {
    en: 'Delivery Executives',
    hi: 'डिलीवरी कर्मचारी'
  },
  shortageAdjustment: {
    en: 'Shortage / Excess Adjustment',
    hi: 'कमी / अधिकता समायोजन'
  },
  allocatedQty: {
    en: 'Allocated Qty',
    hi: 'आवंटित मात्रा'
  },
  dispatchedQty: {
    en: 'Dispatched Qty',
    hi: 'भेजी गई मात्रा'
  },
  requestedQty: {
    en: 'Requested Qty',
    hi: 'मांगी गई मात्रा'
  },
  reasonCode: {
    en: 'Reason Code',
    hi: 'कारण कोड'
  },
  generateGatePass: {
    en: 'Generate Gate Pass',
    hi: 'गेट पास बनाएं'
  },

  // Common Actions & Form Controls
  submit: {
    en: 'Submit',
    hi: 'जमा करें'
  },
  cancel: {
    en: 'Cancel',
    hi: 'रद्द करें'
  },
  confirm: {
    en: 'Confirm',
    hi: 'पुष्टि करें'
  },
  search: {
    en: 'Search',
    hi: 'खोजें'
  },
  filter: {
    en: 'Filter',
    hi: 'फ़िल्टर'
  },
  reset: {
    en: 'Reset',
    hi: 'रीसेट'
  },
  save: {
    en: 'Save',
    hi: 'सहेजें'
  },
  add: {
    en: 'Add to Order',
    hi: 'ऑर्डर में जोड़ें'
  },
  remove: {
    en: 'Remove',
    hi: 'हटाएं'
  },
  close: {
    en: 'Close',
    hi: 'बंद करें'
  },
  qty: {
    en: 'Qty',
    hi: 'मात्रा'
  },
  price: {
    en: 'Price',
    hi: 'मूल्य'
  },
  status: {
    en: 'Status',
    hi: 'स्थिति'
  },
  date: {
    en: 'Date',
    hi: 'तारीख'
  },
  time: {
    en: 'Time',
    hi: 'समय'
  },
  invoiceNo: {
    en: 'Invoice #',
    hi: 'बिल / चालान #'
  },
  orderId: {
    en: 'Order ID',
    hi: 'ऑर्डर आईडी'
  },
  storeName: {
    en: 'Store Name',
    hi: 'दुकान का नाम'
  },
  ownerName: {
    en: 'Owner Name',
    hi: 'मालिक का नाम'
  },
  phone: {
    en: 'Phone',
    hi: 'फोन'
  },
  address: {
    en: 'Address',
    hi: 'पता'
  },

  // Status Indicators
  verified: {
    en: 'Verified',
    hi: 'सत्यापित'
  },
  pending: {
    en: 'Pending',
    hi: 'लंबित'
  },
  approved: {
    en: 'Approved',
    hi: 'स्वीकृत'
  },
  dispatched: {
    en: 'Dispatched',
    hi: 'प्रेषित'
  },
  delivered: {
    en: 'Delivered',
    hi: 'वितरित'
  },
  cancelled: {
    en: 'Cancelled',
    hi: 'रद्द'
  },
  completed: {
    en: 'Completed',
    hi: 'पूर्ण'
  },
  inTransit: {
    en: 'In Transit',
    hi: 'रास्ते में'
  },
  offlineMode: {
    en: 'Offline Mode',
    hi: 'ऑफ़लाइन मोड'
  }
} as const;

export type TranslationKey = keyof typeof translations;

export function t(key: TranslationKey, lang: AppLanguage = 'en'): string {
  const item = translations[key];
  if (!item) return key;
  return item[lang] || item['en'] || key;
}
