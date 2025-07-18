// Job 1: List files and find target file
// Configuration
const TARGET_FILE = 'ART_data_long_format.xlsx';

// List files and check for target file
list('/data/excel-files', null, state => {
  console.log('📁 Job 1: Checking for Excel files...');
  
  const allFiles = Array.isArray(state.data) ? state.data : [];
  const excelFiles = allFiles.filter(file => {
    const filename = typeof file === 'string' ? file : file.name;
    return filename && filename.endsWith('.xlsx');
  });
  
  console.log(`📄 Found ${excelFiles.length} Excel files`);
  
  if (excelFiles.length === 0) {
    console.log('📭 No Excel files found to process');
    return { 
      ...state, 
      noFilesToProcess: true,
      targetFileFound: false,
      data: {}
    };
  }
  
  // Find target file
  const targetFile = excelFiles.find(file => {
    const filename = typeof file === 'string' ? file : file.name;
    return filename === TARGET_FILE;
  });
  
  if (!targetFile) {
    console.log(`❌ Target file '${TARGET_FILE}' not found`);
    return { 
      ...state, 
      noFilesToProcess: true,
      targetFileFound: false,
      data: {}
    };
  }
  
  console.log(`✅ Found target file: ${TARGET_FILE}`);
  
  // Pass target file info to next job
  return { 
    ...state, 
    targetFileFound: true,
    noFilesToProcess: false,
    fileName: TARGET_FILE,
    filePath: `/data/excel-files/${TARGET_FILE}`,
    data: {
      targetFile: TARGET_FILE,
      allFiles: excelFiles
    }
  };
}); 