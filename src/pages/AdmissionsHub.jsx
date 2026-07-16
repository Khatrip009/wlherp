// src/pages/AdmissionsHub.jsx
import HubCard from "../components/HubCard";
import {
  Users,
  Megaphone,
  Layers,
  FileText,
  UserPlus,
  ClipboardList,
  BarChart3,
  Search,
} from "lucide-react";

const groups = [
  {
    label: "Lead Management",
    items: [
      {
        to: "/inquiries",
        icon: Megaphone,
        label: "Inquiries",
        desc: "Track and follow up on student inquiries",
      },
      {
        to: "/reports/inquiry_conversion",
        icon: BarChart3,
        label: "Inquiry Conversion",
        desc: "Conversion rate by source & status",
      },
      {
        to: "/reports/admission_pipeline",
        icon: ClipboardList,
        label: "Admission Pipeline",
        desc: "Full lead pipeline with follow-up dates",
      },
    ],
  },
  {
    label: "Student Records",
    items: [
      {
        to: "/students",
        icon: Users,
        label: "Students",
        desc: "View and manage all student profiles",
      },
      {
        to: "/parents",
        icon: UserPlus,
        label: "Parents / Guardians",
        desc: "Parent and guardian records",
      },
      {
        to: "/student-batches",
        icon: Layers,
        label: "Batch Assignment",
        desc: "Assign students to batches",
      },
      {
        to: "/student-documents",
        icon: FileText,
        label: "Documents",
        desc: "Upload and manage student documents",
      },
    ],
  },
  {
    label: "Reports",
    items: [
      {
        to: "/reports/student_enrollment",
        icon: BarChart3,
        label: "Enrollment Report",
        desc: "Students enrolled in a date range",
      },
      {
        to: "/reports/student_status_list",
        icon: Users,
        label: "Active / Inactive List",
        desc: "Filter students by status",
      },
      {
        to: "/reports/student_parents",
        icon: Users,
        label: "Student-Parent Mapping",
        desc: "Guardian details per student",
      },
      {
        to: "/reports/student_contact_directory",
        icon: Search,
        label: "Contact Directory",
        desc: "Full contact list with guardian info",
      },
      {
        to: "/reports/student_documents",
        icon: FileText,
        label: "Documents Report",
        desc: "Documents uploaded per student",
      },
      {
        to: "/reports/admission_form",
        icon: FileText,
        label: "Admission Form (Print)",
        desc: "Printable admission form",
      },
    ],
  },
];

export default function AdmissionsHub() {
  return (
    <div className="space-y-8 px-4 sm:px-6 lg:px-0">
      {/* Header */}
      <div>
        <h1
          className="text-2xl sm:text-3xl font-bold"
          style={{
            fontFamily: "var(--font-heading)",
            color: "var(--color-primary)",
          }}
        >
          Admissions Hub
        </h1>
        <p
          className="text-sm text-gray-600 dark:text-gray-400 mt-1"
          style={{ fontFamily: "var(--font-body)" }}
        >
          Manage inquiries, student records, and admission reports
        </p>
      </div>

      {/* Groups */}
      {groups.map((g) => (
        <div key={g.label}>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 pb-2 mb-4">
            {g.label}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {g.items.map((m) => (
              <HubCard key={m.to} {...m} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}