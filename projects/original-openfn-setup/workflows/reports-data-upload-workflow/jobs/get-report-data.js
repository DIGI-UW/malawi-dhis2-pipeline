function mapReportData(reportData) {
    // Get all rows from the first dataset
    const rows = reportData.dataSets[0].rows;
    
    // Map each row to its key-size pairs
    return rows.map(row => {
      const sizeMap = {};
      
      // Iterate through each key-value pair in the row
      Object.entries(row).forEach(([key, data]) => {
        sizeMap[key] = data.size;
      });
      
      return sizeMap;
    });
  }
  
  get(`reportingrest/reportdata/${state.reportUuid}`,{ startDate: state.startDate, endDate: state.endDate });
  
  fn(state => {
    state.data = state.data.map(mapReportData)[0]
    return state;
  });