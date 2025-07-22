// Job 2: Parse Excel file metadata and generate DHIS2 metadata structures
// STATE CONTRACT:
// Input:  { fileName, filePath, targetFileFound, noFilesToProcess, config }
// Output: { fileName, filePath, chunkSize, totalChunks, totalRows, 
//          metadataParsed, data: { uniqueValues, dhis2Structures }, config }

// Get Excel metadata with unique values and generate DHIS2 structures
fn(state => {
  console.log('📊 Job 2: Reading Excel metadata and generating DHIS2 structures...');
  console.log(`📄 Processing file: ${state.fileName}`);
  console.log(`📁 File path: ${state.filePath}`);
  
  // Use static config from Job 1
  const config = state.config;
  const chunkSize = config.chunkSize;
  
  // Convert config.columnMapping to adaptor format
  const adaptorColumnMapping = {};
  Object.keys(config.columnMapping).forEach(columnName => {
    const mapping = config.columnMapping[columnName];
    if (mapping.uniqueValueKey) {
      adaptorColumnMapping[mapping.uniqueValueKey] = [columnName];
    }
  });
  
  console.log(`🔧 Configuration:`);
  console.log(`   • Chunk size: ${chunkSize} rows`);
  console.log(`   • Column mapping keys: ${Object.keys(adaptorColumnMapping).join(', ')}`);
  
  return getExcelMetadata(state.filePath, chunkSize, { columnMapping: adaptorColumnMapping })(state).then(newState => {
    const metadata = newState.data;
    
    if (!metadata || !metadata.totalRows) {
      throw new Error('Failed to read Excel metadata or no rows found');
    }
    
    console.log(`📈 Excel metadata analysis complete:`);
    console.log(`   • Total rows: ${metadata.totalRows}`);
    console.log(`   • Chunk size: ${metadata.chunkSize} rows`);
    console.log(`   • Total chunks: ${metadata.totalChunks}`);
    
    // Check if unique values were collected
    if (!metadata.uniqueValues) {
      console.log('⚠️  No unique values found in metadata - using basic processing');
      
      // STRICT OUTPUT: Only what Job 3 needs
      return { 
        fileName: state.fileName,
        filePath: state.filePath,
        chunkSize: metadata.chunkSize,
        totalChunks: metadata.totalChunks,
        totalRows: metadata.totalRows,
        metadataParsed: true,
        config,
        data: {
          uniqueValues: {},
          dhis2Structures: { orgUnits: [], categories: [], dataElements: [] }
        }
      };
    }
    
    // Generate DHIS2 metadata structures from unique values using config
    const dhis2Structures = generateDHIS2Structures(metadata.uniqueValues, config);
    
    console.log('🏗️ Generated DHIS2 metadata structures:');
    console.log(`   • Organization Units: ${dhis2Structures.orgUnits.length} total`);
    console.log(`   • Categories: ${dhis2Structures.categories.length} categories`);
    console.log(`   • Data Elements: ${dhis2Structures.dataElements.length} indicators`);
    
    // STRICT OUTPUT: Only what Job 3 needs
    return { 
      fileName: state.fileName,
      filePath: state.filePath,
      chunkSize: metadata.chunkSize,
      totalChunks: metadata.totalChunks,
      totalRows: metadata.totalRows,
      metadataParsed: true,
      config,
      data: {
        uniqueValues: metadata.uniqueValues,
        dhis2Structures
      }
    };
  });
});

// Helper function to generate DHIS2 metadata structures
function generateDHIS2Structures(uniqueValues, config) {
  return {
    orgUnits: generateOrgUnitStructures(uniqueValues, config),
    categories: generateCategoryStructures(uniqueValues, config),
    dataElements: generateDataElementStructures(uniqueValues, config)
  };
}

// Generate organization unit structures (5-level hierarchy)
function generateOrgUnitStructures(uniqueValues, config) {
  const orgUnits = [];
  
  // Level 1: Country (from config)
  orgUnits.push({
    name: config.countryConfig.name,
    shortName: config.countryConfig.shortName,
    code: config.countryConfig.code,
    level: 1,
    parent: null
  });
  
  // Level 2: Regions
  uniqueValues.regions.forEach(name => {
    orgUnits.push({
      name,
      shortName: name.substring(0, 50),
      code: generateCodeFromName(name),
      level: 2,
      parent: config.countryConfig.name
    });
  });
  
  // Level 3: Zones
  uniqueValues.zones.forEach(name => {
    orgUnits.push({
      name,
      shortName: name.substring(0, 50),
      code: generateCodeFromName(name),
      level: 3,
      parent: 'TBD' // Will be resolved during metadata creation
    });
  });
  
  // Level 4: Districts
  uniqueValues.districts.forEach(name => {
    orgUnits.push({
      name,
      shortName: name.substring(0, 50),
      code: generateCodeFromName(name),
      level: 4,
      parent: 'TBD' // Will be resolved during metadata creation
    });
  });
  
  // Level 5: Sites
  uniqueValues.sites.forEach(name => {
    orgUnits.push({
      name,
      shortName: name.substring(0, 50),
      code: generateCodeFromName(name),
      level: 5,
      parent: 'TBD' // Will be resolved during metadata creation
    });
  });
  
  return orgUnits;
}

// Generate category structures
function generateCategoryStructures(uniqueValues, config) {
  const categories = [];
  
  // Health Sector category
  if (uniqueValues.hsectors && uniqueValues.hsectors.length > 0) {
    categories.push({
      name: config.categoryConfig.healthSector.name,
      shortName: config.categoryConfig.healthSector.shortName,
      code: config.categoryConfig.healthSector.code,
      categoryOptions: uniqueValues.hsectors.map(name => ({
        name,
        shortName: name.substring(0, 50),
        code: generateCodeFromName(name)
      }))
    });
  }
  
  // Reporting Period Type category
  if (uniqueValues.reportingPeriods && uniqueValues.reportingPeriods.length > 0) {
    categories.push({
      name: config.categoryConfig.reportingPeriodType.name,
      shortName: config.categoryConfig.reportingPeriodType.shortName,
      code: config.categoryConfig.reportingPeriodType.code,
      categoryOptions: uniqueValues.reportingPeriods.map(name => ({
        name,
        shortName: name.substring(0, 50),
        code: generateCodeFromName(name)
      }))
    });
  }
  
  return categories;
}

// Generate data element structures
function generateDataElementStructures(uniqueValues, config) {
  return uniqueValues.indicators.map(name => ({
    name,
    shortName: name.substring(0, 50),
    code: generateCodeFromName(name),
    valueType: 'INTEGER',      // Keep hardcoded for now
    aggregationType: 'SUM',    // Keep hardcoded for now  
    domainType: 'AGGREGATE'    // Keep hardcoded for now
  }));
}

// Helper function to generate codes from names
function generateCodeFromName(name) {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 50);
} 