# Workflow API Contract: Upload Indicator Files to DHIS2

**Version**: 1.0
**Date**: 2025-11-24
**Status**: Implemented

## Overview

This document describes the internal API contracts between workflow jobs and external system interfaces.

## Workflow State Contract

The workflow passes state between jobs. Each job expects and produces specific state properties.

### Initial State (from Trigger)

```typescript
interface TriggerState {
  configuration: {
    // SFTP credential for Jobs 0-2
    host: string;
    port: number;
    username: string;
    password: string;
  };
  data: {};
}
```

### Job 0 Output: Scan SFTP for Changes

```typescript
interface Job0Output {
  configuration: SftpCredential;
  data: {};

  // File discovery results
  hasFileToProcess: boolean;
  fileName?: string;
  filePath?: string;
  fileType?: string;

  // Configuration loaded
  config: WorkflowConfig;
  fileTypeConfig?: FileTypeConfig;

  // Persistent tracking
  filesIndex: FilesIndex;
}
```

### Job 1 Output: Check and Setup Processing

```typescript
interface Job1Output extends Job0Output {
  targetFileFound: boolean;
  noFilesToProcess?: boolean;

  // Processing parameters
  chunkSize: number;
}
```

### Job 2 Output: Parse Excel Metadata

```typescript
interface Job2Output extends Job1Output {
  metadataParsed: boolean;
  totalRows: number;
  totalChunks: number;

  data: {
    uniqueValues: {
      facilities: string[];
      indicators: string[];
      periods: string[];
      categories: Record<string, string[]>;
    };
    orgUnitParentMap: Record<string, string>;
    dhis2Structures: Dhis2Structures;
  };
}
```

### Job 3 Output: Check and Setup Metadata

```typescript
interface Job3Output extends Job2Output {
  metadataSetupComplete: boolean;

  data: {
    ...Job2Output['data'];
    dhis2Mappings: Dhis2Mappings;
  };

  filesIndex: {
    [fileName]: {
      status: 'metadata-ready';
      dhis2Mappings: Dhis2Mappings;
      lastProcessedAt: string;
    };
  };
}
```

### Job 4 Output: Process All Chunks

```typescript
interface Job4Output extends Job3Output {
  summary: {
    totalChunks: number;
    successfulChunks: number;
    failedChunks: number;
    totalRowsProcessed: number;
    totalDataValuesUploaded: number;
  };

  filesIndex: {
    [fileName]: {
      status: 'completed' | 'failed';
      lastSuccessfulChunk: number;
      lastChunkUploadedAt: string;
      summary: UploadSummary;
    };
  };
}
```

## Type Definitions

### FileTypeConfig

```typescript
interface FileTypeConfig {
  fileType: string;
  filePatterns: string[];
  periodFormat: string;
  columnMappings: {
    facility: string[];
    indicator: string[];
    value: string[];
    period: string[];
    [category: string]: string[];
  };
  categoryConfigs: {
    name: string;
    options: string[];
    optional?: boolean;
  }[];
}
```

### Dhis2Structures

```typescript
interface Dhis2Structures {
  orgUnits: {
    name: string;
    code: string;
    parent: string;
  }[];
  categories: {
    name: string;
    code: string;
    options: {
      name: string;
      code: string;
    }[];
  }[];
  dataElements: {
    name: string;
    code: string;
    categoryCombo?: string;
  }[];
}
```

### Dhis2Mappings

```typescript
interface Dhis2Mappings {
  orgUnits: Record<string, string>;      // name → DHIS2 UID
  dataElements: Record<string, string>;  // code → DHIS2 UID
  categories: Record<string, string>;    // "CategoryName/OptionName" → UID
  categoryOptionCombos: Record<string, string>; // "Option1+Option2" → UID
  dataSetId: string;
}
```

### FilesIndex

```typescript
interface FilesIndex {
  [fileName: string]: {
    status: 'pending' | 'processing' | 'metadata-ready' | 'completed' | 'failed';
    lastSuccessfulChunk?: number;
    dhis2Mappings?: Dhis2Mappings;
    lastProcessedAt?: string;
    summary?: UploadSummary;
    error?: string;
  };
}
```

## External API Contracts

### SFTP Operations (Jobs 0-2)

```typescript
// List directory
list(path: string): Promise<SftpFile[]>;

// Stream CSV content
getCSV(path: string, options?: GetCsvOptions): Promise<string[]>;

// Stream XLSX content
getExcelStream(path: string, options?: StreamOptions): Promise<Row[]>;
```

### DHIS2 Operations (Jobs 3-4)

```typescript
// Get with query
get(resourceType: string, query: object): Promise<Dhis2Response>;

// Create resource
create(resourceType: string, data: object): Promise<Dhis2Response>;

// Update resource
update(resourceType: string, id: string, data: object): Promise<Dhis2Response>;

// Bulk data upload
create('dataValueSets', {
  dataValues: DataValue[];
  importStrategy: 'CREATE_AND_UPDATE';
  skipExistingCheck: true;
}): Promise<ImportSummary>;
```

### DHIS2 Data Value Structure

```typescript
interface DataValue {
  dataElement: string;   // DHIS2 UID
  period: string;        // e.g., "202511"
  orgUnit: string;       // DHIS2 UID
  categoryOptionCombo: string;  // DHIS2 UID
  value: string;         // Numeric value as string
}
```

## Error Handling

### Job 3 Fail-Fast Errors

| Condition | Error Message | Resolution |
|-----------|---------------|------------|
| Root OU not found | "Root org unit 'Malawi' (MW) not found" | Create MW org unit in DHIS2 |
| User creation failed | "Failed to create integration user" | Check admin permissions |
| Category create failed | "Failed to create category: {name}" | Check CREATE permission |

### Job 4 Recoverable Errors

| Condition | Behavior | State Update |
|-----------|----------|--------------|
| Chunk upload fails | Log error, continue to next chunk | `lastSuccessfulChunk` not updated |
| All chunks fail | Mark file as failed | `status: 'failed'` |
| Partial success | Mark complete with summary | `status: 'completed'`, summary includes failures |
