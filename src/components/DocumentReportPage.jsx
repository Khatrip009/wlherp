import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Printer, Download, List, RotateCcw } from 'lucide-react';
import { getReportConfig } from '../utils/reportConfig';
import { getOrganization } from '../services/organizationService';
import { supabase } from '../api/supabase';
import { useOrg } from '../context/OrganizationContext';  // NEW

// PDF generators
import { generateAdmissionPdf } from '../utils/admissionPdf';
import { generateReceiptPdf } from '../utils/receiptPdf';
import { generateTeacherResumePdf } from '../utils/teacherResumePdf';

const PDF_GENERATORS = {
  admission_form: (record) => generateAdmissionPdf(record.id),
  fee_receipt: (record) => generateReceiptPdf(record),
  salary_slip: (record) => generateTeacherResumePdf(record.teacher_id),
};

/* ------------------------------------------------------------------ */
/*  Dropdown helpers (unchanged)                                       */
/* ------------------------------------------------------------------ */
const DROPDOWN_TABLES = { /* same as before */ };

function FilterDropdown({ field, filters, onChange }) { /* same as before */ }

export default function DocumentReportPage({ reportId }) {
  const config = useMemo(() => getReportConfig(reportId), [reportId]);
  const { org: currentOrg } = useOrg();   // NEW – get current organization

  // Pass org.id to getOrganization (updated service)
  const { data: org } = useQuery({
    queryKey: ['organization', currentOrg?.id],
    queryFn: () => getOrganization(currentOrg?.id),
    enabled: !!currentOrg?.id,
  });

  const [records, setRecords] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({});

  const fetchRecords = useCallback(async () => {
    if (!config) return;
    setLoading(true);
    try {
      const query = config.recordQuery(filters);
      const { data, error } = await query;
      if (error) throw error;
      const transformed = (data || []).map(row => config.recordTransform(row));
      setRecords(transformed);
      setCurrentIndex(prev => (prev >= transformed.length ? 0 : prev));
    } catch (err) {
      console.error(err);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [config, filters]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  const currentRecord = records[currentIndex] || null;

  const goTo = (index) => { if (index >= 0 && index < records.length) setCurrentIndex(index); };
  const handlePrev = () => goTo(currentIndex - 1);
  const handleNext = () => goTo(currentIndex + 1);

  const handlePrint = () => {
    if (!currentRecord) return;
    const previewEl = document.querySelector('.document-preview');
    if (!previewEl) return window.print();

    const content = previewEl.innerHTML;
    const orgLogo = org?.logo_dark_url || '/ShreeVidhyaDark.png';
    const orgName = org?.company_name || 'ShreeVidhya Academy';

    const printWindow = window.open('', '_blank', 'width=900,height=650');
    printWindow.document.write(`
      <html>
        <head>
          <title>${config.title}</title>
          <style>
            body { font-family: Montserrat, sans-serif; margin: 20px; color: #333; }
            @media print { body { margin: 0; } }
          </style>
        </head>
        <body>${content}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handlePDF = async () => {
    if (!currentRecord) return;
    const generatePdf = PDF_GENERATORS[reportId];
    if (generatePdf) {
      try {
        await generatePdf(currentRecord);
        return;
      } catch (err) {
        console.error('PDF generation failed:', err);
      }
    }
    handlePrint();
  };

  const handleFilterChange = (field, value) => setFilters(prev => ({ ...prev, [field]: value }));
  const resetFilters = () => setFilters({});

  if (!config) return <div className="p-6 text-center text-red-600">Report not found.</div>;

  const DocumentComponent = config.documentComponent;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Back button */}
      <Link to="/reports" className="inline-flex items-center gap-2 text-secondary hover:text-primary-dark mb-4 font-montserrat text-sm">
        <ArrowLeft size={18} /> Back to Reports
      </Link>

      {/* Header & buttons */}
      <div className="flex flex-col sm:flex-row items-center justify-between mb-6 print:hidden gap-4">
        <h2 className="text-2xl font-righteous text-primary">{config.title}</h2>
        <div className="flex items-center gap-3">
          <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg">
            <Printer size={16} /> Print
          </button>
          <button onClick={handlePDF} className="flex items-center gap-2 px-4 py-2 bg-primary-light text-white rounded-lg">
            <Download size={16} /> PDF
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      {config.fields && config.fields.length > 0 && (
        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 mb-6 print:hidden">
          <div className="flex flex-wrap items-end gap-4">
            {config.fields.map((field) => (
              <div key={field} className="flex flex-col min-w-[160px]">
                <label className="text-sm font-medium text-secondary-dark mb-1 capitalize">{field.replace(/_/g, ' ')}</label>
                {DROPDOWN_TABLES[field] ? (
                  <FilterDropdown field={field} filters={filters} onChange={handleFilterChange} />
                ) : (
                  <input
                    type="text"
                    placeholder={`Search ${field}`}
                    value={filters[field] || ''}
                    onChange={(e) => handleFilterChange(field, e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                )}
              </div>
            ))}
            <button onClick={resetFilters} className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-100 self-end">
              <RotateCcw size={14} /> Reset
            </button>
          </div>
        </div>
      )}

      {/* Record selector and navigation */}
      {loading ? (
        <div className="text-center py-20">Loading records…</div>
      ) : records.length === 0 ? (
        <div className="text-center py-20 text-secondary">No records found.</div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4 print:hidden">
            <div className="flex items-center gap-3">
              <div className="relative">
                <select
                  value={currentIndex}
                  onChange={(e) => goTo(Number(e.target.value))}
                  className="appearance-none bg-white border border-gray-300 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {records.map((rec, idx) => (
                    <option key={idx} value={idx}>
                      {config.title === 'Admission Form'
                        ? `${rec.admission_no} - ${rec.first_name} ${rec.last_name}`
                        : config.title === 'Fee Receipt'
                        ? `RCP-${rec.id} - ${rec.student_name}`
                        : config.title === 'Salary Slip'
                        ? `${rec.employee_code} - ${rec.teacher_name}`
                        : `Record ${idx + 1}`}
                    </option>
                  ))}
                </select>
                <List className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              </div>

              <div className="flex items-center gap-1">
                <button onClick={handlePrev} disabled={currentIndex === 0} className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50">
                  <ArrowLeft size={18} />
                </button>
                <span className="text-sm font-medium w-16 text-center">{currentIndex + 1} / {records.length}</span>
                <button onClick={handleNext} disabled={currentIndex === records.length - 1} className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50">
                  <ArrowRight size={18} />
                </button>
              </div>
            </div>
          </div>

          {/* Document Preview */}
          <div className="document-preview bg-white shadow-xl rounded-2xl p-6 md:p-10 border">
            {currentRecord && <DocumentComponent data={currentRecord} org={org} />}
          </div>
        </>
      )}
    </div>
  );
}