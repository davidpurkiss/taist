# Contributing to Taist

Thank you for your interest in contributing to Taist! This document provides guidelines for contributing to the project.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/taist.git
   cd taist
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```

## Development Workflow

### Running Tests

```bash
# Run all tests
npm test

# Run with Taist
npm run test:ai

# Run in watch mode
npm run test:watch

# Run with tracing
npm run test:trace

# Run demo
npm run demo
```

### Project Structure

```
taist/
├── lib/              # Core library components
│   ├── toon-formatter.js
│   ├── output-formatter.js
│   ├── execution-tracer.js
│   ├── vitest-runner.js
│   └── watch-handler.js
├── examples/         # Example code and tests
├── taist.js         # CLI entry point
└── index.js         # Programmatic API
```

## Coding Standards

### Style Guide

- Use ES6+ module syntax (`import/export`)
- Use 2 spaces for indentation
- Add JSDoc comments for all public functions
- Keep functions focused and small
- Use descriptive variable names

### Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `test:` Test additions or changes
- `refactor:` Code refactoring
- `perf:` Performance improvements
- `chore:` Maintenance tasks

Example:
```
feat: add support for custom abbreviation dictionaries

Add ability to define custom abbreviations in .taistrc.json
to support domain-specific terminology reduction.
```

## Making Changes

### Adding New Features

1. Create a feature branch:
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. Make your changes and add tests

3. Test your changes:
   ```bash
   npm test
   npm run test:ai
   ```

4. Commit your changes:
   ```bash
   git commit -m "feat: add your feature description"
   ```

5. Push to your fork:
   ```bash
   git push origin feat/your-feature-name
   ```

6. Create a Pull Request on GitHub

### Fixing Bugs

1. Create a bugfix branch:
   ```bash
   git checkout -b fix/bug-description
   ```

2. Add a test that reproduces the bug

3. Fix the bug

4. Verify the test passes

5. Commit and push as above

## Pull Request Guidelines

- **Title**: Use a clear, descriptive title
- **Description**: Explain what changes you made and why
- **Tests**: Include tests for new features or bug fixes
- **Documentation**: Update README.md if needed
- **Single Purpose**: One PR should address one issue/feature

## Testing Guidelines

### Writing Tests

- Use Vitest for all tests
- Place tests in the same directory as the code they test
- Use descriptive test names
- Test edge cases and error conditions

Example:
```javascript
import { describe, it, expect } from 'vitest';
import { ToonFormatter } from './toon-formatter.js';

describe('ToonFormatter', () => {
  it('should format passing tests correctly', () => {
    const formatter = new ToonFormatter();
    const result = formatter.format({
      stats: { passed: 5, total: 5 }
    });
    expect(result).toContain('===TESTS: 5/5===');
  });
});
```

## Feature Requests

Have an idea for a new feature? Great! Please:

1. Check if it's already been suggested in [Issues](https://github.com/davidpurkiss/taist/issues)
2. If not, create a new issue with:
   - Clear description of the feature
   - Use cases and examples
   - Why it would be valuable

## Bug Reports

Found a bug? Please create an issue with:

- **Description**: What happened vs. what you expected
- **Steps to Reproduce**: Detailed steps to reproduce the bug
- **Environment**: Node.js version, OS, etc.
- **Code Sample**: Minimal code that demonstrates the issue
- **Stack Trace**: If applicable

## Code Review Process

- All submissions require review
- Maintainers will review PRs as soon as possible
- Address review feedback by pushing new commits
- Once approved, a maintainer will merge your PR

## License

By contributing to Taist, you agree that your contributions will be licensed under the MIT License.

## Questions?

Feel free to:
- Open an issue for questions
- Start a discussion in GitHub Discussions
- Reach out to the maintainers

Thank you for contributing! 🎉
