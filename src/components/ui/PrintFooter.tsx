import React from 'react';

interface PrintFooterProps {
  totals?: { credit?: number, debit?: number, balance?: number };
  labels?: { credit?: string, debit?: string, balance?: string };
}

const PrintFooter = ({ totals, labels }: PrintFooterProps) => (
  <div className="hidden print-only">
    {totals && (
      <div style={{ marginTop: '20px', borderTop: '1px solid #000', paddingTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
        <table style={{ width: '300px', border: 'none' }}>
          <tbody>
            {totals.credit !== undefined && (
              <tr>
                <td style={{ border: 'none', textAlign: 'right', padding: '4px' }}><strong>{labels?.credit || 'Total Credit'}:</strong></td>
                <td style={{ border: 'none', textAlign: 'right', padding: '4px' }}>₹{totals.credit.toLocaleString()}</td>
              </tr>
            )}
            {totals.debit !== undefined && (
              <tr>
                <td style={{ border: 'none', textAlign: 'right', padding: '4px' }}><strong>{labels?.debit || 'Total Debit'}:</strong></td>
                <td style={{ border: 'none', textAlign: 'right', padding: '4px' }}>₹{totals.debit.toLocaleString()}</td>
              </tr>
            )}
            {totals.balance !== undefined && (
              <tr style={{ borderTop: '1px solid #000' }}>
                <td style={{ border: 'none', textAlign: 'right', padding: '4px' }}><strong>{labels?.balance || 'Final Balance'}:</strong></td>
                <td style={{ border: 'none', textAlign: 'right', padding: '4px' }}>₹{totals.balance.toLocaleString()}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    )}
    <div style={{ marginTop: '40px', display: 'flex', justifyContent: 'space-between' }}>
      <div style={{ textAlign: 'center', width: '200px' }}>
        <div style={{ borderBottom: '1px solid #000', height: '40px' }}></div>
        <p style={{ fontSize: '12px', marginTop: '5px' }}>Prepared By</p>
      </div>
      <div style={{ textAlign: 'center', width: '200px' }}>
        <div style={{ borderBottom: '1px solid #000', height: '40px' }}></div>
        <p style={{ fontSize: '12px', marginTop: '5px' }}>Authorized Signature</p>
      </div>
    </div>
  </div>
);

export default PrintFooter;
