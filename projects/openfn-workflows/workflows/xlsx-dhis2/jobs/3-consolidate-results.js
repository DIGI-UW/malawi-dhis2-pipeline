/**
 * Job: 3. Consolidate Processing Results
 *
 * Description:
 * This job consolidates the results from the chunk processing step. It provides
 * a summary of the entire operation, including the number of successful and
 * failed chunks, and calculates key metrics like success rates.
 *
 * OpenFn Principles:
 * - Clarity: Presents a clear and concise summary of the workflow's outcome.
 * - Data-Driven: Bases its summary on the actual results from processing.
 * - Accountability: Provides a transparent view of successes and failures.
 */

fn(state => {
  console.log('3. Consolidating processing results...');

  // The `chunkResults` are passed from the previous job.
  const { chunkResults } = state;

  if (!chunkResults || chunkResults.length === 0) {
    console.log('  - No chunk results to consolidate.');
    return { ...state, consolidationSummary: { message: 'No chunks were processed.' } };
  }

  // Initialize statistics for consolidation.
  let successfulChunks = 0;
  let failedChunks = 0;
  let totalDataValues = 0;
  let successfulDataValues = 0;

  // Tally the results from each chunk.
  chunkResults.forEach(result => {
    totalDataValues += result.chunkSize;
    if (result.status === 'success') {
      successfulChunks++;
      const { importCount } = result.response;
      if (importCount) {
        successfulDataValues += (importCount.imported || 0) + (importCount.updated || 0);
      }
    } else {
      failedChunks++;
    }
  });

  // Calculate success rates.
  const chunkSuccessRate = (successfulChunks / chunkResults.length) * 100;
  const dataValueSuccessRate = (successfulDataValues / totalDataValues) * 100;

  // Create a summary of the consolidation.
  const consolidationSummary = {
    totalChunks: chunkResults.length,
    successfulChunks,
    failedChunks,
    chunkSuccessRate: chunkSuccessRate.toFixed(2),
    totalDataValues,
    successfulDataValues,
    dataValueSuccessRate: dataValueSuccessRate.toFixed(2),
  };

  console.log('  - Consolidation Summary:');
  console.log(`    - Total Chunks: ${consolidationSummary.totalChunks}`);
  console.log(`    - Successful Chunks: ${consolidationSummary.successfulChunks}`);
  console.log(`    - Failed Chunks: ${consolidationSummary.failedChunks}`);
  console.log(`    - Data Value Success Rate: ${consolidationSummary.dataValueSuccessRate}%`);

  // Return the summary to be used in the final step.
  return { ...state, consolidationSummary };
}); 