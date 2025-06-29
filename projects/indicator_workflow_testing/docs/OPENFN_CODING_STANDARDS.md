# OpenFN Coding Standards

## 🚀 SFTP Adaptor Best Practices

### ✅ **ALWAYS USE: Simple Direct Syntax**

```javascript
// ✅ CORRECT - Works with custom adaptor @openfn/language-sftp@2.0.14-custom
list('/data/excel-files', (state) => {
  console.log('Files found:', state.data.length);
  return state;
});

// ✅ CORRECT - Direct file operations
get('/data/excel-files/report.xlsx', '/tmp/local-file.xlsx', (state) => {
  console.log('File downloaded');
  return state;
});
```

### ❌ **Don't Use: Complex Nested Functions**

```javascript
// ❌ WRONG - Causes "TypeError: fn is not a function"
list(
  (state) => {
    const directory = state.configuration?.remoteDir || '/default/';
    return directory;
  },
  (state) => { /* callback */ }
);

// ❌ WRONG - Template literals in shell-generated workflows
list(`${state.config.dir}`, (state) => { ... });
```

## 🎯 **Why This Matters**

1. **Shell Script Compatibility**: Complex nested functions get mangled during string escaping
2. **Runtime Stability**: Simple syntax avoids function resolution errors  
3. **Debugging**: Easier to read and troubleshoot
4. **Consistency**: All workflows use the same reliable pattern

## 📋 **Required Updates for All Workflows**

### **SFTP Operations**
- Use **direct string paths** instead of dynamic functions
- Keep **callbacks simple** with basic string concatenation
- Avoid **template literals** (`${}`) in CLI-generated workflows

### **Adaptor Versions**
- Always use: `@openfn/language-sftp@2.0.14-custom`
- Never use: `@openfn/language-sftp@1.0.0` or `@latest` (broken npm versions)

### **State Structure**  
- Always use proper nested configuration:
```json
{
  "data": [],
  "configuration": {
    "host": "172.17.0.1",
    "port": 2225,
    "username": "openfn", 
    "password": "instant101"
  }
}
```

## 🧪 **Testing Requirements**

1. **CLI Testing**: Use `-s` flag for state
2. **Project Structure**: Always use proper `openfn.json` + workflow directories
3. **Docker Image**: Use `openfn-cli-test:latest` with pre-installed custom adaptor

## 📝 **Code Review Checklist**

- [ ] Uses simple direct syntax for SFTP operations
- [ ] No nested arrow functions for paths
- [ ] No template literals in expressions
- [ ] Correct adaptor version specified
- [ ] Proper state structure in test inputs
- [ ] CLI tests use `-s` flag for state 