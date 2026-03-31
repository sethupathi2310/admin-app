import React, { useMemo } from 'react';
import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  Legend,
  AreaChart,
  Area
} from 'recharts';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as local } from '../../lib/db';
import { Card } from '../ui/Card';
import { Skeleton } from '../ui/Skeleton';

export const AnalyticsModule = React.memo(() => {
  const months = useMemo(() => Array.from({ length: 6 }, (_, i) => subMonths(new Date(), i)).reverse(), []);
  const startDate = startOfMonth(months[0]);

  const analyticsData = useLiveQuery(async () => {
    const startStr = startDate.toISOString();
    
    const [products, sales, purchases] = await Promise.all([
      local.products.toArray(),
      local.sales.where('date').aboveOrEqual(startStr.split('T')[0]).toArray(),
      local.purchases.where('date').aboveOrEqual(startStr.split('T')[0]).toArray()
    ]);

    const plProductIds = new Set(products.filter(p => p.includeInPL !== false).map(p => p.id));

    return months.map(month => {
      const start = startOfMonth(month);
      const end = endOfMonth(month);

      const monthSales = sales
        .filter(s => isWithinInterval(parseISO(s.date), { start, end }))
        .reduce((sum, s) => {
          const plItemsTotal = s.items
            .filter(item => plProductIds.has(item.productId))
            .reduce((itemSum, item) => itemSum + (item.quantity * item.price), 0);
          return sum + plItemsTotal;
        }, 0);

      const monthPurchases = purchases
        .filter(p => isWithinInterval(parseISO(p.date), { start, end }))
        .reduce((sum, p) => {
          const plItemsTotal = p.items
            .filter(item => plProductIds.has(item.productId))
            .reduce((itemSum, item) => itemSum + (item.quantity * item.price), 0);
          return sum + plItemsTotal;
        }, 0);

      return {
        name: format(month, 'MMM'),
        sales: monthSales,
        purchases: monthPurchases,
        profit: monthSales - monthPurchases
      };
    });
  }, [months, startDate]);

  if (!analyticsData) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="h-96 bg-white rounded-xl border border-gray-100 p-6 animate-pulse" />
          <div className="h-96 bg-white rounded-xl border border-gray-100 p-6 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h1 className="text-2xl font-bold text-gray-900">Business Analytics</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card title="Sales vs Purchases Trend">
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analyticsData}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorPurchases" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Legend />
                <Area type="monotone" dataKey="sales" stroke="#4f46e5" fillOpacity={1} fill="url(#colorSales)" strokeWidth={3} />
                <Area type="monotone" dataKey="purchases" stroke="#f59e0b" fillOpacity={1} fill="url(#colorPurchases)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Monthly Profit Trend">
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analyticsData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="profit" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
});

export default AnalyticsModule;
