// src/pages/Reports.jsx (or wherever your Reports component lives)
import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search, GraduationCap, Wallet, Users, BookOpen, Award, FileText, BarChart3 } from 'lucide-react';
import { reportTypes } from '../utils/reportConfig';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import AdminLayout from '../layouts/AdminLayout';

const CATEGORIES = {
  admissions: {
    label: 'Admissions & Students',
    icon: Users,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    reports: [
      'student_enrollment',
      'student_status_list',
      'batch_capacity',
      'student_parents',
      'inquiry_conversion',
      'admission_pipeline',
      'student_contact_directory',
      'student_documents',
    ],
  },
  academics: {
    label: 'Academics',
    icon: GraduationCap,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    reports: [
      'attendance_summary',
      'student_attendance_pct',
      'student_attendance_detail',
      'homework_submissions',
      'exam_results',
      'student_progress',
      'online_class_attendance',
      'student_level_completion',
      'batch_schedule_report',
    ],
  },
  finance: {
    label: 'Finance & Fees',
    icon: Wallet,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    reports: [
      'fee_collection',
      'pending_fees',
      'fee_aging_analysis',
      'payment_mode_summary',
      'daily_cashbook',
      'income_statement',
      'expense_statement',
      'expense_category_summary',
      'profit_loss_summary',
      'tax_collected',
      'receipts_journal',
      'fee_instalments',
    ],
  },
  hr: {
    label: 'HR & Teachers',
    icon: Users,
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    reports: ['teacher_salary', 'teacher_workload', 'teacher_leave_summary'],
  },
  certifications: {
    label: 'Certifications & Progress',
    icon: Award,
    color: 'text-rose-600',
    bg: 'bg-rose-50',
    reports: ['certificates_issued', 'student_level_completion'],
  },
  documents: {
    label: 'Printable Documents',
    icon: FileText,
    color: 'text-gray-600',
    bg: 'bg-gray-50',
    reports: [
      'admission_form',
      'fee_receipt',
      'expense_receipt',
      'income_receipt',
      'salary_slip',
      'certificate_document',
    ],
  },
};

export default function Reports() {
  const { profile } = useAuth();
  const [search, setSearch] = useState('');

  // ── Admin role check – now includes organization_admin ──
  const isAdmin = ['admin', 'super_admin', 'organization_admin'].includes(profile?.role);
  if (!profile || !isAdmin) {
    return <Navigate to="/" replace />;
  }

  const filteredCategories = useMemo(() => {
    const term = search.toLowerCase().trim();
    return Object.entries(CATEGORIES).map(([key, cat]) => {
      const filteredReports = cat.reports.filter((id) => {
        const r = reportTypes[id];
        if (!r) return false;
        if (!term) return true;
        return (
          r.title.toLowerCase().includes(term) ||
          (r.description && r.description.toLowerCase().includes(term))
        );
      });
      return { ...cat, key, reports: filteredReports };
    }).filter(cat => cat.reports.length > 0);
  }, [search]);

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-righteous text-primary">Reports</h1>
            <p className="text-secondary-dark mt-1">
              Generate, view and export business reports for your academy.
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-light" size={18} />
            <input
              type="text"
              placeholder="Search reports…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white"
            />
          </div>
        </div>

        {filteredCategories.length === 0 && (
          <div className="text-center py-20 text-secondary">
            <FileText size={48} className="mx-auto mb-4 text-secondary-light" />
            <p className="text-lg font-medium">No reports found</p>
            <p className="text-sm">Try adjusting your search term.</p>
          </div>
        )}

        {filteredCategories.map((cat) => {
          const Icon = cat.icon;
          return (
            <section key={cat.key} className="space-y-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${cat.bg}`}>
                  <Icon size={20} className={cat.color} />
                </div>
                <h2 className="text-xl font-righteous text-primary">{cat.label}</h2>
                <span className="text-xs text-secondary-light bg-gray-100 px-2 py-0.5 rounded-full">
                  {cat.reports.length}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {cat.reports.map((reportId) => {
                  const report = reportTypes[reportId];
                  if (!report) return null;
                  return (
                    <Link
                      key={reportId}
                      to={`/reports/${reportId}`}
                      className="group relative flex flex-col p-5 bg-white border border-gray-200 rounded-xl hover:shadow-lg hover:border-primary/30 transition-all duration-200"
                    >
                      <div className="flex items-start justify-between">
                        <h3 className="text-base font-righteous text-primary group-hover:text-accent transition-colors pr-4">
                          {report.title}
                        </h3>
                        <BarChart3 size={16} className="text-secondary-light group-hover:text-accent transition-colors flex-shrink-0" />
                      </div>
                      {report.description && (
                        <p className="text-sm text-secondary-dark mt-2 line-clamp-2">{report.description}</p>
                      )}
                      <div className="mt-4 flex items-center text-xs font-medium text-primary-light">
                        View Report →
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </AdminLayout>
  );
}