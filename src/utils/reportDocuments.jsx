import React from 'react';

// ─── Number‑to‑words helper ───────────────────────────────
function numberToWords(num) {
  const a = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"
  ];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function convert(n) {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 ? " " + a[n % 10] : "");
    if (n < 1000) return a[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " and " + convert(n % 100) : "");
    if (n < 100000) return convert(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + convert(n % 1000) : "");
    if (n < 10000000) return convert(Math.floor(n / 100000)) + " Lakh" + (n % 100000 ? " " + convert(n % 100000) : "");
    return convert(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 ? " " + convert(n % 10000000) : "");
  }
  return num === 0 ? "Zero" : convert(num);
}

// ─── Theme helper ──────────────────────────────────────────
function useTheme(org) {
  const theme = org?.theme || {};
  return {
    primary: theme.primary_color || '#0D47A1',
    accent: theme.accent_color || '#D15839',
  };
}

// ─── Common header (used when no letterhead) ──────────────
function DocumentHeader({ org }) {
  const { primary } = useTheme(org);
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottom: `2px solid ${primary}`,
      paddingBottom: '10px',
      marginBottom: '20px',
    }}>
      <div>
        {org?.logo_dark_url && (
          <img src={org.logo_dark_url} alt="Logo" style={{ height: '40px', marginRight: '15px' }} />
        )}
        <span style={{ fontSize: '18px', fontWeight: 'bold', color: primary }}>
          {org?.company_name || 'ShreeVidhya Academy'}
        </span>
        <div style={{ fontSize: '10px', color: '#555' }}>
          {org?.address && <span>{org.address} | </span>}
          {org?.phone && <span>Ph: {org.phone} | </span>}
          {org?.email && <span>Email: {org.email}</span>}
          {org?.gstin && <span> | GSTIN: {org.gstin}</span>}
        </div>
      </div>
      <div style={{ fontSize: '10px', color: '#888', textAlign: 'right' }}>
        {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}
      </div>
    </div>
  );
}

// ─── Wrapper with letterhead support ──────────────────────
function ReportWrapper({ children, org, letterhead = true }) {
  const { primary } = useTheme(org);

  const wrapperStyle = {
    position: 'relative',
    width: '100%',
    minHeight: '297mm',
    padding: '15mm 20mm',
    boxSizing: 'border-box',
    fontFamily: 'Montserrat, Arial, sans-serif',
    color: '#222',
    lineHeight: 1.6,
    backgroundColor: '#fff',
  };

  if (letterhead && org?.letterhead_url) {
    wrapperStyle.backgroundImage = `url(${org.letterhead_url})`;
    wrapperStyle.backgroundSize = '100% 100%';
    wrapperStyle.backgroundRepeat = 'no-repeat';
    wrapperStyle.paddingTop = '50mm'; // to leave room for letterhead
  }

  return (
    <div style={wrapperStyle}>
      {/* If letterhead is off or missing, show a custom header */}
      {(!letterhead || !org?.letterhead_url) && <DocumentHeader org={org} />}
      <div style={{ position: 'relative', zIndex: 1 }}>
        {children}
        {/* Footer */}
        <div style={{
          borderTop: `1px solid ${primary}30`,
          marginTop: '30px',
          paddingTop: '10px',
          fontSize: '9px',
          color: '#888',
          textAlign: 'center',
        }}>
          This is a computer‑generated document issued by {org?.company_name || 'ShreeVidhya Academy'}.
        </div>
      </div>
    </div>
  );
}

// ─── Shared table styles ──────────────────────────────────
const tableStyles = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '12px',
  marginBottom: '20px',
};

const thStyles = (primary) => ({
  backgroundColor: primary,
  color: '#fff',
  padding: '8px 12px',
  textAlign: 'left',
  fontWeight: 'bold',
});

const tdStyles = (primary) => ({
  padding: '6px 12px',
  borderBottom: `1px solid ${primary}30`,
});

const labelStyles = (primary) => ({
  fontWeight: 'bold',
  backgroundColor: `${primary}10`,
  padding: '6px 12px',
  border: `1px solid ${primary}30`,
  fontSize: '12px',
});

const valueStyles = {
  padding: '6px 12px',
  border: `1px solid #ddd`,
  fontSize: '12px',
};

// ─── ADMISSION FORM ──────────────────────────────────────
export function AdmissionFormDocument({ data, org }) {
  const student = data;
  const parents = student.parents || [];
  const batches = student.batches || [];
  const fees = student.fees || [];
  const totalFee = fees.reduce((s, f) => s + (f.final_fee || 0), 0);
  const paidFee = fees.reduce((s, f) => s + (f.paid || 0), 0);
  const pendingFee = totalFee - paidFee;
  const { primary } = useTheme(org);

  // Build student details rows
  const studentRows = [
    ['Admission No', student.admission_no?.toUpperCase() || '-'],
    ['Name', `${student.first_name || ''} ${student.last_name || ''}`.toUpperCase()],
    ['Gender', student.gender || '-'],
    ['Date of Birth', student.dob || '-'],
    ['Mobile', student.mobile || '-'],
    ['WhatsApp', student.whatsapp || '-'],
    ['Email', student.email || '-'],
    ['Address', [student.address, student.city, student.state, student.pincode].filter(Boolean).join(', ')],
    ['School', student.school_name || '-'],
    ['Board', student.board || '-'],
    ['Standard', student.standard || '-'],
    ['Joining Date', student.joining_date || '-'],
    ['Status', student.status || '-'],
    ...(student.mediums?.name ? [['Medium', student.mediums.name]] : []),
  ];

  return (
    <ReportWrapper org={org}>
      <h2 style={{ fontSize: '18px', color: primary, borderBottom: `2px solid ${primary}`, paddingBottom: '6px', marginBottom: '16px' }}>
        Student Information
      </h2>

      {/* Photo (if available) */}
      {student.photo_url && (
        <div style={{ float: 'right', marginLeft: '15px', marginBottom: '15px', border: `1px solid ${primary}` }}>
          <img src={student.photo_url} style={{ width: '80px', height: '100px', objectFit: 'cover' }} alt="Student" />
        </div>
      )}

      <table style={tableStyles}>
        <tbody>
          {studentRows.map(([label, value], i) => (
            <tr key={i}>
              <td style={{ ...labelStyles(primary), width: '30%' }}>{label}</td>
              <td style={{ ...valueStyles, width: '70%' }}>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {parents.length > 0 && (
        <>
          <h2 style={{ fontSize: '16px', color: primary, borderBottom: `2px solid ${primary}`, paddingBottom: '4px', margin: '20px 0 12px' }}>
            Parent / Guardian Details
          </h2>
          {parents.map((p, i) => (
            <div key={i} style={{ marginBottom: '15px', border: `1px solid ${primary}30`, padding: '12px', borderRadius: '4px' }}>
              <table style={tableStyles}>
                <tbody>
                  {[
                    ['Father Name', p.father_name?.toUpperCase() || '-'],
                    ['Mother Name', p.mother_name?.toUpperCase() || '-'],
                    ['Mobile', p.mobile || '-'],
                    ['WhatsApp', p.whatsapp || '-'],
                    ['Email', p.email || '-'],
                    ['Occupation', p.occupation?.toUpperCase() || '-'],
                    ['Address', p.address?.toUpperCase() || '-'],
                  ].map(([lbl, val], j) => (
                    <tr key={j}>
                      <td style={{ ...labelStyles(primary), width: '30%' }}>{lbl}</td>
                      <td style={{ ...valueStyles, width: '70%' }}>{val}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </>
      )}

      {batches.length > 0 && (
        <>
          <h2 style={{ fontSize: '16px', color: primary, borderBottom: `2px solid ${primary}`, paddingBottom: '4px', margin: '20px 0 12px' }}>
            Enrolled Batches
          </h2>
          <table style={tableStyles}>
            <thead>
              <tr><th style={thStyles(primary)}>Batch Name</th><th style={thStyles(primary)}>Course</th><th style={thStyles(primary)}>Enrollment Date</th></tr>
            </thead>
            <tbody>
              {batches.map((b, i) => (
                <tr key={i}>
                  <td style={tdStyles(primary)}>{b.batches?.batch_name?.toUpperCase() || '-'}</td>
                  <td style={tdStyles(primary)}>{b.batches?.courses?.course_name?.toUpperCase() || '-'}</td>
                  <td style={tdStyles(primary)}>{b.enrollment_date || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h2 style={{ fontSize: '16px', color: primary, borderBottom: `2px solid ${primary}`, paddingBottom: '4px', margin: '20px 0 12px' }}>
        Fee Summary
      </h2>
      <table style={tableStyles}>
        <thead>
          <tr><th style={thStyles(primary)}>Total Fee</th><th style={thStyles(primary)}>Paid</th><th style={thStyles(primary)}>Pending</th><th style={thStyles(primary)}>Status</th></tr>
        </thead>
        <tbody>
          <tr>
            <td style={tdStyles(primary)}>₹ {totalFee.toLocaleString()}</td>
            <td style={tdStyles(primary)}>₹ {paidFee.toLocaleString()}</td>
            <td style={tdStyles(primary)}>₹ {pendingFee.toLocaleString()}</td>
            <td style={{ ...tdStyles(primary), fontWeight: 'bold', color: pendingFee <= 0 ? '#2E7D32' : '#D32F2F' }}>
              {pendingFee <= 0 ? 'PAID' : 'PENDING'}
            </td>
          </tr>
        </tbody>
      </table>

      <h2 style={{ fontSize: '16px', color: primary, borderBottom: `2px solid ${primary}`, paddingBottom: '4px', margin: '20px 0 12px' }}>
        Rules & Regulations
      </h2>
      <ol style={{ paddingLeft: '20px', fontSize: '11px', lineHeight: 2, color: '#333' }}>
        <li>Minimum 75% attendance is mandatory to appear in exams.</li>
        <li>Fees must be paid on or before the 10th of every month.</li>
        <li>Mobile phones are strictly prohibited inside classrooms.</li>
        <li>Students must wear the prescribed uniform and carry ID card.</li>
        <li>Disciplinary action will be taken for any misconduct.</li>
        <li>Parents must attend parent-teacher meetings regularly.</li>
        <li>Any damage to institute property will be charged accordingly.</li>
        <li>The institute reserves the right to amend these rules at any time.</li>
      </ol>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '40px' }}>
        <div style={{ width: '45%', textAlign: 'center' }}>
          <div style={{ borderBottom: `1px solid ${primary}`, marginBottom: '6px' }} />
          <p style={{ fontWeight: 'bold', fontSize: '11px' }}>Authorised Signatory</p>
        </div>
        <div style={{ width: '45%', textAlign: 'center' }}>
          <div style={{ borderBottom: `1px solid ${primary}`, marginBottom: '6px' }} />
          <p style={{ fontWeight: 'bold', fontSize: '11px' }}>Parent / Guardian</p>
        </div>
      </div>
    </ReportWrapper>
  );
}

// ─── FEE RECEIPT ───────────────────────────────────────────
export function FeeReceiptDocument({ data, org }) {
  const {
    receipt_no,
    payment_date,
    student_name,
    admission_no,
    base_amount = 0,
    tax_amount = 0,
    amount = 0,
    payment_mode,
    transaction_no,
    remarks,
    tax_rate_name,
    tax_rate_value,
    tax_inclusive,
    courseName,
  } = data;

  const totalDisplay = tax_rate_value > 0
    ? (tax_inclusive ? amount : base_amount + tax_amount)
    : amount;

  const amountWords = numberToWords(totalDisplay) + " Only";
  const { primary } = useTheme(org);

  return (
    <ReportWrapper org={org}>
      <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: primary, textAlign: 'center', marginBottom: '20px' }}>
        FEE RECEIPT
      </h2>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '20px' }}>
        <div>
          <p><strong>Student:</strong> {student_name}</p>
          <p><strong>Admission No:</strong> {admission_no}</p>
          {courseName && <p><strong>Course:</strong> {courseName}</p>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <p><strong>Receipt No:</strong> {receipt_no}</p>
          <p><strong>Date:</strong> {payment_date}</p>
        </div>
      </div>

      <table style={tableStyles}>
        <thead>
          <tr>
            <th style={thStyles(primary)} style={{ width: '10%', textAlign: 'center' }}>#</th>
            <th style={thStyles(primary)}>Description</th>
            <th style={thStyles(primary)} style={{ width: '30%', textAlign: 'right' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ ...tdStyles(primary), textAlign: 'center' }}>1</td>
            <td style={tdStyles(primary)}>Fee Payment</td>
            <td style={{ ...tdStyles(primary), textAlign: 'right' }}>₹ {amount.toLocaleString('en-IN')}</td>
          </tr>
          {tax_rate_value > 0 && (
            <>
              <tr>
                <td style={{ ...tdStyles(primary), textAlign: 'center' }}></td>
                <td style={tdStyles(primary)}>Base Amount ({tax_rate_name} {tax_rate_value}%)</td>
                <td style={{ ...tdStyles(primary), textAlign: 'right' }}>₹ {base_amount.toLocaleString('en-IN')}</td>
              </tr>
              <tr>
                <td style={{ ...tdStyles(primary), textAlign: 'center' }}></td>
                <td style={tdStyles(primary)}>Tax Amount</td>
                <td style={{ ...tdStyles(primary), textAlign: 'right' }}>₹ {tax_amount.toLocaleString('en-IN')}</td>
              </tr>
            </>
          )}
        </tbody>
      </table>

      <div style={{ backgroundColor: `${primary}10`, padding: '16px', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
        <div>
          <p><strong>Total Amount Paid</strong></p>
          <p style={{ fontSize: '18px', fontWeight: 'bold' }}>₹ {totalDisplay.toLocaleString('en-IN')}</p>
          <p style={{ fontSize: '10px', color: '#555' }}>In Words: {amountWords}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p><strong>Payment Mode:</strong> {payment_mode || 'N/A'}</p>
          <p><strong>Transaction No:</strong> {transaction_no || '-'}</p>
          {remarks && <p><strong>Remarks:</strong> {remarks}</p>}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '30px' }}>
        <div style={{ width: '45%', textAlign: 'center' }}>
          <div style={{ borderBottom: `1px solid ${primary}`, marginBottom: '6px' }} />
          <p style={{ fontSize: '11px', fontWeight: 'bold' }}>Authorised Signatory</p>
        </div>
        <div style={{ width: '45%', textAlign: 'center' }}>
          <div style={{ borderBottom: `1px solid ${primary}`, marginBottom: '6px' }} />
          <p style={{ fontSize: '11px', fontWeight: 'bold' }}>Parent / Guardian</p>
        </div>
      </div>
    </ReportWrapper>
  );
}

// ─── INCOME RECEIPT ─────────────────────────────────────────
export function IncomeReceiptDocument({ data, org }) {
  const { primary } = useTheme(org);
  const rows = [
    ['ID', `INC-${data.id}`],
    ['Date', data.income_date],
    ['Category', data.category],
    ['Base Amount', `₹ ${(data.base_amount || data.amount).toLocaleString('en-IN')}`],
    ['Tax Amount', `₹ ${(data.tax_amount || 0).toLocaleString('en-IN')}`],
    ['Total Amount', `₹ ${data.amount.toLocaleString('en-IN')}`],
    ['Payment Mode', data.payment_mode],
    ['Description', data.description || '-'],
  ];
  return (
    <ReportWrapper org={org}>
      <h2 style={{ fontSize: '18px', color: primary, borderBottom: `2px solid ${primary}`, paddingBottom: '6px', marginBottom: '16px' }}>
        Income Record
      </h2>
      <table style={tableStyles}>
        <tbody>
          {rows.map(([label, value], i) => (
            <tr key={i}>
              <td style={{ ...labelStyles(primary), width: '30%' }}>{label}</td>
              <td style={{ ...valueStyles, width: '70%' }}>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ReportWrapper>
  );
}

// ─── EXPENSE VOUCHER ──────────────────────────────────────
export function ExpenseReceiptDocument({ data, org }) {
  const { primary } = useTheme(org);
  const rows = [
    ['Voucher No', `EXP-${data.id}`],
    ['Date', data.expense_date],
    ['Category', data.category],
    ['Amount', `₹ ${data.amount.toLocaleString('en-IN')}`],
    ['Payment Mode', data.payment_mode],
    ['Description', data.description || '-'],
  ];
  return (
    <ReportWrapper org={org}>
      <h2 style={{ fontSize: '18px', color: primary, borderBottom: `2px solid ${primary}`, paddingBottom: '6px', marginBottom: '16px' }}>
        Expense Voucher
      </h2>
      <table style={tableStyles}>
        <tbody>
          {rows.map(([label, value], i) => (
            <tr key={i}>
              <td style={{ ...labelStyles(primary), width: '30%' }}>{label}</td>
              <td style={{ ...valueStyles, width: '70%' }}>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '30px' }}>
        <div style={{ width: '45%', textAlign: 'center' }}>
          <div style={{ borderBottom: `1px solid ${primary}`, marginBottom: '6px' }} />
          <p style={{ fontSize: '11px', fontWeight: 'bold' }}>Approved By</p>
        </div>
        <div style={{ width: '45%', textAlign: 'center' }}>
          <div style={{ borderBottom: `1px solid ${primary}`, marginBottom: '6px' }} />
          <p style={{ fontSize: '11px', fontWeight: 'bold' }}>Receiver Signature</p>
        </div>
      </div>
    </ReportWrapper>
  );
}

// ─── SALARY SLIP ──────────────────────────────────────────
export function SalarySlipDocument({ data, org }) {
  const { primary } = useTheme(org);
  const rows = [
    ['Employee Code', data.employee_code],
    ['Teacher Name', data.teacher_name],
    ['Payment Date', data.payment_date],
    ['Amount', `₹ ${data.amount.toLocaleString('en-IN')}`],
    ['Payment Mode', data.payment_mode],
    ['Remarks', data.remarks || '-'],
  ];
  return (
    <ReportWrapper org={org}>
      <h2 style={{ fontSize: '18px', color: primary, borderBottom: `2px solid ${primary}`, paddingBottom: '6px', marginBottom: '16px' }}>
        Salary Slip
      </h2>
      <table style={tableStyles}>
        <tbody>
          {rows.map(([label, value], i) => (
            <tr key={i}>
              <td style={{ ...labelStyles(primary), width: '30%' }}>{label}</td>
              <td style={{ ...valueStyles, width: '70%' }}>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '30px' }}>
        <div style={{ width: '45%', textAlign: 'center' }}>
          <div style={{ borderBottom: `1px solid ${primary}`, marginBottom: '6px' }} />
          <p style={{ fontSize: '11px', fontWeight: 'bold' }}>Employee Signature</p>
        </div>
        <div style={{ width: '45%', textAlign: 'center' }}>
          <div style={{ borderBottom: `1px solid ${primary}`, marginBottom: '6px' }} />
          <p style={{ fontSize: '11px', fontWeight: 'bold' }}>Director Signature</p>
        </div>
      </div>
    </ReportWrapper>
  );
}

// ─── CERTIFICATE ───────────────────────────────────────────
export function CertificateDocument({ data, org }) {
  const { primary, accent } = useTheme(org);
  return (
    <ReportWrapper org={org}>
      <div style={{ border: `2px solid ${primary}`, padding: '20px', position: 'relative', minHeight: '200mm' }}>
        <div style={{ border: `1px solid ${primary}`, padding: '30px', height: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            {org?.logo_dark_url && <img src={org.logo_dark_url} style={{ height: '50px' }} alt="Logo" />}
            <h2 style={{ fontSize: '24px', color: primary, margin: '10px 0 0' }}>{org?.company_name || 'ShreeVidhya Academy'}</h2>
            <p style={{ fontSize: '18px', color: '#444' }}>Certificate of Completion</p>
            <hr style={{ borderColor: primary, width: '40%', margin: '10px auto' }} />
          </div>

          <p style={{ fontSize: '14px', textAlign: 'center' }}>This is to certify that</p>
          <p style={{ fontSize: '24px', fontWeight: 'bold', color: primary, textAlign: 'center', margin: '15px 0' }}>
            {data.student_name}
          </p>
          <p style={{ fontSize: '14px', textAlign: 'center' }}>has successfully completed the course</p>
          <p style={{ fontSize: '20px', fontWeight: 'bold', color: primary, textAlign: 'center' }}>
            {data.course_name}
          </p>
          {data.level_name && <p style={{ fontSize: '14px', color: '#555', textAlign: 'center' }}>Level: {data.level_name}</p>}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '40px', padding: '0 20px' }}>
            <div>
              <p style={{ fontSize: '12px' }}>Issue Date: {data.issue_date}</p>
              <p style={{ fontSize: '12px' }}>Certificate No: {data.certificate_no}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ borderBottom: `1px solid ${primary}`, width: '150px', marginBottom: '6px' }} />
              <p style={{ fontSize: '12px' }}>Authorized Signatory</p>
            </div>
          </div>

          <div style={{ position: 'absolute', bottom: '30px', left: '50%', transform: 'translateX(-50%)' }}>
            <div style={{ width: '80px', height: '80px', border: `2px solid ${primary}`, borderRadius: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: '10px', fontWeight: 'bold', color: primary, textAlign: 'center' }}>SHREEVIDHYA</span>
              <span style={{ fontSize: '9px', color: primary }}>ACADEMY</span>
              <span style={{ fontSize: '8px', color: primary }}>SEAL</span>
            </div>
          </div>
        </div>
      </div>
    </ReportWrapper>
  );
}