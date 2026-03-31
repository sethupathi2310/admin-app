import React, { useState, useEffect, Suspense, lazy, useCallback } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Truck, 
  ShoppingCart, 
  Package, 
  DollarSign, 
  BarChart3, 
  LogOut, 
  Loader2,
  Building2,
  Menu,
  ChevronLeft,
  ChevronRight,
  Briefcase
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, logout as firebaseLogout } from './firebase';
import { db as local } from './lib/db';
import { syncService, loadTransactions } from './services/SyncService';
import { PrintData, CompanyDetails } from './types';
import { LedgerPrintView } from './components/LedgerPrintView';
import { cn } from './lib/utils';
import { Button } from './components/ui/Button';
import NavItem from './components/ui/NavItem';
import { useLiveQuery } from 'dexie-react-hooks';

// Lazy load modules for performance
const DashboardModule = lazy(() => import('./components/modules/Dashboard'));
const ProductModule = lazy(() => import('./components/modules/ProductModule'));
const EmployeeModule = lazy(() => import('./components/modules/EmployeeModule'));
const SalesModule = lazy(() => import('./components/modules/SalesModule'));
const PurchasesModule = lazy(() => import('./components/modules/PurchasesModule'));
const CashModule = lazy(() => import('./components/modules/CashModule'));
const AnalyticsModule = lazy(() => import('./components/modules/AnalyticsModule'));
const SettingsModule = lazy(() => import('./components/modules/SettingsModule'));
const LedgerModule = lazy(() => import('./components/modules/LedgerModule'));

const DEFAULT_COMPANY: CompanyDetails = {
  name: 'SMC ADMIN PORTAL',
  address: '123 Business Avenue, Tech District, City - 100001',
  phone: '+1 234 567 8900',
  email: 'contact@smcportal.com',
  gstin: '',
  currency: '₹'
};

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved ? JSON.parse(saved) : false;
  });
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [printData, setPrintData] = useState<PrintData | null>(null);

  // Fetch company details for print view
  const companySettings = useLiveQuery(() => local.settings.get('companyDetails'));
  const companyDetails = companySettings?.data || DEFAULT_COMPANY;

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (u) => {
      try {
        if (u) {
          setUser(u);
          syncService.setUserId(u.uid);
          await syncService.initialSync();
          syncService.startBackgroundSync();
          
          // 🔥 STEP 5: LOAD DATA ONCE
          await loadTransactions(u.uid);
        } else {
          // For demo/guest mode if needed, otherwise redirect to login
          const guestId = 'guest-user';
          setUser({ uid: guestId, email: 'guest@example.com' });
          syncService.setUserId(guestId);
          await syncService.initialSync();
          
          // 🔥 STEP 5: LOAD DATA ONCE
          await loadTransactions(guestId);
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
      } finally {
        setLoading(false);
        setIsAuthReady(true);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      await firebaseLogout();
      await local.clearAll();
      window.location.reload();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handlePrint = useCallback((data: PrintData) => {
    setPrintData(data);
    setTimeout(() => {
      window.print();
      setPrintData(null);
    }, 500);
  }, []);

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', JSON.stringify(isCollapsed));
  }, [isCollapsed]);

  if (!isAuthReady || loading) return (
    <div className="h-screen flex flex-col items-center justify-center bg-white">
      <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mb-6 animate-bounce shadow-xl shadow-indigo-200">
        <Building2 className="text-white" size={32} />
      </div>
      <div className="flex items-center gap-3">
        <Loader2 className="animate-spin text-indigo-600" size={20} />
        <p className="text-sm font-bold text-gray-900 uppercase tracking-widest">Initializing SMC Portal...</p>
      </div>
    </div>
  );

  return (
    <div className="h-screen flex bg-gray-50 overflow-hidden print:overflow-visible relative">
      {/* Mobile Toggle */}
      <button 
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-md border border-gray-100 no-print"
      >
        <Menu size={20} className="text-gray-600" />
      </button>

      {/* Sidebar Overlay for Mobile */}
      <AnimatePresence>
        {isMobileOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileOpen(false)}
            className="lg:hidden fixed inset-0 bg-black/50 z-40 no-print"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside 
        className={cn(
          "bg-white border-r border-gray-200 flex flex-col no-print transition-all duration-300 ease-in-out fixed lg:static h-full z-50",
          isCollapsed ? "w-[70px]" : "w-64",
          isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className={cn("p-4 flex items-center justify-between", isCollapsed ? "flex-col gap-4" : "")}>
          <div className={cn("flex items-center gap-3 overflow-hidden whitespace-nowrap transition-all duration-300", isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100")}>
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <Building2 className="text-white" size={18} />
            </div>
            <span className="font-bold text-gray-900 tracking-tight">SMC ADMIN PORTAL</span>
          </div>
          
          {isCollapsed && (
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0 animate-in fade-in zoom-in duration-300">
              <Building2 className="text-white" size={18} />
            </div>
          )}

          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden lg:flex p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
          >
            {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>
        
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto py-4 scrollbar-hide">
          <NavItem active={activeTab === 'dashboard'} onClick={() => { setActiveTab('dashboard'); setIsMobileOpen(false); }} icon={LayoutDashboard} label="Dashboard" collapsed={isCollapsed} />
          <NavItem active={activeTab === 'products'} onClick={() => { setActiveTab('products'); setIsMobileOpen(false); }} icon={Package} label="Products" collapsed={isCollapsed} />
          <NavItem active={activeTab === 'customers'} onClick={() => { setActiveTab('customers'); setIsMobileOpen(false); }} icon={Users} label="Customer Ledger" collapsed={isCollapsed} />
          <NavItem active={activeTab === 'suppliers'} onClick={() => { setActiveTab('suppliers'); setIsMobileOpen(false); }} icon={Truck} label="Supplier Ledger" collapsed={isCollapsed} />
          <NavItem active={activeTab === 'employees'} onClick={() => { setActiveTab('employees'); setIsMobileOpen(false); }} icon={Briefcase} label="Employees" collapsed={isCollapsed} />
          <NavItem active={activeTab === 'sales'} onClick={() => { setActiveTab('sales'); setIsMobileOpen(false); }} icon={ShoppingCart} label="Sales" collapsed={isCollapsed} />
          <NavItem active={activeTab === 'purchases'} onClick={() => { setActiveTab('purchases'); setIsMobileOpen(false); }} icon={Package} label="Purchases" collapsed={isCollapsed} />
          <NavItem active={activeTab === 'cash'} onClick={() => { setActiveTab('cash'); setIsMobileOpen(false); }} icon={DollarSign} label="Cash Management" collapsed={isCollapsed} />
          <NavItem active={activeTab === 'analytics'} onClick={() => { setActiveTab('analytics'); setIsMobileOpen(false); }} icon={BarChart3} label="Analytics" collapsed={isCollapsed} />
          <NavItem active={activeTab === 'settings'} onClick={() => { setActiveTab('settings'); setIsMobileOpen(false); }} icon={Building2} label="Company Profile" collapsed={isCollapsed} />
        </nav>

        <div className="p-4 border-t border-gray-100">
          <Button 
            variant="ghost" 
            className={cn("w-full justify-start gap-2 transition-all duration-300", isCollapsed ? "justify-center px-0" : "")} 
            onClick={handleLogout}
            title={isCollapsed ? "Sign Out" : ""}
          >
            <LogOut size={18} className="flex-shrink-0" />
            {!isCollapsed && <span className="animate-in fade-in duration-300">Sign Out</span>}
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={cn("flex-1 overflow-y-auto p-8 print:p-0 print:overflow-visible", printData && "no-print")}>
        <Suspense fallback={<div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-indigo-600" size={32} /></div>}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="h-full"
            >
              {activeTab === 'dashboard' && <DashboardModule />}
              {activeTab === 'products' && <ProductModule />}
              {activeTab === 'customers' && <LedgerModule type="customers" companyDetails={companyDetails} onPrint={handlePrint} />}
              {activeTab === 'suppliers' && <LedgerModule type="suppliers" companyDetails={companyDetails} onPrint={handlePrint} />}
              {activeTab === 'employees' && <EmployeeModule companyDetails={companyDetails} onPrint={handlePrint} />}
              {activeTab === 'sales' && <SalesModule companyDetails={companyDetails} onPrint={handlePrint} />}
              {activeTab === 'purchases' && <PurchasesModule companyDetails={companyDetails} onPrint={handlePrint} />}
              {activeTab === 'cash' && <CashModule companyDetails={companyDetails} onPrint={handlePrint} />}
              {activeTab === 'analytics' && <AnalyticsModule />}
              {activeTab === 'settings' && <SettingsModule />}
            </motion.div>
          </AnimatePresence>
        </Suspense>
      </main>

      {/* Hidden Print View */}
      {printData && (
        <LedgerPrintView {...printData} />
      )}
    </div>
  );
}

export default App;
