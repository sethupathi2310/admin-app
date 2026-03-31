import React from 'react';
import { CompanyDetails, PrintData } from '../types';
import { format } from 'date-fns';

interface LedgerPrintViewProps extends PrintData {}

export const LedgerPrintView: React.FC<LedgerPrintViewProps> = ({
  title,
  subtitle,
  dateRange,
  companyDetails,
  columns,
  data,
  totals
}) => {
  return (
    <div className="print-only hidden print:block bg-white text-black p-0 m-0 w-full max-w-[210mm] mx-auto font-sans">
      {/* Header Section */}
      <div className="text-center mb-8 relative">
        <h1 className="text-2xl font-bold uppercase tracking-tight mb-1">{companyDetails.name}</h1>
        <p className="text-xs mb-1">{companyDetails.address}</p>
        <p className="text-xs mb-4">Phone: {companyDetails.phone} | Email: {companyDetails.email}</p>
        
        <div className="border-y-2 border-black py-2 my-4">
          <h2 className="text-lg font-bold uppercase tracking-widest">{title}</h2>
          {subtitle && <p className="text-sm font-medium mt-1">{subtitle}</p>}
          {dateRange && <p className="text-xs mt-1 italic">{dateRange}</p>}
        </div>
      </div>

      {/* Table Section */}
      <table className="w-full border-collapse border border-black text-[11px]">
        <thead>
          <tr className="bg-gray-100">
            {columns.map((col, index) => (
              <th 
                key={index} 
                style={{ width: col.width }}
                className={`border border-black p-2 font-bold uppercase ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-black">
              {columns.map((col, colIndex) => (
                <td 
                  key={colIndex} 
                  className={`border border-black p-2 ${col.align === 'right' ? 'text-right font-mono' : col.align === 'center' ? 'text-center' : 'text-left'}`}
                >
                  {row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Footer Section */}
      {totals && totals.length > 0 && (
        <div className="mt-4 flex justify-end">
          <div className="w-64 space-y-1">
            {totals.map((item, index) => (
              <div key={index} className={`flex justify-between border-b border-black pb-1 ${item.isBold ? 'font-bold' : ''}`}>
                <span className="text-xs uppercase">{item.label}:</span>
                <span className="font-mono text-sm">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Signature Section */}
      <div className="mt-20 flex justify-between px-8">
        <div className="text-center">
          <div className="w-48 border-t border-black pt-2">
            <p className="text-[10px] uppercase font-bold text-gray-600">Prepared By</p>
          </div>
        </div>
        <div className="text-center">
          <div className="w-48 border-t border-black pt-2">
            <p className="text-[10px] uppercase font-bold text-gray-600">Authorized Signature</p>
          </div>
        </div>
      </div>

      <div className="mt-8 text-[9px] text-gray-400 text-center italic">
        Generated on {format(new Date(), 'MMM dd, yyyy HH:mm')} | Powered by SMC PORTAL
      </div>
    </div>
  );
};
