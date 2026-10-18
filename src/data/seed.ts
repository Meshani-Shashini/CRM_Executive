import type {
  User, Lead, Client, Activity, Insurer, ProductCode,
  Invoice, Payment, TaxRate, MiraRow, Deal, CalendarEvent,
} from '../types';

export const USERS: User[] = [
  { id: 'u1', name: 'Mohamed Azim', email: 'azim@premierbrokers.mv', role: 'admin', title: 'Managing Director' },
  { id: 'u2', name: 'Aishath Leen', email: 'leen@premierbrokers.mv', role: 'sales', title: 'Senior Sales Agent' },
  { id: 'u3', name: 'Hussain Rasheed', email: 'rasheed@premierbrokers.mv', role: 'finance', title: 'Chief Accountant' },
  { id: 'u4', name: 'Client Portal', email: 'client@avia.mv', role: 'client', title: 'Client' },
];

export const INSURERS: Insurer[] = [
  { id: 'ins1', name: 'Allied Insurance Company', shortName: 'Allied', commissionRate: 15, address: 'Boduthakurufaanu Magu, Male\'' },
  { id: 'ins2', name: 'Dhivehi Insurance Company', shortName: 'Dhivehi', commissionRate: 12, address: 'Sosun Magu, Male\'' },
  { id: 'ins3', name: 'Amana Takaful', shortName: 'Amana', commissionRate: 14, address: 'H. Amana, Male\'' },
  { id: 'ins4', name: 'Ceylinco Insurance', shortName: 'Ceylinco', commissionRate: 13, address: 'Champa Building, Male\'' },
];

export const PRODUCT_CODES: ProductCode[] = [
  // Bonds
  { code: 'AB', name: 'Advance Bond', category: 'Bonds' },
  { code: 'BB', name: 'Bid Bond', category: 'Bonds' },
  { code: 'CB', name: 'Performance Bond', category: 'Bonds' },
  // Engineering
  { code: 'CM', name: 'Comp Machinery', category: 'Engineering' },
  { code: 'CP', name: 'Electronic Equip', category: 'Engineering' },
  { code: 'CR', name: 'Computer Crime', category: 'Engineering' },
  { code: 'FZ', name: "Contractor's Plant", category: 'Engineering' },
  { code: 'IR', name: 'Industrial All Risks', category: 'Engineering' },
  { code: 'LM', name: 'Machinery Con Loss', category: 'Engineering' },
  { code: 'NC', name: 'CAR', category: 'Engineering' },
  { code: 'NE', name: 'EAR', category: 'Engineering' },
  { code: 'NM', name: 'Machinery Breakdown', category: 'Engineering' },
  // Fire
  { code: 'CF', name: 'Commercial Fire', category: 'Fire' },
  { code: 'DF', name: 'Dwelling Fire', category: 'Fire' },
  { code: 'FY', name: 'Terrorism & Sabotage', category: 'Fire' },
  { code: 'HC', name: 'Hotel Combine', category: 'Fire' },
  { code: 'LP', name: 'Consequential Loss', category: 'Fire' },
  { code: 'PR', name: 'Property All Risk', category: 'Fire' },
  // Marine
  { code: 'EP', name: 'Export Policy', category: 'Marine' },
  { code: 'IP', name: 'Import Policy', category: 'Marine' },
  { code: 'LC', name: 'Land Cover', category: 'Marine' },
  { code: 'OP', name: 'Open Policy', category: 'Marine' },
  { code: 'SH', name: 'Hull Policy', category: 'Marine' },
  // Miscellaneous
  { code: 'AL', name: 'Airport Liability', category: 'Miscellaneous' },
  { code: 'AP', name: 'Personal Accident', category: 'Miscellaneous' },
  { code: 'BL', name: 'Bankers Indemnity', category: 'Miscellaneous' },
  { code: 'CG', name: 'Fidelity Guarantee', category: 'Miscellaneous' },
  { code: 'DO', name: 'D&O Liability', category: 'Miscellaneous' },
  { code: 'EL', name: "Workmen's Comp", category: 'Miscellaneous' },
  { code: 'GT', name: 'Goods in Transit', category: 'Miscellaneous' },
  { code: 'MT', name: 'Money in Transit', category: 'Miscellaneous' },
  { code: 'PL', name: 'Product Liability', category: 'Miscellaneous' },
  { code: 'PN', name: 'Professional Indemnity', category: 'Miscellaneous' },
  { code: 'TL', name: 'Public Liability', category: 'Miscellaneous' },
];

export const FUNNELS = [
  { id: 'f1', name: 'Broker Sales Funnel', stages: ['Lead Identified', 'Contact Made', 'Key Person Identified', 'Quoted', 'Internal Slip'] },
  { id: 'f2', name: 'Renewals Funnel', stages: ['Renewal Notice', 'Quote Sent', 'Negotiation', 'Bound', 'Closed Won'] },
];

export const LEADS: Lead[] = [
  { id: 'L-001', client: 'Avia Maldives', contact: 'Ibrahim Nazim', country: 'Maldives', insuranceClass: 'Fire', productCode: 'PR', temperature: 'HOT', status: 'IN-PROGRESS', funnelStage: 'Quoted', renewalDate: '2026-05-10', sumInsured: 200000, premium: 206700, ownerId: 'u2', lastActivity: '2h ago' },
  { id: 'L-002', client: 'Bonavista Maldives', contact: 'Mariyam Shafeeq', country: 'Maldives', insuranceClass: 'Miscellaneous', productCode: 'PN', temperature: 'WARM', status: 'TO-DO', funnelStage: 'Contact Made', renewalDate: '2026-08-22', sumInsured: 500000, premium: 42000, ownerId: 'u2', lastActivity: '1d ago' },
  { id: 'L-003', client: 'Nova Maldives', contact: 'Ahmed Suhail', country: 'Maldives', insuranceClass: 'Engineering', productCode: 'NM', temperature: 'HOT', status: 'IN-PROGRESS', funnelStage: 'Key Person Identified', renewalDate: '2026-03-15', sumInsured: 1200000, premium: 98000, ownerId: 'u2', lastActivity: '30m ago' },
  { id: 'L-004', client: 'Zenith Aviation Academy', contact: 'Fathimath Zoya', country: 'Maldives', insuranceClass: 'Miscellaneous', productCode: 'AP', temperature: 'COLD', status: 'BACKLOG', funnelStage: 'Lead Identified', renewalDate: '2026-11-01', sumInsured: 75000, premium: 9800, ownerId: 'u2', lastActivity: '5d ago' },
  { id: 'L-005', client: 'China State Construction Maldives', contact: 'Li Wei', country: 'Maldives', insuranceClass: 'Bonds', productCode: 'BB', temperature: 'WARM', status: 'IN-PROGRESS', funnelStage: 'Internal Slip', renewalDate: '2026-01-30', sumInsured: 5000000, premium: 25000, ownerId: 'u2', lastActivity: '4h ago' },
  { id: 'L-006', client: 'Avia Maldives', contact: 'Ibrahim Nazim', country: 'Maldives', insuranceClass: 'Marine', productCode: 'SH', temperature: 'HOT', status: 'IN-PROGRESS', funnelStage: 'Quoted', renewalDate: '2026-02-18', sumInsured: 850000, premium: 64000, ownerId: 'u2', lastActivity: '1h ago' },
  { id: 'L-007', client: 'Nova Maldives', contact: 'Ahmed Suhail', country: 'Maldives', insuranceClass: 'Fire', productCode: 'HC', temperature: 'COLD', status: 'TO-DO', funnelStage: 'Lead Identified', renewalDate: '2026-09-12', sumInsured: 3200000, premium: 215000, ownerId: 'u2', lastActivity: '8d ago' },
  { id: 'L-008', client: 'Bonavista Maldives', contact: 'Mariyam Shafeeq', country: 'Maldives', insuranceClass: 'Miscellaneous', productCode: 'MT', temperature: 'WARM', status: 'IN-PROGRESS', funnelStage: 'Contact Made', renewalDate: '2026-06-05', sumInsured: 180000, premium: 8200, ownerId: 'u2', lastActivity: '2d ago' },
];

export const CLIENTS: Client[] = [
  {
    id: 'C-001', name: 'Avia Maldives', tin: 'C2025001', country: 'Maldives',
    phone: '+960 333 4455', email: 'nazim@avia.mv', address: 'H. Avia, Boduthakurufaanu Magu, Male\'',
    sumInsured: 200000, premium: 206700, expiry: '2028-05-10', insurer: 'Allied Insurance',
    productCode: 'PR', class: 'Fire', ownerId: 'u2', tags: ['VIP', 'Tourism'],
  },
  {
    id: 'C-002', name: 'Bonavista Maldives', tin: 'C2025012', country: 'Maldives',
    phone: '+960 332 1122', email: 'shafeeq@bonavista.mv', address: 'B. Bonavista, Male\'',
    sumInsured: 500000, premium: 42000, expiry: '2026-08-22', insurer: 'Dhivehi Insurance Company',
    productCode: 'PN', class: 'Miscellaneous', ownerId: 'u2', tags: ['Renewal Due'],
  },
  {
    id: 'C-003', name: 'Nova Maldives', tin: 'C2025033', country: 'Maldives',
    phone: '+960 331 7788', email: 'suhail@nova.mv', address: 'N. Nova, Hulhumale\'',
    sumInsured: 1200000, premium: 98000, expiry: '2026-03-15', insurer: 'Amana Takaful',
    productCode: 'NM', class: 'Engineering', ownerId: 'u2', tags: ['Construction'],
  },
  {
    id: 'C-004', name: 'Zenith Aviation Academy', tin: 'C2025048', country: 'Maldives',
    phone: '+960 334 5566', email: 'zoya@zenith.mv', address: 'Z. Zenith, Male\'',
    sumInsured: 75000, premium: 9800, expiry: '2026-11-01', insurer: 'Ceylinco Insurance',
    productCode: 'AP', class: 'Miscellaneous', ownerId: 'u2', tags: ['Academy'],
  },
  {
    id: 'C-005', name: 'China State Construction Maldives', tin: 'C2025052', country: 'Maldives',
    phone: '+960 335 9988', email: 'wei@cscm.mv', address: 'CSCM Site Office, Hulhumale\' Phase 2',
    sumInsured: 5000000, premium: 25000, expiry: '2026-01-30', insurer: 'Allied Insurance',
    productCode: 'BB', class: 'Bonds', ownerId: 'u2', tags: ['Project Bond'],
  },
];

export const ACTIVITIES: Activity[] = [
  { id: 'a1', clientId: 'C-001', type: 'call', title: 'Discovery Call', description: 'Confirmed scope for Property All Risk + Business Interruption extension. Decision pending board approval.', date: '2026-10-16 14:30', userId: 'u2' },
  { id: 'a2', clientId: 'C-001', type: 'upload', title: 'QRS 110-2024 uploaded', description: 'Quotation Request Slip submitted to Allied Insurance for multi-peril coverage.', date: '2026-10-15 11:00', userId: 'u2' },
  { id: 'a3', clientId: 'C-001', type: 'meeting', title: 'On-site Risk Survey', description: 'Conducted property inspection with Allied risk engineer. Photos attached.', date: '2026-10-12 09:00', userId: 'u2' },
  { id: 'a4', clientId: 'C-001', type: 'quote', title: 'Quote v2 sent', description: 'Revised premium MVR 206,700 with 8% GST applied. Sent to nazim@avia.mv.', date: '2026-10-10 16:45', userId: 'u2' },
  { id: 'a5', clientId: 'C-001', type: 'email', title: 'Reminder email', description: '60-day renewal reminder dispatched via automated workflow.', date: '2026-10-08 08:00', userId: 'u1' },
];

export const TAX_RATES: TaxRate[] = [
  { id: 't1', name: 'Standard GST', rate: 8, category: 'Standard', active: true },
  { id: 't2', name: 'Tourism GST', rate: 17, category: 'Tourism', active: true },
  { id: 't3', name: 'Zero-rated (Export)', rate: 0, category: 'Zero-rated', active: true },
];

export const INVOICES: Invoice[] = [
  {
    id: 'inv1', number: 'INV-050-2025', clientId: 'C-001', clientName: 'Avia Maldives',
    insurer: 'Allied Insurance', policyNo: 'ALL-PR-2025-0481', issueDate: '2025-10-01', dueDate: '2025-10-15',
    status: 'Partial', currency: 'MVR',
    items: [
      { description: 'Property All Risk — Sum Insured 200,000', qty: 1, unitPrice: 191389, vatRate: 8 },
      { description: 'Brokerage Fee', qty: 1, unitPrice: 1500, vatRate: 8 },
      { description: 'Admin Fee', qty: 1, unitPrice: 500, vatRate: 8 },
    ],
    installments: [
      { id: 'i1', label: '1st Installment (Issuance)', due: '2025-10-01', amount: 68900, paid: true },
      { id: 'i2', label: '2nd Installment (30 days)', due: '2025-10-31', amount: 68900, paid: true },
      { id: 'i3', label: '3rd Installment (60 days)', due: '2025-11-30', amount: 68900, paid: false },
    ],
  },
  {
    id: 'inv2', number: 'INV-051-2025', clientId: 'C-003', clientName: 'Nova Maldives',
    insurer: 'Amana Takaful', policyNo: 'AM-NM-2025-1190', issueDate: '2025-09-20', dueDate: '2025-10-20',
    status: 'Pending', currency: 'MVR',
    items: [
      { description: 'Machinery Breakdown — Sum Insured 1,200,000', qty: 1, unitPrice: 90741, vatRate: 8 },
      { description: 'Brokerage Fee', qty: 1, unitPrice: 1500, vatRate: 8 },
    ],
    installments: [
      { id: 'i1', label: '1st Installment (Issuance)', due: '2025-09-20', amount: 46121, paid: false },
      { id: 'i2', label: '2nd Installment (30 days)', due: '2025-10-20', amount: 46121, paid: false },
    ],
  },
  {
    id: 'inv3', number: 'INV-049-2025', clientId: 'C-005', clientName: 'China State Construction Maldives',
    insurer: 'Allied Insurance', policyNo: 'ALL-BB-2025-0233', issueDate: '2025-08-15', dueDate: '2025-09-15',
    status: 'Overdue', currency: 'MVR',
    items: [
      { description: 'Bid Bond — Sum Insured 5,000,000', qty: 1, unitPrice: 23148, vatRate: 8 },
      { description: 'Brokerage Fee', qty: 1, unitPrice: 2000, vatRate: 8 },
    ],
    installments: [
      { id: 'i1', label: 'Single Payment', due: '2025-09-15', amount: 27160, paid: false },
    ],
  },
  {
    id: 'inv4', number: 'INV-048-2025', clientId: 'C-002', clientName: 'Bonavista Maldives',
    insurer: 'Dhivehi Insurance Company', policyNo: 'DH-PN-2025-0771', issueDate: '2025-07-01', dueDate: '2025-07-15',
    status: 'Paid', currency: 'MVR',
    items: [
      { description: 'Professional Indemnity — Sum Insured 500,000', qty: 1, unitPrice: 38889, vatRate: 8 },
    ],
    installments: [
      { id: 'i1', label: 'Single Payment', due: '2025-07-15', amount: 42000, paid: true },
    ],
  },
];

export const PAYMENTS: Payment[] = [
  { id: 'p1', receiptNo: 'RCP-2025-0140', invoiceId: 'inv1', invoiceNumber: 'INV-050-2025', clientName: 'Avia Maldives', amount: 68900, date: '2025-10-01', type: 'Premium', method: 'Bank Transfer', status: 'Completed' },
  { id: 'p2', receiptNo: 'RCP-2025-0141', invoiceId: 'inv1', invoiceNumber: 'INV-050-2025', clientName: 'Avia Maldives', amount: 68900, date: '2025-10-31', type: 'Premium', method: 'Bank Transfer', status: 'Completed' },
  { id: 'p3', receiptNo: 'RCP-2025-0152', invoiceId: 'inv4', invoiceNumber: 'INV-048-2025', clientName: 'Bonavista Maldives', amount: 42000, date: '2025-07-14', type: 'Premium', method: 'Bank Transfer', status: 'Completed' },
  { id: 'p4', receiptNo: 'RCM-2025-0089', invoiceId: 'inv4', invoiceNumber: 'INV-048-2025', clientName: 'Dhivehi Insurance Co.', amount: 5040, date: '2025-07-20', type: 'Commission', method: 'Bank Transfer', status: 'Completed' },
];

export const MIRA_ROWS: MiraRow[] = [
  { id: 'm1', date: '2025-10-01', insured: 'Avia Maldives', insurer: 'Allied Insurance', sumInsured: 200000, premium: 206700, commissionPct: 15, commissionAmount: 31005, brokerageFee: 1500 },
  { id: 'm2', date: '2025-09-20', insured: 'Nova Maldives', insurer: 'Amana Takaful', sumInsured: 1200000, premium: 98000, commissionPct: 14, commissionAmount: 13720, brokerageFee: 1500 },
  { id: 'm3', date: '2025-08-15', insured: 'China State Construction', insurer: 'Allied Insurance', sumInsured: 5000000, premium: 25000, commissionPct: 15, commissionAmount: 3750, brokerageFee: 2000 },
  { id: 'm4', date: '2025-07-01', insured: 'Bonavista Maldives', insurer: 'Dhivehi Insurance Co.', sumInsured: 500000, premium: 42000, commissionPct: 12, commissionAmount: 5040, brokerageFee: 0 },
  { id: 'm5', date: '2025-10-05', insured: 'Zenith Aviation Academy', insurer: 'Ceylinco Insurance', sumInsured: 75000, premium: 9800, commissionPct: 13, commissionAmount: 1274, brokerageFee: 500 },
];

export const DEALS: Deal[] = [
  { id: 'd1', client: 'Avia Maldives', product: 'Property All Risk', value: 206700, weighted: 165360, stage: 'Quoted', probability: 80, ownerId: 'u2', closeDate: '2026-05-10', insurer: 'Allied Insurance' },
  { id: 'd2', client: 'Nova Maldives', product: 'Machinery Breakdown', value: 98000, weighted: 49000, stage: 'Key Person Identified', probability: 50, ownerId: 'u2', closeDate: '2026-03-15', insurer: 'Amana Takaful' },
  { id: 'd3', client: 'China State Construction', product: 'Bid Bond', value: 25000, weighted: 22500, stage: 'Internal Slip', probability: 90, ownerId: 'u2', closeDate: '2026-01-30', insurer: 'Allied Insurance' },
  { id: 'd4', client: 'Bonavista Maldives', product: 'Professional Indemnity', value: 42000, weighted: 16800, stage: 'Contact Made', probability: 40, ownerId: 'u2', closeDate: '2026-08-22', insurer: 'Dhivehi Insurance' },
  { id: 'd5', client: 'Zenith Aviation Academy', product: 'Personal Accident', value: 9800, weighted: 1960, stage: 'Lead Identified', probability: 20, ownerId: 'u2', closeDate: '2026-11-01', insurer: 'Ceylinco Insurance' },
  { id: 'd6', client: 'Avia Maldives', product: 'Marine Hull', value: 64000, weighted: 51200, stage: 'Quoted', probability: 80, ownerId: 'u2', closeDate: '2026-02-18', insurer: 'Allied Insurance' },
];

export const CALENDAR_EVENTS: CalendarEvent[] = [
  { id: 'e1', date: '2026-10-01', title: 'Avia Maldives — 60-day renewal reminder', type: 'reminder', client: 'Avia Maldives', days: 60 },
  { id: 'e2', date: '2026-10-12', title: 'Risk survey follow-up call', type: 'task', client: 'Avia Maldives', days: 0 },
  { id: 'e3', date: '2026-10-18', title: 'Monthly pipeline review', type: 'meeting', client: 'Internal', days: 0 },
  { id: 'e4', date: '2026-10-20', title: 'Nova Maldives — invoice due', type: 'reminder', client: 'Nova Maldives', days: 30 },
  { id: 'e5', date: '2026-10-30', title: 'China State — Bid Bond renewal', type: 'renewal', client: 'China State Construction', days: 90 },
  { id: 'e6', date: '2026-10-25', title: 'Bonavista — quote follow-up', type: 'task', client: 'Bonavista Maldives', days: 0 },
];

export const BANK_DETAILS = {
  bankName: 'Bank of Maldives',
  mvrAccount: '7730000519423',
  usdAccount: '7730000519424',
  swift: 'MALBMVMV',
};

export const COMPANY = {
  name: 'Premier Brokers',
  legalName: 'Premier Brokers Pvt. Ltd.',
  address: 'H. Premier, Boduthakurufaanu Magu, Male\' 20026, Maldives',
  email: 'info@premierbrokers.mv',
  phone: '+960 333 0000',
  registration: 'BR-2018/00442',
};
