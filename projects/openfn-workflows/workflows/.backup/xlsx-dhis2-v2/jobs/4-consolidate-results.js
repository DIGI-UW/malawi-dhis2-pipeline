/**
 * Job: 4. Consolidate Processing Results
 *
 * Description:
 * This job consolidates the results from the DHIS2 upload step. It provides
 * a summary of the entire operation, including the number of successful and
 * failed uploads, and calculates key metrics.
 *
 * OpenFn Principles:
 * - Clarity: Presents a clear and concise summary of the workflow's outcome.
 * - Data-Driven: Bases its summary on the actual results from the uploads.
 * - Accountability: Provides a transparent view of successes and failures.
 */

fn(state => {
  console.log('4. Consolidating processing results...');

  // The results from the previous `each` loop are in `state.data`.
  const uploadResults = state.data;

  if (!uploadResults || uploadResults.length === 0) {
    console.log('  - No upload results to consolidate.');
    return { ...state, consolidationSummary: { message: 'No payloads were uploaded.' } };
  }

  // Initialize statistics for consolidation.
  let successfulUploads = 0;
  let failedUploads = 0;
  let totalDataValues = 0;
  let successfulDataValues = 0;

  // Tally the results from each upload.
  uploadResults.forEach(result => {
    // Each result comes from one payload upload.
    const payload = result.data; // The payload is in the `data` property of the result.
    totalDataValues += payload.dataValues.length;

    if (result.uploadStatus === 'success') {
      successfulUploads++;
      const { importCount } = result.dhis2Response;
      if (importCount) {
        successfulDataValues += (importCount.imported || 0) + (importCount.updated || 0);
      }
    } else {
      failedUploads++;
    }
  });

  // Calculate success rates.
  const uploadSuccessRate = (successfulUploads / uploadResults.length) * 100;
  const dataValueSuccessRate = totalDataValues > 0 ? (successfulDataValues / totalDataValues) * 100 : 0;

  // Create a summary of the consolidation.
  const consolidationSummary = {
    totalPayloads: uploadResults.length,
    successfulUploads,
    failedUploads,
    uploadSuccessRate: uploadSuccessRate.toFixed(2),
    totalDataValues,
    successfulDataValues,
    dataValueSuccessRate: dataValueSuccessRate.toFixed(2),
  };

  console.log('  - Consolidation Summary:');
  console.log(`    - Total Payloads: ${consolidationSummary.totalPayloads}`);
  console.log(`    - Successful Uploads: ${consolidationSummary.successfulUploads}`);
  console.log(`    - Failed Uploads: ${consolidationSummary.failedUploads}`);
  console.log(`    - Data Value Success Rate: ${consolidationSummary.dataValueSuccessRate}%`);

  // Return the summary and the original `newFile` for the final step.
  // Use `state.newFile` to ensure the file is correctly passed to the final job.
  return { ...state, consolidationSummary, newFile: state.newFile };
}); 