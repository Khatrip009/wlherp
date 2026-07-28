// src/components/ReportPage.jsx
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate, Link } from 'react-router-dom';
import { FileDown, BarChart3, RotateCcw, Printer, ArrowLeft } from 'lucide-react';
import { fetchReportData } from '../services/reportService';
import { getReportConfig } from '../utils/reportConfig';
import { exportToExcel } from '../utils/reportExport';
import { useAuth } from '../context/AuthContext';
import { useOrg } from '../context/OrganizationContext';
import { useTheme } from '../context/ThemeContext';
import { generateReportPdf } from '../utils/generateReportPdf';
import { supabase } from '../api/supabase';
import DocumentReportPage from './DocumentReportPage';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */
function resolvePath(obj, path) {
  return path.split('.').reduce((acc, part) => acc?.[part], obj);
}

function computeAggregate(data, method, accessor) {
  const values = data
    .map((d) => parseFloat(resolvePath(d, accessor)))
    .filter((v) => !isNaN(v));
  if (!values.length) return 0;
  if (method === 'sum') return values.reduce((a, b) => a + b, 0).toFixed(2);
  if (method === 'avg') return (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2);
  return '';
}

const FIELD_LABELS = {
  start_date: 'From Date',
  end_date: 'To Date',
  batch_id: 'Batch',
  course_id: 'Course',
  medium_id: 'Medium',
  student_id: 'Student',
  teacher_id: 'Teacher',
  exam_id: 'Exam',
  class_id: 'Class',
  level_id: 'Level',
  tax_rate_id: 'Tax Rate',
  status: 'Status',
  source: 'Source',
  category: 'Category',
  document_type: 'Document Type',
  student_name: 'Student Name',
  due_date_from: 'Due Date From',
  due_date_to: 'Due Date To',
  account_id: 'Account',
  receipt_id: 'Receipt',
};

function getLabel(field) {
  return FIELD_LABELS[field] || field.replace(/_/g, ' ');
}

function isDateField(field) {
  return field.includes('date');
}

/* ------------------------------------------------------------------ */
/*  Dropdown configuration                                             */
/* ------------------------------------------------------------------ */
const DROPDOWN_TABLES = {
  course_id: { table: 'courses', label: 'course_name', value: 'id' },
  batch_id: { table: 'batches', label: 'batch_name', value: 'id' },
  medium_id: { table: 'mediums', label: 'name', value: 'id' },
  student_id: { table: 'students', label: 'first_name', value: 'id', display: (r) => `${r.first_name} ${r.last_name}` },
  teacher_id: { table: 'teachers', label: 'first_name', value: 'id', display: (r) => `${r.first_name} ${r.last_name}` },
  exam_id: { table: 'exams', label: 'exam_name', value: 'id' },
  class_id: { table: 'online_classes', label: 'title', value: 'id' },
  level_id: { table: 'course_levels', label: 'level_name', value: 'id' },
  tax_rate_id: { table: 'tax_rates', label: 'name', value: 'id' },
  account_id: { table: 'chart_of_accounts', label: 'account_name', value: 'id' },
};

const BRANCH_SCOPED_TABLES = [
  'batches', 'students', 'teachers', 'exams',
  'online_classes', 'course_levels', 'tax_rates', 'fee_structures',
];

/* ------------------------------------------------------------------ */
/*  Dropdown component                                                 */
/* ------------------------------------------------------------------ */
function FilterDropdown({ field, filters, onChange, branchId, financialYearId, organizationId }) {
  const config = DROPDOWN_TABLES[field];
  const shouldScopeBranch = BRANCH_SCOPED_TABLES.includes(config.table);
  const { theme } = useTheme();
  const bodyFont = theme?.font_body || 'Montserrat';

  const { data: options, isLoading } = useQuery({
    queryKey: ['filterOptions', field, branchId, financialYearId, organizationId],
    queryFn: async () => {
      let query = supabase.from(config.table).select(`${config.value}, ${config.label}`);

      if (shouldScopeBranch && branchId && financialYearId) {
        query = query.eq('branch_id', branchId).eq('financial_year_id', financialYearId);
      }

      if (config.table === 'courses' && organizationId) {
        query = query.eq('organization_id', organizationId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
    enabled: shouldScopeBranch ? !!(branchId && financialYearId) : true,
  });

  return (
    <select
      value={filters[field] || ''}
      onChange={(e) => onChange(field, e.target.value)}
      className="border border-primary-bg rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white text-primary-dark"
      style={{ fontFamily: bodyFont }}
    >
      <option value="">All</option>
      {isLoading ? (
        <option disabled>Loading…</option>
      ) : (
        options?.map((opt) => (
          <option key={opt[config.value]} value={opt[config.value]}>
            {config.display ? config.display(opt) : opt[config.label]}
          </option>
        ))
      )}
    </select>
  );
}

/* ------------------------------------------------------------------ */
/*  Report Page Component                                             */
/* ------------------------------------------------------------------ */
export default function ReportPage({ reportId, theme: propTheme }) {
  const { profile } = useAuth();
  const { org, branch, selectedFinancialYear } = useOrg();
  const { theme: contextTheme } = useTheme();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const organizationId = org?.id;

  const theme = propTheme || contextTheme;
  const primaryColor = theme?.primary_color || '#0D47A1';
  const headingFont = theme?.font_heading || 'Righteous';
  const bodyFont = theme?.font_body || 'Montserrat';

  const config = useMemo(() => getReportConfig(reportId), [reportId]);

  const initialFilters = useMemo(() => {
    if (!config) return {};
    if (typeof config.defaultFilters === 'function') return config.defaultFilters();
    return config.defaultFilters || {};
  }, [config]);

  const [filters, setFilters] = useState(initialFilters);

  const adminRoles = ['admin', 'super_admin', 'organization_admin', 'branch_admin'];
  const hasReportAccess = Boolean(profile && adminRoles.includes(profile.role));

  const isDocumentReport = config?.reportType === 'document';

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['report', reportId, filters, branchId, financialYearId],
    queryFn: () => fetchReportData(reportId, filters, branchId, financialYearId),
    keepPreviousData: true,
    staleTime: 30_000,
    enabled: hasReportAccess && Boolean(config) && !isDocumentReport && Boolean(branchId) && Boolean(financialYearId),
  });

  const rows = useMemo(() => {
    if (isDocumentReport || !config) return [];
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (data.lines) return data.lines;
    return [];
  }, [config, data, isDocumentReport]);

  const hasChart = useMemo(
    () => !isDocumentReport && Boolean(config?.chartConfig && rows.length > 0),
    [config, rows, isDocumentReport]
  );

  const aggregateRowObj = useMemo(() => {
    if (isDocumentReport || !config?.aggregateRow || !rows.length) return null;
    const obj = {};
    config.columns.forEach((col, idx) => {
      if (col.aggregate) {
        obj[col.accessor] = computeAggregate(rows, col.aggregate, col.accessor);
      } else if (idx === 0) {
        obj[col.accessor] = 'Total';
      } else {
        obj[col.accessor] = '';
      }
    });
    return obj;
  }, [config, rows, isDocumentReport]);

  const dataForPdf = useMemo(() => {
    if (isDocumentReport) return [];
    if (!aggregateRowObj) return rows;
    return [...rows, aggregateRowObj];
  }, [rows, aggregateRowObj, isDocumentReport]);

  if (!hasReportAccess) {
    return <Navigate to="/" replace />;
  }

  if (isDocumentReport) {
    return <DocumentReportPage reportId={reportId} />;
  }

  if (!config) {
    return (
      <div className="p-6 text-center text-accent-dark" style={{ fontFamily: bodyFont }}>
        Report configuration not found for "<strong>{reportId}</strong>".
      </div>
    );
  }

  if (!branchId || !financialYearId) {
    return (
      <div className="p-6 text-center text-primary-dark" style={{ fontFamily: bodyFont }}>
        Loading branch & financial year…
      </div>
    );
  }

  const handleFilterChange = (field, value) => setFilters(prev => ({ ...prev, [field]: value }));
  const resetFilters = () => setFilters(initialFilters);

  const handleDownloadPdf = async () => {
    if (!rows.length) return;
    try {
      const doc = await generateReportPdf(config, dataForPdf, filters, org, theme);
      doc.save(`${reportId}_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error(err);
      alert('Failed to generate PDF: ' + err.message);
    }
  };

  const handlePrintPreview = async () => {
    if (!rows.length) return;
    try {
      const doc = await generateReportPdf(config, dataForPdf, filters, org, theme);
      const blob = doc.output('blob');
      window.open(URL.createObjectURL(blob), '_blank');
    } catch (err) {
      console.error(err);
      alert('Failed to generate PDF: ' + err.message);
    }
  };

  const handleExportExcel = () => {
    if (!rows.length) return;
    exportToExcel(config.title, config.columns, rows);
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <Link to="/reports" className="inline-flex items-center gap-2 text-primary-dark hover:text-primary mb-2 text-sm" style={{ fontFamily: bodyFont }}>
        <ArrowLeft size={18} /> Back to Reports
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-primary" style={{ fontFamily: headingFont }}>{config.title}</h2>
          {config.description && <p className="text-primary-dark mt-1" style={{ fontFamily: bodyFont }}>{config.description}</p>}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handlePrintPreview} disabled={!rows.length} className="bg-white border border-primary-bg hover:bg-primary-bg text-primary-dark px-4 py-2 rounded-lg text-sm flex items-center gap-2 disabled:opacity-50" style={{ fontFamily: bodyFont }}>
            <Printer size={16} /> Print Preview
          </button>
          <button onClick={handleDownloadPdf} disabled={!rows.length} className="bg-primary hover:bg-accent text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 disabled:opacity-50" style={{ fontFamily: bodyFont }}>
            <FileDown size={16} /> PDF
          </button>
          <button onClick={handleExportExcel} disabled={!rows.length} className="bg-accent hover:bg-accent-dark text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 disabled:opacity-50" style={{ fontFamily: bodyFont }}>
            <FileDown size={16} /> Excel
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-primary-bg p-4 rounded-xl border border-primary-bg">
        <div className="flex flex-wrap items-end gap-4">
          {config.fields.map(field => (
            <div key={field} className="flex flex-col min-w-[160px]">
              <label className="text-sm font-medium text-primary-dark mb-1 capitalize" style={{ fontFamily: bodyFont }}>{getLabel(field)}</label>
              {isDateField(field) ? (
                <input type="date" value={filters[field] || ''} onChange={e => handleFilterChange(field, e.target.value)} className="border border-primary-bg rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white text-primary-dark" style={{ fontFamily: bodyFont }} />
              ) : DROPDOWN_TABLES[field] ? (
                <FilterDropdown
                  field={field}
                  filters={filters}
                  onChange={handleFilterChange}
                  branchId={branchId}
                  financialYearId={financialYearId}
                  organizationId={organizationId}
                />
              ) : (
                <input type="text" placeholder={getLabel(field)} value={filters[field] || ''} onChange={e => handleFilterChange(field, e.target.value)} className="border border-primary-bg rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white text-primary-dark placeholder-primary-dark/40" style={{ fontFamily: bodyFont }} />
              )}
            </div>
          ))}
          <button onClick={resetFilters} className="flex items-center gap-2 text-sm text-primary-dark hover:text-primary border border-primary-bg px-3 py-2 rounded-lg bg-white" style={{ fontFamily: bodyFont }}>
            <RotateCcw size={14} /> Reset
          </button>
        </div>
      </div>

      {/* Loading / Error / Empty */}
      {isLoading && <div className="text-center py-20 text-primary-dark" style={{ fontFamily: bodyFont }}>Loading report data…</div>}
      {isError && <div className="bg-accent-bg text-accent-dark rounded-lg p-4" style={{ fontFamily: bodyFont }}>Failed to load report: {error?.message || 'Unknown error'}</div>}
      {!isLoading && !isError && rows.length === 0 && (
        <div className="text-center py-20 text-primary-dark/60" style={{ fontFamily: bodyFont }}>No records found for the selected filters.</div>
      )}

      {/* Conversion Summary */}
      {reportId === 'inquiry_conversion' && rows.length > 0 && (
        <div className="bg-white rounded-xl border border-primary-bg shadow-sm p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>Total Inquiries</p>
              <p className="text-2xl font-bold text-primary" style={{ fontFamily: headingFont }}>{rows.length}</p>
            </div>
            <div>
              <p className="text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>Admitted</p>
              <p className="text-2xl font-bold text-primary" style={{ fontFamily: headingFont }}>{rows.filter(r => r.status === 'Admitted').length}</p>
            </div>
            <div>
              <p className="text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>Conversion Rate</p>
              <p className="text-2xl font-bold text-primary" style={{ fontFamily: headingFont }}>
                {((rows.filter(r => r.status === 'Admitted').length / rows.length) * 100).toFixed(1)}%
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Chart */}
      {hasChart && (
        <div className="bg-white p-4 rounded-xl border border-primary-bg shadow-sm">
          <div className="flex items-center gap-2 mb-3 text-primary font-medium" style={{ fontFamily: headingFont }}><BarChart3 size={18} /> Chart</div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={rows} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey={config.chartConfig.labelKey} tick={{ fontSize: 12 }} stroke="#6b7280" />
              <YAxis stroke="#6b7280" tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar
                dataKey={config.chartConfig.dataKey}
                fill={primaryColor}
                radius={[4, 4, 0, 0]}
                name={config.chartConfig.dataKey.replace(/_/g, ' ')}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Data Table */}
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-primary-bg shadow-sm bg-white">
          <table className="w-full text-sm">
            <thead className="bg-primary-bg text-primary-dark">
              <tr>
                {config.columns.map(col => (
                  <th key={col.accessor} className="p-3 text-left font-medium whitespace-nowrap" style={{ fontFamily: bodyFont }}>{col.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => (
                <tr key={rowIdx} className="border-t border-primary-bg hover:bg-primary-bg transition-colors">
                  {config.columns.map(col => (
                    <td key={col.accessor} className="p-3 whitespace-nowrap text-primary-dark" style={{ fontFamily: bodyFont }}>{resolvePath(row, col.accessor) ?? '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
            {config.aggregateRow && aggregateRowObj && (
              <tfoot className="bg-primary-bg font-semibold text-primary-dark">
                <tr>
                  {config.columns.map((col, idx) => (
                    <td key={col.accessor} className="p-3 whitespace-nowrap" style={{ fontFamily: bodyFont }}>{aggregateRowObj[col.accessor] ?? ''}</td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <p className="text-sm text-primary-dark text-right" style={{ fontFamily: bodyFont }}>{rows.length} record{rows.length !== 1 && 's'}</p>
      )}
    </div>
  );
}