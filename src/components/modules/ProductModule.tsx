import React, { useState, useMemo, useCallback } from 'react';
import { Plus, Search, Edit2, Trash2, Package, Loader2, Save, X } from 'lucide-react';
import * as reactWindow from 'react-window';
const List = (reactWindow as any).FixedSizeList;
import { useLiveQuery } from 'dexie-react-hooks';
import { Product } from '../../types';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { ConfirmModal } from '../ui/ConfirmModal';
import { cn } from '../../lib/utils';
import { db as local } from '../../lib/db';
import { syncService } from '../../services/SyncService';

const PAGE_SIZE = 50;

export const ProductModule = React.memo(() => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', category: '', unit: '', buyingPrice: 0, sellingPrice: 0, stock: 0, includeInPL: true });
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);

  const products = useLiveQuery(async () => {
    let collection = local.products.orderBy('name');
    
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      return await local.products
        .filter(p => 
          p.name.toLowerCase().includes(lowerSearch) || 
          p.category.toLowerCase().includes(lowerSearch)
        )
        .limit(limit)
        .toArray();
    }
    
    return await collection.limit(limit).toArray();
  }, [searchTerm, limit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = editingId || crypto.randomUUID();
    const productData: Product = {
      id,
      ...formData,
      updatedAt: new Date().toISOString()
    };

    await local.products.put(productData);
    await syncService.queueChange('products', 'SET', productData);
    
    setIsAdding(false);
    setEditingId(null);
    setFormData({ name: '', category: '', unit: '', buyingPrice: 0, sellingPrice: 0, stock: 0, includeInPL: true });
  };

  const handleEdit = (product: Product) => {
    setFormData({ 
      name: product.name, 
      category: product.category, 
      unit: product.unit, 
      buyingPrice: product.buyingPrice, 
      sellingPrice: product.sellingPrice, 
      stock: product.stock, 
      includeInPL: product.includeInPL ?? true 
    });
    setEditingId(product.id);
    setIsAdding(true);
  };

  const confirmDelete = async () => {
    if (deleteId) {
      await local.products.delete(deleteId);
      await syncService.queueChange('products', 'DELETE', { id: deleteId });
      setDeleteId(null);
    }
  };

  const ProductRow = ({ index, style }: { index: number, style: React.CSSProperties }) => {
    const product = products?.[index];
    if (!product) return null;

    return (
      <div style={style} className="flex items-center px-6 py-4 border-b border-gray-100 hover:bg-gray-50 transition-colors">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 truncate">{product.name}</h3>
          <p className="text-xs text-gray-500">{product.category}</p>
        </div>
        <div className="w-24 text-sm text-gray-600">{product.unit}</div>
        <div className="w-32 text-sm font-bold text-red-600">₹{product.buyingPrice.toLocaleString()}</div>
        <div className="w-32 text-sm font-bold text-green-600">₹{product.sellingPrice.toLocaleString()}</div>
        <div className="w-24">
          <span className={cn(
            'px-2 py-1 rounded-full text-[10px] font-bold',
            product.stock > 10 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          )}>
            {product.stock} {product.unit}
          </span>
        </div>
        <div className="w-24 flex justify-end gap-2">
          <button onClick={() => handleEdit(product)} className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
            <Edit2 size={16} />
          </button>
          <button onClick={() => setDeleteId(product.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
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
        title="Delete Product"
        message="Are you sure you want to delete this product? This action cannot be undone."
      />
      
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Products</h1>
          <p className="text-sm text-gray-500">Manage your inventory and pricing</p>
        </div>
        <Button onClick={() => setIsAdding(true)} className="gap-2">
          <Plus size={18} />
          Add Product
        </Button>
      </div>

      <Card className="p-0 flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-100 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="Search products..." 
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center px-6 py-3 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider shrink-0">
          <div className="flex-1">Product Details</div>
          <div className="w-24">Unit</div>
          <div className="w-32">Buying Price</div>
          <div className="w-32">Selling Price</div>
          <div className="w-24">Stock</div>
          <div className="w-24 text-right">Actions</div>
        </div>

        <div className="flex-1 min-h-0">
          {!products ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="animate-spin text-indigo-600" />
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Package className="text-gray-200 mb-4" size={48} />
              <p className="text-gray-500 font-medium">No products found</p>
            </div>
          ) : (
            <List
              height={500}
              itemCount={products.length}
              itemSize={70}
              width="100%"
              onItemsRendered={({ visibleStopIndex }) => {
                if (visibleStopIndex >= products.length - 5 && products.length >= limit) {
                  setLimit(prev => prev + PAGE_SIZE);
                }
              }}
            >
              {ProductRow}
            </List>
          )}
        </div>
      </Card>

      <Modal isOpen={isAdding} onClose={() => setIsAdding(false)} title={editingId ? 'Edit Product' : 'Add New Product'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Product Name" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
            <Input label="Category" required value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} />
            <Input label="Unit (e.g. Pcs, Kg)" required value={formData.unit} onChange={(e) => setFormData({ ...formData, unit: e.target.value })} />
            <Input label="Buying Price" type="number" required value={formData.buyingPrice} onChange={(e) => setFormData({ ...formData, buyingPrice: Number(e.target.value) })} />
            <Input label="Selling Price" type="number" required value={formData.sellingPrice} onChange={(e) => setFormData({ ...formData, sellingPrice: Number(e.target.value) })} />
            <Input label="Initial Stock" type="number" required value={formData.stock} onChange={(e) => setFormData({ ...formData, stock: Number(e.target.value) })} />
          </div>
          <div className="flex items-center gap-2 py-2">
            <input 
              type="checkbox" 
              id="includeInPL" 
              checked={formData.includeInPL} 
              onChange={(e) => setFormData({ ...formData, includeInPL: e.target.checked })}
              className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
            />
            <label htmlFor="includeInPL" className="text-sm font-medium text-gray-700">Include in P&L Calculations</label>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" type="button" onClick={() => setIsAdding(false)}>Cancel</Button>
            <Button type="submit" className="gap-2">
              <Save size={18} />
              Save Product
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
});

export default ProductModule;
