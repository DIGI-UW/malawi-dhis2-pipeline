#!/usr/bin/env node

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

console.log('Excel File Analysis Script');
console.log('==========================');

const dataDir = path.join(__dirname, 'data');
const excelFiles = [
    'DHIS2_HIV Indicators.xlsx',
    'Direct Queries - Q1 2025 MoH Reports.xlsx',
    'Q2FY25_DQ_253_sites.xlsx'
];

async function analyzeExcelFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            console.log(`❌ File not found: ${filePath}`);
            return;
        }

        console.log(`\n📊 Analyzing: ${path.basename(filePath)}`);
        console.log('=' + '='.repeat(path.basename(filePath).length + 12));
        
        const stats = fs.statSync(filePath);
        console.log(`File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
        
        const workbook = XLSX.readFile(filePath);
        console.log(`Sheets: ${workbook.SheetNames.length}`);
        
        workbook.SheetNames.forEach((sheetName, index) => {
            console.log(`\n📋 Sheet ${index + 1}: "${sheetName}"`);
            const worksheet = workbook.Sheets[sheetName];
            const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:A1');
            
            console.log(`  Range: ${worksheet['!ref'] || 'Empty'}`);
            console.log(`  Rows: ${range.e.r + 1}`);
            console.log(`  Columns: ${range.e.c + 1}`);
            
            // Get first few rows to understand structure
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
                header: 1, 
                range: 0,
                blankrows: false 
            });
            
            if (jsonData.length > 0) {
                console.log(`  First row (headers):`);
                const firstRow = jsonData[0] || [];
                firstRow.forEach((cell, colIndex) => {
                    if (cell && cell.toString().trim()) {
                        console.log(`    Col ${colIndex + 1}: "${cell}"`);
                    }
                });
                
                // Show sample data from second row
                if (jsonData.length > 1) {
                    console.log(`  Sample data (row 2):`);
                    const secondRow = jsonData[1] || [];
                    secondRow.forEach((cell, colIndex) => {
                        if (cell && cell.toString().trim()) {
                            console.log(`    Col ${colIndex + 1}: "${cell}"`);
                        }
                    });
                }
                
                // Count non-empty rows
                const nonEmptyRows = jsonData.filter(row => 
                    row && row.some(cell => cell && cell.toString().trim())
                ).length;
                console.log(`  Non-empty rows: ${nonEmptyRows}`);
            }
        });
        
    } catch (error) {
        console.error(`❌ Error analyzing ${filePath}:`, error.message);
    }
}

async function main() {
    console.log(`Data directory: ${dataDir}`);
    
    if (!fs.existsSync(dataDir)) {
        console.log(`❌ Data directory not found: ${dataDir}`);
        return;
    }
    
    console.log(`\nFiles in data directory:`);
    const files = fs.readdirSync(dataDir);
    files.forEach(file => {
        const fullPath = path.join(dataDir, file);
        const stats = fs.statSync(fullPath);
        console.log(`  ${file} (${(stats.size / 1024).toFixed(1)} KB)`);
    });
    
    for (const fileName of excelFiles) {
        const filePath = path.join(dataDir, fileName);
        await analyzeExcelFile(filePath);
    }
    
    console.log('\n✅ Analysis complete!');
}

main().catch(console.error);
