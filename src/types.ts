import { LucideIcon } from 'lucide-react';

export interface Product {
  id: string;
  name: string;
  category: string;
  unit: string;
  buyingPrice: number;
  sellingPrice: number;
  stock: number;
  includeInPL?: boolean;
  updatedAt?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  taxPercentage: number;
  openingBalance?: number;
  ledger: LedgerEntry[];
  updatedAt?: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  address: string;
  openingBalance?: number;
  ledger: LedgerEntry[];
  updatedAt?: string;
}

export interface LedgerEntry {
  id: string;
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance?: number;
}

export interface Sale {
  id: string;
  customerId: string;
  date: string;
  items: SaleItem[];
  totalAmount: number;
  receivedAmount: number;
  balance: number;
  updatedAt?: string;
}

export interface SaleItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
}

export interface Purchase {
  id: string;
  supplierId: string;
  date: string;
  items: PurchaseItem[];
  totalAmount: number;
  paidAmount: number;
  balance: number;
  updatedAt?: string;
}

export interface PurchaseItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
}

export interface CashTransaction {
  id: string;
  date: string;
  type: 'IN' | 'OUT';
  mode: 'CASH' | 'BANK';
  amount: number;
  description: string;
  customerId?: string;
  supplierId?: string;
  updatedAt?: string;
}

export interface Employee {
  id: string;
  name: string;
  designation: string;
  salary: number;
  phone: string;
  payroll: PayrollEntry[];
  updatedAt?: string;
}

export interface PayrollEntry {
  id: string;
  month: string;
  year: string;
  amount: number;
  date: string;
}

export interface CompanyDetails {
  name: string;
  address: string;
  phone: string;
  email: string;
  gstin: string;
  logo?: string;
  currency?: string;
}

export interface AppData {
  products: Product[];
  customers: Customer[];
  suppliers: Supplier[];
  sales: Sale[];
  purchases: Purchase[];
  cash: CashTransaction[];
  employees: Employee[];
  companyDetails: CompanyDetails;
}

export interface PrintData {
  companyDetails: CompanyDetails;
  title: string;
  subtitle?: string;
  dateRange: string;
  columns: { header: string; key: string; width: string; align?: 'left' | 'right' | 'center' }[];
  data: any[];
  totals?: { label: string; value: string; isBold?: boolean }[];
}
