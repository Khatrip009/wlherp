// src/components/ReportPageWrapper.jsx
import { useParams } from 'react-router-dom';
import ReportPage from './ReportPage';

export default function ReportPageWrapper() {
  const { reportId } = useParams();
  return <ReportPage reportId={reportId} />;
}