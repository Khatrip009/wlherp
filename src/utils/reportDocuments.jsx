// src/utils/reportDocuments.jsx
import React from 'react';

/* ------------------------------------------------------------------ */
/*  Number‑to‑words helper (Indian English)                            */
/* ------------------------------------------------------------------ */
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

// ---------- Shared theme & layout helpers ----------
function useTheme(org) {
  const theme = org?.theme || {};
  return {
    primary: theme.primary_color || '#0D47A1',
    accent: theme.accent_color || '#D15839',
  };
}

// Common fixed letterhead background (image version – loads reliably)
function LetterheadBackground({ letterheadUrl }) {
  if (!letterheadUrl) return null;
  return (
    <img
      src={letterheadUrl}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        objectPosition: 'center',
        zIndex: -1,
        pointerEvents: 'none',
      }}
      alt=""
    />
  );
}

// Common content wrapper with letterhead margins
function ReportWrapper({ children, org, style }) {
  const { primary } = useTheme(org);
  return (
    <div style={{ position: 'relative', width: '100%', minHeight: '297mm' }}>
      <LetterheadBackground letterheadUrl={org?.letterhead_url} />
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          paddingTop: '85mm',
          paddingBottom: '40mm',      // increased from 25mm
          paddingLeft: '25mm',
          paddingRight: '25mm',
          boxSizing: 'border-box',
          fontFamily: 'Montserrat, sans-serif',
          color: '#222',
          lineHeight: 1.8,
          width: '100%',
          backgroundColor: 'transparent',
          fontSize: '24px',
          minHeight: '297mm',
          ...style,
        }}
      >
        {children}
      </div>
    </div>
  );
}

// Reusable section title
function SectionTitle({ children, primary }) {
  return (
    <h2
      style={{
        fontSize: '32px',
        fontWeight: 'bold',
        color: primary,
        borderBottom: `2px solid ${primary}`,
        paddingBottom: '8px',
        margin: '36px 0 18px',
      }}
    >
      {children}
    </h2>
  );
}

// ---------- ADMISSION FORM ----------
export function AdmissionFormDocument({ data, org }) {
  const student = data;
  const parents = student.parents || [];
  const batches = student.batches || [];
  const fees = student.fees || [];
  const totalFee = fees.reduce((s, f) => s + (f.final_fee || 0), 0);
  const paidFee = fees.reduce((s, f) => s + (f.paid || 0), 0);
  const pendingFee = totalFee - paidFee;

  const letterhead = org?.letterhead_url;
  const theme = org?.theme || {};
  const primary = theme.primary_color || '#0D47A1';
  const accent = theme.accent_color || '#D15839';

  const fixedBg = letterhead
    ? {
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundImage: `url(${letterhead})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        zIndex: -1,
        pointerEvents: 'none',
      }
    : null;

  const contentStyle = {
    position: 'relative',
    zIndex: 1,
    paddingTop: '85mm',
    paddingBottom: '60mm',      // increased to avoid footer overlap
    paddingLeft: '25mm',
    paddingRight: '25mm',
    boxSizing: 'border-box',
    fontFamily: 'Montserrat, sans-serif',
    color: '#222',
    lineHeight: 1.8,
    width: '100%',
    backgroundColor: 'transparent',
    fontSize: '24px',
    minHeight: '297mm',
  };

  const sectionTitle = {
    fontSize: '32px',
    fontWeight: 'bold',
    color: primary,
    borderBottom: `2px solid ${primary}`,
    paddingBottom: '8px',
    margin: '36px 0 18px',
  };

  const labelStyle = {
    width: '28%',
    fontWeight: 'bold',
    padding: '10px 14px',      // slightly reduced padding
    border: `1px solid ${primary}30`,
    backgroundColor: `${primary}15`,
    color: primary,
    fontSize: '20px',          // slightly smaller font
  };

  const valueStyle = {
    padding: '10px 14px',
    border: `1px solid ${primary}30`,
    fontSize: '20px',
  };

  const spacer = <div style={{ height: '85mm', width: '100%' }} />;

  return (
    <div style={{ position: 'relative' }}>
      {fixedBg && <div style={fixedBg} />}
      <div style={contentStyle} className="print-area">
        {/* Photo absolute top-right */}
        {student.photo_url ? (
          <img
            src={student.photo_url}
            style={{
              position: 'absolute',
              top: '85mm',
              right: '25mm',
              width: '40mm',
              height: '48mm',
              border: `2px solid ${primary}`,
              borderRadius: '4px',
              objectFit: 'cover',
              backgroundColor: '#fff',
            }}
            alt="Student"
          />
        ) : (
          <div
            style={{
              position: 'absolute',
              top: '85mm',
              right: '25mm',
              width: '40mm',
              height: '48mm',
              border: `2px solid ${primary}`,
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
              color: '#aaa',
              backgroundColor: '#fff',
            }}
          >
            Photo
          </div>
        )}

        <h2 style={{ ...sectionTitle, marginTop: 0 }}>Student Information</h2>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '16px' }}>
          <tbody>
            {[
              ['Admission No', student.admission_no?.toUpperCase() || '-'],
              ['Name', `${student.first_name?.toUpperCase()} ${student.last_name?.toUpperCase()}`],
              ['Gender', student.gender || '-'],
              ['Date of Birth', student.dob || '-'],
              ['Mobile', student.mobile],
              ['WhatsApp', student.whatsapp || '-'],
              ['Email', student.email || '-'],
              ['Address', [student.address, student.city, student.state, student.pincode].filter(Boolean).join(', ')],
              ['School', student.school_name || '-'],
              ['Board', student.board || '-'],
              ['Standard', student.standard || '-'],
              ['Joining Date', student.joining_date || '-'],
              ['Status', student.status || '-'],
              ...(student.mediums?.name ? [['Medium', student.mediums.name]] : []),
            ].map(([label, value], idx) => (
              <tr key={idx}>
                <td style={labelStyle}>{label}</td>
                <td style={valueStyle}>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {parents.length > 0 && (
          <>
            <h2 style={sectionTitle}>Parent / Guardian Details</h2>
            {parents.map((p, i) => (
              <div key={i} style={{ marginBottom: '20px', border: `1px solid ${primary}30`, padding: '14px', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {[
                      ['Father Name', p.father_name?.toUpperCase() || '-'],
                      ['Mother Name', p.mother_name?.toUpperCase() || '-'],
                      ['Mobile', p.mobile || '-'],
                      ['WhatsApp', p.whatsapp || '-'],
                      ['Email', p.email || '-'],
                      ['Occupation', p.occupation?.toUpperCase() || '-'],
                      ['Address', p.address?.toUpperCase() || '-'],
                    ].map(([label, value], j) => (
                      <tr key={j}>
                        <td style={labelStyle}>{label}</td>
                        <td style={valueStyle}>{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </>
        )}

        <div style={{ pageBreakBefore: 'always' }} />
        {spacer}

        {batches.length > 0 && (
          <>
            <h2 style={sectionTitle}>Enrolled Batches</h2>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '21px' }}>
              <thead>
                <tr style={{ backgroundColor: primary, color: '#fff' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left' }}>Batch Name</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left' }}>Course</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left' }}>Enrollment Date</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b, i) => (
                  <tr key={i}>
                    <td style={{ padding: '12px 16px', border: `1px solid ${primary}30` }}>{b.batches?.batch_name?.toUpperCase() || '-'}</td>
                    <td style={{ padding: '12px 16px', border: `1px solid ${primary}30` }}>{b.batches?.courses?.course_name?.toUpperCase() || '-'}</td>
                    <td style={{ padding: '12px 16px', border: `1px solid ${primary}30` }}>{b.enrollment_date || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <h2 style={sectionTitle}>Fee Summary</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '21px' }}>
          <thead>
            <tr style={{ backgroundColor: primary, color: '#fff' }}>
              <th style={{ padding: '12px 16px' }}>Total Fee</th>
              <th style={{ padding: '12px 16px' }}>Paid</th>
              <th style={{ padding: '12px 16px' }}>Pending</th>
              <th style={{ padding: '12px 16px' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: '12px 16px', border: `1px solid ${primary}30` }}>₹ {totalFee.toLocaleString()}</td>
              <td style={{ padding: '12px 16px', border: `1px solid ${primary}30` }}>₹ {paidFee.toLocaleString()}</td>
              <td style={{ padding: '12px 16px', border: `1px solid ${primary}30` }}>₹ {pendingFee.toLocaleString()}</td>
              <td style={{ padding: '12px 16px', border: `1px solid ${primary}30`, fontWeight: 'bold', color: pendingFee <= 0 ? accent : '#D32F2F' }}>{pendingFee <= 0 ? 'PAID' : 'PENDING'}</td>
            </tr>
          </tbody>
        </table>

        <h2 style={sectionTitle}>Rules & Regulations</h2>
        <ol style={{ paddingLeft: '28px', fontSize: '21px', color: '#333', lineHeight: 2.2 }}>
          <li>Minimum 75% attendance is mandatory to appear in exams.</li>
          <li>Fees must be paid on or before the 10th of every month.</li>
          <li>Mobile phones are strictly prohibited inside classrooms.</li>
          <li>Students must wear the prescribed uniform and carry ID card.</li>
          <li>Disciplinary action will be taken for any misconduct.</li>
          <li>Parents must attend parent-teacher meetings regularly.</li>
          <li>Any damage to institute property will be charged accordingly.</li>
          <li>The institute reserves the right to amend these rules at any time.</li>
        </ol>

        <h2 style={sectionTitle}>Signatures</h2>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '50px' }}>
          <div style={{ width: '45%', textAlign: 'center' }}>
            <div style={{ borderBottom: `1px solid ${primary}`, marginBottom: '12px' }} />
            <p style={{ fontWeight: 'bold', fontSize: '21px' }}>Authorised Signatory</p>
          </div>
          <div style={{ width: '45%', textAlign: 'center' }}>
            <div style={{ borderBottom: `1px solid ${primary}`, marginBottom: '12px' }} />
            <p style={{ fontWeight: 'bold', fontSize: '21px' }}>Parent / Guardian</p>
          </div>
        </div>

        <div style={{ marginTop: '50px', borderTop: `1px solid ${primary}30`, paddingTop: '16px', fontSize: '13px', color: '#888', textAlign: 'center' }}>
          This is a computer‑generated document issued by {org?.company_name || 'ShreeVidhya Academy'}.
        </div>
      </div>
    </div>
  );
}

// ---------- FEE RECEIPT ----------
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
  const { primary, accent } = useTheme(org);

  return (
    <ReportWrapper org={org}>
      <h2 style={{ fontSize: '32px', fontWeight: 'bold', color: primary, textAlign: 'center', marginBottom: '30px' }}>
        FEE RECEIPT
      </h2>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '30px', fontSize: '21px' }}>
        <div>
          <p style={{ fontWeight: 'bold', color: primary }}>Student Details</p>
          <p>Student: {student_name}</p>
          <p>Admission No: {admission_no}</p>
          {courseName && <p>Course: {courseName}</p>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontWeight: 'bold', color: primary }}>Receipt Details</p>
          <p>Receipt No: {receipt_no}</p>
          <p>Date: {payment_date}</p>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '30px', fontSize: '21px' }}>
        <thead>
          <tr style={{ backgroundColor: primary, color: '#fff' }}>
            <th style={{ padding: '12px', textAlign: 'center', width: '10%' }}>Sr.</th>
            <th style={{ padding: '12px', textAlign: 'left' }}>Description</th>
            <th style={{ padding: '12px', textAlign: 'right', width: '30%' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: '12px', textAlign: 'center', border: `1px solid ${primary}30` }}>1</td>
            <td style={{ padding: '12px', border: `1px solid ${primary}30` }}>Fee Payment</td>
            <td style={{ padding: '12px', textAlign: 'right', border: `1px solid ${primary}30` }}>₹{amount.toLocaleString('en-IN')}</td>
          </tr>
          {tax_rate_value > 0 && (
            <>
              <tr>
                <td style={{ padding: '12px', textAlign: 'center', border: `1px solid ${primary}30` }}></td>
                <td style={{ padding: '12px', border: `1px solid ${primary}30` }}>Base Amount ({tax_rate_name} {tax_rate_value}%)</td>
                <td style={{ padding: '12px', textAlign: 'right', border: `1px solid ${primary}30` }}>₹{base_amount.toLocaleString('en-IN')}</td>
              </tr>
              <tr>
                <td style={{ padding: '12px', textAlign: 'center', border: `1px solid ${primary}30` }}></td>
                <td style={{ padding: '12px', border: `1px solid ${primary}30` }}>Tax Amount</td>
                <td style={{ padding: '12px', textAlign: 'right', border: `1px solid ${primary}30` }}>₹{tax_amount.toLocaleString('en-IN')}</td>
              </tr>
            </>
          )}
        </tbody>
      </table>

      <div style={{ backgroundColor: `${primary}15`, padding: '20px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '21px' }}>
        <div>
          <p style={{ fontWeight: 'bold', color: primary }}>Total Amount Paid</p>
          <p style={{ fontSize: '24px', fontWeight: 'bold' }}>₹{totalDisplay.toLocaleString('en-IN')}</p>
          <p style={{ fontSize: '16px', color: '#555' }}>In Words: {amountWords}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p>Payment Mode: {payment_mode || 'N/A'}</p>
          <p>Transaction No: {transaction_no || '-'}</p>
          {remarks && <p>Remarks: {remarks}</p>}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '50px' }}>
        <div style={{ width: '45%', textAlign: 'center' }}>
          <div style={{ borderBottom: `1px solid ${primary}`, marginBottom: '10px' }} />
          <p style={{ fontWeight: 'bold', fontSize: '21px' }}>Authorised Signatory</p>
        </div>
        <div style={{ width: '45%', textAlign: 'center' }}>
          <div style={{ borderBottom: `1px solid ${primary}`, marginBottom: '10px' }} />
          <p style={{ fontWeight: 'bold', fontSize: '21px' }}>Parent / Guardian</p>
        </div>
      </div>

      <div style={{ marginTop: '50px', borderTop: `1px solid ${primary}30`, paddingTop: '16px', fontSize: '13px', color: '#888', textAlign: 'center' }}>
        This is a computer‑generated document issued by {org?.company_name || 'ShreeVidhya Academy'}.
      </div>
    </ReportWrapper>
  );
}

// ---------- INCOME RECEIPT ----------
export function IncomeReceiptDocument({ data, org }) {
  const { primary } = useTheme(org);
  return (
    <ReportWrapper org={org}>
      <SectionTitle primary={primary}>INCOME RECORD</SectionTitle>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '21px' }}>
        <tbody>
          <tr><td style={labelStyle(primary)}>ID</td><td style={valueStyle(primary)}>INC-{data.id}</td></tr>
          <tr><td style={labelStyle(primary)}>Date</td><td style={valueStyle(primary)}>{data.income_date}</td></tr>
          <tr><td style={labelStyle(primary)}>Category</td><td style={valueStyle(primary)}>{data.category}</td></tr>
          <tr><td style={labelStyle(primary)}>Base Amount</td><td style={valueStyle(primary)}>₹{data.base_amount || data.amount}</td></tr>
          <tr><td style={labelStyle(primary)}>Tax Amount</td><td style={valueStyle(primary)}>₹{data.tax_amount || 0}</td></tr>
          <tr><td style={labelStyle(primary)}>Total Amount</td><td style={valueStyle(primary)}>₹{data.amount}</td></tr>
          <tr><td style={labelStyle(primary)}>Payment Mode</td><td style={valueStyle(primary)}>{data.payment_mode}</td></tr>
          <tr><td style={labelStyle(primary)}>Description</td><td style={valueStyle(primary)}>{data.description}</td></tr>
        </tbody>
      </table>
      <div style={{ marginTop: '50px', borderTop: `1px solid ${primary}30`, paddingTop: '16px', fontSize: '13px', color: '#888', textAlign: 'center' }}>
        This is a computer‑generated document issued by {org?.company_name || 'ShreeVidhya Academy'}.
      </div>
    </ReportWrapper>
  );
}

// ---------- EXPENSE VOUCHER ----------
export function ExpenseReceiptDocument({ data, org }) {
  const { primary } = useTheme(org);
  return (
    <ReportWrapper org={org}>
      <SectionTitle primary={primary}>EXPENSE VOUCHER</SectionTitle>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '21px' }}>
        <tbody>
          <tr><td style={labelStyle(primary)}>Voucher No</td><td style={valueStyle(primary)}>EXP-{data.id}</td></tr>
          <tr><td style={labelStyle(primary)}>Date</td><td style={valueStyle(primary)}>{data.expense_date}</td></tr>
          <tr><td style={labelStyle(primary)}>Category</td><td style={valueStyle(primary)}>{data.category}</td></tr>
          <tr><td style={labelStyle(primary)}>Amount</td><td style={valueStyle(primary)}>₹{data.amount}</td></tr>
          <tr><td style={labelStyle(primary)}>Payment Mode</td><td style={valueStyle(primary)}>{data.payment_mode}</td></tr>
          <tr><td style={labelStyle(primary)}>Description</td><td style={valueStyle(primary)}>{data.description}</td></tr>
        </tbody>
      </table>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '50px' }}>
        <div style={{ width: '45%', textAlign: 'center' }}>
          <div style={{ borderBottom: `1px solid ${primary}`, marginBottom: '10px' }} />
          <p style={{ fontWeight: 'bold', fontSize: '21px' }}>Approved By</p>
        </div>
        <div style={{ width: '45%', textAlign: 'center' }}>
          <div style={{ borderBottom: `1px solid ${primary}`, marginBottom: '10px' }} />
          <p style={{ fontWeight: 'bold', fontSize: '21px' }}>Receiver Signature</p>
        </div>
      </div>
      <div style={{ marginTop: '50px', borderTop: `1px solid ${primary}30`, paddingTop: '16px', fontSize: '13px', color: '#888', textAlign: 'center' }}>
        This is a computer‑generated document issued by {org?.company_name || 'ShreeVidhya Academy'}.
      </div>
    </ReportWrapper>
  );
}

// ---------- SALARY SLIP ----------
export function SalarySlipDocument({ data, org }) {
  const { primary } = useTheme(org);
  return (
    <ReportWrapper org={org}>
      <SectionTitle primary={primary}>SALARY SLIP</SectionTitle>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '21px' }}>
        <tbody>
          <tr><td style={labelStyle(primary)}>Employee Code</td><td style={valueStyle(primary)}>{data.employee_code}</td></tr>
          <tr><td style={labelStyle(primary)}>Teacher Name</td><td style={valueStyle(primary)}>{data.teacher_name}</td></tr>
          <tr><td style={labelStyle(primary)}>Payment Date</td><td style={valueStyle(primary)}>{data.payment_date}</td></tr>
          <tr><td style={labelStyle(primary)}>Amount</td><td style={valueStyle(primary)}>₹{data.amount}</td></tr>
          <tr><td style={labelStyle(primary)}>Payment Mode</td><td style={valueStyle(primary)}>{data.payment_mode}</td></tr>
          <tr><td style={labelStyle(primary)}>Remarks</td><td style={valueStyle(primary)}>{data.remarks || '-'}</td></tr>
        </tbody>
      </table>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '50px' }}>
        <div style={{ width: '45%', textAlign: 'center' }}>
          <div style={{ borderBottom: `1px solid ${primary}`, marginBottom: '10px' }} />
          <p style={{ fontWeight: 'bold', fontSize: '21px' }}>Employee Signature</p>
        </div>
        <div style={{ width: '45%', textAlign: 'center' }}>
          <div style={{ borderBottom: `1px solid ${primary}`, marginBottom: '10px' }} />
          <p style={{ fontWeight: 'bold', fontSize: '21px' }}>Director Signature</p>
        </div>
      </div>
      <div style={{ marginTop: '50px', borderTop: `1px solid ${primary}30`, paddingTop: '16px', fontSize: '13px', color: '#888', textAlign: 'center' }}>
        This is a computer‑generated document issued by {org?.company_name || 'ShreeVidhya Academy'}.
      </div>
    </ReportWrapper>
  );
}

// ---------- CERTIFICATE ----------
export function CertificateDocument({ data, org }) {
  const { primary, accent } = useTheme(org);
  return (
    <ReportWrapper org={org}>
      <div style={{ border: `2px solid ${primary}`, padding: '20px', position: 'relative', minHeight: '180mm' }}>
        <div style={{ border: `1px solid ${primary}`, padding: '30px', height: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: 30 }}>
            {org?.logo_dark_url && <img src={org.logo_dark_url} style={{ height: '60px' }} alt="Logo" />}
            <h2 style={{ fontSize: 32, color: primary, margin: '15px 0 0' }}>{org?.company_name || 'ShreeVidhya Academy'}</h2>
            <p style={{ fontSize: 24, color: '#444' }}>Certificate of Completion</p>
            <hr style={{ borderColor: primary, width: '40%', margin: '15px auto' }} />
          </div>

          <p style={{ fontSize: 20, textAlign: 'center' }}>This is to certify that</p>
          <p style={{ fontSize: 32, fontWeight: 'bold', color: primary, textAlign: 'center', margin: '20px 0' }}>
            {data.student_name}
          </p>
          <p style={{ fontSize: 20, textAlign: 'center' }}>has successfully completed the course</p>
          <p style={{ fontSize: 28, fontWeight: 'bold', color: primary, textAlign: 'center' }}>
            {data.course_name}
          </p>
          {data.level_name && <p style={{ fontSize: 20, color: '#555', textAlign: 'center' }}>Level: {data.level_name}</p>}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '60px', padding: '0 40px' }}>
            <div>
              <p style={{ fontSize: 16 }}>Issue Date: {data.issue_date}</p>
              <p style={{ fontSize: 16 }}>Certificate No: {data.certificate_no}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ borderBottom: `1px solid ${primary}`, width: '180px', marginBottom: 8 }}></div>
              <p style={{ fontSize: 16 }}>Authorized Signatory</p>
            </div>
          </div>

          <div style={{ position: 'absolute', bottom: '40px', left: '50%', transform: 'translateX(-50%)' }}>
            <div style={{ width: 100, height: 100, border: `2px solid ${primary}`, borderRadius: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 'bold', color: primary }}>SHREEVIDHYA</span>
              <span style={{ fontSize: 12, color: primary }}>ACADEMY</span>
              <span style={{ fontSize: 11, color: primary }}>SEAL</span>
            </div>
          </div>
        </div>
      </div>
    </ReportWrapper>
  );
}

// Reusable label/value styles for small tables (Income/Expense/Salary)
function labelStyle(primary) {
  return {
    width: '30%',
    fontWeight: 'bold',
    padding: '11px 16px',
    border: `1px solid ${primary}30`,
    backgroundColor: `${primary}15`,
    color: primary,
    fontSize: '21px',
  };
}
function valueStyle(primary) {
  return {
    padding: '11px 16px',
    border: `1px solid ${primary}30`,
    fontSize: '21px',
  };
}