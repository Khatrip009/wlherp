import { Link } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";

export default function HubCard({ to, icon: Icon, label, desc, badge, color = "text-primary", bg = "bg-primary-bg" }) {
  const theme = useTheme();
  const headingFont = theme?.font_heading || "Righteous";
  const bodyFont = theme?.font_body || "Montserrat";

  return (
    <Link
      to={to}
      className="relative bg-white rounded-xl p-5 shadow-sm border border-primary-bg hover:border-primary/30 hover:shadow-lg transition-all group flex flex-col"
    >
      {badge != null && (
        <span className="absolute top-3 right-3 text-xs font-semibold bg-accent/10 text-accent px-2 py-0.5 rounded-full" style={{ fontFamily: bodyFont }}>
          {badge}
        </span>
      )}
      <div className={`p-2 ${bg} rounded-lg w-fit mb-3`}>
        <Icon size={20} className={color} />
      </div>
      <h3 className="group-hover:text-accent transition-colors text-sm text-primary-dark" style={{ fontFamily: headingFont }}>
        {label}
      </h3>
      {desc && (
        <p className="text-xs text-primary-dark mt-1 leading-relaxed" style={{ fontFamily: bodyFont }}>
          {desc}
        </p>
      )}
    </Link>
  );
}