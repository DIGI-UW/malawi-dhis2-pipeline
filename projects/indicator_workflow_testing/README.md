# OpenFN Workflow Testing Framework

This directory contains a comprehensive automated testing suite for the OpenFN DHIS2 pipeline workflows.

## 📖 **Complete Documentation**

**👀 SEE**: [`TESTING-INDEX.md`](./TESTING-INDEX.md) - **Complete testing guide with quick start, strategy, and all documentation**

## 🚀 **Quick Start** 

```bash
# Test everything (5 min)
./run-tests.sh

# Just CLI workflows (2 min) 
./run-tests.sh --cli-workflow

# Get help
./run-tests.sh --help
```

## 🔧 **What's Working**

- **✅ SFTP Integration**: Official `@openfn/language-sftp@2.0.14` with fixed Docker builds
- **✅ Docker-Based Testing**: No local dependencies required
- **✅ 3 Active CLI Tests**: Basic connectivity, simple job, full workflow
- **✅ Excel Processing**: Multi-sheet parsing (ART data, Direct Queries, DQ Sites)
- **✅ Integration Pipeline**: SFTP → Excel → DHIS2 transformation

## 🗂️ **Project Structure**

```
projects/indicator_workflow_testing/
├── TESTING-INDEX.md              # 📖 COMPLETE DOCUMENTATION (START HERE)
├── run-tests.sh                  # 🚀 Main test runner
├── tests/
│   ├── cli/                      # ✅ 3 working CLI tests
│   ├── api/                      # API validation
│   ├── fixtures/                 # Test data and configurations
│   └── .archive/                 # Obsolete tests (archived)
├── config/                       # Test configuration
└── utils/                        # Common utilities
```

## 🎯 **Philosophy**

- **Docker-first**: Consistent environments, no local dependencies
- **Working over perfect**: Focus on tests that actually work
- **Clean organization**: Archive obsolete tests, keep active ones focused
- **Simple syntax**: Avoid complex patterns that break in CLI environments

---

**For complete documentation, troubleshooting, and all testing details, see [`TESTING-INDEX.md`](./TESTING-INDEX.md)**