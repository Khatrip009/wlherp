import { Routes, Route, useParams } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import NotFound from "./pages/NotFound";
import AdminLayout from "./layouts/AdminLayout";
import AIChat from "./components/AIChat/AIChat";
import ProtectedRoute from "./components/ProtectedRoute";

// ── Context providers ──
import { AuthProvider } from "./context/AuthContext";
import { OrganizationProvider } from "./context/OrganizationContext";
import { ThemeProvider } from "./context/ThemeContext";
import { ScopeProvider } from "./context/ScopeContext";  
import AntThemeWrapper from "./components/AntThemeWrapper";

// ── Page imports ──
import Dashboard from "./pages/Dashboard";
import Students from "./pages/Students";
import StudentProfile from "./pages/StudentProfile";
import Inquiries from "./pages/Inquiries";
import Courses from "./pages/Courses";
import Batches from "./pages/Batches";
import Teachers from "./pages/Teachers";
import Attendance from "./pages/Attendance";
import MarkAttendance from "./pages/MarkAttendance";
import FeeStructures from "./pages/FeeStructures";
import StudentFees from "./pages/StudentFees";
import Parents from "./pages/Parents";
import Exams from "./pages/Exams";
import Results from "./pages/Results";
import EnterResults from "./pages/EnterResults";
import ViewResults from "./pages/ViewResults";
import Income from "./pages/Income";
import Expenses from "./pages/Expenses";
import Homework from "./pages/Homework";
import Subjects from "./pages/Subjects";
import Receipts from "./pages/Receipts";
import Certificates from "./pages/Certificates";
import Settings from "./pages/Settings";
import UserManagement from "./pages/UserManagement";
import Notifications from "./pages/Notifications";
import StudentBatches from "./pages/StudentBatches";
import StudentDocuments from "./pages/StudentDocuments";
import AttendanceReports from "./pages/AttendanceReports";
import ProgressEvaluations from "./pages/ProgressEvaluations";
import StudentProgressReport from "./pages/StudentProgressReport";
import StudentDashboard from "./pages/StudentDashboard";
import Login from "./pages/Login";
import OrganizationSettings from "./pages/OrganizationSettings";
import TeacherWeeklyTimetable from "./components/TeacherWeeklyTimetable";
import AdminTimetable from "./pages/AdminTimetable";
import ProfitLoss from "./pages/ProfitLoss";
import LearningResources from "./pages/LearningResources";
import Mediums from "./pages/Mediums";
import TaxSettings from "./pages/TaxSettings";
import TaxReport from "./pages/TaxReport";

// Reports engine
import Reports from "./pages/Reports";
import ReportPage from "./components/ReportPage";
import DocumentReportPage from "./components/DocumentReportPage";
import { getReportConfig } from "./utils/reportConfig";

// Student pages
import StudentFeesPage from "./pages/StudentFeesPage";
import StudentBatchPage from "./pages/StudentBatchPage";
import StudentAttendancePage from "./pages/StudentAttendancePage";
import StudentHomeworkPage from "./pages/StudentHomeworkPage";
import StudentResultsPage from "./pages/StudentResultsPage";
import StudentCertificatesPage from "./pages/StudentCertificatesPage";
import PersonalTimetable from "./pages/PersonalTimetable";
import StudentExamsPage from "./pages/StudentExamsPage";
import StudentNotifications from "./pages/StudentNotifications";

// Teacher & HR pages
import TeacherDashboard from "./pages/TeacherDashboard";
import TeacherProfile from "./pages/TeacherProfile";
import MySalary from "./pages/MySalary";
import MyLeaves from "./pages/MyLeaves";
import SalaryPayments from "./pages/SalaryPayments";
import LeaveManagement from "./pages/LeaveManagement";
import TeacherTimetable from "./pages/TeacherTimetable";
import StudentLearningResources from "./pages/StudentLearningResources";
import TeacherLearningResources from "./pages/TeacherLearningResources";

// Online Classes
import OnlineClassList from "./pages/OnlineClassList";
import CreateOnlineClass from "./components/CreateOnlineClass";
import JoinOnlineClass from "./components/JoinOnlineClass";

// Accounting Routes
import ChartOfAccounts from "./pages/ChartOfAccounts";
import JournalEntry from "./pages/JournalEntry";
import Ledger from "./pages/Ledger";
import TrialBalance from "./pages/TrialBalance";
import IssueInventory from "./pages/IssueInventory";
import Vouchers from "./pages/Vouchers";
import PaymentVoucher from "./pages/PaymentVoucher";
import ReceiptVoucher from "./pages/ReceiptVoucher";
import ContraVoucher from "./pages/ContraVoucher";
import AccountingHub from "./pages/AccountingHub";
import VoucherDetail from "./pages/VoucherDetail";
import BalanceSheet from "./pages/BalanceSheet";
import CashBook from "./pages/CashBook";
import DayBook from "./pages/DayBook";
import AgedReceivables from "./pages/AgedReceivables";
import BankReconciliation from "./pages/BankReconciliation";
import Budgets from "./pages/Budgets";
import BudgetVsActual from "./pages/BudgetVsActual";
import FixedAssets from "./pages/FixedAssets";
import BillWiseEntries from "./pages/BillWiseEntries";
import GSTReport from "./pages/GSTReport";
import InventoryItems from "./pages/InventoryItems";
import InventoryTransactions from "./pages/InventoryTransactions";
import AddStock from "./pages/AddStock";
import StockDashboard from "./pages/StockDashboard";
import PurchaseOrders from "./pages/PurchaseOrders";
import POForm from "./pages/POForm";
import PODetail from "./pages/PODetail";

// Hubs
import AdmissionsHub from "./pages/AdmissionsHub";
import AcademicsHub from "./pages/AcademicsHub";
import HRHub from "./pages/HRHub";
import CommunicationHub from "./pages/CommunicationHub";
import SettingsHub from "./pages/SettingsHub";

// HR & Salary
import TeacherSalarySettings from "./pages/TeacherSalarySettings";
import GenerateSalaries from "./pages/GenerateSalaries";
import SalarySetup from "./pages/SalarySetup";
import TeacherAttendance from "./pages/TeacherAttendance";
import SalaryReport from "./pages/SalaryReport";

// GST & Invoicing
import GSTSettings from "./pages/GSTSettings";
import Vendors from "./pages/Vendors";
import Invoices from "./pages/Invoices";
import InvoiceForm from "./pages/InvoiceForm";
import InvoiceView from "./pages/InvoiceView";
import GSTR3BSummary from "./pages/GSTR3BSummary";
import CreditNotes from "./pages/CreditNotes";
import DebitNotes from "./pages/DebitNotes";
import PurchaseRegister from "./pages/PurchaseRegister";
import PurchaseInvoices from "./pages/PurchaseInvoices";
import PurchaseInvoiceForm from "./pages/PurchaseInvoiceForm";
import PurchaseInvoiceView from "./pages/PurchaseInvoiceView";

// Teacher Reports
import TeacherAttendanceReport from "./pages/TeacherAttendanceReport";
import TeacherDailyAttendanceReport from "./pages/TeacherDailyAttendanceReport";
import TeacherLectureReport from "./pages/TeacherLectureReport";
import TeacherLectureCountReport from "./pages/TeacherLectureCountReport";
import StudentManagement from "./pages/StudentManagement";

// Misc
import Signup from "./pages/Signup";
import OnboardingWizard from "./pages/OnboardingWizard";
import ThemeSettings from "./pages/ThemeSettings";
import ActivityLogs from "./pages/ActivityLogs";
import Branches from "./pages/Branches";

import MasterData from "./pages/MasterData";
import FinanceHub from "./pages/FinanceHub";

import EmailTest from "./pages/EmailTest";

// ── Role‑based dashboard component ──
import { useAuth } from "./context/AuthContext";

function RoleBasedDashboard() {
  const { profile } = useAuth();
  const role = (profile?.role || "").toLowerCase();
  if (role === "teacher") {
    return <TeacherDashboard />;
  }
  if (role === "student") {
    return <StudentDashboard />;
  }
  return <Dashboard />;
}

// ── Report Wrapper (unchanged logic) ──
function ReportPageWrapper() {
  const { reportId } = useParams();
  const config = getReportConfig(reportId);
  if (!config) return <NotFound />;
  if (config.reportType === "document") {
    return <DocumentReportPage reportId={reportId} />;
  }
  return <ReportPage reportId={reportId} />;
}

// ── App Component ──
function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <OrganizationProvider>
          <ScopeProvider>
          <ThemeProvider>
            <AntThemeWrapper>
              <Routes>
                {/* Public routes */}
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />

                {/* All authenticated pages */}
                <Route
                  element={
                    <ProtectedRoute>
                      <AdminLayout />
                    </ProtectedRoute>
                  }
                >
                  {/* ── Root route now shows role‑specific dashboard ── */}
                  <Route index element={<RoleBasedDashboard />} />
                  <Route path="/organization-settings" element={<OrganizationSettings />} />

                  {/* Student routes */}
                  <Route path="/student" element={<StudentDashboard />} />
                  <Route path="/student/fees" element={<StudentFeesPage />} />
                  <Route path="/student/batch" element={<StudentBatchPage />} />
                  <Route path="/student/attendance" element={<StudentAttendancePage />} />
                  <Route path="/student/homework" element={<StudentHomeworkPage />} />
                  <Route path="/student/results" element={<StudentResultsPage />} />
                  <Route path="/student/certificates" element={<StudentCertificatesPage />} />
                  <Route path="/student/profile" element={<StudentProfile />} />
                  <Route path="/student/timetable" element={<PersonalTimetable />} />
                  <Route path="/student/exams" element={<StudentExamsPage />} />
                  <Route path="/student/resources" element={<StudentLearningResources />} />
                  <Route path="/student/notifications" element={<StudentNotifications />} />

                  {/* Teacher routes */}
                  <Route path="/teacher" element={<TeacherDashboard />} />
                  <Route path="/teacher/salary" element={<MySalary />} />
                  <Route path="/teacher/leaves" element={<MyLeaves />} />
                  <Route path="/teacher/profile" element={<TeacherProfile />} />
                  <Route path="/teacher/calendar" element={<TeacherWeeklyTimetable />} />
                  <Route path="/teacher/timetable" element={<TeacherTimetable />} />
                  <Route path="/teacher/resources" element={<TeacherLearningResources />} />

                  {/* Admin / Teacher shared routes */}
                  <Route path="/students" element={<Students />} />
                  <Route path="/students/:id" element={<StudentProfile />} />
                  <Route path="/inquiries" element={<Inquiries />} />
                  <Route path="/courses" element={<Courses />} />
                  <Route path="/batches" element={<Batches />} />
                  <Route path="/teachers" element={<Teachers />} />
                  <Route path="/attendance" element={<Attendance />} />
                  <Route path="/attendance/mark/:sessionId" element={<MarkAttendance />} />
                  <Route path="/fees/structures" element={<FeeStructures />} />
                  <Route path="/fees" element={<StudentFees />} />
                  <Route path="/parents" element={<Parents />} />
                  <Route path="/exams" element={<Exams />} />
                  <Route path="/results" element={<Results />} />
                  <Route path="/results/enter/:examId" element={<EnterResults />} />
                  <Route path="/results/view/:examId" element={<ViewResults />} />
                  <Route path="/income" element={<Income />} />
                  <Route path="/expenses" element={<Expenses />} />
                  <Route path="/homework" element={<Homework />} />
                  <Route path="/subjects" element={<Subjects />} />
                  <Route path="/receipts" element={<Receipts />} />
                  <Route path="/certificates" element={<Certificates />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/user-management" element={<UserManagement />} />
                  <Route path="/notifications" element={<Notifications />} />
                  <Route path="/student-batches" element={<StudentBatches />} />
                  <Route path="/student-documents" element={<StudentDocuments />} />
                  <Route path="/progress" element={<ProgressEvaluations />} />
                  <Route path="/student-progress" element={<StudentProgressReport />} />
                  <Route path="/attendance/reports" element={<AttendanceReports />} />
                  <Route path="/profit-loss" element={<ProfitLoss />} />
                  <Route path="/learning-resources" element={<LearningResources />} />
                  <Route path="/mediums" element={<Mediums />} />
                  <Route path="/tax-settings" element={<TaxSettings />} />
                  <Route path="/tax-report" element={<TaxReport />} />

                  {/* Accounting Routes */}
                  <Route path="/chart-of-accounts" element={<ChartOfAccounts />} />
                  <Route path="/journal-entry" element={<JournalEntry />} />
                  <Route path="/ledger" element={<Ledger />} />
                  <Route path="/trial-balance" element={<TrialBalance />} />
                  <Route path="/inventory-issue" element={<IssueInventory />} />
                  <Route path="/vouchers" element={<Vouchers />} />
                  <Route path="/payment-voucher" element={<PaymentVoucher />} />
                  <Route path="/receipt-voucher" element={<ReceiptVoucher />} />
                  <Route path="/contra-voucher" element={<ContraVoucher />} />
                  <Route path="/accounting" element={<AccountingHub />} />
                  <Route path="/vouchers/:id" element={<VoucherDetail />} />
                  <Route path="/balance-sheet" element={<BalanceSheet />} />
                  <Route path="/cash-book" element={<CashBook />} />
                  <Route path="/day-book" element={<DayBook />} />
                  <Route path="/aged-receivables" element={<AgedReceivables />} />
                  <Route path="/bank-reconciliation" element={<BankReconciliation />} />
                  <Route path="/budgets" element={<Budgets />} />
                  <Route path="/budget-vs-actual" element={<BudgetVsActual />} />
                  <Route path="/fixed-assets" element={<FixedAssets />} />
                  <Route path="/bill-wise" element={<BillWiseEntries />} />
                  <Route path="/gst-report" element={<GSTReport />} />

                  {/* Inventory Routes */}
                  <Route path="/inventory-items" element={<InventoryItems />} />
                  <Route path="/inventory-transactions" element={<InventoryTransactions />} />
                  <Route path="/add-stock" element={<AddStock />} />
                  <Route path="/stock-dashboard" element={<StockDashboard />} />
                  <Route path="/purchase-orders" element={<PurchaseOrders />} />
                  <Route path="/purchase-orders/new" element={<POForm />} />
                  <Route path="/purchase-orders/:id/edit" element={<POForm />} />
                  <Route path="/purchase-orders/:id" element={<PODetail />} />

                  {/* Hub Routes */}
                  <Route path="/admissions-hub" element={<AdmissionsHub />} />
                  <Route path="/academics-hub" element={<AcademicsHub />} />
                  <Route path="/hr-hub" element={<HRHub />} />
                  <Route path="/communication-hub" element={<CommunicationHub />} />
                  <Route path="/settings-hub" element={<SettingsHub />} />

                  {/* HR & Salary */}
                  <Route path="/teachers/:id/salary" element={<TeacherSalarySettings />} />
                  <Route path="/generate-salaries" element={<GenerateSalaries />} />
                  <Route path="/salary-payments" element={<SalaryPayments />} />
                  <Route path="/salary-setup" element={<SalarySetup />} />
                  <Route path="/teacher-attendance" element={<TeacherAttendance />} />
                  <Route path="/salary-report" element={<SalaryReport />} />

                  {/* GST & Invoicing */}
                  <Route path="/gst-settings" element={<GSTSettings />} />
                  <Route path="/vendors" element={<Vendors />} />
                  <Route path="/invoices" element={<Invoices />} />
                  <Route path="/invoices/new" element={<InvoiceForm />} />
                  <Route path="/invoices/:id" element={<InvoiceView />} />
                  <Route path="/invoices/:id/edit" element={<InvoiceForm />} />
                  <Route path="/gstr-3b-summary" element={<GSTR3BSummary />} />
                  <Route path="/credit-notes" element={<CreditNotes />} />
                  <Route path="/debit-notes" element={<DebitNotes />} />
                  <Route path="/purchase-register" element={<PurchaseRegister />} />
                  <Route path="/purchase-invoices" element={<PurchaseInvoices />} />
                  <Route path="/purchase-invoices/new" element={<PurchaseInvoiceForm />} />
                  <Route path="/purchase-invoices/:id" element={<PurchaseInvoiceView />} />
                  <Route path="/purchase-invoices/:id/edit" element={<PurchaseInvoiceForm />} />

                  {/* Teacher Reports */}
                  <Route path="/teacher-attendance-report" element={<TeacherAttendanceReport />} />
                  <Route path="/teacher-daily-attendance-report" element={<TeacherDailyAttendanceReport />} />
                  <Route path="/teacher-lecture-report" element={<TeacherLectureReport />} />
                  <Route path="/teacher-lecture-count" element={<TeacherLectureCountReport />} />

                  {/* Other */}
                  <Route path="/activity-logs" element={<ActivityLogs />} />
                  <Route path="/branches" element={<Branches />} />
                  <Route path="/onboarding" element={<OnboardingWizard />} />
                  <Route path="/theme-settings" element={<ThemeSettings />} />

                  {/* Report Engine */}
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/reports/:reportId" element={<ReportPageWrapper />} />

                  {/* Admin Master Timetable */}
                  <Route path="/timetable" element={<AdminTimetable />} />

                  {/* Leave Management (admin) */}
                  <Route path="/leave-management" element={<LeaveManagement />} />

                  {/* Online Classes */}
                  <Route path="/online-classes" element={<OnlineClassList />} />
                  <Route path="/online-classes/create" element={<CreateOnlineClass />} />
                  <Route path="/online-classes/join/:classId" element={<JoinOnlineClass />} />
                  <Route path="/student-management" element={<StudentManagement />} />

                  <Route path="/master-data" element={<MasterData />} />
                  <Route path="/Home/FinanceHub" element={<FinanceHub />} />

                  <Route path="/email-test" element={<EmailTest />} />
                </Route>

                {/* Catch-all */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </AntThemeWrapper>
          </ThemeProvider>
          </ScopeProvider>
        </OrganizationProvider>
      </AuthProvider>
      <AIChat />
    </ErrorBoundary>
  );
}

export default App;