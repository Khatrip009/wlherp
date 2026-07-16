// src/services/reportService.js
import { getReportConfig } from '../utils/reportConfig';

/**
 * Fetch data for a given report using its configuration and current filters.
 * 
 * @param {string} reportId  - key of the report in reportConfig.js
 * @param {object} filters   - key-value pairs of filter values
 * @param {number|string} branchId - current branch id
 * @param {number|string} financialYearId - current financial year id
 * @returns {Promise<Array>} - transformed data ready for the table
 */
export async function fetchReportData(reportId, filters = {}, branchId, financialYearId) {
  const config = getReportConfig(reportId);
  if (!config) throw new Error(`Unknown report: ${reportId}`);

  const queryPromise = config.queryBuilder(filters, branchId, financialYearId);
  const result = await queryPromise;
  
  // ── DEBUG ──
  console.log('Raw Supabase result:', result);

  if (result?.error) throw result.error;
  const rawData = result?.data !== undefined ? result.data : result;
  console.log('Raw data (before transform):', rawData);

  const transformed = config.transform ? config.transform(rawData) : rawData;
  console.log('Transformed data:', transformed);
  return transformed;
}