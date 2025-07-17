/**
 * Job: 3. Upload Payloads to DHIS2
 *
 * Description:
 * This job takes the `dataValueSet` payloads prepared in the previous step and
 * uploads them to DHIS2. It iterates through each payload and uses the DHIS2
 * adaptor to send the data.
 *
 * OpenFn Principles:
 * - Separation of Concerns: This job is dedicated to DHIS2 uploads.
 * - Resilience: It logs the outcome of each upload, success or failure.
 * - Idempotency: Uploads are based on the prepared payloads from the prior step.
 */

// Use the `each` helper to iterate over the payloads from the previous job.
each(
  "payloads[*]",
  fn(async state => {
    // The payload being uploaded in this iteration is in `state.data`.
    const payload = state.data;
    console.log(`3. Uploading payload with ${payload.dataValues.length} data values.`);

    try {
      // Use the DHIS2 `create` function to upload the dataValueSet.
      const response = await create('dataValueSets', payload)(state);

      console.log('  - Payload uploaded successfully to DHIS2.');
      // Return a success status and the response from DHIS2.
      return { ...state, uploadStatus: 'success', dhis2Response: response.data };
    } catch (error) {
      console.error('  - Error uploading payload to DHIS2:', error.message);
      // Return a failure status and the error details.
      return { ...state, uploadStatus: 'error', error: error.message };
    }
  })
);