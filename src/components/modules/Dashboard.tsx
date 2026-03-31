import React from 'react';
import { format, parseISO } from 'date-fns';
import { 
  TrendingUp, TrendingDown, Package, 
  Wallet, Calendar, ShoppingCart
} from 'lucide-react';
import { 
  XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer,
  AreaChart, Area
} from 'recharts';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as local } from '../../lib/db';
import { Card } from '../ui/Card';
import { CardSkeleton, Skeleton } from '../ui/Skeleton';
import { cn } from '../../lib/utils';

export const Dashboard = React.memo(() => {
  const dashboardData = useLiveQuery(async () => {
    // Use more efficient ways to get counts and totals without loading full arrays
    const [salesCount, purchasesCount, productsCount, cashCount] = await Promise.all([
      local.sales.count(),
      local.purchases.count(),
      local.products.count(),
      local.cash.count()
    ]);

    // For totals, we still need to iterate, but we can do it more efficiently
    let totalSales = 0;
    await local.sales.each(s => totalSales += s.totalAmount);

    let totalPurchases = 0;
    await local.purchases.each(p => totalPurchases += p.totalAmount);

    let totalCashIn = 0;
    let totalCashOut = 0;
    await local.cash.each(t => {
      if (t.type === 'IN') totalCashIn += t.amount;
      else totalCashOut += t.amount;
    });
    
    const stats = [
      { label: 'Total Sales', value: `₹${totalSales.toLocaleString()}`, icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50', trend: '+12.5%' },
      { label: 'Total Purchases', value: `₹${totalPurchases.toLocaleString()}`, icon: TrendingDown, color: 'text-red-600', bg: 'bg-red-50', trend: '+8.2%' },
      { label: 'Cash In Hand', value: `₹${(totalCashIn - totalCashOut).toLocaleString()}`, icon: Wallet, color: 'text-indigo-600', bg: 'bg-indigo-50', trend: '-2.4%' },
      { label: 'Total Products', value: productsCount.toString(), icon: Package, color: 'text-amber-600', bg: 'bg-amber-50', trend: '+4' },
    ];

    // Only fetch the most recent data for charts and lists
    const [recentSalesRaw, recentSalesForList] = await Promise.all([
      local.sales.orderBy('date').reverse().limit(7).toArray(),
      local.sales.orderBy('date').reverse().limit(5).toArray()
    ]);

    const salesChartData = recentSalesRaw.reverse().map(s => ({
      date: format(parseISO(s.date), 'MMM dd'),
      amount: s.totalAmount
    }));

    const customerIds = [...new Set(recentSalesForList.map(s => s.customerId))];
    const customers = await local.customers.where('id').anyOf(customerIds).toArray();

    const recentSales = recentSalesForList.map(sale => ({
      ...sale,
      customerName: customers.find(c => c.id === sale.customerId)?.name || 'Unknown Customer'
    }));

    return { stats, salesChartData, recentSales };
  }, []);

  if (!dashboardData) {
    return (
      <div className="space-y-8">
        <div className="flex justify-between items-center">
          <div className="space-y-2">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-12 w-40 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 h-[450px] bg-white rounded-xl border border-gray-100 p-6 animate-pulse" />
          <div className="h-[450px] bg-white rounded-xl border border-gray-100 p-6 animate-pulse" />
        </div>
      </div>
    );
  }

  const { stats, salesChartData, recentSales } = dashboardData;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Dashboard</h1>
          <p className="text-gray-500 font-medium">Welcome back, here's what's happening today.</p>
        </div>
        <div className="flex items-center gap-3 bg-white p-2 rounded-xl shadow-sm border border-gray-100">
          <Calendar className="text-indigo-600" size={20} />
          <span className="text-sm font-bold text-gray-700 uppercase tracking-wider">{format(new Date(), 'MMMM dd, yyyy')}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <Card key={i} className="p-6 group hover:border-indigo-200 transition-all duration-300">
            <div className="flex items-start justify-between mb-4">
              <div className={cn('p-3 rounded-xl transition-colors duration-300', stat.bg)}>
                <stat.icon className={stat.color} size={24} />
              </div>
              <span className={cn('text-xs font-bold px-2 py-1 rounded-full', 
                stat.trend.startsWith('+') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              )}>
                {stat.trend}
              </span>
            </div>
            <h3 className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-1">{stat.label}</h3>
            <p className="text-2xl font-black text-gray-900 tracking-tight">{stat.value}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 p-6">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Sales Overview</h3>
              <p className="text-sm text-gray-500">Revenue generated over the last 7 transactions</p>
            </div>
            <div className="flex gap-2">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-indigo-600" />
                <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Revenue</span>
              </div>
            </div>
          </div>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesChartData}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 11, fontWeight: 600, fill: '#94a3b8' }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 11, fontWeight: 600, fill: '#94a3b8' }}
                  tickFormatter={(value) => `₹${value}`}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  itemStyle={{ fontWeight: 700, color: '#4f46e5' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="amount" 
                  stroke="#4f46e5" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorSales)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-6">Recent Transactions</h3>
          <div className="space-y-6">
            {recentSales.map((sale, i) => (
              <div key={i} className="flex items-center justify-between group cursor-pointer">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center group-hover:bg-indigo-50 transition-colors">
                    <ShoppingCart className="text-gray-400 group-hover:text-indigo-600" size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900 truncate max-w-[120px]">
                      {sale.customerName}
                    </p>
                    <p className="text-xs text-gray-500 font-medium">{format(parseISO(sale.date), 'MMM dd, yyyy')}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-gray-900">₹{sale.totalAmount.toLocaleString()}</p>
                  <p className={cn('text-[10px] font-bold uppercase tracking-widest', sale.balance > 0 ? 'text-amber-600' : 'text-green-600')}>
                    {sale.balance > 0 ? 'Pending' : 'Paid'}
                  </p>
                </div>
              </div>
            ))}
            {recentSales.length === 0 && (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <ShoppingCart className="text-gray-300" size={32} />
                </div>
                <p className="text-sm text-gray-500 font-medium">No transactions yet</p>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
});

export default Dashboard;
