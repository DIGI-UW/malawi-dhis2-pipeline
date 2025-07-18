// Job 3: Check and Setup DHIS2 Metadata
// Creates actual DHIS2 metadata objects and generates real UID mappings

fn(async state => {
  console.log('🏗️ Job 3: Setting up DHIS2 metadata...');
  
  const { dhis2Structures } = state.data;
  
  if (!dhis2Structures) {
    throw new Error('No DHIS2 structures found from previous job');
  }
  
  console.log('📋 Metadata structures to create:');
  console.log(`   • Organization Units: ${dhis2Structures.orgUnits.length}`);
  console.log(`   • Categories: ${dhis2Structures.categories.length}`);
  console.log(`   • Data Elements: ${dhis2Structures.dataElements.length}`);
  
  try {
    // Create organization units in hierarchical order
    console.log('🏢 Creating organization units...');
    const orgUnitMappings = await createOrganizationUnits(dhis2Structures.orgUnits, state);
    
    // Create categories and category options
    console.log('🏷️ Creating categories...');
    const categoryMappings = await createCategories(dhis2Structures.categories, state);
    
    // Create data elements
    console.log('📊 Creating data elements...');
    const dataElementMappings = await createDataElements(dhis2Structures.dataElements, state);
    
    console.log('✅ DHIS2 metadata setup complete!');
    console.log(`   • Organization Units: ${Object.keys(orgUnitMappings).length} mappings`);
    console.log(`   • Categories: ${Object.keys(categoryMappings).length} mappings`);
    console.log(`   • Data Elements: ${Object.keys(dataElementMappings).length} mappings`);
    
    return {
      ...state,
      metadataSetupComplete: true,
      data: {
        ...state.data,
        dhis2Mappings: {
          orgUnits: orgUnitMappings,
          categories: categoryMappings,
          dataElements: dataElementMappings
        },
        metadataCreated: {
          orgUnits: Object.keys(orgUnitMappings).length,
          categories: Object.keys(categoryMappings).length,
          dataElements: Object.keys(dataElementMappings).length
        }
      }
    };
  } catch (error) {
    console.error('❌ Error setting up DHIS2 metadata:', error);
    throw error;
  }
});

// Create organization units in hierarchical order
async function createOrganizationUnits(orgUnitStructures, state) {
  const mappings = {};
  const parentMappings = {}; // Track parent relationships
  
  // Group by level for hierarchical creation
  const levels = {};
  orgUnitStructures.forEach(ou => {
    if (!levels[ou.level]) levels[ou.level] = [];
    levels[ou.level].push(ou);
  });
  
  // Create organization units level by level
  for (let level = 1; level <= 5; level++) {
    if (!levels[level]) continue;
    
    console.log(`🏢 Creating Level ${level} organization units...`);
    
    for (const orgUnit of levels[level]) {
      try {
        // Check if organization unit already exists
        const existing = await get(`organisationUnits`, {
          filter: `code:eq:${orgUnit.code}`
        });
        
        if (existing.organisationUnits && existing.organisationUnits.length > 0) {
          const existingOrgUnit = existing.organisationUnits[0];
          console.log(`   ✓ Found existing: ${orgUnit.name} (${existingOrgUnit.id})`);
          mappings[orgUnit.name] = existingOrgUnit.id;
          parentMappings[orgUnit.name] = existingOrgUnit.id;
        } else {
          // Create new organization unit
          const payload = {
            name: orgUnit.name,
            shortName: orgUnit.shortName,
            code: orgUnit.code,
            level: level
          };
          
          // Set parent if not level 1
          if (level > 1 && orgUnit.parent && parentMappings[orgUnit.parent]) {
            payload.parent = { id: parentMappings[orgUnit.parent] };
          }
          
          const result = await create('organisationUnits', payload);
          
          if (result.response && result.response.uid) {
            const newId = result.response.uid;
            console.log(`   ✓ Created: ${orgUnit.name} (${newId})`);
            mappings[orgUnit.name] = newId;
            parentMappings[orgUnit.name] = newId;
          } else {
            console.log(`   ⚠️ Warning: Could not create ${orgUnit.name}`);
          }
        }
      } catch (error) {
        console.log(`   ⚠️ Error with ${orgUnit.name}: ${error.message}`);
      }
    }
  }
  
  return mappings;
}

// Create categories and category options
async function createCategories(categoryStructures, state) {
  const mappings = {};
  
  for (const category of categoryStructures) {
    try {
      console.log(`🏷️ Processing category: ${category.name}`);
      
      // Check if category already exists
      const existing = await get(`categories`, {
        filter: `code:eq:${category.code}`
      });
      
      let categoryId;
      if (existing.categories && existing.categories.length > 0) {
        categoryId = existing.categories[0].id;
        console.log(`   ✓ Found existing category: ${category.name} (${categoryId})`);
      } else {
        // Create category options first
        const categoryOptionIds = [];
        
        for (const option of category.categoryOptions) {
          try {
            const existingOption = await get(`categoryOptions`, {
              filter: `code:eq:${option.code}`
            });
            
            if (existingOption.categoryOptions && existingOption.categoryOptions.length > 0) {
              const optionId = existingOption.categoryOptions[0].id;
              console.log(`   ✓ Found existing option: ${option.name} (${optionId})`);
              categoryOptionIds.push(optionId);
            } else {
              const optionResult = await create('categoryOptions', {
                name: option.name,
                shortName: option.shortName,
                code: option.code
              });
              
              if (optionResult.response && optionResult.response.uid) {
                const optionId = optionResult.response.uid;
                console.log(`   ✓ Created option: ${option.name} (${optionId})`);
                categoryOptionIds.push(optionId);
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
          categoryOptions: categoryOptionIds.map(id => ({ id }))
        };
        
        const categoryResult = await create('categories', categoryPayload);
        
        if (categoryResult.response && categoryResult.response.uid) {
          categoryId = categoryResult.response.uid;
          console.log(`   ✓ Created category: ${category.name} (${categoryId})`);
        }
      }
      
      // Map category options to their IDs
      if (categoryId) {
        mappings[category.name] = categoryId;
        
        // Also map individual category options
        for (const option of category.categoryOptions) {
          mappings[option.name] = categoryId; // For simplicity, map to category ID
        }
      }
      
    } catch (error) {
      console.log(`   ⚠️ Error with category ${category.name}: ${error.message}`);
    }
  }
  
  return mappings;
}

// Create data elements
async function createDataElements(dataElementStructures, state) {
  const mappings = {};
  
  console.log(`📊 Creating ${dataElementStructures.length} data elements...`);
  
  for (const dataElement of dataElementStructures) {
    try {
      // Check if data element already exists
      const existing = await get(`dataElements`, {
        filter: `code:eq:${dataElement.code}`
      });
      
      if (existing.dataElements && existing.dataElements.length > 0) {
        const existingId = existing.dataElements[0].id;
        console.log(`   ✓ Found existing: ${dataElement.name} (${existingId})`);
        mappings[dataElement.name] = existingId;
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
        
        const result = await create('dataElements', payload);
        
        if (result.response && result.response.uid) {
          const newId = result.response.uid;
          console.log(`   ✓ Created: ${dataElement.name} (${newId})`);
          mappings[dataElement.name] = newId;
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