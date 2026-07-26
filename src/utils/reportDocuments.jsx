// src/utils/reportDocuments.jsx
import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { useOrg } from '../context/OrganizationContext';
import { generateReceiptPdf } from '../utils/receiptPdf';
import { generateAdmissionPdf } from '../utils/admissionPdf';
import { generateSalarySlipPDF } from '../utils/salarySlipPdf';
import { printAdmissionForm } from '../services/admissionPrintService';

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

// ─── Common header (used ONLY as fallback when letterhead is missing) ──
function DocumentHeader({ org, primary }) {
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
//   letterhead = true   → try to show letterhead image; if missing, fall back to DocumentHeader
//   letterhead = false  → no letterhead, no fallback header (content provides its own)
function ReportWrapper({ children, org, letterhead = true, primary }) {
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
    wrapperStyle.paddingTop = '50mm';
  }

  return (
    <div style={wrapperStyle}>
      {/* Only show the fallback header when letterhead is true but image is missing */}
      {letterhead && !org?.letterhead_url && <DocumentHeader org={org} primary={primary} />}
      <div style={{ position: 'relative', zIndex: 1 }}>
        {children}
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

// ─── ADMISSION FORM (Print + PDF, NO LETTERHEAD) ─────────
export function AdmissionFormDocument({ data, org }) {
  const { theme } = useTheme();
  const primary = theme?.primary_color || '#0D47A1';
  const accent = theme?.accent_color || '#D15839';
  
  const student = data;
  const parents = student.parents || [];
  const batches = student.batches || [];
  const fees = student.fees || [];
  const totalFee = fees.reduce((s, f) => s + (f.final_fee || 0), 0);
  const paidFee = fees.reduce((s, f) => s + (f.paid || 0), 0);
  const pendingFee = totalFee - paidFee;

  const handleDownloadPdf = async () => {
    try {
      await generateAdmissionPdf(student.id, { theme, orgId: org?.id });
    } catch (error) {
      console.error("Failed to generate admission PDF:", error);
    }
  };

  const handlePrint = () => {
    printAdmissionForm(student.id, { orgId: org?.id });
  };

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
    <ReportWrapper org={org} primary={primary} letterhead={false}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: '18px', color: primary, borderBottom: `2px solid ${primary}`, paddingBottom: '6px', margin: 0 }}>
          Student Information
        </h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handlePrint} style={{ padding: "8px 16px", background: "#fff", color: primary, border: `1px solid ${primary}`, borderRadius: 4, cursor: "pointer", fontSize: 13, fontWeight: "bold" }}>🖨️ Print</button>
          <button onClick={handleDownloadPdf} style={{ padding: "8px 16px", background: primary, color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, fontWeight: "bold" }}>⬇ Download PDF</button>
        </div>
      </div>
      {/* ... rest unchanged ... */}
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
      {/* ... parents, batches, fees, rules, signatures unchanged ... */}
      {parents.length > 0 && (
        <>
          <h2 style={{ fontSize: '16px', color: primary, borderBottom: `2px solid ${primary}`, paddingBottom: '4px', margin: '20px 0 12px' }}>Parent / Guardian Details</h2>
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
          <h2 style={{ fontSize: '16px', color: primary, borderBottom: `2px solid ${primary}`, paddingBottom: '4px', margin: '20px 0 12px' }}>Enrolled Batches</h2>
          <table style={tableStyles}>
            <thead><tr><th style={thStyles(primary)}>Batch Name</th><th style={thStyles(primary)}>Course</th><th style={thStyles(primary)}>Enrollment Date</th></tr></thead>
            <tbody>
              {batches.map((b, i) => (
                <tr key={i}><td style={tdStyles(primary)}>{b.batches?.batch_name?.toUpperCase() || '-'}</td><td style={tdStyles(primary)}>{b.batches?.courses?.course_name?.toUpperCase() || '-'}</td><td style={tdStyles(primary)}>{b.enrollment_date || '-'}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <h2 style={{ fontSize: '16px', color: primary, borderBottom: `2px solid ${primary}`, paddingBottom: '4px', margin: '20px 0 12px' }}>Fee Summary</h2>
      <table style={tableStyles}>
        <thead><tr><th style={thStyles(primary)}>Total Fee</th><th style={thStyles(primary)}>Paid</th><th style={thStyles(primary)}>Pending</th><th style={thStyles(primary)}>Status</th></tr></thead>
        <tbody>
          <tr>
            <td style={tdStyles(primary)}>₹ {totalFee.toLocaleString()}</td>
            <td style={tdStyles(primary)}>₹ {paidFee.toLocaleString()}</td>
            <td style={tdStyles(primary)}>₹ {pendingFee.toLocaleString()}</td>
            <td style={{ ...tdStyles(primary), fontWeight: 'bold', color: pendingFee <= 0 ? '#2E7D32' : '#D32F2F' }}>{pendingFee <= 0 ? 'PAID' : 'PENDING'}</td>
          </tr>
        </tbody>
      </table>
      <h2 style={{ fontSize: '16px', color: primary, borderBottom: `2px solid ${primary}`, paddingBottom: '4px', margin: '20px 0 12px' }}>Rules & Regulations</h2>
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
        <div style={{ width: '45%', textAlign: 'center' }}><div style={{ borderBottom: `1px solid ${primary}`, marginBottom: '6px' }} /><p style={{ fontWeight: 'bold', fontSize: '11px' }}>Authorised Signatory</p></div>
        <div style={{ width: '45%', textAlign: 'center' }}><div style={{ borderBottom: `1px solid ${primary}`, marginBottom: '6px' }} /><p style={{ fontWeight: 'bold', fontSize: '11px' }}>Parent / Guardian</p></div>
      </div>
    </ReportWrapper>
  );
}

// ─── FEE RECEIPT (unchanged) ─────────────────────────────
export function FeeReceiptDocument({ data, org }) {
  // ... same as before ...
}

// ─── INCOME RECEIPT (unchanged) ───────────────────────────
export function IncomeReceiptDocument({ data, org }) {
  // ... same as before ...
}

// ─── EXPENSE VOUCHER (unchanged) ──────────────────────────
export function ExpenseReceiptDocument({ data, org }) {
  // ... same as before ...
}

// ─── SALARY SLIP (letterhead removed, PDF download) ──────
export function SalarySlipDocument({ data, org }) {
  // ... same as before ...
}

// ─── CERTIFICATE (Premium Design, no extra header) ────────
// ─── CERTIFICATE (Professional, perfectly margined) ───────
export function CertificateDocument({ data, org }) {
  const { theme } = useTheme();
  const primary = theme?.primary_color || '#0D47A1';
  const gold = '#D4AF37';
  const headingFont = theme?.font_heading || 'Georgia, serif';
  const bodyFont = theme?.font_body || 'Lato, sans-serif';

  return (
    <ReportWrapper org={org} primary={primary} letterhead={false}>
      <div style={{
        position: 'relative',
        width: '100%',
        padding: '25mm 20mm',          // ample print margins (inside the wrapper)
        boxSizing: 'border-box',
        background: `linear-gradient(135deg, ${primary}06 0%, ${primary}02 100%)`,
        border: `4px double ${primary}`,
        borderRadius: '6px',
        fontFamily: bodyFont,
        color: '#222',
      }}>
        {/* Gold corner accents */}
        <div style={{ position: 'absolute', top: -1, left: -1, width: 35, height: 35, borderTop: `3px solid ${gold}`, borderLeft: `3px solid ${gold}` }} />
        <div style={{ position: 'absolute', top: -1, right: -1, width: 35, height: 35, borderTop: `3px solid ${gold}`, borderRight: `3px solid ${gold}` }} />
        <div style={{ position: 'absolute', bottom: -1, left: -1, width: 35, height: 35, borderBottom: `3px solid ${gold}`, borderLeft: `3px solid ${gold}` }} />
        <div style={{ position: 'absolute', bottom: -1, right: -1, width: 35, height: 35, borderBottom: `3px solid ${gold}`, borderRight: `3px solid ${gold}` }} />

        {/* Inner light border */}
        <div style={{
          border: `1px solid ${primary}25`,
          borderRadius: '4px',
          padding: '18mm 15mm',
          position: 'relative',
          textAlign: 'center',
        }}>
          {/* Watermark logo */}
          {org?.logo_dark_url && (
            <div style={{
              position: 'absolute',
              top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              opacity: 0.035,
              zIndex: 0,
              pointerEvents: 'none',
            }}>
              <img src={org.logo_dark_url} style={{ width: '160mm', maxWidth: '160mm' }} alt="" />
            </div>
          )}

          {/* Foreground content */}
          <div style={{ position: 'relative', zIndex: 1 }}>
            {/* Academy header */}
            <div style={{ marginBottom: '20px' }}>
              {org?.logo_dark_url && (
                <img src={org.logo_dark_url} style={{ height: '50px', marginBottom: '12px' }} alt="Logo" />
              )}
              <h1 style={{
                fontSize: '26px',
                fontWeight: 'bold',
                color: primary,
                fontFamily: headingFont,
                letterSpacing: '2px',
                margin: '0 0 8px 0',
                textTransform: 'uppercase',
              }}>
                {org?.company_name || 'ShreeVidhya Academy'}
              </h1>
              <div style={{ width: '50%', margin: '0 auto 18px', borderBottom: `2px solid ${gold}`, borderRadius: '2px' }} />
            </div>

            {/* Certificate title */}
            <h2 style={{
              fontSize: '20px',
              color: gold,
              fontFamily: headingFont,
              fontWeight: 400,
              letterSpacing: '1.2px',
              margin: '0 0 20px 0',
            }}>
              Certificate of Completion
            </h2>

            {/* Body */}
            <p style={{ fontSize: '15px', lineHeight: 1.8, margin: '0 0 8px' }}>
              This is to certify that
            </p>
            <p style={{
              fontSize: '24px',
              fontWeight: 'bold',
              color: primary,
              fontFamily: headingFont,
              margin: '10px 0',
              letterSpacing: '0.5px',
            }}>
              {data.student_name}
            </p>
            <p style={{ fontSize: '15px', lineHeight: 1.8, margin: '0 0 8px' }}>
              has successfully completed the course
            </p>
            <p style={{
              fontSize: '19px',
              fontWeight: 'bold',
              color: primary,
              fontFamily: headingFont,
              margin: '10px 0',
            }}>
              {data.course_name}
            </p>
            {data.level_name && (
              <p style={{
                fontSize: '13px',
                color: '#666',
                margin: '0 0 20px',
                fontStyle: 'italic',
              }}>
                Level: {data.level_name}
              </p>
            )}

            {/* Details and signature */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: '30px',
              padding: '0 10px',
              fontSize: '12px',
              color: '#444',
              textAlign: 'left',
            }}>
              <div>
                <p style={{ margin: '4px 0' }}>Issue Date: {data.issue_date}</p>
                <p style={{ margin: '4px 0' }}>Certificate No: {data.certificate_no}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ borderBottom: `1px solid ${primary}`, width: '140px', marginBottom: '6px', marginLeft: 'auto' }} />
                <p style={{ fontWeight: 'bold', margin: 0 }}>Authorized Signatory</p>
              </div>
            </div>

            {/* Gold seal */}
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '25px' }}>
              <div style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                border: `2px solid ${gold}`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '8px',
                fontWeight: 'bold',
                color: gold,
                fontFamily: headingFont,
                textTransform: 'uppercase',
                letterSpacing: '1px',
                boxShadow: `0 0 10px ${gold}20`,
                background: `${gold}10`,
              }}>
                <span style={{ fontSize: '10px', marginBottom: '2px' }}>🏆</span>
                <span>Shreevidhya</span>
                <span>Academy</span>
                <span style={{ fontSize: '6px', color: '#888' }}>SEAL</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ReportWrapper>
  );

}