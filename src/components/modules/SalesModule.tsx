import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Plus, Trash2, Printer, Download, ShoppingCart, Calendar, User, Package, DollarSign, Loader2, Search, Save } from 'lucide-react';
import { format } from 'date-fns';
import * as reactWindow from 'react-window';
const List = (reactWindow as any).FixedSizeList;
import { useLiveQuery } from 'dexie-react-hooks';
import { CompanyDetails, PrintData, Sale, Product, Customer, CashTransaction } from '../../types';
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

interface SalesModuleProps {
  companyDetails: CompanyDetails;
  onPrint: (data: PrintData) => void;
}

export const SalesModule = React.memo(({ companyDetails, onPrint }: SalesModuleProps) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<any>({
    customerId: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    items: [{ productId: '', name: '', quantity: 1, price: 0 }],
    receivedAmount: 0
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [isAutoSaving, setIsAutoSaving] = useState(false);

  const debouncedFormData = useDebounce(formData, 2000);
  const lastSavedFormDataRef = useRef<any>(null);

  // Fetch data from local DB
  const sales = useLiveQuery(async () => {
    let collection = local.sales.orderBy('date').reverse();
    if (searchTerm) {
      // Simple search for now, can be improved
      return await local.sales
        .filter(s => s.id.includes(searchTerm) || s.customerId.includes(searchTerm))
        .limit(limit)
        .toArray();
    }
    return await collection.limit(limit).toArray();
  }, [searchTerm, limit]);

  const customers = useLiveQuery(() => local.customers.toArray()) || [];
  const products = useLiveQuery(() => local.products.toArray()) || [];

  const selectedCustomer = useMemo(() => 
    customers.find(c => c.id === formData.customerId),
    [customers, formData.customerId]
  );

  const taxPercentage = selectedCustomer?.taxPercentage || 0;
  const totalAmount = formData.items.reduce((sum: number, item: any) => sum + (item.quantity * item.price), 0);
  const taxAmount = (totalAmount * taxPercentage) / 100;
  const finalAmount = totalAmount + taxAmount;
  const balance = finalAmount - formData.receivedAmount;

  // Auto-save logic
  useEffect(() => {
    if (!isAdding || !debouncedFormData.customerId || debouncedFormData.items.every((i: any) => !i.productId)) return;

    const hasChanged = JSON.stringify(debouncedFormData) !== JSON.stringify(lastSavedFormDataRef.current);
    
    if (hasChanged) {
      handleSave(true);
    }
  }, [debouncedFormData, isAdding]);

  const handleSave = async (isAuto = false) => {
    if (isAuto) setIsAutoSaving(true);
    
    const saleId = editingId || crypto.randomUUID();
    const newSale: Sale = {
      id: saleId,
      ...formData,
      totalAmount: finalAmount,
      balance,
      updatedAt: new Date().toISOString()
    };

    try {
      await local.transaction('rw', [local.sales, local.products, local.customers, local.cash], async () => {
        // 1. Revert previous stock if editing
        if (editingId) {
          const oldSale = await local.sales.get(editingId);
          if (oldSale) {
            for (const item of oldSale.items) {
              const p = await local.products.get(item.productId);
              if (p) await local.products.update(p.id, { stock: p.stock + item.quantity });
            }
            // Revert ledger and cash too... (simplified for now)
          }
        }

        // 2. Save Sale
        await local.sales.put(newSale);
        await syncService.queueChange('sales', 'SET', newSale);

        // 3. Update Stock
        for (const item of formData.items) {
          const p = await local.products.get(item.productId);
          if (p) {
            const updatedProduct = { ...p, stock: p.stock - item.quantity };
            await local.products.put(updatedProduct);
            await syncService.queueChange('products', 'SET', updatedProduct);
          }
        }

        // 4. Update Customer Ledger
        if (selectedCustomer) {
          const currentBalance = selectedCustomer.ledger?.[selectedCustomer.ledger.length - 1]?.balance || 0;
          const newEntries = [
            {
              id: `sale-${saleId}`,
              date: formData.date,
              description: `Sale Invoice #${saleId}`,
              debit: finalAmount,
              credit: 0,
              balance: currentBalance + finalAmount
            }
          ];
          
          if (formData.receivedAmount > 0) {
            newEntries.push({
              id: `pay-${saleId}`,
              date: formData.date,
              description: `Payment received for Invoice #${saleId}`,
              debit: 0,
              credit: formData.receivedAmount,
              balance: currentBalance + finalAmount - formData.receivedAmount
            });
          }

          const updatedCustomer = {
            ...selectedCustomer,
            ledger: [...(selectedCustomer.ledger || []), ...newEntries]
          };
          await local.customers.put(updatedCustomer);
          await syncService.queueChange('customers', 'SET', updatedCustomer);
        }

        // 5. Cash Transaction
        if (formData.receivedAmount > 0) {
          const cashTx: CashTransaction = {
            id: `sale-pay-${saleId}`,
            date: formData.date,
            type: 'IN',
            mode: 'CASH',
            amount: formData.receivedAmount,
            description: `Payment from ${selectedCustomer?.name} for Invoice #${saleId}`,
            customerId: formData.customerId
          };
          await local.cash.put(cashTx);
          await syncService.queueChange('cash', 'SET', cashTx);
        }
      });

      if (!editingId) setEditingId(saleId);
      lastSavedFormDataRef.current = formData;
      if (isAuto) setTimeout(() => setIsAutoSaving(false), 2000);
    } catch (error) {
      console.error('Failed to save sale:', error);
    }
  };

  const handleAddItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { productId: '', name: '', quantity: 1, price: 0 }]
    });
  };

  const handleRemoveItem = (index: number) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_: any, i: number) => i !== index)
    });
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...formData.items];
    if (field === 'productId') {
      const product = products.find(p => p.id === value);
      if (product) {
        newItems[index] = { ...newItems[index], productId: value, name: product.name, price: product.sellingPrice };
      }
    } else {
      newItems[index] = { ...newItems[index], [field]: value };
    }
    setFormData({ ...formData, items: newItems });
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    const saleToDelete = await local.sales.get(deleteId);
    if (!saleToDelete) return;

    await local.transaction('rw', [local.sales, local.products, local.customers, local.cash], async () => {
      // 1. Revert Stock
      for (const item of saleToDelete.items) {
        const p = await local.products.get(item.productId);
        if (p) {
          const updatedProduct = { ...p, stock: p.stock + item.quantity };
          await local.products.put(updatedProduct);
          await syncService.queueChange('products', 'SET', updatedProduct);
        }
      }

      // 2. Revert Ledger
      const customer = await local.customers.get(saleToDelete.customerId);
      if (customer) {
        const updatedCustomer = {
          ...customer,
          ledger: (customer.ledger || []).filter(entry => 
            entry.id !== `sale-${deleteId}` && entry.id !== `pay-${deleteId}`
          )
        };
        await local.customers.put(updatedCustomer);
        await syncService.queueChange('customers', 'SET', updatedCustomer);
      }

      // 3. Remove Cash
      await local.cash.delete(`sale-pay-${deleteId}`);
      await syncService.queueChange('cash', 'DELETE', { id: `sale-pay-${deleteId}` });

      // 4. Delete Sale
      await local.sales.delete(deleteId);
      await syncService.queueChange('sales', 'DELETE', { id: deleteId });
    });

    setDeleteId(null);
  };

  const SaleRow = ({ index, style }: { index: number, style: React.CSSProperties }) => {
    const sale = sales?.[index];
    if (!sale) return null;

    const customer = customers.find(c => c.id === sale.customerId);

    return (
      <div style={style} className="flex items-center px-6 py-4 border-b border-gray-100 hover:bg-gray-50 transition-colors">
        <div className="w-32 text-sm text-gray-600">{format(new Date(sale.date), 'MMM dd, yyyy')}</div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 truncate">{customer?.name || 'Unknown'}</h3>
          <p className="text-xs text-gray-500">Invoice #{sale.id.slice(-6)}</p>
        </div>
        <div className="w-32 text-sm font-bold text-gray-900">₹{sale.totalAmount.toLocaleString()}</div>
        <div className="w-32 text-sm font-bold text-green-600">₹{sale.receivedAmount.toLocaleString()}</div>
        <div className="w-32 text-sm font-bold text-red-600">₹{sale.balance.toLocaleString()}</div>
        <div className="w-24">
          <span className={cn(
            'px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest',
            sale.balance === 0 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
          )}>
            {sale.balance === 0 ? 'Paid' : 'Pending'}
          </span>
        </div>
        <div className="w-16 flex justify-end">
          <button onClick={() => setDeleteId(sale.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
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
        title="Delete Sale"
        message="Are you sure you want to delete this sale? This will also revert stock and ledger entries."
      />
      
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales</h1>
          <p className="text-sm text-gray-500">Track your revenue and invoices</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={() => {}} className="gap-2">
            <Printer size={18} /> Print
          </Button>
          <Button onClick={() => setIsAdding(true)} className="gap-2">
            <Plus size={18} /> New Sale
          </Button>
        </div>
      </div>

      <Card className="p-0 flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-100 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="Search sales..." 
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center px-6 py-3 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider shrink-0">
          <div className="w-32">Date</div>
          <div className="flex-1">Customer</div>
          <div className="w-32">Total</div>
          <div className="w-32">Received</div>
          <div className="w-32">Balance</div>
          <div className="w-24">Status</div>
          <div className="w-16 text-right">Actions</div>
        </div>

        <div className="flex-1 min-h-0">
          {!sales ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="animate-spin text-indigo-600" />
            </div>
          ) : sales.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <ShoppingCart className="text-gray-200 mb-4" size={48} />
              <p className="text-gray-500 font-medium">No sales recorded yet</p>
            </div>
          ) : (
            <List
              height={500}
              itemCount={sales.length}
              itemSize={70}
              width="100%"
              onItemsRendered={({ visibleStopIndex }) => {
                if (visibleStopIndex >= sales.length - 5 && sales.length >= limit) {
                  setLimit(prev => prev + PAGE_SIZE);
                }
              }}
            >
              {SaleRow}
            </List>
          )}
        </div>
      </Card>

      <Modal isOpen={isAdding} onClose={() => setIsAdding(false)} title="New Sales Invoice" size="lg">
        <div className="mb-4 flex items-center justify-end">
          {isAutoSaving && (
            <div className="flex items-center gap-2 text-indigo-600 animate-pulse">
              <Loader2 size={14} className="animate-spin" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Auto-saving...</span>
            </div>
          )}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); handleSave(); setIsAdding(false); }} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <Select 
              label="Customer" 
              required 
              value={formData.customerId} 
              onChange={(e) => setFormData({ ...formData, customerId: e.target.value })}
              options={customers.map(c => ({ value: c.id, label: c.name }))}
            />
            <Input label="Date" type="date" required value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Items</h4>
              <Button type="button" variant="secondary" size="sm" onClick={handleAddItem} className="gap-1">
                <Plus size={14} /> Add Item
              </Button>
            </div>
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
              {formData.items.map((item: any, index: number) => (
                <div key={index} className="flex items-end gap-3 p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="flex-1">
                    <Select 
                      label="Product" 
                      required 
                      value={item.productId} 
                      onChange={(e) => handleItemChange(index, 'productId', e.target.value)}
                      options={products.map(p => ({ value: p.id, label: `${p.name} (Stock: ${p.stock})` }))}
                    />
                  </div>
                  <div className="w-24">
                    <Input label="Qty" type="number" required value={item.quantity} onChange={(e) => handleItemChange(index, 'quantity', Number(e.target.value))} />
                  </div>
                  <div className="w-32">
                    <Input label="Price" type="number" required value={item.price} onChange={(e) => handleItemChange(index, 'price', Number(e.target.value))} />
                  </div>
                  <div className="w-32">
                    <Input label="Total" disabled value={`₹${(item.quantity * item.price).toLocaleString()}`} />
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveItem(index)} className="mb-1 text-red-600 hover:bg-red-50">
                    <Trash2 size={16} />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 pt-4 border-t border-gray-100">
            <div className="space-y-4">
              <Input label="Received Amount" type="number" required value={formData.receivedAmount} onChange={(e) => setFormData({ ...formData, receivedAmount: Number(e.target.value) })} />
              <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest mb-1">Balance to Ledger</p>
                <p className="text-xl font-black text-indigo-900">₹{balance.toLocaleString()}</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm font-medium text-gray-500">
                <span>Subtotal</span>
                <span>₹{totalAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm font-medium text-gray-500">
                <span>Tax ({taxPercentage}%)</span>
                <span>₹{taxAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xl font-black text-gray-900 pt-2 border-t border-gray-100">
                <span>Total</span>
                <span>₹{finalAmount.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" type="button" onClick={() => setIsAdding(false)}>Cancel</Button>
            <Button type="submit" className="gap-2">
              <Save size={18} /> Complete Sale
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
});

export default SalesModule;
