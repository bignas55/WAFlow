# Admin Approval Flow - Complete Guide

## What Happens When a User Signs Up

### User Side (Public)
1. ✅ User goes to `/register`
2. ✅ User fills signup form (business name, name, email, password)
3. ✅ User clicks "Sign Up"
4. ✅ **User is redirected to `/pending-approval?email=...`**
5. ✅ User sees message: "Your signup has been submitted! Awaiting admin approval"
6. ❌ User **CANNOT** login until approved
7. ✅ User can check the "Check Login Status" button to see if approved

### Admin Side (Private)
1. ✅ Admin goes to `/signup-approvals` (admin-only page)
2. ✅ Admin sees pending users list with:
   - User name
   - Email address
   - Signup date/time
   - **Approve** button (green)
   - **Decline** button (red)
3. ✅ Admin clicks **Approve**
4. ✅ User account is activated:
   - `emailVerified` set to true
   - 14-day trial clock starts
   - User appears in admin dashboard
5. ✅ User can now login

## Database State

### After User Signs Up (Before Approval)
```sql
users table:
- id: 123
- email: user@example.com
- emailVerified: false  ← NOT YET VERIFIED
- isActive: true
- accountStatus: trial_active
- trialStartDate: NULL  ← NOT YET STARTED
- trialEndDate: NULL
- createdAt: 2024-01-15 10:30:00
```

### After Admin Approves
```sql
users table:
- id: 123
- email: user@example.com
- emailVerified: true  ← NOW VERIFIED ✓
- isActive: true
- accountStatus: trial_active
- trialStartDate: 2024-01-15 10:35:00  ← TRIAL STARTED ✓
- trialEndDate: 2024-01-29 10:35:00
- updatedAt: 2024-01-15 10:35:00
```

## Testing Checklist

### Step 1: Test User Signup
- [ ] Navigate to `/register`
- [ ] Fill in form with test data
- [ ] Click "Sign Up"
- **Expected:** See `/pending-approval` page with message "Your signup has been submitted!"

### Step 2: Check Database
- [ ] Go to your database
- [ ] Find the new user (emailVerified = false)
- **Expected:** User exists with emailVerified: false

### Step 3: Try to Login
- [ ] Go to `/login`
- [ ] Try logging in with the new user credentials
- **Expected:** Error message saying "Account pending admin approval"

### Step 4: Check Admin Dashboard
- [ ] Go to `/signup-approvals` (you must be logged in as admin)
- [ ] Look for the new user in the pending list
- **Expected:** See the user with Approve/Decline buttons

### Step 5: Approve the User
- [ ] Click the green **Approve** button
- **Expected:** User disappears from pending list and gets "User account approved" message

### Step 6: Check User Can Login
- [ ] Go to `/login`
- [ ] Login with the approved user credentials
- **Expected:** Login successful, redirected to dashboard/onboarding

### Step 7: Check Admin Dashboard
- [ ] Check the main admin dashboard (Tenant Overview)
- **Expected:** The approved user now appears in the tenant list

## Troubleshooting

### If user doesn't see `/pending-approval` page after signup:
1. Check browser console for errors (F12)
2. Check that Register.tsx has `pendingAdminApproval` check
3. Rebuild the frontend: `pnpm build:client`
4. Clear browser cache and reload

### If `/signup-approvals` shows nothing:
1. Make sure you're logged in as admin
2. Check that new users have emailVerified: false in database
3. Run: `SELECT * FROM users WHERE emailVerified = false AND role = 'user';`

### If admin approval doesn't work:
1. Check browser console for errors
2. Make sure the user's code is visible on the page
3. Try clicking Approve again
4. Check database to see if emailVerified changed to true

## Important Notes

- ✅ Unverified users are **only shown in `/signup-approvals`**, not in regular admin dashboard
- ✅ Users cannot login until `emailVerified = true`
- ✅ Trial clock doesn't start until approval
- ✅ No emails are sent - everything is done through the admin UI
- ✅ Admin can delete (decline) accounts before approval
