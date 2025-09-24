/**
 * Job 3 – SetupDHIS2Metadata
 * Role: Creates or loads DHIS2 structures based on metadata from Job 2, persisting mappings for chunk uploads.
 * Workflow position: 4/5 (bridges metadata parsing and chunk upload). Uses native state for index/mapping handoff.
 */
// STATE CONTRACT:
// Input: { data: { dhis2Structures, orgUnitParentMap }, fileTypeConfig, config, filesIndex }
// Output: { metadataSetupComplete, data.dhis2Mappings, filesIndex }

fn(async state => {
  console.log('🏗️ Job 3: Setting up DHIS2 metadata...');

  const { dhis2Structures } = state.data || {};
  const fileTypeConfig = state.fileTypeConfig || state.config?.fileTypeConfig;

  if (!dhis2Structures) {
    throw new Error('No DHIS2 structures found from previous job');
  }

  const filesIndex = state.filesIndex || {};

  let mappings = {};

  if (fileTypeConfig?.dhis2Config?.preProvisioned) {
    console.log('ℹ️ DHIS2 metadata pre-provisioned; skipping creation');
    mappings = fileTypeConfig.dhis2Config.preProvisionedMappings || {};
  } else {
    mappings = await prepareMetadata(dhis2Structures, {
      maxLevels: state.config.maxLevels,
      orgUnitParentMap: state.data.orgUnitParentMap || {},
      dhis2Config: fileTypeConfig?.dhis2Config || {}
    })(state);
  }

  filesIndex[state.fileName] = {
    ...(filesIndex[state.fileName] || {}),
    dhis2Mappings: mappings,
    status: 'metadata-ready',
    lastProcessedAt: new Date().toISOString()
  };

  state.filesIndex = filesIndex;
  state.metadataSetupComplete = true;
  state.data = {
    ...state.data,
    dhis2Mappings: mappings
  };
  delete state.references;

  return state;
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
async function createDataSet(dataElementMappings, categoryCombinationId, orgUnitMappings, state, fileTypeConfig) {
  try {
    // Check if data set already exists
    const dataSetCode = fileTypeConfig?.dhis2Config?.dataSetCode || 'MALAWI_ART_DATASET';
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
      name: fileTypeConfig?.dhis2Config?.dataSetName || 'Malawi ART Data Set',
      shortName: fileTypeConfig?.dhis2Config?.dataSetShortName || 'ART Data Set',
      code: dataSetCode,
      periodType: fileTypeConfig?.dhis2Config?.periodType || 'Quarterly',
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