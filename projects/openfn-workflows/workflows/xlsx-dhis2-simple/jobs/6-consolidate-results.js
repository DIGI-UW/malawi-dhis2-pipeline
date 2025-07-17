/**
 * Consolidates the results of the DHIS2 upload.
 * This job provides a summary of the operation, including success and failure
 * rates for the uploaded data values.
 */
fn(state => {
  console.log('Consolidating processing results...');
  
  const { uploadResult, payload } = state;

  if (!uploadResult || uploadResult.status === 'skipped') {
    console.log('  - No upload results to consolidate.');
    return { ...state, consolidationSummary: { message: 'Upload was skipped.' } };
  }

  if (uploadResult.status === 'error') {
    console.error('  - Upload failed. No results to consolidate.');
    return { ...state, consolidationSummary: { message: 'Upload failed.', error: uploadResult.error } };
  }

  // Calculate statistics based on the DHIS2 response.
  const { importCount } = uploadResult.dhis2Response;
  const successfulDataValues = (importCount.imported || 0) + (importCount.updated || 0);
  const totalDataValues = payload.dataValues.length;
  const dataValueSuccessRate = (successfulDataValues / totalDataValues) * 100;

  // Create a summary of the consolidation.
  const consolidationSummary = {
    successfulDataValues,
    totalDataValues,
    dataValueSuccessRate: dataValueSuccessRate.toFixed(2),
    importSummary: importCount,
  };

  console.log('  - Consolidation Summary:');
  console.log(`    - Successful Data Values: ${successfulDataValues}/${totalDataValues}`);
  console.log(`    - Success Rate: ${consolidationSummary.dataValueSuccessRate}%`);

  // Return the summary for the final step.
  return { ...state, consolidationSummary };
});