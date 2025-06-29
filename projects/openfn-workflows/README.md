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
├── scripts/              # Utility scripts
└── docker/               # Docker configurations
```

## 🔧 Key Features

- **SFTP Integration**: Monitor and process Excel files from SFTP server
- **Multi-Format Support**: Process ART data, Direct Queries, and DQ site files
- **Configuration-Based**: Flexible JSON-based mapping configurations
- **Automated Processing**: Cron and webhook triggers for file processing
- **DHIS2 Integration**: Automatic upload to DHIS2 with data validation

## 🧪 Testing

For comprehensive testing information, see:
- [Testing Strategy](docs/03-testing-strategy.md) - Overall testing approach
- [SFTP Testing Plan](docs/04-sftp-dhis2-testing-plan.md) - Specific workflow testing
- [Testing Index](../indicator_workflow_testing/TESTING-INDEX.md) - Complete testing framework

## 🐛 Troubleshooting

See the [Troubleshooting Guide](docs/06-troubleshooting.md) for solutions to common issues.

## 📦 Related Projects

- **indicator_workflow_testing**: Testing framework and utilities
- **sftp-storage**: SFTP server with pre-loaded Excel files
- **dhis2-instance**: DHIS2 test instance
- **openfn**: OpenFN Lightning platform 