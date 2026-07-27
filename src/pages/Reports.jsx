// src/pages/Reports.jsx
import { useState, useMemo } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  Search,
  GraduationCap,
  Wallet,
  Users,
  BookOpen,
  Award,
  FileText,
  BarChart3,
  ArrowLeft,
  Mail,
} from 'lucide-react';
import { reportTypes } from '../utils/reportConfig';
import { useAuth } from '../context/AuthContext';
import { useOrg } from '../context/OrganizationContext';
import { supabase } from '../api/supabase';
import { sendEmail } from '../services/emailService';
import { useTheme } from '../context/ThemeContext';

// ─── Category definitions (visual styling now handled by theme) ──
const CATEGORIES = {
  admissions: {
    label: 'Admissions & Students',
    icon: Users,
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
    reports: [
      'fee_collection',
      'pending_fees',
      'student_ledger',
      'account_ledger',
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
    reports: ['teacher_salary', 'teacher_workload', 'teacher_leave_summary'],
  },
  certifications: {
    label: 'Certifications & Progress',
    icon: Award,
    reports: ['certificates_issued', 'student_level_completion'],
  },
  documents: {
    label: 'Printable Documents',
    icon: FileText,
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
  const { org } = useOrg();
  const theme = useTheme();
  const [search, setSearch] = useState('');

  // ── Admin role check ──
  const adminRoles = ['admin', 'super_admin', 'organization_admin', 'org_admin'];
  const isAdmin = adminRoles.includes(profile?.role?.toLowerCase());
  if (!profile || !isAdmin) {
    return <Navigate to="/" replace />;
  }

  // ── Filter categories based on search ──
  const filteredCategories = useMemo(() => {
    const term = search.toLowerCase().trim();
    return Object.entries(CATEGORIES)
      .map(([key, cat]) => {
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
      })
      .filter((cat) => cat.reports.length > 0);
  }, [search]);

  // ─── Helper: get admin emails ──────────────────────────────────────
  const getAdminEmails = async () => {
    if (!org?.id) return [];
    const { data, error } = await supabase
      .from('profiles')
      .select('email')
      .eq('organization_id', org.id)
      .in('role', ['admin', 'super_admin', 'organization_admin'])
      .eq('is_active', true);
    if (error) {
      console.error('Failed to fetch admin emails:', error);
      return [];
    }
    return data?.map(p => p.email).filter(Boolean) || [];
  };

  // ─── Send Report Email ─────────────────────────────────────────────
  const sendReportEmail = async () => {
    if (filteredCategories.length === 0) {
      alert('No reports to send.');
      return;
    }

    try {
      const adminEmails = await getAdminEmails();
      if (adminEmails.length === 0) {
        alert('No admin emails found.');
        return;
      }

      // Build HTML content with theme colours
      let categoriesHtml = '';
      for (const cat of filteredCategories) {
        categoriesHtml += `<h3 style="color:${theme.primary_color};margin:12px 0 4px;">${cat.label}</h3><ul style="margin:0;padding-left:20px;">`;
        for (const reportId of cat.reports) {
          const r = reportTypes[reportId];
          if (!r) continue;
          categoriesHtml += `
            <li style="margin-bottom:4px;">
              <strong>${r.title}</strong>
              ${r.description ? ` – ${r.description}` : ''}
            </li>
          `;
        }
        categoriesHtml += '</ul>';
      }

      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
          <h2 style="color:${theme.primary_color};">Reports Hub</h2>
          <p><strong>Organization:</strong> ${org?.company_name || 'Academy'}</p>
          <p><strong>Search Filter:</strong> ${search || 'All'}</p>
          <p><strong>Total Categories:</strong> ${filteredCategories.length}</p>
          <hr />
          ${categoriesHtml}
          <p style="color:#888;font-size:10px;margin-top:20px;">Computer‑generated report list from ${org?.company_name || 'Academy'}</p>
        </div>
      `;

      await sendEmail({
        to: adminEmails,
        subject: `Reports List - ${new Date().toLocaleDateString()}`,
        html: htmlBody,
      });

      alert('Report list sent to admins.');
    } catch (err) {
      console.error('Failed to send report:', err);
      alert('Failed to send report. Check console for details.');
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-8">
      {/* ─── Back button ─── */}
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-primary transition-colors"
      >
        <ArrowLeft size={18} />
        Back to Dashboard
      </Link>

      {/* ─── Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-heading text-primary">
            Reports Hub
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Generate, view and export business reports for your academy.
          </p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" size={18} />
            <input
              type="text"
              placeholder="Search reports…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <button
            onClick={sendReportEmail}
            className="bg-primary hover:bg-primary-dark text-white px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 whitespace-nowrap"
          >
            <Mail size={18} />
            Send Report
          </button>
        </div>
      </div>

      {/* ─── No results ─── */}
      {filteredCategories.length === 0 && (
        <div className="text-center py-20 text-gray-500 dark:text-gray-400">
          <FileText size={48} className="mx-auto mb-4 text-gray-400 dark:text-gray-500" />
          <p className="text-lg font-medium">No reports found</p>
          <p className="text-sm">Try adjusting your search term.</p>
        </div>
      )}

      {/* ─── Categories ─── */}
      {filteredCategories.map((cat) => {
        const Icon = cat.icon;
        return (
          <section key={cat.key} className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary-bg">
                <Icon size={20} className="text-primary" />
              </div>
              <h2 className="text-xl font-heading text-primary">
                {cat.label}
              </h2>
              <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
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
                    className="group relative flex flex-col p-5 bg-white dark:bg-accent border border-gray-200 dark:border-gray-700 rounded-xl hover:shadow-lg hover:border-primary/30 transition-all duration-200"
                  >
                    <div className="flex items-start justify-between">
                      <h3 className="text-base font-heading text-primary group-hover:text-accent transition-colors pr-4">
                        {report.title}
                      </h3>
                      <BarChart3
                        size={16}
                        className="text-gray-400 dark:text-gray-500 group-hover:text-accent transition-colors flex-shrink-0"
                      />
                    </div>
                    {report.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 line-clamp-2">
                        {report.description}
                      </p>
                    )}
                    <div className="mt-4 flex items-center text-xs font-medium text-primary group-hover:text-accent transition-colors">
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
  );
}