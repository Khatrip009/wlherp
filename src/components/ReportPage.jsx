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
import { generateReportPdf } from '../utils/generateReportPdf';
import { supabase } from '../api/supabase';
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
};

const BRANCH_SCOPED_TABLES = [
  'courses', 'batches', 'students', 'teachers', 'exams',
  'online_classes', 'course_levels', 'tax_rates', 'fee_structures',
];

/* ------------------------------------------------------------------ */
/*  Dropdown component (now scoped)                                    */
/* ------------------------------------------------------------------ */
function FilterDropdown({ field, filters, onChange, branchId, financialYearId }) {
  const config = DROPDOWN_TABLES[field];
  const shouldScope = BRANCH_SCOPED_TABLES.includes(config.table);

  const { data: options, isLoading } = useQuery({
    queryKey: ['filterOptions', field, branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from(config.table)
        .select(`${config.value}, ${config.label}`);
      if (shouldScope && branchId && financialYearId) {
        query = query
          .eq('branch_id', branchId)
          .eq('financial_year_id', financialYearId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
    enabled: shouldScope ? !!(branchId && financialYearId) : true,
  });

  return (
    <select
      value={filters[field] || ''}
      onChange={(e) => onChange(field, e.target.value)}
      className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white"
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
export default function ReportPage({ reportId }) {
  const { profile } = useAuth();
  const { org, branch, selectedFinancialYear, theme } = useOrg(); // ✅ added theme
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  // ── Updated role check ──
  const adminRoles = ['admin', 'super_admin', 'organization_admin', 'branch_admin'];
  const hasReportAccess = Boolean(profile && adminRoles.includes(profile.role));

  /* ---------- Config & initial filters ---------- */
  const config = useMemo(() => getReportConfig(reportId), [reportId]);

  const initialFilters = useMemo(() => {
    if (!config) return {};
    if (typeof config.defaultFilters === 'function') return config.defaultFilters();
    return config.defaultFilters || {};
  }, [config]);

  const [filters, setFilters] = useState(initialFilters);

  /* ---------- Data fetching ---------- */
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['report', reportId, filters, branchId, financialYearId],
    queryFn: () => fetchReportData(reportId, filters, branchId, financialYearId),
    keepPreviousData: true,
    staleTime: 30_000,
    enabled: hasReportAccess && Boolean(config) && Boolean(branchId) && Boolean(financialYearId),
  });

  /* ---------- Derived values ---------- */
  const rows = Array.isArray(data) ? data : [];
  const hasChart = Boolean(config?.chartConfig && rows.length > 0);

  // Role guard
  if (!hasReportAccess) {
    return <Navigate to="/" replace />;
  }

  if (!config) {
    return (
      <div className="p-6 text-center text-red-600">
        Report configuration not found for "<strong>{reportId}</strong>".
      </div>
    );
  }

  if (!branchId || !financialYearId) {
    return (
      <div className="p-6 text-center text-secondary">
        Loading branch & financial year…
      </div>
    );
  }

  /* ---------- Handlers ---------- */
  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const resetFilters = () => setFilters(initialFilters);

  // ✅ FIXED: Pass rows, filters, org, theme
  const handleDownloadPdf = async () => {
    if (!rows.length) return;
    try {
      const doc = await generateReportPdf(config, rows, filters, org, theme);
      doc.save(`${reportId}_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error(err);
      alert('Failed to generate PDF: ' + err.message);
    }
  };

  const handlePrintPreview = async () => {
    if (!rows.length) return;
    try {
      const doc = await generateReportPdf(config, rows, filters, org, theme);
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (err) {
      console.error(err);
      alert('Failed to generate PDF: ' + err.message);
    }
  };

  const handleExportExcel = () => {
    if (!rows.length) return;
    exportToExcel(config.title, config.columns, rows);
  };

  /* ---------- UI ---------- */
  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <Link to="/reports" className="inline-flex items-center gap-2 text-secondary hover:text-primary-dark mb-2 font-montserrat text-sm">
        <ArrowLeft size={18} /> Back to Reports
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-righteous text-primary">{config.title}</h2>
          {config.description && (
            <p className="text-secondary-dark mt-1">{config.description}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handlePrintPreview}
            disabled={!rows.length}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-primary rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Printer size={16} /> Print Preview
          </button>
          <button
            onClick={handleDownloadPdf}
            disabled={!rows.length}
            className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <FileDown size={16} /> PDF
          </button>
          <button
            onClick={handleExportExcel}
            disabled={!rows.length}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-light text-white rounded-lg hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <FileDown size={16} /> Excel
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
        <div className="flex flex-wrap items-end gap-4">
          {config.fields.map((field) => (
            <div key={field} className="flex flex-col min-w-[160px]">
              <label className="text-sm font-medium text-secondary-dark mb-1 capitalize">
                {getLabel(field)}
              </label>
              {isDateField(field) ? (
                <input
                  type="date"
                  value={filters[field] || ''}
                  onChange={(e) => handleFilterChange(field, e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              ) : DROPDOWN_TABLES[field] ? (
                <FilterDropdown
                  field={field}
                  filters={filters}
                  onChange={handleFilterChange}
                  branchId={branchId}
                  financialYearId={financialYearId}
                />
              ) : (
                <input
                  type="text"
                  placeholder={getLabel(field)}
                  value={filters[field] || ''}
                  onChange={(e) => handleFilterChange(field, e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              )}
            </div>
          ))}
          <button
            onClick={resetFilters}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors self-end"
          >
            <RotateCcw size={14} /> Reset
          </button>
        </div>
      </div>

      {/* Loading / Error / Empty states */}
      {isLoading && (
        <div className="text-center py-20 text-secondary">Loading report data…</div>
      )}
      {isError && (
        <div className="bg-red-50 text-red-700 rounded-lg p-4">
          Failed to load report: {error?.message || 'Unknown error'}
        </div>
      )}
      {!isLoading && !isError && rows.length === 0 && (
        <div className="text-center py-20 text-secondary">No records found for the selected filters.</div>
      )}

      {/* Chart (if configured) */}
      {hasChart && (
        <div className="bg-white p-4 rounded-xl border shadow-sm">
          <div className="flex items-center gap-2 mb-3 text-primary font-medium">
            <BarChart3 size={18} /> Chart
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={rows}
              margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey={config.chartConfig.labelKey}
                tick={{ fontSize: 12 }}
                stroke="#6b7280"
              />
              <YAxis stroke="#6b7280" tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar
                dataKey={config.chartConfig.dataKey}
                fill="#0D47A1"
                radius={[4, 4, 0, 0]}
                name={config.chartConfig.dataKey.replace(/_/g, ' ')}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Data Table */}
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border shadow-sm bg-white">
          <table className="w-full text-sm">
            <thead className="bg-primary-bg text-primary-dark">
              <tr>
                {config.columns.map((col) => (
                  <th key={col.accessor} className="p-3 text-left font-medium whitespace-nowrap">
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => (
                <tr key={rowIdx} className="border-t hover:bg-gray-50 transition-colors">
                  {config.columns.map((col) => (
                    <td key={col.accessor} className="p-3 whitespace-nowrap text-secondary-dark">
                      {resolvePath(row, col.accessor) ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {config.aggregateRow && (
              <tfoot className="bg-gray-100 font-semibold text-primary-dark">
                <tr>
                  {config.columns.map((col, idx) => (
                    <td key={col.accessor} className="p-3 whitespace-nowrap">
                      {col.aggregate
                        ? computeAggregate(rows, col.aggregate, col.accessor)
                        : idx === 0
                        ? 'Total'
                        : ''}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* Record count */}
      {rows.length > 0 && (
        <p className="text-sm text-secondary-dark text-right">
          {rows.length} record{rows.length !== 1 && 's'}
        </p>
      )}
    </div>
  );
}