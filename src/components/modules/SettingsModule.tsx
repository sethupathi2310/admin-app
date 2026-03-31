import React, { useState, useEffect, useRef } from 'react';
import { Building2, Save, CheckCircle2, Loader2 } from 'lucide-react';
import { CompanyDetails } from '../../types';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { useDebounce } from '../../hooks/useDebounce';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as local } from '../../lib/db';
import { syncService } from '../../services/SyncService';

export const SettingsModule = React.memo(() => {
  const companyDetails = useLiveQuery(() => local.settings.get('companyDetails'));
  const [formData, setFormData] = useState<CompanyDetails>({
    name: '',
    address: '',
    phone: '',
    email: '',
    gstin: '',
    currency: '₹'
  });
  const [isSaved, setIsSaved] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const lastSavedDataRef = useRef<CompanyDetails | null>(null);

  useEffect(() => {
    if (companyDetails) {
      setFormData(companyDetails.data);
      lastSavedDataRef.current = companyDetails.data;
    }
  }, [companyDetails]);

  const debouncedFormData = useDebounce(formData, 2000);

  useEffect(() => {
    if (!lastSavedDataRef.current) return;

    const hasChanged = JSON.stringify(debouncedFormData) !== JSON.stringify(lastSavedDataRef.current);
    
    if (hasChanged) {
      handleSave(true);
    }
  }, [debouncedFormData]);

  const handleSave = async (isAuto = false) => {
    if (isAuto) setIsAutoSaving(true);
    
    const data = {
      id: 'companyDetails',
      data: formData,
      updatedAt: new Date().toISOString()
    };

    await local.settings.put(data);
    await syncService.queueChange('settings', 'SET', data);
    
    lastSavedDataRef.current = formData;
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      setIsAutoSaving(false);
    }, 2000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSave();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          {isAutoSaving && (
            <div className="flex items-center gap-2 text-indigo-600 animate-pulse">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-xs font-medium">Auto-saving...</span>
            </div>
          )}
        </div>
        {isSaved && (
          <div className="flex items-center gap-2 text-green-600 bg-green-50 px-4 py-2 rounded-full animate-in fade-in slide-in-from-right-4">
            <CheckCircle2 size={18} />
            <span className="text-sm font-medium">Settings saved successfully</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-1 space-y-4">
          <div className="p-6 bg-indigo-50 rounded-2xl border border-indigo-100">
            <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-white mb-4">
              <Building2 size={24} />
            </div>
            <h3 className="text-lg font-bold text-gray-900">Company Profile</h3>
            <p className="text-sm text-gray-600 mt-2">Manage your business details that appear on invoices and reports.</p>
          </div>
        </div>

        <div className="md:col-span-2">
          <Card className="p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <Input 
                    label="Company Name" 
                    required 
                    value={formData.name} 
                    onChange={(e: any) => setFormData({ ...formData, name: e.target.value })} 
                    placeholder="e.g. Acme Corporation"
                  />
                </div>
                <Input 
                  label="Phone Number" 
                  value={formData.phone} 
                  onChange={(e: any) => setFormData({ ...formData, phone: e.target.value })} 
                  placeholder="+91 98765 43210"
                />
                <Input 
                  label="Email Address" 
                  type="email"
                  value={formData.email} 
                  onChange={(e: any) => setFormData({ ...formData, email: e.target.value })} 
                  placeholder="contact@acme.com"
                />
                <div className="md:col-span-2">
                  <Input 
                    label="Address" 
                    value={formData.address} 
                    onChange={(e: any) => setFormData({ ...formData, address: e.target.value })} 
                    placeholder="123 Business Street, City, State"
                  />
                </div>
                <Input 
                  label="GST Number" 
                  value={formData.gstin} 
                  onChange={(e: any) => setFormData({ ...formData, gstin: e.target.value })} 
                  placeholder="22AAAAA0000A1Z5"
                />
                <Input 
                  label="Currency Symbol" 
                  value={formData.currency || '₹'} 
                  onChange={(e: any) => setFormData({ ...formData, currency: e.target.value })} 
                  placeholder="₹"
                />
              </div>

              <div className="pt-6 border-t border-gray-100 flex justify-end">
                <Button type="submit" className="gap-2 px-8">
                  <Save size={18} />
                  Save Changes
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
});

export default SettingsModule;
