function generatePayload(reportData, state) {
    const { catAttrCombo, period, orgUnit, hivStagesReportMapping , dataSet} = state.reportConfig;
    
    const payload = {
      dataSet: dataSet,
      period: period,
      orgUnit: orgUnit,
      dataValues: []
    };
  
    // Map each key-value pair from reportData to a dataValue object
    Object.entries(reportData).forEach(([key, value]) => {
      payload.dataValues.push({
        dataElement: hivStagesReportMapping[key],
        period: period,
        orgUnit: orgUnit,
        categoryOptionCombo: catAttrCombo,
        attributeOptionCombo: catAttrCombo,
        value: value.toString()
      });
    });
  
    return payload;
  }
  fn(state => {
    state.payload = state.data.map(data => generatePayload(data, state))[0]
    return state;
  });
  