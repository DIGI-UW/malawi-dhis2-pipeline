/**
 * Job: 2. Process Excel File in Chunks
 *
 * Description:
 * This job processes large Excel files in a memory-efficient way. It reads the
 * file in chunks, transforms the data for each chunk, and uploads it to DHIS2.
 * This approach avoids loading the entire file into memory.
 *
 * OpenFn Principles:
 * - Efficiency: Processes large datasets without high memory usage.
 * - Modularity: Each function within the job has a clear responsibility.
 * - Resilience: Failures in one chunk do not halt the entire process.
 */

// Process each new file found in the previous step.
each(
  "newFiles[*]",
  fn(async state => {
    const { newFile, configuration } = state;
    console.log(`2. Processing file: ${newFile.name}`);

    // Configuration for data processing.
    const CHUNK_SIZE = 5000;
    const DHIS2_CONFIG = {
      dataSet: 'necyFYLlEI0',
      orgUnit: 'drsiURo4DeK',
      period: '202501',
    };

    const chunkResults = [];

    // Use getXLSX to process the file in streaming chunks.
    await getXLSX(
      {
        path: newFile.path,
        chunkSize: CHUNK_SIZE,
      },
      async (chunk, state) => {
        console.log(`  - Processing chunk with ${chunk.length} rows.`);

        // Transform the chunk data into the DHIS2 dataValueSet format.
        const dataValues = chunk.map(row => ({
          dataElement: row['Indicator_name'],
          orgUnit: row['Site'] || DHIS2_CONFIG.orgUnit,
          period: row['Quarter'] || DHIS2_CONFIG.period,
          value: row['IndicatorValue'],
        }));

        // Upload the transformed data to DHIS2.
        try {
          const response = await create('dataValueSets', {
            dataSet: DHIS2_CONFIG.dataSet,
            orgUnit: DHIS2_CONFIG.orgUnit,
            period: DHIS2_CONFIG.period,
            dataValues,
          })(state);

          console.log('  - Chunk uploaded successfully to DHIS2.');
          chunkResults.push({
            status: 'success',
            chunkSize: chunk.length,
            response: response.data,
          });
        } catch (error) {
          console.error('  - Error uploading chunk to DHIS2:', error.message);
          chunkResults.push({
            status: 'error',
            chunkSize: chunk.length,
            error: error.message,
          });
        }
      }
    )(state);

    console.log(`  - Finished processing all chunks for ${newFile.name}.`);

    // Return the results for this file.
    return { ...state, chunkResults };
  })
); 