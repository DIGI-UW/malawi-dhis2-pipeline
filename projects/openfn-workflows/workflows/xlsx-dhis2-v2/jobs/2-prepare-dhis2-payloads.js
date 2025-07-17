/**
 * Job: 2. Prepare DHIS2 Payloads from Excel
 *
 * Description:
 * This job reads an Excel file in chunks directly from an SFTP server,
 * transforms the data into DHIS2 `dataValueSet` payloads, and passes these
 * payloads to the next job for uploading. This approach is memory-efficient
 * as it avoids loading the entire file into memory.
 *
 * OpenFn Principles:
 * - Separation of Concerns: This job is responsible only for data preparation.
 * - Efficiency: Processes large datasets without high memory usage.
 * - Modularity: Logic is contained and focused on a single task.
 */

// This helper function transforms a chunk of rows into a DHIS2 dataValueSet payload.
const createDataValueSet = (chunk, config) => {
  return {
    dataSet: config.dataSet,
    orgUnit: config.orgUnit,
    period: config.period,
    dataValues: chunk.map(row => ({
      dataElement: row['Indicator_name'],
      orgUnit: row['Site'] || config.orgUnit,
      period: row['Quarter'] || config.period,
      value: row['IndicatorValue'],
    })),
  };
};

// Process each new file found in the previous step.
each(
  "newFiles[*]",
  fn(async state => {
    // Note: In an `each` loop, the item being iterated over is in `state.data`.
    const newFile = state.data;
    console.log(`2. Preparing DHIS2 payloads for file: ${newFile.name}`);

    // Configuration for data processing.
    const CHUNK_SIZE = 5000;
    const DHIS2_CONFIG = {
      dataSet: 'necyFYLlEI0',
      orgUnit: 'drsiURo4DeK',
      period: '202501',
    };

    const payloads = [];

    // Use getXLSX to process the file in streaming chunks.
    // The first argument is the file path, the second is an options object.
    await getXLSX(
      newFile.path,
      {
        chunkSize: CHUNK_SIZE,
      },
      async (chunk, state) => {
        console.log(`  - Preparing payload for chunk with ${chunk.length} rows.`);
        const payload = createDataValueSet(chunk, DHIS2_CONFIG);
        payloads.push(payload);
      }
    )(state);

    console.log(`  - Finished preparing ${payloads.length} payloads for ${newFile.name}.`);

    // Return the payloads and the original file info for the next steps.
    return { ...state, payloads, newFile };
  })
); 