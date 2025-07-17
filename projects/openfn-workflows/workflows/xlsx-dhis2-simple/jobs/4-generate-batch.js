/**
 * Generates a DHIS2 `dataValueSet` payload from the processed rows.
 * This job takes the transformed data and structures it into the format
 * required by the DHIS2 API for bulk import.
 */
fn(state => {
  console.log('Generating DHIS2 batch payload...');
  
  // The results of the `each` loop from the previous job are in `state.data`.
  const processedChunks = state.data;
  const allRows = processedChunks.flatMap(chunk => chunk.processedRows);

  if (allRows.length === 0) {
    console.warn('Warning: No processed rows to create a payload from.');
    return { ...state, payload: null };
  }
  
  // Define the DHIS2 parameters for the dataValueSet.
  const DHIS2_CONFIG = {
    dataSet: 'necyFYLlEI0',
    orgUnit: 'drsiURo4DeK',
    period: '202501',
    categoryOptionCombo: 'HllvX50cXC0',
    attributeOptionCombo: 'HllvX50cXC0',
  };
  
  // Create the final payload for the DHIS2 API.
  const payload = {
    dataSet: DHIS2_CONFIG.dataSet,
    orgUnit: DHIS2_CONFIG.orgUnit,
    period: DHIS2_CONFIG.period,
    dataValues: allRows.map(row => ({
      dataElement: row.dataElement,
      period: row.period,
      orgUnit: row.orgUnit,
      value: row.value,
      categoryOptionCombo: DHIS2_CONFIG.categoryOptionCombo,
      attributeOptionCombo: DHIS2_CONFIG.attributeOptionCombo,
    })),
  };

  console.log(`  - Created payload with ${payload.dataValues.length} data values.`);
  
  // Return the complete payload for the upload job.
  return { ...state, payload };
});