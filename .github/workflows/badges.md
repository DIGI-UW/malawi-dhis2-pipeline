# GitHub Actions Status Badges

Add these badges to your main README.md to show CI status:

## Markdown Badge Code

```markdown
[![Environment Setup](https://github.com/YOUR_ORG/malawi-dhis2-pipeline/actions/workflows/ci-environment.yml/badge.svg)](https://github.com/YOUR_ORG/malawi-dhis2-pipeline/actions/workflows/ci-environment.yml)
[![Workflow Tests](https://github.com/YOUR_ORG/malawi-dhis2-pipeline/actions/workflows/ci-workflow-tests.yml/badge.svg)](https://github.com/YOUR_ORG/malawi-dhis2-pipeline/actions/workflows/ci-workflow-tests.yml)
```

## HTML Badge Code (for more control)

```html
<p align="center">
  <a href="https://github.com/YOUR_ORG/malawi-dhis2-pipeline/actions/workflows/ci-environment.yml">
    <img src="https://github.com/YOUR_ORG/malawi-dhis2-pipeline/actions/workflows/ci-environment.yml/badge.svg" alt="Environment Setup">
  </a>
  <a href="https://github.com/YOUR_ORG/malawi-dhis2-pipeline/actions/workflows/ci-workflow-tests.yml">
    <img src="https://github.com/YOUR_ORG/malawi-dhis2-pipeline/actions/workflows/ci-workflow-tests.yml/badge.svg" alt="Workflow Tests">
  </a>
</p>
```

## Branch-Specific Badges

To show status for specific branches:

```markdown
[![Environment Setup](https://github.com/YOUR_ORG/malawi-dhis2-pipeline/actions/workflows/ci-environment.yml/badge.svg?branch=main)](https://github.com/YOUR_ORG/malawi-dhis2-pipeline/actions/workflows/ci-environment.yml)
[![Workflow Tests](https://github.com/YOUR_ORG/malawi-dhis2-pipeline/actions/workflows/ci-workflow-tests.yml/badge.svg?branch=develop)](https://github.com/YOUR_ORG/malawi-dhis2-pipeline/actions/workflows/ci-workflow-tests.yml)
```

## Custom Badge Labels

You can also use shields.io for custom badges:

```markdown
![Tests](https://img.shields.io/github/actions/workflow/status/YOUR_ORG/malawi-dhis2-pipeline/ci-workflow-tests.yml?label=Tests&logo=github)
![Environment](https://img.shields.io/github/actions/workflow/status/YOUR_ORG/malawi-dhis2-pipeline/ci-environment.yml?label=Environment&logo=docker)
```

**Note**: Replace `YOUR_ORG` with your actual GitHub organization or username. 