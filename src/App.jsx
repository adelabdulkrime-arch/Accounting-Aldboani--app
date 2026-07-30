import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  LayoutDashboard, BookOpen, Users, Truck, Package, ShoppingCart, FileText,
  ClipboardList, PieChart, Settings as SettingsIcon, Plus, Trash2, Pencil,
  X, Search, AlertTriangle, TrendingUp, TrendingDown, Wallet, Landmark,
  ChevronDown, ChevronRight, Check, Printer, ArrowUpRight, ArrowDownRight,
  Loader2, Banknote, Menu, CheckCircle2, XCircle, Bell, Repeat, Sparkles, Award, Receipt,
  UserCog, Download
} from 'lucide-react';

/* ============================== CONSTANTS ============================== */

const STORAGE_KEYS = {
  settings: 'settings',
  accounts: 'accounts',
  customers: 'customers',
  suppliers: 'suppliers',
  products: 'products',
  sales: 'sales-invoices',
  purchases: 'purchase-invoices',
  expenses: 'expenses',
  journal: 'journal-entries',
  reps: 'reps',
  recurring: 'recurring-templates',
  payments: 'payments',
  workers: 'workers',
};

const DEFAULT_SETTINGS = {
  companyName: 'منشأتي التجارية',
  currency: 'ر.س',
  taxType: 'percent', // 'percent' | 'fixed'
  taxRate: 15,
  taxFixedAmount: 0,
  nextSalesNo: 1,
  nextPurchaseNo: 1,
  nextJournalNo: 1,
  nextExpenseNo: 1,
  nextRepNo: 1,
  // VIP program
  vipEnabled: true,
  vipMonthlyThreshold: 1000000,
  vipDiscountPercent: 0.5,
  // credit terms / collections
  defaultPaymentTermsDays: 30,
  reminderBeforeDays: 7,
  overdueBlockThresholdDays: 15, // an invoice overdue by more than this counts against the customer's credit score
  overdueBlockCount: 2, // this many currently-overdue invoices => credit blocked
  // distributor commission
  defaultCommissionPercent: 2,
};


// kind identifies the accounting role an account plays in automatic postings
const DEFAULT_ACCOUNTS = [
  { id: 'acc_cash', code: '1000', name: 'الصندوق (نقدية)', type: 'asset', kind: 'cash', system: true },
  { id: 'acc_bank', code: '1010', name: 'البنك', type: 'asset', kind: 'bank', system: true },
  { id: 'acc_ar', code: '1100', name: 'العملاء (ذمم مدينة)', type: 'asset', kind: 'ar', system: true },
  { id: 'acc_inventory', code: '1200', name: 'المخزون', type: 'asset', kind: 'inventory', system: true },
  { id: 'acc_vat_in', code: '1300', name: 'ضريبة القيمة المضافة - مشتريات', type: 'asset', kind: 'vat_in', system: true },
  { id: 'acc_ap', code: '2000', name: 'الموردون (ذمم دائنة)', type: 'liability', kind: 'ap', system: true },
  { id: 'acc_vat_out', code: '2100', name: 'ضريبة القيمة المضافة - مبيعات', type: 'liability', kind: 'vat_out', system: true },
  { id: 'acc_capital', code: '3000', name: 'رأس المال', type: 'equity', kind: 'capital', system: true },
  { id: 'acc_retained', code: '3100', name: 'الأرباح المرحلة', type: 'equity', kind: 'retained', system: true },
  { id: 'acc_sales', code: '4000', name: 'إيرادات المبيعات', type: 'revenue', kind: 'sales_revenue', system: true },
  { id: 'acc_cogs', code: '5000', name: 'تكلفة البضاعة المباعة', type: 'expense', kind: 'cogs', system: true },
  { id: 'acc_exp_rent', code: '5100', name: 'مصاريف إيجار', type: 'expense', kind: 'expense', system: false },
  { id: 'acc_exp_salaries', code: '5200', name: 'مصاريف رواتب', type: 'expense', kind: 'expense', system: false },
  { id: 'acc_exp_utilities', code: '5300', name: 'مصاريف كهرباء وماء', type: 'expense', kind: 'expense', system: false },
  { id: 'acc_exp_general', code: '5400', name: 'مصاريف عامة وإدارية', type: 'expense', kind: 'expense', system: false },
];

const ACCOUNT_TYPE_LABELS = {
  asset: 'أصول',
  liability: 'خصوم',
  equity: 'حقوق ملكية',
  revenue: 'إيرادات',
  expense: 'مصاريف',
};

const ACCOUNT_TYPE_ORDER = ['asset', 'liability', 'equity', 'revenue', 'expense'];

const PAYMENT_METHOD_LABELS = { cash: 'نقدي', bank: 'بنك', credit: 'آجل' };

const UNITS = ['قطعة', 'كرتون', 'كيلوجرام', 'لتر', 'متر', 'علبة', 'صندوق'];

const CURRENCIES = [
  { label: 'ريال سعودي', symbol: 'ر.س' },
  { label: 'ريال يمني', symbol: 'ر.ي' },
  { label: 'درهم إماراتي', symbol: 'د.إ' },
  { label: 'دينار كويتي', symbol: 'د.ك' },
  { label: 'ريال قطري', symbol: 'ر.ق' },
  { label: 'دينار بحريني', symbol: 'د.ب' },
  { label: 'ريال عماني', symbol: 'ر.ع' },
  { label: 'جنيه مصري', symbol: 'ج.م' },
  { label: 'دينار أردني', symbol: 'د.أ' },
  { label: 'دينار عراقي', symbol: 'د.ع' },
  { label: 'ليرة لبنانية', symbol: 'ل.ل' },
  { label: 'ليرة سورية', symbol: 'ل.س' },
  { label: 'دولار أمريكي', symbol: '$' },
  { label: 'يورو', symbol: '€' },
];

/* ================================ HELPERS ================================ */

function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmtNum(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pad(n, len) {
  return String(n).padStart(len, '0');
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function classNames(...args) {
  return args.filter(Boolean).join(' ');
}

/* Natural balance sign per account type: for asset/expense debit is positive;
   for liability/equity/revenue credit is positive. */
function accountBalance(account, journalEntries) {
  let debit = 0, credit = 0;
  for (const je of journalEntries) {
    for (const line of je.lines) {
      if (line.accountId === account.id) {
        debit += Number(line.debit) || 0;
        credit += Number(line.credit) || 0;
      }
    }
  }
  const natural = (account.type === 'asset' || account.type === 'expense') ? (debit - credit) : (credit - debit);
  return { debit, credit, balance: natural };
}

// Chronological running-balance ledger for a single internal account (cash, bank,
// AR, AP, inventory...), used for the dashboard/treasury drill-down view.
function computeAccountLedger(account, journalEntries, from, to) {
  const isDebitNatural = account.type === 'asset' || account.type === 'expense';
  const entries = [];
  journalEntries.forEach(je => {
    je.lines.forEach(l => {
      if (l.accountId === account.id) {
        entries.push({ date: je.date, no: je.no, description: je.description, debit: l.debit, credit: l.credit, sourceType: je.sourceType });
      }
    });
  });
  entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.no - b.no));

  const before = entries.filter(e => from && e.date < from);
  const opening = before.reduce((s, e) => s + (isDebitNatural ? e.debit - e.credit : e.credit - e.debit), 0);

  const inRange = entries.filter(e => (!from || e.date >= from) && (!to || e.date <= to));
  let running = opening;
  const rows = inRange.map(e => {
    running += isDebitNatural ? e.debit - e.credit : e.credit - e.debit;
    return { ...e, balance: running };
  });

  return { opening, rows, closing: running };
}

// Best-effort amount guess from a pasted wallet/bank SMS - picks the largest
// plausible number found in the text; the user always reviews/edits it before saving.
function extractAmountFromText(text) {
  if (!text) return '';
  const matches = text.match(/\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?/g);
  if (!matches) return '';
  const nums = matches.map(m => Number(m.replace(/,/g, ''))).filter(n => !isNaN(n) && n > 0);
  if (nums.length === 0) return '';
  return Math.max(...nums);
}

/* ============================ EXCEL EXPORT ============================ */

// rows: array of plain objects; keys become column headers in the exported sheet.
function exportRowsToExcel(filename, sheetName, rows) {
  try {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
    XLSX.writeFile(wb, `${filename}.xlsx`);
    return true;
  } catch (e) {
    return false;
  }
}

/* ============================ ITEM CARD (بطاقة صنف) ============================ */

// Chronological quantity + value movement for a single product: purchases in,
// sales out, running stock balance - the standard "item card" inventory report.
function computeItemCard(product, salesInvoices, purchaseInvoices, from, to) {
  let moves = [];
  purchaseInvoices.forEach(inv => {
    inv.items.forEach(it => {
      if (it.productId === product.id) {
        moves.push({ date: inv.date, order: 1, description: `شراء - فاتورة مشتريات #${inv.no}`, qtyIn: Number(it.qty), qtyOut: 0, unitCost: Number(it.price) });
      }
    });
  });
  salesInvoices.forEach(inv => {
    inv.items.forEach(it => {
      if (it.productId === product.id) {
        moves.push({ date: inv.date, order: 2, description: `بيع - فاتورة مبيعات #${inv.no}`, qtyIn: 0, qtyOut: Number(it.qty), unitCost: Number(it.cost) || 0 });
      }
    });
  });
  moves.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.order - b.order));

  const before = moves.filter(m => from && m.date < from);
  const openingQty = before.reduce((s, m) => s + m.qtyIn - m.qtyOut, 0);

  const inRange = moves.filter(m => (!from || m.date >= from) && (!to || m.date <= to));
  let running = openingQty;
  const rows = inRange.map(m => {
    running += m.qtyIn - m.qtyOut;
    return { ...m, balance: running };
  });

  const totalIn = inRange.reduce((s, m) => s + m.qtyIn, 0);
  const totalOut = inRange.reduce((s, m) => s + m.qtyOut, 0);

  return { openingQty, rows, closingQty: running, totalIn, totalOut };
}

function filterEntriesByDate(journalEntries, from, to) {
  return journalEntries.filter(je => {
    if (from && je.date < from) return false;
    if (to && je.date > to) return false;
    return true;
  });
}

/* ============================ DATE MATH ============================ */

function addDays(iso, days) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function addMonths(iso, months) {
  const d = new Date(iso + 'T00:00:00');
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function daysDiff(fromISO, toISO) {
  const a = new Date(fromISO + 'T00:00:00');
  const b = new Date(toISO + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

/* ============================ VIP TIER ============================ */

// Total credit-worthy sales for a customer within the trailing `days` window
// (used to decide automatic VIP promotion).
function customerTrailingSales(customerId, salesInvoices, today, days = 30) {
  const since = addDays(today, -days);
  return salesInvoices
    .filter(inv => inv.customerId === customerId && inv.date >= since && inv.date <= today)
    .reduce((s, inv) => s + inv.total, 0);
}

function computeCustomerTier(customer, salesInvoices, settings, today) {
  if (!settings.vipEnabled || !customer) return { tier: 'normal', trailingTotal: 0 };
  const trailingTotal = customerTrailingSales(customer.id, salesInvoices, today, 30);
  return { tier: trailingTotal >= settings.vipMonthlyThreshold ? 'vip' : 'normal', trailingTotal };
}

/* ============================ CREDIT RISK ============================ */

// Looks only at currently-unpaid invoices relative to today vs. their due date.
function computeCustomerRisk(customer, salesInvoices, settings, today) {
  if (!customer) return { level: 'excellent', overdueCount: 0, overdueAmount: 0, maxDaysOverdue: 0 };
  const overdue = salesInvoices.filter(inv => {
    if (inv.customerId !== customer.id) return false;
    const remaining = inv.total - inv.paidAmount;
    if (remaining <= 0.005) return false;
    if (!inv.dueDate) return false;
    return inv.dueDate < today;
  });
  const overdueAmount = overdue.reduce((s, inv) => s + (inv.total - inv.paidAmount), 0);
  const maxDaysOverdue = overdue.reduce((m, inv) => Math.max(m, daysDiff(inv.dueDate, today)), 0);
  let level = 'excellent';
  if (overdue.length >= settings.overdueBlockCount || maxDaysOverdue > settings.overdueBlockThresholdDays) {
    level = 'poor';
  } else if (overdue.length >= 1) {
    level = 'fair';
  }
  return { level, overdueCount: overdue.length, overdueAmount, maxDaysOverdue };
}

const RISK_LABELS = { excellent: 'ممتاز - يسدد بانتظام', fair: 'متوسط - تأخر بسيط', poor: 'ضعيف - آجل محظور' };

/* ============================ WHATSAPP REMINDERS ============================ */

function cleanPhoneForWhatsApp(phone) {
  return (phone || '').replace(/[^0-9]/g, '');
}

function buildWhatsAppLink(phone, message) {
  const digits = cleanPhoneForWhatsApp(phone);
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

// Determine what stage of collections reminder an unpaid invoice is at today.
function reminderStage(invoice, settings, today) {
  const remaining = invoice.total - invoice.paidAmount;
  if (remaining <= 0.005 || !invoice.dueDate) return null;
  const daysToDue = daysDiff(today, invoice.dueDate); // positive = due in future
  if (daysToDue < 0) return { stage: 'overdue', daysOverdue: -daysToDue };
  if (daysToDue === 0) return { stage: 'due_today', daysOverdue: 0 };
  if (daysToDue <= settings.reminderBeforeDays) return { stage: 'upcoming', daysOverdue: 0, daysToDue };
  return null;
}

function composeReminderMessage(stage, invoice, customer, companyName, currency) {
  const remaining = fmtNum(invoice.total - invoice.paidAmount);
  const name = customer ? customer.name : 'عميلنا العزيز';
  if (stage.stage === 'upcoming') {
    return `مرحبًا ${name}، تذكير لطيف بأن فاتورتكم رقم #${invoice.no} بمبلغ ${remaining} ${currency} لدى ${companyName} يستحق سدادها بتاريخ ${fmtDate(invoice.dueDate)}. نشكر لكم حسن التعامل ونتطلع لتسديدها في موعدها. 🌿`;
  }
  if (stage.stage === 'due_today') {
    return `مرحبًا ${name}، نود تذكيركم بأن فاتورتكم رقم #${invoice.no} بمبلغ ${remaining} ${currency} لدى ${companyName} تستحق السداد اليوم. نرجو التكرم بالسداد في أقرب وقت ممكن لتفادي أي تأخير. شكرًا لتعاونكم.`;
  }
  return `السيد/ة ${name}، نحيطكم علمًا بأن فاتورتكم رقم #${invoice.no} بمبلغ ${remaining} ${currency} لدى ${companyName} متأخرة السداد منذ ${stage.daysOverdue} يومًا عن تاريخ الاستحقاق (${fmtDate(invoice.dueDate)}). نأمل تسوية المبلغ خلال 3 أيام عمل تجنبًا لاتخاذ الإجراءات القانونية اللازمة لتحصيل الحقوق.`;
}

/* ============================ DEMAND FORECAST ============================ */

// Average weekly sales velocity per product over the trailing `days` window,
// with a simple reorder suggestion for the coming week.
function computeForecast(products, salesInvoices, today, days = 90) {
  const since = addDays(today, -days);
  const weeks = days / 7;
  const soldQty = {};
  salesInvoices.forEach(inv => {
    if (inv.date < since || inv.date > today) return;
    inv.items.forEach(it => {
      if (!it.productId) return;
      soldQty[it.productId] = (soldQty[it.productId] || 0) + Number(it.qty);
    });
  });
  return products.map(p => {
    const totalSold = soldQty[p.id] || 0;
    const weeklyAvg = totalSold / weeks;
    const coverageWeeks = weeklyAvg > 0 ? Number(p.qty) / weeklyAvg : Infinity;
    const suggestedOrder = weeklyAvg > 0 ? Math.max(0, Math.ceil(weeklyAvg * 2 - Number(p.qty))) : 0;
    return { product: p, totalSold, weeklyAvg, coverageWeeks, suggestedOrder };
  }).filter(f => f.totalSold > 0).sort((a, b) => a.coverageWeeks - b.coverageWeeks);
}

/* ============================ ACCOUNT STATEMENT (كشف حساب) ============================ */

// Builds a chronological running-balance statement for one customer or supplier.
// debit = increases what they owe us (customer invoice) / what we owe them (supplier invoice)
// credit = a payment that reduces that balance
function computeStatement(partyType, partyId, from, to, salesInvoices, purchaseInvoices, payments, accounts) {
  let allTx = [];
  if (partyType === 'customer') {
    allTx = allTx.concat(
      salesInvoices.filter(inv => inv.customerId === partyId).map(inv => ({
        date: inv.date, order: 1, description: `فاتورة مبيعات #${inv.no}`, debit: inv.total, credit: 0,
      })),
      payments.filter(p => p.type === 'customer' && p.contactId === partyId).map(p => ({
        date: p.date, order: 2, description: `دفعة مستلمة - ${paymentMethodLabel(p.method, accounts)}`, debit: 0, credit: p.amount,
      }))
    );
  } else {
    allTx = allTx.concat(
      purchaseInvoices.filter(inv => inv.supplierId === partyId).map(inv => ({
        date: inv.date, order: 1, description: `فاتورة مشتريات #${inv.no}`, debit: inv.total, credit: 0,
      })),
      payments.filter(p => p.type === 'supplier' && p.contactId === partyId).map(p => ({
        date: p.date, order: 2, description: `دفعة مسددة - ${paymentMethodLabel(p.method, accounts)}`, debit: 0, credit: p.amount,
      }))
    );
  }
  allTx.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.order - b.order));

  const before = allTx.filter(t => from && t.date < from);
  const openingBalance = before.reduce((s, t) => s + t.debit - t.credit, 0);

  const inRange = allTx.filter(t => (!from || t.date >= from) && (!to || t.date <= to));
  let running = openingBalance;
  const rows = inRange.map(t => {
    running += t.debit - t.credit;
    return { ...t, balance: running };
  });

  return { openingBalance, rows, closingBalance: running };
}

/* ============================ RECURRING INVOICES ENGINE ============================
   Runs once when the app loads: generates any sales invoices that have come due
   for active recurring templates, advancing each template's next run date.
   Written as a standalone function (not a hook) so it can run once against the
   freshly-loaded data before React state settles. */

function runRecurringInvoices({ recurringTemplates, salesInvoices, products, accounts, journalEntries, settings, reps, today }) {
  let nextSalesNo = settings.nextSalesNo;
  let nextJournalNo = settings.nextJournalNo;
  const newSales = [...salesInvoices];
  const newJournal = [...journalEntries];
  let workingProducts = products.map(p => ({ ...p }));
  let generatedCount = 0;

  const nextTemplates = recurringTemplates.map(tpl => {
    if (!tpl.active) return tpl;
    let nextRunDate = tpl.nextRunDate;
    let guard = 0;
    while (nextRunDate <= today && guard < 24) {
      guard++;
      const totals = computeInvoiceTotals(tpl.items, tpl.discount || 0, tpl.applyTax, settings);
      const no = nextSalesNo;
      const invId = uid('sinv');
      const jeNo = nextJournalNo;

      const lines = [];
      if (tpl.paymentMethod === 'credit') {
        lines.push({ accountId: getAccountByKind(accounts, 'ar').id, debit: totals.total, credit: 0 });
      } else {
        lines.push({ accountId: resolveTreasuryAccountId(tpl.paymentMethod, accounts), debit: totals.total, credit: 0 });
      }
      lines.push({ accountId: getAccountByKind(accounts, 'sales_revenue').id, debit: 0, credit: totals.afterDiscount });
      if (totals.tax > 0) lines.push({ accountId: getAccountByKind(accounts, 'vat_out').id, debit: 0, credit: totals.tax });
      if (totals.cost > 0) {
        lines.push({ accountId: getAccountByKind(accounts, 'cogs').id, debit: totals.cost, credit: 0 });
        lines.push({ accountId: getAccountByKind(accounts, 'inventory').id, debit: 0, credit: totals.cost });
      }
      const je = makeEntry(jeNo, nextRunDate, `فاتورة دورية #${no} (${tpl.name || 'اشتراك متكرر'})`, lines, 'sales', invId);

      const rep = tpl.repId ? reps.find(r => r.id === tpl.repId) : null;
      const commissionAmount = rep ? totals.afterDiscount * (Number(rep.commissionPercent) || 0) / 100 : 0;

      newSales.push({
        id: invId, no, date: nextRunDate, customerId: tpl.customerId, items: tpl.items,
        discount: tpl.discount || 0, subtotal: totals.subtotal, tax: totals.tax, total: totals.total,
        paymentMethod: tpl.paymentMethod, paidAmount: tpl.paymentMethod === 'credit' ? 0 : totals.total,
        journalId: je.id, dueDate: addDays(nextRunDate, settings.defaultPaymentTermsDays),
        repId: tpl.repId || null, commissionAmount, isVipSale: false, isRecurring: true,
      });
      newJournal.push(je);

      workingProducts = workingProducts.map(p => {
        const item = tpl.items.find(it => it.productId === p.id);
        return item ? { ...p, qty: Number(p.qty) - Number(item.qty) } : p;
      });

      nextSalesNo += 1;
      nextJournalNo += 1;
      generatedCount += 1;
      nextRunDate = tpl.frequency === 'weekly' ? addDays(nextRunDate, 7) : addMonths(nextRunDate, 1);
    }
    return { ...tpl, nextRunDate };
  });

  return {
    recurringTemplates: nextTemplates,
    salesInvoices: newSales,
    products: workingProducts,
    journalEntries: newJournal,
    settings: { ...settings, nextSalesNo, nextJournalNo },
    generatedCount,
  };
}

/* ============================ STORAGE HELPERS ============================
   Standalone build: uses the browser's localStorage (available natively in
   both the Electron shell and the Capacitor WebView), namespaced so it
   never collides with anything else running on the same origin. */

const STORAGE_PREFIX = 'acct_';

async function loadKey(key, fallback) {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
    if (raw !== null) return JSON.parse(raw);
    return fallback;
  } catch (e) {
    return fallback;
  }
}

async function saveKey(key, value) {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

/* ============================ JOURNAL BUILDER ============================ */

function makeEntry(no, date, description, lines, sourceType, sourceId) {
  // lines: [{accountId, debit, credit}]
  const cleanLines = lines
    .filter(l => (Number(l.debit) || 0) !== 0 || (Number(l.credit) || 0) !== 0)
    .map(l => ({ accountId: l.accountId, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 }));
  return {
    id: uid('je'),
    no,
    date,
    description,
    lines: cleanLines,
    sourceType: sourceType || 'manual',
    sourceId: sourceId || null,
  };
}

function isBalanced(lines) {
  const d = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const c = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  return Math.abs(d - c) < 0.005;
}

/* ============================ INVOICE MATH ============================ */

function computeInvoiceTotals(items, discount, applyTax, settings) {
  const subtotal = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
  const afterDiscount = Math.max(0, subtotal - (Number(discount) || 0));
  let tax = 0;
  if (applyTax) {
    tax = settings.taxType === 'fixed'
      ? (Number(settings.taxFixedAmount) || 0)
      : afterDiscount * (Number(settings.taxRate) || 0) / 100;
  }
  const total = afterDiscount + tax;
  const cost = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.cost) || 0), 0);
  return { subtotal, afterDiscount, tax, total, cost };
}

function getCashLikeAccountId(accounts, method) {
  const kind = method === 'bank' ? 'bank' : 'cash';
  const acc = accounts.find(a => a.kind === kind);
  return acc ? acc.id : null;
}

function getAccountByKind(accounts, kind) {
  return accounts.find(a => a.kind === kind) || null;
}

// All treasury (money-holding) accounts: cash drawers, bank accounts, e-wallets.
function getTreasuryAccounts(accounts) {
  return accounts.filter(a => a.kind === 'cash' || a.kind === 'bank');
}

// A paymentMethod value on an invoice/expense/payment can be: 'credit', a literal
// legacy 'cash'/'bank' (from before multi-treasury support), or a real account id.
// This resolves it to an actual account id to post journal lines against.
function resolveTreasuryAccountId(paymentMethod, accounts) {
  if (paymentMethod === 'cash' || paymentMethod === 'bank') return getCashLikeAccountId(accounts, paymentMethod);
  return paymentMethod;
}

function paymentMethodLabel(paymentMethod, accounts) {
  if (paymentMethod === 'credit') return 'آجل';
  if (paymentMethod === 'cash') return (getAccountByKind(accounts, 'cash') || {}).name || 'نقدي';
  if (paymentMethod === 'bank') return (getAccountByKind(accounts, 'bank') || {}).name || 'بنك';
  const acc = accounts.find(a => a.id === paymentMethod);
  return acc ? acc.name : paymentMethod;
}

/* ============================== DESIGN ATOMS ============================== */


function Figure({ value, className = '', currency = '', tone }) {
  const toneClass = tone === 'pos' ? 'text-emerald-700' : tone === 'neg' ? 'text-rose-700' : '';
  return (
    <span dir="ltr" className={classNames('font-figures tabular-nums', toneClass, className)}>
      {fmtNum(value)}{currency ? ` ${currency}` : ''}
    </span>
  );
}

function Card({ children, className = '' }) {
  return (
    <div className={classNames('bg-white rounded-lg border border-stone-200 shadow-sm', className)}>
      {children}
    </div>
  );
}

function LedgerStatCard({ icon: Icon, label, value, currency, tone = 'neutral', sub, onClick }) {
  const iconBg = tone === 'pos' ? 'bg-emerald-100 text-emerald-700'
    : tone === 'neg' ? 'bg-rose-100 text-rose-700'
    : tone === 'warn' ? 'bg-amber-100 text-amber-700'
    : 'bg-stone-100 text-stone-600';
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className={classNames('ledger-card rounded-lg p-4 flex flex-col gap-2 min-w-0 text-right w-full', onClick && 'hover:shadow-md transition-shadow cursor-pointer')}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-stone-500 font-body">{label}</span>
        <span className={classNames('p-1.5 rounded-md', iconBg)}><Icon size={16} /></span>
      </div>
      <Figure value={value} currency={currency} className="text-xl font-semibold text-stone-800" />
      {sub && <span className="text-xs text-stone-400 font-body">{sub}</span>}
    </Tag>
  );
}

function Button({ children, onClick, variant = 'primary', size = 'md', icon: Icon, type = 'button', disabled, className = '' }) {
  const base = 'inline-flex items-center justify-center gap-1.5 rounded-md font-body font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const sizes = size === 'sm' ? 'px-2.5 py-1.5 text-xs' : size === 'lg' ? 'px-5 py-2.5 text-base' : 'px-3.5 py-2 text-sm';
  const variants = {
    primary: 'bg-emerald-700 text-white hover:bg-emerald-800',
    secondary: 'bg-stone-100 text-stone-700 hover:bg-stone-200',
    danger: 'bg-rose-600 text-white hover:bg-rose-700',
    ghost: 'bg-transparent text-stone-600 hover:bg-stone-100',
    outline: 'bg-white text-stone-700 border border-stone-300 hover:bg-stone-50',
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={classNames(base, sizes, variants[variant], className)}>
      {Icon && <Icon size={size === 'sm' ? 14 : 16} />}
      {children}
    </button>
  );
}

function IconButton({ icon: Icon, onClick, title, variant = 'ghost', size = 16 }) {
  const variants = {
    ghost: 'text-stone-500 hover:bg-stone-100 hover:text-stone-800',
    danger: 'text-rose-500 hover:bg-rose-50 hover:text-rose-700',
  };
  return (
    <button type="button" onClick={onClick} title={title} className={classNames('p-1.5 rounded-md transition-colors', variants[variant])}>
      <Icon size={size} />
    </button>
  );
}

function Field({ label, children, required, hint }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-body">
      {label && <span className="text-stone-600">{label}{required && <span className="text-rose-500"> *</span>}</span>}
      {children}
      {hint && <span className="text-xs text-stone-400">{hint}</span>}
    </label>
  );
}

const inputBase = 'w-full rounded-md border border-stone-300 px-3 py-2 text-sm font-body focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-600';

function Input(props) {
  return <input {...props} className={classNames(inputBase, props.className)} />;
}
function Select({ children, ...props }) {
  return <select {...props} className={classNames(inputBase, 'bg-white', props.className)}>{children}</select>;
}
function Textarea(props) {
  return <textarea {...props} className={classNames(inputBase, props.className)} />;
}

function Badge({ children, tone = 'neutral' }) {
  const tones = {
    neutral: 'bg-stone-100 text-stone-600',
    green: 'bg-emerald-100 text-emerald-700',
    red: 'bg-rose-100 text-rose-700',
    amber: 'bg-amber-100 text-amber-700',
    blue: 'bg-sky-100 text-sky-700',
  };
  return <span className={classNames('inline-block px-2 py-0.5 rounded-full text-xs font-body font-medium', tones[tone])}>{children}</span>;
}

function EmptyState({ icon: Icon, title, hint, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
      <span className="p-3 rounded-full bg-stone-100 text-stone-400"><Icon size={26} /></span>
      <p className="font-body text-stone-600 font-medium">{title}</p>
      {hint && <p className="font-body text-sm text-stone-400 max-w-xs">{hint}</p>}
      {action}
    </div>
  );
}

function Modal({ title, onClose, children, width = 'max-w-lg' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(28,25,23,0.45)' }} onClick={onClose}>
      <div
        className={classNames('bg-white rounded-xl shadow-xl w-full overflow-y-auto', width)}
        style={{ maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100 sticky top-0 bg-white z-10">
          <h3 className="font-display font-semibold text-stone-800">{title}</h3>
          <IconButton icon={X} onClick={onClose} title="إغلاق" />
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function ConfirmDialog({ title, message, onConfirm, onCancel }) {
  return (
    <Modal title={title} onClose={onCancel} width="max-w-sm">
      <p className="font-body text-sm text-stone-600 mb-5">{message}</p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>إلغاء</Button>
        <Button variant="danger" onClick={onConfirm} icon={Trash2}>تأكيد الحذف</Button>
      </div>
    </Modal>
  );
}

function Toast({ toast }) {
  if (!toast) return null;
  const isErr = toast.type === 'error';
  return (
    <div className={classNames(
      'fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg font-body text-sm',
      isErr ? 'bg-rose-600 text-white' : 'bg-emerald-700 text-white'
    )}>
      {isErr ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
      {toast.message}
    </div>
  );
}

/* ============================== NAVIGATION ============================== */

const NAV_ITEMS = [
  { key: 'dashboard', label: 'لوحة التحكم', icon: LayoutDashboard },
  { key: 'treasury', label: 'الصندوق والبنوك', icon: Landmark },
  { key: 'accounts', label: 'دليل الحسابات', icon: BookOpen },
  { key: 'customers', label: 'العملاء', icon: Users },
  { key: 'suppliers', label: 'الموردون', icon: Truck },
  { key: 'workers', label: 'العمال والموظفون', icon: UserCog },
  { key: 'statement', label: 'كشف حساب', icon: Receipt },
  { key: 'products', label: 'المنتجات والمخزون', icon: Package },
  { key: 'sales', label: 'فواتير المبيعات', icon: ShoppingCart },
  { key: 'purchases', label: 'فواتير المشتريات', icon: FileText },
  { key: 'recurring', label: 'الفواتير الدورية', icon: Repeat },
  { key: 'reminders', label: 'تذكيرات التحصيل', icon: Bell },
  { key: 'forecast', label: 'التنبؤ بالطلب', icon: Sparkles },
  { key: 'reps', label: 'المندوبون والعمولات', icon: Award },
  { key: 'expenses', label: 'المصاريف', icon: Wallet },
  { key: 'journal', label: 'القيود اليومية', icon: ClipboardList },
  { key: 'reports', label: 'التقارير المالية', icon: PieChart },
  { key: 'settings', label: 'الإعدادات', icon: SettingsIcon },
];

function Sidebar({ active, onNavigate, companyName, mobileOpen, setMobileOpen }) {
  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-30 md:hidden" style={{ backgroundColor: 'rgba(28,25,23,0.45)' }} onClick={() => setMobileOpen(false)} />
      )}
      <aside className={classNames(
        'text-stone-200 w-64 shrink-0 flex flex-col fixed md:sticky top-0 h-screen z-40 transition-transform no-print',
        mobileOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'
      )} style={{ insetInlineStart: 0, backgroundColor: '#16241D' }}>
        <div className="px-5 py-5 border-b border-stone-700 flex items-center gap-2">
          <span className="p-2 rounded-lg bg-emerald-700"><Banknote size={20} /></span>
          <div className="min-w-0">
            <p className="font-display font-bold text-white text-sm truncate">{companyName}</p>
            <p className="text-xs text-stone-400 font-body">نظام محاسبي متكامل</p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-2 flex flex-col gap-0.5">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            const isActive = active === item.key;
            return (
              <button
                key={item.key}
                onClick={() => { onNavigate(item.key); setMobileOpen(false); }}
                className={classNames(
                  'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-body text-right transition-colors',
                  isActive ? 'bg-emerald-700 text-white font-medium' : 'text-stone-300 hover:bg-stone-800'
                )}
              >
                <Icon size={17} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="px-4 py-3 border-t border-stone-700 text-xs text-stone-500 font-body">
          البيانات محفوظة على حسابك تلقائيًا
        </div>
      </aside>
    </>
  );
}

function TopBar({ title, setMobileOpen, right }) {
  return (
    <div className="flex items-center justify-between px-4 md:px-6 py-4 bg-white border-b border-stone-200 sticky top-0 z-20 no-print">
      <div className="flex items-center gap-3">
        <button className="md:hidden p-1.5 rounded-md hover:bg-stone-100" onClick={() => setMobileOpen(true)}>
          <Menu size={20} />
        </button>
        <h1 className="font-display font-bold text-lg text-stone-800">{title}</h1>
      </div>
      {right}
    </div>
  );
}

/* ============================== ACCOUNT LEDGER DRILL-DOWN ============================== */

function AccountLedgerModal({ account, journalEntries, currency, onClose }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(todayISO());
  const ledger = computeAccountLedger(account, journalEntries, from, to);

  return (
    <Modal title={`حركة حساب: ${account.name}`} onClose={onClose} width="max-w-2xl">
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3 no-print">
          <Field label="من تاريخ">
            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </Field>
          <Field label="إلى تاريخ">
            <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
          </Field>
        </div>

        <div className="print-area">
          <div className="flex items-center justify-between mb-3 pb-3 border-b border-stone-200">
            <p className="font-body font-medium text-stone-700">الرصيد الافتتاحي</p>
            <Figure value={ledger.opening} currency={currency} />
          </div>
          {ledger.rows.length === 0 ? (
            <p className="text-sm text-stone-400 font-body py-6 text-center">لا توجد حركات في هذه الفترة.</p>
          ) : (
            <table className="w-full text-sm font-body">
              <thead>
                <tr className="text-stone-400 text-xs border-b border-stone-100">
                  <th className="text-right py-2 font-normal">التاريخ</th>
                  <th className="text-right py-2 font-normal">البيان</th>
                  <th className="text-right py-2 font-normal">مدين</th>
                  <th className="text-right py-2 font-normal">دائن</th>
                  <th className="text-right py-2 font-normal">الرصيد</th>
                </tr>
              </thead>
              <tbody>
                {ledger.rows.map((r, i) => (
                  <tr key={i} className="border-b border-stone-50">
                    <td className="py-2 text-stone-500">{fmtDate(r.date)}</td>
                    <td className="py-2 text-stone-700">{r.description}</td>
                    <td className="py-2">{r.debit > 0 ? <Figure value={r.debit} /> : '-'}</td>
                    <td className="py-2">{r.credit > 0 ? <Figure value={r.credit} /> : '-'}</td>
                    <td className="py-2"><Figure value={r.balance} currency={currency} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="flex items-center justify-between mt-3 pt-3 border-t-2 border-stone-200 font-semibold">
            <p className="font-body text-stone-700">الرصيد الختامي</p>
            <Figure value={ledger.closing} currency={currency} className="text-lg" />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-1 no-print">
          <Button variant="secondary" onClick={onClose}>إغلاق</Button>
          <Button variant="outline" icon={Download} onClick={() => exportRowsToExcel(`حركة-${account.name}`, 'حركة الحساب', ledger.rows.map(r => ({
            'التاريخ': fmtDate(r.date), 'البيان': r.description, 'مدين': r.debit, 'دائن': r.credit, 'الرصيد': r.balance,
          })))}>تصدير Excel</Button>
          <Button icon={Printer} onClick={() => window.print()}>طباعة / PDF</Button>
        </div>
      </div>
    </Modal>
  );
}

/* ============================== TREASURY (CASH / BANK / WALLETS) ============================== */

function TreasuryAccountFormModal({ onClose, onSave }) {
  const [form, setForm] = useState({ name: '', kind: 'cash', openingBalance: 0 });
  const canSave = form.name.trim();
  return (
    <Modal title="حساب صندوق/بنك جديد" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Field label="اسم الحساب" required hint="مثال: صندوق الفرع الرئيسي، بنك الراجحي، محفظة STC Pay">
          <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </Field>
        <Field label="النوع" required>
          <Select value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value }))}>
            <option value="cash">صندوق نقدي</option>
            <option value="bank">بنك / محفظة إلكترونية</option>
          </Select>
        </Field>
        <Field label="الرصيد الافتتاحي" hint="اتركه صفرًا إذا كان حسابًا جديدًا بلا رصيد سابق">
          <Input type="number" min="0" step="0.01" dir="ltr" value={form.openingBalance} onChange={e => setForm(f => ({ ...f, openingBalance: e.target.value }))} />
        </Field>
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="secondary" onClick={onClose}>إلغاء</Button>
          <Button disabled={!canSave} icon={Check} onClick={() => onSave({ ...form, openingBalance: Number(form.openingBalance) || 0 })}>حفظ</Button>
        </div>
      </div>
    </Modal>
  );
}

function TreasuryTransactionModal({ account, accounts, onClose, onSave }) {
  const offsetAccounts = accounts.filter(a => (a.type === 'equity' || a.type === 'revenue' || a.type === 'expense') && a.kind !== 'cogs');
  const [type, setType] = useState('deposit');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [description, setDescription] = useState('');
  const [offsetAccountId, setOffsetAccountId] = useState(getAccountByKind(accounts, 'capital')?.id || offsetAccounts[0]?.id || '');
  const [smsText, setSmsText] = useState('');

  const canSave = Number(amount) > 0 && offsetAccountId;

  return (
    <Modal title={`تسجيل حركة - ${account.name}`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Field label="نوع الحركة" required>
          <Select value={type} onChange={e => setType(e.target.value)}>
            <option value="deposit">إيداع / استلام مبلغ</option>
            <option value="withdraw">سحب / صرف مبلغ</option>
          </Select>
        </Field>

        <Field label="لصق نص رسالة (اختياري)" hint="الصق نص رسالة المحفظة أو البنك، وسيحاول النظام استخراج المبلغ تلقائيًا">
          <Textarea rows={2} value={smsText} onChange={e => {
            setSmsText(e.target.value);
            const guess = extractAmountFromText(e.target.value);
            if (guess) setAmount(guess);
          }} placeholder="مثال: تم إيداع مبلغ 500.00 ريال في محفظتك..." />
        </Field>

        <Field label="المبلغ" required>
          <Input type="number" min="0" step="0.01" dir="ltr" value={amount} onChange={e => setAmount(e.target.value)} />
        </Field>
        <Field label="التاريخ" required>
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </Field>
        <Field label={type === 'deposit' ? 'مصدر المبلغ' : 'وجهة الصرف'} required>
          <Select value={offsetAccountId} onChange={e => setOffsetAccountId(e.target.value)}>
            {offsetAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        <Field label="وصف">
          <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="مثال: إيداع رأس مال، دفعة غير مرتبطة بفاتورة..." />
        </Field>
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="secondary" onClick={onClose}>إلغاء</Button>
          <Button disabled={!canSave} icon={Check} onClick={() => onSave({
            type, amount: Number(amount), date, description, offsetAccountId, treasuryAccountId: account.id,
          })}>حفظ الحركة</Button>
        </div>
      </div>
    </Modal>
  );
}

function TreasuryView({ accounts, journalEntries, currency, onAddAccount, onDeleteAccount, onAddTransaction }) {
  const treasuryAccounts = getTreasuryAccounts(accounts);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [txFor, setTxFor] = useState(null);
  const [ledgerFor, setLedgerFor] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  const usedAccountIds = useMemo(() => {
    const s = new Set();
    journalEntries.forEach(je => je.lines.forEach(l => s.add(l.accountId)));
    return s;
  }, [journalEntries]);

  const total = treasuryAccounts.reduce((s, a) => s + accountBalance(a, journalEntries).balance, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-body text-stone-500">إجمالي السيولة في كل الحسابات: <Figure value={total} currency={currency} className="text-stone-700 font-medium" /></span>
        <Button icon={Plus} onClick={() => setShowAccountForm(true)}>حساب صندوق/بنك جديد</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {treasuryAccounts.map(acc => {
          const bal = accountBalance(acc, journalEntries).balance;
          return (
            <Card key={acc.id} className="p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-md bg-emerald-100 text-emerald-700">
                    {acc.kind === 'cash' ? <Banknote size={16} /> : <Landmark size={16} />}
                  </span>
                  <div>
                    <p className="font-body font-medium text-stone-800">{acc.name}</p>
                    <p className="text-xs text-stone-400 font-body">{acc.kind === 'cash' ? 'صندوق نقدي' : 'بنك / محفظة'}</p>
                  </div>
                </div>
                {!acc.system && (
                  <IconButton icon={Trash2} variant="danger" title="حذف" onClick={() => setConfirmDel(acc)} />
                )}
              </div>
              <Figure value={bal} currency={currency} className="text-xl font-semibold text-stone-800" tone={bal >= 0 ? 'pos' : 'neg'} />
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => setLedgerFor(acc)}>عرض الحركات</Button>
                <Button size="sm" className="flex-1" onClick={() => setTxFor(acc)}>تسجيل حركة</Button>
              </div>
            </Card>
          );
        })}
      </div>

      {showAccountForm && (
        <TreasuryAccountFormModal
          onClose={() => setShowAccountForm(false)}
          onSave={(form) => { onAddAccount(form); setShowAccountForm(false); }}
        />
      )}

      {txFor && (
        <TreasuryTransactionModal
          account={txFor} accounts={accounts}
          onClose={() => setTxFor(null)}
          onSave={(data) => { onAddTransaction(data); setTxFor(null); }}
        />
      )}

      {ledgerFor && (
        <AccountLedgerModal account={ledgerFor} journalEntries={journalEntries} currency={currency} onClose={() => setLedgerFor(null)} />
      )}

      {confirmDel && (
        <ConfirmDialog
          title="حذف حساب"
          message={usedAccountIds.has(confirmDel.id)
            ? `لا يمكن حذف "${confirmDel.name}" لوجود حركات مسجلة عليه.`
            : `هل تريد حذف "${confirmDel.name}"؟`}
          onCancel={() => setConfirmDel(null)}
          onConfirm={() => { if (!usedAccountIds.has(confirmDel.id)) onDeleteAccount(confirmDel.id); setConfirmDel(null); }}
        />
      )}
    </div>
  );
}

/* ============================== DASHBOARD ============================== */

function DashboardView({ data, currency, onNavigate }) {
  const { accounts, journalEntries, salesInvoices, purchaseInvoices, products, customers, suppliers } = data;
  const [ledgerAccount, setLedgerAccount] = useState(null);

  const treasuryAccounts = getTreasuryAccounts(accounts);
  const ar = getAccountByKind(accounts, 'ar');
  const ap = getAccountByKind(accounts, 'ap');
  const inventoryAcc = getAccountByKind(accounts, 'inventory');

  const arBal = ar ? accountBalance(ar, journalEntries).balance : 0;
  const apBal = ap ? accountBalance(ap, journalEntries).balance : 0;
  const invBal = inventoryAcc ? accountBalance(inventoryAcc, journalEntries).balance : 0;

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${pad(now.getMonth() + 1, 2)}-01`;
  const monthEntries = filterEntriesByDate(journalEntries, monthStart, todayISO());

  let monthRevenue = 0, monthExpense = 0;
  for (const acc of accounts) {
    const bal = accountBalance(acc, monthEntries).balance;
    if (acc.type === 'revenue') monthRevenue += bal;
    if (acc.type === 'expense') monthExpense += bal;
  }
  const monthProfit = monthRevenue - monthExpense;

  const lowStock = products.filter(p => Number(p.qty) <= Number(p.minQty || 5)).slice(0, 6);

  const recentInvoices = [...salesInvoices]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 5);

  // last 6 months trend
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-01`;
    const endD = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const end = `${endD.getFullYear()}-${pad(endD.getMonth() + 1, 2)}-${pad(endD.getDate(), 2)}`;
    const entries = filterEntriesByDate(journalEntries, start, end);
    let rev = 0, exp = 0;
    for (const acc of accounts) {
      const bal = accountBalance(acc, entries).balance;
      if (acc.type === 'revenue') rev += bal;
      if (acc.type === 'expense') exp += bal;
    }
    months.push({ label: d.toLocaleDateString('ar-EG', { month: 'short' }), revenue: Math.round(rev), expense: Math.round(exp) });
  }
  const maxVal = Math.max(1, ...months.map(m => Math.max(m.revenue, m.expense)));

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {treasuryAccounts.map(acc => (
          <LedgerStatCard
            key={acc.id}
            icon={acc.kind === 'cash' ? Banknote : Landmark}
            label={acc.name}
            value={accountBalance(acc, journalEntries).balance}
            currency={currency}
            tone="pos"
            onClick={() => setLedgerAccount(acc)}
          />
        ))}
        <LedgerStatCard icon={Users} label="مستحق من العملاء" value={arBal} currency={currency} tone="neutral" onClick={() => ar && setLedgerAccount(ar)} />
        <LedgerStatCard icon={Truck} label="مستحق للموردين" value={apBal} currency={currency} tone="warn" onClick={() => ap && setLedgerAccount(ap)} />
        <LedgerStatCard icon={Package} label="قيمة المخزون" value={invBal} currency={currency} tone="neutral" onClick={() => inventoryAcc && setLedgerAccount(inventoryAcc)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <LedgerStatCard icon={TrendingUp} label="مبيعات الشهر الحالي" value={monthRevenue} currency={currency} tone="pos" />
        <LedgerStatCard icon={TrendingDown} label="مصاريف الشهر الحالي" value={monthExpense} currency={currency} tone="neg" />
        <LedgerStatCard icon={monthProfit >= 0 ? ArrowUpRight : ArrowDownRight} label="صافي ربح الشهر" value={monthProfit} currency={currency} tone={monthProfit >= 0 ? 'pos' : 'neg'} />
      </div>

      {ledgerAccount && (
        <AccountLedgerModal account={ledgerAccount} journalEntries={journalEntries} currency={currency} onClose={() => setLedgerAccount(null)} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-4">
          <p className="font-display font-semibold text-stone-700 mb-4 text-sm">الإيرادات والمصاريف - آخر 6 أشهر</p>
          <div className="flex items-end gap-4 h-40">
            {months.map((m, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                <div className="flex items-end gap-1 h-full w-full justify-center">
                  <div className="w-3 bg-emerald-600 rounded-t" style={{ height: `${(m.revenue / maxVal) * 100}%` }} title={`إيرادات: ${fmtNum(m.revenue)}`} />
                  <div className="w-3 bg-rose-400 rounded-t" style={{ height: `${(m.expense / maxVal) * 100}%` }} title={`مصاريف: ${fmtNum(m.expense)}`} />
                </div>
                <span className="text-xs text-stone-400 font-body">{m.label}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-4 mt-3 text-xs font-body text-stone-500">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-600 inline-block" /> إيرادات</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-rose-400 inline-block" /> مصاريف</span>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-display font-semibold text-stone-700 text-sm">تنبيه المخزون المنخفض</p>
            <AlertTriangle size={16} className="text-amber-500" />
          </div>
          {lowStock.length === 0 ? (
            <p className="text-sm text-stone-400 font-body">لا توجد أصناف منخفضة المخزون حاليًا.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {lowStock.map(p => (
                <li key={p.id} className="flex items-center justify-between text-sm font-body">
                  <span className="text-stone-700 truncate">{p.name}</span>
                  <Badge tone={Number(p.qty) === 0 ? 'red' : 'amber'}>{p.qty} {p.unit}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="font-display font-semibold text-stone-700 text-sm">أحدث فواتير المبيعات</p>
          <button onClick={() => onNavigate('sales')} className="text-xs text-emerald-700 font-body hover:underline">عرض الكل</button>
        </div>
        {recentInvoices.length === 0 ? (
          <EmptyState icon={ShoppingCart} title="لا توجد فواتير بعد" hint="أنشئ أول فاتورة مبيعات من قسم فواتير المبيعات." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-body">
              <thead>
                <tr className="text-stone-400 text-xs border-b border-stone-100">
                  <th className="text-right py-2 font-normal">رقم</th>
                  <th className="text-right py-2 font-normal">التاريخ</th>
                  <th className="text-right py-2 font-normal">العميل</th>
                  <th className="text-right py-2 font-normal">الإجمالي</th>
                  <th className="text-right py-2 font-normal">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {recentInvoices.map(inv => {
                  const cust = customers.find(c => c.id === inv.customerId);
                  const remaining = inv.total - inv.paidAmount;
                  return (
                    <tr key={inv.id} className="border-b border-stone-50">
                      <td className="py-2 text-stone-600">#{inv.no}</td>
                      <td className="py-2 text-stone-600">{fmtDate(inv.date)}</td>
                      <td className="py-2 text-stone-700">{cust ? cust.name : 'عميل نقدي'}</td>
                      <td className="py-2"><Figure value={inv.total} currency={currency} /></td>
                      <td className="py-2">
                        {remaining <= 0.005 ? <Badge tone="green">مدفوعة</Badge> : <Badge tone="amber">جزئية/آجلة</Badge>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ============================== CHART OF ACCOUNTS ============================== */

function AccountFormModal({ onClose, onSave }) {
  const [form, setForm] = useState({ code: '', name: '', type: 'expense' });
  const canSave = form.code.trim() && form.name.trim();
  return (
    <Modal title="إضافة حساب جديد" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Field label="رمز الحساب" required>
          <Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="مثال: 5500" />
        </Field>
        <Field label="اسم الحساب" required>
          <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="مثال: مصاريف صيانة" />
        </Field>
        <Field label="نوع الحساب" required>
          <Select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
            <option value="expense">مصروف</option>
            <option value="revenue">إيراد</option>
          </Select>
        </Field>
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="secondary" onClick={onClose}>إلغاء</Button>
          <Button disabled={!canSave} onClick={() => onSave(form)} icon={Check}>حفظ الحساب</Button>
        </div>
      </div>
    </Modal>
  );
}

function AccountsView({ accounts, journalEntries, currency, onAdd, onDelete }) {
  const [showForm, setShowForm] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);

  const usedAccountIds = useMemo(() => {
    const s = new Set();
    journalEntries.forEach(je => je.lines.forEach(l => s.add(l.accountId)));
    return s;
  }, [journalEntries]);

  const grouped = ACCOUNT_TYPE_ORDER.map(type => ({
    type,
    list: accounts.filter(a => a.type === type),
  }));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <Button icon={Plus} onClick={() => setShowForm(true)}>حساب جديد</Button>
      </div>
      {grouped.map(group => (
        <Card key={group.type} className="p-4">
          <p className="font-display font-semibold text-stone-700 mb-3 text-sm">{ACCOUNT_TYPE_LABELS[group.type]}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-body">
              <thead>
                <tr className="text-stone-400 text-xs border-b border-stone-100">
                  <th className="text-right py-2 font-normal">الرمز</th>
                  <th className="text-right py-2 font-normal">اسم الحساب</th>
                  <th className="text-right py-2 font-normal">النوع</th>
                  <th className="text-right py-2 font-normal">الرصيد الحالي</th>
                  <th className="text-right py-2 font-normal"></th>
                </tr>
              </thead>
              <tbody>
                {group.list.map(acc => {
                  const bal = accountBalance(acc, journalEntries).balance;
                  return (
                    <tr key={acc.id} className="border-b border-stone-50 hover:bg-stone-50">
                      <td className="py-2 text-stone-500">{acc.code}</td>
                      <td className="py-2 text-stone-700">{acc.name}</td>
                      <td className="py-2">{acc.system ? <Badge tone="blue">نظامي</Badge> : <Badge>مخصص</Badge>}</td>
                      <td className="py-2"><Figure value={bal} currency={currency} tone={bal >= 0 ? 'pos' : 'neg'} /></td>
                      <td className="py-2">
                        {!acc.system && (
                          <IconButton icon={Trash2} variant="danger" title="حذف" onClick={() => setConfirmDel(acc)} />
                        )}
                      </td>
                    </tr>
                  );
                })}
                {group.list.length === 0 && (
                  <tr><td colSpan={5} className="py-4 text-center text-stone-400 text-xs">لا توجد حسابات في هذا التصنيف</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ))}

      {showForm && (
        <AccountFormModal
          onClose={() => setShowForm(false)}
          onSave={(form) => { onAdd(form); setShowForm(false); }}
        />
      )}

      {confirmDel && (
        <ConfirmDialog
          title="حذف الحساب"
          message={usedAccountIds.has(confirmDel.id)
            ? `لا يمكن حذف حساب "${confirmDel.name}" لوجود قيود مرتبطة به.`
            : `هل تريد حذف حساب "${confirmDel.name}"؟`}
          onCancel={() => setConfirmDel(null)}
          onConfirm={() => {
            if (!usedAccountIds.has(confirmDel.id)) onDelete(confirmDel.id);
            setConfirmDel(null);
          }}
        />
      )}
    </div>
  );
}

/* ============================== CONTACTS (Customers/Suppliers) ============================== */

function ContactFormModal({ title, initial, onClose, onSave }) {
  const [form, setForm] = useState(initial || { name: '', phone: '', notes: '' });
  const canSave = form.name.trim();
  return (
    <Modal title={title} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Field label="الاسم" required>
          <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </Field>
        <Field label="رقم الهاتف" hint="أدخله مع رمز الدولة بدون + أو أصفار (مثال: 9665xxxxxxxx) لتفعيل تذكيرات واتساب">
          <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} dir="ltr" placeholder="9665xxxxxxxx" />
        </Field>
        <Field label="ملاحظات">
          <Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </Field>
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="secondary" onClick={onClose}>إلغاء</Button>
          <Button disabled={!canSave} onClick={() => onSave(form)} icon={Check}>حفظ</Button>
        </div>
      </div>
    </Modal>
  );
}

function PaymentFormModal({ contact, unpaidInvoices, accounts, currency, onClose, onSave }) {
  const treasuryAccounts = getTreasuryAccounts(accounts);
  const [invoiceId, setInvoiceId] = useState(unpaidInvoices[0]?.id || '');
  const invoice = unpaidInvoices.find(i => i.id === invoiceId);
  const remaining = invoice ? invoice.total - invoice.paidAmount : 0;
  const [amount, setAmount] = useState(remaining);
  const [method, setMethod] = useState(treasuryAccounts[0]?.id || '');
  const [date, setDate] = useState(todayISO());

  useEffect(() => { setAmount(remaining); }, [invoiceId]);

  const canSave = invoice && Number(amount) > 0 && Number(amount) <= remaining + 0.005 && method;

  return (
    <Modal title={`تسجيل دفعة - ${contact.name}`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        {unpaidInvoices.length === 0 ? (
          <p className="text-sm text-stone-400 font-body">لا توجد فواتير غير مسددة لهذا الطرف.</p>
        ) : (
          <>
            <Field label="الفاتورة" required>
              <Select value={invoiceId} onChange={e => setInvoiceId(e.target.value)}>
                {unpaidInvoices.map(inv => (
                  <option key={inv.id} value={inv.id}>
                    #{inv.no} - {fmtDate(inv.date)} - متبقي {fmtNum(inv.total - inv.paidAmount)} {currency}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="المبلغ" required hint={`الحد الأقصى: ${fmtNum(remaining)} ${currency}`}>
              <Input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} dir="ltr" />
            </Field>
            <Field label="استلمت في / دُفعت من" required>
              <Select value={method} onChange={e => setMethod(e.target.value)}>
                {treasuryAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>
            <Field label="التاريخ" required>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2 mt-2">
              <Button variant="secondary" onClick={onClose}>إلغاء</Button>
              <Button disabled={!canSave} onClick={() => onSave({ invoiceId, amount: Number(amount), method, date })} icon={Check}>
                تسجيل الدفعة
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function ContactsView({ type, contacts, invoices, currency, settings, accounts, onAdd, onUpdate, onDelete, onRecordPayment }) {
  const isCustomer = type === 'customer';
  const contactField = isCustomer ? 'customerId' : 'supplierId';
  const today = todayISO();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [payingFor, setPayingFor] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [search, setSearch] = useState('');

  const contactInvoices = (contactId) => invoices.filter(i => i[contactField] === contactId);
  const contactBalance = (contactId) => contactInvoices(contactId).reduce((s, i) => s + (i.total - i.paidAmount), 0);

  const filtered = contacts.filter(c => c.name.includes(search) || (c.phone || '').includes(search));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search size={15} className="absolute top-1/2 -translate-y-1/2 right-3 text-stone-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالاسم أو الهاتف" className="pr-9" />
        </div>
        <Button icon={Plus} onClick={() => { setEditing(null); setShowForm(true); }}>
          {isCustomer ? 'عميل جديد' : 'مورد جديد'}
        </Button>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-4">
          <EmptyState
            icon={isCustomer ? Users : Truck}
            title={isCustomer ? 'لا يوجد عملاء بعد' : 'لا يوجد موردون بعد'}
            hint="أضف أول جهة اتصال للبدء في إصدار الفواتير."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(c => {
            const bal = contactBalance(c.id);
            const unpaid = contactInvoices(c.id).filter(i => i.total - i.paidAmount > 0.005);
            const isOpen = expanded === c.id;
            const tierInfo = isCustomer ? computeCustomerTier(c, invoices, settings, today) : null;
            const riskInfo = isCustomer ? computeCustomerRisk(c, invoices, settings, today) : null;
            return (
              <Card key={c.id} className="overflow-hidden">
                <div className="p-4 flex items-center justify-between gap-3 cursor-pointer" onClick={() => setExpanded(isOpen ? null : c.id)}>
                  <div className="flex items-center gap-3 min-w-0">
                    {isOpen ? <ChevronDown size={16} className="text-stone-400 shrink-0" /> : <ChevronRight size={16} className="text-stone-400 shrink-0" />}
                    <div className="min-w-0">
                      <p className="font-body font-medium text-stone-800 truncate flex items-center gap-1.5">
                        {c.name}
                        {tierInfo && tierInfo.tier === 'vip' && <Badge tone="amber">⭐ VIP</Badge>}
                        {riskInfo && riskInfo.level !== 'excellent' && (
                          <Badge tone={riskInfo.level === 'poor' ? 'red' : 'amber'}>{RISK_LABELS[riskInfo.level]}</Badge>
                        )}
                      </p>
                      <p className="text-xs text-stone-400 font-body" dir="ltr">{c.phone}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Figure value={bal} currency={currency} tone={bal > 0 ? 'neg' : 'pos'} className="text-sm" />
                    <IconButton icon={Pencil} title="تعديل" onClick={(e) => { e.stopPropagation(); setEditing(c); setShowForm(true); }} />
                    <IconButton icon={Trash2} variant="danger" title="حذف" onClick={(e) => { e.stopPropagation(); setConfirmDel(c); }} />
                  </div>
                </div>
                {isOpen && (
                  <div className="border-t border-stone-100 p-4">
                    {unpaid.length === 0 ? (
                      <p className="text-sm text-stone-400 font-body">لا توجد فواتير غير مسددة.</p>
                    ) : (
                      <table className="w-full text-sm font-body">
                        <thead>
                          <tr className="text-stone-400 text-xs">
                            <th className="text-right py-1.5 font-normal">رقم</th>
                            <th className="text-right py-1.5 font-normal">التاريخ</th>
                            <th className="text-right py-1.5 font-normal">الإجمالي</th>
                            <th className="text-right py-1.5 font-normal">المتبقي</th>
                            <th className="text-right py-1.5 font-normal"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {unpaid.map(inv => (
                            <tr key={inv.id} className="border-t border-stone-50">
                              <td className="py-1.5 text-stone-500">#{inv.no}</td>
                              <td className="py-1.5 text-stone-500">{fmtDate(inv.date)}</td>
                              <td className="py-1.5"><Figure value={inv.total} currency={currency} /></td>
                              <td className="py-1.5"><Figure value={inv.total - inv.paidAmount} currency={currency} tone="neg" /></td>
                              <td className="py-1.5">
                                <Button size="sm" variant="outline" onClick={() => setPayingFor(c)}>تسجيل دفعة</Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {showForm && (
        <ContactFormModal
          title={editing ? 'تعديل بيانات' : (isCustomer ? 'عميل جديد' : 'مورد جديد')}
          initial={editing}
          onClose={() => setShowForm(false)}
          onSave={(form) => {
            if (editing) onUpdate({ ...editing, ...form }); else onAdd(form);
            setShowForm(false);
          }}
        />
      )}

      {confirmDel && (
        <ConfirmDialog
          title="حذف"
          message={contactInvoices(confirmDel.id).length > 0
            ? `لا يمكن حذف "${confirmDel.name}" لوجود فواتير مرتبطة به.`
            : `هل تريد حذف "${confirmDel.name}"؟`}
          onCancel={() => setConfirmDel(null)}
          onConfirm={() => {
            if (contactInvoices(confirmDel.id).length === 0) onDelete(confirmDel.id);
            setConfirmDel(null);
          }}
        />
      )}

      {payingFor && (
        <PaymentFormModal
          contact={payingFor}
          unpaidInvoices={contactInvoices(payingFor.id).filter(i => i.total - i.paidAmount > 0.005)}
          accounts={accounts}
          currency={currency}
          onClose={() => setPayingFor(null)}
          onSave={(data) => { onRecordPayment(payingFor, data); setPayingFor(null); }}
        />
      )}
    </div>
  );
}

/* ============================== PRODUCTS ============================== */

function ProductFormModal({ initial, products, onClose, onSave }) {
  const [form, setForm] = useState(initial || { name: '', sku: '', unit: UNITS[0], costPrice: '', salePrice: '', qty: '', minQty: 5 });
  const skuTrimmed = (form.sku || '').trim().toLowerCase();
  const duplicateSku = skuTrimmed && products.some(p => p.id !== (initial && initial.id) && (p.sku || '').trim().toLowerCase() === skuTrimmed);
  const canSave = form.name.trim() && form.salePrice !== '' && !duplicateSku;
  return (
    <Modal title={initial ? 'تعديل منتج' : 'منتج جديد'} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Field label="اسم المنتج" required>
          <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="رمز الصنف (SKU)" hint={duplicateSku ? undefined : 'يجب أن يكون فريدًا لكل منتج'}>
            <Input value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} dir="ltr" className={duplicateSku ? 'border-rose-400' : ''} />
            {duplicateSku && <p className="text-xs text-rose-600 mt-1 font-body">هذا الرمز مستخدم بالفعل لمنتج آخر، اختر رمزًا مختلفًا.</p>}
          </Field>
          <Field label="وحدة القياس">
            <Select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="سعر التكلفة">
            <Input type="number" min="0" step="0.01" dir="ltr" value={form.costPrice} onChange={e => setForm(f => ({ ...f, costPrice: e.target.value }))} />
          </Field>
          <Field label="سعر البيع" required>
            <Input type="number" min="0" step="0.01" dir="ltr" value={form.salePrice} onChange={e => setForm(f => ({ ...f, salePrice: e.target.value }))} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="الكمية الحالية">
            <Input type="number" min="0" step="1" dir="ltr" value={form.qty} onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} />
          </Field>
          <Field label="حد التنبيه للمخزون المنخفض">
            <Input type="number" min="0" step="1" dir="ltr" value={form.minQty} onChange={e => setForm(f => ({ ...f, minQty: e.target.value }))} />
          </Field>
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="secondary" onClick={onClose}>إلغاء</Button>
          <Button disabled={!canSave} onClick={() => onSave({
            ...form,
            costPrice: Number(form.costPrice) || 0,
            salePrice: Number(form.salePrice) || 0,
            qty: Number(form.qty) || 0,
            minQty: Number(form.minQty) || 0,
          })} icon={Check}>حفظ</Button>
        </div>
      </div>
    </Modal>
  );
}

function ProductsView({ products, currency, onAdd, onUpdate, onDelete, usedProductIds }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [search, setSearch] = useState('');

  const filtered = products.filter(p => p.name.includes(search) || (p.sku || '').includes(search));
  const totalValue = products.reduce((s, p) => s + Number(p.qty) * Number(p.costPrice), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search size={15} className="absolute top-1/2 -translate-y-1/2 right-3 text-stone-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالاسم أو الرمز" className="pr-9" />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-body text-stone-500">إجمالي قيمة المخزون: <Figure value={totalValue} currency={currency} className="text-stone-700 font-medium" /></span>
          <Button icon={Plus} onClick={() => { setEditing(null); setShowForm(true); }}>منتج جديد</Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-4">
          <EmptyState icon={Package} title="لا توجد منتجات بعد" hint="أضف منتجاتك لتتمكن من إصدار الفواتير وتتبع المخزون." />
        </Card>
      ) : (
        <Card className="p-4 overflow-x-auto">
          <table className="w-full text-sm font-body">
            <thead>
              <tr className="text-stone-400 text-xs border-b border-stone-100">
                <th className="text-right py-2 font-normal">الاسم</th>
                <th className="text-right py-2 font-normal">الرمز</th>
                <th className="text-right py-2 font-normal">الكمية</th>
                <th className="text-right py-2 font-normal">التكلفة</th>
                <th className="text-right py-2 font-normal">سعر البيع</th>
                <th className="text-right py-2 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} className="border-b border-stone-50 hover:bg-stone-50">
                  <td className="py-2 text-stone-700">{p.name}</td>
                  <td className="py-2 text-stone-500" dir="ltr">{p.sku}</td>
                  <td className="py-2">
                    <Badge tone={Number(p.qty) <= Number(p.minQty || 5) ? (Number(p.qty) === 0 ? 'red' : 'amber') : 'green'}>
                      {p.qty} {p.unit}
                    </Badge>
                  </td>
                  <td className="py-2"><Figure value={p.costPrice} currency={currency} /></td>
                  <td className="py-2"><Figure value={p.salePrice} currency={currency} /></td>
                  <td className="py-2 flex gap-1">
                    <IconButton icon={Pencil} title="تعديل" onClick={() => { setEditing(p); setShowForm(true); }} />
                    <IconButton icon={Trash2} variant="danger" title="حذف" onClick={() => setConfirmDel(p)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {showForm && (
        <ProductFormModal
          initial={editing}
          products={products}
          onClose={() => setShowForm(false)}
          onSave={(form) => { if (editing) onUpdate({ ...editing, ...form }); else onAdd(form); setShowForm(false); }}
        />
      )}

      {confirmDel && (
        <ConfirmDialog
          title="حذف منتج"
          message={usedProductIds.has(confirmDel.id)
            ? `لا يمكن حذف "${confirmDel.name}" لوجوده ضمن فواتير سابقة.`
            : `هل تريد حذف "${confirmDel.name}"؟`}
          onCancel={() => setConfirmDel(null)}
          onConfirm={() => { if (!usedProductIds.has(confirmDel.id)) onDelete(confirmDel.id); setConfirmDel(null); }}
        />
      )}
    </div>
  );
}

/* ============================== INVOICE LINE ITEMS EDITOR ============================== */

function emptyItem() {
  return { rowId: uid('row'), productId: '', name: '', qty: 1, price: '', cost: 0 };
}

function ItemsEditor({ items, setItems, products, currency, priceLabel }) {
  const updateItem = (rowId, patch) => {
    setItems(items.map(it => it.rowId === rowId ? { ...it, ...patch } : it));
  };
  const removeItem = (rowId) => setItems(items.filter(it => it.rowId !== rowId));
  const addItem = () => setItems([...items, emptyItem()]);

  const onProductChange = (rowId, productId) => {
    if (productId === '__free__') {
      updateItem(rowId, { productId: '', name: '', price: '', cost: 0 });
      return;
    }
    const p = products.find(pr => pr.id === productId);
    if (p) {
      updateItem(rowId, {
        productId,
        name: p.name,
        price: priceLabel === 'سعر الشراء' ? p.costPrice : p.salePrice,
        cost: p.costPrice,
      });
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-sm font-body" style={{ minWidth: 520 }}>
          <thead>
            <tr className="text-stone-400 text-xs">
              <th className="text-right py-1.5 font-normal px-1">الصنف</th>
              <th className="text-right py-1.5 font-normal px-1 w-20">الكمية</th>
              <th className="text-right py-1.5 font-normal px-1 w-28">{priceLabel}</th>
              <th className="text-right py-1.5 font-normal px-1 w-24">الإجمالي</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {items.map(it => {
              const product = products.find(p => p.id === it.productId);
              const lineTotal = (Number(it.qty) || 0) * (Number(it.price) || 0);
              const overStock = product && priceLabel !== 'سعر الشراء' && Number(it.qty) > Number(product.qty);
              return (
                <tr key={it.rowId} className="align-top">
                  <td className="py-1 px-1">
                    <Select value={it.productId || '__free__'} onChange={e => onProductChange(it.rowId, e.target.value)}>
                      <option value="__free__">بند حر / خدمة</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.qty} {p.unit} متاح)</option>)}
                    </Select>
                    {!it.productId && (
                      <Input className="mt-1" placeholder="اسم البند" value={it.name} onChange={e => updateItem(it.rowId, { name: e.target.value })} />
                    )}
                    {overStock && <p className="text-xs text-amber-600 mt-1">الكمية المطلوبة أكبر من المتاح ({product.qty})</p>}
                  </td>
                  <td className="py-1 px-1">
                    <Input type="number" min="0" step="1" dir="ltr" value={it.qty} onChange={e => updateItem(it.rowId, { qty: e.target.value })} />
                  </td>
                  <td className="py-1 px-1">
                    <Input type="number" min="0" step="0.01" dir="ltr" value={it.price} onChange={e => updateItem(it.rowId, { price: e.target.value })} />
                  </td>
                  <td className="py-1 px-1 pt-3"><Figure value={lineTotal} currency={currency} /></td>
                  <td className="py-1 px-1 pt-2">
                    <IconButton icon={Trash2} variant="danger" title="حذف البند" onClick={() => removeItem(it.rowId)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Button size="sm" variant="outline" icon={Plus} onClick={addItem} className="self-start">إضافة بند</Button>
    </div>
  );
}

function InvoiceTotalsBox({ totals, currency, discount, setDiscount, applyTax, setApplyTax, settings }) {
  const taxLabel = settings.taxType === 'fixed'
    ? `مبلغ ثابت ${fmtNum(settings.taxFixedAmount)} ${currency}`
    : `${settings.taxRate}%`;
  return (
    <div className="flex flex-col gap-2 bg-stone-50 rounded-lg p-3 mt-2">
      <div className="flex items-center justify-between text-sm font-body">
        <span className="text-stone-500">المجموع الفرعي</span>
        <Figure value={totals.subtotal} currency={currency} />
      </div>
      <div className="flex items-center justify-between text-sm font-body">
        <span className="text-stone-500">الخصم</span>
        <Input type="number" min="0" step="0.01" dir="ltr" value={discount} onChange={e => setDiscount(e.target.value)} className="w-28 py-1" />
      </div>
      <label className="flex items-center justify-between text-sm font-body cursor-pointer">
        <span className="text-stone-500 flex items-center gap-1.5">
          <input type="checkbox" checked={applyTax} onChange={e => setApplyTax(e.target.checked)} />
          الضريبة ({taxLabel})
        </span>
        <Figure value={totals.tax} currency={currency} />
      </label>
      <div className="flex items-center justify-between text-base font-body font-semibold border-t border-stone-200 pt-2">
        <span className="text-stone-700">الإجمالي</span>
        <Figure value={totals.total} currency={currency} className="text-emerald-700" />
      </div>
    </div>
  );
}

/* ============================== SALES INVOICES ============================== */

function SalesInvoiceFormModal({ customers, products, reps, salesInvoices, accounts, settings, onClose, onSave }) {
  const today = todayISO();
  const treasuryAccounts = getTreasuryAccounts(accounts);
  const [customerId, setCustomerId] = useState('');
  const [date, setDate] = useState(today);
  const [items, setItems] = useState([emptyItem()]);
  const [discount, setDiscount] = useState(0);
  const [discountTouched, setDiscountTouched] = useState(false);
  const [applyTax, setApplyTax] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState(treasuryAccounts[0]?.id || 'credit');
  const [repId, setRepId] = useState('');
  const [overrideBlock, setOverrideBlock] = useState(false);

  const customer = customers.find(c => c.id === customerId) || null;
  const { tier } = computeCustomerTier(customer, salesInvoices, settings, today);
  const risk = computeCustomerRisk(customer, salesInvoices, settings, today);
  const isVip = tier === 'vip';
  const creditBlocked = customer && risk.level === 'poor';

  const validItems = items.filter(it => (it.name || products.find(p => p.id === it.productId)) && Number(it.qty) > 0);
  const rawTotals = computeInvoiceTotals(validItems, 0, applyTax, settings);

  // Auto-apply the VIP discount (once, unless the user has manually edited the discount field)
  useEffect(() => {
    if (isVip && !discountTouched && settings.vipDiscountPercent > 0) {
      setDiscount(Number((rawTotals.subtotal * settings.vipDiscountPercent / 100).toFixed(2)));
    }
    if (!isVip && !discountTouched) {
      setDiscount(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVip, rawTotals.subtotal, settings.vipDiscountPercent]);

  const totals = computeInvoiceTotals(validItems, discount, applyTax, settings);
  const creditAllowed = paymentMethod !== 'credit' || (!creditBlocked || overrideBlock);
  const canSave = validItems.length > 0 && totals.total > 0 && (paymentMethod !== 'credit' || customerId) && creditAllowed;

  const rep = reps.find(r => r.id === repId) || null;
  const commissionPreview = rep ? totals.afterDiscount * (Number(rep.commissionPercent) || 0) / 100 : 0;

  return (
    <Modal title="فاتورة مبيعات جديدة" onClose={onClose} width="max-w-2xl">
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="العميل" hint={paymentMethod === 'credit' ? 'مطلوب للبيع الآجل' : 'اتركه فارغًا لعميل نقدي'}>
            <Select value={customerId} onChange={e => { setCustomerId(e.target.value); setOverrideBlock(false); }}>
              <option value="">عميل نقدي</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="التاريخ" required>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </Field>
        </div>

        {customer && (
          <div className="flex flex-wrap items-center gap-2">
            {isVip && <Badge tone="amber">⭐ عميل VIP - خصم {settings.vipDiscountPercent}% مُفعّل تلقائيًا</Badge>}
            <Badge tone={risk.level === 'excellent' ? 'green' : risk.level === 'fair' ? 'amber' : 'red'}>
              التصنيف الائتماني: {RISK_LABELS[risk.level]}
            </Badge>
          </div>
        )}

        <Field label="طريقة الدفع" required>
          <Select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
            {treasuryAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            <option value="credit">آجل (على حساب العميل)</option>
          </Select>
        </Field>

        {paymentMethod === 'credit' && creditBlocked && (
          <div className="flex flex-col gap-2 bg-rose-50 text-rose-700 rounded-md px-3 py-2.5 text-sm font-body">
            <span className="flex items-center gap-1.5"><AlertTriangle size={15} /> البيع الآجل محظور لهذا العميل ({risk.overdueCount} فاتورة متأخرة بقيمة {fmtNum(risk.overdueAmount)} {settings.currency})</span>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={overrideBlock} onChange={e => setOverrideBlock(e.target.checked)} />
              تجاوز الحظر والبيع له آجلاً على مسؤوليتي
            </label>
          </div>
        )}

        {reps.length > 0 && (
          <Field label="المندوب / مصدر البيع" hint="اختياري - لاحتساب العمولة">
            <Select value={repId} onChange={e => setRepId(e.target.value)}>
              <option value="">بدون مندوب</option>
              {reps.map(r => <option key={r.id} value={r.id}>{r.name} (عمولة {r.commissionPercent}%)</option>)}
            </Select>
            {rep && <p className="text-xs text-emerald-700 mt-1">عمولة تقديرية لهذه الفاتورة: {fmtNum(commissionPreview)} {settings.currency}</p>}
          </Field>
        )}

        <div>
          <p className="text-sm font-body text-stone-600 mb-1">بنود الفاتورة</p>
          <ItemsEditor items={items} setItems={setItems} products={products} currency={settings.currency} priceLabel="سعر البيع" />
        </div>

        <InvoiceTotalsBox totals={totals} currency={settings.currency} discount={discount} setDiscount={(v) => { setDiscount(v); setDiscountTouched(true); }} applyTax={applyTax} setApplyTax={setApplyTax} settings={settings} />

        <div className="flex justify-end gap-2 mt-1">
          <Button variant="secondary" onClick={onClose}>إلغاء</Button>
          <Button disabled={!canSave} icon={Check} onClick={() => onSave({
            customerId: customerId || null, date, items: validItems.map(it => ({
              productId: it.productId || null,
              name: it.name || (products.find(p => p.id === it.productId)?.name) || 'بند',
              qty: Number(it.qty), price: Number(it.price) || 0, cost: Number(it.cost) || 0,
            })), discount: Number(discount) || 0, applyTax, paymentMethod,
            dueDate: addDays(date, settings.defaultPaymentTermsDays),
            repId: repId || null, isVipSale: isVip,
          })}>حفظ الفاتورة</Button>
        </div>
      </div>
    </Modal>
  );
}

function InvoiceDetailModal({ invoice, contact, contactLabel, currency, accountLabel, onClose }) {
  return (
    <Modal title={`فاتورة رقم #${invoice.no}`} onClose={onClose} width="max-w-xl">
      <div className="print-area">
        <div className="flex justify-between text-sm font-body mb-4">
          <div>
            <p className="text-stone-400">{contactLabel}</p>
            <p className="text-stone-700 font-medium">{contact ? contact.name : 'نقدي'}</p>
          </div>
          <div className="text-left">
            <p className="text-stone-400">التاريخ</p>
            <p className="text-stone-700 font-medium">{fmtDate(invoice.date)}</p>
          </div>
        </div>
        <table className="w-full text-sm font-body mb-3">
          <thead>
            <tr className="text-stone-400 text-xs border-b border-stone-100">
              <th className="text-right py-1.5 font-normal">الصنف</th>
              <th className="text-right py-1.5 font-normal">الكمية</th>
              <th className="text-right py-1.5 font-normal">السعر</th>
              <th className="text-right py-1.5 font-normal">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((it, i) => (
              <tr key={i} className="border-b border-stone-50">
                <td className="py-1.5">{it.name}</td>
                <td className="py-1.5"><Figure value={it.qty} /></td>
                <td className="py-1.5"><Figure value={it.price} currency={currency} /></td>
                <td className="py-1.5"><Figure value={it.qty * it.price} currency={currency} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-col gap-1 items-end text-sm font-body">
          <p>المجموع الفرعي: <Figure value={invoice.subtotal} currency={currency} /></p>
          {invoice.discount > 0 && <p>الخصم: <Figure value={invoice.discount} currency={currency} /></p>}
          {invoice.tax > 0 && <p>الضريبة: <Figure value={invoice.tax} currency={currency} /></p>}
          <p className="font-semibold text-base">الإجمالي: <Figure value={invoice.total} currency={currency} /></p>
          <p className="text-stone-500">المدفوع: <Figure value={invoice.paidAmount} currency={currency} /></p>
          <p className="text-stone-500">المتبقي: <Figure value={invoice.total - invoice.paidAmount} currency={currency} /></p>
          {invoice.dueDate && invoice.total - invoice.paidAmount > 0.005 && (
            <p className="text-stone-500">تاريخ الاستحقاق: {fmtDate(invoice.dueDate)}</p>
          )}
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-4 no-print">
        <Button variant="secondary" onClick={onClose}>إغلاق</Button>
        <Button icon={Printer} onClick={() => window.print()}>طباعة</Button>
      </div>
    </Modal>
  );
}

function SalesInvoicesView({ invoices, customers, products, reps, accounts, settings, onAdd }) {
  const [showForm, setShowForm] = useState(false);
  const [viewing, setViewing] = useState(null);
  const sorted = [...invoices].sort((a, b) => (a.date < b.date ? 1 : -1));
  const today = todayISO();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button icon={Plus} onClick={() => setShowForm(true)}>فاتورة مبيعات جديدة</Button>
      </div>
      {sorted.length === 0 ? (
        <Card className="p-4">
          <EmptyState icon={ShoppingCart} title="لا توجد فواتير مبيعات بعد" hint="أنشئ أول فاتورة لتوليد القيد المحاسبي تلقائيًا." />
        </Card>
      ) : (
        <Card className="overflow-x-auto p-4">
          <table className="w-full text-sm font-body">
            <thead>
              <tr className="text-stone-400 text-xs border-b border-stone-100">
                <th className="text-right py-2 font-normal">رقم</th>
                <th className="text-right py-2 font-normal">التاريخ</th>
                <th className="text-right py-2 font-normal">العميل</th>
                <th className="text-right py-2 font-normal">طريقة الدفع</th>
                <th className="text-right py-2 font-normal">الإجمالي</th>
                <th className="text-right py-2 font-normal">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(inv => {
                const cust = customers.find(c => c.id === inv.customerId);
                const remaining = inv.total - inv.paidAmount;
                const overdue = remaining > 0.005 && inv.dueDate && inv.dueDate < today;
                return (
                  <tr key={inv.id} className="border-b border-stone-50 hover:bg-stone-50 cursor-pointer" onClick={() => setViewing(inv)}>
                    <td className="py-2 text-stone-600">#{inv.no}</td>
                    <td className="py-2 text-stone-600">{fmtDate(inv.date)}</td>
                    <td className="py-2 text-stone-700">
                      {cust ? cust.name : 'عميل نقدي'}
                      {inv.isVipSale && <span className="text-amber-500"> ⭐</span>}
                    </td>
                    <td className="py-2"><Badge>{paymentMethodLabel(inv.paymentMethod, accounts)}</Badge></td>
                    <td className="py-2"><Figure value={inv.total} currency={settings.currency} /></td>
                    <td className="py-2">
                      {remaining <= 0.005
                        ? <Badge tone="green">مدفوعة</Badge>
                        : overdue
                          ? <Badge tone="red">متأخرة ({fmtNum(remaining)})</Badge>
                          : <Badge tone="amber">متبقي {fmtNum(remaining)}</Badge>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {showForm && (
        <SalesInvoiceFormModal
          customers={customers} products={products} reps={reps} salesInvoices={invoices} accounts={accounts} settings={settings}
          onClose={() => setShowForm(false)}
          onSave={(data) => { onAdd(data); setShowForm(false); }}
        />
      )}

      {viewing && (
        <InvoiceDetailModal
          invoice={viewing}
          contact={customers.find(c => c.id === viewing.customerId)}
          contactLabel="العميل"
          currency={settings.currency}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

/* ============================== PURCHASE INVOICES ============================== */

function emptyPurchaseBlock(suppliers) {
  return { rowId: uid('pb'), supplierId: suppliers[0]?.id || '', items: [emptyItem()], discount: 0, applyTax: true, paymentMethod: '' };
}

function PurchaseBlock({ block, index, suppliers, products, accounts, settings, onChange, onRemove, showRemove }) {
  const treasuryAccounts = getTreasuryAccounts(accounts);
  const paymentMethod = block.paymentMethod || treasuryAccounts[0]?.id || 'credit';
  const validItems = block.items.filter(it => (it.name || products.find(p => p.id === it.productId)) && Number(it.qty) > 0);
  const totals = computeInvoiceTotals(validItems, block.discount, block.applyTax, settings);

  return (
    <div className="border border-stone-200 rounded-lg p-3.5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-body font-semibold text-stone-600">مورد #{index + 1}</p>
        {showRemove && <IconButton icon={Trash2} variant="danger" title="حذف هذا المورد من الفاتورة" onClick={onRemove} />}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="المورد" required>
          <Select value={block.supplierId} onChange={e => onChange({ ...block, supplierId: e.target.value })}>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="طريقة الدفع" required>
          <Select value={paymentMethod} onChange={e => onChange({ ...block, paymentMethod: e.target.value })}>
            {treasuryAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            <option value="credit">آجل (على حساب المورد)</option>
          </Select>
        </Field>
      </div>
      <div>
        <p className="text-sm font-body text-stone-600 mb-1">بنود هذا المورد</p>
        <ItemsEditor items={block.items} setItems={(items) => onChange({ ...block, items })} products={products} currency={settings.currency} priceLabel="سعر الشراء" />
      </div>
      <InvoiceTotalsBox
        totals={totals} currency={settings.currency} discount={block.discount}
        setDiscount={(v) => onChange({ ...block, discount: v })}
        applyTax={block.applyTax} setApplyTax={(v) => onChange({ ...block, applyTax: v })}
        settings={settings}
      />
    </div>
  );
}

function PurchaseInvoiceFormModal({ suppliers, products, accounts, settings, onClose, onSave }) {
  const [date, setDate] = useState(todayISO());
  const [blocks, setBlocks] = useState([emptyPurchaseBlock(suppliers)]);

  const updateBlock = (rowId, next) => setBlocks(blocks.map(b => b.rowId === rowId ? next : b));
  const removeBlock = (rowId) => setBlocks(blocks.filter(b => b.rowId !== rowId));
  const addBlock = () => setBlocks([...blocks, emptyPurchaseBlock(suppliers)]);

  const treasuryAccounts = getTreasuryAccounts(accounts);
  const preparedInvoices = blocks.map(b => {
    const validItems = b.items.filter(it => (it.name || products.find(p => p.id === it.productId)) && Number(it.qty) > 0);
    const totals = computeInvoiceTotals(validItems, b.discount, b.applyTax, settings);
    return { block: b, validItems, totals };
  }).filter(p => p.block.supplierId && p.validItems.length > 0 && p.totals.total > 0);

  const grandTotal = preparedInvoices.reduce((s, p) => s + p.totals.total, 0);
  const canSave = preparedInvoices.length > 0;

  return (
    <Modal title="فاتورة مشتريات جديدة" onClose={onClose} width="max-w-2xl">
      <div className="flex flex-col gap-3">
        {suppliers.length === 0 ? (
          <p className="text-sm font-body text-rose-600">أضف موردًا واحدًا على الأقل قبل تسجيل فاتورة مشتريات.</p>
        ) : (
          <>
            <Field label="التاريخ (لكل الموردين في هذه الفاتورة)" required>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </Field>

            <p className="text-xs text-stone-400 font-body -mt-1">يمكنك إضافة أكثر من مورد في نفس الفاتورة - كل مورد وأصنافه في قسم منفصل، وسيتم إنشاء فاتورة مستقلة تلقائيًا لكل مورد عند الحفظ.</p>

            {blocks.map((b, i) => (
              <PurchaseBlock
                key={b.rowId} block={b} index={i} suppliers={suppliers} products={products} accounts={accounts} settings={settings}
                onChange={(next) => updateBlock(b.rowId, next)}
                onRemove={() => removeBlock(b.rowId)}
                showRemove={blocks.length > 1}
              />
            ))}

            <Button size="sm" variant="outline" icon={Plus} onClick={addBlock} className="self-start">إضافة مورد آخر لنفس الفاتورة</Button>

            {preparedInvoices.length > 1 && (
              <div className="flex items-center justify-between bg-emerald-50 text-emerald-700 rounded-md px-3 py-2 text-sm font-body font-medium">
                <span>الإجمالي الكلي ({preparedInvoices.length} موردين)</span>
                <Figure value={grandTotal} currency={settings.currency} />
              </div>
            )}

            <div className="flex justify-end gap-2 mt-1">
              <Button variant="secondary" onClick={onClose}>إلغاء</Button>
              <Button disabled={!canSave} icon={Check} onClick={() => onSave(preparedInvoices.map(p => ({
                supplierId: p.block.supplierId, date,
                items: p.validItems.map(it => ({
                  productId: it.productId || null,
                  name: it.name || (products.find(pr => pr.id === it.productId)?.name) || 'بند',
                  qty: Number(it.qty), price: Number(it.price) || 0,
                })),
                discount: Number(p.block.discount) || 0, applyTax: p.block.applyTax,
                paymentMethod: p.block.paymentMethod || treasuryAccounts[0]?.id || 'credit',
              })))}>
                {preparedInvoices.length > 1 ? `حفظ ${preparedInvoices.length} فواتير` : 'حفظ الفاتورة'}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function PurchaseInvoicesView({ invoices, suppliers, products, accounts, settings, onAdd }) {
  const [showForm, setShowForm] = useState(false);
  const [viewing, setViewing] = useState(null);
  const sorted = [...invoices].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button icon={Plus} onClick={() => setShowForm(true)}>فاتورة مشتريات جديدة</Button>
      </div>
      {sorted.length === 0 ? (
        <Card className="p-4">
          <EmptyState icon={FileText} title="لا توجد فواتير مشتريات بعد" hint="سجل مشترياتك من الموردين لتحديث المخزون تلقائيًا." />
        </Card>
      ) : (
        <Card className="overflow-x-auto p-4">
          <table className="w-full text-sm font-body">
            <thead>
              <tr className="text-stone-400 text-xs border-b border-stone-100">
                <th className="text-right py-2 font-normal">رقم</th>
                <th className="text-right py-2 font-normal">التاريخ</th>
                <th className="text-right py-2 font-normal">المورد</th>
                <th className="text-right py-2 font-normal">طريقة الدفع</th>
                <th className="text-right py-2 font-normal">الإجمالي</th>
                <th className="text-right py-2 font-normal">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(inv => {
                const sup = suppliers.find(s => s.id === inv.supplierId);
                const remaining = inv.total - inv.paidAmount;
                return (
                  <tr key={inv.id} className="border-b border-stone-50 hover:bg-stone-50 cursor-pointer" onClick={() => setViewing(inv)}>
                    <td className="py-2 text-stone-600">#{inv.no}</td>
                    <td className="py-2 text-stone-600">{fmtDate(inv.date)}</td>
                    <td className="py-2 text-stone-700">{sup ? sup.name : '-'}</td>
                    <td className="py-2"><Badge>{paymentMethodLabel(inv.paymentMethod, accounts)}</Badge></td>
                    <td className="py-2"><Figure value={inv.total} currency={settings.currency} /></td>
                    <td className="py-2">{remaining <= 0.005 ? <Badge tone="green">مسددة</Badge> : <Badge tone="amber">متبقي {fmtNum(remaining)}</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {showForm && (
        <PurchaseInvoiceFormModal
          suppliers={suppliers} products={products} accounts={accounts} settings={settings}
          onClose={() => setShowForm(false)}
          onSave={(dataArray) => { onAdd(dataArray); setShowForm(false); }}
        />
      )}

      {viewing && (
        <InvoiceDetailModal
          invoice={viewing}
          contact={suppliers.find(s => s.id === viewing.supplierId)}
          contactLabel="المورد"
          currency={settings.currency}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

/* ============================== EXPENSES ============================== */

function ExpenseFormModal({ expenseAccounts, accounts, onClose, onSave }) {
  const treasuryAccounts = getTreasuryAccounts(accounts);
  const [form, setForm] = useState({
    date: todayISO(), accountId: expenseAccounts[0]?.id || '', amount: '', description: '', paymentMethod: treasuryAccounts[0]?.id || '',
  });
  const canSave = form.accountId && Number(form.amount) > 0 && form.paymentMethod;
  return (
    <Modal title="مصروف جديد" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Field label="التاريخ" required>
          <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
        </Field>
        <Field label="بند المصروف" required>
          <Select value={form.accountId} onChange={e => setForm(f => ({ ...f, accountId: e.target.value }))}>
            {expenseAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        <Field label="المبلغ" required>
          <Input type="number" min="0" step="0.01" dir="ltr" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
        </Field>
        <Field label="دُفع من" required>
          <Select value={form.paymentMethod} onChange={e => setForm(f => ({ ...f, paymentMethod: e.target.value }))}>
            {treasuryAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        <Field label="وصف">
          <Textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
        </Field>
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="secondary" onClick={onClose}>إلغاء</Button>
          <Button disabled={!canSave} icon={Check} onClick={() => onSave({ ...form, amount: Number(form.amount) })}>حفظ المصروف</Button>
        </div>
      </div>
    </Modal>
  );
}

function ExpensesView({ expenses, accounts, settings, onAdd }) {
  const [showForm, setShowForm] = useState(false);
  const expenseAccounts = accounts.filter(a => a.type === 'expense' && a.kind !== 'cogs');
  const sorted = [...expenses].sort((a, b) => (a.date < b.date ? 1 : -1));
  const total = expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-body text-stone-500">إجمالي المصاريف المسجلة: <Figure value={total} currency={settings.currency} className="text-stone-700 font-medium" /></span>
        <Button icon={Plus} onClick={() => setShowForm(true)}>مصروف جديد</Button>
      </div>
      {sorted.length === 0 ? (
        <Card className="p-4">
          <EmptyState icon={Wallet} title="لا توجد مصاريف مسجلة" hint="سجل مصاريفك اليومية مثل الإيجار والرواتب والفواتير." />
        </Card>
      ) : (
        <Card className="overflow-x-auto p-4">
          <table className="w-full text-sm font-body">
            <thead>
              <tr className="text-stone-400 text-xs border-b border-stone-100">
                <th className="text-right py-2 font-normal">التاريخ</th>
                <th className="text-right py-2 font-normal">البند</th>
                <th className="text-right py-2 font-normal">الوصف</th>
                <th className="text-right py-2 font-normal">طريقة الدفع</th>
                <th className="text-right py-2 font-normal">المبلغ</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(e => {
                const acc = accounts.find(a => a.id === e.accountId);
                return (
                  <tr key={e.id} className="border-b border-stone-50">
                    <td className="py-2 text-stone-600">{fmtDate(e.date)}</td>
                    <td className="py-2 text-stone-700">{acc ? acc.name : '-'}</td>
                    <td className="py-2 text-stone-500">{e.description || '-'}</td>
                    <td className="py-2"><Badge>{paymentMethodLabel(e.paymentMethod, accounts)}</Badge></td>
                    <td className="py-2"><Figure value={e.amount} currency={settings.currency} tone="neg" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {showForm && (
        <ExpenseFormModal
          expenseAccounts={expenseAccounts}
          accounts={accounts}
          onClose={() => setShowForm(false)}
          onSave={(data) => { onAdd(data); setShowForm(false); }}
        />
      )}
    </div>
  );
}

/* ============================== JOURNAL ============================== */

function ManualJournalFormModal({ accounts, onClose, onSave }) {
  const [date, setDate] = useState(todayISO());
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState([
    { rowId: uid('l'), accountId: accounts[0]?.id || '', debit: '', credit: '' },
    { rowId: uid('l'), accountId: accounts[0]?.id || '', debit: '', credit: '' },
  ]);

  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.005 && totalDebit > 0;

  const updateLine = (rowId, patch) => setLines(lines.map(l => l.rowId === rowId ? { ...l, ...patch } : l));
  const addLine = () => setLines([...lines, { rowId: uid('l'), accountId: accounts[0]?.id || '', debit: '', credit: '' }]);
  const removeLine = (rowId) => setLines(lines.filter(l => l.rowId !== rowId));

  return (
    <Modal title="قيد يومية يدوي" onClose={onClose} width="max-w-2xl">
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="التاريخ" required>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </Field>
          <Field label="البيان" required>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="وصف القيد" />
          </Field>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm font-body" style={{ minWidth: 480 }}>
            <thead>
              <tr className="text-stone-400 text-xs">
                <th className="text-right py-1.5 font-normal">الحساب</th>
                <th className="text-right py-1.5 font-normal w-28">مدين</th>
                <th className="text-right py-1.5 font-normal w-28">دائن</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map(l => (
                <tr key={l.rowId}>
                  <td className="py-1 px-1">
                    <Select value={l.accountId} onChange={e => updateLine(l.rowId, { accountId: e.target.value })}>
                      {accounts.map(a => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                    </Select>
                  </td>
                  <td className="py-1 px-1">
                    <Input type="number" min="0" step="0.01" dir="ltr" value={l.debit} onChange={e => updateLine(l.rowId, { debit: e.target.value, credit: e.target.value ? '' : l.credit })} />
                  </td>
                  <td className="py-1 px-1">
                    <Input type="number" min="0" step="0.01" dir="ltr" value={l.credit} onChange={e => updateLine(l.rowId, { credit: e.target.value, debit: e.target.value ? '' : l.debit })} />
                  </td>
                  <td className="py-1 px-1">
                    {lines.length > 2 && <IconButton icon={Trash2} variant="danger" onClick={() => removeLine(l.rowId)} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button size="sm" variant="outline" icon={Plus} onClick={addLine} className="self-start">إضافة سطر</Button>

        <div className={classNames('flex items-center justify-between text-sm font-body rounded-md px-3 py-2', balanced ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600')}>
          <span>إجمالي مدين: {fmtNum(totalDebit)} | إجمالي دائن: {fmtNum(totalCredit)}</span>
          {balanced ? <span className="flex items-center gap-1"><CheckCircle2 size={15} /> متوازن</span> : <span className="flex items-center gap-1"><AlertTriangle size={15} /> غير متوازن</span>}
        </div>

        <div className="flex justify-end gap-2 mt-1">
          <Button variant="secondary" onClick={onClose}>إلغاء</Button>
          <Button disabled={!balanced || !description.trim()} icon={Check} onClick={() => onSave({
            date, description, lines: lines.map(l => ({ accountId: l.accountId, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 })),
          })}>حفظ القيد</Button>
        </div>
      </div>
    </Modal>
  );
}

const SOURCE_LABELS = {
  sales: 'فاتورة مبيعات', purchase: 'فاتورة مشتريات', expense: 'مصروف',
  payment_in: 'دفعة من عميل', payment_out: 'دفعة لمورد', manual: 'قيد يدوي',
};

function JournalView({ journalEntries, accounts, currency, onAddManual }) {
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const sorted = [...journalEntries].sort((a, b) => (a.date < b.date ? 1 : -1) || (a.no < b.no ? 1 : -1));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button icon={Plus} onClick={() => setShowForm(true)}>قيد يدوي جديد</Button>
      </div>
      {sorted.length === 0 ? (
        <Card className="p-4">
          <EmptyState icon={ClipboardList} title="لا توجد قيود بعد" hint="ستظهر هنا القيود المولّدة تلقائيًا من الفواتير، ويمكنك أيضًا إضافة قيود يدوية." />
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map(je => {
            const isOpen = expanded === je.id;
            const totalDebit = je.lines.reduce((s, l) => s + l.debit, 0);
            return (
              <Card key={je.id} className="overflow-hidden">
                <div className="p-3.5 flex items-center justify-between gap-3 cursor-pointer" onClick={() => setExpanded(isOpen ? null : je.id)}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    {isOpen ? <ChevronDown size={15} className="text-stone-400 shrink-0" /> : <ChevronRight size={15} className="text-stone-400 shrink-0" />}
                    <span className="text-sm font-body text-stone-500 shrink-0">#{je.no}</span>
                    <span className="text-sm font-body text-stone-700 truncate">{je.description}</span>
                    <Badge>{SOURCE_LABELS[je.sourceType] || je.sourceType}</Badge>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-sm font-body">
                    <span className="text-stone-400 hidden sm:inline">{fmtDate(je.date)}</span>
                    <Figure value={totalDebit} currency={currency} />
                  </div>
                </div>
                {isOpen && (
                  <div className="border-t border-stone-100 p-3.5">
                    <table className="w-full text-sm font-body">
                      <thead>
                        <tr className="text-stone-400 text-xs">
                          <th className="text-right py-1 font-normal">الحساب</th>
                          <th className="text-right py-1 font-normal">مدين</th>
                          <th className="text-right py-1 font-normal">دائن</th>
                        </tr>
                      </thead>
                      <tbody>
                        {je.lines.map((l, i) => {
                          const acc = accounts.find(a => a.id === l.accountId);
                          return (
                            <tr key={i} className="border-t border-stone-50">
                              <td className="py-1 text-stone-600">{acc ? `${acc.code} - ${acc.name}` : '-'}</td>
                              <td className="py-1">{l.debit > 0 ? <Figure value={l.debit} currency={currency} /> : '-'}</td>
                              <td className="py-1">{l.credit > 0 ? <Figure value={l.credit} currency={currency} /> : '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {showForm && (
        <ManualJournalFormModal
          accounts={accounts}
          onClose={() => setShowForm(false)}
          onSave={(data) => { onAddManual(data); setShowForm(false); }}
        />
      )}
    </div>
  );
}

/* ============================== DISTRIBUTORS / REPS & COMMISSIONS ============================== */

function RepFormModal({ initial, onClose, onSave }) {
  const [form, setForm] = useState(initial || { name: '', phone: '', commissionPercent: 2 });
  const canSave = form.name.trim() && form.commissionPercent !== '';
  return (
    <Modal title={initial ? 'تعديل مندوب' : 'مندوب جديد'} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Field label="اسم المندوب" required>
          <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </Field>
        <Field label="رقم الهاتف">
          <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} dir="ltr" placeholder="9665xxxxxxxx" />
        </Field>
        <Field label="نسبة العمولة (%)" required hint="من صافي كل فاتورة (بعد الخصم، قبل الضريبة) يتم بيعها بواسطته">
          <Input type="number" min="0" step="0.1" dir="ltr" value={form.commissionPercent} onChange={e => setForm(f => ({ ...f, commissionPercent: e.target.value }))} />
        </Field>
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="secondary" onClick={onClose}>إلغاء</Button>
          <Button disabled={!canSave} icon={Check} onClick={() => onSave({ ...form, commissionPercent: Number(form.commissionPercent) })}>حفظ</Button>
        </div>
      </div>
    </Modal>
  );
}

function RepsView({ reps, salesInvoices, currency, onAdd, onUpdate, onDelete }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${pad(now.getMonth() + 1, 2)}-01`;

  const repInvoices = (repId) => salesInvoices.filter(inv => inv.repId === repId);
  const repMonthStats = (repId) => {
    const list = repInvoices(repId).filter(inv => inv.date >= monthStart);
    return {
      count: list.length,
      sales: list.reduce((s, inv) => s + inv.total, 0),
      commission: list.reduce((s, inv) => s + (inv.commissionAmount || 0), 0),
    };
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-body text-stone-500">لوحة المندوبين تربط كل عملية بيع بعمولة فورية - أساس نظام "الأداء مقابل الدخل".</p>
        <Button icon={Plus} onClick={() => { setEditing(null); setShowForm(true); }}>مندوب جديد</Button>
      </div>

      {reps.length === 0 ? (
        <Card className="p-4">
          <EmptyState icon={Users} title="لا يوجد مندوبون بعد" hint="أضف مندوبي المبيعات لتفعيل احتساب العمولة التلقائي على كل فاتورة." />
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {reps.map(rep => {
            const stats = repMonthStats(rep.id);
            const isOpen = expanded === rep.id;
            return (
              <Card key={rep.id} className="overflow-hidden">
                <div className="p-4 flex items-center justify-between gap-3 cursor-pointer" onClick={() => setExpanded(isOpen ? null : rep.id)}>
                  <div className="flex items-center gap-3 min-w-0">
                    {isOpen ? <ChevronDown size={16} className="text-stone-400 shrink-0" /> : <ChevronRight size={16} className="text-stone-400 shrink-0" />}
                    <div className="min-w-0">
                      <p className="font-body font-medium text-stone-800">{rep.name}</p>
                      <p className="text-xs text-stone-400 font-body">عمولة {rep.commissionPercent}% لكل فاتورة</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-left">
                      <p className="text-xs text-stone-400 font-body">عمولة هذا الشهر</p>
                      <Figure value={stats.commission} currency={currency} className="text-emerald-700 font-semibold" />
                    </div>
                    <IconButton icon={Pencil} title="تعديل" onClick={(e) => { e.stopPropagation(); setEditing(rep); setShowForm(true); }} />
                    <IconButton icon={Trash2} variant="danger" title="حذف" onClick={(e) => { e.stopPropagation(); setConfirmDel(rep); }} />
                  </div>
                </div>
                {isOpen && (
                  <div className="border-t border-stone-100 p-4">
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div><p className="text-xs text-stone-400 font-body">عدد الفواتير</p><p className="font-body font-medium">{stats.count}</p></div>
                      <div><p className="text-xs text-stone-400 font-body">إجمالي المبيعات</p><Figure value={stats.sales} currency={currency} /></div>
                      <div><p className="text-xs text-stone-400 font-body">العمولة المستحقة</p><Figure value={stats.commission} currency={currency} tone="pos" /></div>
                    </div>
                    {repInvoices(rep.id).length === 0 ? (
                      <p className="text-sm text-stone-400 font-body">لا توجد فواتير لهذا المندوب بعد.</p>
                    ) : (
                      <table className="w-full text-sm font-body">
                        <thead>
                          <tr className="text-stone-400 text-xs">
                            <th className="text-right py-1.5 font-normal">رقم</th>
                            <th className="text-right py-1.5 font-normal">التاريخ</th>
                            <th className="text-right py-1.5 font-normal">قيمة الفاتورة</th>
                            <th className="text-right py-1.5 font-normal">العمولة</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...repInvoices(rep.id)].sort((a, b) => a.date < b.date ? 1 : -1).slice(0, 20).map(inv => (
                            <tr key={inv.id} className="border-t border-stone-50">
                              <td className="py-1.5 text-stone-500">#{inv.no}</td>
                              <td className="py-1.5 text-stone-500">{fmtDate(inv.date)}</td>
                              <td className="py-1.5"><Figure value={inv.total} currency={currency} /></td>
                              <td className="py-1.5"><Figure value={inv.commissionAmount || 0} currency={currency} tone="pos" /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {showForm && (
        <RepFormModal
          initial={editing}
          onClose={() => setShowForm(false)}
          onSave={(form) => { if (editing) onUpdate({ ...editing, ...form }); else onAdd(form); setShowForm(false); }}
        />
      )}

      {confirmDel && (
        <ConfirmDialog
          title="حذف مندوب"
          message={`هل تريد حذف "${confirmDel.name}"؟ الفواتير السابقة المرتبطة به تبقى محفوظة في السجل.`}
          onCancel={() => setConfirmDel(null)}
          onConfirm={() => { onDelete(confirmDel.id); setConfirmDel(null); }}
        />
      )}
    </div>
  );
}

/* ============================== WORKERS / EMPLOYEES ============================== */

function WorkerFormModal({ initial, onClose, onSave }) {
  const [form, setForm] = useState(initial || { name: '', phone: '', dailyWage: '', maxDailyWithdrawal: '', notes: '' });
  const canSave = form.name.trim();
  return (
    <Modal title={initial ? 'تعديل بيانات عامل' : 'عامل / موظف جديد'} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Field label="الاسم" required>
          <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </Field>
        <Field label="رقم الهاتف">
          <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} dir="ltr" placeholder="9665xxxxxxxx" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="الأجر اليومي">
            <Input type="number" min="0" step="0.01" dir="ltr" value={form.dailyWage} onChange={e => setForm(f => ({ ...f, dailyWage: e.target.value }))} />
          </Field>
          <Field label="الحد الأعلى للسحب اليومي">
            <Input type="number" min="0" step="0.01" dir="ltr" value={form.maxDailyWithdrawal} onChange={e => setForm(f => ({ ...f, maxDailyWithdrawal: e.target.value }))} />
          </Field>
        </div>
        <Field label="ملاحظات">
          <Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </Field>
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="secondary" onClick={onClose}>إلغاء</Button>
          <Button disabled={!canSave} icon={Check} onClick={() => onSave({
            ...form, dailyWage: Number(form.dailyWage) || 0, maxDailyWithdrawal: Number(form.maxDailyWithdrawal) || 0,
          })}>حفظ</Button>
        </div>
      </div>
    </Modal>
  );
}

function WorkersView({ workers, currency, onAdd, onUpdate, onDelete }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [search, setSearch] = useState('');

  const filtered = workers.filter(w => w.name.includes(search) || (w.phone || '').includes(search));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search size={15} className="absolute top-1/2 -translate-y-1/2 right-3 text-stone-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالاسم أو الهاتف" className="pr-9" />
        </div>
        <Button icon={Plus} onClick={() => { setEditing(null); setShowForm(true); }}>عامل / موظف جديد</Button>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-4">
          <EmptyState icon={UserCog} title="لا يوجد عمال أو موظفون بعد" hint="أضف بيانات العمال والموظفين لتتبع أجورهم وحدود السحب اليومي." />
        </Card>
      ) : (
        <Card className="overflow-x-auto p-4">
          <table className="w-full text-sm font-body">
            <thead>
              <tr className="text-stone-400 text-xs border-b border-stone-100">
                <th className="text-right py-2 font-normal">الاسم</th>
                <th className="text-right py-2 font-normal">الهاتف</th>
                <th className="text-right py-2 font-normal">الأجر اليومي</th>
                <th className="text-right py-2 font-normal">حد السحب اليومي</th>
                <th className="text-right py-2 font-normal">ملاحظات</th>
                <th className="text-right py-2 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(w => (
                <tr key={w.id} className="border-b border-stone-50 hover:bg-stone-50">
                  <td className="py-2 text-stone-700">{w.name}</td>
                  <td className="py-2 text-stone-500" dir="ltr">{w.phone}</td>
                  <td className="py-2"><Figure value={w.dailyWage} currency={currency} /></td>
                  <td className="py-2"><Figure value={w.maxDailyWithdrawal} currency={currency} /></td>
                  <td className="py-2 text-stone-500 truncate" style={{ maxWidth: 200 }}>{w.notes || '-'}</td>
                  <td className="py-2 flex gap-1">
                    <IconButton icon={Pencil} title="تعديل" onClick={() => { setEditing(w); setShowForm(true); }} />
                    <IconButton icon={Trash2} variant="danger" title="حذف" onClick={() => setConfirmDel(w)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {showForm && (
        <WorkerFormModal
          initial={editing}
          onClose={() => setShowForm(false)}
          onSave={(form) => { if (editing) onUpdate({ ...editing, ...form }); else onAdd(form); setShowForm(false); }}
        />
      )}

      {confirmDel && (
        <ConfirmDialog
          title="حذف"
          message={`هل تريد حذف "${confirmDel.name}"؟`}
          onCancel={() => setConfirmDel(null)}
          onConfirm={() => { onDelete(confirmDel.id); setConfirmDel(null); }}
        />
      )}
    </div>
  );
}

/* ============================== RECURRING INVOICES ============================== */

function RecurringFormModal({ customers, products, reps, accounts, settings, onClose, onSave }) {
  const treasuryAccounts = getTreasuryAccounts(accounts);
  const [name, setName] = useState('');
  const [customerId, setCustomerId] = useState(customers[0]?.id || '');
  const [items, setItems] = useState([emptyItem()]);
  const [discount, setDiscount] = useState(0);
  const [applyTax, setApplyTax] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState('credit');
  const [frequency, setFrequency] = useState('monthly');
  const [startDate, setStartDate] = useState(todayISO());
  const [repId, setRepId] = useState('');

  const validItems = items.filter(it => (it.name || products.find(p => p.id === it.productId)) && Number(it.qty) > 0);
  const totals = computeInvoiceTotals(validItems, discount, applyTax, settings);
  const canSave = customerId && validItems.length > 0 && totals.total > 0 && name.trim();

  return (
    <Modal title="فاتورة دورية جديدة" onClose={onClose} width="max-w-2xl">
      <div className="flex flex-col gap-3">
        {customers.length === 0 ? (
          <p className="text-sm font-body text-rose-600">أضف عميلاً واحدًا على الأقل أولاً.</p>
        ) : (
          <>
            <Field label="اسم/وصف الاشتراك" required hint="مثال: اشتراك شهري - صيانة">
              <Input value={name} onChange={e => setName(e.target.value)} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="العميل" required>
                <Select value={customerId} onChange={e => setCustomerId(e.target.value)}>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="التكرار" required>
                <Select value={frequency} onChange={e => setFrequency(e.target.value)}>
                  <option value="weekly">أسبوعي</option>
                  <option value="monthly">شهري</option>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="تاريخ أول إصدار" required>
                <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
              </Field>
              <Field label="طريقة الدفع" required>
                <Select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                  <option value="credit">آجل (على حساب العميل)</option>
                  {treasuryAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </Select>
              </Field>
            </div>
            {reps.length > 0 && (
              <Field label="المندوب" hint="اختياري - لاحتساب العمولة تلقائيًا">
                <Select value={repId} onChange={e => setRepId(e.target.value)}>
                  <option value="">بدون مندوب</option>
                  {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </Select>
              </Field>
            )}
            <div>
              <p className="text-sm font-body text-stone-600 mb-1">بنود الفاتورة (تتكرر كما هي في كل مرة)</p>
              <ItemsEditor items={items} setItems={setItems} products={products} currency={settings.currency} priceLabel="سعر البيع" />
            </div>
            <InvoiceTotalsBox totals={totals} currency={settings.currency} discount={discount} setDiscount={setDiscount} applyTax={applyTax} setApplyTax={setApplyTax} settings={settings} />
            <div className="flex justify-end gap-2 mt-1">
              <Button variant="secondary" onClick={onClose}>إلغاء</Button>
              <Button disabled={!canSave} icon={Check} onClick={() => onSave({
                name, customerId, frequency, nextRunDate: startDate, paymentMethod, repId: repId || null,
                discount: Number(discount) || 0, applyTax,
                items: validItems.map(it => ({
                  productId: it.productId || null,
                  name: it.name || (products.find(p => p.id === it.productId)?.name) || 'بند',
                  qty: Number(it.qty), price: Number(it.price) || 0, cost: Number(it.cost) || 0,
                })),
              })}>حفظ الفاتورة الدورية</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function RecurringInvoicesView({ templates, customers, products, reps, accounts, settings, onAdd, onToggle, onDelete }) {
  const [showForm, setShowForm] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-body text-stone-500">تُصدر هذه الفواتير نفسها تلقائيًا في موعدها في كل مرة تفتح فيها النظام.</p>
        <Button icon={Plus} onClick={() => setShowForm(true)}>فاتورة دورية جديدة</Button>
      </div>

      {templates.length === 0 ? (
        <Card className="p-4">
          <EmptyState icon={FileText} title="لا توجد فواتير دورية بعد" hint="أنشئ اشتراكًا متكررًا لعميل ثابت (شهري أو أسبوعي) ليصدر تلقائيًا." />
        </Card>
      ) : (
        <Card className="overflow-x-auto p-4">
          <table className="w-full text-sm font-body">
            <thead>
              <tr className="text-stone-400 text-xs border-b border-stone-100">
                <th className="text-right py-2 font-normal">الاسم</th>
                <th className="text-right py-2 font-normal">العميل</th>
                <th className="text-right py-2 font-normal">التكرار</th>
                <th className="text-right py-2 font-normal">الإصدار القادم</th>
                <th className="text-right py-2 font-normal">الحالة</th>
                <th className="text-right py-2 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {templates.map(t => {
                const cust = customers.find(c => c.id === t.customerId);
                return (
                  <tr key={t.id} className="border-b border-stone-50">
                    <td className="py-2 text-stone-700">{t.name}</td>
                    <td className="py-2 text-stone-600">{cust ? cust.name : '-'}</td>
                    <td className="py-2">{t.frequency === 'monthly' ? 'شهري' : 'أسبوعي'}</td>
                    <td className="py-2 text-stone-600">{fmtDate(t.nextRunDate)}</td>
                    <td className="py-2">
                      <button onClick={() => onToggle(t.id)}>
                        <Badge tone={t.active ? 'green' : 'neutral'}>{t.active ? 'مفعّلة' : 'موقوفة'}</Badge>
                      </button>
                    </td>
                    <td className="py-2"><IconButton icon={Trash2} variant="danger" title="حذف" onClick={() => setConfirmDel(t)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {showForm && (
        <RecurringFormModal
          customers={customers} products={products} reps={reps} accounts={accounts} settings={settings}
          onClose={() => setShowForm(false)}
          onSave={(data) => { onAdd(data); setShowForm(false); }}
        />
      )}

      {confirmDel && (
        <ConfirmDialog
          title="حذف فاتورة دورية"
          message={`هل تريد إيقاف وحذف "${confirmDel.name}"؟ الفواتير الصادرة سابقًا منها تبقى محفوظة.`}
          onCancel={() => setConfirmDel(null)}
          onConfirm={() => { onDelete(confirmDel.id); setConfirmDel(null); }}
        />
      )}
    </div>
  );
}

/* ============================== COLLECTIONS REMINDERS (WhatsApp) ============================== */

function ReminderCard({ item, settings, onCopy }) {
  const { invoice, customer, stage } = item;
  const message = composeReminderMessage(stage, invoice, customer, settings.companyName, settings.currency);
  const tone = stage.stage === 'overdue' ? 'red' : stage.stage === 'due_today' ? 'amber' : 'blue';
  const label = stage.stage === 'overdue' ? `متأخرة ${stage.daysOverdue} يوم` : stage.stage === 'due_today' ? 'مستحقة اليوم' : `مستحقة خلال ${stage.daysToDue} يوم`;
  const hasPhone = !!(customer && customer.phone);

  return (
    <Card className="p-4 flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <p className="font-body font-medium text-stone-800">{customer ? customer.name : 'عميل نقدي'}</p>
        <Badge tone={tone}>{label}</Badge>
      </div>
      <div className="flex items-center justify-between text-sm font-body text-stone-500">
        <span>فاتورة #{invoice.no}</span>
        <Figure value={invoice.total - invoice.paidAmount} currency={settings.currency} tone="neg" />
      </div>
      <p className="text-sm font-body text-stone-600 bg-stone-50 rounded-md p-2.5 leading-relaxed">{message}</p>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" icon={Check} onClick={() => onCopy(message)}>نسخ الرسالة</Button>
        {hasPhone ? (
          <a href={buildWhatsAppLink(customer.phone, message)} target="_blank" rel="noreferrer" className="flex-1">
            <Button size="sm" className="w-full">إرسال عبر واتساب</Button>
          </a>
        ) : (
          <span className="text-xs text-stone-400 font-body self-center">لا يوجد رقم هاتف محفوظ لهذا العميل</span>
        )}
      </div>
    </Card>
  );
}

function RemindersView({ salesInvoices, customers, settings, showToast }) {
  const today = todayISO();
  const items = salesInvoices
    .map(invoice => {
      const stage = reminderStage(invoice, settings, today);
      if (!stage) return null;
      const customer = customers.find(c => c.id === invoice.customerId);
      return { invoice, customer, stage };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const order = { overdue: 0, due_today: 1, upcoming: 2 };
      return order[a.stage.stage] - order[b.stage.stage];
    });

  const overdue = items.filter(i => i.stage.stage === 'overdue');
  const dueToday = items.filter(i => i.stage.stage === 'due_today');
  const upcoming = items.filter(i => i.stage.stage === 'upcoming');

  function copy(text) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => showToast('تم نسخ الرسالة'));
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm font-body text-stone-500">
        النظام يجهّز الرسالة المناسبة تلقائيًا حسب المرحلة، وتبقى لك خطوة أخيرة بضغطة واحدة لإرسالها عبر واتساب.
      </p>

      {items.length === 0 ? (
        <Card className="p-4"><EmptyState icon={Users} title="لا توجد تذكيرات مستحقة الآن" hint="ستظهر هنا تلقائيًا فواتير العملاء القريبة من الاستحقاق أو المتأخرة." /></Card>
      ) : (
        <>
          {overdue.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="font-display font-semibold text-rose-700 text-sm flex items-center gap-1.5"><AlertTriangle size={15} /> متأخرة السداد ({overdue.length})</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {overdue.map(item => <ReminderCard key={item.invoice.id} item={item} settings={settings} onCopy={copy} />)}
              </div>
            </div>
          )}
          {dueToday.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="font-display font-semibold text-amber-700 text-sm">مستحقة اليوم ({dueToday.length})</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {dueToday.map(item => <ReminderCard key={item.invoice.id} item={item} settings={settings} onCopy={copy} />)}
              </div>
            </div>
          )}
          {upcoming.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="font-display font-semibold text-sky-700 text-sm">تذكير مبكر ({upcoming.length})</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {upcoming.map(item => <ReminderCard key={item.invoice.id} item={item} settings={settings} onCopy={copy} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ============================== DEMAND FORECAST ============================== */

function ForecastView({ products, salesInvoices, currency }) {
  const today = todayISO();
  const forecast = computeForecast(products, salesInvoices, today, 90);
  const urgent = forecast.filter(f => f.coverageWeeks < 2);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-body text-stone-500">
        يحلل النظام معدل بيع كل منتج خلال آخر 3 أشهر ويقترح كمية إعادة الطلب لتغطية أسبوعين قادمين، لتجنب نفاد المخزون.
      </p>

      {urgent.length > 0 && (
        <Card className="p-4 border-amber-300">
          <p className="font-display font-semibold text-amber-700 text-sm mb-2 flex items-center gap-1.5"><AlertTriangle size={15} /> يُنصح بالطلب قريبًا</p>
          <ul className="flex flex-col gap-1.5 font-body text-sm text-stone-700">
            {urgent.map(f => (
              <li key={f.product.id}>
                بناءً على مبيعاتك خلال آخر 3 أشهر، يُنصح بطلب <strong>{f.suggestedOrder}</strong> {f.product.unit} من <strong>{f.product.name}</strong> خلال الأسبوع القادم لتجنب انقطاعه (المخزون الحالي يغطي تقريبًا {f.coverageWeeks.toFixed(1)} أسبوع فقط).
              </li>
            ))}
          </ul>
        </Card>
      )}

      {forecast.length === 0 ? (
        <Card className="p-4"><EmptyState icon={Package} title="لا توجد بيانات مبيعات كافية بعد" hint="بعد تسجيل بعض فواتير المبيعات، ستظهر هنا توقعات الطلب لكل منتج." /></Card>
      ) : (
        <Card className="overflow-x-auto p-4">
          <table className="w-full text-sm font-body">
            <thead>
              <tr className="text-stone-400 text-xs border-b border-stone-100">
                <th className="text-right py-2 font-normal">المنتج</th>
                <th className="text-right py-2 font-normal">مبيعات آخر 3 أشهر</th>
                <th className="text-right py-2 font-normal">متوسط أسبوعي</th>
                <th className="text-right py-2 font-normal">المخزون الحالي</th>
                <th className="text-right py-2 font-normal">مدة التغطية</th>
                <th className="text-right py-2 font-normal">كمية مقترح طلبها</th>
              </tr>
            </thead>
            <tbody>
              {forecast.map(f => (
                <tr key={f.product.id} className="border-b border-stone-50">
                  <td className="py-2 text-stone-700">{f.product.name}</td>
                  <td className="py-2"><Figure value={f.totalSold} /></td>
                  <td className="py-2"><Figure value={f.weeklyAvg} /></td>
                  <td className="py-2">{f.product.qty} {f.product.unit}</td>
                  <td className="py-2">
                    <Badge tone={f.coverageWeeks < 2 ? 'red' : f.coverageWeeks < 4 ? 'amber' : 'green'}>
                      {f.coverageWeeks === Infinity ? '-' : `${f.coverageWeeks.toFixed(1)} أسبوع`}
                    </Badge>
                  </td>
                  <td className="py-2">{f.suggestedOrder > 0 ? <span className="font-medium text-emerald-700">{f.suggestedOrder} {f.product.unit}</span> : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

/* ============================== ACCOUNT STATEMENT VIEW ============================== */

function StatementView({ customers, suppliers, salesInvoices, purchaseInvoices, payments, accounts, settings }) {
  const [partyType, setPartyType] = useState('customer');
  const [partyId, setPartyId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(todayISO());

  const parties = partyType === 'customer' ? customers : suppliers;
  const party = parties.find(p => p.id === partyId) || null;

  const statement = partyId
    ? computeStatement(partyType, partyId, from, to, salesInvoices, purchaseInvoices, payments, accounts)
    : null;

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4 no-print">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="نوع الطرف" required>
            <Select value={partyType} onChange={e => { setPartyType(e.target.value); setPartyId(''); }}>
              <option value="customer">عميل</option>
              <option value="supplier">مورد</option>
            </Select>
          </Field>
          <Field label={partyType === 'customer' ? 'العميل' : 'المورد'} required>
            <Select value={partyId} onChange={e => setPartyId(e.target.value)}>
              <option value="">اختر...</option>
              {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="من تاريخ" hint="اتركه فارغًا لعرض كل السجل">
            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </Field>
          <Field label="إلى تاريخ">
            <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
          </Field>
        </div>
        {party && (
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" icon={Download} onClick={() => exportRowsToExcel(`كشف-حساب-${party.name}`, 'كشف حساب', statement.rows.map(r => ({
              'التاريخ': fmtDate(r.date), 'البيان': r.description, 'مدين': r.debit, 'دائن': r.credit, 'الرصيد': r.balance,
            })))}>تصدير Excel</Button>
            <Button icon={Printer} onClick={() => window.print()}>طباعة / تصدير PDF</Button>
          </div>
        )}
      </Card>

      {!party ? (
        <Card className="p-4">
          <EmptyState icon={FileText} title="اختر عميلاً أو موردًا" hint="سيظهر هنا كشف حساب كامل بالرصيد الافتتاحي وكل الحركات والرصيد الختامي." />
        </Card>
      ) : (
        <Card className="p-5 print-area">
          <div className="flex items-start justify-between mb-4 pb-4 border-b border-stone-200">
            <div>
              <p className="font-display font-bold text-lg text-stone-800">{settings.companyName}</p>
              <p className="text-sm text-stone-500 font-body">كشف حساب {partyType === 'customer' ? 'عميل' : 'مورد'}</p>
            </div>
            <div className="text-left text-sm font-body text-stone-500">
              <p>تاريخ الإصدار: {fmtDate(todayISO())}</p>
              {(from || to) && <p>الفترة: {from ? fmtDate(from) : 'البداية'} - {to ? fmtDate(to) : 'اليوم'}</p>}
            </div>
          </div>

          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-body font-semibold text-stone-800">{party.name}</p>
              {party.phone && <p className="text-xs text-stone-400 font-body" dir="ltr">{party.phone}</p>}
            </div>
            <div className="text-left">
              <p className="text-xs text-stone-400 font-body">الرصيد الافتتاحي</p>
              <Figure value={statement.openingBalance} currency={settings.currency} />
            </div>
          </div>

          {statement.rows.length === 0 ? (
            <p className="text-sm text-stone-400 font-body py-6 text-center">لا توجد حركات في هذه الفترة.</p>
          ) : (
            <table className="w-full text-sm font-body">
              <thead>
                <tr className="text-stone-400 text-xs border-b border-stone-200">
                  <th className="text-right py-2 font-normal">التاريخ</th>
                  <th className="text-right py-2 font-normal">البيان</th>
                  <th className="text-right py-2 font-normal">مدين</th>
                  <th className="text-right py-2 font-normal">دائن</th>
                  <th className="text-right py-2 font-normal">الرصيد</th>
                </tr>
              </thead>
              <tbody>
                {statement.rows.map((r, i) => (
                  <tr key={i} className="border-b border-stone-50">
                    <td className="py-2 text-stone-500">{fmtDate(r.date)}</td>
                    <td className="py-2 text-stone-700">{r.description}</td>
                    <td className="py-2">{r.debit > 0 ? <Figure value={r.debit} /> : '-'}</td>
                    <td className="py-2">{r.credit > 0 ? <Figure value={r.credit} /> : '-'}</td>
                    <td className="py-2"><Figure value={r.balance} currency={settings.currency} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="flex justify-end mt-4 pt-4 border-t-2 border-stone-200">
            <div className="text-left">
              <p className="text-xs text-stone-400 font-body">
                {partyType === 'customer' ? 'الرصيد الختامي المستحق من العميل' : 'الرصيد الختامي المستحق للمورد'}
              </p>
              <Figure value={statement.closingBalance} currency={settings.currency} className="text-lg font-semibold" />
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ============================== REPORTS ============================== */

function ReportExportBar({ onExportExcel, onPrint }) {
  return (
    <div className="flex justify-end gap-2 mb-3 no-print">
      <Button size="sm" variant="outline" icon={Download} onClick={onExportExcel}>تصدير Excel</Button>
      <Button size="sm" variant="outline" icon={Printer} onClick={onPrint}>طباعة / PDF</Button>
    </div>
  );
}

function TrialBalanceReport({ accounts, journalEntries, currency, from, to }) {
  const entries = filterEntriesByDate(journalEntries, from, to);
  const rows = accounts.map(acc => {
    const { debit, credit } = accountBalance(acc, entries);
    return { acc, debit, credit };
  }).filter(r => r.debit !== 0 || r.credit !== 0);
  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.005;

  const exportExcel = () => exportRowsToExcel('ميزان-المراجعة', 'ميزان المراجعة', rows.map(r => ({
    'الرمز': r.acc.code, 'الحساب': r.acc.name, 'مدين': r.debit, 'دائن': r.credit,
  })));

  return (
    <>
      <ReportExportBar onExportExcel={exportExcel} onPrint={() => window.print()} />
      <Card className="p-4 overflow-x-auto print-area">
        <table className="w-full text-sm font-body">
          <thead>
            <tr className="text-stone-400 text-xs border-b border-stone-100">
              <th className="text-right py-2 font-normal">الرمز</th>
              <th className="text-right py-2 font-normal">الحساب</th>
              <th className="text-right py-2 font-normal">مدين</th>
              <th className="text-right py-2 font-normal">دائن</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.acc.id} className="border-b border-stone-50">
                <td className="py-2 text-stone-500">{r.acc.code}</td>
                <td className="py-2 text-stone-700">{r.acc.name}</td>
                <td className="py-2"><Figure value={r.debit} currency={currency} /></td>
                <td className="py-2"><Figure value={r.credit} currency={currency} /></td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={4} className="py-6 text-center text-stone-400 text-xs">لا توجد حركات في هذه الفترة</td></tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-stone-200 font-semibold">
                <td className="py-2" colSpan={2}>الإجمالي</td>
                <td className="py-2"><Figure value={totalDebit} currency={currency} /></td>
                <td className="py-2"><Figure value={totalCredit} currency={currency} /></td>
              </tr>
            </tfoot>
          )}
        </table>
        {rows.length > 0 && (
          <div className={classNames('mt-3 flex items-center gap-1.5 text-xs font-body px-3 py-1.5 rounded-md w-fit', balanced ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600')}>
            {balanced ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
            {balanced ? 'ميزان المراجعة متوازن' : 'ميزان المراجعة غير متوازن - تحقق من القيود'}
          </div>
        )}
      </Card>
    </>
  );
}

function IncomeStatementReport({ accounts, journalEntries, currency, from, to }) {
  const entries = filterEntriesByDate(journalEntries, from, to);
  const revenues = accounts.filter(a => a.type === 'revenue').map(a => ({ acc: a, bal: accountBalance(a, entries).balance })).filter(r => r.bal !== 0);
  const expenses = accounts.filter(a => a.type === 'expense').map(a => ({ acc: a, bal: accountBalance(a, entries).balance })).filter(r => r.bal !== 0);
  const totalRev = revenues.reduce((s, r) => s + r.bal, 0);
  const totalExp = expenses.reduce((s, r) => s + r.bal, 0);
  const net = totalRev - totalExp;

  const exportExcel = () => exportRowsToExcel('قائمة-الدخل', 'قائمة الدخل', [
    ...revenues.map(r => ({ 'البند': r.acc.name, 'التصنيف': 'إيراد', 'المبلغ': r.bal })),
    { 'البند': 'إجمالي الإيرادات', 'التصنيف': '', 'المبلغ': totalRev },
    ...expenses.map(r => ({ 'البند': r.acc.name, 'التصنيف': 'مصروف', 'المبلغ': r.bal })),
    { 'البند': 'إجمالي المصاريف', 'التصنيف': '', 'المبلغ': totalExp },
    { 'البند': net >= 0 ? 'صافي الربح' : 'صافي الخسارة', 'التصنيف': '', 'المبلغ': net },
  ]);

  return (
    <>
      <ReportExportBar onExportExcel={exportExcel} onPrint={() => window.print()} />
      <Card className="p-4 print-area">
        <p className="font-display font-semibold text-stone-700 mb-3 text-sm">الإيرادات</p>
        <table className="w-full text-sm font-body mb-4">
          <tbody>
            {revenues.map(r => (
              <tr key={r.acc.id} className="border-b border-stone-50">
                <td className="py-1.5 text-stone-600">{r.acc.name}</td>
                <td className="py-1.5 text-left"><Figure value={r.bal} currency={currency} /></td>
              </tr>
            ))}
            {revenues.length === 0 && <tr><td className="py-2 text-stone-400 text-xs">لا توجد إيرادات في هذه الفترة</td></tr>}
          </tbody>
          <tfoot><tr className="font-semibold border-t border-stone-200"><td className="py-1.5">إجمالي الإيرادات</td><td className="py-1.5 text-left"><Figure value={totalRev} currency={currency} tone="pos" /></td></tr></tfoot>
        </table>

        <p className="font-display font-semibold text-stone-700 mb-3 text-sm">المصاريف</p>
        <table className="w-full text-sm font-body mb-4">
          <tbody>
            {expenses.map(r => (
              <tr key={r.acc.id} className="border-b border-stone-50">
                <td className="py-1.5 text-stone-600">{r.acc.name}</td>
                <td className="py-1.5 text-left"><Figure value={r.bal} currency={currency} /></td>
              </tr>
            ))}
            {expenses.length === 0 && <tr><td className="py-2 text-stone-400 text-xs">لا توجد مصاريف في هذه الفترة</td></tr>}
          </tbody>
          <tfoot><tr className="font-semibold border-t border-stone-200"><td className="py-1.5">إجمالي المصاريف</td><td className="py-1.5 text-left"><Figure value={totalExp} currency={currency} tone="neg" /></td></tr></tfoot>
        </table>

        <div className={classNames('flex items-center justify-between text-base font-body font-semibold px-3 py-2.5 rounded-md', net >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600')}>
          <span>{net >= 0 ? 'صافي الربح' : 'صافي الخسارة'}</span>
          <Figure value={Math.abs(net)} currency={currency} />
        </div>
      </Card>
    </>
  );
}

function BalanceSheetReport({ accounts, journalEntries, currency, to }) {
  const entries = filterEntriesByDate(journalEntries, '', to);
  const assets = accounts.filter(a => a.type === 'asset').map(a => ({ acc: a, bal: accountBalance(a, entries).balance })).filter(r => r.bal !== 0);
  const liabilities = accounts.filter(a => a.type === 'liability').map(a => ({ acc: a, bal: accountBalance(a, entries).balance })).filter(r => r.bal !== 0);
  const equity = accounts.filter(a => a.type === 'equity').map(a => ({ acc: a, bal: accountBalance(a, entries).balance })).filter(r => r.bal !== 0);

  let revTotal = 0, expTotal = 0;
  accounts.forEach(a => {
    const bal = accountBalance(a, entries).balance;
    if (a.type === 'revenue') revTotal += bal;
    if (a.type === 'expense') expTotal += bal;
  });
  const currentProfit = revTotal - expTotal;

  const totalAssets = assets.reduce((s, r) => s + r.bal, 0);
  const totalLiabilities = liabilities.reduce((s, r) => s + r.bal, 0);
  const totalEquity = equity.reduce((s, r) => s + r.bal, 0) + currentProfit;
  const balanced = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.005;

  const Section = ({ title, rows, extra, total }) => (
    <div className="mb-4">
      <p className="font-display font-semibold text-stone-700 mb-2 text-sm">{title}</p>
      <table className="w-full text-sm font-body">
        <tbody>
          {rows.map(r => (
            <tr key={r.acc.id} className="border-b border-stone-50">
              <td className="py-1.5 text-stone-600">{r.acc.name}</td>
              <td className="py-1.5 text-left"><Figure value={r.bal} currency={currency} /></td>
            </tr>
          ))}
          {extra && (
            <tr className="border-b border-stone-50">
              <td className="py-1.5 text-stone-600">{extra.label}</td>
              <td className="py-1.5 text-left"><Figure value={extra.value} currency={currency} /></td>
            </tr>
          )}
        </tbody>
        <tfoot><tr className="font-semibold border-t border-stone-200"><td className="py-1.5">الإجمالي</td><td className="py-1.5 text-left"><Figure value={total} currency={currency} /></td></tr></tfoot>
      </table>
    </div>
  );

  const exportExcel = () => exportRowsToExcel('الميزانية-العمومية', 'الميزانية العمومية', [
    ...assets.map(r => ({ 'البند': r.acc.name, 'القسم': 'أصول', 'المبلغ': r.bal })),
    { 'البند': 'إجمالي الأصول', 'القسم': '', 'المبلغ': totalAssets },
    ...liabilities.map(r => ({ 'البند': r.acc.name, 'القسم': 'خصوم', 'المبلغ': r.bal })),
    { 'البند': 'إجمالي الخصوم', 'القسم': '', 'المبلغ': totalLiabilities },
    ...equity.map(r => ({ 'البند': r.acc.name, 'القسم': 'حقوق ملكية', 'المبلغ': r.bal })),
    { 'البند': 'أرباح الفترة الحالية', 'القسم': 'حقوق ملكية', 'المبلغ': currentProfit },
    { 'البند': 'إجمالي حقوق الملكية', 'القسم': '', 'المبلغ': totalEquity },
  ]);

  return (
    <>
      <ReportExportBar onExportExcel={exportExcel} onPrint={() => window.print()} />
      <Card className="p-4 print-area">
        <Section title="الأصول" rows={assets} total={totalAssets} />
        <Section title="الخصوم" rows={liabilities} total={totalLiabilities} />
        <Section title="حقوق الملكية" rows={equity} extra={{ label: 'أرباح الفترة الحالية (غير مرحّلة)', value: currentProfit }} total={totalEquity} />
        <div className={classNames('flex items-center justify-between text-sm font-body px-3 py-2 rounded-md', balanced ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600')}>
          <span>الأصول: {fmtNum(totalAssets)} {currency} | الخصوم + حقوق الملكية: {fmtNum(totalLiabilities + totalEquity)} {currency}</span>
          {balanced ? <span className="flex items-center gap-1"><CheckCircle2 size={14} /> متوازنة</span> : <span className="flex items-center gap-1"><AlertTriangle size={14} /> غير متوازنة</span>}
        </div>
      </Card>
    </>
  );
}

function ItemCardReport({ products, salesInvoices, purchaseInvoices, from, to }) {
  const [productId, setProductId] = useState(products[0]?.id || '');
  const product = products.find(p => p.id === productId) || null;
  const card = product ? computeItemCard(product, salesInvoices, purchaseInvoices, from, to) : null;

  const exportExcel = () => {
    if (!product || !card) return;
    exportRowsToExcel(`بطاقة-صنف-${product.name}`, 'بطاقة صنف', card.rows.map(r => ({
      'التاريخ': fmtDate(r.date), 'البيان': r.description, 'وارد': r.qtyIn, 'صادر': r.qtyOut, 'الرصيد': r.balance,
    })));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between no-print">
        <div className="w-64">
          <Select value={productId} onChange={e => setProductId(e.target.value)}>
            {products.length === 0 && <option value="">لا توجد منتجات</option>}
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </div>
        {product && <ReportExportBar onExportExcel={exportExcel} onPrint={() => window.print()} />}
      </div>

      {!product ? (
        <Card className="p-4"><EmptyState icon={Package} title="لا توجد منتجات بعد" hint="أضف منتجات أولاً من قسم المنتجات والمخزون." /></Card>
      ) : (
        <Card className="p-4 print-area">
          <div className="flex items-center justify-between mb-3 pb-3 border-b border-stone-200">
            <div>
              <p className="font-body font-semibold text-stone-800">{product.name}</p>
              <p className="text-xs text-stone-400 font-body">{product.sku ? `رمز: ${product.sku}` : ''} {product.unit}</p>
            </div>
            <div className="text-left">
              <p className="text-xs text-stone-400 font-body">الرصيد الافتتاحي (كمية)</p>
              <span className="font-body font-medium">{card.openingQty} {product.unit}</span>
            </div>
          </div>

          {card.rows.length === 0 ? (
            <p className="text-sm text-stone-400 font-body py-6 text-center">لا توجد حركات لهذا الصنف في هذه الفترة.</p>
          ) : (
            <table className="w-full text-sm font-body">
              <thead>
                <tr className="text-stone-400 text-xs border-b border-stone-100">
                  <th className="text-right py-2 font-normal">التاريخ</th>
                  <th className="text-right py-2 font-normal">البيان</th>
                  <th className="text-right py-2 font-normal">وارد</th>
                  <th className="text-right py-2 font-normal">صادر</th>
                  <th className="text-right py-2 font-normal">الرصيد</th>
                </tr>
              </thead>
              <tbody>
                {card.rows.map((r, i) => (
                  <tr key={i} className="border-b border-stone-50">
                    <td className="py-2 text-stone-500">{fmtDate(r.date)}</td>
                    <td className="py-2 text-stone-700">{r.description}</td>
                    <td className="py-2">{r.qtyIn > 0 ? <span className="text-emerald-700">{r.qtyIn}</span> : '-'}</td>
                    <td className="py-2">{r.qtyOut > 0 ? <span className="text-rose-600">{r.qtyOut}</span> : '-'}</td>
                    <td className="py-2 font-medium">{r.balance} {product.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t-2 border-stone-200 text-sm font-body">
            <div><p className="text-xs text-stone-400">إجمالي الوارد</p><p className="font-medium text-emerald-700">{card.totalIn} {product.unit}</p></div>
            <div><p className="text-xs text-stone-400">إجمالي الصادر</p><p className="font-medium text-rose-600">{card.totalOut} {product.unit}</p></div>
            <div><p className="text-xs text-stone-400">الرصيد الختامي</p><p className="font-semibold">{card.closingQty} {product.unit}</p></div>
          </div>
        </Card>
      )}
    </div>
  );
}

function ReportsView({ accounts, journalEntries, products, salesInvoices, purchaseInvoices, currency }) {
  const [tab, setTab] = useState('trial');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(todayISO());

  const tabs = [
    { key: 'trial', label: 'ميزان المراجعة' },
    { key: 'income', label: 'قائمة الدخل' },
    { key: 'balance', label: 'الميزانية العمومية' },
    { key: 'itemCard', label: 'بطاقة صنف' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={classNames(
            'px-3.5 py-1.5 rounded-full text-sm font-body transition-colors',
            tab === t.key ? 'bg-emerald-700 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
          )}>{t.label}</button>
        ))}
        <div className="flex items-center gap-2 ms-auto">
          {tab !== 'balance' && (
            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-auto" />
          )}
          <span className="text-xs text-stone-400 font-body">إلى</span>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-auto" />
        </div>
      </div>

      {tab === 'trial' && <TrialBalanceReport accounts={accounts} journalEntries={journalEntries} currency={currency} from={from} to={to} />}
      {tab === 'income' && <IncomeStatementReport accounts={accounts} journalEntries={journalEntries} currency={currency} from={from} to={to} />}
      {tab === 'balance' && <BalanceSheetReport accounts={accounts} journalEntries={journalEntries} currency={currency} to={to} />}
      {tab === 'itemCard' && <ItemCardReport products={products} salesInvoices={salesInvoices} purchaseInvoices={purchaseInvoices} from={from} to={to} />}
    </div>
  );
}

/* ============================== SETTINGS ============================== */

function SettingsView({ settings, onSave, onResetAll }) {
  const [form, setForm] = useState(settings);
  const [confirmReset, setConfirmReset] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(settings);
  const knownCurrency = CURRENCIES.some(c => c.symbol === form.currency);
  const [customCurrency, setCustomCurrency] = useState(!knownCurrency);

  return (
    <div className="flex flex-col gap-4 max-w-lg">
      <Card className="p-4 flex flex-col gap-3">
        <p className="font-display font-semibold text-stone-700 text-sm">بيانات عامة</p>
        <Field label="اسم المنشأة" required>
          <Input value={form.companyName} onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))} />
        </Field>
        <Field label="العملة" required>
          <Select
            value={customCurrency ? '__custom__' : form.currency}
            onChange={e => {
              if (e.target.value === '__custom__') { setCustomCurrency(true); }
              else { setCustomCurrency(false); setForm(f => ({ ...f, currency: e.target.value })); }
            }}
          >
            {CURRENCIES.map(c => <option key={c.symbol} value={c.symbol}>{c.label} ({c.symbol})</option>)}
            <option value="__custom__">أخرى (تحديد يدوي)</option>
          </Select>
          {customCurrency && (
            <Input className="mt-2" value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} placeholder="رمز العملة" />
          )}
        </Field>
        <Field label="نوع الضريبة" required>
          <Select value={form.taxType} onChange={e => setForm(f => ({ ...f, taxType: e.target.value }))}>
            <option value="percent">نسبة مئوية (%)</option>
            <option value="fixed">مبلغ ثابت لكل فاتورة</option>
          </Select>
        </Field>
        {form.taxType === 'percent' ? (
          <Field label="نسبة الضريبة الافتراضية (%)" required>
            <Input type="number" min="0" step="0.1" dir="ltr" value={form.taxRate} onChange={e => setForm(f => ({ ...f, taxRate: Number(e.target.value) }))} />
          </Field>
        ) : (
          <Field label={`المبلغ الثابت للضريبة (${form.currency})`} required>
            <Input type="number" min="0" step="0.01" dir="ltr" value={form.taxFixedAmount} onChange={e => setForm(f => ({ ...f, taxFixedAmount: Number(e.target.value) }))} />
          </Field>
        )}
      </Card>

      <Card className="p-4 flex flex-col gap-3">
        <label className="flex items-center justify-between">
          <p className="font-display font-semibold text-stone-700 text-sm">برنامج عملاء VIP التلقائي</p>
          <input type="checkbox" checked={form.vipEnabled} onChange={e => setForm(f => ({ ...f, vipEnabled: e.target.checked }))} />
        </label>
        <p className="text-xs text-stone-400 font-body -mt-2">عندما تتجاوز مشتريات العميل خلال آخر 30 يومًا هذا المبلغ، يُصنَّف VIP تلقائيًا ويُفعَّل له خصم في فواتيره القادمة دون تدخل بشري.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`الحد الشهري (${form.currency})`}>
            <Input type="number" min="0" step="1000" dir="ltr" value={form.vipMonthlyThreshold} onChange={e => setForm(f => ({ ...f, vipMonthlyThreshold: Number(e.target.value) }))} />
          </Field>
          <Field label="نسبة الخصم التلقائي (%)">
            <Input type="number" min="0" step="0.1" dir="ltr" value={form.vipDiscountPercent} onChange={e => setForm(f => ({ ...f, vipDiscountPercent: Number(e.target.value) }))} />
          </Field>
        </div>
      </Card>

      <Card className="p-4 flex flex-col gap-3">
        <p className="font-display font-semibold text-stone-700 text-sm">الآجل والتحصيل والجدارة الائتمانية</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="مهلة السداد الافتراضية (أيام)" hint="تُستخدم لحساب تاريخ استحقاق كل فاتورة آجلة">
            <Input type="number" min="1" step="1" dir="ltr" value={form.defaultPaymentTermsDays} onChange={e => setForm(f => ({ ...f, defaultPaymentTermsDays: Number(e.target.value) }))} />
          </Field>
          <Field label="التذكير المبكر قبل الاستحقاق بـ (أيام)">
            <Input type="number" min="1" step="1" dir="ltr" value={form.reminderBeforeDays} onChange={e => setForm(f => ({ ...f, reminderBeforeDays: Number(e.target.value) }))} />
          </Field>
          <Field label="عدد الفواتير المتأخرة لحظر الآجل" hint="إذا وصل عدد فواتير العميل المتأخرة لهذا الرقم يُمنع البيع له آجلاً">
            <Input type="number" min="1" step="1" dir="ltr" value={form.overdueBlockCount} onChange={e => setForm(f => ({ ...f, overdueBlockCount: Number(e.target.value) }))} />
          </Field>
          <Field label="أيام التأخر لحظر الآجل" hint="أو إذا تجاوز تأخر أي فاتورة هذا العدد من الأيام">
            <Input type="number" min="1" step="1" dir="ltr" value={form.overdueBlockThresholdDays} onChange={e => setForm(f => ({ ...f, overdueBlockThresholdDays: Number(e.target.value) }))} />
          </Field>
        </div>
      </Card>

      <Card className="p-4 flex flex-col gap-3">
        <p className="font-display font-semibold text-stone-700 text-sm">المندوبون والعمولات</p>
        <Field label="نسبة العمولة الافتراضية للمندوب الجديد (%)">
          <Input type="number" min="0" step="0.1" dir="ltr" value={form.defaultCommissionPercent} onChange={e => setForm(f => ({ ...f, defaultCommissionPercent: Number(e.target.value) }))} />
        </Field>
      </Card>

      <Button disabled={!dirty} icon={Check} onClick={() => onSave(form)} className="self-start">حفظ الإعدادات</Button>

      <Card className="p-4 flex flex-col gap-2 border-rose-200">
        <p className="font-display font-semibold text-rose-700 text-sm">منطقة الخطر</p>
        <p className="text-sm font-body text-stone-500">حذف جميع البيانات المسجلة (الحسابات، الفواتير، القيود، المنتجات) بشكل نهائي.</p>
        <Button variant="danger" icon={Trash2} className="self-start" onClick={() => setConfirmReset(true)}>حذف جميع البيانات</Button>
      </Card>

      {confirmReset && (
        <ConfirmDialog
          title="حذف جميع البيانات"
          message="هذا الإجراء سيحذف كل البيانات المسجلة نهائيًا ولا يمكن التراجع عنه. هل أنت متأكد؟"
          onCancel={() => setConfirmReset(false)}
          onConfirm={() => { onResetAll(); setConfirmReset(false); }}
        />
      )}
    </div>
  );
}

/* ============================== MAIN APP ============================== */

const VIEW_TITLES = {
  dashboard: 'لوحة التحكم', treasury: 'الصندوق والبنوك', accounts: 'دليل الحسابات', customers: 'العملاء', suppliers: 'الموردون',
  workers: 'العمال والموظفون', statement: 'كشف حساب',
  products: 'المنتجات والمخزون', sales: 'فواتير المبيعات', purchases: 'فواتير المشتريات',
  recurring: 'الفواتير الدورية', reminders: 'تذكيرات التحصيل', forecast: 'التنبؤ بالطلب', reps: 'المندوبون والعمولات',
  expenses: 'المصاريف', journal: 'القيود اليومية', reports: 'التقارير المالية', settings: 'الإعدادات',
};

export default function AccountingApp() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [accounts, setAccounts] = useState(DEFAULT_ACCOUNTS);
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [salesInvoices, setSalesInvoices] = useState([]);
  const [purchaseInvoices, setPurchaseInvoices] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [journalEntries, setJournalEntries] = useState([]);
  const [reps, setReps] = useState([]);
  const [recurringTemplates, setRecurringTemplates] = useState([]);
  const [payments, setPayments] = useState([]);
  const [workers, setWorkers] = useState([]);

  useEffect(() => {
    (async () => {
      const [s, acc, cust, sup, prod, sales, purch, exp, jour, repsData, recurData, paymentsData, workersData] = await Promise.all([
        loadKey(STORAGE_KEYS.settings, null),
        loadKey(STORAGE_KEYS.accounts, null),
        loadKey(STORAGE_KEYS.customers, []),
        loadKey(STORAGE_KEYS.suppliers, []),
        loadKey(STORAGE_KEYS.products, []),
        loadKey(STORAGE_KEYS.sales, []),
        loadKey(STORAGE_KEYS.purchases, []),
        loadKey(STORAGE_KEYS.expenses, []),
        loadKey(STORAGE_KEYS.journal, []),
        loadKey(STORAGE_KEYS.reps, []),
        loadKey(STORAGE_KEYS.recurring, []),
        loadKey(STORAGE_KEYS.payments, []),
        loadKey(STORAGE_KEYS.workers, []),
      ]);
      // Merge with defaults so upgrading from an older saved version still has the new fields.
      const finalSettings = { ...DEFAULT_SETTINGS, ...(s || {}) };
      const finalAccounts = acc || DEFAULT_ACCOUNTS.map(a => ({ ...a }));
      const finalReps = repsData || [];
      const finalRecurring = recurData || [];
      const finalSalesRaw = sales || [];
      const finalProductsRaw = prod || [];

      const today = todayISO();
      const result = runRecurringInvoices({
        recurringTemplates: finalRecurring, salesInvoices: finalSalesRaw, products: finalProductsRaw,
        accounts: finalAccounts, journalEntries: jour || [], settings: finalSettings, reps: finalReps, today,
      });

      setSettings(result.settings);
      setAccounts(finalAccounts);
      setCustomers(cust || []);
      setSuppliers(sup || []);
      setProducts(result.products);
      setSalesInvoices(result.salesInvoices);
      setPurchaseInvoices(purch || []);
      setExpenses(exp || []);
      setJournalEntries(result.journalEntries);
      setReps(finalReps);
      setRecurringTemplates(result.recurringTemplates);
      setPayments(paymentsData || []);
      setWorkers(workersData || []);

      if (!s) saveKey(STORAGE_KEYS.settings, result.settings);
      if (!acc) saveKey(STORAGE_KEYS.accounts, finalAccounts);
      if (result.generatedCount > 0) {
        saveKey(STORAGE_KEYS.settings, result.settings);
        saveKey(STORAGE_KEYS.sales, result.salesInvoices);
        saveKey(STORAGE_KEYS.products, result.products);
        saveKey(STORAGE_KEYS.journal, result.journalEntries);
        saveKey(STORAGE_KEYS.recurring, result.recurringTemplates);
      }
      setLoading(false);
      if (result.generatedCount > 0) {
        setTimeout(() => showToast(`تم إصدار ${result.generatedCount} فاتورة دورية مستحقة تلقائيًا`), 300);
      }
    })();
  }, []);

  function showToast(message, type = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2800);
  }

  async function persist(key, value) {
    const ok = await saveKey(key, value);
    if (!ok) showToast('تعذر حفظ البيانات، حاول مرة أخرى', 'error');
  }

  /* ---------- Accounts ---------- */
  function addAccount(form) {
    const acc = { id: uid('acc'), code: form.code.trim(), name: form.name.trim(), type: form.type, kind: form.type, system: false };
    const next = [...accounts, acc];
    setAccounts(next); persist(STORAGE_KEYS.accounts, next);
    showToast('تمت إضافة الحساب بنجاح');
  }
  function deleteAccount(id) {
    const next = accounts.filter(a => a.id !== id);
    setAccounts(next); persist(STORAGE_KEYS.accounts, next);
    showToast('تم حذف الحساب');
  }

  /* ---------- Treasury (cash/bank/wallet) accounts ---------- */
  function addTreasuryAccount(form) {
    const existingTreasuryCount = getTreasuryAccounts(accounts).length;
    const acc = {
      id: uid('acc'), code: String(1000 + existingTreasuryCount * 10), name: form.name.trim(),
      type: 'asset', kind: form.kind, system: false,
    };
    let nextAccounts = [...accounts, acc];
    let nextJournal = journalEntries;
    let nextSettings = settings;

    if (form.openingBalance > 0) {
      const jeNo = settings.nextJournalNo;
      const je = makeEntry(jeNo, todayISO(), `رصيد افتتاحي - ${acc.name}`, [
        { accountId: acc.id, debit: form.openingBalance, credit: 0 },
        { accountId: getAccountByKind(accounts, 'capital').id, debit: 0, credit: form.openingBalance },
      ], 'manual', null);
      nextJournal = [...journalEntries, je];
      nextSettings = { ...settings, nextJournalNo: jeNo + 1 };
      setJournalEntries(nextJournal); setSettings(nextSettings);
      persist(STORAGE_KEYS.journal, nextJournal);
      persist(STORAGE_KEYS.settings, nextSettings);
    }
    setAccounts(nextAccounts); persist(STORAGE_KEYS.accounts, nextAccounts);
    showToast('تمت إضافة الحساب بنجاح');
  }
  function deleteTreasuryAccount(id) {
    const next = accounts.filter(a => a.id !== id);
    setAccounts(next); persist(STORAGE_KEYS.accounts, next);
    showToast('تم حذف الحساب');
  }
  function addTreasuryTransaction(data) {
    const jeNo = settings.nextJournalNo;
    const lines = data.type === 'deposit'
      ? [
          { accountId: data.treasuryAccountId, debit: data.amount, credit: 0 },
          { accountId: data.offsetAccountId, debit: 0, credit: data.amount },
        ]
      : [
          { accountId: data.offsetAccountId, debit: data.amount, credit: 0 },
          { accountId: data.treasuryAccountId, debit: 0, credit: data.amount },
        ];
    const je = makeEntry(jeNo, data.date, data.description || (data.type === 'deposit' ? 'إيداع' : 'سحب'), lines, 'manual', null);
    const nextJournal = [...journalEntries, je];
    const nextSettings = { ...settings, nextJournalNo: jeNo + 1 };
    setJournalEntries(nextJournal); setSettings(nextSettings);
    persist(STORAGE_KEYS.journal, nextJournal);
    persist(STORAGE_KEYS.settings, nextSettings);
    showToast('تم تسجيل الحركة بنجاح');
  }

  /* ---------- Customers / Suppliers ---------- */
  function addContact(type, form) {
    const contact = { id: uid(type === 'customer' ? 'cust' : 'sup'), name: form.name.trim(), phone: form.phone || '', notes: form.notes || '' };
    if (type === 'customer') { const next = [...customers, contact]; setCustomers(next); persist(STORAGE_KEYS.customers, next); }
    else { const next = [...suppliers, contact]; setSuppliers(next); persist(STORAGE_KEYS.suppliers, next); }
    showToast('تمت الإضافة بنجاح');
  }
  function updateContact(type, updated) {
    if (type === 'customer') { const next = customers.map(c => c.id === updated.id ? updated : c); setCustomers(next); persist(STORAGE_KEYS.customers, next); }
    else { const next = suppliers.map(c => c.id === updated.id ? updated : c); setSuppliers(next); persist(STORAGE_KEYS.suppliers, next); }
    showToast('تم تحديث البيانات');
  }
  function deleteContact(type, id) {
    if (type === 'customer') { const next = customers.filter(c => c.id !== id); setCustomers(next); persist(STORAGE_KEYS.customers, next); }
    else { const next = suppliers.filter(c => c.id !== id); setSuppliers(next); persist(STORAGE_KEYS.suppliers, next); }
    showToast('تم الحذف');
  }

  /* ---------- Products ---------- */
  function addProduct(form) {
    const p = { id: uid('prod'), ...form };
    const next = [...products, p];
    setProducts(next); persist(STORAGE_KEYS.products, next);
    showToast('تمت إضافة المنتج');
  }
  function updateProduct(updated) {
    const next = products.map(p => p.id === updated.id ? updated : p);
    setProducts(next); persist(STORAGE_KEYS.products, next);
    showToast('تم تحديث المنتج');
  }
  function deleteProduct(id) {
    const next = products.filter(p => p.id !== id);
    setProducts(next); persist(STORAGE_KEYS.products, next);
    showToast('تم حذف المنتج');
  }
  const usedProductIds = useMemo(() => {
    const s = new Set();
    salesInvoices.forEach(inv => inv.items.forEach(it => it.productId && s.add(it.productId)));
    purchaseInvoices.forEach(inv => inv.items.forEach(it => it.productId && s.add(it.productId)));
    return s;
  }, [salesInvoices, purchaseInvoices]);

  /* ---------- Sales Invoice ---------- */
  function addSalesInvoice(data) {
    const totals = computeInvoiceTotals(data.items, data.discount, data.applyTax, settings);
    const no = settings.nextSalesNo;
    const invId = uid('sinv');
    const jeNo = settings.nextJournalNo;

    const lines = [];
    if (data.paymentMethod === 'credit') {
      lines.push({ accountId: getAccountByKind(accounts, 'ar').id, debit: totals.total, credit: 0 });
    } else {
      const cashAcc = resolveTreasuryAccountId(data.paymentMethod, accounts);
      lines.push({ accountId: cashAcc, debit: totals.total, credit: 0 });
    }
    lines.push({ accountId: getAccountByKind(accounts, 'sales_revenue').id, debit: 0, credit: totals.afterDiscount });
    if (totals.tax > 0) lines.push({ accountId: getAccountByKind(accounts, 'vat_out').id, debit: 0, credit: totals.tax });
    if (totals.cost > 0) {
      lines.push({ accountId: getAccountByKind(accounts, 'cogs').id, debit: totals.cost, credit: 0 });
      lines.push({ accountId: getAccountByKind(accounts, 'inventory').id, debit: 0, credit: totals.cost });
    }
    const je = makeEntry(jeNo, data.date, `فاتورة مبيعات #${no}`, lines, 'sales', invId);

    const rep = data.repId ? reps.find(r => r.id === data.repId) : null;
    const commissionAmount = rep ? totals.afterDiscount * (Number(rep.commissionPercent) || 0) / 100 : 0;

    const invoice = {
      id: invId, no, date: data.date, customerId: data.customerId, items: data.items,
      discount: data.discount, subtotal: totals.subtotal, tax: totals.tax, total: totals.total,
      paymentMethod: data.paymentMethod, paidAmount: data.paymentMethod === 'credit' ? 0 : totals.total,
      journalId: je.id, dueDate: data.dueDate || addDays(data.date, settings.defaultPaymentTermsDays),
      repId: data.repId || null, commissionAmount, isVipSale: !!data.isVipSale,
    };

    const nextProducts = products.map(p => {
      const item = data.items.find(it => it.productId === p.id);
      return item ? { ...p, qty: Number(p.qty) - Number(item.qty) } : p;
    });
    const nextSettings = { ...settings, nextSalesNo: no + 1, nextJournalNo: jeNo + 1 };
    const nextJournal = [...journalEntries, je];
    const nextSales = [...salesInvoices, invoice];

    setSalesInvoices(nextSales); setProducts(nextProducts); setJournalEntries(nextJournal); setSettings(nextSettings);
    persist(STORAGE_KEYS.sales, nextSales);
    persist(STORAGE_KEYS.products, nextProducts);
    persist(STORAGE_KEYS.journal, nextJournal);
    persist(STORAGE_KEYS.settings, nextSettings);
    showToast(`تم حفظ فاتورة المبيعات #${no}`);
  }

  /* ---------- Purchase Invoice ---------- */
  function addPurchaseInvoicesBatch(dataArray) {
    let no = settings.nextPurchaseNo;
    let jeNo = settings.nextJournalNo;
    const newInvoices = [];
    const newJournalEntries = [];
    let workingProducts = products.map(p => ({ ...p }));

    dataArray.forEach(data => {
      const totals = computeInvoiceTotals(data.items, data.discount, data.applyTax, settings);
      const invId = uid('pinv');

      const lines = [];
      lines.push({ accountId: getAccountByKind(accounts, 'inventory').id, debit: totals.afterDiscount, credit: 0 });
      if (totals.tax > 0) lines.push({ accountId: getAccountByKind(accounts, 'vat_in').id, debit: totals.tax, credit: 0 });
      if (data.paymentMethod === 'credit') {
        lines.push({ accountId: getAccountByKind(accounts, 'ap').id, debit: 0, credit: totals.total });
      } else {
        const cashAcc = resolveTreasuryAccountId(data.paymentMethod, accounts);
        lines.push({ accountId: cashAcc, debit: 0, credit: totals.total });
      }
      const je = makeEntry(jeNo, data.date, `فاتورة مشتريات #${no}`, lines, 'purchase', invId);

      const invoice = {
        id: invId, no, date: data.date, supplierId: data.supplierId, items: data.items,
        discount: data.discount, subtotal: totals.subtotal, tax: totals.tax, total: totals.total,
        paymentMethod: data.paymentMethod, paidAmount: data.paymentMethod === 'credit' ? 0 : totals.total,
        journalId: je.id,
      };

      workingProducts = workingProducts.map(p => {
        const item = data.items.find(it => it.productId === p.id);
        return item ? { ...p, qty: Number(p.qty) + Number(item.qty), costPrice: Number(item.price) } : p;
      });

      newInvoices.push(invoice);
      newJournalEntries.push(je);
      no += 1;
      jeNo += 1;
    });

    const nextSettings = { ...settings, nextPurchaseNo: no, nextJournalNo: jeNo };
    const nextJournal = [...journalEntries, ...newJournalEntries];
    const nextPurchases = [...purchaseInvoices, ...newInvoices];

    setPurchaseInvoices(nextPurchases); setProducts(workingProducts); setJournalEntries(nextJournal); setSettings(nextSettings);
    persist(STORAGE_KEYS.purchases, nextPurchases);
    persist(STORAGE_KEYS.products, workingProducts);
    persist(STORAGE_KEYS.journal, nextJournal);
    persist(STORAGE_KEYS.settings, nextSettings);
    showToast(newInvoices.length > 1 ? `تم حفظ ${newInvoices.length} فواتير مشتريات` : `تم حفظ فاتورة المشتريات #${newInvoices[0].no}`);
  }

  /* ---------- Expenses ---------- */
  function addExpense(data) {
    const jeNo = settings.nextJournalNo;
    const cashAcc = resolveTreasuryAccountId(data.paymentMethod, accounts);
    const lines = [
      { accountId: data.accountId, debit: data.amount, credit: 0 },
      { accountId: cashAcc, debit: 0, credit: data.amount },
    ];
    const je = makeEntry(jeNo, data.date, data.description || 'مصروف', lines, 'expense', null);
    const expense = { id: uid('exp'), ...data, journalId: je.id };

    const nextSettings = { ...settings, nextJournalNo: jeNo + 1 };
    const nextJournal = [...journalEntries, je];
    const nextExpenses = [...expenses, expense];

    setExpenses(nextExpenses); setJournalEntries(nextJournal); setSettings(nextSettings);
    persist(STORAGE_KEYS.expenses, nextExpenses);
    persist(STORAGE_KEYS.journal, nextJournal);
    persist(STORAGE_KEYS.settings, nextSettings);
    showToast('تم حفظ المصروف');
  }

  /* ---------- Payments ---------- */
  function recordPayment(type, contact, data) {
    const jeNo = settings.nextJournalNo;
    const cashAcc = resolveTreasuryAccountId(data.method, accounts);
    let lines, je, nextSettings, nextJournal;

    if (type === 'customer') {
      lines = [
        { accountId: cashAcc, debit: data.amount, credit: 0 },
        { accountId: getAccountByKind(accounts, 'ar').id, debit: 0, credit: data.amount },
      ];
      je = makeEntry(jeNo, data.date, `تحصيل دفعة من ${contact.name}`, lines, 'payment_in', data.invoiceId);
      const nextSales = salesInvoices.map(inv => inv.id === data.invoiceId ? { ...inv, paidAmount: inv.paidAmount + data.amount } : inv);
      setSalesInvoices(nextSales); persist(STORAGE_KEYS.sales, nextSales);
    } else {
      lines = [
        { accountId: getAccountByKind(accounts, 'ap').id, debit: data.amount, credit: 0 },
        { accountId: cashAcc, debit: 0, credit: data.amount },
      ];
      je = makeEntry(jeNo, data.date, `سداد دفعة إلى ${contact.name}`, lines, 'payment_out', data.invoiceId);
      const nextPurchases = purchaseInvoices.map(inv => inv.id === data.invoiceId ? { ...inv, paidAmount: inv.paidAmount + data.amount } : inv);
      setPurchaseInvoices(nextPurchases); persist(STORAGE_KEYS.purchases, nextPurchases);
    }
    nextSettings = { ...settings, nextJournalNo: jeNo + 1 };
    nextJournal = [...journalEntries, je];
    setJournalEntries(nextJournal); setSettings(nextSettings);
    persist(STORAGE_KEYS.journal, nextJournal);
    persist(STORAGE_KEYS.settings, nextSettings);

    const paymentRecord = {
      id: uid('pay'), type, contactId: contact.id, invoiceId: data.invoiceId,
      amount: data.amount, method: data.method, date: data.date, journalId: je.id,
    };
    const nextPayments = [...payments, paymentRecord];
    setPayments(nextPayments); persist(STORAGE_KEYS.payments, nextPayments);

    showToast('تم تسجيل الدفعة بنجاح');
  }

  /* ---------- Reps (Distributors) ---------- */
  /* ---------- Workers / Employees ---------- */
  function addWorker(form) {
    const worker = { id: uid('wrk'), ...form };
    const next = [...workers, worker];
    setWorkers(next); persist(STORAGE_KEYS.workers, next);
    showToast('تمت إضافة العامل بنجاح');
  }
  function updateWorker(updated) {
    const next = workers.map(w => w.id === updated.id ? updated : w);
    setWorkers(next); persist(STORAGE_KEYS.workers, next);
    showToast('تم تحديث بيانات العامل');
  }
  function deleteWorker(id) {
    const next = workers.filter(w => w.id !== id);
    setWorkers(next); persist(STORAGE_KEYS.workers, next);
    showToast('تم الحذف');
  }

  function addRep(form) {
    const rep = { id: uid('rep'), no: settings.nextRepNo, name: form.name.trim(), phone: form.phone || '', commissionPercent: Number(form.commissionPercent) };
    const next = [...reps, rep];
    const nextSettings = { ...settings, nextRepNo: settings.nextRepNo + 1 };
    setReps(next); setSettings(nextSettings);
    persist(STORAGE_KEYS.reps, next); persist(STORAGE_KEYS.settings, nextSettings);
    showToast('تمت إضافة المندوب');
  }
  function updateRep(updated) {
    const next = reps.map(r => r.id === updated.id ? updated : r);
    setReps(next); persist(STORAGE_KEYS.reps, next);
    showToast('تم تحديث بيانات المندوب');
  }
  function deleteRep(id) {
    const next = reps.filter(r => r.id !== id);
    setReps(next); persist(STORAGE_KEYS.reps, next);
    showToast('تم حذف المندوب');
  }

  /* ---------- Recurring Invoice Templates ---------- */
  function addRecurringTemplate(form) {
    const tpl = { id: uid('rec'), ...form, active: true };
    const next = [...recurringTemplates, tpl];
    setRecurringTemplates(next); persist(STORAGE_KEYS.recurring, next);
    showToast('تم إنشاء الفاتورة الدورية');
  }
  function toggleRecurringTemplate(id) {
    const next = recurringTemplates.map(t => t.id === id ? { ...t, active: !t.active } : t);
    setRecurringTemplates(next); persist(STORAGE_KEYS.recurring, next);
  }
  function deleteRecurringTemplate(id) {
    const next = recurringTemplates.filter(t => t.id !== id);
    setRecurringTemplates(next); persist(STORAGE_KEYS.recurring, next);
    showToast('تم حذف الفاتورة الدورية');
  }

  /* ---------- Manual Journal ---------- */
  function addManualJournal(data) {
    const jeNo = settings.nextJournalNo;
    const je = makeEntry(jeNo, data.date, data.description, data.lines, 'manual', null);
    const nextJournal = [...journalEntries, je];
    const nextSettings = { ...settings, nextJournalNo: jeNo + 1 };
    setJournalEntries(nextJournal); setSettings(nextSettings);
    persist(STORAGE_KEYS.journal, nextJournal);
    persist(STORAGE_KEYS.settings, nextSettings);
    showToast('تم حفظ القيد');
  }

  /* ---------- Settings / Reset ---------- */
  function saveSettings(form) {
    setSettings(form); persist(STORAGE_KEYS.settings, form);
    showToast('تم حفظ الإعدادات');
  }
  async function resetAll() {
    const freshAccounts = DEFAULT_ACCOUNTS.map(a => ({ ...a }));
    setSettings(DEFAULT_SETTINGS); setAccounts(freshAccounts); setCustomers([]); setSuppliers([]);
    setProducts([]); setSalesInvoices([]); setPurchaseInvoices([]); setExpenses([]); setJournalEntries([]);
    setReps([]); setRecurringTemplates([]); setPayments([]); setWorkers([]);
    await Promise.all([
      saveKey(STORAGE_KEYS.settings, DEFAULT_SETTINGS),
      saveKey(STORAGE_KEYS.accounts, freshAccounts),
      saveKey(STORAGE_KEYS.customers, []),
      saveKey(STORAGE_KEYS.suppliers, []),
      saveKey(STORAGE_KEYS.products, []),
      saveKey(STORAGE_KEYS.sales, []),
      saveKey(STORAGE_KEYS.purchases, []),
      saveKey(STORAGE_KEYS.expenses, []),
      saveKey(STORAGE_KEYS.journal, []),
      saveKey(STORAGE_KEYS.reps, []),
      saveKey(STORAGE_KEYS.recurring, []),
      saveKey(STORAGE_KEYS.payments, []),
      saveKey(STORAGE_KEYS.workers, []),
    ]);
    setActiveTab('dashboard');
    showToast('تم حذف جميع البيانات');
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 font-body" dir="rtl">
        <div className="flex flex-col items-center gap-3 text-stone-500">
          <Loader2 size={28} className="animate-spin" />
          <p className="text-sm">جارِ تحميل النظام المحاسبي...</p>
        </div>
      </div>
    );
  }

  const expenseAccounts = accounts.filter(a => a.type === 'expense' && a.kind !== 'cogs');

  return (
    <div className="min-h-screen bg-stone-50 font-body flex" dir="rtl">
      <Sidebar active={activeTab} onNavigate={setActiveTab} companyName={settings.companyName} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar title={VIEW_TITLES[activeTab]} setMobileOpen={setMobileOpen} />
        <main className="flex-1 p-4 md:p-6">
          {activeTab === 'dashboard' && (
            <DashboardView
              data={{ accounts, journalEntries, salesInvoices, purchaseInvoices, products, customers, suppliers }}
              currency={settings.currency}
              onNavigate={setActiveTab}
            />
          )}
          {activeTab === 'treasury' && (
            <TreasuryView
              accounts={accounts} journalEntries={journalEntries} currency={settings.currency}
              onAddAccount={addTreasuryAccount} onDeleteAccount={deleteTreasuryAccount} onAddTransaction={addTreasuryTransaction}
            />
          )}
          {activeTab === 'accounts' && (
            <AccountsView accounts={accounts} journalEntries={journalEntries} currency={settings.currency} onAdd={addAccount} onDelete={deleteAccount} />
          )}
          {activeTab === 'customers' && (
            <ContactsView
              type="customer" contacts={customers} invoices={salesInvoices} currency={settings.currency} settings={settings} accounts={accounts}
              onAdd={(f) => addContact('customer', f)} onUpdate={(c) => updateContact('customer', c)} onDelete={(id) => deleteContact('customer', id)}
              onRecordPayment={(contact, data) => recordPayment('customer', contact, data)}
            />
          )}
          {activeTab === 'suppliers' && (
            <ContactsView
              type="supplier" contacts={suppliers} invoices={purchaseInvoices} currency={settings.currency} accounts={accounts}
              onAdd={(f) => addContact('supplier', f)} onUpdate={(c) => updateContact('supplier', c)} onDelete={(id) => deleteContact('supplier', id)}
              onRecordPayment={(contact, data) => recordPayment('supplier', contact, data)}
            />
          )}
          {activeTab === 'workers' && (
            <WorkersView workers={workers} currency={settings.currency} onAdd={addWorker} onUpdate={updateWorker} onDelete={deleteWorker} />
          )}
          {activeTab === 'statement' && (
            <StatementView
              customers={customers} suppliers={suppliers} salesInvoices={salesInvoices}
              purchaseInvoices={purchaseInvoices} payments={payments} accounts={accounts} settings={settings}
            />
          )}
          {activeTab === 'products' && (
            <ProductsView products={products} currency={settings.currency} onAdd={addProduct} onUpdate={updateProduct} onDelete={deleteProduct} usedProductIds={usedProductIds} />
          )}
          {activeTab === 'sales' && (
            <SalesInvoicesView invoices={salesInvoices} customers={customers} products={products} reps={reps} accounts={accounts} settings={settings} onAdd={addSalesInvoice} />
          )}
          {activeTab === 'purchases' && (
            <PurchaseInvoicesView invoices={purchaseInvoices} suppliers={suppliers} products={products} accounts={accounts} settings={settings} onAdd={addPurchaseInvoicesBatch} />
          )}
          {activeTab === 'recurring' && (
            <RecurringInvoicesView
              templates={recurringTemplates} customers={customers} products={products} reps={reps} accounts={accounts} settings={settings}
              onAdd={addRecurringTemplate} onToggle={toggleRecurringTemplate} onDelete={deleteRecurringTemplate}
            />
          )}
          {activeTab === 'reminders' && (
            <RemindersView salesInvoices={salesInvoices} customers={customers} settings={settings} showToast={showToast} />
          )}
          {activeTab === 'forecast' && (
            <ForecastView products={products} salesInvoices={salesInvoices} currency={settings.currency} />
          )}
          {activeTab === 'reps' && (
            <RepsView reps={reps} salesInvoices={salesInvoices} currency={settings.currency} onAdd={addRep} onUpdate={updateRep} onDelete={deleteRep} />
          )}
          {activeTab === 'expenses' && (
            <ExpensesView expenses={expenses} accounts={accounts} settings={settings} onAdd={addExpense} />
          )}
          {activeTab === 'journal' && (
            <JournalView journalEntries={journalEntries} accounts={accounts} currency={settings.currency} onAddManual={addManualJournal} />
          )}
          {activeTab === 'reports' && (
            <ReportsView accounts={accounts} journalEntries={journalEntries} products={products} salesInvoices={salesInvoices} purchaseInvoices={purchaseInvoices} currency={settings.currency} />
          )}
          {activeTab === 'settings' && (
            <SettingsView settings={settings} onSave={saveSettings} onResetAll={resetAll} />
          )}
        </main>
      </div>
      <Toast toast={toast} />
    </div>
  );
}
