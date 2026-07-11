import AdminLayout from "../layouts/AdminLayout";
import HubCard from "../components/HubCard";
import {
  BookOpen, Layers, CalendarCheck, BarChart3, TrendingUp,
  FileText, ClipboardCheck, Calendar, Video, GraduationCap, Award,
} from "lucide-react";

const groups = [
  {
    label: "Course Setup",
    items: [
      { to: "/courses", icon: BookOpen, label: "Courses", desc: "Manage courses and levels" },
      { to: "/subjects", icon: BookOpen, label: "Subjects", desc: "Manage subjects per course" },
      { to: "/mediums", icon: BookOpen, label: "Mediums", desc: "Instruction mediums (English, Hindi…)" },
      { to: "/batches", icon: Layers, label: "Batches", desc: "Create and manage batches" },
    ],
  },
  {
    label: "Attendance",
    items: [
      { to: "/attendance", icon: CalendarCheck, label: "Attendance Sessions", desc: "Create sessions and mark attendance" },
      { to: "/reports/attendance_summary", icon: BarChart3, label: "Attendance Summary", desc: "Batch-wise attendance overview" },
      { to: "/reports/student_attendance_pct", icon: BarChart3, label: "Student Attendance %", desc: "Per-student attendance percentage" },
      { to: "/reports/student_attendance_detail", icon: FileText, label: "Detailed Attendance", desc: "Day-by-day attendance per student" },
    ],
  },
  {
    label: "Homework & Exams",
    items: [
      { to: "/homework", icon: FileText, label: "Homework", desc: "Assign and review homework" },
      { to: "/exams", icon: ClipboardCheck, label: "Exams", desc: "Create and schedule exams" },
      { to: "/results", icon: BarChart3, label: "Results", desc: "Enter and view exam results" },
      { to: "/reports/homework_submissions", icon: FileText, label: "Homework Report", desc: "Submission status per student" },
      { to: "/reports/exam_results", icon: BarChart3, label: "Exam Results Report", desc: "Marks per student per exam" },
    ],
  },
  {
    label: "Progress & Certificates",
    items: [
      { to: "/progress", icon: TrendingUp, label: "Progress Evaluations", desc: "Teacher evaluations per student" },
      { to: "/student-progress", icon: TrendingUp, label: "Progress Report", desc: "Individual student progress" },
      { to: "/certificates", icon: Award, label: "Certificates", desc: "Issue course completion certificates" },
      { to: "/reports/student_progress", icon: BarChart3, label: "Progress Analytics", desc: "Attendance & performance scores" },
      { to: "/reports/student_level_completion", icon: GraduationCap, label: "Level Completion", desc: "Progress through course levels" },
      { to: "/reports/certificates_issued", icon: Award, label: "Certificates Issued", desc: "All certificates with student details" },
    ],
  },
  {
    label: "Timetable & Online Classes",
    items: [
      { to: "/timetable", icon: Calendar, label: "Master Timetable", desc: "Admin class schedule" },
      { to: "/online-classes", icon: Video, label: "Online Classes", desc: "Create and join virtual classes" },
      { to: "/reports/online_class_attendance", icon: BarChart3, label: "Online Class Attendance", desc: "Who joined and for how long" },
      { to: "/reports/batch_schedule_report", icon: Calendar, label: "Batch Schedule Report", desc: "Batch timings and assigned teachers" },
      { to: "/reports/batch_capacity", icon: Layers, label: "Batch Capacity", desc: "Enrolled vs capacity per batch" },
    ],
  },
  {
    label: "Learning Resources",
    items: [
      { to: "/learning-resources", icon: BookOpen, label: "Learning Resources", desc: "Upload and manage study materials" },
    ],
  },
];

export default function AcademicsHub() {
  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">Academics Hub</h1>
        <p className="text-sm text-secondary-dark mt-1">Courses, attendance, exams, progress, and timetables</p>
      </div>
      <div className="space-y-8">
        {groups.map((g) => (
          <div key={g.label}>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-secondary-light border-b pb-2 mb-4">{g.label}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {g.items.map((m) => <HubCard key={m.to} {...m} />)}
            </div>
          </div>
        ))}
      </div>
    </AdminLayout>
  );
}
