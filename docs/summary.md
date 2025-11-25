Project Overview
The Malawi DHIS2 Pipeline is a configuration-driven data integration solution that automates the import of HIV/TB health indicators from Excel/CSV files into DHIS2. It is built on OpenFN (workflow automation) and Instant OpenHIE v2, deployed via Docker Swarm with SFTP-based file monitoring. The repository at https://github.com/DIGI-UW/malawi-dhis2-pipeline contains all source code, configurations, and documentation.


Current Status
Technical development is complete. GHII successfully deployed the pipeline on their own servers. GHII is now encountering issues deploying to the Malawi government's live DHIS2 instance. The likely root cause is OpenFN credential configuration needing to target the correct government DHIS2 server URL and credentials.
Outstanding Asks

Key Technical Guidance for GHII
The deployment requires three configuration steps. First, OpenFN credentials must be updated in the web UI to point to the government DHIS2 server URL with valid service account credentials. Second, the service account must have data import permissions on the target organizational units. Third, the DHIS2 metadata (data elements, org units, category option combos) must align with the pipeline's configured mappings defined inline in `FILE_TYPE_CONFIGS` within `projects/openfn-workflows/workflows/upload-indicator-files-to-dhis2/jobs/00-scan-sftp-for-changes.js`.
Reference Documentation
The project repository documentation is at https://github.com/DIGI-UW/malawi-dhis2-pipeline (see docs/ directory). OpenFN platform documentation is at https://docs.openfn.org/. DHIS2 documentation is at https://docs.dhis2.org/.
Resolution Path
The deliverable is functionally complete per contract scope. Remaining work involves packaging documentation into a final report and providing voluntary technical support to help GHII resolve the government instance deployment. A troubleshooting call with GHII's technical implementer has been offered.``