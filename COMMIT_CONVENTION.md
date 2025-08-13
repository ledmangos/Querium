# Commit Message Convention

This project follows [Conventional Commits](https://www.conventionalcommits.org/) for semantic versioning.

## Format
```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

## Types
- `feat`: A new feature (triggers minor version bump)
- `fix`: A bug fix (triggers patch version bump)
- `docs`: Documentation only changes
- `style`: Changes that do not affect the meaning of the code
- `refactor`: A code change that neither fixes a bug nor adds a feature
- `perf`: A code change that improves performance
- `test`: Adding missing tests or correcting existing tests
- `chore`: Changes to the build process or auxiliary tools

## Examples
```bash
# Feature (minor version)
git commit -m "feat: add new range index functionality"

# Bug fix (patch version)
git commit -m "fix: resolve range query boundary issue"

# Breaking change (major version)
git commit -m "feat!: change index API to use builder pattern

BREAKING CHANGE: Index definition now requires builder pattern"
```

## Breaking Changes
Use `!` after type and `BREAKING CHANGE:` in body for major version bumps.
