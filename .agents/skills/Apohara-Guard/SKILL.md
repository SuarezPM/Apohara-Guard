```markdown
# Apohara-Guard Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches the core development patterns and conventions used in the Apohara-Guard TypeScript codebase. It covers file naming, import/export styles, commit conventions, and testing practices. By following these guidelines, contributors can maintain consistency and quality throughout the project.

## Coding Conventions

### File Naming
- **Pattern:** PascalCase  
  Example:  
  ```plaintext
  UserService.ts
  AuthGuard.ts
  ```

### Import Style
- **Pattern:** Relative imports  
  Example:  
  ```typescript
  import { AuthGuard } from './AuthGuard';
  import { UserService } from '../services/UserService';
  ```

### Export Style
- **Pattern:** Named exports  
  Example:  
  ```typescript
  // In AuthGuard.ts
  export function AuthGuard() { ... }

  // In UserService.ts
  export const UserService = { ... };
  ```

### Commit Messages
- **Pattern:** Conventional commits with `chore` prefix  
  Example:  
  ```
  chore: update dependencies to latest versions
  ```

## Workflows

### Creating a New Module
**Trigger:** When adding a new feature or logical component  
**Command:** `/create-module`

1. Create a new file using PascalCase (e.g., `FeatureModule.ts`).
2. Use relative imports to include dependencies.
3. Export your module using named exports.
4. Add corresponding test files following the `*.test.*` pattern.

### Updating Dependencies
**Trigger:** When dependencies need to be updated  
**Command:** `/update-deps`

1. Update the relevant package files.
2. Commit changes with a conventional commit message:
   ```
   chore: update dependencies [details]
   ```
3. Run tests to ensure stability.

### Writing Tests
**Trigger:** When adding or updating features  
**Command:** `/write-test`

1. Create a test file named after the module, following the `*.test.*` pattern (e.g., `AuthGuard.test.ts`).
2. Write tests using the project's preferred (unknown) testing framework.
3. Use relative imports to bring in the module under test.
4. Ensure all tests pass before committing.

## Testing Patterns

- **File Pattern:** Test files are named with the `*.test.*` convention, such as `UserService.test.ts`.
- **Framework:** The specific testing framework is not detected; follow existing patterns in the repo.
- **Import Style:** Use relative imports in test files.
- **Placement:** Test files are typically placed alongside or near the modules they test.

**Example:**
```typescript
// AuthGuard.test.ts
import { AuthGuard } from './AuthGuard';

describe('AuthGuard', () => {
  it('should ...', () => {
    // test implementation
  });
});
```

## Commands
| Command         | Purpose                                             |
|-----------------|-----------------------------------------------------|
| /create-module  | Scaffold a new module following conventions         |
| /update-deps    | Update dependencies and commit with proper message  |
| /write-test     | Create a test file for a module                     |
```
