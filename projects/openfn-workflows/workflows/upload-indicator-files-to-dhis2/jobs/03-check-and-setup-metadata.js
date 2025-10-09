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

  // TEMP DEBUG: log admin and integration credentials in use for this job
  const cfgDebug = state.configuration || {};
  try {
    const p = String(cfgDebug.password || '');
    console.log('🔐 DHIS2 ADMIN DEBUG:', {
      hostUrl: cfgDebug.hostUrl,
      username: cfgDebug.username,
      pw_raw: p
    });
  } catch (_) {}

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

// Orchestrate DHIS2 metadata creation and return mappings
function prepareMetadata(dhis2Structures, options) {
  return async state => {
    const { orgUnits = [], categories = [], dataElements = [] } = dhis2Structures || {};

    // Inject MMD Duration category for PEPFAR TxCURRMMD files
    const finalCategories = Array.isArray(categories) ? [...categories] : [];
    try {
      const ft = state.fileTypeConfig?.fileType;
      if (ft === 'pepfar_tx_mmd_csv') {
        const hasMmd = finalCategories.some(c => c?.code === 'MMD_DURATION');
        if (!hasMmd) {
          finalCategories.push({
            name: 'MMD Duration',
            shortName: 'MMD Duration',
            code: 'MMD_DURATION',
            categoryOptions: [
              { name: '<3 months', shortName: '<3 months', code: 'MMD_LT3' },
              { name: '3-5 months', shortName: '3-5 months', code: 'MMD_3TO5' },
              { name: '>=6 months', shortName: '>=6 months', code: 'MMD_GE6' }
            ]
          });
        }
      }
    } catch (_) {}

    // 1) Categories and options
    const categoryMappings = await createCategories(finalCategories, state);
    const { categoryOptionCombos, categoryCombinationId } = await createCategoryCombination(finalCategories, state);

    // 2) Data elements (pass category combo for disaggregation)
    const dataElementMappings = await createDataElements(dataElements, categoryCombinationId, state);
    // Fail-fast: do not proceed if no data elements were mapped
    if (!dataElementMappings || Object.keys(dataElementMappings).length === 0) {
      throw new Error('No data elements mapped. Aborting metadata setup before data load.');
    }

    // 3) Create root country org unit and facilities in one call (levels 1-2)
    console.log('🏛️ Creating root country org unit and facilities...');
    const countryConfig = {
      name: 'Malawi',
      shortName: 'Malawi', 
      code: 'MW'
    };
    const countryStructure = [{
      name: countryConfig.name,
      shortName: countryConfig.shortName,
      code: countryConfig.code,
      level: 1,
      parent: null
    }];
    // 5) Facility org units structures (Level 2)
    const siteNames = state.data?.uniqueValues?.sites || [];
    const facilityStructures = Array.from(new Set(siteNames.filter(Boolean))).map(name => ({
      name,
      shortName: String(name).substring(0, 50),
      code: generateCodeFromName(name),
      level: 2,
      parent: countryConfig.name // Make facilities children of country using name (not UID)
    }));

    // Upsert both country and facilities in a single call to preserve parent mapping
    const combinedStructures = [...countryStructure, ...facilityStructures];
    state = await upsertOrganisationUnitHierarchy(combinedStructures, { maxLevels: 2, openingDate: '2020-01-01' })(state);
    const allMappings = (state.data && state.data.mappings) ? state.data.mappings : {};
    const countryOrgUnitId = allMappings[countryConfig.name];
    if (!countryOrgUnitId) {
      throw new Error('Failed to create/resolve root country org unit');
    }
    console.log(`   ✓ Root country org unit: ${countryConfig.name} (${countryOrgUnitId})`);

    // 4) Create integration user with country org unit access
    console.log('👤 Creating integration user...');
    const cfg = state.configuration || {};
    const integrationUsername = cfg.integrationUsername || 'openfn_integration';
    const integrationPassword = cfg.integrationPassword || 'OpenFn@2024!';
    try {
      console.log('🔐 DHIS2 INTEGRATION USER DEBUG:', {
        username: integrationUsername,
        pw_raw: integrationPassword
      });
    } catch (_) {}
    const integrationUser = await checkAndCreateIntegrationUser(countryOrgUnitId, state, { integrationUsername, integrationPassword });

    // Use mappings from the combined upsert
    const orgUnitMappings = allMappings;

    // 4) Data set (assigns elements and any known org units)
    const dataSetId = await createDataSet(
      dataElementMappings,
      categoryCombinationId,
      orgUnitMappings,
      state,
      state.fileTypeConfig
    );

    const mappings = {
      orgUnits: orgUnitMappings,
      categories: categoryMappings,
      categoryOptionCombos,
      dataElements: dataElementMappings,
      dataSetId
    };

    // Persist mappings on state.data for downstream job consumption
    state.data = { ...(state.data || {}), dhis2Mappings: mappings };
    return mappings;
  };
}

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
      state = await get(`categories`, {
        filter: `code:eq:${category.code}`,
        fields: 'id,categoryOptions[id,code]',
        paging: false
      })(state);
      
      let categoryData = state.data.categories && state.data.categories[0];
      
      if (!categoryData) {
        // Create category options first
        const categoryOptionIds = [];
        
        for (const option of category.categoryOptions) {
          try {
            state = await get(`categoryOptions`, { filter: `code:eq:${option.code}`, fields: 'id', paging: false })(state);
            let catOption = state.data.categoryOptions && state.data.categoryOptions[0];

            if (catOption) {
              categoryOptionIds.push({ id: catOption.id });
            } else {
              state = await create('categoryOptions', {
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
        
        state = await create('categories', categoryPayload)(state);
        
        if (state.data?.response?.uid) {
          const categoryId = state.data.response.uid;
          state = await get(`categories/${categoryId}`, { fields: 'id,categoryOptions[id,code]', paging: false })(state);
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

// Check for and create integration user if needed (based on working Postman collection)
async function checkAndCreateIntegrationUser(countryOrgUnitId, state, options = {}) {
  try {
    const integrationUsername = options.integrationUsername || 'openfn_integration';
    
    // Check if integration user already exists
    console.log(`   🔍 Checking if integration user '${integrationUsername}' exists...`);
    state = await get('users', {
      filter: `username:eq:${integrationUsername}`,
      fields: 'id,username,userCredentials[username],organisationUnits[id,name]',
      paging: false
    })(state);
    
    let integrationUser = state.data.users && state.data.users[0];
    
    if (!integrationUser) {
      console.log('   📝 Integration user not found. Creating new user...');
      
      // Get superuser role ID
      state = await get('userRoles', {
        filter: 'name:eq:Superuser',
        fields: 'id,name,authorities',
        paging: false
      })(state);
      
      const superuserRole = state.data.userRoles && state.data.userRoles[0];
      let superuserRoleId = superuserRole?.id;
      if (!superuserRoleId) {
        // Fallback: find a role with ALL authority
        state = await get('userRoles', { fields: 'id,name,authorities', paging: 'false' })(state);
        const roles = state.data.userRoles || [];
        const allRole = roles.find(r => Array.isArray(r.authorities) && r.authorities.includes('ALL'));
        superuserRoleId = allRole?.id;
      }
      if (!superuserRoleId) console.log('   ⚠️  Could not find Superuser/ALL role. Using default ID as last resort.');
      
      // Create the integration user
      const userPayload = {
        username: integrationUsername,
        firstName: 'OpenFn',
        surname: 'Integration',
        email: 'openfn@openfn.org',
        userCredentials: {
          username: integrationUsername,
          password: options.integrationPassword || 'OpenFn@2024!',
          userRoles: [{ id: superuserRole?.id || 'yrB6vc5Ip3r' }] // Use found ID or default
        },
        organisationUnits: [{ id: countryOrgUnitId }],
        dataViewOrganisationUnits: [{ id: countryOrgUnitId }],
        // Add capture org units for data entry access
        teiSearchOrganisationUnits: [{ id: countryOrgUnitId }]
      };
      
      try {
        state = await create('users', userPayload)(state);
        
        // Attempt to capture UID from standard response or location header
        let uid = state.data?.response?.uid;
        if (!uid && state.response && state.response.headers && state.response.headers.location) {
          const loc = String(state.response.headers.location || '');
          const m = loc.match(/[A-Za-z0-9]{11}/);
          if (m) uid = m[0];
        }
        
        if (!uid) {
          // Fallback: resolve by username
          state = await get('users', {
            filter: `username:eq:${integrationUsername}`,
            fields: 'id,username,organisationUnits[id,name]',
            paging: false
          })(state);
          if (state.data.users && state.data.users.length > 0) {
            uid = state.data.users[0].id;
          }
        }
        
        if (uid) {
          console.log(`   ✅ Integration user created/resolved. ID: ${uid}`);
          // Fetch full user object for subsequent assignment checks
          state = await get(`users/${uid}`, { fields: 'id,username,organisationUnits[id,name]' })(state);
          integrationUser = state.data;
        } else {
          console.log('   ❌ Unable to determine integration user ID after create.');
        }
        
      } catch (createError) {
        // Check if this is a 409 conflict error
        if (createError.message && createError.message.includes('409')) {
          console.log(`   ⚠️  User creation returned 409 Conflict - user already exists`);
          console.log(`   🔍 Attempting to resolve existing user ID...`);
          
          try {
            console.log(`   🔍 BEFORE USER GET: state.data keys:`, Object.keys(state.data || {}));
            state = await get('users', {
              filter: `username:eq:${integrationUsername}`,
              fields: 'id,username,organisationUnits[id,name]',
              paging: false
            })(state);
            console.log(`   🔍 AFTER USER GET: state.data keys:`, Object.keys(state.data || {}));
            console.log(`   🔍 GET users response:`, JSON.stringify(state.data, null, 2));
            
            if (state.data.users && state.data.users.length > 0) {
              integrationUser = state.data.users[0];
              console.log(`   ✅ Resolved existing user ID: ${integrationUser.id}`);
            } else {
              console.log(`   ❌ Could not resolve existing user ID - no users found`);
            }
          } catch (resolveError) {
            console.log(`   ❌ Error resolving existing user: ${resolveError.message}`);
          }
        } else {
          console.log(`   ❌ Could not create integration user: ${createError.message}`);
          console.log(`   💡 You may need to create this user manually in DHIS2`);
        }
      }
    } else {
      console.log(`   ✅ Integration user '${integrationUsername}' already exists`);
    }
    
    // Handle org unit assignment for existing or newly created user
    if (integrationUser) {
      // Check if user has org unit access
      const hasOrgUnits = integrationUser.organisationUnits && integrationUser.organisationUnits.length > 0;
      
      if (!hasOrgUnits) {
        console.log('   ⚠️  Integration user has no org units assigned');
        console.log(`   🔧 Attempting to assign integration user to root org unit...`);
        
        try {
          // Get full user object for PUT update (like Postman collection)
          state = await get(`users/${integrationUser.id}`, {
            fields: 'id,username,firstName,surname,email,organisationUnits,dataViewOrganisationUnits,teiSearchOrganisationUnits'
          })(state);
          
          const fullUser = state.data;
          
          // Ensure organisationUnits arrays exist
          if (!fullUser.organisationUnits) fullUser.organisationUnits = [];
          if (!fullUser.dataViewOrganisationUnits) fullUser.dataViewOrganisationUnits = [];
          if (!fullUser.teiSearchOrganisationUnits) fullUser.teiSearchOrganisationUnits = [];
          
          // Add country OU if not already present
          if (countryOrgUnitId && !fullUser.organisationUnits.some(ou => ou.id === countryOrgUnitId)) {
            fullUser.organisationUnits.push({ id: countryOrgUnitId });
            fullUser.dataViewOrganisationUnits.push({ id: countryOrgUnitId });
            fullUser.teiSearchOrganisationUnits.push({ id: countryOrgUnitId });
          }
          
          // Update the user with full object (PUT request)
          state = await update('users', integrationUser.id, fullUser)(state);
          
          console.log('   ✅ Successfully assigned integration user to root org unit!');
        } catch (updateError) {
          console.log(`   ❌ Could not assign org unit: ${updateError.message}`);
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
    state = await get(`categories`, {
      filter: `code:eq:${category.code}`,
      fields: 'id',
      paging: false
    })(state);
    
    if (state.data.categories && state.data.categories[0]) {
      categoryIds.push({ id: state.data.categories[0].id });
    }
  }
  
  if (categoryIds.length === 0) {
    console.log('⚠️  No categories found for combination');
    return {
      categoryOptionCombos: mappings,
      categoryCombinationId: null
    };
  }
  
  // Create category combination
  const combCode = 'HEALTH_REPORTING_COMBO';
  state = await get(`categoryCombos`, {
    filter: `code:eq:${combCode}`,
    fields: 'id,categoryOptionCombos[id,name,categoryOptions[id,name]]',
    paging: false
  })(state);
  
  let categoryCombo = state.data.categoryCombos && state.data.categoryCombos[0];
  
  if (categoryCombo) {
    console.log(`   ✓ Found existing category combination: ${categoryCombo.id}`);
  } else {
    const comboPayload = {
      name: 'Data Disaggregation',
      code: combCode,
      dataDimensionType: 'ATTRIBUTE',
      categories: categoryIds
    };
    
    state = await create('categoryCombos', comboPayload)(state);
    
    if (state.data?.response?.uid) {
      const comboId = state.data.response.uid;
      console.log(`   ✓ Created category combination: ${comboId}`);
      
      // Get the combination with its option combos
      state = await get(`categoryCombos/${comboId}`, { 
        fields: 'id,categoryOptionCombos[id,name,categoryOptions[id,name]]',
        paging: false
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
async function createDataElements(dataElementStructures, categoryCombinationId, state) {
  const mappings = {};
  
  console.log(`📊 Creating ${dataElementStructures.length} data elements...`);
  if (categoryCombinationId) {
    console.log(`   Using category combination: ${categoryCombinationId}`);
  }
  
  for (const dataElement of dataElementStructures) {
    try {
      // Check if data element already exists
      state = await get(`dataElements`, {
        filter: `code:eq:${dataElement.code}`,
        fields: 'id',
        paging: false
      })(state);
      
      if (state.data.dataElements && state.data.dataElements.length > 0) {
        const existingId = state.data.dataElements[0].id;
        console.log(`   ✓ Found existing: ${dataElement.name} (${existingId})`);
        mappings[dataElement.code] = existingId;
      } else {
        // Create new data element with category combo
        const payload = {
          name: dataElement.name,
          shortName: dataElement.shortName,
          code: dataElement.code,
          valueType: dataElement.valueType,
          aggregationType: dataElement.aggregationType,
          domainType: dataElement.domainType
        };
        
        // Assign category combo for disaggregation
        if (categoryCombinationId) {
          payload.categoryCombo = { id: categoryCombinationId };
        }
        
        state = await create('dataElements', payload)(state);
        
        if (state.data?.response?.uid) {
          const newId = state.data.response.uid;
          console.log(`   ✓ Created: ${dataElement.name} (${newId})`);
          mappings[dataElement.code] = newId;
        } else {
          // Follow-up GET by code to resolve ID even if UID not returned in response
          state = await get('dataElements', { filter: `code:eq:${dataElement.code}`, fields: 'id', paging: false })(state);
          if (state.data.dataElements && state.data.dataElements.length > 0) {
            const resolvedId = state.data.dataElements[0].id;
            console.log(`   ↩︎ Resolved created ${dataElement.name} to id ${resolvedId}`);
            mappings[dataElement.code] = resolvedId;
          } else {
            console.log(`   ⚠️ Warning: Could not create ${dataElement.name}`);
          }
        }
      }
    } catch (error) {
      console.log(`   ⚠️ Error with ${dataElement.name}: ${error.message}`);
      // Resolve-after-conflict: try GET by code again and map if found
      try {
        console.log(`   🔍 BEFORE GET: state.data keys:`, Object.keys(state.data || {}));
        state = await get(`dataElements`, { filter: `code:eq:${dataElement.code}`, fields: 'id', paging: 'false' })(state);
        console.log(`   🔍 AFTER GET: state.data keys:`, Object.keys(state.data || {}));
        console.log(`   🔍 GET response for ${dataElement.code}:`, JSON.stringify(state.data, null, 2));
        if (state.data.dataElements && state.data.dataElements.length > 0) {
          const existingId = state.data.dataElements[0].id;
          console.log(`   ↩︎ Using existing after conflict: ${dataElement.name} (${existingId})`);
          mappings[dataElement.code] = existingId;
        } else {
          console.log(`   ❌ No data elements found for code: ${dataElement.code}`);
        }
      } catch (e2) {
        console.log(`   ❌ Error resolving existing data element: ${e2.message}`);
      }
    }
  }
  
  return mappings;
}

// Lookup org unit IDs by name and build mapping { name -> id }
async function mapOrgUnitsByName(names, state) {
  const mappings = {};
  const uniqueNames = Array.from(new Set((names || []).filter(Boolean)));
  for (const name of uniqueNames) {
    try {
      await get('organisationUnits', { filter: `name:eq:${name}`, fields: 'id,name' })(state);
      if (state.data.organisationUnits && state.data.organisationUnits.length > 0) {
        mappings[name] = state.data.organisationUnits[0].id;
        continue;
      }
      // Fallback to ilike if exact didn’t match
      await get('organisationUnits', { filter: `name:ilike:${name}`, fields: 'id,name' })(state);
      if (state.data.organisationUnits && state.data.organisationUnits.length > 0) {
        mappings[name] = state.data.organisationUnits[0].id;
        continue;
      }
    } catch (e) {
      // ignore and continue
    }
  }
  // Optional: defaultOrgUnitId fallback for testing
  const defaultOrg = state.fileTypeConfig?.dhis2Config?.defaultOrgUnitId || state.config?.defaultOrgUnitId;
  if (defaultOrg) {
    uniqueNames.forEach(n => {
      if (!mappings[n]) mappings[n] = defaultOrg;
    });
  }
  return mappings;
}

// Minimal helper for stable codes
function generateCodeFromName(name) {
  return String(name || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 50);
}

// Create data set and assign data elements
async function createDataSet(dataElementMappings, categoryCombinationId, orgUnitMappings, state, fileTypeConfig) {
  try {
    // Check if data set already exists
    const dataSetCode = fileTypeConfig?.dhis2Config?.dataSetCode || 'MALAWI_ART_DATASET';
    await get(`dataSets`, {
      filter: `code:eq:${dataSetCode}`,
      fields: 'id',
      paging: 'false'
    })(state);
    
    if (state.data.dataSets && state.data.dataSets.length > 0) {
      const existingId = state.data.dataSets[0].id;
      console.log(`   ✓ Found existing data set: ${existingId}`);

      // Fetch full dataset and merge elements + org units, then update (PUT)
      state = await get(`dataSets/${existingId}`, {
        fields: 'id,name,shortName,code,periodType,categoryCombo[id],dataSetElements[dataElement[id]],organisationUnits[id]'
      })(state);
      const ds = state.data || {};

      const existingDEIds = new Set((ds.dataSetElements || []).map(dse => (dse?.dataElement?.id || dse?.dataElement)));
      const incomingDEIds = new Set(
        Object.values(dataElementMappings)
          .filter(id => id && id !== 'UNKNOWN_DATA_ELEMENT' && String(id).length === 11)
      );
      for (const id of incomingDEIds) existingDEIds.add(id);
      const mergedDEs = Array.from(existingDEIds).map(id => ({ dataElement: { id } }));

      const existingOUIds = new Set((ds.organisationUnits || []).map(ou => ou.id));
      const incomingOUIds = new Set(
        Object.values(orgUnitMappings)
          .filter(id => id && id !== 'UNKNOWN_ORG_UNIT' && String(id).length === 11)
      );
      for (const id of incomingOUIds) existingOUIds.add(id);
      const mergedOUs = Array.from(existingOUIds).map(id => ({ id }));

      const payload = {
        name: fileTypeConfig?.dhis2Config?.dataSetName || ds.name || 'Malawi ART Data Set',
        shortName: fileTypeConfig?.dhis2Config?.dataSetShortName || ds.shortName || 'ART Data Set',
        code: ds.code || dataSetCode,
        periodType: fileTypeConfig?.dhis2Config?.periodType || ds.periodType || 'Quarterly',
        categoryCombo: (ds.categoryCombo?.id
          ? { id: ds.categoryCombo.id }
          : (categoryCombinationId ? { id: categoryCombinationId } : undefined)),
        dataSetElements: mergedDEs,
        organisationUnits: mergedOUs,
      };
      if (!payload.categoryCombo) delete payload.categoryCombo;

      state = await update('dataSets', existingId, payload)(state);
      console.log(`   ✓ Ensured data set '${existingId}' has ${mergedDEs.length} elements and ${mergedOUs.length} org units`);
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
    
    state = await create('dataSets', payload)(state);

    let newId = state.data?.response?.uid;
    if (state.response && state.response.headers && state.response.headers.location && !newId) {
      const loc = String(state.response.headers.location);
      const match = loc.match(/[A-Za-z0-9]{11}/);
      if (match) newId = match[0];
    }

    if (newId) {
      const orgUnitCount = Object.values(orgUnitMappings)
        .filter(id => id && id !== 'UNKNOWN_ORG_UNIT' && id.length === 11).length;
      console.log(`   ✓ Created data set: ${newId}`);
      console.log(`   ✓ Assigned ${dataElementIds.length} data elements to data set`);
      console.log(`   ✓ Assigned data set to ${orgUnitCount} organization units`);
      // Persist mapping immediately
      state.data = { ...(state.data || {}), dhis2Mappings: { ...(state.data?.dhis2Mappings || {}), dataSetId: newId } };
      return newId;
    } else {
      // Follow-up GET by code to resolve ID even if UID not returned
      const dataSetCode = fileTypeConfig?.dhis2Config?.dataSetCode || 'MALAWI_ART_DATASET';
      state = await get('dataSets', { filter: `code:eq:${dataSetCode}`, fields: 'id', paging: 'false' })(state);
      if (state.data.dataSets && state.data.dataSets.length > 0) {
        const resolvedId = state.data.dataSets[0].id;
        console.log(`   ↩︎ Resolved created data set to id ${resolvedId}`);
        state.data = { ...(state.data || {}), dhis2Mappings: { ...(state.data?.dhis2Mappings || {}), dataSetId: resolvedId } };
        return resolvedId;
      }
      console.log(`   ⚠️ Warning: Could not create data set`);
      return null;
    }
  } catch (error) {
    if (String(error?.message || '').includes('409')) {
      console.log(`   ℹ️ Data set already exists (409). Resolving existing by code...`);
    } else {
      console.log(`   ⚠️ Error creating data set: ${error.message}`);
    }
    // Resolve-after-conflict: try GET by code and return id if exists
    try {
      const dataSetCode = fileTypeConfig?.dhis2Config?.dataSetCode || 'MALAWI_ART_DATASET';
      state = await get(`dataSets`, { filter: `code:eq:${dataSetCode}`, fields: 'id', paging: 'false' })(state);
      if (state.data.dataSets && state.data.dataSets.length > 0) {
        const existingId = state.data.dataSets[0].id;
        console.log(`   ✓ Using existing data set: ${existingId}`);

        // Same merge+update path as above to ensure configuration is correct
        state = await get(`dataSets/${existingId}`, {
          fields: 'id,name,shortName,code,periodType,categoryCombo[id],dataSetElements[dataElement[id]],organisationUnits[id]'
        })(state);
        const ds = state.data || {};

        const existingDEIds = new Set((ds.dataSetElements || []).map(dse => (dse?.dataElement?.id || dse?.dataElement)));
        const incomingDEIds = new Set(
          Object.values(dataElementMappings)
            .filter(id => id && id !== 'UNKNOWN_DATA_ELEMENT' && String(id).length === 11)
        );
        for (const id of incomingDEIds) existingDEIds.add(id);
        const mergedDEs = Array.from(existingDEIds).map(id => ({ dataElement: { id } }));

        const existingOUIds = new Set((ds.organisationUnits || []).map(ou => ou.id));
        const incomingOUIds = new Set(
          Object.values(orgUnitMappings)
            .filter(id => id && id !== 'UNKNOWN_ORG_UNIT' && String(id).length === 11)
        );
        for (const id of incomingOUIds) existingOUIds.add(id);
        const mergedOUs = Array.from(existingOUIds).map(id => ({ id }));

        const payload = {
          name: fileTypeConfig?.dhis2Config?.dataSetName || ds.name || 'Malawi ART Data Set',
          shortName: fileTypeConfig?.dhis2Config?.dataSetShortName || ds.shortName || 'ART Data Set',
          code: ds.code || dataSetCode,
          periodType: fileTypeConfig?.dhis2Config?.periodType || ds.periodType || 'Quarterly',
          categoryCombo: (ds.categoryCombo?.id
            ? { id: ds.categoryCombo.id }
            : (categoryCombinationId ? { id: categoryCombinationId } : undefined)),
          dataSetElements: mergedDEs,
          organisationUnits: mergedOUs,
        };
        if (!payload.categoryCombo) delete payload.categoryCombo;

        state = await update('dataSets', existingId, payload)(state);
        console.log(`   ✓ Ensured data set '${existingId}' has ${mergedDEs.length} elements and ${mergedOUs.length} org units`);
        return existingId;
      }
    } catch (e2) {
      // ignore
    }
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