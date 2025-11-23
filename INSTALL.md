# Installation Guide

## npm Installation

### Global Installation (Recommended for CLI usage)

```bash
npm install -g taist
```

After installation, the `taist` command will be available globally:

```bash
taist --version
taist test
taist watch
```

### Local Installation (For project-specific usage)

```bash
npm install --save-dev taist
```

Then use via npx or package.json scripts:

```bash
# Using npx
npx taist test

# Using package.json scripts
{
  "scripts": {
    "test:ai": "taist test --format toon"
  }
}
```

## yarn Installation

### Global

```bash
yarn global add taist
```

### Local

```bash
yarn add --dev taist
```

## Verifying Installation

After installation, verify it works:

```bash
# Check version
taist --version

# Initialize configuration
taist init

# View help
taist --help
```

## Quick Start

1. **Initialize configuration** (optional):
   ```bash
   taist init
   ```

2. **Run tests**:
   ```bash
   # Basic usage
   taist test

   # Specific test files
   taist test -t ./test/**/*.test.js

   # Different output format
   taist test --format json

   # With execution tracing
   taist trace --depth 3
   ```

3. **Watch mode** (iterative development):
   ```bash
   taist watch
   ```

## Configuration

Create a `.taistrc.json` file in your project root:

```json
{
  "format": "toon",
  "trace": {
    "enabled": false,
    "depth": 2
  },
  "watch": {
    "ignore": ["node_modules", ".git"],
    "delay": 500
  },
  "output": {
    "abbreviate": true,
    "maxTokens": 1000
  }
}
```

## Integration with Existing Projects

### With package.json

Add scripts to your `package.json`:

```json
{
  "scripts": {
    "test": "vitest",
    "test:ai": "taist test --format toon",
    "test:watch": "taist watch",
    "test:trace": "taist trace --depth 3"
  }
}
```

### With CI/CD

#### GitHub Actions

```yaml
- name: Install Taist
  run: npm install -g taist

- name: Run AI-friendly tests
  run: taist test --format compact

- name: Store results
  if: failure()
  run: taist test --format json > test-results.json
```

#### GitLab CI

```yaml
test:
  script:
    - npm install -g taist
    - taist test --format toon
```

## Programmatic API

For advanced usage, import Taist in your Node.js code:

```javascript
import { Taist } from 'taist';

const runner = new Taist({
  format: 'toon',
  trace: true,
  depth: 2
});

const results = await runner.run({
  tests: ['./test/**/*.test.js']
});

console.log(runner.format(results));
```

## Requirements

- **Node.js**: >= 18.0.0
- **npm**: >= 9.0.0 (or yarn >= 1.22.0)

## Troubleshooting

### Command not found

If `taist` command is not found after global installation:

1. Check npm global bin path:
   ```bash
   npm config get prefix
   ```

2. Ensure the bin directory is in your PATH:
   ```bash
   export PATH="$(npm config get prefix)/bin:$PATH"
   ```

3. Reinstall:
   ```bash
   npm uninstall -g taist
   npm install -g taist
   ```

### Permission errors

On Linux/Mac, you may need sudo for global installation:

```bash
sudo npm install -g taist
```

Or configure npm to use a different directory:

```bash
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH
npm install -g taist
```

### Module not found errors

Ensure all dependencies are installed:

```bash
npm install
```

## Uninstalling

### Global

```bash
npm uninstall -g taist
```

### Local

```bash
npm uninstall taist
```

## Next Steps

- Read the [README.md](./README.md) for full documentation
- Check out [examples/](./examples/) for usage examples
- See [CONTRIBUTING.md](./CONTRIBUTING.md) to contribute
- Report issues at [GitHub Issues](https://github.com/davidpurkiss/taist/issues)
