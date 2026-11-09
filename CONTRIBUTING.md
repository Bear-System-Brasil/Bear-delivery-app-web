# Contributing to Bear Delivery App

> **Documentação desatualizada.** Este arquivo é anterior à Sprint 5 e
> descreve coisas que mudaram (fluxo de branch, estrutura, versões). A
> documentação mantida está em [`docs/`](./docs/README.md), e as regras de
> trabalho estão no [`CLAUDE.md`](./CLAUDE.md). Em caso de conflito, valem
> esses dois.

Thank you for your interest in contributing to Bear Delivery! This document provides guidelines and best practices for contributing to the project.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Code Standards](#code-standards)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Testing](#testing)

## Getting Started

1. **Fork the repository** (if external contributor)
2. **Clone your fork** or the main repository
3. **Install dependencies**: `npm install`
4. **Create a branch**: `git checkout -b feature/your-feature-name`
5. **Make your changes**
6. **Test locally**: `npm run dev` and `npm run build`
7. **Commit and push**: Follow commit guidelines below
8. **Create a pull request**

## Development Workflow

### Branch Naming

Use descriptive branch names that indicate the type of change:

```
feature/add-restaurant-filtering
fix/cart-sync-issue
refactor/checkout-flow
docs/update-readme
chore/update-dependencies
```

### Daily Workflow

```bash
# 1. Update your main branch
git checkout main
git pull origin main

# 2. Create a feature branch
git checkout -b feature/your-feature-name

# 3. Make changes and commit frequently
git add .
git commit -m "feat: add restaurant filtering"

# 4. Keep your branch updated
git fetch origin
git rebase origin/main

# 5. Push your branch
git push origin feature/your-feature-name

# 6. Create a Pull Request on GitHub
```

## Code Standards

### TypeScript

**DO:**
- Always use TypeScript
- Define proper types/interfaces
- Use type inference where possible
- Export shared types from `@/types`

**DON'T:**
- Use `any` type (use `unknown` if needed)
- Use `@ts-ignore` without explanation
- Bypass type checking

```typescript
// Good
interface Restaurant {
  id: string
  name: string
  rating: number
}

function getRestaurant(id: string): Restaurant {
  // ...
}

// Bad
function getRestaurant(id: any): any {
  // ...
}
```

### React Components

**DO:**
- Use functional components
- Extract logic to custom hooks
- Keep components small and focused
- Use descriptive prop names
- Add JSDoc comments for complex logic

**DON'T:**
- Mix business logic with UI
- Create overly large components
- Inline complex calculations
- Forget to handle loading/error states

```typescript
// Good - Clean component with custom hook
function RestaurantCard({ restaurant }: Props) {
  const { handleClick } = useRestaurantActions()
  
  return (
    <Card onClick={() => handleClick(restaurant.id)}>
      <h3>{restaurant.name}</h3>
    </Card>
  )
}

// Bad - Business logic in component
function RestaurantCard({ restaurant }: Props) {
  const router = useRouter()
  const { addToCart } = useCart()
  
  const handleClick = () => {
    // Too much logic here...
    router.push(`/restaurant/${restaurant.id}`)
    // More logic...
  }
  
  return <Card onClick={handleClick}>...</Card>
}
```

### State Management

**When to use Zustand:**
- Client-side state that persists
- UI state shared across pages
- User preferences

**When to use TanStack Query:**
- Data from API
- Data that needs caching
- Server state

```typescript
// Good - Use the right tool
const { user } = useAuthStore() // Zustand for client state
const { data: restaurants } = useRestaurants() // TanStack Query for server state

// Bad - Using wrong tool
const [restaurants, setRestaurants] = useState([]) // Don't use useState for server data
```

### Styling

**DO:**
- Use Tailwind utility classes
- Follow mobile-first approach
- Use consistent spacing scale
- Extract repeated patterns

**DON'T:**
- Use inline styles
- Create custom CSS files (unless necessary)
- Use arbitrary values excessively

```tsx
// Good - Tailwind utilities
<button className="px-4 py-2 bg-brand-500 hover:bg-brand-600 rounded-lg transition-colors">
  Order Now
</button>

// Bad - Inline styles
<button style={{ padding: '8px 16px', backgroundColor: '#f97316' }}>
  Order Now
</button>
```

## Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/):

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation changes
- **style**: Code style changes (formatting, missing semicolons, etc.)
- **refactor**: Code refactoring
- **perf**: Performance improvements
- **test**: Adding or updating tests
- **chore**: Build process or auxiliary tool changes

### Examples

```bash
# Feature
git commit -m "feat(restaurant): add filtering by cuisine type"

# Bug fix
git commit -m "fix(cart): resolve sync issue with backend"

# Documentation
git commit -m "docs(readme): update installation instructions"

# Refactoring
git commit -m "refactor(checkout): extract payment logic to custom hook"

# Multiple changes
git commit -m "feat(orders): add real-time tracking

- Implement WebSocket connection
- Add tracking UI components
- Update order status handling"
```

### Commit Best Practices

- Keep commits atomic (one logical change per commit)
- Write clear, descriptive messages
- Use present tense ("add feature" not "added feature")
- Capitalize first letter
- No period at the end of subject line
- Limit subject line to 50 characters
- Wrap body at 72 characters

## Pull Request Process

### Before Creating PR

1. **Update your branch** with latest main
2. **Test locally** - Run `npm run dev` and `npm run build`
3. **Check for errors** - No TypeScript errors
4. **Review your changes** - Read through your diff
5. **Update documentation** if needed

### PR Title and Description

**Title Format:**
```
[Type] Brief description of changes
```

**Description Template:**
```markdown
## What does this PR do?
Brief description of the changes

## Related Issue
Closes #123

## Changes Made
- Added restaurant filtering feature
- Updated API integration
- Added tests

## Screenshots (if applicable)
[Add screenshots for UI changes]

## Checklist
- [ ] Code follows project standards
- [ ] Tests pass locally
- [ ] Documentation updated
- [ ] No console errors
- [ ] Responsive design verified
```

### Review Process

1. **Automated checks** must pass
2. **At least one approval** from team member
3. **Address review comments**
4. **Resolve merge conflicts** if any

## Testing

### Manual Testing Checklist

Before submitting PR, test:

- [ ] Feature works as expected
- [ ] No console errors or warnings
- [ ] Responsive on mobile/tablet/desktop
- [ ] Loading states work correctly
- [ ] Error handling works
- [ ] Forms validate properly
- [ ] Navigation works

### Testing New Features

When adding new features:

1. Test happy path (everything works)
2. Test edge cases (empty states, errors)
3. Test on different screen sizes
4. Test with slow network (throttle in DevTools)
5. Test authentication flows

### Browser Testing

Test on:
- Chrome (latest)
- Firefox (latest)
- Safari (if available)
- Mobile browsers

## Questions?

If you have questions:

1. Check existing documentation in `/DOCS`
2. Look for similar patterns in the codebase
3. Ask in team chat/discussion
4. Create a discussion issue on GitHub

---

Thank you for contributing!