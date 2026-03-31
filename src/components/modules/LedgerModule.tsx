import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Plus, Trash2, Edit2, Printer, Download, Users, Truck, Save, Search } from 'lucide-react';
import { format, startOfMonth, parseISO, isWithinInterval } from 'date-fns';
import * as reactWindow from 'react-window';
const List = (reactWindow as any).FixedSizeList;
import { useLiveQuery } from 'dexie-react-hooks';
import { CompanyDetails, PrintData, LedgerEntry } from '../../types';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { ConfirmModal } from '../ui/ConfirmModal';
import { TableSkeleton } from '../ui/Skeleton';
import { cn } from '../../lib/utils';
import { db as local, getTransactions } from '../../lib/db';
import { syncService } from '../../services/SyncService';

const PAGE_SIZE = 50;

interface LedgerModuleProps {
  type: 'customers' | 'suppliers';
  companyDetails: CompanyDetails;
  onPrint: (data: PrintData) => void;
}

const LedgerRow = React.memo(({ index, style, data }: any) => {
  const { items, updateLedgerRow, deleteLedgerRow } = data;
  const row = items[index];

  return (
    <div style={style} className="flex items-center border-b border-gray-100 hover:bg-gray-50 group px-4">
      <div className="w-32 py-1">
        <input 
          type="date" 
          className="w-full bg-transparent border-none focus:ring-1 focus:ring-indigo-500 rounded px-2 py-1 outline-none text-sm"
          value={row.date}
          onChange={(e) => updateLedgerRow(row.id, 'date', e.target.value)}
        />
      </div>
      <div className="flex-1 py-1">
        <input 
          type="text" 
          className="w-full bg-transparent border-none focus:ring-1 focus:ring-indigo-500 rounded px-2 py-1 outline-none text-sm"
          placeholder="Description..."
          value={row.description}
          onChange={(e) => updateLedgerRow(row.id, 'description', e.target.value)}
        />
      </div>
      <div className="w-32 py-1">
        <input 
          type="number" 
          className="w-full bg-transparent border-none focus:ring-1 focus:ring-indigo-500 rounded px-2 py-1 outline-none text-sm text-right"
          value={row.credit}
          onWheel={(e) => (e.target as HTMLInputElement).blur()}
          onChange={(e) => updateLedgerRow(row.id, 'credit', Number(e.target.value))}
        />
      </div>
      <div className="w-32 py-1">
        <input 
          type="number" 
          className="w-full bg-transparent border-none focus:ring-1 focus:ring-indigo-500 rounded px-2 py-1 outline-none text-sm text-right"
          value={row.debit}
          onWheel={(e) => (e.target as HTMLInputElement).blur()}
          onChange={(e) => updateLedgerRow(row.id, 'debit', Number(e.target.value))}
        />
      </div>
      <div className="w-32 py-2 text-right font-bold text-gray-900 text-sm">
        ₹{row.balance.toLocaleString()}
      </div>
      <div className="w-16 py-1 text-right no-print">
        <button onClick={() => deleteLedgerRow(row.id)} className="p-1 text-gray-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-all">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
});

export const LedgerModule = React.memo(({ type, companyDetails, onPrint }: LedgerModuleProps) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isAddingEntity, setIsAddingEntity] = useState(false);
  const [editingEntityId, setEditingEntityId] = useState<string | null>(null);
  const [entityFormData, setEntityFormData] = useState({ name: '', phone: '', address: '', openingBalance: 0, taxPercentage: 0 });
  const [fromDate, setFromDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);

  const table = type === 'customers' ? local.customers : local.suppliers;

  const entities = useLiveQuery(async () => {
    let collection = table.orderBy('name');
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      return await table
        .filter(e => e.name.toLowerCase().includes(lowerSearch) || e.phone.includes(lowerSearch))
        .limit(limit)
        .toArray();
    }
    return await collection.limit(limit).toArray();
  }, [type, searchTerm, limit]);

  const selectedEntity = useLiveQuery(
    () => selectedId ? table.get(selectedId) : undefined,
    [selectedId, type]
  );

  useEffect(() => {
    if (entities && entities.length > 0 && !selectedId) {
      setSelectedId(entities[0].id);
    }
  }, [entities, selectedId]);

  const handleAddEntity = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = editingEntityId || crypto.randomUUID();
    const existing = editingEntityId ? await table.get(editingEntityId) : null;
    
    const data = {
      id,
      ...entityFormData,
      ledger: existing?.ledger || [],
      updatedAt: new Date().toISOString()
    };

    await table.put(data);
    await syncService.queueChange(type, 'SET', data);
    
    setIsAddingEntity(false);
    setEditingEntityId(null);
    setEntityFormData({ name: '', phone: '', address: '', openingBalance: 0, taxPercentage: 0 });
    if (!editingEntityId) setSelectedId(id);
  };

  const handleEditEntity = (item: any) => {
    setEntityFormData({ name: item.name, phone: item.phone, address: item.address, openingBalance: item.openingBalance || 0, taxPercentage: item.taxPercentage || 0 });
    setEditingEntityId(item.id);
    setIsAddingEntity(true);
  };

  const confirmDelete = async () => {
    if (deleteId) {
      await table.delete(deleteId);
      await syncService.queueChange(type, 'DELETE', { id: deleteId });
      if (selectedId === deleteId) setSelectedId(null);
      setDeleteId(null);
    }
  };

  const addLedgerRow = async () => {
    if (!selectedId || !selectedEntity) return;
    const newRow: LedgerEntry = {
      id: crypto.randomUUID(),
      date: format(new Date(), 'yyyy-MM-dd'),
      description: '',
      credit: 0,
      debit: 0
    };
    const updated = {
      ...selectedEntity,
      ledger: [...(selectedEntity.ledger || []), newRow],
      updatedAt: new Date().toISOString()
    };
    await table.put(updated);
    await syncService.queueChange(type, 'SET', updated);
  };

  const updateLedgerRow = useCallback(async (rowId: string, field: keyof LedgerEntry, value: any) => {
    if (!selectedId) return;
    const entity = await table.get(selectedId);
    if (!entity) return;

    const newLedger = (entity.ledger || []).map(row => 
      row.id === rowId ? { ...row, [field]: value } : row
    );

    const updated = {
      ...entity,
      ledger: newLedger,
      updatedAt: new Date().toISOString()
    };
    await table.put(updated);
    await syncService.queueChange(type, 'SET', updated);
  }, [selectedId, type]);

  const deleteLedgerRow = useCallback(async (rowId: string) => {
    if (!selectedId) return;
    const entity = await table.get(selectedId);
    if (!entity) return;

    const newLedger = (entity.ledger || []).filter(row => row.id !== rowId);
    const updated = {
      ...entity,
      ledger: newLedger,
      updatedAt: new Date().toISOString()
    };
    await table.put(updated);
    await syncService.queueChange(type, 'SET', updated);
  }, [selectedId, type]);

  const ledgerWithBalance = useMemo(() => {
    // 🔥 STEP 4: USE CACHE IF AVAILABLE
    const cachedData = getTransactions();
    if (cachedData && cachedData.length > 0 && selectedId === 'all') {
      return cachedData;
    }

    if (!selectedEntity) return [];
    
    const filtered = (selectedEntity.ledger || [])
      .filter(row => {
        const date = parseISO(row.date);
        return isWithinInterval(date, { start: parseISO(fromDate), end: parseISO(toDate) });
      })
      .sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime());

    let currentBalance = selectedEntity.openingBalance || 0;
    return filtered.map(row => {
      currentBalance = currentBalance + (row.credit || 0) - (row.debit || 0);
      return { ...row, balance: currentBalance };
    });
  }, [selectedEntity, fromDate, toDate]);

  const totals = useMemo(() => {
    const totalCredit = ledgerWithBalance.reduce((sum, row) => sum + (row.credit || 0), 0);
    const totalDebit = ledgerWithBalance.reduce((sum, row) => sum + (row.debit || 0), 0);
    const finalBalance = ledgerWithBalance.length > 0 ? ledgerWithBalance[ledgerWithBalance.length - 1].balance : (selectedEntity?.openingBalance || 0);
    return { totalCredit, totalDebit, finalBalance };
  }, [ledgerWithBalance, selectedEntity?.openingBalance]);

  const handlePrint = () => {
    if (!selectedEntity) return;
    
    const printData: PrintData = {
      companyDetails,
      title: `${type === 'customers' ? 'Customer' : 'Supplier'} Ledger`,
      subtitle: `Name: ${selectedEntity.name}`,
      dateRange: `From: ${fromDate} To: ${toDate}`,
      columns: [
        { header: 'Date', key: 'date', width: '15%' },
        { header: 'Description', key: 'description', width: '45%' },
        { header: 'Credit', key: 'credit', width: '13%', align: 'right' },
        { header: 'Debit', key: 'debit', width: '13%', align: 'right' },
        { header: 'Balance', key: 'balance', width: '14%', align: 'right' }
      ],
      data: ledgerWithBalance.map(row => ({
        ...row,
        credit: row.credit ? `₹${row.credit.toLocaleString()}` : '-',
        debit: row.debit ? `₹${row.debit.toLocaleString()}` : '-',
        balance: `₹${row.balance.toLocaleString()}`
      })),
      totals: [
        { label: 'Total Credit', value: `₹${totals.totalCredit.toLocaleString()}` },
        { label: 'Total Debit', value: `₹${totals.totalDebit.toLocaleString()}` },
        { label: 'Final Balance', value: `₹${totals.finalBalance.toLocaleString()}`, isBold: true }
      ]
    };

    onPrint(printData);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 h-full flex flex-col">
      <ConfirmModal 
        isOpen={!!deleteId} 
        onClose={() => setDeleteId(null)} 
        onConfirm={confirmDelete}
        title={`Delete ${type.slice(0, -1)}`}
        message={`Are you sure you want to delete this ${type.slice(0, -1)}? All ledger data will be lost.`}
      />
      
      <div className="flex items-center justify-between shrink-0 no-print">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 capitalize">{type} Ledger</h1>
          <p className="text-sm text-gray-500">Track transactions and balances</p>
        </div>
        <div className="flex gap-3">
          <Button onClick={() => setIsAddingEntity(true)} variant="secondary" className="gap-2">
            <Plus size={18} />
            Manage {type.slice(0, -1)}
          </Button>
          <Button onClick={handlePrint} variant="secondary" className="gap-2">
            <Download size={18} />
            PDF
          </Button>
          <Button onClick={handlePrint} className="gap-2">
            <Printer size={18} />
            Print Report
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6 flex-1 min-h-0 overflow-hidden">
        {/* Entity List */}
        <div className="col-span-12 lg:col-span-3 space-y-4 no-print flex flex-col overflow-hidden">
          <Card className="p-0 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-gray-100 shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input 
                  type="text" 
                  placeholder={`Search ${type}...`} 
                  className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {!entities ? (
                <div className="p-4 space-y-4">
                  {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-12 bg-gray-100 animate-pulse rounded-lg" />)}
                </div>
              ) : entities.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <Users className="text-gray-200 mb-4" size={48} />
                  <p className="text-gray-500 font-medium">No {type} found</p>
                </div>
              ) : (
                entities.map(item => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    className={cn(
                      'w-full text-left px-4 py-3 border-b border-gray-50 transition-all flex items-center justify-between group',
                      selectedId === item.id ? 'bg-indigo-50 border-l-4 border-indigo-600' : 'hover:bg-gray-50'
                    )}
                  >
                    <div className="min-w-0">
                      <p className={cn('font-bold truncate', selectedId === item.id ? 'text-indigo-700' : 'text-gray-900')}>{item.name}</p>
                      <p className="text-xs text-gray-500 truncate">{item.phone}</p>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); handleEditEntity(item); }} className="p-1 text-gray-400 hover:text-indigo-600"><Edit2 size={14} /></button>
                      <button onClick={(e) => { e.stopPropagation(); setDeleteId(item.id); }} className="p-1 text-gray-400 hover:text-red-600"><Trash2 size={14} /></button>
                    </div>
                  </button>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* Ledger Table */}
        <div className="col-span-12 lg:col-span-9 print:col-span-12 flex flex-col overflow-hidden">
          {selectedEntity ? (
            <div className="flex flex-col h-full space-y-6">
              <Card className="bg-white no-print shrink-0">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
                  <Input type="date" label="From Date" value={fromDate} onChange={(e: any) => setFromDate(e.target.value)} />
                  <Input type="date" label="To Date" value={toDate} onChange={(e: any) => setToDate(e.target.value)} />
                  <Input 
                    type="number" 
                    label="Opening Balance" 
                    value={selectedEntity.openingBalance} 
                    onChange={async (e: any) => {
                      const val = Number(e.target.value);
                      const updated = { ...selectedEntity, openingBalance: val, updatedAt: new Date().toISOString() };
                      await table.put(updated);
                      await syncService.queueChange(type, 'SET', updated);
                    }} 
                  />
                  <div className="pb-1">
                    <Button onClick={addLedgerRow} className="w-full gap-2">
                      <Plus size={18} /> Add Row
                    </Button>
                  </div>
                </div>
              </Card>

              <Card className="p-0 overflow-hidden flex flex-col flex-1 min-h-0">
                <div className="bg-gray-50 border-b border-gray-200 flex items-center shrink-0 px-4">
                  <div className="w-32 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</div>
                  <div className="flex-1 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</div>
                  <div className="w-32 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Credit</div>
                  <div className="w-32 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Debit</div>
                  <div className="w-32 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Balance</div>
                  <div className="w-16 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider no-print"></div>
                </div>
                
                <div className="flex-1 min-h-0 overflow-y-auto">
                  {ledgerWithBalance.length > 0 ? (
                    <List
                      height={500}
                      itemCount={ledgerWithBalance.length}
                      itemSize={48}
                      width="100%"
                      itemData={{
                        items: ledgerWithBalance,
                        updateLedgerRow,
                        deleteLedgerRow
                      }}
                    >
                      {LedgerRow}
                    </List>
                  ) : (
                    <div className="px-6 py-12 text-center text-gray-500">No ledger entries found for this period</div>
                  )}
                </div>

                <div className="bg-gray-50 border-t border-gray-200 flex items-center shrink-0 px-4">
                  <div className="flex-1 py-3 text-sm font-bold text-gray-900">TOTALS</div>
                  <div className="w-32 py-3 text-sm font-bold text-indigo-600 text-right">₹{totals.totalCredit.toLocaleString()}</div>
                  <div className="w-32 py-3 text-sm font-bold text-red-600 text-right">₹{totals.totalDebit.toLocaleString()}</div>
                  <div className="w-32 py-3 text-sm font-bold text-gray-900 text-right">₹{totals.finalBalance.toLocaleString()}</div>
                  <div className="w-16 no-print"></div>
                </div>
              </Card>
            </div>
          ) : (
            <Card className="p-12 text-center flex-1 flex flex-col items-center justify-center">
              <div className="max-w-xs mx-auto space-y-4">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto text-gray-400">
                  <Users size={32} />
                </div>
                <h3 className="text-lg font-bold text-gray-900">No {type.slice(0, -1)} Selected</h3>
                <p className="text-gray-500">Please select a {type.slice(0, -1)} from the list or add a new one to view their ledger.</p>
                <Button onClick={() => setIsAddingEntity(true)} className="w-full">Add New {type.slice(0, -1)}</Button>
              </div>
            </Card>
          )}
        </div>
      </div>

      <Modal isOpen={isAddingEntity} onClose={() => { setIsAddingEntity(false); setEditingEntityId(null); }} title={editingEntityId ? `Edit ${type.slice(0, -1)}` : `Add New ${type.slice(0, -1)}`}>
        <form onSubmit={handleAddEntity} className="space-y-4">
          <Input label="Name" required value={entityFormData.name} onChange={(e: any) => setEntityFormData({ ...entityFormData, name: e.target.value })} />
          <Input label="Phone" value={entityFormData.phone} onChange={(e: any) => setEntityFormData({ ...entityFormData, phone: e.target.value })} />
          <Input label="Address" value={entityFormData.address} onChange={(e: any) => setEntityFormData({ ...entityFormData, address: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Input type="number" label="Opening Balance" value={entityFormData.openingBalance} onChange={(e: any) => setEntityFormData({ ...entityFormData, openingBalance: Number(e.target.value) })} />
            <Input type="number" label="Tax %" value={entityFormData.taxPercentage} onChange={(e: any) => setEntityFormData({ ...entityFormData, taxPercentage: Number(e.target.value) })} />
          </div>
          <div className="flex gap-3 pt-4">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => { setIsAddingEntity(false); setEditingEntityId(null); }}>Cancel</Button>
            <Button type="submit" className="flex-1 gap-2">
              <Save size={18} />
              {editingEntityId ? 'Update' : 'Save'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
});

export default LedgerModule;
