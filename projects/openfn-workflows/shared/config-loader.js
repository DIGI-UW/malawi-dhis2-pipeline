/**
 * Configuration loader module
 * Loads file type configurations and metadata mappings from JSON files
 */

import fs from 'fs';
import path from 'path';

// Configuration paths
const CONFIG_BASE_PATH = process.env.CONFIG_PATH || '/implementation/packages/openfn/importer/configs';

export function loadFileTypeConfigs() {
  const configPath = path.join(CONFIG_BASE_PATH, 'file-types');
  const configs = {};
  
  try {
    const files = fs.readdirSync(configPath);
    files.forEach(file => {
      if (file.endsWith('.json')) {
        const filePath = path.join(configPath, file);
        const config = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        configs[config.fileType] = config;
      }
    });
    console.log(`Loaded ${Object.keys(configs).length} file type configurations`);
  } catch (error) {
    console.error('Error loading file type configs:', error);
    // Return empty configs if loading fails
    return {};
  }
  
  return configs;
}

export function loadMetadataMappings() {
  const metadataPath = path.join(CONFIG_BASE_PATH, 'metadata');
  const metadata = {};
  
  try {
    // Load org unit mappings
    const orgUnitPath = path.join(metadataPath, 'org_unit_mapping.json');
    if (fs.existsSync(orgUnitPath)) {
      metadata.orgUnits = JSON.parse(fs.readFileSync(orgUnitPath, 'utf8'));
    }
    
    // Load data element mappings
    const dataElementPath = path.join(metadataPath, 'data_element_mapping.json');
    if (fs.existsSync(dataElementPath)) {
      metadata.dataElements = JSON.parse(fs.readFileSync(dataElementPath, 'utf8'));
    }
    
    console.log('Loaded metadata mappings');
  } catch (error) {
    console.error('Error loading metadata mappings:', error);
  }
  
  return metadata;
}

export function matchFileToConfig(fileName, configs) {
  for (const [fileType, config] of Object.entries(configs)) {
    const patterns = config.filePatterns || [];
    const matched = patterns.some(pattern => {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'), 'i');
      return regex.test(fileName);
    });
    
    if (matched) {
      console.log(`File ${fileName} matched configuration: ${fileType}`);
      return config;
    }
  }
  
  console.warn(`No configuration found for file: ${fileName}`);
  return null;
}

export function applyColumnMappings(row, mappings, metadata) {
  const mapped = {};
  
  for (const [field, mapping] of Object.entries(mappings)) {
    const sourceColumns = mapping.sourceColumns || [];
    let value = null;
    
    // Find first matching column
    for (const col of sourceColumns) {
      if (row[col] !== undefined && row[col] !== null && row[col] !== '') {
        value = row[col];
        break;
      }
    }
    
    if (value !== null) {
      // Apply lookups if needed
      if (field === 'facility' && metadata?.orgUnits) {
        value = lookupOrgUnit(value, metadata.orgUnits);
      } else if (field === 'indicator' && metadata?.dataElements) {
        value = lookupDataElement(value, metadata.dataElements);
      }
      
      // Set nested fields
      const targetField = mapping.targetField;
      if (targetField.includes('.')) {
        setNestedValue(mapped, targetField, value);
      } else {
        mapped[targetField] = value;
      }
    } else if (mapping.required) {
      throw new Error(`Required field ${field} not found`);
    }
  }
  
  return mapped;
}

function setNestedValue(obj, path, value) {
  const parts = path.split('.');
  let current = obj;
  
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]]) {
      current[parts[i]] = {};
    }
    current = current[parts[i]];
  }
  
  current[parts[parts.length - 1]] = value;
}

function lookupOrgUnit(name, metadata) {
  const mapping = metadata.mappings?.find(m => 
    m.name.toLowerCase() === name.toLowerCase() ||
    m.alternateNames?.some(alt => alt.toLowerCase() === name.toLowerCase())
  );
  return mapping ? mapping.dhis2Id : name;
}

function lookupDataElement(indicator, metadata) {
  // Search across all indicator types
  for (const indicators of Object.values(metadata.mappings || {})) {
    if (Array.isArray(indicators)) {
      const mapping = indicators.find(m => 
        m.name.toLowerCase() === indicator.toLowerCase() ||
        m.alternateNames?.some(alt => alt.toLowerCase() === indicator.toLowerCase())
      );
      if (mapping) return mapping.dhis2Id;
    }
  }
  return indicator;
} 