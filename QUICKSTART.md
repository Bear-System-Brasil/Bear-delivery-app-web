# Quick Start Guide

> **Documentação desatualizada.** Este arquivo é anterior à Sprint 5 e
> descreve coisas que mudaram (fluxo de branch, estrutura, versões). A
> documentação mantida está em [`docs/`](./docs/README.md), e as regras de
> trabalho estão no [`CLAUDE.md`](./CLAUDE.md). Em caso de conflito, valem
> esses dois.

Get up and running with Bear Delivery in 5 minutes!

## Prerequisites Check

```bash
# Check Node.js version (need 18+)
node --version

# Check npm version
npm --version
```

## Installation (3 steps)

### 1. Clone & Install

```bash
git clone <repository-url>
cd like-delivery-app
npm install
```

### 2. Configure Environment

```bash
# Copy environment template
cp .env.example .env.local

# Edit .env.local (use your favorite editor)
# Make sure NEXT_PUBLIC_API_URL is set correctly
```

Your `.env.local` should look like:
```env
NEXT_PUBLIC_API_URL=https://bearsystem.tech
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## First Time Setup Checklist

- [ ] Repository cloned
- [ ] Dependencies installed
- [ ] `.env.local` configured
- [ ] Dev server running
- [ ] App opens in browser
- [ ] Can see restaurant listings

## Test User Accounts

Use these accounts to test different features:

**Customer Account:**
```
Email: customer@test.com
Password: Test@123
```

**Restaurant Admin:**
```
Email: restaurant@test.com
Password: Test@123
```

## Common Issues & Solutions

### Port Already in Use

If port 3000 is already in use:
```bash
# Use different port
PORT=3001 npm run dev
```

### Dependencies Not Installing

```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm cache clean --force
npm install
```

### Build Fails

```bash
# Check for TypeScript errors
npm run build

# Usually can be fixed by:
# 1. Make sure all dependencies installed
# 2. Check environment variables
# 3. Clear .next folder
rm -rf .next
npm run dev
```

### API Connection Issues

1. Check `.env.local` has correct `NEXT_PUBLIC_API_URL`
2. Verify backend is running (try accessing URL in browser)
3. Check console for CORS errors
4. Clear browser cache and localStorage

## Next Steps

Once you're up and running:

1. **Read the [README](./README.md)** for full documentation
2. **Explore the code** in `src/app` to understand page structure
3. **Check [CONTRIBUTING.md](./CONTRIBUTING.md)** for development guidelines
4. **Browse `/DOCS`** for detailed technical documentation

## Project Structure Quick Reference

```
src/
├── app/          # Pages (Next.js App Router)
├── components/   # React components
├── hooks/        # Custom hooks
├── stores/       # Zustand state management
├── services/     # API integration
└── utils/        # Utility functions
```

## Essential Commands

```bash
# Development
npm run dev          # Start dev server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run linter

# Useful during development
rm -rf .next         # Clear Next.js cache
rm -rf node_modules  # Remove dependencies
```

## Development Workflow

```bash
# 1. Create feature branch
git checkout -b feature/your-feature

# 2. Make changes and test
npm run dev

# 3. Build to check for errors
npm run build

# 4. Commit and push
git add .
git commit -m "feat: your feature description"
git push origin feature/your-feature

# 5. Create Pull Request
```

## Helpful Tips

### Hot Reload

Next.js has automatic hot reload - just save files and see changes instantly!

### DevTools

- **React DevTools** - Inspect component tree
- **TanStack Query DevTools** - See cached data (auto-included in dev)
- **Browser DevTools** - Check localStorage for auth state

### VS Code Extensions (Recommended)

- ES7+ React/Redux/React-Native snippets
- Tailwind CSS IntelliSense
- TypeScript Import Sorter
- Error Lens
- Prettier

### Keyboard Shortcuts

```
Ctrl/Cmd + K → Clear terminal
Ctrl/Cmd + C → Stop dev server
F12 → Open browser DevTools
```

## Need Help?

- Check [README.md](./README.md) for detailed docs
- Ask in team chat
- Found a bug? Create an issue
- Browse `/DOCS` folder

Happy coding!
