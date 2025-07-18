// Job 2: Parse Excel file metadata and generate DHIS2 metadata structures
// Configuration
const CHUNK_SIZE = 5000; // Rows per chunk for processing

// Get Excel metadata with unique values and generate DHIS2 structures
fn(state => {
  console.log('📊 Job 2: Reading Excel metadata and generating DHIS2 structures...');
  console.log(`📄 Processing file: ${state.fileName}`);
  console.log(`📁 File path: ${state.filePath}`);
  
  return getExcelMetadata(state.filePath, CHUNK_SIZE)(state).then(newState => {
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
      
      // Prepare basic state for chunk processing job
      return { 
        ...state,
        metadataParsed: true,
        totalRows: metadata.totalRows,
        chunkSize: metadata.chunkSize,
        totalChunks: metadata.totalChunks,
        data: {
          fileName: state.fileName,
          filePath: state.filePath,
          basicProcessing: true
        }
      };
    }
    
    // Generate DHIS2 metadata structures from unique values
    const dhis2Structures = generateDHIS2Structures(metadata.uniqueValues);
    
    console.log('🏗️ Generated DHIS2 metadata structures:');
    console.log(`   • Organization Units: ${dhis2Structures.orgUnits.length} total`);
    console.log(`   • Categories: ${dhis2Structures.categories.length} categories`);
    console.log(`   • Data Elements: ${dhis2Structures.dataElements.length} indicators`);
    
    // Prepare clean state for next stages
    return { 
      ...state,
      metadataParsed: true,
      totalRows: metadata.totalRows,
      chunkSize: metadata.chunkSize,
      totalChunks: metadata.totalChunks,
      data: {
        fileName: state.fileName,
        filePath: state.filePath,
        uniqueValues: metadata.uniqueValues,
        dhis2Structures
      }
    };
  });
});

// Helper function to generate DHIS2 metadata structures
function generateDHIS2Structures(uniqueValues) {
  return {
    orgUnits: generateOrgUnitStructures(uniqueValues),
    categories: generateCategoryStructures(uniqueValues),
    dataElements: generateDataElementStructures(uniqueValues)
  };
}

// Generate organization unit structures (5-level hierarchy)
function generateOrgUnitStructures(uniqueValues) {
  const orgUnits = [];
  
  // Level 1: Country (hardcoded)
  orgUnits.push({
    name: 'Malawi',
    shortName: 'Malawi',
    code: 'MW',
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
      parent: 'Malawi'
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
function generateCategoryStructures(uniqueValues) {
  const categories = [];
  
  // Health Sector category
  if (uniqueValues.hsectors.length > 0) {
    categories.push({
      name: 'Health Sector',
      shortName: 'Health Sector',
      code: 'HEALTH_SECTOR',
      categoryOptions: uniqueValues.hsectors.map(name => ({
        name,
        shortName: name.substring(0, 50),
        code: generateCodeFromName(name)
      }))
    });
  }
  
  // Reporting Period Type category
  if (uniqueValues.reportingPeriods.length > 0) {
    categories.push({
      name: 'Reporting Period Type',
      shortName: 'Report Period Type',
      code: 'REPORTING_PERIOD_TYPE',
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
function generateDataElementStructures(uniqueValues) {
  return uniqueValues.indicators.map(name => ({
    name,
    shortName: name.substring(0, 50),
    code: generateCodeFromName(name),
    valueType: 'INTEGER',
    aggregationType: 'SUM',
    domainType: 'AGGREGATE'
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