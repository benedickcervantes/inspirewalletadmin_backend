# Changelog - InspireAdmin v2

## Recent Changes

### Maya/E-Wallet Dashboard Enhancements

#### Added Features
1. **Wallet Type Filtering**
   - Added dropdown filter to select between "All Wallets", "GCash", and "Maya"
   - Filter is functional and updates the table in real-time
   - Located in the filters section next to status filter

2. **Wallet Type Column**
   - New column in Maya applications table showing wallet type
   - Displays badges with icons matching withdrawal method badge style
   - Color coding:
     - GCash: Blue theme (`bg-[var(--info-soft)]`, `text-[var(--info)]`)
     - Maya: Green theme (`bg-[var(--success-soft)]`, `text-[var(--success)]`)
     - Unknown: Gray theme (`bg-[var(--surface-soft)]`, `text-[var(--text-muted)]`)
   - Includes smartphone icon for visual consistency

3. **Backend Wallet Type Normalization**
   - Added intelligent wallet type detection and normalization
   - Handles typos and variations (e.g., "gcasf" → "Gcash")
   - Case-insensitive matching
   - Fallback logic to infer wallet type from account number fields
   - Debug logging for wallet type distribution

#### Modified Files

**Frontend:**
- `inspireadmin2/app/(dashboard)/maya/page.tsx`
  - Added `walletTypeFilter` state
  - Added `handleWalletTypeChange` handler
  - Updated filter reset to include wallet type
  - Passed wallet type filter to child components

- `inspireadmin2/app/(dashboard)/maya/_components/MayaFilters.tsx`
  - Added `walletTypeOptions` array
  - Added `walletTypeFilter` and `onWalletTypeChange` props
  - Added wallet type SelectPicker component
  - Updated interface to include new props

- `inspireadmin2/app/(dashboard)/maya/_components/MayaTable.tsx`
  - Added `walletTypeFilter` prop
  - Added wallet type filtering logic in `useMemo`
  - Added new "Wallet Type" column with badge component
  - Updated query key to include wallet type filter
  - Updated useEffect dependencies for pagination reset
  - Badge styling matches withdrawal method badges

**Backend:**
- `inspirewalletadmin_backend/controllers/subcollectionController.js`
  - Enhanced `getMayaApplications` method with wallet type normalization
  - Added logic to check multiple field names (`ewalletType`, `walletType`, `applicationType`)
  - Added normalization for typos and variations (handles "gcasf" → "Gcash")
  - Added fallback inference from account number fields
  - Added debug logging for wallet type distribution
  - Added logging for items without wallet type

#### Technical Details

**Wallet Type Detection Logic:**
1. Check `ewalletType`, `walletType`, or `applicationType` fields
2. Normalize value (lowercase, trim)
3. Match patterns:
   - Contains "gcash" OR equals "gcasf" → "Gcash"
   - Contains "maya" → "Maya"
4. Fallback: Check for `mayaNumber`, `mayaAccountNumber`, `gcashNumber`, `gcashAccountNumber`
5. Return normalized value or empty string

**Filter Behavior:**
- "All Wallets" shows both GCash and Maya applications
- Selecting specific wallet type filters table to show only that type
- Filter persists across pagination
- Resets page to 1 when filter changes
- Works in combination with status, search, and date range filters

#### Bug Fixes
- Fixed issue where some GCash applications showed as "Unknown" due to typo in database ("gcasf")
- Fixed wallet type field not being returned from backend
- Improved error handling for missing wallet type data

---

### Previous Changes

#### Task Withdrawal Page
- Added text stroke and padding to status badges for better readability
- Applied `WebkitTextStroke`, `fontWeight`, `textShadow`, and `padding` styles

#### Withdrawal Request Page
- Fixed payment method detection for GCash, Maya, and Bank Transfer
- Backend now returns `withdrawalMethod`, `ewalletType`, `ewalletAccountNumber`, and `ewalletAccountName`
- Frontend `normalizeMethod` function correctly identifies payment methods
- Matches v1 logic using `withdrawalMethod` and `ewalletType` fields

---

## Files Modified Summary

### Frontend Files
- `inspireadmin2/app/(dashboard)/maya/page.tsx`
- `inspireadmin2/app/(dashboard)/maya/_components/MayaFilters.tsx`
- `inspireadmin2/app/(dashboard)/maya/_components/MayaTable.tsx`
- `inspireadmin2/app/(dashboard)/maya/_components/MayaHeader.tsx`
- `inspireadmin2/app/(dashboard)/task-withdrawal/page.tsx`
- `inspireadmin2/app/(dashboard)/withdrawal-request/_components/WithdrawalTable.tsx`

### Backend Files
- `inspirewalletadmin_backend/controllers/subcollectionController.js`

### No Files Removed
All changes were additions or modifications to existing files. No files were deleted in this update.

---

## Database Schema Notes

### Maya Applications Collection (`mayaApplications`)
Expected fields:
- `ewalletType` (or `walletType`, `applicationType`): "Gcash", "Maya", or variations
- `mobileNumber`: User's mobile number
- `grossMonthlyIncome`: Monthly income amount
- `sourceOfFund`: Source of funds description
- `status`: "pending", "approved", or "rejected"
- `applicationDate` (or `submittedAt`, `createdAt`): Application timestamp
- `userId`: User ID reference
- `userName`: Full name of user
- `userEmail` (or `emailAddress`): User's email

---

## Testing Checklist

- [x] Wallet type filter dropdown displays correctly
- [x] Wallet type column shows badges with correct colors
- [x] GCash applications display with blue badge
- [x] Maya applications display with green badge
- [x] Unknown wallet types display with gray badge
- [x] Filter works correctly (All/GCash/Maya)
- [x] Backend normalizes "gcasf" to "Gcash"
- [x] Badge styling matches withdrawal method badges
- [x] Smartphone icon displays in wallet type badges
- [x] Filters work in combination (status + wallet type + search + date)
- [x] Pagination resets when filters change

---

## Known Issues
None at this time.

---

## Future Enhancements
- Consider adding bulk actions for wallet applications
- Add export functionality for filtered results
- Add wallet type statistics to header cards
- Consider adding approval/rejection actions directly from table
