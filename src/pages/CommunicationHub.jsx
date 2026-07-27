import HubCard from "../components/HubCard";
import { useTheme } from "../context/ThemeContext";
import { Video, BookOpen } from "lucide-react";

const groups = [
  {
    label: "Online Classes",
    items: [
      { to: "/online-classes", icon: Video, label: "Online Classes", desc: "View and manage all virtual classes" },
      { to: "/online-classes/create", icon: Video, label: "Create Class", desc: "Schedule a new online class" },
      { to: "/reports/online_class_attendance", icon: BookOpen, label: "Class Attendance Report", desc: "Who joined and for how long" },
    ],
  },
  {
    label: "Learning Resources",
    items: [
      { to: "/learning-resources", icon: BookOpen, label: "Learning Resources", desc: "Upload and manage study materials" },
    ],
  },
];

export default function CommunicationHub() {
  const theme = useTheme();
  const headingFont = theme?.font_heading || "Righteous";
  const bodyFont = theme?.font_body || "Montserrat";

  return (
    <>
      <div className="mb-6">
        <h1
          className="text-3xl font-bold text-primary"
          style={{ fontFamily: headingFont }}
        >
          Communication Hub
        </h1>
        <p
          className="text-sm text-primary-dark mt-1"
          style={{ fontFamily: bodyFont }}
        >
          Online classes and learning resources
        </p>
      </div>
      <div className="space-y-8">
        {groups.map((g) => (
          <div key={g.label}>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-primary-dark border-b border-primary-bg pb-2 mb-4">
              {g.label}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {g.items.map((m) => <HubCard key={m.to} {...m} />)}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}