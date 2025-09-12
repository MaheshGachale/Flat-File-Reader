# TODO: Convert VS Code Extension Backend to Node.js

- [x] Update src/extension.ts to remove PythonResolver and use loadFileData/exportData from fileLoader.ts
- [x] Remove python/reader.py file
- [x] Build and test the extension (Note: Build requires Node 20 due to DuckDB prebuilt binaries)
- [x] Verify no Python dependency and functionality works (Backend converted to Node.js using DuckDB + exceljs)
- [x] Add Reset button to reset query to 'select * from data' and load all data
