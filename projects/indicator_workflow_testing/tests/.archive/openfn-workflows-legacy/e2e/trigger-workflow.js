#!/usr/bin/env node

const https = require('https');
const http = require('http');

// Configuration
const OPENFN_URL = process.env.OPENFN_URL || 'http://localhost:4000';
const API_KEY = process.env.OPENFN_API_KEY || 'apiKey';
const WORKFLOW_NAME = process.env.WORKFLOW_NAME || 'sftp-dhis2';

async function getWorkflows() {
  const url = new URL('/api/workflows', OPENFN_URL);
  
  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    
    const req = client.get(url, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Accept': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Failed to get workflows: ${res.statusCode} - ${data}`));
        }
      });
    });
    
    req.on('error', reject);
  });
}

async function triggerWorkflow(workflowId) {
  const url = new URL('/api/runs', OPENFN_URL);
  const payload = JSON.stringify({
    workflow_id: workflowId,
    input_dataclip: {
      data: {},
      configuration: {}
    }
  });
  
  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    
    const req = client.request(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Failed to trigger workflow: ${res.statusCode} - ${data}`));
        }
      });
    });
    
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  try {
    console.log('🔍 Fetching workflows from OpenFN...');
    const workflows = await getWorkflows();
    
    const targetWorkflow = workflows.data?.find(w => 
      w.name === WORKFLOW_NAME || 
      w.name.includes('sftp')
    );
    
    if (!targetWorkflow) {
      console.error(`❌ Workflow "${WORKFLOW_NAME}" not found`);
      console.log('Available workflows:', workflows.data?.map(w => w.name));
      process.exit(1);
    }
    
    console.log(`✅ Found workflow: ${targetWorkflow.name} (ID: ${targetWorkflow.id})`);
    console.log('🚀 Triggering workflow...');
    
    const run = await triggerWorkflow(targetWorkflow.id);
    console.log(`✅ Workflow triggered! Run ID: ${run.id}`);
    console.log(`📊 Status: ${run.status}`);
    console.log(`🔗 View at: ${OPENFN_URL}/runs/${run.id}`);
    
    // Monitor the run status
    console.log('\n💡 To monitor logs:');
    console.log(`   docker logs -f $(docker ps -q -f ancestor=openfn-custom:latest) | grep -E "(SFTP|Connected|Error)"`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main(); 