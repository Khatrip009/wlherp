// src/services/reportService.js
import { getReportConfig } from '../utils/reportConfig';

/**
 * Fetch data for a given report using its configuration and current filters.
 * Supports all three queryBuilder styles:
 * 1. Supabase query builder (thenable) → { data, error }
 * 2. Promise that resolves to an array (e.g., student_ledger)
 * 3. Promise that resolves to a plain object (e.g., account_ledger)
 */
export async function fetchReportData(reportId, filters = {}, branchId, financialYearId) {
  const config = getReportConfig(reportId);
  if (!config) throw new Error(`Unknown report: ${reportId}`);

  const queryResult = config.queryBuilder(filters, branchId, financialYearId);
  
  // 1. If it's a thenable (Supabase query builder or any Promise), await it first
  if (typeof queryResult?.then === 'function') {
    const response = await queryResult;

    // Supabase-style { data, error } response
    if (response && typeof response === 'object' && 'data' in response) {
      if (response.error) throw response.error;
      const rawData = response.data;
      console.log('Raw data (Supabase response):', rawData);
      return config.transform ? config.transform(rawData) : rawData;
    }

    // If the resolved value is directly an array or object, handle below
    // (fall through to the following checks)
    return handleResult(response, config);
  }

  // 2. If it's not a thenable (sync return), handle directly
  return handleResult(queryResult, config);
}

function handleResult(result, config) {
  console.log('Raw result:', result);

  // Already an array (e.g., student_ledger)
  if (Array.isArray(result)) {
    console.log('Raw data (array):', result);
    return config.transform ? config.transform(result) : result;
  }

  // Plain object (e.g., account_ledger returns { lines, ... })
  if (typeof result === 'object' && result !== null) {
    console.log('Raw data (object):', result);
    return config.transform ? config.transform(result) : result;
  }

  throw new Error('Unsupported queryBuilder return type');
}