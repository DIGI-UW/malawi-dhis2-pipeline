/**
 * Shared Excel validation utilities for OpenFN workflows
 */

export const validationSchemas = {
  hiv_indicators: {
    requiredColumns: ['indicator', 'value', 'period', 'orgUnit'],
    optionalColumns: ['target', 'comment', 'dataElement']
  },
  direct_queries: {
    requiredColumns: ['site', 'indicator', 'value', 'period'],
    optionalColumns: ['orgUnit', 'target', 'comment']
  },
  dq_sites: {
    requiredColumns: ['site', 'indicator', 'value', 'period'],
    optionalColumns: ['orgUnit', 'score', 'completeness']
  }
};

export function validateExcelData(data, dataType) {
  const schema = validationSchemas[dataType];
  if (!schema) {
    return { isValid: true, warnings: [`No validation schema for data type: ${dataType}`] };
  }

  const warnings = [];
  let isValid = true;

  // Get the actual data array based on type
  let dataArray = [];
  if (dataType === 'hiv_indicators' && data.indicators) {
    dataArray = data.indicators;
  } else if (dataType === 'direct_queries' && data.queries) {
    dataArray = data.queries;
  } else if (dataType === 'dq_sites' && data.sites) {
    dataArray = data.sites;
  }

  if (dataArray.length === 0) {
    warnings.push('No data found in the parsed Excel file');
    isValid = false;
  }

  // Check required columns in first few rows
  const sampleRows = dataArray.slice(0, 5);
  schema.requiredColumns.forEach(column => {
    const hasColumn = sampleRows.some(row => row[column] !== undefined && row[column] !== null);
    if (!hasColumn) {
      warnings.push(`Required column '${column}' appears to be missing or empty`);
    }
  });

  return { isValid, warnings };
}

export function sanitizeValue(value, type = 'string') {
  if (value === null || value === undefined) {
    return null;
  }
  
  switch (type) {
    case 'number':
      const num = parseFloat(value);
      return isNaN(num) ? 0 : num;
    case 'string':
      return String(value).trim();
    case 'date':
      return value instanceof Date ? value.toISOString().split('T')[0] : String(value);
    default:
      return value;
  }
}
