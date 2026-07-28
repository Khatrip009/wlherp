// src/pages/DocumentReportPage.jsx
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Printer,
  Download,
  List,
  RotateCcw,
} from 'lucide-react';
import { getReportConfig } from '../utils/reportConfig';
import { supabase } from '../api/supabase';
import { useOrg } from '../context/OrganizationContext';
import { useTheme } from '../context/ThemeContext';

// PDF generators
import { generateAdmissionPdf } from '../utils/admissionPdf';
import { generateReceiptPdf } from '../utils/receiptPdf';
import { generateSalarySlipPDF } from '../utils/salarySlipPdf';

/* ------------------------------------------------------------------ */
/*  Dropdown tables mapping                                            */
/* ------------------------------------------------------------------ */
const DROPDOWN_TABLES = {
  batch_id: 'batches',
  course_id: 'courses',
  medium_id: 'mediums',
  student_id: 'students',
  teacher_id: 'teachers',
};

const BRANCH_SCOPED_TABLES = ['batches', 'students', 'teachers', 'fee_structures'];
const ORG_SCOPED_TABLES = ['courses'];

/* ------------------------------------------------------------------ */
/*  FilterDropdown component – hooks always at top                    */
/* ------------------------------------------------------------------ */
function FilterDropdown({ field, filters, onChange, branchId, financialYearId, organizationId }) {
  const table = DROPDOWN_TABLES[field];
  const theme = useTheme();
  const bodyFont = theme?.font_body || 'Montserrat';

  const shouldScopeBranch = table && BRANCH_SCOPED_TABLES.includes(table);
  const shouldScopeOrg = table && ORG_SCOPED_TABLES.includes(table);

  const { data: options = [], isLoading } = useQuery({
    queryKey: ['doc-dropdown', table, branchId, financialYearId, organizationId],
    queryFn: async () => {
      if (!table) return [];
      let query = supabase.from(table).select('*').order('name');

      if (shouldScopeBranch && branchId && financialYearId) {
        query = query.eq('branch_id', branchId).eq('financial_year_id', financialYearId);
      }
      if (shouldScopeOrg && organizationId) {
        query = query.eq('organization_id', organizationId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!table,
  });

  if (!table) return null;

  return (
    <select
      value={filters[field] || ''}
      onChange={(e) => onChange(field, e.target.value)}
      className="border border-primary-bg bg-white text-primary-dark rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
      style={{ fontFamily: bodyFont }}
    >
      <option value="">All</option>
      {isLoading ? (
        <option disabled>Loading…</option>
      ) : (
        options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.name || opt.batch_name || opt.course_name || opt.first_name || opt.id}
          </option>
        ))
      )}
    </select>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */
export default function DocumentReportPage({ reportId }) {
  const config = useMemo(() => getReportConfig(reportId), [reportId]);

  const { org, branch, selectedFinancialYear } = useOrg();
  const theme = useTheme();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const organizationId = org?.id;

  const headingFont = theme?.font_heading || 'Righteous';
  const bodyFont = theme?.font_body || 'Montserrat';

  const [records, setRecords] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({});

  const fetchRecords = useCallback(async () => {
    if (!config || !branchId || !financialYearId) return;
    setLoading(true);
    try {
      const query = config.recordQuery(filters, branchId, financialYearId);
      const { data, error } = await query;
      if (error) throw error;
      const transformed = (data || []).map((row) => config.recordTransform(row));
      setRecords(transformed);
      setCurrentIndex((prev) => (prev >= transformed.length ? 0 : prev));
    } catch (err) {
      console.error(err);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [config, filters, branchId, financialYearId]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const currentRecord = records[currentIndex] || null;

  const goTo = (index) => {
    if (index >= 0 && index < records.length) setCurrentIndex(index);
  };
  const handlePrev = () => goTo(currentIndex - 1);
  const handleNext = () => goTo(currentIndex + 1);

  // PDF generators map
  const PDF_GENERATORS = {
    admission_form: (record) => generateAdmissionPdf(record.id, { theme, orgId: organizationId }),
    fee_receipt: (record) => generateReceiptPdf(record, { org, theme }),
    salary_slip: (record) => generateSalarySlipPDF(record, { org, branch, theme }),
  };

  const handlePrint = () => {
    if (!currentRecord) return;
    const previewEl = document.querySelector('.document-preview');
    if (!previewEl) return window.print();

    const content = previewEl.innerHTML;
    const printWindow = window.open('', '_blank', 'width=900,height=650');
    printWindow.document.write(`
      <html>
        <head>
          <title>${config.title}</title>
          <style>
            body { font-family: ${bodyFont}, sans-serif; margin: 20px; color: #333; }
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

  const handleFilterChange = (field, value) =>
    setFilters((prev) => ({ ...prev, [field]: value }));
  const resetFilters = () => setFilters({});

  if (!config)
    return (
      <div className="p-6 text-center text-accent-dark" style={{ fontFamily: bodyFont }}>
        Report not found.
      </div>
    );

  const DocumentComponent = config.documentComponent;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <Link
        to="/reports"
        className="inline-flex items-center gap-2 text-primary-dark hover:text-primary mb-4 text-sm"
        style={{ fontFamily: bodyFont }}
      >
        <ArrowLeft size={18} /> Back to Reports
      </Link>

      <div className="flex flex-col sm:flex-row items-center justify-between mb-6 print:hidden gap-4">
        <h2
          className="text-2xl font-bold text-primary"
          style={{ fontFamily: headingFont }}
        >
          {config.title}
        </h2>
        <div className="flex items-center gap-3">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-dark text-white rounded-lg transition-colors"
            style={{ fontFamily: bodyFont }}
          >
            <Printer size={16} /> Print
          </button>
          <button
            onClick={handlePDF}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-light text-white rounded-lg transition-colors"
            style={{ fontFamily: bodyFont }}
          >
            <Download size={16} /> PDF
          </button>
        </div>
      </div>

      {config.fields && config.fields.length > 0 && (
        <div className="bg-primary-bg p-4 rounded-xl border border-primary-bg mb-6 print:hidden">
          <div className="flex flex-wrap items-end gap-4">
            {config.fields.map((field) => (
              <div key={field} className="flex flex-col min-w-[160px]">
                <label
                  className="text-sm font-medium text-primary-dark mb-1 capitalize"
                  style={{ fontFamily: bodyFont }}
                >
                  {field.replace(/_/g, ' ')}
                </label>
                {DROPDOWN_TABLES[field] ? (
                  <FilterDropdown
                    field={field}
                    filters={filters}
                    onChange={handleFilterChange}
                    branchId={branchId}
                    financialYearId={financialYearId}
                    organizationId={organizationId}
                  />
                ) : (
                  <input
                    type="text"
                    placeholder={`Search ${field}`}
                    value={filters[field] || ''}
                    onChange={(e) => handleFilterChange(field, e.target.value)}
                    className="border border-primary-bg bg-white text-primary-dark rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder-primary-dark/40"
                    style={{ fontFamily: bodyFont }}
                  />
                )}
              </div>
            ))}
            <button
              onClick={resetFilters}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-white border border-primary-bg text-primary-dark rounded-lg hover:bg-primary-bg transition-colors self-end"
              style={{ fontFamily: bodyFont }}
            >
              <RotateCcw size={14} /> Reset
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-20 text-primary-dark/60" style={{ fontFamily: bodyFont }}>
          Loading records…
        </div>
      ) : records.length === 0 ? (
        <div className="text-center py-20 text-primary-dark/60" style={{ fontFamily: bodyFont }}>
          No records found.
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4 print:hidden">
            <div className="flex items-center gap-3">
              <div className="relative">
                <select
                  value={currentIndex}
                  onChange={(e) => goTo(Number(e.target.value))}
                  className="appearance-none bg-white border border-primary-bg rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-primary-dark"
                  style={{ fontFamily: bodyFont }}
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
                <List className="absolute right-2 top-1/2 -translate-y-1/2 text-primary-dark/40" size={16} />
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={handlePrev}
                  disabled={currentIndex === 0}
                  className="p-2 rounded-lg hover:bg-primary-bg text-primary-dark disabled:opacity-50 transition-colors"
                >
                  <ArrowLeft size={18} />
                </button>
                <span className="text-sm font-medium w-16 text-center text-primary-dark" style={{ fontFamily: bodyFont }}>
                  {currentIndex + 1} / {records.length}
                </span>
                <button
                  onClick={handleNext}
                  disabled={currentIndex === records.length - 1}
                  className="p-2 rounded-lg hover:bg-primary-bg text-primary-dark disabled:opacity-50 transition-colors"
                >
                  <ArrowRight size={18} />
                </button>
              </div>
            </div>
          </div>

          <div className="document-preview bg-white shadow-xl rounded-2xl p-6 md:p-10 border border-primary-bg">
            {currentRecord && <DocumentComponent data={currentRecord} org={org} />}
          </div>
        </>
      )}
    </div>
  );
}