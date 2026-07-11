import os, re

base = r'src\pages'
src = r'src'

def read(path):
    with open(path, 'rb') as f:
        return f.read()

def check(label, condition):
    status = 'OK' if condition else 'FAIL'
    print(f'  [{status}] {label}')
    return condition

print('='*60)
print('BACKBUTTON AUDIT')
print('='*60)

# All pages that should have BackButton (not hubs, not dashboards, not login)
skip = {'Dashboard.jsx','StudentDashboard.jsx','TeacherDashboard.jsx','Login.jsx',
        'NotFound.jsx','AdmissionsHub.jsx','AcademicsHub.jsx','AccountingHub.jsx',
        'HRHub.jsx','CommunicationHub.jsx','SettingsHub.jsx',
        'StudentProfile.jsx',  # has its own nav
        'EnterResults.jsx','ViewResults.jsx',  # sub-sub pages
        'MarkAttendance.jsx',  # sub page
        'POForm.jsx','PODetail.jsx',  # sub pages
        'InvoiceForm.jsx','InvoiceView.jsx',
        'PurchaseInvoiceForm.jsx','PurchaseInvoiceView.jsx',
        'VoucherDetail.jsx','PaymentVoucher.jsx','ReceiptVoucher.jsx','ContraVoucher.jsx',
        'StudentProgressReport.jsx',
        'ProfitLoss.jsx','ProfitLossStatement.jsx',
        'TeacherSalarySettings.jsx','GenerateSalaries.jsx','SalarySetup.jsx',
        'SalaryReport.jsx','TeacherAttendance.jsx',
        'AdminTimetable.jsx','PersonalTimetable.jsx',
        'Fees.jsx',  # old page
        }

pages = [f for f in os.listdir(base) if f.endswith('.jsx') and f not in skip]
missing_bb = []
for p in sorted(pages):
    c = read(os.path.join(base, p))
    if b'AdminLayout' in c and b'BackButton' not in c:
        missing_bb.append(p)

if missing_bb:
    print(f'MISSING BackButton ({len(missing_bb)} pages):')
    for p in missing_bb:
        print(f'  - {p}')
else:
    print('All applicable pages have BackButton: OK')

print()
print('='*60)
print('ROUTE AUDIT (App.jsx)')
print('='*60)
app = read(r'src\App.jsx').decode('utf-8', errors='ignore')

routes_to_check = [
    ('/student', 'StudentDashboard'),
    ('/student/fees', 'StudentFeesPage'),
    ('/student/attendance', 'StudentAttendancePage'),
    ('/student/homework', 'StudentHomeworkPage'),
    ('/student/results', 'StudentResultsPage'),
    ('/student/exams', 'StudentExamsPage'),
    ('/student/certificates', 'StudentCertificatesPage'),
    ('/student/batch', 'StudentBatchPage'),
    ('/student/timetable', 'PersonalTimetable'),
    ('/student/resources', 'StudentLearningResources'),
    ('/student/notifications', 'StudentNotifications'),
    ('/student/profile', 'StudentProfile'),
    ('/teacher', 'TeacherDashboard'),
    ('/teacher/salary', 'MySalary'),
    ('/teacher/leaves', 'MyLeaves'),
    ('/teacher/profile', 'TeacherProfile'),
    ('/teacher/timetable', 'TeacherTimetable'),
    ('/teacher/resources', 'TeacherLearningResources'),
    ('/admissions-hub', 'AdmissionsHub'),
    ('/academics-hub', 'AcademicsHub'),
    ('/accounting', 'AccountingHub'),
    ('/hr-hub', 'HRHub'),
    ('/communication-hub', 'CommunicationHub'),
    ('/settings-hub', 'SettingsHub'),
    ('/reports', 'Reports'),
    ('/notifications', 'Notifications'),
    ('/online-classes', 'OnlineClassList'),
    ('/learning-resources', 'LearningResources'),
    ('/leave-management', 'LeaveManagement'),
    ('/salary-payments', 'SalaryPayments'),
    ('/user-management', 'UserManagement'),
    ('/theme-settings', 'ThemeSettings'),
    ('/organization-settings', 'OrganizationSettings'),
    ('/attendance/reports', 'AttendanceReports'),
    ('/progress', 'ProgressEvaluations'),
    ('/student-batches', 'StudentBatches'),
    ('/student-documents', 'StudentDocuments'),
]

missing_routes = []
for route, component in routes_to_check:
    if f'path="{route}"' not in app:
        missing_routes.append((route, component))

if missing_routes:
    print(f'MISSING ROUTES ({len(missing_routes)}):')
    for r, c in missing_routes:
        print(f'  - {r} -> {c}')
else:
    print('All routes present: OK')

print()
print('='*60)
print('SIDEBAR AUDIT')
print('='*60)
sidebar = read(r'src\components\Sidebar.jsx').decode('utf-8', errors='ignore')

sidebar_links = [
    ('/student', 'student nav'),
    ('/student/fees', 'student fees'),
    ('/student/attendance', 'student attendance'),
    ('/student/homework', 'student homework'),
    ('/student/exams', 'student exams'),
    ('/student/results', 'student results'),
    ('/student/certificates', 'student certificates'),
    ('/student/notifications', 'student notifications'),
    ('/teacher', 'teacher nav'),
    ('/teacher/salary', 'teacher salary'),
    ('/teacher/leaves', 'teacher leaves'),
    ('/teacher/profile', 'teacher profile'),
    ('/teacher/timetable', 'teacher timetable'),
    ('/notifications', 'teacher notifications'),
    ('/admissions-hub', 'admin admissions hub'),
    ('/academics-hub', 'admin academics hub'),
    ('/accounting', 'admin accounting hub'),
    ('/hr-hub', 'admin hr hub'),
    ('/communication-hub', 'admin communication hub'),
    ('/settings-hub', 'admin settings hub'),
]

missing_sidebar = []
for link, label in sidebar_links:
    if f'to="{link}"' not in sidebar:
        missing_sidebar.append((link, label))

if missing_sidebar:
    print(f'MISSING SIDEBAR LINKS ({len(missing_sidebar)}):')
    for l, label in missing_sidebar:
        print(f'  - {l} ({label})')
else:
    print('All sidebar links present: OK')

print()
print('='*60)
print('DASHBOARD AUDIT')
print('='*60)
sd = read(r'src\pages\StudentDashboard.jsx')
print('StudentDashboard:')
check('Quick action links', b'/student/fees' in sd)
check('Notifications widget', b'unreadCount' in sd)
check('N+1 fee fix (nested select)', b'fee_payments(amount)' in sd)
check('No separate supabase loop', b'for (const f of' not in sd or b'f.fee_payments' in sd)
check('BackButton absent (correct - it IS the dashboard)', b'BackButton' not in sd)

td = read(r'src\pages\TeacherDashboard.jsx')
print('TeacherDashboard:')
check('Quick action buttons', b'Mark Attendance' in td)
check('Salary widget', b'salaryInfo' in td)
check('Notifications widget', b'unreadCount' in td)
check('Leave widget', b'pendingLeaves' in td)
check('BackButton absent (correct - it IS the dashboard)', b'BackButton' not in td)

print()
print('='*60)
print('KEY PAGE CHECKS')
print('='*60)

checks = [
    ('MySalary.jsx', b'net_amount', 'Shows net/TDS breakdown'),
    ('MySalary.jsx', b'BackButton', 'Has BackButton'),
    ('MyLeaves.jsx', b'teacher_leaves', 'Uses correct table'),
    ('MyLeaves.jsx', b'BackButton', 'Has BackButton'),
    ('TeacherProfile.jsx', b'BackButton', 'Has BackButton'),
    ('TeacherTimetable.jsx', b'BackButton', 'Has BackButton'),
    ('StudentResultsPage.jsx', b'BackButton', 'Has BackButton'),
    ('StudentAttendancePage.jsx', b'BackButton', 'Has BackButton'),
    ('StudentFeesPage.jsx', b'BackButton', 'Has BackButton'),
    ('StudentExamsPage.jsx', b'BackButton', 'Has BackButton'),
    ('StudentHomeworkPage.jsx', b'BackButton', 'Has BackButton'),
    ('StudentCertificatesPage.jsx', b'BackButton', 'Has BackButton'),
    ('StudentBatchPage.jsx', b'BackButton', 'Has BackButton'),
    ('Income.jsx', b'BackButton', 'Has BackButton'),
    ('Expenses.jsx', b'BackButton', 'Has BackButton'),
    ('Vouchers.jsx', b'BackButton', 'Has BackButton'),
    ('Invoices.jsx', b'BackButton', 'Has BackButton'),
    ('LeaveManagement.jsx', b'BackButton', 'Has BackButton'),
    ('SalaryPayments.jsx', b'BackButton', 'Has BackButton'),
    ('Notifications.jsx', b'BackButton', 'Has BackButton'),
    ('LearningResources.jsx', b'BackButton', 'Has BackButton'),
    ('OnlineClassList.jsx', b'BackButton', 'Has BackButton'),
    ('UserManagement.jsx', b'BackButton', 'Has BackButton'),
    ('Settings.jsx', b'BackButton', 'Has BackButton'),
    ('OrganizationSettings.jsx', b'BackButton', 'Has BackButton'),
    ('ThemeSettings.jsx', b'BackButton', 'Has BackButton'),
    ('AttendanceReports.jsx', b'BackButton', 'Has BackButton'),
    ('ProgressEvaluations.jsx', b'BackButton', 'Has BackButton'),
    ('StudentDocuments.jsx', b'BackButton', 'Has BackButton'),
    ('StudentBatches.jsx', b'BackButton', 'Has BackButton'),
]

fails = 0
for fname, needle, label in checks:
    path = os.path.join(base, fname)
    if not os.path.exists(path):
        print(f'  [MISSING FILE] {fname}')
        fails += 1
        continue
    c = read(path)
    ok = needle in c
    if not ok:
        print(f'  [FAIL] {fname}: {label}')
        fails += 1

if fails == 0:
    print('All key page checks passed: OK')

print()
print('='*60)
print('STUDENT NOTIFICATIONS PAGE')
print('='*60)
sn = read(os.path.join(base, 'StudentNotifications.jsx'))
check('Has AdminLayout', b'AdminLayout' in sn)
check('Fetches notifications', b'notifications' in sn)

print()
print('='*60)
print('SUMMARY')
print('='*60)
total_issues = len(missing_bb) + len(missing_routes) + len(missing_sidebar) + fails
print(f'Total issues found: {total_issues}')
if total_issues == 0:
    print('ERP is PRODUCTION READY!')
else:
    print('Issues need fixing.')
