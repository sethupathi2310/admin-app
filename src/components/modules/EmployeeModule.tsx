import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Plus, Search, Edit2, Trash2, Briefcase, Phone, DollarSign, Calendar, Loader2, Save, X } from 'lucide-react';
import { format } from 'date-fns';
import * as reactWindow from 'react-window';
const List = (reactWindow as any).FixedSizeList;
import { useLiveQuery } from 'dexie-react-hooks';
import { Employee, CompanyDetails, PrintData, CashTransaction } from '../../types';
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

interface EmployeeModuleProps {
  companyDetails: CompanyDetails;
  onPrint: (data: PrintData) => void;
}

export const EmployeeModule = React.memo(({ companyDetails, onPrint }: EmployeeModuleProps) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', designation: '', salary: 0, phone: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [payrollData, setPayrollData] = useState({ month: format(new Date(), 'MMMM'), year: format(new Date(), 'yyyy'), amount: 0 });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [isAutoSaving, setIsAutoSaving] = useState(false);

  const debouncedFormData = useDebounce(formData, 2000);
  const lastSavedFormDataRef = useRef<any>(null);

  // Fetch data from local DB
  const employees = useLiveQuery(async () => {
    let collection = local.employees.orderBy('name');
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      return await local.employees
        .filter(e => 
          e.name.toLowerCase().includes(lowerSearch) || 
          e.designation.toLowerCase().includes(lowerSearch)
        )
        .limit(limit)
        .toArray();
    }
    return await collection.limit(limit).toArray();
  }, [searchTerm, limit]);

  const selectedEmployee = useLiveQuery(
    () => selectedEmployeeId ? local.employees.get(selectedEmployeeId) : undefined,
    [selectedEmployeeId]
  );

  // Auto-save logic
  useEffect(() => {
    if (!isAdding || !debouncedFormData.name.trim()) return;

    const hasChanged = JSON.stringify(debouncedFormData) !== JSON.stringify(lastSavedFormDataRef.current);
    
    if (hasChanged) {
      handleSave(true);
    }
  }, [debouncedFormData, isAdding]);

  const handleSave = async (isAuto = false) => {
    if (isAuto) setIsAutoSaving(true);
    
    const employeeId = editingId || crypto.randomUUID();
    const existingEmployee = editingId ? await local.employees.get(editingId) : null;
    
    const employeeData: Employee = {
      id: employeeId,
      ...formData,
      payroll: existingEmployee?.payroll || [],
      updatedAt: new Date().toISOString()
    };

    await local.employees.put(employeeData);
    await syncService.queueChange('employees', 'SET', employeeData);
    
    if (!editingId) setEditingId(employeeId);
    lastSavedFormDataRef.current = formData;
    if (isAuto) setTimeout(() => setIsAutoSaving(false), 2000);
  };

  const handleEdit = (employee: Employee) => {
    setFormData({ name: employee.name, designation: employee.designation, salary: employee.salary, phone: employee.phone });
    setEditingId(employee.id);
    setIsAdding(true);
  };

  const confirmDelete = async () => {
    if (deleteId) {
      await local.employees.delete(deleteId);
      await syncService.queueChange('employees', 'DELETE', { id: deleteId });
      if (selectedEmployeeId === deleteId) setSelectedEmployeeId(null);
      setDeleteId(null);
    }
  };

  const handlePaySalary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee) return;

    const newPayrollEntry = {
      id: crypto.randomUUID(),
      ...payrollData,
      date: format(new Date(), 'yyyy-MM-dd')
    };

    const cashTx: CashTransaction = {
      id: `payroll-${crypto.randomUUID()}`,
      date: format(new Date(), 'yyyy-MM-dd'),
      type: 'OUT',
      mode: 'CASH',
      amount: payrollData.amount,
      description: `Salary for ${selectedEmployee.name} - ${payrollData.month} ${payrollData.year}`,
      updatedAt: new Date().toISOString()
    };

    await local.transaction('rw', [local.employees, local.cash], async () => {
      const updatedEmployee = {
        ...selectedEmployee,
        payroll: [...(selectedEmployee.payroll || []), newPayrollEntry],
        updatedAt: new Date().toISOString()
      };
      await local.employees.put(updatedEmployee);
      await syncService.queueChange('employees', 'SET', updatedEmployee);

      await local.cash.put(cashTx);
      await syncService.queueChange('cash', 'SET', cashTx);
    });

    setIsPaying(false);
  };

  const EmployeeRow = ({ index, style }: { index: number, style: React.CSSProperties }) => {
    const employee = employees?.[index];
    if (!employee) return null;

    return (
      <div 
        style={style} 
        className={cn(
          'p-4 cursor-pointer transition-all border-b border-gray-50 flex items-center justify-between',
          selectedEmployeeId === employee.id ? 'bg-indigo-50 border-l-4 border-indigo-600' : 'hover:bg-gray-50'
        )}
        onClick={() => setSelectedEmployeeId(employee.id)}
      >
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-gray-900 truncate">{employee.name}</h3>
          <p className="text-xs text-gray-500 truncate">{employee.designation}</p>
        </div>
        <div className="text-right ml-4">
          <span className="text-xs font-black text-indigo-600">₹{employee.salary.toLocaleString()}</span>
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
        title="Delete Employee"
        message="Are you sure you want to delete this employee? This will also remove their entire payroll history."
      />
      
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Employees</h1>
          <p className="text-sm text-gray-500">Manage your workforce and payroll</p>
        </div>
        <Button onClick={() => setIsAdding(true)} className="gap-2">
          <Plus size={18} />
          Add Employee
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0 overflow-hidden">
        <Card className="lg:col-span-1 p-0 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-gray-100 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input 
                type="text" 
                placeholder="Search employees..." 
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          
          <div className="flex-1 min-h-0">
            {!employees ? (
              <div className="p-4 space-y-4">
                {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-12 bg-gray-100 animate-pulse rounded-lg" />)}
              </div>
            ) : employees.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20">
                <Briefcase className="text-gray-200 mb-4" size={48} />
                <p className="text-gray-500 font-medium">No employees found</p>
              </div>
            ) : (
              <List
                height={500}
                itemCount={employees.length}
                itemSize={70}
                width="100%"
                onItemsRendered={({ visibleStopIndex }) => {
                  if (visibleStopIndex >= employees.length - 5 && employees.length >= limit) {
                    setLimit(prev => prev + PAGE_SIZE);
                  }
                }}
              >
                {EmployeeRow}
              </List>
            )}
          </div>
        </Card>

        <Card className="lg:col-span-2 p-6 overflow-y-auto">
          {selectedEmployee ? (
            <div className="space-y-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-indigo-100 flex items-center justify-center text-indigo-600">
                    <Briefcase size={32} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-gray-900">{selectedEmployee.name}</h2>
                    <div className="flex items-center gap-4 mt-1 text-sm text-gray-500 font-medium">
                      <span className="flex items-center gap-1"><Briefcase size={14} /> {selectedEmployee.designation}</span>
                      <span className="flex items-center gap-1"><Phone size={14} /> {selectedEmployee.phone}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => handleEdit(selectedEmployee)} className="p-2">
                    <Edit2 size={16} />
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setDeleteId(selectedEmployee.id)} className="p-2 text-red-600 hover:bg-red-50">
                    <Trash2 size={16} />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Monthly Salary</p>
                  <p className="text-xl font-black text-indigo-600">₹{selectedEmployee.salary.toLocaleString()}</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Total Paid (YTD)</p>
                  <p className="text-xl font-black text-gray-900">₹{(selectedEmployee.payroll || []).reduce((sum, p) => sum + p.amount, 0).toLocaleString()}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-900">Payroll History</h3>
                  <Button size="sm" onClick={() => { setPayrollData({ ...payrollData, amount: selectedEmployee.salary }); setIsPaying(true); }} className="gap-2">
                    <DollarSign size={14} /> Pay Salary
                  </Button>
                </div>
                <div className="overflow-hidden border border-gray-100 rounded-xl">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-[10px] uppercase font-bold tracking-widest">
                      <tr>
                        <th className="px-4 py-3">Paid Date</th>
                        <th className="px-4 py-3">Month/Year</th>
                        <th className="px-4 py-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {(selectedEmployee.payroll || []).map((entry) => (
                        <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-gray-500">{format(new Date(entry.date), 'MMM dd, yyyy')}</td>
                          <td className="px-4 py-3 font-medium text-gray-900">{entry.month} {entry.year}</td>
                          <td className="px-4 py-3 text-right font-black text-indigo-600">₹{entry.amount.toLocaleString()}</td>
                        </tr>
                      ))}
                      {(selectedEmployee.payroll || []).length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-4 py-8 text-center text-gray-400 italic">No payroll records found</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center py-20">
              <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                <Briefcase className="text-gray-200" size={40} />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Select an employee</h3>
              <p className="text-sm text-gray-500 max-w-xs">Choose an employee from the list to view their full profile and payroll history.</p>
            </div>
          )}
        </Card>
      </div>

      <Modal isOpen={isAdding} onClose={() => setIsAdding(false)} title={editingId ? 'Edit Employee' : 'Add New Employee'}>
        <div className="mb-4 flex items-center justify-end">
          {isAutoSaving && (
            <div className="flex items-center gap-2 text-indigo-600 animate-pulse">
              <Loader2 size={14} className="animate-spin" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Auto-saving...</span>
            </div>
          )}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); handleSave(); setIsAdding(false); }} className="space-y-4">
          <Input label="Employee Name" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
          <Input label="Designation" required value={formData.designation} onChange={(e) => setFormData({ ...formData, designation: e.target.value })} />
          <Input label="Monthly Salary" type="number" required value={formData.salary} onChange={(e) => setFormData({ ...formData, salary: Number(e.target.value) })} />
          <Input label="Phone Number" required value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" type="button" onClick={() => setIsAdding(false)}>Cancel</Button>
            <Button type="submit" className="gap-2">
              <Save size={18} />
              {editingId ? 'Update Employee' : 'Save Employee'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isPaying} onClose={() => setIsPaying(false)} title="Pay Salary">
        <form onSubmit={handlePaySalary} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Select 
              label="Month" 
              required 
              value={payrollData.month} 
              onChange={(e) => setPayrollData({ ...payrollData, month: e.target.value })}
              options={[
                { value: 'January', label: 'January' }, { value: 'February', label: 'February' },
                { value: 'March', label: 'March' }, { value: 'April', label: 'April' },
                { value: 'May', label: 'May' }, { value: 'June', label: 'June' },
                { value: 'July', label: 'July' }, { value: 'August', label: 'August' },
                { value: 'September', label: 'September' }, { value: 'October', label: 'October' },
                { value: 'November', label: 'November' }, { value: 'December', label: 'December' }
              ]}
            />
            <Input label="Year" required value={payrollData.year} onChange={(e) => setPayrollData({ ...payrollData, year: e.target.value })} />
          </div>
          <Input label="Amount" type="number" required value={payrollData.amount} onChange={(e) => setPayrollData({ ...payrollData, amount: Number(e.target.value) })} />
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" type="button" onClick={() => setIsPaying(false)}>Cancel</Button>
            <Button type="submit" className="gap-2">
              <DollarSign size={18} /> Confirm Payment
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
});

export default EmployeeModule;
