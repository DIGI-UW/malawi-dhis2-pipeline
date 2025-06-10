/**
 * Shared DHIS2 utilities for OpenFN workflows
 */

export function generateDataValueSets(indicators, orgUnit, period) {
  const dataValues = indicators.map(indicator => ({
    dataElement: indicator.dataElement || indicator.indicator,
    value: indicator.value,
    period: period || indicator.period,
    orgUnit: orgUnit || indicator.orgUnit,
    comment: indicator.comment || null
  })).filter(dv => dv.dataElement && dv.value !== null && dv.value !== undefined);

  return {
    dataValues,
    period: period,
    orgUnit: orgUnit,
    completeDate: new Date().toISOString()
  };
}

export function validateDataValueSet(dataValueSet) {
  const errors = [];
  
  if (!dataValueSet.dataValues || !Array.isArray(dataValueSet.dataValues)) {
    errors.push('dataValues must be an array');
    return { isValid: false, errors };
  }
  
  if (dataValueSet.dataValues.length === 0) {
    errors.push('dataValues array cannot be empty');
    return { isValid: false, errors };
  }
  
  dataValueSet.dataValues.forEach((dv, index) => {
    if (!dv.dataElement) {
      errors.push(`Data value at index ${index} missing dataElement`);
    }
    if (dv.value === null || dv.value === undefined) {
      errors.push(`Data value at index ${index} missing value`);
    }
    if (!dv.period) {
      errors.push(`Data value at index ${index} missing period`);
    }
    if (!dv.orgUnit) {
      errors.push(`Data value at index ${index} missing orgUnit`);
    }
  });
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

export const DHIS2_MAPPINGS = {
  periods: {
    '202506': '2025Q2', // Example mapping
    '202505': '2025Q1'
  },
  orgUnits: {
    'MW_DEFAULT': 'MW', // Malawi default
    'FACILITY_001': 'MW_FAC_001'
  }
};
