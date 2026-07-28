import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function BackButton({ to, label = "Back" }) {
  const navigate = useNavigate();
  const handleClick = () => (to ? navigate(to) : navigate(-1));
  return (
    <button
      onClick={handleClick}
      className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-primary transition-colors mb-4"
    >
      <ArrowLeft size={16} />
      {label}
    </button>
  );
}