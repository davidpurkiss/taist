# Publishing Guide

This guide is for maintainers who publish Taist to npm.

## Prerequisites

1. **npm account**: Create one at [npmjs.com](https://www.npmjs.com/)
2. **npm login**: Authenticate locally
   ```bash
   npm login
   ```
3. **Repository access**: Push access to the GitHub repository

## Pre-publish Checklist

Before publishing a new version:

- [ ] All tests pass: `npm test`
- [ ] Examples work: `npm run demo`
- [ ] CHANGELOG.md is updated
- [ ] Version number is bumped in package.json
- [ ] README.md is up to date
- [ ] No uncommitted changes: `git status`
- [ ] On the correct branch (usually `main` or `master`)

## Version Bumping

Use npm's version command to bump the version:

```bash
# Patch release (1.0.0 -> 1.0.1)
npm version patch

# Minor release (1.0.0 -> 1.1.0)
npm version minor

# Major release (1.0.0 -> 2.0.0)
npm version major
```

This will:
- Update package.json
- Create a git tag
- Commit the changes

## Publishing to npm

### Dry Run (Recommended First)

Test what will be published:

```bash
npm pack --dry-run
```

This shows exactly what files will be included in the package.

### Create Package Tarball

```bash
npm pack
```

This creates a `.tgz` file you can inspect or test locally:

```bash
# Test local installation
npm install -g ./taist-1.0.0.tgz
```

### Publish to npm

```bash
npm publish
```

For scoped packages or if you want public access:

```bash
npm publish --access public
```

## Post-publish Steps

1. **Push git changes**:
   ```bash
   git push
   git push --tags
   ```

2. **Create GitHub Release**:
   - Go to GitHub releases
   - Create new release from the version tag
   - Copy relevant section from CHANGELOG.md
   - Attach the `.tgz` file

3. **Verify on npm**:
   - Visit https://www.npmjs.com/package/taist
   - Check that the new version appears
   - Test installation: `npm install -g taist`

4. **Announce**:
   - Update documentation sites
   - Announce on social media if significant release
   - Update any integration examples

## Publishing a Beta Version

For testing before official release:

```bash
# Version as beta
npm version prerelease --preid=beta

# Publish with beta tag
npm publish --tag beta
```

Users can install with:
```bash
npm install -g taist@beta
```

## Unpublishing (Emergency Only)

⚠️ **WARNING**: Unpublishing is strongly discouraged and has restrictions.

You can only unpublish within 72 hours of publishing:

```bash
npm unpublish taist@1.0.1
```

Instead of unpublishing, consider:
- Publishing a patch version with the fix
- Deprecating the version: `npm deprecate taist@1.0.1 "Use 1.0.2 instead"`

## Automated Publishing

### GitHub Actions Workflow

Create `.github/workflows/publish.yml`:

```yaml
name: Publish to npm

on:
  release:
    types: [published]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          registry-url: 'https://registry.npmjs.org'

      - run: npm ci
      - run: npm test

      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Setup:
1. Create npm access token at https://www.npmjs.com/settings/tokens
2. Add as `NPM_TOKEN` secret in GitHub repository settings
3. Create a GitHub release to trigger publishing

## Package Maintenance

### Update Dependencies

Regularly update dependencies:

```bash
# Check for outdated packages
npm outdated

# Update dependencies
npm update

# Update package.json
npx npm-check-updates -u
npm install
```

### Deprecating Old Versions

If a version has critical bugs:

```bash
npm deprecate taist@1.0.0 "Critical bug, please upgrade to 1.0.1+"
```

### Managing Distribution Tags

View current tags:
```bash
npm dist-tag ls taist
```

Add/move tags:
```bash
npm dist-tag add taist@1.0.0 latest
npm dist-tag add taist@2.0.0-beta.1 beta
```

## Troubleshooting

### "You do not have permission to publish"

- Verify npm login: `npm whoami`
- Check package name isn't taken: `npm info taist`
- Ensure you're a collaborator on the package

### "Version already published"

- You cannot republish the same version
- Bump version and try again

### "Package name too similar to existing package"

- Choose a different name
- npm prevents names that are too similar to existing packages

## Security

### Two-Factor Authentication

Enable 2FA on your npm account for security:

```bash
npm profile enable-2fa auth-and-writes
```

### Access Tokens

Use automation tokens for CI/CD:
- Create at: https://www.npmjs.com/settings/tokens
- Use "Automation" type for CI/CD
- Store securely in GitHub Secrets

## Checklist: Publishing Flow

```bash
# 1. Ensure clean state
git status

# 2. Run tests
npm test

# 3. Update CHANGELOG.md
# Edit CHANGELOG.md manually

# 4. Bump version
npm version patch  # or minor/major

# 5. Test package
npm pack
npm install -g ./taist-*.tgz
taist --version

# 6. Publish
npm publish

# 7. Push changes
git push
git push --tags

# 8. Create GitHub release
# Go to GitHub and create release from tag

# 9. Verify
npm info taist
npm install -g taist@latest
```

## Support

For questions about publishing:
- npm documentation: https://docs.npmjs.com/
- GitHub repository: https://github.com/davidpurkiss/taist
- Issues: https://github.com/davidpurkiss/taist/issues
