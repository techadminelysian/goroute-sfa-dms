/**
 * Haute-Minimalist Executive B2B Design System Tokens
 * Bespoke color palette, typographic scale, and structural styling for GoRoute DMS.
 */

export const THEME_COLORS = {
  // 1. Canvas & Surfaces
  canvas: '#F8FAFC', // Slate 50 - Matte off-white canvas with zero glare
  surface: '#FFFFFF', // Pure white crisp card surfaces
  surfaceSubtle: '#F1F5F9', // Slate 100 - Secondary surface & table zebra strips

  // 2. Structural Borders
  borderLight: '#E2E8F0', // Slate 200 - 1px crisp separation
  borderStrong: '#CBD5E1', // Slate 300 - Input borders, active element boundaries

  // 3. Slate Ink Typography
  primaryInk: '#0F172A', // Slate 900 - High-contrast text & headings (>14:1 ratio)
  secondaryInk: '#64748B', // Slate 500 - Body & descriptive text (>8:1 ratio)
  disabledInk: '#94A3B8', // Slate 400 - Timestamps, hints, inactive states
  subtleInk: '#475569', // Slate 600 - Readable data table values

  // 4. Primary Brand / Action
  primaryAction: '#1E40AF', // Royal Blue 800 - Primary Action / CTA
  primaryActionHover: '#1D4ED8', // Royal Blue 700 - Hover state
  primaryHeader: '#172554', // Midnight Blue 950 - Executive Header
  primaryTint: '#EFF6FF', // Blue 50 - 5% tint for selections, badges, highlights
  primaryTintBorder: '#BFDBFE', // Blue 200 - Selection border

  // 5. Semantic Status Indicators & Containers
  status: {
    success: {
      text: '#047857', // Emerald 700
      container: '#ECFDF5', // Emerald 50
      border: '#A7F3D0', // Emerald 200
      label: 'Success / Active'
    },
    pending: {
      text: '#B45309', // Amber 700
      container: '#FFFBEB', // Amber 50
      border: '#FDE68A', // Amber 200
      label: 'Pending / Review'
    },
    alert: {
      text: '#BE123C', // Rose 700
      container: '#FFF1F2', // Rose 50
      border: '#FECDD3', // Rose 200
      label: 'Alert / Over Limit'
    },
    info: {
      text: '#1E40AF', // Royal Blue 800
      container: '#EFF6FF', // Blue 50
      border: '#BFDBFE', // Blue 200
      label: 'Informational'
    }
  }
} as const;

/**
 * Reusable pre-composed class tokens for Haute-Minimalist Executive UI components.
 */
export const THEME_CLASSES = {
  // Surfaces & Cards
  card: 'bg-white border border-[#E2E8F0] rounded-xl shadow-[0_1px_2px_0_rgba(15,23,42,0.04)]',
  cardFlat: 'bg-white border border-[#E2E8F0] rounded-lg',
  modal: 'bg-white border border-[#E2E8F0] rounded-xl shadow-[0_20px_25px_-5px_rgba(15,23,42,0.1),0_8px_10px_-6px_rgba(15,23,42,0.06)]',
  
  // Interactive Controls & Buttons
  buttonPrimary: 'bg-[#1E40AF] hover:bg-[#1D4ED8] text-white font-medium rounded-lg px-3.5 py-2 text-xs transition-colors shadow-[0_1px_2px_0_rgba(30,64,175,0.2)]',
  buttonSecondary: 'bg-white hover:bg-[#F8FAFC] text-[#0F172A] border border-[#E2E8F0] hover:border-[#CBD5E1] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors shadow-[0_1px_2px_0_rgba(15,23,42,0.02)]',
  buttonDestructive: 'bg-[#FFF1F2] hover:bg-[#FFE4E6] text-[#BE123C] border border-[#FECDD3] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
  buttonSuccess: 'bg-[#ECFDF5] hover:bg-[#D1FAE5] text-[#047857] border border-[#A7F3D0] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',

  // Form Inputs
  input: 'bg-white border border-[#CBD5E1] focus:border-[#1E40AF] focus:ring-1 focus:ring-[#1E40AF] text-[#0F172A] placeholder:text-[#94A3B8] rounded-lg px-3 py-2 text-xs transition-colors outline-none',
  select: 'bg-white border border-[#CBD5E1] focus:border-[#1E40AF] focus:ring-1 focus:ring-[#1E40AF] text-[#0F172A] rounded-lg px-3 py-2 text-xs transition-colors outline-none',
  
  // Typography
  heading1: 'text-lg font-bold text-[#0F172A] tracking-tight',
  heading2: 'text-base font-bold text-[#0F172A] tracking-tight',
  heading3: 'text-sm font-semibold text-[#0F172A] tracking-tight',
  body: 'text-xs text-[#0F172A] leading-relaxed',
  bodyMuted: 'text-xs text-[#64748B] leading-relaxed',
  metadata: 'text-[11px] text-[#94A3B8] tracking-wider',

  // Status Badges (Light container paired with crisp dark text and matching border)
  badgeSuccess: 'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#ECFDF5] text-[#047857] border border-[#A7F3D0] tracking-wider',
  badgePending: 'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#FFFBEB] text-[#B45309] border border-[#FDE68A] tracking-wider',
  badgeAlert: 'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#FFF1F2] text-[#BE123C] border border-[#FECDD3] tracking-wider',
  badgeInfo: 'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#EFF6FF] text-[#1E40AF] border border-[#BFDBFE] tracking-wider',
  badgeNeutral: 'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-[#F1F5F9] text-[#475569] border border-[#E2E8F0]',

  // Navigation Items
  navActive: 'bg-[#EFF6FF] text-[#1E40AF] border border-[#BFDBFE] font-semibold rounded-lg',
  navInactive: 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC] rounded-lg transition-colors'
} as const;

/**
 * Returns matching badge classes for standard status values.
 */
export function getStatusBadgeClasses(status: string | undefined): string {
  if (!status) return THEME_CLASSES.badgeNeutral;
  const s = status.toUpperCase();
  if (['PAID', 'CONFIRMED', 'ACTIVE', 'APPROVED', 'SETTLED', 'DELIVERED', 'COMPLETED', 'SUCCESS'].includes(s)) {
    return THEME_CLASSES.badgeSuccess;
  }
  if (['PUNCHED', 'IN_TRANSIT', 'PENDING', 'SUBMITTED', 'UNDER_REVIEW', 'RAISED', 'WARNING'].includes(s)) {
    return THEME_CLASSES.badgePending;
  }
  if (['REJECTED', 'OVER_LIMIT', 'BLOCKED', 'CANCELLED', 'LEAKAGE', 'FAILED', 'ALERT', 'DANGER'].includes(s)) {
    return THEME_CLASSES.badgeAlert;
  }
  return THEME_CLASSES.badgeInfo;
}
