# How It Works Modal Implementation

## Overview
Implemented a 3-step modal explaining how users interact with the Stoppage platform, matching the AuthModal's design with white background, blue accents, and centered positioning.

## Design Specifications

### Visual Style
- **White background** with subtle transparency (rgba(255, 255, 255, 0.98))
- **Blue accents** using `var(--pm-blue)` for primary actions and active states
- **Centered positioning** with backdrop blur effect
- **Consistent with AuthModal** design language
- Clean, modern aesthetic matching existing UI

### Layout
- Modal appears in the **center of the screen** (not dropping down)
- Backdrop overlay with blur effect
- Click outside or press Escape to close
- Responsive design for mobile devices

## What Was Created

### 1. HowItWorksModal Component (`src/components/HowItWorksModal.tsx`)
A modal component with:
- **3 Steps** explaining the platform:
  1. **Browse World Cup Markets** - Explore matches and view real-time odds
  2. **Buy & Sell Outcome Shares** - Trade on match outcomes with Yes/No shares
  3. **Earn from Correct Predictions** - Win $1.00 per share when predictions are correct

- **Features**:
  - Custom icons for each step
  - Navigation dots to jump between steps
  - Previous/Next buttons
  - "Get Started" CTA on final step
  - Keyboard navigation (Escape to close)
  - Click outside to close
  - Smooth animations

### 2. Styling (`src/components/HowItWorksModal.css`)
- Clean, modern design matching the existing UI
- Smooth animations for modal entrance and icon transitions
- Dark mode support
- Fully responsive (mobile-friendly)
- Accessible focus states

### 3. Integration with Navbar (`src/components/Navbar.tsx`)
- Connected the existing "How it works" button to open the modal
- Added state management for modal visibility
- Imported modal component and styles

## User Flow

1. **Unauthenticated users** see "How it works" button in the navbar
2. Clicking opens the modal with Step 1
3. Users can:
   - Click "Next" to advance through steps
   - Click "Previous" to go back
   - Click dots to jump to specific steps
   - Press Escape or click outside to close
4. Final step shows "Get Started" button that closes the modal

## Technical Details

- Built with SolidJS (matching project stack)
- TypeScript for type safety
- No external dependencies
- Follows existing component patterns
- Accessible (ARIA labels, keyboard navigation)
- Smooth animations using CSS keyframes

## Files Modified/Created

- ✅ Created: `src/components/HowItWorksModal.tsx`
- ✅ Created: `src/components/HowItWorksModal.css`
- ✅ Modified: `src/components/Navbar.tsx`
- ✅ Updated: `public/favicon.ico` → `public/stopp.svg` reference

## Next Steps (Optional Enhancements)

1. Add analytics tracking for modal interactions
2. Add video/GIF demonstrations for each step
3. Create a "Don't show again" preference
4. Add a link to detailed documentation
5. Show modal automatically for first-time visitors
