/**
 * Processes a single chunk of an Excel file, transforming the data for DHIS2.
 * This job reads a specific range of rows from the Excel file, maps the data
 * to the required DHIS2 format, and prepares it for the next step.
 */
each(
  "chunks[*]",
  fn(async (state) => {
    const chunk = state.data;
    console.log(`Processing chunk with ${chunk.rowCount} rows from ${chunk.fileName}`);
    
    // Read only the specified chunk from the Excel file.
    const { data } = await getXLSX(chunk.filePath, {
      withHeader: true,
      startRow: chunk.startRow,
      endRow: chunk.endRow,
    })(state);

    if (!data || data.length === 0) {
      console.warn(`  - Warning: No data found in chunk from ${chunk.fileName}.`);
      return { ...state, processedRows: [] };
    }
    
    // Define the DHIS2 parameters and how to map the Excel columns.
    const DHIS2_CONFIG = {
      dataSet: 'necyFYLlEI0',
      orgUnit: 'drsiURo4DeK',
      period: '202501',
    };

    const processedRows = data.map(row => ({
      dataElement: row['Indicator_name'],
      orgUnit: row['Site'] || DHIS2_CONFIG.orgUnit,
      period: row['Quarter'] || DHIS2_CONFIG.period,
      value: row['IndicatorValue'],
    }));
    
    console.log(`  - Prepared ${processedRows.length} rows for DHIS2.`);
    
    // Return the transformed rows for this chunk.
    return { ...state, processedRows };
  })
);