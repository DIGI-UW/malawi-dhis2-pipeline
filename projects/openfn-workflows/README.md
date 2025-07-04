# OpenFN Workflows

This project contains OpenFN workflows for the Malawi DHIS2 HIV/TB Indicators Pipeline.

## 📚 Documentation

All documentation has been consolidated in the [`docs/`](docs/) directory:

1. **[Overview](docs/01-overview.md)** - Project architecture and quick start
2. **[Development Guide](docs/02-development-guide.md)** - How to create and modify workflows
3. **[Testing Strategy](docs/03-testing-strategy.md)** - Comprehensive testing approach
4. **[SFTP to DHIS2 Testing Plan](docs/04-sftp-dhis2-testing-plan.md)** - Detailed testing plan for SFTP workflow
5. **[Docker Environment](docs/05-docker-environment.md)** - Docker setup and configuration
6. **[Troubleshooting Guide](docs/06-troubleshooting.md)** - Common issues and solutions

## 🚀 Quick Start

### 1. Build Custom Docker Images

```bash
cd /home/ubuntu/code/malawi-dhis2-pipeline
./build-custom-images.sh openfn-cli-test openfn
```

### 2. Start Services

```bash
./instant package init -n sftp-storage -d
./instant package init -n dhis2-instance -d
./instant package init -n openfn -d
```

### 3. Test Workflows

```bash
cd projects/indicator_workflow_testing
./run-tests.sh --cli-workflow
```

For more testing options, see the [Testing](#-testing) section below.

## 📁 Project Structure

```
openfn-workflows/
├── docs/                  # Consolidated documentation
├── workflows/             # OpenFN workflow definitions
│   └── sftp-dhis2/       # SFTP to DHIS2 pipeline
│       ├── project.yaml  # Workflow configuration
│       └── jobs/         # Individual job scripts
├── configs/              # Configuration files
│   ├── file-types/       # Excel file type configs
│   └── metadata/         # DHIS2 metadata mappings
└── scripts/              # Deployment and validation scripts
    ├── deploy-workflow.sh    # Deploy workflows to OpenFN
    ├── validate-workflow.sh  # Validate workflow syntax
    └── list-workflows.sh     # List available workflows
```

## 🔧 Key Features

- **SFTP Integration**: Monitor and process Excel files from SFTP server
- **Multi-Format Support**: Process ART data, Direct Queries, and DQ site files
- **Configuration-Based**: Flexible JSON-based mapping configurations
- **Automated Processing**: Cron and webhook triggers for file processing
- **DHIS2 Integration**: Automatic upload to DHIS2 with data validation

## 🧪 Testing

All test scripts have been consolidated into the `indicator_workflow_testing` project for better organization:

- **Location**: `../indicator_workflow_testing/`
- **Main Runner**: `run-tests.sh`
- **Documentation**: [Testing Index](../indicator_workflow_testing/TESTING-INDEX.md)

### Available Test Options

```bash
cd ../indicator_workflow_testing

# Test everything
./run-tests.sh

# CLI workflow tests (recommended for quick validation)
./run-tests.sh --cli-workflow

# Comprehensive end-to-end test
./run-tests.sh --env-file custom.env --integration

# View all options
./run-tests.sh --help
```

### Key Test Features

- **Environment File Support**: Use `--env-file` to specify custom configurations
- **Package Metadata Integration**: Automatically reads environment variables from package metadata
- **Docker-Based Testing**: No local dependencies required
- **Comprehensive Coverage**: SFTP connectivity, Excel parsing, DHIS2 integration

## 🚀 Deployment Scripts

The `scripts/` directory now contains only deployment and operational scripts:

- **`deploy-workflow.sh`** - Deploy workflows to OpenFN Lightning instance
- **`validate-workflow.sh`** - Validate workflow configuration before deployment
- **`list-workflows.sh`** - List available workflows

## 🐛 Troubleshooting

See the [Troubleshooting Guide](docs/06-troubleshooting.md) for solutions to common issues.

## 📦 Related Projects

- **indicator_workflow_testing**: Comprehensive testing framework for all workflows
- **sftp-storage**: SFTP server with pre-loaded Excel files
- **dhis2-instance**: DHIS2 test instance
- **openfn**: OpenFN Lightning platform 