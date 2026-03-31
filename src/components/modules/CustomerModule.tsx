import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  User, 
  Phone, 
  MapPin, 
  FileText, 
  Download, 
  Printer, 
  Loader2,
  X,
  Save,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import * as reactWindow from 'react-window';
const List = (reactWindow as any).FixedSizeList;
import { useLiveQuery } from 'dexie-react-hooks';
import { Customer, AppData, PrintData } from '../../types';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { ConfirmModal } from '../ui/ConfirmModal';
import { cn } from '../../lib/utils';
import { useDebounce } from '../../hooks/useDebounce';
import { db as local } from '../../lib/db';
import { syncService } from '../../services/SyncService';

const PAGE_SIZE = 50;

export const CustomerModule = React.memo(({ data: globalData, onPrint }: { data: AppData, onPrint: (data: PrintData) => void }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', phone: '', address: '', taxPercentage: 0 });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);

  // Use Dexie's useLiveQuery for reactive local data
  const customers = useLiveQuery(async () => {
    let collection = local.customers.orderBy('name');
    
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      return await local.customers
        .filter(c => 
          c.name.toLowerCase().includes(lowerSearch) || 
          c.phone.includes(searchTerm)
        )
        .limit(limit)
        .toArray();
    }
    
    return await collection.limit(limit).toArray();
  }, [searchTerm, limit]);

  const selectedCustomer = useLiveQuery(
    () => selectedCustomerId ? local.customers.get(selectedCustomerId) : null,
    [selectedCustomerId]
  );

  const debouncedFormData = useDebounce(formData, 1500);
  const initialModalLoadRef = useRef(true);
  const lastSavedFormDataRef = useRef<any>(null);

  useEffect(() => {
    if (!isAdding) {
      initialModalLoadRef.current = true;
      lastSavedFormDataRef.current = null;
      return;
    }

    if (initialModalLoadRef.current) {
      initialModalLoadRef.current = false;
      lastSavedFormDataRef.current = formData;
      return;
    }

    if (!debouncedFormData.name.trim()) return;

    const hasChanged = JSON.stringify(debouncedFormData) !== JSON.stringify(lastSavedFormDataRef.current);
    
    if (hasChanged) {
      handleAutoSave(debouncedFormData);
    }
  }, [debouncedFormData, isAdding]);

  const handleAutoSave = async (data: any) => {
    setIsAutoSaving(true);
    try {
      const id = editingId || crypto.randomUUID();
      const customerData: Customer = {
        id,
        ...data,
        updatedAt: new Date().toISOString(),
        ledger: selectedCustomer?.ledger || []
      };

      await local.customers.put(customerData);
      await syncService.queueChange('customers', 'SET', customerData);
      
      if (!editingId) setEditingId(id);
      lastSavedFormDataRef.current = data;
      setLastSaved(new Date());
    } catch (error) {
      console.error('Auto-save failed:', error);
    } finally {
      setTimeout(() => setIsAutoSaving(false), 1000);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleAutoSave(formData);
    setIsAdding(false);
    setEditingId(null);
    setFormData({ name: '', phone: '', address: '', taxPercentage: 0 });
  };

  const handleEdit = (customer: Customer) => {
    setFormData({ 
      name: customer.name, 
      phone: customer.phone, 
      address: customer.address, 
      taxPercentage: customer.taxPercentage || 0 
    });
    setEditingId(customer.id);
    setIsAdding(true);
  };

  const confirmDelete = async () => {
    if (deleteId) {
      try {
        await local.customers.delete(deleteId);
        await syncService.queueChange('customers', 'DELETE', { id: deleteId });
        if (selectedCustomerId === deleteId) setSelectedCustomerId(null);
        setDeleteId(null);
      } catch (error) {
        console.error('Delete failed:', error);
      }
    }
  };

  const handlePrintLedger = () => {
    if (!selectedCustomer) return;

    const printData: PrintData = {
      companyDetails: globalData.companyDetails,
      title: 'Customer Ledger',
      dateRange: `Customer: ${selectedCustomer.name} | Generated on: ${format(new Date(), 'MMM dd, yyyy')}`,
      columns: [
        { header: 'Date', key: 'date', width: '15%' },
        { header: 'Description', key: 'description', width: '40%' },
        { header: 'Debit (+)', key: 'debit', width: '15%', align: 'right' },
        { header: 'Credit (-)', key: 'credit', width: '15%', align: 'right' },
        { header: 'Balance', key: 'balance', width: '15%', align: 'right' }
      ],
      data: (selectedCustomer.ledger || []).map(entry => ({
        date: format(new Date(entry.date), 'MMM dd, yyyy'),
        description: entry.description,
        debit: `₹${entry.debit.toLocaleString()}`,
        credit: `₹${entry.credit.toLocaleString()}`,
        balance: `₹${entry.balance.toLocaleString()}`
      })),
      totals: [
        { label: 'Current Balance', value: `₹${(selectedCustomer.ledger?.[selectedCustomer.ledger.length - 1]?.balance || 0).toLocaleString()}`, isBold: true }
      ]
    };

    onPrint(printData);
  };

  const CustomerRow = ({ index, style }: { index: number, style: React.CSSProperties }) => {
    const customer = customers?.[index];
    if (!customer) return null;

    return (
      <div 
        style={style}
        className={cn(
          'px-4 py-3 cursor-pointer transition-colors hover:bg-gray-50 border-b border-gray-50 flex flex-col justify-center',
          selectedCustomerId === customer.id && 'bg-indigo-50 border-l-4 border-indigo-600'
        )}
        onClick={() => setSelectedCustomerId(customer.id)}
      >
        <div className="flex items-center justify-between mb-0.5">
          <h3 className="font-bold text-gray-900 truncate pr-2">{customer.name}</h3>
          <span className="text-xs font-black text-indigo-600 whitespace-nowrap">
            ₹{(customer.ledger?.[customer.ledger.length - 1]?.balance || 0).toLocaleString()}
          </span>
        </div>
        <p className="text-[10px] text-gray-500 flex items-center gap-1">
          <Phone size={10} /> {customer.phone}
        </p>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 h-full flex flex-col">
      <ConfirmModal 
        isOpen={!!deleteId} 
        onClose={() => setDeleteId(null)} 
        onConfirm={confirmDelete}
        title="Delete Customer"
        message="Are you sure you want to delete this customer? This will also remove their entire ledger history."
      />
      
      <div className="flex items-center justify-between no-print shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
          <p className="text-sm text-gray-500">Manage clients and track their ledgers</p>
        </div>
        <Button onClick={() => setIsAdding(true)} className="gap-2">
          <Plus size={18} />
          Add Customer
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 no-print flex-1 min-h-0">
        <Card className="lg:col-span-1 p-0 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-gray-100 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input 
                type="text" 
                placeholder="Search customers..." 
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          
          <div className="flex-1 min-h-0">
            {!customers ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="animate-spin text-indigo-600" />
              </div>
            ) : customers.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-sm">No customers found</div>
            ) : (
              <List
                height={500}
                itemCount={customers.length}
                itemSize={65}
                width="100%"
                onItemsRendered={({ visibleStopIndex }) => {
                  if (visibleStopIndex >= customers.length - 5 && customers.length >= limit) {
                    setLimit(prev => prev + PAGE_SIZE);
                  }
                }}
              >
                {CustomerRow}
              </List>
            )}
          </div>
        </Card>

        <Card className="lg:col-span-2 p-6 overflow-y-auto custom-scrollbar">
          {selectedCustomer ? (
            <div className="space-y-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-indigo-100 flex items-center justify-center text-indigo-600">
                    <User size={32} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-gray-900">{selectedCustomer.name}</h2>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-gray-500 font-medium">
                      <span className="flex items-center gap-1"><Phone size={14} /> {selectedCustomer.phone}</span>
                      <span className="flex items-center gap-1"><MapPin size={14} /> {selectedCustomer.address}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => handleEdit(selectedCustomer)} className="p-2">
                    <Edit2 size={16} />
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setDeleteId(selectedCustomer.id)} className="p-2 text-red-600 hover:bg-red-50">
                    <Trash2 size={16} />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Current Balance</p>
                  <p className="text-xl font-black text-indigo-600">₹{(selectedCustomer.ledger?.[selectedCustomer.ledger.length - 1]?.balance || 0).toLocaleString()}</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Total Sales</p>
                  <p className="text-xl font-black text-gray-900">₹{globalData.sales.filter(s => s.customerId === selectedCustomer.id).reduce((sum, s) => sum + s.totalAmount, 0).toLocaleString()}</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Tax Rate</p>
                  <p className="text-xl font-black text-gray-900">{selectedCustomer.taxPercentage || 0}%</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-900">Ledger History</h3>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={handlePrintLedger} className="gap-2">
                      <Printer size={14} /> Print
                    </Button>
                  </div>
                </div>
                <div className="overflow-hidden border border-gray-100 rounded-xl">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-[10px] uppercase font-bold tracking-widest">
                      <tr>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Description</th>
                        <th className="px-4 py-3 text-right">Debit (+)</th>
                        <th className="px-4 py-3 text-right">Credit (-)</th>
                        <th className="px-4 py-3 text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {(selectedCustomer.ledger || []).map((entry) => (
                        <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-gray-500">{format(new Date(entry.date), 'MMM dd')}</td>
                          <td className="px-4 py-3 font-medium text-gray-900">{entry.description}</td>
                          <td className="px-4 py-3 text-right font-bold text-red-600">
                            {entry.debit > 0 ? `₹${entry.debit.toLocaleString()}` : '-'}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-green-600">
                            {entry.credit > 0 ? `₹${entry.credit.toLocaleString()}` : '-'}
                          </td>
                          <td className="px-4 py-3 text-right font-black text-gray-900">₹{entry.balance.toLocaleString()}</td>
                        </tr>
                      ))}
                      {(selectedCustomer.ledger || []).length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-gray-400 italic">No ledger entries found</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center py-20">
              <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-4">
                <User className="text-indigo-200" size={40} />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Select a customer</h3>
              <p className="text-sm text-gray-500 max-w-xs">Choose a customer from the list to view their full profile and ledger history.</p>
            </div>
          )}
        </Card>
      </div>

      <Modal isOpen={isAdding} onClose={() => setIsAdding(false)} title={editingId ? 'Edit Customer' : 'Add New Customer'}>
        <div className="mb-4 flex items-center justify-between bg-indigo-50/50 p-3 rounded-xl border border-indigo-100">
          <div className="flex items-center gap-2">
            <AlertCircle size={14} className="text-indigo-600" />
            <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Auto-save enabled</span>
          </div>
          {isAutoSaving ? (
            <div className="flex items-center gap-2 text-indigo-600 animate-pulse">
              <Loader2 size={12} className="animate-spin" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Saving...</span>
            </div>
          ) : lastSaved ? (
            <div className="flex items-center gap-1 text-green-600">
              <CheckCircle2 size={12} />
              <span className="text-[10px] font-bold uppercase tracking-widest">Saved {format(lastSaved, 'HH:mm:ss')}</span>
            </div>
          ) : null}
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Customer Name" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
          <Input label="Phone Number" required value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
          <Input label="Address" required value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
          <Input label="Tax Percentage (%)" type="number" value={formData.taxPercentage} onChange={(e) => setFormData({ ...formData, taxPercentage: Number(e.target.value) })} />
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" type="button" onClick={() => setIsAdding(false)}>Cancel</Button>
            <Button type="submit" className="gap-2">
              <Save size={18} />
              Save & Close
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
});

export default CustomerModule;
