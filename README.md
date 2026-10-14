# Bear Delivery App

> A modern, full-featured food delivery platform built with Next.js 15 and React 19

[![Next.js](https://img.shields.io/badge/Next.js-15.1.11-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19.2-61dafb?style=flat-square&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-4.1-38bdf8?style=flat-square&logo=tailwind-css)](https://tailwindcss.com)

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Architecture](#architecture)
- [Development Guide](#development-guide)
- [Deployment](#deployment)
- [Contributing](#contributing)

## Overview

Bear Delivery is a comprehensive food delivery platform that connects customers with restaurants. The application provides a seamless experience for browsing restaurants, managing orders, and tracking deliveries in real-time.

**Key Roles** (enforced via `middleware.ts` route protection):
- **client** - Browse restaurants, place orders, track deliveries
- **owner / admin / manager** - Manage menus, categories, orders, team and business profile
- **cook** - Kitchen Display System (accepts/prepares/finishes orders)
- **financial** - Financial dashboard, cash register, payments and customer management
- **delivery** - Delivery dashboard (accept/track deliveries, availability toggle)

## Features

### Customer Features
- Advanced restaurant search with filters
- Real-time shopping cart with backend sync
- Product customization (variations, add-ons with per-item quantity, notes)
- Multiple delivery addresses management (OpenStreetMap/Nominatim geocoding and map pin)
- Multiple payment methods (Pix, credit/debit card online, cash or card on delivery)
- Real-time order tracking with live status updates
- Restaurant favorites
- Profile management with photo upload
- In-app notification bell (order status, delivery updates)

### Restaurant / Management Features
- Complete menu management (products, variations, add-ons)
- Category management
- Order management dashboard with observations for dishes and delivery
- **Kitchen Display System (KDS)** - real-time order queue for the kitchen (accept, prepare, finish) with sound alerts
- **Financial management** - dashboard, cash register (open/close, movements), payments overview, company orders and customer list
- **Team management** - manage staff accounts and roles (owner, admin, manager, cook, financial, delivery)
- **Delivery dashboard** - dedicated view for delivery drivers to accept and track deliveries
- Business profile customization
- Logo and cover photo uploads

### Technical Features
- Modern, responsive UI with glass-morphism design
- Dark mode support (infrastructure ready)
- Role-based route protection via Next.js middleware (`src/middleware.ts`)
- Real-time updates via WebSockets (Socket.IO) for kitchen orders, deliveries and notifications
- Optimistic UI updates
- Mobile-first approach
- Progressive rendering for performance
- Secure authentication with JWT
- Efficient state management

## Tech Stack

### Core
- **Framework:** Next.js 15.1.11 (App Router)
- **React:** 19.2.0
- **TypeScript:** 5.x
- **Styling:** Tailwind CSS 4.1.17

### State Management
- **Zustand** 5.0.8 - Global state with persistence
- **TanStack Query** 5.90.7 - Server state & caching

### UI Components
- **Radix UI** - Accessible component primitives
- **Lucide React** - Icon system
- **Sonner** - Toast notifications
- **React Hook Form** - Form handling
- **Recharts** - Charts for the financial dashboard
- **Embla Carousel** - Carousels
- **cmdk / vaul** - Command palette and drawer primitives

### Real-time & External Services
- **Socket.IO Client** - Real-time updates (kitchen orders, deliveries, notifications)
- **Leaflet / react-leaflet** - Maps with OpenStreetMap tiles (no API key)
- **Nominatim (OpenStreetMap)** - Address geocoding

### Utilities
- **date-fns / dayjs / react-day-picker** - Date manipulation and pickers
- **zod** - Schema validation
- **clsx/tailwind-merge** - CSS utilities

### Development
- **ESLint** - Code linting
- **TypeScript** - Type safety
- **Vercel Analytics** - Performance monitoring

## Getting Started

### Prerequisites

- Node.js 18+ or 20+
- npm or yarn or pnpm
- Git

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd like-delivery-app
```

2. **Install dependencies**
```bash
npm install
# or
yarn install
# or
pnpm install
```

3. **Set up environment variables**
```bash
cp .env.example .env.local
```

Edit `.env.local` and add your configuration:
```env
NEXT_PUBLIC_API_URL=https://bearsystem.tech
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

4. **Run the development server**
```bash
npm run dev
```

5. **Open your browser**
Navigate to [http://localhost:3000](http://localhost:3000)

### Build for Production

```bash
npm run build
npm start
```

## Project Structure

```
like-delivery-app/
├── src/
│   ├── middleware.ts             # Role-based route protection
│   ├── app/                      # Next.js App Router pages
│   │   ├── (home)/               # Home page (route group)
│   │   ├── layout.tsx            # Root layout
│   │   ├── cart/                 # Cart page
│   │   ├── checkout/             # Checkout flow
│   │   ├── orders/               # Order history (client)
│   │   ├── order-status/         # Order status tracking page
│   │   ├── profile/              # User profile
│   │   ├── restaurant/[id]/      # Restaurant detail
│   │   ├── restaurant-landing-page/ # Public restaurant landing page
│   │   ├── restaurant-register/  # Restaurant self-registration
│   │   ├── menu-management/      # Management: Menu management
│   │   ├── category-management/  # Management: Category management
│   │   ├── kitchen/               # Cook: Kitchen Display System (KDS)
│   │   ├── financial-management/ # Financial: dashboard, cash-register, finance, orders, customers, settings
│   │   ├── team-management/      # Management: staff & roles
│   │   ├── delivery-dashboard/   # Delivery: driver dashboard
│   │   ├── company-profile/      # Management: Business profile
│   │   └── unauthorized/         # Access denied page
│   │
│   ├── components/               # React components
│   │   ├── ui/                   # Base UI components (shadcn/ui)
│   │   ├── auth-modal/           # Authentication modal
│   │   ├── checkout/             # Checkout steps (delivery, payment, review)
│   │   ├── customize-order/      # Product variations/add-ons customization
│   │   ├── kitchen/              # Kitchen Display System components
│   │   ├── financial-dashboard/  # Financial dashboard widgets
│   │   ├── order-detail-sheet/   # Order detail side sheet
│   │   ├── delivery/             # Delivery list/tracking components
│   │   ├── notifications/        # Notification bell/panel
│   │   ├── sidebar-menu-management/ # Admin sidebar navigation
│   │   ├── protected-route/      # Client-side role guard
│   │   ├── footer/                # Footer component
│   │   ├── main-header/          # Header component
│   │   ├── restaurant-info/      # Restaurant info card
│   │   └── ...                   # Other feature components
│   │
│   ├── hooks/                     # Custom React hooks
│   │   ├── use-cart-actions.ts   # Cart management
│   │   ├── use-restaurants.ts    # Restaurant data
│   │   ├── use-kitchen-orders.ts # KDS real-time order queue
│   │   ├── use-financial-dashboard.ts # Financial dashboard data
│   │   ├── use-cash-register.ts / use-cash-movement.ts # Cash register
│   │   ├── use-delivery-driver.ts # Delivery dashboard logic
│   │   ├── use-team-management.ts # Team/staff management
│   │   ├── use-notifications.ts  # Notification bell feed
│   │   └── ...                   # Other hooks
│   │
│   ├── stores/                    # Zustand stores
│   │   ├── auth-store.ts         # Auth state
│   │   ├── cart-store.ts         # Cart state
│   │   ├── favorites-store.ts    # Favorites
│   │   ├── notifications-store.ts # Notification bell feed
│   │   ├── preferences-store.ts  # User preferences
│   │   ├── financial-preferences-store.ts # Financial UI preferences
│   │   └── ui-store.ts           # Misc UI state
│   │
│   ├── providers/                 # App-level providers
│   │   └── notifications-provider.tsx # Socket.IO notifications listener
│   │
│   ├── services/                  # API services
│   │   ├── api.ts                # Centralized API client
│   │   └── restaurants/          # Restaurant-specific service helpers
│   │
│   ├── utils/                     # Utility functions
│   │   ├── storage-manager.ts    # Storage abstraction
│   │   ├── format-currency.ts    # Currency formatting
│   │   └── ...                   # Other utilities
│   │
│   ├── contexts/                  # React contexts
│   │   └── auth-provider.tsx     # Auth context wrapper
│   │
│   ├── types/                     # TypeScript types
│   │   └── index.ts              # Type definitions
│   │
│   ├── constants/                 # Constants
│   │   ├── restaurant-categories.ts
│   │   └── order-management.ts
│   │
│   └── lib/                       # Library configurations
│       ├── utils.ts              # Shared utilities
│       ├── jwt.ts / session.ts   # Auth session helpers
│       ├── socket-auth.ts        # Socket.IO auth handshake
│       ├── geocode.ts            # Nominatim (OpenStreetMap) geocoding
│       └── notify.ts             # Notification dispatch rules
│
├── public/                        # Static assets
├── DOCS/                          # Documentation
└── like-delivery-backend-dev/     # Backend (separate project)
```

## Architecture

### Design Patterns

#### 1. **Component Structure**
```
Feature Component (Smart)
  ├── UI Components (Presentational)
  ├── Custom Hooks (Business Logic)
  └── API Services (Data Layer)
```

#### 2. **State Management Strategy**

**Zustand Stores** (Client State)
- `auth-store.ts` - Authentication state (user, token)
- `cart-store.ts` - Shopping cart (orderId for persistence)
- `favorites-store.ts` - Favorite restaurants
- `notifications-store.ts` - Notification bell feed (customer & management)
- `preferences-store.ts` - User preferences (theme, language, notifications)
- `financial-preferences-store.ts` - Financial dashboard UI preferences
- `ui-store.ts` - Misc shared UI state

**TanStack Query** (Server State)
- Restaurants data with caching
- Products/menu items
- Orders and deliveries
- User profile and addresses

```typescript
// Example: Zustand for client state
const { user, isAuthenticated } = useAuthStore()

// TanStack Query for server state
const { data: restaurants, isLoading } = useRestaurants()
```

#### 3. **Data Flow**

```
User Action
    ↓
Component Handler
    ↓
Custom Hook (Business Logic)
    ↓
├─→ Zustand Store (Client State)
└─→ API Service (Server State)
    ↓
TanStack Query (Caching & Sync)
    ↓
UI Update (Optimistic or Real)
```

#### 4. **Storage Management**

Centralized storage via `storage-manager.ts`:
- **localStorage** - Persistent data (auth, preferences, favorites)
- **sessionStorage** - Temporary data (navigation context)
- **Zustand persist** - Automatic sync with storage

```typescript
import { storageManager, STORAGE_KEYS } from '@/utils/storage-manager'

// Use standardized keys
storageManager.local.set(STORAGE_KEYS.AUTH, data)
```

### API Integration

**Centralized API Client** (`services/api.ts`)
- Single source for all API calls
- Automatic error handling
- Token management
- Type-safe endpoints

```typescript
import { apiService } from '@/services/api'

// Usage
const response = await apiService.restaurants.getById(id)
const products = await apiService.products.getByCompany(companyId)
```

**Backend URL:** `https://bearsystem.tech`

**Key Endpoints:**
- `/auth/*` - Authentication
- `/company/*` - Restaurants/Companies
- `/product/*` - Menu items
- `/order/*` - Orders (Redis-based)
- `/delivery/*` - Deliveries
- `/address/*` - User addresses
- `/upload/*` - File uploads (S3)

### Authentication Flow

1. User submits login form
2. API returns JWT token + user data
3. Data saved to both:
   - Zustand store (`auth-store.ts`, persisted)
   - `like_session` cookie (read by `src/middleware.ts` on the server)
4. Token included in all subsequent requests
5. Routes are protected on two layers:
   - **Server**: `src/middleware.ts` decodes the JWT cookie and redirects unauthenticated/unauthorized requests before the page renders (see the `PROTECTED` route table for role requirements per prefix)
   - **Client**: the `<ProtectedRoute allowedRoles={[...]}>` component (`src/components/protected-route`) double-checks the hydrated Zustand auth state and redirects to `/?openAuth=true` or `/unauthorized`

```tsx
// Client-side guard example (src/app/kitchen/page.tsx)
export default function KitchenPage() {
  return (
    <ProtectedRoute allowedRoles={["cook", "manager", "owner", "admin"]}>
      <Kitchen />
    </ProtectedRoute>
  )
}
```

## Development Guide

### Code Standards

#### TypeScript
- Always use TypeScript (no `any` types)
- Define interfaces for all data structures
- Use type inference when possible
- Export types from `@/types`

#### Components
- Use functional components with hooks
- Keep components focused (single responsibility)
- Extract business logic to custom hooks
- Use composition over inheritance

#### Naming Conventions
```typescript
// Components - PascalCase
export default function RestaurantCard() {}

// Files - kebab-case
restaurant-card.tsx
use-cart-actions.ts

// Hooks - camelCase with 'use' prefix
function useRestaurants() {}

// Constants - UPPER_SNAKE_CASE
export const API_BASE_URL = ''
```

#### File Organization
```
component-name/
  ├── index.tsx           # Main component
  ├── component-name.test.tsx  # Tests (future)
  └── types.ts           # Component-specific types
```

### Custom Hooks Pattern

Custom hooks encapsulate business logic and make components clean:

```typescript
// Good - Logic in custom hook
function useRestaurantActions() {
  const router = useRouter()
  const { addItem } = useCartStore()
  
  const handleRestaurantClick = (id: string) => {
    router.push(`/restaurant/${id}`)
  }
  
  return { handleRestaurantClick }
}

// Component stays clean
function RestaurantCard({ restaurant }) {
  const { handleRestaurantClick } = useRestaurantActions()
  
  return (
    <div onClick={() => handleRestaurantClick(restaurant.id)}>
      {restaurant.name}
    </div>
  )
}
```

### State Management Best Practices

#### When to use Zustand
- Client-side state that needs persistence
- UI state shared across multiple pages
- User preferences and settings

#### When to use TanStack Query
- Data from API endpoints
- Data that needs caching
- Data with complex loading/error states

```typescript
// Good - Server state with TanStack Query
const { data: restaurants } = useQuery({
  queryKey: ['restaurants'],
  queryFn: () => apiService.restaurants.getAll(),
  staleTime: 10 * 60 * 1000, // 10 minutes
})

// Good - Client state with Zustand
const { favorites, toggleFavorite } = useFavoritesStore()
```

### Performance Optimizations

#### 1. Lazy Loading
```typescript
// Dynamic imports for heavy components
const MenuManagement = dynamic(() => import('@/app/menu-management'))
```

#### 2. Memoization
```typescript
// Expensive calculations
const sortedRestaurants = useMemo(() => {
  return restaurants.sort((a, b) => b.rating - a.rating)
}, [restaurants])
```

#### 3. Progressive Rendering
```typescript
// Show content in batches (implemented in home page)
const [visibleCount, setVisibleCount] = useState(3)

useEffect(() => {
  if (visibleCount < restaurants.length) {
    setTimeout(() => setVisibleCount(prev => prev + 3), 100)
  }
}, [visibleCount, restaurants.length])
```

### Styling with Tailwind

#### Utility-First Approach
```tsx
// Good - Utility classes
<button className="px-4 py-2 bg-brand-500 hover:bg-brand-600 rounded-lg">
  Order Now
</button>
```

#### Component Variants
```tsx
// Using class-variance-authority
const buttonVariants = cva(
  "px-4 py-2 rounded-lg transition-colors",
  {
    variants: {
      variant: {
        primary: "bg-brand-500 hover:bg-brand-600",
        secondary: "bg-gray-200 hover:bg-gray-300",
      }
    }
  }
)
```

#### Responsive Design
```tsx
// Mobile-first approach
<div className="w-full sm:w-1/2 lg:w-1/3">
  // Small screens: full width
  // Medium screens: half width  
  // Large screens: third width
</div>
```

### Common Patterns

#### Optimistic Updates
```typescript
const mutation = useMutation({
  mutationFn: apiService.cart.addItem,
  onMutate: async (newItem) => {
    // Optimistically add to UI
    setItems(prev => [...prev, newItem])
  },
  onError: (error, newItem, context) => {
    // Rollback on error
    setItems(context.previousItems)
  },
})
```

#### Error Handling
```typescript
try {
  const response = await apiService.orders.create(orderData)
  if (response.success) {
    toast.success('Order placed successfully!')
  } else {
    toast.error(response.message)
  }
} catch (error) {
  toast.error('Connection error. Please try again.')
}
```

## Deployment

### Vercel (Recommended)

1. **Push to Git**
```bash
git push origin main
```

2. **Import Project in Vercel**
- Go to [vercel.com](https://vercel.com)
- Import your repository
- Configure environment variables
- Deploy

### Environment Variables

Set these in your deployment platform:
```env
NEXT_PUBLIC_API_URL=https://bearsystem.tech
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

### Build Optimization

The app is optimized for production:
- Static page generation where possible
- Image optimization via Next.js
- Code splitting and lazy loading
- Bundle size optimization

### Pre-Deployment Checklist

- [ ] All environment variables configured
- [ ] Build passes: `npm run build`
- [ ] No TypeScript errors
- [ ] API endpoints are accessible
- [ ] Images and assets load correctly
- [ ] Authentication flow works
- [ ] Cart functionality tested
- [ ] Order placement tested

## Contributing

### Development Workflow

1. **Create a feature branch**
```bash
git checkout -b feature/your-feature-name
```

2. **Make your changes**
- Follow the code standards
- Keep commits atomic and descriptive
- Test your changes locally

3. **Commit with clear messages**
```bash
git commit -m "feat: add restaurant filtering by cuisine"
```

4. **Push and create PR**
```bash
git push origin feature/your-feature-name
```

### Commit Message Convention

```
feat: Add new feature
fix: Bug fix
docs: Documentation changes
style: Code style changes (formatting)
refactor: Code refactoring
perf: Performance improvements
test: Adding tests
chore: Build process or auxiliary tool changes
```

### Code Review Guidelines

- Ensure code follows existing patterns
- Check for TypeScript errors
- Verify responsive design
- Test on multiple browsers
- Check for performance implications

## Additional Resources

### Documentation
- [CONTRIBUTING.md](./CONTRIBUTING.md) - Full contribution guide (branching, commits, PR process, testing)
- [CHANGELOG.md](./CHANGELOG.md) - Release history
- [QUICKSTART.md](./QUICKSTART.md) - Fast-track setup guide

### Backend
- Backend repository: `like-delivery-backend-dev/`
- API Documentation: Check backend README
- Endpoints: `https://bearsystem.tech`

### External Links
- [Next.js Documentation](https://nextjs.org/docs)
- [React Documentation](https://react.dev)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [TanStack Query](https://tanstack.com/query/latest)
- [Zustand](https://zustand-demo.pmnd.rs/)

## Roadmap & Next Steps

### Short Term (MVP Complete)
- Customer flow (browse, cart, checkout, orders)
- Restaurant management (menu, categories, orders, team, business profile)
- Kitchen Display System (KDS) for cooks
- Financial management (dashboard, cash register, payments, customers)
- Delivery dashboard for drivers
- Authentication and role-based authorization (client, owner, admin, manager, cook, financial, delivery)
- Real-time order tracking and in-app notifications (Socket.IO)
- Multiple addresses (OpenStreetMap map pin and geocoding) and payment methods
- Image uploads to S3

### Medium Term (Enhancements)
- [ ] Implement comprehensive testing suite
- [ ] Implement actual ratings and reviews
- [ ] Add coupon and promotion system
- [ ] Delivery time calculation based on location
- [ ] Multi-language support (i18n)
- [ ] Platform admin panel (cross-restaurant oversight)

### Long Term (Scale)
- [ ] Native mobile apps (React Native), including a dedicated delivery driver app
- [ ] Advanced search with filters (price, rating, cuisine)
- [ ] Restaurant recommendations (ML)
- [ ] Loyalty program
- [ ] Integration with payment gateways
- [ ] True Web Push notifications (Service Worker + VAPID, works with the browser closed) - today's notifications only work while a tab is open

## License

This project is private and proprietary.

---

For questions or support, check the documentation in `/DOCS` or reach out to the team.

.
