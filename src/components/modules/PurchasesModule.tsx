import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Plus, Trash2, Printer, Download, ShoppingCart, Calendar, User, Package, DollarSign, Loader2, Search, Save } from 'lucide-react';
import { format } from 'date-fns';
import * as reactWindow from 'react-window';
const List = (reactWindow as any).FixedSizeList;
import { useLiveQuery } from 'dexie-react-hooks';
import { CompanyDetails, PrintData, Purchase, Product, Supplier, CashTransaction } from '../../types';
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

interface PurchasesModuleProps {
  companyDetails: CompanyDetails;
  onPrint: (data: PrintData) => void;
}

export const PurchasesModule = React.memo(({ companyDetails, onPrint }: PurchasesModuleProps) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<any>({
    supplierId: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    items: [{ productId: '', name: '', quantity: 1, price: 0 }],
    paidAmount: 0
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [isAutoSaving, setIsAutoSaving] = useState(false);

  const debouncedFormData = useDebounce(formData, 2000);
  const lastSavedFormDataRef = useRef<any>(null);

  // Fetch data from local DB
  const purchases = useLiveQuery(async () => {
    let collection = local.purchases.orderBy('date').reverse();
    if (searchTerm) {
      return await local.purchases
        .filter(p => p.id.includes(searchTerm) || p.supplierId.includes(searchTerm))
        .limit(limit)
        .toArray();
    }
    return await collection.limit(limit).toArray();
  }, [searchTerm, limit]);

  const suppliers = useLiveQuery(() => local.suppliers.toArray()) || [];
  const products = useLiveQuery(() => local.products.toArray()) || [];

  const selectedSupplier = useMemo(() => 
    suppliers.find(s => s.id === formData.supplierId),
    [suppliers, formData.supplierId]
  );

  const totalAmount = formData.items.reduce((sum: number, item: any) => sum + (item.quantity * item.price), 0);
  const balance = totalAmount - formData.paidAmount;

  // Auto-save logic
  useEffect(() => {
    if (!isAdding || !debouncedFormData.supplierId || debouncedFormData.items.every((i: any) => !i.productId)) return;

    const hasChanged = JSON.stringify(debouncedFormData) !== JSON.stringify(lastSavedFormDataRef.current);
    
    if (hasChanged) {
      handleSave(true);
    }
  }, [debouncedFormData, isAdding]);

  const handleSave = async (isAuto = false) => {
    if (isAuto) setIsAutoSaving(true);
    
    const purchaseId = editingId || crypto.randomUUID();
    const newPurchase: Purchase = {
      id: purchaseId,
      ...formData,
      totalAmount,
      balance,
      updatedAt: new Date().toISOString()
    };

    try {
      await local.transaction('rw', [local.purchases, local.products, local.suppliers, local.cash], async () => {
        // 1. Revert previous stock if editing
        if (editingId) {
          const oldPurchase = await local.purchases.get(editingId);
          if (oldPurchase) {
            for (const item of oldPurchase.items) {
              const p = await local.products.get(item.productId);
              if (p) await local.products.update(p.id, { stock: Math.max(0, p.stock - item.quantity) });
            }
          }
        }

        // 2. Save Purchase
        await local.purchases.put(newPurchase);
        await syncService.queueChange('purchases', 'SET', newPurchase);

        // 3. Update Stock (Add stock for purchase)
        for (const item of formData.items) {
          const p = await local.products.get(item.productId);
          if (p) {
            const updatedProduct = { ...p, stock: p.stock + item.quantity };
            await local.products.put(updatedProduct);
            await syncService.queueChange('products', 'SET', updatedProduct);
          }
        }

        // 4. Update Supplier Ledger
        if (selectedSupplier) {
          const newLedger = [...(selectedSupplier.ledger || [])];
          newLedger.push({
            id: `purch-${purchaseId}`,
            date: formData.date,
            description: `Purchase #${purchaseId}`,
            credit: totalAmount,
            debit: 0
          });
          if (formData.paidAmount > 0) {
            newLedger.push({
              id: `pay-${purchaseId}`,
              date: formData.date,
              description: `Payment for Purchase #${purchaseId}`,
              credit: 0,
              debit: formData.paidAmount
            });
          }
          const updatedSupplier = { ...selectedSupplier, ledger: newLedger };
          await local.suppliers.put(updatedSupplier);
          await syncService.queueChange('suppliers', 'SET', updatedSupplier);
        }

        // 5. Cash Transaction
        if (formData.paidAmount > 0) {
          const cashTx: CashTransaction = {
            id: `purch-pay-${purchaseId}`,
            date: formData.date,
            type: 'OUT',
            mode: 'CASH',
            amount: formData.paidAmount,
            description: `Payment to ${selectedSupplier?.name} for Purchase #${purchaseId}`,
            supplierId: formData.supplierId
          };
          await local.cash.put(cashTx);
          await syncService.queueChange('cash', 'SET', cashTx);
        }
      });

      if (!editingId) setEditingId(purchaseId);
      lastSavedFormDataRef.current = formData;
      if (isAuto) setTimeout(() => setIsAutoSaving(false), 2000);
    } catch (error) {
      console.error('Failed to save purchase:', error);
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
        newItems[index] = { ...newItems[index], productId: value, name: product.name, price: product.buyingPrice };
      }
    } else {
      newItems[index] = { ...newItems[index], [field]: value };
    }
    setFormData({ ...formData, items: newItems });
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    const purchaseToDelete = await local.purchases.get(deleteId);
    if (!purchaseToDelete) return;

    await local.transaction('rw', [local.purchases, local.products, local.suppliers, local.cash], async () => {
      // 1. Revert Stock (Subtract stock)
      for (const item of purchaseToDelete.items) {
        const p = await local.products.get(item.productId);
        if (p) {
          const updatedProduct = { ...p, stock: Math.max(0, p.stock - item.quantity) };
          await local.products.put(updatedProduct);
          await syncService.queueChange('products', 'SET', updatedProduct);
        }
      }

      // 2. Revert Ledger
      const supplier = await local.suppliers.get(purchaseToDelete.supplierId);
      if (supplier) {
        const updatedSupplier = {
          ...supplier,
          ledger: (supplier.ledger || []).filter(entry => 
            entry.id !== `purch-${deleteId}` && entry.id !== `pay-${deleteId}`
          )
        };
        await local.suppliers.put(updatedSupplier);
        await syncService.queueChange('suppliers', 'SET', updatedSupplier);
      }

      // 3. Remove Cash
      await local.cash.delete(`purch-pay-${deleteId}`);
      await syncService.queueChange('cash', 'DELETE', { id: `purch-pay-${deleteId}` });

      // 4. Delete Purchase
      await local.purchases.delete(deleteId);
      await syncService.queueChange('purchases', 'DELETE', { id: deleteId });
    });

    setDeleteId(null);
  };

  const PurchaseRow = ({ index, style }: { index: number, style: React.CSSProperties }) => {
    const purchase = purchases?.[index];
    if (!purchase) return null;

    const supplier = suppliers.find(s => s.id === purchase.supplierId);

    return (
      <div style={style} className="flex items-center px-6 py-4 border-b border-gray-100 hover:bg-gray-50 transition-colors">
        <div className="w-32 text-sm text-gray-600">{format(new Date(purchase.date), 'MMM dd, yyyy')}</div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 truncate">{supplier?.name || 'Unknown'}</h3>
          <p className="text-xs text-gray-500">Purchase #{purchase.id.slice(-6)}</p>
        </div>
        <div className="w-32 text-sm font-bold text-gray-900">₹{purchase.totalAmount.toLocaleString()}</div>
        <div className="w-32 text-sm font-bold text-green-600">₹{purchase.paidAmount.toLocaleString()}</div>
        <div className="w-32 text-sm font-bold text-red-600">₹{purchase.balance.toLocaleString()}</div>
        <div className="w-24">
          <span className={cn(
            'px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest',
            purchase.balance === 0 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
          )}>
            {purchase.balance === 0 ? 'Paid' : 'Pending'}
          </span>
        </div>
        <div className="w-16 flex justify-end">
          <button onClick={() => setDeleteId(purchase.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
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
        title="Delete Purchase"
        message="Are you sure you want to delete this purchase? This will also revert stock and ledger entries."
      />
      
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Purchases</h1>
          <p className="text-sm text-gray-500">Manage your inventory procurement</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={() => {}} className="gap-2">
            <Printer size={18} /> Print
          </Button>
          <Button onClick={() => setIsAdding(true)} className="gap-2">
            <Plus size={18} /> New Purchase
          </Button>
        </div>
      </div>

      <Card className="p-0 flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-100 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="Search purchases..." 
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center px-6 py-3 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider shrink-0">
          <div className="w-32">Date</div>
          <div className="flex-1">Supplier</div>
          <div className="w-32">Total</div>
          <div className="w-32">Paid</div>
          <div className="w-32">Balance</div>
          <div className="w-24">Status</div>
          <div className="w-16 text-right">Actions</div>
        </div>

        <div className="flex-1 min-h-0">
          {!purchases ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="animate-spin text-indigo-600" />
            </div>
          ) : purchases.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <ShoppingCart className="text-gray-200 mb-4" size={48} />
              <p className="text-gray-500 font-medium">No purchases recorded yet</p>
            </div>
          ) : (
            <List
              height={500}
              itemCount={purchases.length}
              itemSize={70}
              width="100%"
              onItemsRendered={({ visibleStopIndex }) => {
                if (visibleStopIndex >= purchases.length - 5 && purchases.length >= limit) {
                  setLimit(prev => prev + PAGE_SIZE);
                }
              }}
            >
              {PurchaseRow}
            </List>
          )}
        </div>
      </Card>

      <Modal isOpen={isAdding} onClose={() => setIsAdding(false)} title="New Purchase Invoice" size="lg">
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
              label="Supplier" 
              required 
              value={formData.supplierId} 
              onChange={(e) => setFormData({ ...formData, supplierId: e.target.value })}
              options={suppliers.map(s => ({ value: s.id, label: s.name }))}
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
              <Input label="Paid Amount" type="number" required value={formData.paidAmount} onChange={(e) => setFormData({ ...formData, paidAmount: Number(e.target.value) })} />
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
              <div className="flex justify-between text-xl font-black text-gray-900 pt-2 border-t border-gray-100">
                <span>Total</span>
                <span>₹{totalAmount.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" type="button" onClick={() => setIsAdding(false)}>Cancel</Button>
            <Button type="submit" className="gap-2">
              <Save size={18} /> Complete Purchase
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
});

export default PurchasesModule;
