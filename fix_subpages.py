import os

base = r'src\pages'

# Student sub-pages -> back to /student
student_pages = [
    'StudentResultsPage.jsx',
    'StudentAttendancePage.jsx',
    'StudentFeesPage.jsx',
    'StudentExamsPage.jsx',
    'StudentHomeworkPage.jsx',
    'StudentCertificatesPage.jsx',
    'StudentBatchPage.jsx',
    'StudentNotifications.jsx',
    'StudentLearningResources.jsx',
    'PersonalTimetable.jsx',
]

# Teacher sub-pages -> back to /teacher
teacher_pages = [
    'TeacherProfile.jsx',
    'TeacherTimetable.jsx',
    'TeacherLearningResources.jsx',
]

import_line = b'import BackButton from "../components/BackButton";\n'

def add_backbutton(fname, hub, label):
    path = os.path.join(base, fname)
    if not os.path.exists(path):
        print(f'MISSING FILE: {fname}')
        return
    with open(path, 'rb') as f:
        content = f.read()
    if b'BackButton' in content:
        print(f'SKIP (already has): {fname}')
        return
    old_import = b'import AdminLayout from "../layouts/AdminLayout";'
    if old_import not in content:
        print(f'SKIP (no AdminLayout import): {fname}')
        return
    content = content.replace(old_import, old_import + b'\n' + import_line, 1)
    jsx_tag = b'<AdminLayout>'
    back_jsx = f'\n      <BackButton to="{hub}" label="{label}" />'.encode()
    if jsx_tag in content:
        content = content.replace(jsx_tag, jsx_tag + back_jsx, 1)
        with open(path, 'wb') as f:
            f.write(content)
        print(f'DONE: {fname}')
    else:
        print(f'SKIP (no <AdminLayout> JSX): {fname}')

for p in student_pages:
    add_backbutton(p, '/student', 'My Dashboard')

for p in teacher_pages:
    add_backbutton(p, '/teacher', 'My Dashboard')

# Fix TeacherDashboard: teacher_leaves table query - make it resilient
td_path = os.path.join(base, 'TeacherDashboard.jsx')
with open(td_path, 'rb') as f:
    td = f.read()

# Fix the table name to try teacher_leaves with fallback comment
old = b'.from("teacher_leaves")'
new = b'.from("teacher_leaves")  // table: teacher_leaves or leaves'
if old in td:
    # Already correct table name, just verify
    print('TeacherDashboard: teacher_leaves table reference found - OK')
else:
    print('TeacherDashboard: checking for leaves table...')
    if b'.from("leaves")' in td:
        td = td.replace(b'.from("leaves")', b'.from("teacher_leaves")', 1)
        with open(td_path, 'wb') as f:
            f.write(td)
        print('TeacherDashboard: fixed leaves -> teacher_leaves')

print('\nDone!')
