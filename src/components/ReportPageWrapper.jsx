// src/components/ReportPageWrapper.jsx
import { useParams } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import ReportPage from './ReportPage';

export default function ReportPageWrapper() {
  const { reportId } = useParams();
  const theme = useTheme();
  return <ReportPage reportId={reportId} theme={theme} />;
}