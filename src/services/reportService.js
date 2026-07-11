// src/services/reportService.js
import { getReportConfig } from '../utils/reportConfig';

/**
 * Fetch data for a given report using its configuration and current filters.
 * 
 * @param {string} reportId  - key of the report in reportConfig.js
 * @param {object} filters   - key-value pairs of filter values
 * @returns {Promise<Array>} - transformed data ready for the table
 */
export async function fetchReportData(reportId, filters) {
  const config = getReportConfig(reportId);
  if (!config) throw new Error(`Unknown report: ${reportId}`);

  // queryBuilder returns a thenable (Supabase query or plain Promise)
  const queryPromise = config.queryBuilder(filters);

  if (typeof queryPromise?.then !== 'function') {
    throw new Error('queryBuilder must return a Promise');
  }

  const result = await queryPromise;

  // Supabase queries resolve to { data, error }, other promises may resolve directly
  if (result?.error) throw result.error;
  const rawData = result?.data !== undefined ? result.data : result;

  // Apply client‑side transformation if defined in the config
  return config.transform ? config.transform(rawData) : rawData;
}