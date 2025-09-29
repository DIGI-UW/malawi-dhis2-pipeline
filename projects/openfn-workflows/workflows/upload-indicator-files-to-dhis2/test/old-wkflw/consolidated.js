// Job 1: CheckForTargetFile
// STATE CONTRACT:
// Input:  Initial state with optional config: { config?: {...overrides} }
// Output: { fileName, filePath, targetFileFound, noFilesToProcess, config }

// Master configuration - single source of truth for entire workflow
const MASTER_CONFIG = {
    // === JOB 1: FILE DISCOVERY ===
    targetFile: 'ART_short.xlsx',
    targetFilePattern: null,
    directory: '/data/excel-files',
    
    // === JOB 2: EXCEL PROCESSING ===
    chunkSize: 5000,
    maxLevels: 5, // Organization unit hierarchy depth
    
    // Clear column mapping: Excel column name → what it's used for
    columnMapping: {
      'Indicator_name': {
        uniqueValueKey: 'indicators',    // Collect unique values for metadata generation
        dataProcessingRole: 'indicator'  // Use as indicator in data processing
      },
      'IndicatorValue': {
        dataProcessingRole: 'value'      // Use as value in data processing
      },
      'Quarter': {
        uniqueValueKey: 'quarters',
        dataProcessingRole: 'period'
      },
      'Site': {
        uniqueValueKey: 'sites',
        dataProcessingRole: 'orgUnit'
      },
      'Region': {
        uniqueValueKey: 'regions'        // Only for metadata generation
      },
      'Zone': {
        uniqueValueKey: 'zones'
      },
      'District': {
        uniqueValueKey: 'districts'
      },
      'hsector': {
        uniqueValueKey: 'hsectors',
        dataProcessingRole: 'category'
      },
      'Reporting period': {
        uniqueValueKey: 'reportingPeriods'
      }
    },
    
    // === DHIS2 METADATA GENERATION ===
    countryConfig: {
      name: 'Malawi',
      shortName: 'Malawi',
      code: 'MW'
    },
    
    categoryConfig: {
      healthSector: {
        name: 'Health Sector',
        shortName: 'Health Sector',
        code: 'HEALTH_SECTOR'
      },
      reportingPeriodType: {
        name: 'Reporting Period Type',
        shortName: 'Report Period Type',
        code: 'REPORTING_PERIOD_TYPE'
      }
    }
  };
  
  // List files and check for target file
  list('/data/excel-files', null, state => {
    console.log('📁 Job 1: Checking for Excel files...');
    
    const config = { ...MASTER_CONFIG, ...(state.config || {}) };
    const searchDirectory = config.directory;
    
    console.log(`🔧 Configuration:`);
    console.log(`   • Target file: ${config.targetFile}`);
    console.log(`   • Target pattern: ${config.targetFilePattern || 'none'}`);
    console.log(`   • Search directory: ${searchDirectory}`);
    console.log(`   • Chunk size: ${config.chunkSize}`);
    console.log(`   • Max levels: ${config.maxLevels}`);
    
    const allFiles = Array.isArray(state.data) ? state.data : [];
    const excelFiles = allFiles.filter(file => {
      const filename = typeof file === 'string' ? file : file.name;
      return filename && filename.endsWith('.xlsx');
    });
    
    console.log(`📄 Found ${excelFiles.length} Excel files`);
    
    if (excelFiles.length === 0) {
      console.log('📭 No Excel files found to process');
      return { 
        noFilesToProcess: true,
        targetFileFound: false,
        fileName: null,
        filePath: null,
        config
      };
    }
    
    // Find target file using either exact match or pattern
    let targetFile = null;
    let matchedFileName = null;
    
    if (config.targetFilePattern) {
      // Use regex pattern matching
      const pattern = new RegExp(config.targetFilePattern, 'i');
      targetFile = excelFiles.find(file => {
        const filename = typeof file === 'string' ? file : file.name;
        return pattern.test(filename);
      });
      matchedFileName = targetFile ? (typeof targetFile === 'string' ? targetFile : targetFile.name) : null;
    } else {
      // Use exact file name matching
      targetFile = excelFiles.find(file => {
        const filename = typeof file === 'string' ? file : file.name;
        return filename === config.targetFile;
      });
      matchedFileName = config.targetFile;
    }
    
    if (!targetFile) {
      const searchCriteria = config.targetFilePattern ? `pattern '${config.targetFilePattern}'` : `file '${config.targetFile}'`;
      console.log(`❌ Target ${searchCriteria} not found`);
      return { 
        noFilesToProcess: true,
        targetFileFound: false,
        fileName: null,
        filePath: null,
        config
      };
    }
    
    console.log(`✅ Found target file: ${matchedFileName}`);
    
    return { 
      targetFileFound: true,
      noFilesToProcess: false,
      fileName: matchedFileName,
      filePath: `${searchDirectory}/${matchedFileName}`,
      config
    };
  }); 



  // Job 2: Parse Excel file metadata and generate DHIS2 metadata structures
// STATE CONTRACT:
// Input:  { fileName, filePath, targetFileFound, noFilesToProcess, config }
// Output: { fileName, filePath, chunkSize, totalChunks, totalRows, 
//          metadataParsed, data: { uniqueValues, orgUnitParentMap, dhis2Structures }, config }

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
      
      // Log organizational unit parent mappings
      if (metadata.orgUnitParentMap && Object.keys(metadata.orgUnitParentMap).length > 0) {
        console.log(`📊 Organizational unit parent mappings collected: ${Object.keys(metadata.orgUnitParentMap).length} relationships`);
      } else {
        console.log('⚠️  No organizational unit parent mappings found');
      }
      
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
            orgUnitParentMap: metadata.orgUnitParentMap || {},
            dhis2Structures: { orgUnits: [], categories: [], dataElements: [] }
          }
        };
      }
      
      // Generate DHIS2 metadata structures from unique values and hierarchy using config
      const dhis2Structures = generateDHIS2Structures(metadata.uniqueValues, config, metadata.orgUnitParentMap);
      
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
          orgUnitParentMap: metadata.orgUnitParentMap || {},
          dhis2Structures
        }
      };
    });
  });
  
  // Helper function to generate DHIS2 metadata structures
  function generateDHIS2Structures(uniqueValues, config, orgUnitParentMap = null) {
    return {
      orgUnits: generateOrgUnitStructures(uniqueValues, config, orgUnitParentMap),
      categories: generateCategoryStructures(uniqueValues, config),
      dataElements: generateDataElementStructures(uniqueValues, config)
    };
  }
  
  // Generate organization unit structures (5-level hierarchy)
  function generateOrgUnitStructures(uniqueValues, config, orgUnitParentMap = null) {
    const orgUnits = [];
    
    // Level 1: Country (from config)
    const countryOrgUnit = {
      name: config.countryConfig.name,
      shortName: config.countryConfig.shortName,
      code: config.countryConfig.code,
      level: 1,
      parent: null
    };
    orgUnits.push(countryOrgUnit);
    
    if (orgUnitParentMap && Object.keys(orgUnitParentMap).length > 0) {
      console.log('✅ Using organizational unit parent mappings from Excel data');
      console.log(`📊 Found ${Object.keys(orgUnitParentMap).length} parent-child relationships`);
    } else {
      console.log('⚠️  No organizational unit parent mappings available - using fallback approach');
      orgUnitParentMap = {};
    }
    
    // Level 2: Regions (all belong to country)
    if (uniqueValues.regions) {
    uniqueValues.regions.forEach(name => {
      orgUnits.push({
        name,
        shortName: name.substring(0, 50),
        code: generateCodeFromName(name),
        level: 2,
        parent: config.countryConfig.name
      });
    });
    }
    
    // Level 3: Zones
    if (uniqueValues.zones) {
    uniqueValues.zones.forEach(name => {
        const parent = orgUnitParentMap[name] || 'UNKNOWN_REGION';
      orgUnits.push({
        name,
        shortName: name.substring(0, 50),
        code: generateCodeFromName(name),
        level: 3,
          parent
        });
      });
    }
    
    // Level 4: Districts
    if (uniqueValues.districts) {
    uniqueValues.districts.forEach(name => {
        const parent = orgUnitParentMap[name] || 'UNKNOWN_ZONE';
      orgUnits.push({
        name,
        shortName: name.substring(0, 50),
        code: generateCodeFromName(name),
        level: 4,
          parent
        });
      });
    }
    
    // Level 5: Sites
    if (uniqueValues.sites) {
    uniqueValues.sites.forEach(name => {
        const parent = orgUnitParentMap[name] || 'UNKNOWN_DISTRICT';
      orgUnits.push({
        name,
        shortName: name.substring(0, 50),
        code: generateCodeFromName(name),
        level: 5,
          parent
        });
      });
    }
    
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


  // Job 3: CheckAndSetupMetadata
// STATE CONTRACT:
// Input:  { fileName, filePath, chunkSize, totalChunks, totalRows, 
//          metadataParsed, config, data: { uniqueValues, orgUnitParentMap, dhis2Structures } }
// Output: { fileName, filePath, chunkSize, totalChunks, totalRows, 
//          metadataSetupComplete, config, data: { dhis2Mappings } }

fn(async state => {
    console.log('🏗️ Job 3: Setting up DHIS2 metadata...');
    
    const { dhis2Structures, orgUnitParentMap } = state.data;
    
    if (!dhis2Structures) {
      throw new Error('No DHIS2 structures found from previous job');
    }
    
    console.log('📋 Metadata structures to create:');
    console.log(`   • Organization Units: ${dhis2Structures.orgUnits.length}`);
    console.log(`   • Categories: ${dhis2Structures.categories.length}`);
    console.log(`   • Data Elements: ${dhis2Structures.dataElements.length}`);
    console.log(`   • Max org unit levels: ${state.config.maxLevels}`);
    
    // Validate organizational unit parent mappings
    if (orgUnitParentMap && Object.keys(orgUnitParentMap).length > 0) {
      console.log(`📊 Using organizational unit parent mappings: ${Object.keys(orgUnitParentMap).length} relationships`);
      
      // Validate that org units have proper parent relationships (no more 'TBD' values)
      const orgUnitsWithTBD = dhis2Structures.orgUnits.filter(org => 
        org.parent && (org.parent.includes('TBD') || org.parent.includes('UNKNOWN'))
      );
      
      if (orgUnitsWithTBD.length > 0) {
        console.log(`⚠️  Warning: ${orgUnitsWithTBD.length} organization units still have unresolved parent relationships:`);
        orgUnitsWithTBD.forEach(org => {
          console.log(`   - ${org.name} (Level ${org.level}) -> ${org.parent}`);
        });
      } else {
        console.log('✅ All organization units have proper parent relationships');
      }
    } else {
      console.log('⚠️  No organizational unit parent mappings received from previous job');
    }
    
    try {
      // Create organization units in hierarchical order
      console.log('🏢 Creating organization units...');
      await upsertOrganisationUnitHierarchy(
        dhis2Structures.orgUnits,
        { 
          maxLevels: state.config.maxLevels,
          parentMappings: orgUnitParentMap // Pass parent mappings for additional context
        }
      )(state);
  
      const orgUnitMappings = state.data.mappings;
      
      // Check and create integration user if needed
      console.log('👤 Checking for integration user...');
      const integrationUser = await checkAndCreateIntegrationUser(orgUnitMappings, state);
      
      // Create categories and category options
      console.log('🏷️ Creating categories...');
      const categoryMappings = await createCategories(dhis2Structures.categories, state);
      
      // Create category combination and get category option combinations
      console.log('🔗 Creating category combination...');
      const { categoryOptionCombos, categoryCombinationId } = await createCategoryCombination(dhis2Structures.categories, state);
      
      // Create data elements
      console.log('📊 Creating data elements...');
      const dataElementMappings = await createDataElements(dhis2Structures.dataElements, state);
      
      // Create data set and assign data elements
      console.log('📋 Creating data set...');
      const dataSetId = await createDataSet(dataElementMappings, categoryCombinationId, orgUnitMappings, state);
      
      // Data set org unit assignment is now done at creation time
      if (dataSetId) {
        console.log('✅ Data set created with org unit assignments');
      }
      
      // Create organization unit groups and group sets
      console.log('🏢 Creating organization unit groups...');
      await createOrganizationUnitGroups(orgUnitMappings, state);
      
      console.log('✅ DHIS2 metadata setup complete!');
      console.log(`   • Organization Units: ${Object.keys(orgUnitMappings).length} mappings`);
      console.log(`   • Organization Unit Groups: Created (Administrative Levels)`);
      console.log(`   • Category Option Combos: ${Object.keys(categoryOptionCombos).length} mappings`);
      console.log(`   • Data Elements: ${Object.keys(dataElementMappings).length} mappings`);
      console.log(`   • Data Set: ${dataSetId ? 'Created' : 'Failed'}`);
      
      console.log('\n📋 Integration user setup:');
      console.log('   • Created/verified user: openfn_integration');
      console.log('   • Org unit assignment: Automatic to root org unit');
      console.log('   • Data set assignment: Done at creation');
      console.log('\n⚠️  IMPORTANT: Update OpenFn credentials:');
      console.log('   • Change from admin to openfn_integration user');
      console.log('   • Username: openfn_integration');
      console.log('   • Password: OpenFn@2024!');
      console.log('   • This avoids admin user restrictions');
      
      console.log('\n📊 Organization Unit Groups Created:');
      console.log('   • Administrative Levels: Countries, Regions, Zones, Districts, Health Facilities');
      console.log('   • Group Set: "Administrative Levels" (compulsory, dataDimension)');
      
      return {
        fileName: state.fileName,
        filePath: state.filePath,
        chunkSize: state.chunkSize,
        totalChunks: state.totalChunks,
        totalRows: state.totalRows,
        metadataSetupComplete: true,
        config: state.config,
        data: {
          dhis2Mappings: {
            orgUnits: orgUnitMappings,
            categoryOptionCombos: categoryOptionCombos,
            dataElements: dataElementMappings,
            dataSetId: dataSetId
          }
        }
      };
    } catch (error) {
      console.error('❌ Error setting up DHIS2 metadata:', error);
      throw error;
    }
  });
  
  // NOTE: This function is no longer used - org units are assigned at data set creation time
  // Keeping for reference in case needed in future
  /*
  async function assignDataSetToOrgUnits(dataSetId, orgUnitMappings, state) {
    try {
      // Get the current data set with all required fields
      await get(`dataSets/${dataSetId}`, { 
        fields: ':all' 
      })(state);
      const dataSet = state.data;
      
      // Get all org unit IDs
      const orgUnitIds = Object.values(orgUnitMappings)
        .filter(id => id && id !== 'UNKNOWN_ORG_UNIT' && id.length === 11);
      
      console.log(`   📍 Assigning data set to ${orgUnitIds.length} organization units`);
      
      // Update the data set - must include all required fields for DHIS2
      const payload = {
        ...dataSet,
        organisationUnits: orgUnitIds.map(id => ({ id }))
      };
      
      // Remove fields that shouldn't be in update payload
      delete payload.access;
      delete payload.lastUpdated;
      delete payload.created;
      delete payload.lastUpdatedBy;
      delete payload.user;
      delete payload.favorites;
      delete payload.sharing;
      delete payload.href;
      
      await update('dataSets', dataSetId, payload)(state);
      
      console.log(`   ✓ Data set assigned to ${orgUnitIds.length} organization units`);
      
    } catch (error) {
      console.log(`   ⚠️ Error assigning data set to org units: ${error.message}`);
      console.log(`   💡 Note: This might be a DHIS2 version issue. Try manual assignment in UI.`);
    }
  }
  */
  
  // Create categories and category options
  async function createCategories(categoryStructures, state) {
    const mappings = {};
    
    for (const category of categoryStructures) {
      try {
        // Check if category already exists
        await get(`categories`, {
          filter: `code:eq:${category.code}`,
          fields: 'id,categoryOptions[id,code]'
        })(state);
        
        let categoryData = state.data.categories && state.data.categories[0];
        
        if (!categoryData) {
          // Create category options first
          const categoryOptionIds = [];
          
          for (const option of category.categoryOptions) {
            try {
              await get(`categoryOptions`, { filter: `code:eq:${option.code}`, fields: 'id' })(state);
              let catOption = state.data.categoryOptions && state.data.categoryOptions[0];
  
              if (catOption) {
                categoryOptionIds.push({ id: catOption.id });
              } else {
                await create('categoryOptions', {
                  name: option.name,
                  shortName: option.shortName,
                  code: option.code
                })(state);
                
                if (state.data?.response?.uid) {
                  const optionId = state.data.response.uid;
                  categoryOptionIds.push({ id: optionId });
                }
              }
            } catch (error) {
              console.log(`   ⚠️ Error with option ${option.name}: ${error.message}`);
            }
          }
          
          // Create category with options
          const categoryPayload = {
            name: category.name,
            shortName: category.shortName,
            code: category.code,
            dataDimensionType: 'ATTRIBUTE',
            categoryOptions: categoryOptionIds
          };
          
          await create('categories', categoryPayload)(state);
          
          if (state.data?.response?.uid) {
            const categoryId = state.data.response.uid;
            await get('categories', categoryId, { fields: 'id,categoryOptions[id,code]'})(state);
            categoryData = state.data;
          }
        }
        
        // Map category and its options to their IDs
        if (categoryData) {
          mappings[category.name] = categoryData.id;
          if (categoryData.categoryOptions && category.categoryOptions) {
            for (const originalOption of category.categoryOptions) {
              const matchingDhisOption = categoryData.categoryOptions.find(dhisOpt => 
                dhisOpt.code === originalOption.code
              );
              if (matchingDhisOption) {
                mappings[originalOption.name] = matchingDhisOption.id;
              }
            }
          }
        }
        
      } catch (error) {
        console.log(`   ⚠️ Error with category ${category.name}: ${error.message}`);
      }
    }
    
    return mappings;
  }
  
  // Create category combination and retrieve category option combinations
  async function createCategoryCombination(categoryStructures, state) {
    const mappings = {};
    
    if (categoryStructures.length === 0) {
      return {
        categoryOptionCombos: mappings,
        categoryCombinationId: null
      };
    }
    
    // Get category IDs for the combination
    const categoryIds = [];
    for (const category of categoryStructures) {
      await get(`categories`, {
        filter: `code:eq:${category.code}`,
        fields: 'id'
      })(state);
      
      if (state.data.categories && state.data.categories[0]) {
        categoryIds.push({ id: state.data.categories[0].id });
      }
    }
    
    if (categoryIds.length === 0) {
      console.log('⚠️  No categories found for combination');
      return mappings;
    }
    
    // Create category combination
    const combCode = 'HEALTH_REPORTING_COMBO';
    await get(`categoryCombos`, {
      filter: `code:eq:${combCode}`,
      fields: 'id,categoryOptionCombos[id,name,categoryOptions[id,name]]'
    })(state);
    
    let categoryCombo = state.data.categoryCombos && state.data.categoryCombos[0];
    
    if (categoryCombo) {
      console.log(`   ✓ Found existing category combination: ${categoryCombo.id}`);
    } else {
      const comboPayload = {
        name: 'Health Sector and Reporting Period',
        code: combCode,
        dataDimensionType: 'ATTRIBUTE',
        categories: categoryIds
      };
      
      await create('categoryCombos', comboPayload)(state);
      
      if (state.data?.response?.uid) {
        const comboId = state.data.response.uid;
        console.log(`   ✓ Created category combination: ${comboId}`);
        
        // Get the combination with its option combos
        await get(`categoryCombos/${comboId}`, { 
          fields: 'id,categoryOptionCombos[id,name,categoryOptions[id,name]]'
        })(state);
        categoryCombo = state.data;
      }
    }
    
    // Map category option combinations
    if (categoryCombo && categoryCombo.categoryOptionCombos) {
      console.log(`   📊 Processing ${categoryCombo.categoryOptionCombos.length} category option combinations`);
      
      for (const optionCombo of categoryCombo.categoryOptionCombos) {
        // Create mapping key based on category option names
        const optionNames = optionCombo.categoryOptions
          .map(opt => opt.name)
          .sort() // Sort for consistency
          .join('+');
        
        mappings[optionNames] = optionCombo.id;
        console.log(`      • Mapped: "${optionNames}" → ${optionCombo.id}`);
        
        // Also create individual option mappings for lookup
        for (const option of optionCombo.categoryOptions) {
          if (option.name === 'Public' || option.name === 'Private') {
            // This is hsector
            mappings[`hsector:${option.name}`] = optionCombo.id;
          }
          if (option.name === 'Cumulative' || option.name === 'Quarter') {
            // This is reporting period - but we need both dimensions
            const hsectorOption = optionCombo.categoryOptions.find(opt => 
              opt.name === 'Public' || opt.name === 'Private'
            );
            if (hsectorOption) {
              mappings[`${hsectorOption.name}+${option.name}`] = optionCombo.id;
            }
          }
        }
      }
      
      console.log(`   ✓ Mapped ${categoryCombo.categoryOptionCombos.length} category option combinations`);
    } else {
      console.log(`   ⚠️ No category option combinations found in category combo`);
      console.log(`   Debug - categoryCombo:`, categoryCombo ? 'exists' : 'null');
      console.log(`   Debug - categoryOptionCombos:`, categoryCombo?.categoryOptionCombos ? 'exists' : 'null');
    }
    
    return {
      categoryOptionCombos: mappings,
      categoryCombinationId: categoryCombo ? categoryCombo.id : null
    };
  }
  
  // Create data elements
  async function createDataElements(dataElementStructures, state) {
    const mappings = {};
    
    console.log(`📊 Creating ${dataElementStructures.length} data elements...`);
    
    for (const dataElement of dataElementStructures) {
      try {
        // Check if data element already exists
        await get(`dataElements`, {
          filter: `code:eq:${dataElement.code}`,
          fields: 'id'
        })(state);
        
        if (state.data.dataElements && state.data.dataElements.length > 0) {
          const existingId = state.data.dataElements[0].id;
          console.log(`   ✓ Found existing: ${dataElement.name} (${existingId})`);
          mappings[dataElement.code] = existingId;
        } else {
          // Create new data element
          const payload = {
            name: dataElement.name,
            shortName: dataElement.shortName,
            code: dataElement.code,
            valueType: dataElement.valueType,
            aggregationType: dataElement.aggregationType,
            domainType: dataElement.domainType
          };
          
          await create('dataElements', payload)(state);
          
          if (state.data?.response?.uid) {
            const newId = state.data.response.uid;
            console.log(`   ✓ Created: ${dataElement.name} (${newId})`);
            mappings[dataElement.code] = newId;
          } else {
            console.log(`   ⚠️ Warning: Could not create ${dataElement.name}`);
          }
        }
      } catch (error) {
        console.log(`   ⚠️ Error with ${dataElement.name}: ${error.message}`);
      }
    }
    
    return mappings;
  }
  
  // Create data set and assign data elements
  async function createDataSet(dataElementMappings, categoryCombinationId, orgUnitMappings, state) {
    try {
      // Check if data set already exists
      const dataSetCode = 'MALAWI_ART_DATASET';
      await get(`dataSets`, {
        filter: `code:eq:${dataSetCode}`,
        fields: 'id'
      })(state);
      
      if (state.data.dataSets && state.data.dataSets.length > 0) {
        const existingId = state.data.dataSets[0].id;
        console.log(`   ✓ Found existing data set: ${existingId}`);
        return existingId;
      }
      
      // Create new data set with all data elements
      const dataElementIds = Object.values(dataElementMappings)
        .filter(id => id && id !== 'UNKNOWN_DATA_ELEMENT' && id.length === 11) // DHIS2 UIDs are 11 chars
        .map(id => ({ id }));
      
      const payload = {
        name: 'Malawi ART Data Set',
        shortName: 'ART Data Set',
        code: dataSetCode,
        periodType: 'Quarterly',
        categoryCombo: categoryCombinationId ? { id: categoryCombinationId } : undefined,
        dataSetElements: dataElementIds.map(de => ({ 
          dataElement: de
        })),
        // Assign org units at creation time
        organisationUnits: Object.values(orgUnitMappings)
          .filter(id => id && id !== 'UNKNOWN_ORG_UNIT' && id.length === 11)
          .map(id => ({ id }))
      };
      
      await create('dataSets', payload)(state);
      
      if (state.data?.response?.uid) {
        const newId = state.data.response.uid;
        const orgUnitCount = Object.values(orgUnitMappings)
          .filter(id => id && id !== 'UNKNOWN_ORG_UNIT' && id.length === 11).length;
        console.log(`   ✓ Created data set: ${newId}`);
        console.log(`   ✓ Assigned ${dataElementIds.length} data elements to data set`);
        console.log(`   ✓ Assigned data set to ${orgUnitCount} organization units`);
        return newId;
      } else {
        console.log(`   ⚠️ Warning: Could not create data set`);
        return null;
      }
    } catch (error) {
      console.log(`   ⚠️ Error creating data set: ${error.message}`);
      return null;
    }
  }
  
  // Check for and create integration user if needed
  async function checkAndCreateIntegrationUser(orgUnitMappings, state) {
    try {
      const integrationUsername = 'openfn_integration';
      
      // Check if integration user already exists
      console.log(`   🔍 Checking if integration user '${integrationUsername}' exists...`);
      await get('users', {
        filter: `username:eq:${integrationUsername}`,
        fields: 'id,username,userCredentials[username],organisationUnits[id,name]'
      })(state);
      
      let integrationUser = state.data.users && state.data.users[0];
      
      if (!integrationUser) {
        console.log('   📝 Integration user not found. Creating new user...');
        
        // Get superuser role ID
        await get('userRoles', {
          filter: 'name:eq:Superuser',
          fields: 'id'
        })(state);
        
        const superuserRole = state.data.userRoles && state.data.userRoles[0];
        if (!superuserRole) {
          console.log('   ⚠️  Could not find Superuser role. Trying with default ID...');
        }
        
        const countryOrgUnitId = orgUnitMappings[state.config.countryConfig.name];
        
        // Create the integration user
        const userPayload = {
          username: integrationUsername,
          firstName: 'OpenFn',
          surname: 'Integration',
          email: 'openfn@openfn.org',
          userCredentials: {
            username: integrationUsername,
            password: 'OpenFn@2024!',
            userRoles: [{ id: superuserRole?.id || 'yrB6vc5Ip3r' }] // Use found ID or default
          },
                   organisationUnits: countryOrgUnitId ? [{ id: countryOrgUnitId }] : [],
           dataViewOrganisationUnits: countryOrgUnitId ? [{ id: countryOrgUnitId }] : [],
           // Add capture org units for data entry access
           teiSearchOrganisationUnits: countryOrgUnitId ? [{ id: countryOrgUnitId }] : []
        };
        
        try {
          await create('users', userPayload)(state);
          
          if (state.data?.response?.uid) {
            console.log(`   ✅ Integration user created successfully!`);
            console.log(`   📝 Username: ${integrationUsername}`);
            console.log(`   🔐 Password: OpenFn@2024!`);
            console.log(`   🏢 Assigned to: ${state.config.countryConfig.name}`);
            console.log(`   ⚠️  IMPORTANT: Update OpenFn credentials to use this user instead of admin`);
            
            // Fetch the created user
            await get(`users/${state.data.response.uid}`, {
              fields: 'id,username,organisationUnits[id,name]'
            })(state);
            integrationUser = state.data;
          }
               } catch (createError) {
           console.log(`   ❌ Could not create integration user: ${createError.message}`);
           
           // Log detailed error response for debugging
           if (createError.response && createError.response.body) {
             console.log(`   🔍 DHIS2 Error Details:`);
             console.log(JSON.stringify(createError.response.body, null, 2));
           } else if (createError.body) {
             console.log(`   🔍 DHIS2 Error Details:`);
             console.log(JSON.stringify(createError.body, null, 2));
           }
           
           console.log(`   💡 You may need to create this user manually in DHIS2`);
         }
      } else {
        console.log(`   ✅ Integration user '${integrationUsername}' already exists`);
        
        // Check if user has org unit access
        const hasOrgUnits = integrationUser.organisationUnits && integrationUser.organisationUnits.length > 0;
        
        if (!hasOrgUnits) {
          console.log('   ⚠️  Integration user has no org units assigned');
          const countryOrgUnitId = orgUnitMappings[state.config.countryConfig.name];
          
          if (countryOrgUnitId) {
            console.log(`   🔧 Attempting to assign integration user to root org unit...`);
            
                       try {
               await update('users', integrationUser.id, {
                 id: integrationUser.id,
                 organisationUnits: [{ id: countryOrgUnitId }],
                 dataViewOrganisationUnits: [{ id: countryOrgUnitId }],
                 teiSearchOrganisationUnits: [{ id: countryOrgUnitId }]
               })(state);
              
              console.log('   ✅ Successfully assigned integration user to root org unit!');
                       } catch (updateError) {
               console.log(`   ❌ Could not assign org unit: ${updateError.message}`);
               
               // Log detailed error response for debugging
               if (updateError.response && updateError.response.body) {
                 console.log(`   🔍 DHIS2 Update Error Details:`);
                 console.log(JSON.stringify(updateError.response.body, null, 2));
               } else if (updateError.body) {
                 console.log(`   🔍 DHIS2 Update Error Details:`);
                 console.log(JSON.stringify(updateError.body, null, 2));
               }
             }
          }
        } else {
          console.log(`   ✅ Integration user has access to ${integrationUser.organisationUnits.length} org unit(s)`);
        }
      }
      
      return integrationUser;
      
    } catch (error) {
      console.log(`   ⚠️ Error checking/creating integration user: ${error.message}`);
      return null;
    }
  }
  
  // Create organization unit groups and group sets
  async function createOrganizationUnitGroups(orgUnitMappings, state) {
    try {
      // Get all org units with their levels
      const orgUnitIds = Object.values(orgUnitMappings)
        .filter(id => id && id !== 'UNKNOWN_ORG_UNIT' && id.length === 11);
      
      if (orgUnitIds.length === 0) {
        console.log('   ⚠️ No organization units found for grouping');
        return;
      }
      
      // Get org units with levels
      await get('organisationUnits', {
        filter: `id:in:[${orgUnitIds.join(',')}]`,
        fields: 'id,name,level'
      })(state);
      
      const orgUnits = state.data.organisationUnits || [];
      console.log(`   📊 Processing ${orgUnits.length} organization units for grouping`);
      
      // Create groups for each level
      const levelGroups = {
        1: { name: 'Countries', code: 'COUNTRIES' },
        2: { name: 'Regions', code: 'REGIONS' }, 
        3: { name: 'Zones', code: 'ZONES' },
        4: { name: 'Districts', code: 'DISTRICTS' },
        5: { name: 'Health Facilities', code: 'HEALTH_FACILITIES' }
      };
      
      const createdGroups = [];
      
      for (const [level, config] of Object.entries(levelGroups)) {
        const levelNum = parseInt(level);
        const orgUnitsAtLevel = orgUnits.filter(ou => ou.level === levelNum);
        
        if (orgUnitsAtLevel.length === 0) continue;
        
        // Check if group exists
        await get('organisationUnitGroups', {
          filter: `code:eq:${config.code}`,
          fields: 'id'
        })(state);
        
        let groupId;
        if (state.data.organisationUnitGroups?.length > 0) {
          groupId = state.data.organisationUnitGroups[0].id;
          console.log(`   ✓ Found existing: ${config.name}`);
        } else {
          // Create group
          await create('organisationUnitGroups', {
            name: config.name,
            shortName: config.name,
            code: config.code,
            organisationUnits: orgUnitsAtLevel.map(ou => ({ id: ou.id }))
          })(state);
          
          groupId = state.data?.response?.uid;
          if (groupId) {
            console.log(`   ✓ Created: ${config.name} (${orgUnitsAtLevel.length} org units)`);
          }
        }
        
        if (groupId) createdGroups.push({ id: groupId });
      }
      
      // Create group set
      if (createdGroups.length > 0) {
        await get('organisationUnitGroupSets', {
          filter: 'code:eq:ADMIN_LEVELS',
          fields: 'id'
        })(state);
        
        if (!(state.data.organisationUnitGroupSets?.length > 0)) {
          await create('organisationUnitGroupSets', {
            name: 'Administrative Levels',
            shortName: 'Admin Levels',
            code: 'ADMIN_LEVELS',
            compulsory: true,
            dataDimension: true,
            organisationUnitGroups: createdGroups
          })(state);
          
          if (state.data?.response?.uid) {
            console.log(`   ✓ Created Administrative Levels group set`);
          }
        } else {
          console.log(`   ✓ Administrative Levels group set already exists`);
        }
      }
      
      console.log('   ✅ Organization unit groups created successfully');
      
    } catch (error) {
      console.log(`   ⚠️ Error creating organization unit groups: ${error.message}`);
    }
  }

  // Job 4: ProcessAllChunksSequentially  
// STATE CONTRACT:
// Input:  { fileName, filePath, chunkSize, totalChunks, totalRows, 
//          metadataSetupComplete, config, data: { dhis2Mappings } }
// Output: { fileName, batchProcessingComplete, summary, config, data: {...} }

executeWithSftp(
    fn(state => {
      const { fileName, totalChunks, chunkSize, filePath, totalRows } = state;
      const { dhis2Mappings } = state.data;
      
      // Validate required state from previous jobs
      if (!fileName || !totalChunks || !filePath) {
        throw new Error('Missing required state: fileName, totalChunks, and filePath must be provided from previous jobs');
      }
      
      // Validate DHIS2 mappings from metadata setup
      if (!dhis2Mappings) {
        throw new Error('Missing DHIS2 mappings: dhis2Mappings must be provided from metadata setup job');
      }
      
      console.log(`🚀 Job 4: Starting batch processing`);
      console.log(`📊 Processing ${totalChunks} chunks of ${chunkSize} rows each`);
      console.log(`🔗 Available mappings:`);
      console.log(`   • Organization Units: ${Object.keys(dhis2Mappings.orgUnits).length}`);
      console.log(`   • Category Option Combos: ${Object.keys(dhis2Mappings.categoryOptionCombos).length}`);
      console.log(`   • Data Elements: ${Object.keys(dhis2Mappings.dataElements).length}`);
      
      // Create array of chunk configurations for each() to iterate over
      const chunks = [];
      for (let i = 0; i < totalChunks; i++) {
        chunks.push({
          index: i,
          number: i + 1,
          size: chunkSize,
          filePath: filePath,
          totalChunks: totalChunks, // Pass total chunks for logging
          dhis2Mappings: dhis2Mappings, // Pass mappings to each chunk
          config: state.config, // Pass config to each chunk
          configuration: state.configuration // Pass DHIS2 configuration to each chunk
        });
      }
      
      console.log(`📦 Created ${chunks.length} chunk configurations`);
      
      return {
        fileName,
        filePath,
        chunkSize,
        totalChunks,
        totalRows,
        chunks,
        chunkResults: [],
        batchProcessingStartTime: new Date().toISOString(),
        data: {
          chunks
        }
      };
    }),
  
    each(
      'chunks[*]',
      fn(state => {
        const chunk = state.data;
        const { index, filePath, size, totalChunks, dhis2Mappings, config, configuration } = chunk;
        
        console.log(`📦 Processing chunk ${index + 1}/${totalChunks}`);
      
        // Use DHIS2 adaptor's getExcelChunk function (handles SFTP internally)
        // Note: getExcelChunk may return data as arrays or objects depending on the Excel structure
        return getExcelChunk(filePath, index, size)(state).then(chunkState => {
          const chunkData = chunkState.chunkData;
          
          // Concise chunk data structure logging
          if (chunkData && chunkData.length > 0) {
            console.log(`   📊 Chunk ${index} analysis: ${chunkData.length} rows`);
            
            // Quick structure check
            if (chunkData[0]) {
              const keys = Object.keys(chunkData[0]);
              console.log(`      • Structure: ${keys.includes('obj') ? 'Wrapped (obj/arr)' : 'Direct columns'}`);
              console.log(`      • Keys: ${keys.join(', ')}`);
            }
            
            // Log expected columns from config
            console.log(`   Expected columns from config:`, Object.keys(config.columnMapping));
            console.log(`   === END CHUNK ANALYSIS ===\n`);
          }
         
          if (!chunkData || chunkData.length === 0) {
            return {
              chunkIndex: index,
              uploadSuccess: true,
              rowsProcessed: 0,
              dataValuesUploaded: 0,
              message: 'Empty chunk skipped'
            };
          }
          
          // Handle case where Excel data comes back in different formats
          let processedChunkData = chunkData;
          
          // Check if data needs transformation
          if (chunkData.length > 0) {
            // Case 1: Data is wrapped in an object structure
            if (chunkData[0].obj !== undefined) {
              console.log(`   🔄 Unwrapping data from 'obj' property`);
              processedChunkData = chunkData.map(row => row.obj);
            } 
            // Case 2: Data is an array of arrays
            else if (Array.isArray(chunkData[0])) {
              console.log(`   🔄 Converting array format to objects`);
              // Skip the header row if this is the first chunk
              const startIndex = (index === 0) ? 1 : 0;
              
              // Hardcode the column order based on the Excel file structure
              // This should match the order in the Excel file
              const columnOrder = ['Site', 'District', 'Zone', 'Region', 'Quarter', 
                                  'hsector', 'Reporting period', 'Indicator_name', 'IndicatorValue'];
              
              console.log(`   Using column order:`, columnOrder);
              processedChunkData = chunkData.slice(startIndex).map((row, rowIdx) => {
                const obj = {};
                columnOrder.forEach((colName, idx) => {
                  obj[colName] = row[idx];
                });
                if (rowIdx === 0) {
                  console.log(`   Sample converted row:`, JSON.stringify(obj, null, 2));
                }
                return obj;
              });
            } 
            // Case 3: Data is already in the expected format
            else {
              console.log(`   ✓ Data appears to be in expected object format`);
            }
          }
          
          // Final validation of processed data
          if (processedChunkData.length > 0) {
            console.log(`\n   === PROCESSED DATA VALIDATION ===`);
            console.log(`   Processed rows count: ${processedChunkData.length}`);
            console.log(`   First processed row keys:`, Object.keys(processedChunkData[0]));
            console.log(`   First processed row values:`, processedChunkData[0]);
            
            // Check if we have the expected columns
            const expectedCols = Object.keys(config.columnMapping);
            const actualCols = Object.keys(processedChunkData[0]);
            const missingCols = expectedCols.filter(col => !actualCols.includes(col));
            const extraCols = actualCols.filter(col => !expectedCols.includes(col));
            
            if (missingCols.length > 0) {
              console.log(`   ⚠️ Missing expected columns:`, missingCols);
            }
            if (extraCols.length > 0) {
              console.log(`   ⚠️ Extra unexpected columns:`, extraCols);
            }
            console.log(`   === END VALIDATION ===\n`);
          }
          
          // Get dynamic column names from config
          console.log(`\n   === COLUMN MAPPING FROM CONFIG ===`);
          console.log(`   Config column mapping:`, JSON.stringify(config.columnMapping, null, 2));
          
          const indicatorColumn = Object.keys(config.columnMapping).find(col => 
            config.columnMapping[col].dataProcessingRole === 'indicator'
          );
          const valueColumn = Object.keys(config.columnMapping).find(col => 
            config.columnMapping[col].dataProcessingRole === 'value'
          );
          const quarterColumn = Object.keys(config.columnMapping).find(col => 
            config.columnMapping[col].dataProcessingRole === 'period'
          );
          const siteColumn = Object.keys(config.columnMapping).find(col => 
            config.columnMapping[col].dataProcessingRole === 'orgUnit'
          );
          const hsectorColumn = Object.keys(config.columnMapping).find(col => 
            config.columnMapping[col].dataProcessingRole === 'category'
          );
          const reportingPeriodColumn = Object.keys(config.columnMapping).find(col => 
            config.columnMapping[col].uniqueValueKey === 'reportingPeriods'
          );
          
          console.log(`   Mapped columns:`);
          console.log(`     - indicatorColumn: "${indicatorColumn}"`);
          console.log(`     - valueColumn: "${valueColumn}"`);
          console.log(`     - quarterColumn: "${quarterColumn}"`);
          console.log(`     - siteColumn: "${siteColumn}"`);
          console.log(`     - hsectorColumn: "${hsectorColumn}"`);
          console.log(`     - reportingPeriodColumn: "${reportingPeriodColumn}"`);
          console.log(`   === END COLUMN MAPPING ===\n`);
          
          const dataValues = processedChunkData.map((row, rowIndex) => {
            const quarterPeriod = row[quarterColumn] ? transformPeriod(row[quarterColumn]) : '';
            
            // Org units are mapped by name (from upsertOrganisationUnitHierarchy)
            const siteName = row[siteColumn];
            const siteOrgUnit = siteName ? dhis2Mappings.orgUnits[siteName] : null;
            
            // Convert indicator name to code before lookup
            const indicatorName = row[indicatorColumn];
            const indicatorCode = indicatorName ? generateCodeFromName(indicatorName) : '';
            const dataElement = indicatorCode ? dhis2Mappings.dataElements[indicatorCode] : null;
            
            // Create category option combo key from both hsector and reporting period
            // Category option combos are mapped by name (e.g., "Public+Cumulative")
            const hsectorValue = row[hsectorColumn];
            const reportingPeriodValue = row[reportingPeriodColumn];
            const categoryComboKey = (hsectorValue && reportingPeriodValue) ? 
              `${hsectorValue}+${reportingPeriodValue}` : '';
            const categoryOptionCombo = categoryComboKey ? 
              dhis2Mappings.categoryOptionCombos[categoryComboKey] : null;
            
            // Debug first few rows with complete details
            // Log only the first row mapping for debugging
            if (rowIndex === 0) {
              console.log(`   📍 Sample mapping (row 0):`);
              console.log(`      • ${indicatorColumn}: "${row[indicatorColumn]}" → ${dataElement ? `✓ ${dataElement}` : '✗ Not found'}`);
              console.log(`      • ${siteColumn}: "${row[siteColumn]}" → ${siteOrgUnit ? `✓ ${siteOrgUnit}` : '✗ Not found'}`);
              console.log(`      • Category: "${categoryComboKey}" → ${categoryOptionCombo ? `✓ ${categoryOptionCombo}` : '✗ Not found'}`);
              console.log(`      • Period: "${row[quarterColumn]}" → "${quarterPeriod}"`);
            }
          
            // Get the value, handling undefined/null cases
            const value = row[valueColumn];
            
            return {
              dataElement: dataElement || 'UNKNOWN_DATA_ELEMENT',
              period: quarterPeriod,
              orgUnit: siteOrgUnit || 'UNKNOWN_ORG_UNIT',
                            categoryOptionCombo: categoryOptionCombo || 'HllvX50cXC0',  // Use DHIS2's default category option combo UID
              value: value !== undefined && value !== null && value !== '' ? String(value) : '0',
              hasValue: value !== undefined && value !== null && value !== ''
            };
          });
          
          // Filter out invalid mappings and rows without values
          const validDataValues = dataValues
            .filter(dv => dv.dataElement !== 'UNKNOWN_DATA_ELEMENT' && dv.orgUnit !== 'UNKNOWN_ORG_UNIT')
            .filter(dv => dv.hasValue)  // Only include rows that have actual values
            .map(dv => {
              // Remove the hasValue flag before sending to DHIS2
              const { hasValue, ...dataValue } = dv;
              return dataValue;
            });
          
          // Log mapping statistics for debugging
          const unknownDataElements = dataValues.filter(dv => dv.dataElement === 'UNKNOWN_DATA_ELEMENT').length;
          const unknownOrgUnits = dataValues.filter(dv => dv.orgUnit === 'UNKNOWN_ORG_UNIT').length;
          const missingValues = dataValues.filter(dv => !dv.hasValue).length;
          
          if (unknownDataElements > 0 || unknownOrgUnits > 0 || missingValues > 0) {
            console.log(`   ⚠️ Data issues in chunk ${index}:`);
            if (unknownDataElements > 0) console.log(`      • ${unknownDataElements} unknown data elements`);
            if (unknownOrgUnits > 0) console.log(`      • ${unknownOrgUnits} unknown org units`);
            if (missingValues > 0) console.log(`      • ${missingValues} rows without values (skipped)`);
          }
          
          console.log(`   📊 Chunk ${index}: ${dataValues.length} total rows → ${validDataValues.length} valid data values`);
        
          if (validDataValues.length === 0) {
            return {
              chunkIndex: index,
              uploadSuccess: true,
              rowsProcessed: processedChunkData.length,
              dataValuesUploaded: 0,
              message: 'No valid data values created'
            };
          }
          
          // Create DHIS2 DataValueSet
          // For bulk imports, don't include period/orgUnit at root level when data values have mixed periods/orgs
          const dataValueSet = {
            dataValues: validDataValues
          };
          
          // Include dataSet ID if available
          if (dhis2Mappings.dataSetId) {
            dataValueSet.dataSet = dhis2Mappings.dataSetId;
          }
          
          // Log the data value set structure for debugging
          console.log(`   📝 Data value set structure:`);
          console.log(`      • Data set ID: ${dataValueSet.dataSet || 'Not specified'}`);
          console.log(`      • Data values count: ${dataValueSet.dataValues.length}`);
          if (dataValueSet.dataValues.length > 0) {
            console.log(`      • Sample data value:`, JSON.stringify(dataValueSet.dataValues[0], null, 2));
            
            // Check for common issues
            const sampleValue = dataValueSet.dataValues[0];
            if (!sampleValue.dataElement || sampleValue.dataElement === 'UNKNOWN_DATA_ELEMENT') {
              console.warn(`      ⚠️  Warning: Invalid data element ID`);
            }
            if (!sampleValue.orgUnit || sampleValue.orgUnit === 'UNKNOWN_ORG_UNIT') {
              console.warn(`      ⚠️  Warning: Invalid org unit ID`);
            }
            if (!sampleValue.categoryOptionCombo || sampleValue.categoryOptionCombo === 'UNKNOWN_CATEGORY_COMBO') {
              console.warn(`      ⚠️  Warning: Invalid category option combo ID`);
            }
          }
          
          // Pass the complete state with DHIS2 configuration to the create function
          const stateForUpload = {
            configuration: configuration,  // Use the DHIS2 configuration from the chunk
            data: dataValueSet
          };
          
          // Use query parameters instead of params wrapper
          return create('dataValueSets?importStrategy=CREATE_AND_UPDATE&skipExistingCheck=true', dataValueSet)(stateForUpload).then(uploadState => {
            console.log(`✅ Chunk ${index + 1}: ${dataValueSet.dataValues.length} values uploaded`);
            
            // Handle different possible response structures safely
            const responseData = uploadState?.data || uploadState?.response || uploadState || {};
            
            // Log import summary if available
            if (responseData.importCount) {
              const summary = responseData.importCount;
              console.log(`   📊 Import summary:`);
              console.log(`      • Imported: ${summary.imported || 0}`);
              console.log(`      • Updated: ${summary.updated || 0}`);
              console.log(`      • Ignored: ${summary.ignored || 0}`);
              console.log(`      • Deleted: ${summary.deleted || 0}`);
            }
            
            return {
              chunkIndex: index,
              uploadSuccess: true,
              rowsProcessed: processedChunkData.length,
              dataValuesUploaded: dataValueSet.dataValues.length,
              dhis2Response: responseData,
              message: `Successfully uploaded ${dataValueSet.dataValues.length} data values`
            };
          }).catch(uploadError => {
            console.error(`❌ Chunk ${index + 1} failed:`, uploadError.message);
            
            // Log more details about the error if available
            if (uploadError.body) {
              // Process conflicts to show summary instead of full indexes
              if (uploadError.body.response && uploadError.body.response.conflicts) {
                const conflicts = uploadError.body.response.conflicts;
                console.error(`   ❌ DHIS2 Import Conflicts: ${conflicts.length} types`);
                
                conflicts.forEach((conflict, idx) => {
                  const indexCount = conflict.indexes ? conflict.indexes.length : 0;
                  console.error(`   ${idx + 1}. ${conflict.value}`);
                  console.error(`      • Error code: ${conflict.errorCode}`);
                  console.error(`      • Object: ${conflict.object}`);
                  console.error(`      • Affected rows: ${indexCount}`);
                  if (indexCount > 0 && conflict.indexes) {
                    const preview = conflict.indexes.slice(0, 5).join(', ');
                    const suffix = indexCount > 5 ? `, ... (${indexCount - 5} more)` : '';
                    console.error(`      • Row indexes: ${preview}${suffix}`);
                  }
                });
                
                // Show import summary if available
                if (uploadError.body.response.importCount) {
                  const summary = uploadError.body.response.importCount;
                  console.error(`   📊 Import summary: imported=${summary.imported || 0}, updated=${summary.updated || 0}, ignored=${summary.ignored || 0}`);
                }
              } else {
                // For non-conflict errors, show the full response but without huge arrays
                const cleanedBody = JSON.parse(JSON.stringify(uploadError.body));
                console.error(`   DHIS2 Error Response:`, JSON.stringify(cleanedBody, null, 2));
              }
            }
            if (uploadError.response && uploadError.response.headers) {
              console.error(`   HTTP Response: ${uploadError.response.status} ${uploadError.response.statusText}`);
            }
            
            return {
              chunkIndex: index,
              uploadSuccess: false,
              rowsProcessed: processedChunkData.length,
              dataValuesUploaded: 0,
              error: uploadError.message,
              errorDetails: uploadError.body || (uploadError.response ? uploadError.response.body : null),
              message: `Upload failed: ${uploadError.message}`
            };
          });
        }).catch(chunkError => {
          console.error(`❌ Chunk ${index + 1}:`, chunkError.message);
          
          return {
            chunkIndex: index,
            uploadSuccess: false,
            rowsProcessed: 0,
            dataValuesUploaded: 0,
            error: chunkError.message,
            message: `Chunk processing failed: ${chunkError.message}`
          };
        });
      })
    ),
  
    fn(state => {
      // Collect all results from the each() operation
      const results = state.references || [];
      const successfulChunks = results.filter(r => r.uploadSuccess === true);
      const failedChunks = results.filter(r => r.uploadSuccess === false);
      
      const totalRowsProcessed = results.reduce((sum, r) => sum + (r.rowsProcessed || 0), 0);
      const totalDataValuesUploaded = results.reduce((sum, r) => sum + (r.dataValuesUploaded || 0), 0);
      
      console.log(`✅ Job 4 Complete: ${successfulChunks.length}/${results.length} chunks, ${totalDataValuesUploaded} values uploaded`);
      
      if (failedChunks.length > 0) {
        console.log(`⚠️  Failed chunks: ${failedChunks.map(c => c.chunkIndex + 1).join(', ')}`);
      }
      
      return {
        fileName: state.fileName,
        batchProcessingComplete: true,
        summary: {
          totalChunks: results.length,
          successfulChunks: successfulChunks.length,
          failedChunks: failedChunks.length,
          totalRowsProcessed,
          totalDataValuesUploaded,
          processingStartTime: state.batchProcessingStartTime,
          processingEndTime: new Date().toISOString()
        },
        data: results.length > 0 ? results[results.length - 1] : {}
      };
    })
  ); // Close executeWithSftp
  
  // Helper function to transform period from Excel format to DHIS2 format
  function transformPeriod(quarterString) {
    if (!quarterString) return '2017Q1';
    
    // Handle formats like "2017 Q1" or "2017Q1"
    const cleaned = quarterString.replace(/\s+/g, '');
    
    // Extract year and quarter
    const match = cleaned.match(/(\d{4})\s*Q(\d)/);
    if (match) {
      const year = match[1];
      const quarter = match[2];
      return `${year}Q${quarter}`;
    }
    
    // Fallback
    return cleaned || '2017Q1';
  }
  
  // Helper function to generate codes from names (same as in metadata generation)
  function generateCodeFromName(name) {
    if (!name) return '';
    return name
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .substring(0, 50);
  } 

  