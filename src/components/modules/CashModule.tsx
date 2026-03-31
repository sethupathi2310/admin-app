import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Plus, Trash2, Printer, Download, Loader2, Search, Save, Wallet, Landmark } from 'lucide-react';
import { format } from 'date-fns';
import * as reactWindow from 'react-window';
const List = (reactWindow as any).FixedSizeList;
import { useLiveQuery } from 'dexie-react-hooks';
import { CompanyDetails, PrintData, CashTransaction, Customer, Supplier } from '../../types';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { ConfirmModal } from '../ui/ConfirmModal';
import { cn } from '../../lib/utils';
import { db as local } from '../../lib/db';
import { syncService } from '../../services/SyncService';
import { useDebounce } from '../../hooks/useDebounce';

const PAGE_SIZE = 50;

interface CashModuleProps {
  companyDetails: CompanyDetails;
  onPrint: (data: PrintData) => void;
}

export const CashModule = React.memo(({ companyDetails, onPrint }: CashModuleProps) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<any>({
    date: format(new Date(), 'yyyy-MM-dd'),
    type: 'IN',
    mode: 'CASH',
    amount: 0,
    description: '',
    customerId: '',
    supplierId: ''
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [isAutoSaving, setIsAutoSaving] = useState(false);

  const debouncedFormData = useDebounce(formData, 2000);
  const lastSavedFormDataRef = useRef<any>(null);

  // Fetch data from local DB
  const transactions = useLiveQuery(async () => {
    let collection = local.cash.orderBy('date').reverse();
    if (searchTerm) {
      return await local.cash
        .filter(t => t.description.toLowerCase().includes(searchTerm.toLowerCase()))
        .limit(limit)
        .toArray();
    }
    return await collection.limit(limit).toArray();
  }, [searchTerm, limit]);

  const customers = useLiveQuery(() => local.customers.toArray()) || [];
  const suppliers = useLiveQuery(() => local.suppliers.toArray()) || [];

  const cashInHand = useMemo(() => {
    if (!transactions) return 0;
    return transactions
      .filter(t => t.mode === 'CASH')
      .reduce((sum, t) => sum + (t.type === 'IN' ? t.amount : -t.amount), 0);
  }, [transactions]);

  const bankBalance = useMemo(() => {
    if (!transactions) return 0;
    return transactions
      .filter(t => t.mode === 'BANK')
      .reduce((sum, t) => sum + (t.type === 'IN' ? t.amount : -t.amount), 0);
  }, [transactions]);

  // Auto-save logic
  useEffect(() => {
    if (!isAdding || debouncedFormData.amount <= 0) return;

    const hasChanged = JSON.stringify(debouncedFormData) !== JSON.stringify(lastSavedFormDataRef.current);
    
    if (hasChanged) {
      handleSave(true);
    }
  }, [debouncedFormData, isAdding]);

  const handleSave = async (isAuto = false) => {
    if (isAuto) setIsAutoSaving(true);
    
    const transactionId = editingId || crypto.randomUUID();
    const newTransaction: CashTransaction = {
      id: transactionId,
      ...formData,
      customerId: formData.customerId || undefined,
      supplierId: formData.supplierId || undefined,
      updatedAt: new Date().toISOString()
    };

    try {
      await local.transaction('rw', [local.cash, local.customers, local.suppliers], async () => {
        // 1. Save Transaction
        await local.cash.put(newTransaction);
        await syncService.queueChange('cash', 'SET', newTransaction);

        // 2. Update Customer Ledger if applicable
        if (formData.customerId) {
          const customer = await local.customers.get(formData.customerId);
          if (customer) {
            const newLedger = [...(customer.ledger || [])];
            const existingEntryIndex = newLedger.findIndex(e => e.id === `cash-${transactionId}`);
            const newEntry = {
              id: `cash-${transactionId}`,
              date: formData.date,
              description: formData.description || `Cash ${formData.type}`,
              credit: formData.type === 'OUT' ? formData.amount : 0,
              debit: formData.type === 'IN' ? formData.amount : 0
            };
            if (existingEntryIndex >= 0) newLedger[existingEntryIndex] = newEntry;
            else newLedger.push(newEntry);
            
            const updatedCustomer = { ...customer, ledger: newLedger };
            await local.customers.put(updatedCustomer);
            await syncService.queueChange('customers', 'SET', updatedCustomer);
          }
        }

        // 3. Update Supplier Ledger if applicable
        if (formData.supplierId) {
          const supplier = await local.suppliers.get(formData.supplierId);
          if (supplier) {
            const newLedger = [...(supplier.ledger || [])];
            const existingEntryIndex = newLedger.findIndex(e => e.id === `cash-${transactionId}`);
            const newEntry = {
              id: `cash-${transactionId}`,
              date: formData.date,
              description: formData.description || `Cash ${formData.type}`,
              credit: formData.type === 'IN' ? formData.amount : 0,
              debit: formData.type === 'OUT' ? formData.amount : 0
            };
            if (existingEntryIndex >= 0) newLedger[existingEntryIndex] = newEntry;
            else newLedger.push(newEntry);
            
            const updatedSupplier = { ...supplier, ledger: newLedger };
            await local.suppliers.put(updatedSupplier);
            await syncService.queueChange('suppliers', 'SET', updatedSupplier);
          }
        }
      });

      if (!editingId) setEditingId(transactionId);
      lastSavedFormDataRef.current = formData;
      if (isAuto) setTimeout(() => setIsAutoSaving(false), 2000);
    } catch (error) {
      console.error('Failed to save transaction:', error);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    const txToDelete = await local.cash.get(deleteId);
    if (!txToDelete) return;

    await local.transaction('rw', [local.cash, local.customers, local.suppliers], async () => {
      // 1. Revert Ledger
      if (txToDelete.customerId) {
        const customer = await local.customers.get(txToDelete.customerId);
        if (customer) {
          const updatedCustomer = {
            ...customer,
            ledger: (customer.ledger || []).filter(entry => entry.id !== `cash-${deleteId}`)
          };
          await local.customers.put(updatedCustomer);
          await syncService.queueChange('customers', 'SET', updatedCustomer);
        }
      }
      if (txToDelete.supplierId) {
        const supplier = await local.suppliers.get(txToDelete.supplierId);
        if (supplier) {
          const updatedSupplier = {
            ...supplier,
            ledger: (supplier.ledger || []).filter(entry => entry.id !== `cash-${deleteId}`)
          };
          await local.suppliers.put(updatedSupplier);
          await syncService.queueChange('suppliers', 'SET', updatedSupplier);
        }
      }

      // 2. Delete Transaction
      await local.cash.delete(deleteId);
      await syncService.queueChange('cash', 'DELETE', { id: deleteId });
    });

    setDeleteId(null);
  };

  const TransactionRow = ({ index, style }: { index: number, style: React.CSSProperties }) => {
    const t = transactions?.[index];
    if (!t) return null;

    const customer = customers.find(c => c.id === t.customerId);
    const supplier = suppliers.find(s => s.id === t.supplierId);

    return (
      <div style={style} className="flex items-center px-6 py-4 border-b border-gray-100 hover:bg-gray-50 transition-colors">
        <div className="w-32 text-sm text-gray-600">{format(new Date(t.date), 'MMM dd, yyyy')}</div>
        <div className="w-24">
          <span className={cn(
            'px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest',
            t.type === 'IN' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          )}>
            {t.type}
          </span>
        </div>
        <div className="w-24 text-sm font-medium text-gray-600">{t.mode}</div>
        <div className="flex-1 min-w-0">
          {t.customerId && <p className="text-sm font-medium text-indigo-600 truncate">Cust: {customer?.name}</p>}
          {t.supplierId && <p className="text-sm font-medium text-amber-600 truncate">Supp: {supplier?.name}</p>}
          {!t.customerId && !t.supplierId && <p className="text-sm text-gray-400">-</p>}
        </div>
        <div className={cn('w-32 text-sm font-bold text-right', t.type === 'IN' ? 'text-green-600' : 'text-red-600')}>
          {t.type === 'IN' ? '+' : '-'}₹{t.amount.toLocaleString()}
        </div>
        <div className="w-48 px-4 text-xs text-gray-500 truncate">{t.description}</div>
        <div className="w-16 flex justify-end">
          <button onClick={() => setDeleteId(t.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 h-full flex flex-col">
      <ConfirmModal 
        isOpen={!!deleteId} 
        onClose={() => setDeleteId(null)} 
        onConfirm={confirmDelete}
        title="Delete Transaction"
        message="Are you sure you want to delete this cash transaction?"
      />
      
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cash Management</h1>
          <p className="text-sm text-gray-500">Monitor your cash flow and bank balances</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={() => {}} className="gap-2">
            <Printer size={18} /> Print
          </Button>
          <Button onClick={() => setIsAdding(true)} className="gap-2">
            <Plus size={18} /> New Transaction
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 shrink-0">
        <Card className="bg-gradient-to-br from-indigo-600 to-indigo-700 text-white border-none shadow-lg shadow-indigo-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-white/10 rounded-lg">
              <Wallet size={20} className="text-indigo-100" />
            </div>
            <p className="text-indigo-100 text-sm font-medium">Cash in Hand</p>
          </div>
          <p className="text-3xl font-bold">₹{cashInHand.toLocaleString()}</p>
        </Card>
        <Card className="bg-gradient-to-br from-blue-600 to-blue-700 text-white border-none shadow-lg shadow-blue-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-white/10 rounded-lg">
              <Landmark size={20} className="text-blue-100" />
            </div>
            <p className="text-blue-100 text-sm font-medium">Bank Balance</p>
          </div>
          <p className="text-3xl font-bold">₹{bankBalance.toLocaleString()}</p>
        </Card>
      </div>

      <Card className="p-0 flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-100 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="Search transactions..." 
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center px-6 py-3 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider shrink-0">
          <div className="w-32">Date</div>
          <div className="w-24">Type</div>
          <div className="w-24">Mode</div>
          <div className="flex-1">Related To</div>
          <div className="w-32 text-right">Amount</div>
          <div className="w-48 px-4">Description</div>
          <div className="w-16 text-right">Actions</div>
        </div>

        <div className="flex-1 min-h-0">
          {!transactions ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="animate-spin text-indigo-600" />
            </div>
          ) : transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Wallet className="text-gray-200 mb-4" size={48} />
              <p className="text-gray-500 font-medium">No transactions found</p>
            </div>
          ) : (
            <List
              height={500}
              itemCount={transactions.length}
              itemSize={70}
              width="100%"
              onItemsRendered={({ visibleStopIndex }) => {
                if (visibleStopIndex >= transactions.length - 5 && transactions.length >= limit) {
                  setLimit(prev => prev + PAGE_SIZE);
                }
              }}
            >
              {TransactionRow}
            </List>
          )}
        </div>
      </Card>

      <Modal isOpen={isAdding} onClose={() => setIsAdding(false)} title="New Cash Transaction">
        <div className="mb-4 flex items-center justify-end">
          {isAutoSaving && (
            <div className="flex items-center gap-2 text-indigo-600 animate-pulse">
              <Loader2 size={14} className="animate-spin" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Auto-saving...</span>
            </div>
          )}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); handleSave(); setIsAdding(false); }} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Type</label>
              <select className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })}>
                <option value="IN">Cash IN (Received)</option>
                <option value="OUT">Cash OUT (Paid)</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Mode</label>
              <select className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" value={formData.mode} onChange={(e) => setFormData({ ...formData, mode: e.target.value })}>
                <option value="CASH">CASH</option>
                <option value="BANK">BANK</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Related Customer</label>
              <select 
                className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-sm" 
                value={formData.customerId} 
                onChange={(e) => setFormData({ ...formData, customerId: e.target.value, supplierId: '' })}
              >
                <option value="">None</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Related Supplier</label>
              <select 
                className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-sm" 
                value={formData.supplierId} 
                onChange={(e) => setFormData({ ...formData, supplierId: e.target.value, customerId: '' })}
              >
                <option value="">None</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <Input type="date" label="Date" value={formData.date} onChange={(e: any) => setFormData({ ...formData, date: e.target.value })} />
          <Input type="number" label="Amount" value={formData.amount} onChange={(e: any) => setFormData({ ...formData, amount: Number(e.target.value) })} />
          <Input label="Description" value={formData.description} onChange={(e: any) => setFormData({ ...formData, description: e.target.value })} />
          
          <div className="flex gap-3 pt-4">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setIsAdding(false)}>Cancel</Button>
            <Button type="submit" className="flex-1 gap-2">
              <Save size={18} /> Save Transaction
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
});

export default CashModule;
