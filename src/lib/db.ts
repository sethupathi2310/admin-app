import Dexie, { Table } from 'dexie';
import { Customer, Supplier, Product, Sale, Purchase, CashTransaction, Employee, CompanyDetails } from '../types';

export class LocalDB extends Dexie {
  customers!: Table<Customer>;
  suppliers!: Table<Supplier>;
  products!: Table<Product>;
  employees!: Table<Employee>;
  sales!: Table<Sale>;
  purchases!: Table<Purchase>;
  cash!: Table<CashTransaction>;
  settings!: Table<{ id: string; data: any }>;
  syncQueue!: Table<{ id?: number; collection: string; action: 'SET' | 'DELETE'; data: any; timestamp: number }>;
  syncMetadata!: Table<{ id: string; lastSync: string }>;

  constructor() {
    super('SMCLocalDB');
    this.version(2).stores({
      customers: 'id, name, phone',
      suppliers: 'id, name, phone',
      products: 'id, name, category',
      employees: 'id, name, designation',
      sales: 'id, date, customerId',
      purchases: 'id, date, supplierId',
      cash: 'id, date, type',
      settings: 'id',
      syncQueue: '++id, collection, timestamp',
      syncMetadata: 'id'
    });
  }

  async clearAll() {
    await Promise.all([
      this.customers.clear(),
      this.suppliers.clear(),
      this.products.clear(),
      this.employees.clear(),
      this.sales.clear(),
      this.purchases.clear(),
      this.cash.clear(),
      this.settings.clear(),
      this.syncQueue.clear(),
      this.syncMetadata.clear()
    ]);
  }
}

export const db = new LocalDB();

// 🔥 STEP 2: ADD LOCAL CACHE
let transactionCache: any[] = [];
let isLoaded = false;

export const setTransactions = (data: any[]) => {
  transactionCache = data;
  isLoaded = true;
};

export const getTransactions = () => transactionCache;

export const isDataLoaded = () => isLoaded;
