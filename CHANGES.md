# Owner Filter Enforcement — Change Log

---

## Update 3 — "Save as new view" / "Update view" buttons hidden for non-admins

### Problem

When the enforced owner filter is active, `viewFiltersAreDifferentFromRecordFilters` becomes `true` because the view has no saved owner filter but the active filter list does. This caused the **"Save as new view"** button (on the default `INDEX` view) and the **"Update view" / "Create view"** buttons (on named views) to appear for non-admin users even though those actions are meaningless for them — saving the view would not preserve the enforced filter in a useful way.

### Solution

Added an admin gate to the `canShowButton` expression in `UpdateViewButtonGroup`. Non-admins always get `canShowButton = false`, so the component renders nothing. Admins are unaffected and retain full access to both buttons.

### Changed file

---

### 16. `packages/twenty-front/src/modules/views/components/UpdateViewButtonGroup.tsx`
**Status:** Modified

**What changed:**
- Imported `currentUserState` and `useAtomStateValue`.
- Derived `isAdmin = currentUser?.canAccessFullAdminPanel === true` at the top of the component.
- Prepended `isAdmin &&` to the `canShowButton` boolean expression.

**Why:** A single boolean guard at the `canShowButton` level is the cleanest, least-invasive fix. It covers both the `INDEX`-view case ("Save as new view") and the named-view case ("Update view" / "Create view") with one condition, and it requires no changes to the JSX or child components.

---

## Overview

These changes enforce an automatic **"Owner = me"** filter on any object that has an `owner` field.
Non-admin users see only records they own **plus records with no owner assigned (owner is NULL)**.
Admins are exempt and see all records.

The filter is:
- Injected automatically on page load and after SPA navigation
- Non-removable (the X button and edit dropdown are hidden)
- Hidden from the "Add filter" field list
- Identified by `rlsDynamicValue` on the `RecordFilter` object, which acts as the system-enforced marker

The effective query for non-admins is:
```
WHERE (ownerId IN [myId] OR ownerId IS NULL) AND [other user-applied filters...]
```

Admin detection uses `currentUser.canAccessFullAdminPanel` from `currentUserState`.

---

## Changed Files

---

### 1. `packages/twenty-front/src/modules/object-record/record-filter/types/RecordFilter.ts`
**Status:** Modified

**What changed:**
- Added a new type `RLSDynamicValue` with fields `workspaceMemberFieldMetadataId` and `workspaceMemberSubFieldName`.
- Added an optional `rlsDynamicValue?: RLSDynamicValue | null` property to the `RecordFilter` type.

**Why:** This is the core marker that identifies a filter as system-enforced. Every other file in this change log reads `rlsDynamicValue` to decide whether a filter is removable, editable, or needs the OR NULL query treatment. Without this type extension, the enforced owner filter would be indistinguishable from a user-created filter.

---

### 2. `packages/twenty-front/src/modules/views/components/ViewBarOwnerFilterEffect.tsx`
**Status:** New file

**What it does:**
A React effect component mounted inside `ViewBar` that injects the owner filter into `currentRecordFiltersComponentState`.

**Key behaviours:**
- Waits for `hasInitializedCurrentRecordFilters` to be `true` before injecting, so it never races with `ViewBarRecordFilterEffect` (which loads the view's saved filters first).
- Skips injection entirely if `currentUser.canAccessFullAdminPanel === true`.
- Skips if the object has no `owner` field.
- Subscribes to `currentRecordFilters` as a dependency so the effect re-runs whenever the filter list is cleared (e.g. during SPA navigation back to the page), re-injecting the filter automatically.
- Uses an idempotency check (`fieldMetadataId` match) inside both the outer effect and the functional updater to prevent duplicate injection and infinite loops.
- Sets `rlsDynamicValue` on the filter object to mark it as system-enforced.

---

### 3. `packages/twenty-front/src/modules/views/components/ViewBar.tsx`
**Status:** Modified

**What changed:**
- Imported `ViewBarOwnerFilterEffect` and added `<ViewBarOwnerFilterEffect />` inside the effect chain, placed after `<ViewBarRecordFilterEffect />` so the view's own filters are initialized first.
- Added a temporary debug `console.log` on render (can be removed).

**Why:** `ViewBar` is the correct place to mount side-effect components that belong to the view lifecycle. Every record index page renders a `ViewBar`, so the owner filter enforcement runs for all objects.

---

### 4. `packages/twenty-front/src/modules/object-record/record-filter/hooks/useRemoveRecordFilter.ts`
**Status:** Modified

**What changed:**
Added a guard before the removal logic:
```ts
if (isDefined(filterToRemove.rlsDynamicValue)) {
  return;
}
```

**Why:** This is the backend-of-the-frontend safety net. Even if something bypasses the UI (e.g. keyboard shortcut, programmatic call), any filter marked with `rlsDynamicValue` cannot be removed. Without this, the X button being hidden would be purely cosmetic.

---

### 5. `packages/twenty-front/src/modules/views/components/SortOrFilterChip.tsx`
**Status:** Modified

**What changed:**
- Added `showRemoveButton?: boolean` prop (defaults to `true`).
- Wrapped the `StyledDelete` X button in `{showRemoveButton && (...)}`.

**Why:** This is the lowest-level chip component used by all filter tags. Adding the prop here allows callers to suppress the X button without duplicating styled component logic.

---

### 6. `packages/twenty-front/src/modules/views/editable-chip/components/EditableRelationFilterChip.tsx`
**Status:** Modified

**What changed:**
- Added `showRemoveButton?: boolean` to the component props.
- Passes it down to `<SortOrFilterChip showRemoveButton={showRemoveButton} />`.

**Why:** The owner filter has type `RELATION`, so it is rendered through this chip. The prop must be threaded through from `EditableFilterDropdownButton` to the underlying `SortOrFilterChip`.

---

### 7. `packages/twenty-front/src/modules/views/editable-chip/components/EditableFilterChip.tsx`
**Status:** Modified

**What changed:**
- Added `showRemoveButton?: boolean` to the component props.
- Passes it down to `<SortOrFilterChip showRemoveButton={showRemoveButton} />`.

**Why:** Same as above — future-proofing for non-RELATION enforced filters. The prop chain must be complete for both chip types.

---

### 8. `packages/twenty-front/src/modules/views/editable-chip/components/EditableFilterDropdownButton.tsx`
**Status:** Modified

**What changed:**
- Imported `currentUserState` and `useAtomStateValue`.
- Computes `isAdmin = currentUser?.canAccessFullAdminPanel === true`.
- Computes `isEnforcedFilter = isDefined(recordFilter.rlsDynamicValue) && !isAdmin`.
- Added an early return branch: if `isEnforcedFilter` is `true`, render the chip directly **without** wrapping it in `<Dropdown>` and with `showRemoveButton={false}`.

**Why:** This is the single point of control for each filter chip's interactive behaviour. By not wrapping in `<Dropdown>`, clicking the chip does nothing (no edit popup). By passing `showRemoveButton={false}`, the X is hidden. Admins follow the normal path and get full interactivity.

---

### 9. `packages/twenty-front/src/modules/object-record/object-filter-dropdown/hooks/useFilterDropdownSelectableFieldMetadataItems.ts`
**Status:** Modified

**What changed:**
- Reads `currentUserState` to determine `isAdmin`.
- Reads `currentRecordFilters` for the current record index.
- Builds `enforcedFieldMetadataIds`: a `Set` of field IDs that have an active filter with `rlsDynamicValue`, populated only for non-admins.
- Adds a `.filter()` pass before the search-input filter to exclude any field whose ID is in `enforcedFieldMetadataIds`.

**Why:** This hides the "Owner" option from the "Add filter" dropdown for non-admins. Without this, users could add a second owner filter from the dropdown even if they cannot edit the enforced one.

---

### 10. `packages/twenty-front/src/modules/views/components/ViewBarDetails.tsx`
**Status:** Modified

**What changed:**
- Imported `currentUserState` and `useAtomStateValue`.
- Computed `isAdmin = currentUser?.canAccessFullAdminPanel === true`.
- Prepended `isAdmin &&` to the `canResetView` expression.

**Why:** The injected owner filter causes `viewFiltersAreDifferentFromRecordFilters` to be `true` (the view has no saved owner filter, but the active filters do). This made the **Reset** button appear permanently for non-admins even though they cannot change anything. Since Reset would only clear the owner filter and then re-inject it immediately, it is meaningless for non-admins and is now hidden.

---

## Backend Files (Exploratory — Safe to Revert)

The following files were created during an earlier attempt to enforce the filter on the backend. The approach was abandoned in favour of the frontend implementation above. They do not affect frontend behaviour but should be reverted if backend changes are not desired.

| File | Status |
|---|---|
| `packages/twenty-server/src/engine/api/common/common-query-runners/utils/append-owner-filter-if-available.util.ts` | New file — can be deleted |
| `packages/twenty-server/src/engine/api/common/common-query-runners/common-find-many-query-runner.service.ts` | Modified — call to `appendOwnerFilterIfAvailable` can be removed |
| `packages/twenty-server/src/engine/api/common/common-query-runners/common-group-by-query-runner.service.ts` | Modified — call to `appendOwnerFilterIfAvailable` can be removed |

---

## Debug Artefacts to Clean Up

| File | Artefact |
|---|---|
| `packages/twenty-front/src/modules/views/components/ViewBar.tsx` | `console.log('[OwnerEnforcement][ViewBar] render ...')` — remove when done |
| `packages/twenty-front/src/modules/views/components/ViewBarOwnerFilterEffect.tsx` | `console.log('[OwnerEnforcement][ViewBarOwnerFilterEffect] Injecting ...')` — remove when done |

---
---

# Update 2 — "Owner = me OR Owner is NULL" at the Query Level

## Problem

Update 1 injected the owner filter chip into the UI state (`currentRecordFiltersComponentState`), and modified `getQueryVariablesFromFiltersAndSorts.ts` to build the OR NULL condition. However, the record index pages do **not** use `getQueryVariablesFromFiltersAndSorts`. They call `computeRecordGqlOperationFilter` directly in three hooks:

1. `useFindManyRecordIndexTableParams` — fetches records for the table view
2. `useRecordIndexGroupCommonQueryVariables` — fetches records for grouped/kanban views
3. `useRecordIndexGroupsAggregatesGroupBy` — fetches aggregate counts for group headers

Because `computeRecordGqlOperationFilter` treats the owner filter as a plain `IS` filter, the query was `WHERE ownerId IN [myId]` — records with no owner were excluded.

Additionally, `computeRecordGqlOperationFilter` only supports `IS` and `IS_NOT` operands for RELATION fields. Passing `IS_EMPTY` as an operand causes a throw (`Unknown operand IS_EMPTY for RELATION filter`), which was silently swallowed, making the NULL condition never reach the query.

## Solution

Created a wrapper function `computeRecordGqlOperationFilterWithEnforcedOwner` that:

1. Separates enforced filters (`rlsDynamicValue` present) from normal filters
2. Passes normal filters through `computeRecordGqlOperationFilter` as usual
3. For each enforced filter, builds a hand-crafted OR condition:
   - `computeRecordGqlOperationFilter` for the `IS` part (reuses existing logic)
   - Direct GQL object `{ fieldNameId: { is: 'NULL' } }` for the NULL part (bypasses the unsupported IS_EMPTY operand)
4. ANDs everything together

Then replaced `computeRecordGqlOperationFilter` with `computeRecordGqlOperationFilterWithEnforcedOwner` in all three record-index hooks.

---

## Changed Files (Update 2)

---

### 11. `packages/twenty-front/src/modules/object-record/record-filter/utils/computeRecordGqlOperationFilterWithEnforcedOwner.ts`
**Status:** New file

**What it does:**
Wrapper around `computeRecordGqlOperationFilter` that intercepts enforced filters (identified by `rlsDynamicValue`) and builds an OR condition: `(field IS value) OR (field IS NULL)`.

**Key behaviours:**
- If no enforced filters exist, delegates entirely to the standard `computeRecordGqlOperationFilter` (zero overhead).
- For RELATION-typed enforced filters, builds the NULL condition directly as `{ fieldNameId: { is: 'NULL' } }`, bypassing the unsupported `IS_EMPTY` operand.
- For non-RELATION-typed enforced filters (future-proofing), builds `{ fieldName: { is: 'NULL' } }`.
- Combines all parts (base filter + enforced OR conditions) with `{ and: [...] }`.
- Handles edge cases: empty base filter, single filter (no wrapping), missing field metadata.

---

### 12. `packages/twenty-front/src/modules/object-record/record-index/hooks/useFindManyRecordIndexTableParams.ts`
**Status:** Modified

**What changed:**
- Added import of `computeRecordGqlOperationFilterWithEnforcedOwner` from the new local utility.
- Original `computeRecordGqlOperationFilter` import is kept as a comment tagged `[OWNER-FILTER]` for easy revert.
- Original call site is kept as a comment tagged `[OWNER-FILTER]`; new call to `computeRecordGqlOperationFilterWithEnforcedOwner(...)` is added below it.

**How to revert:** Search for `[OWNER-FILTER]` — uncomment the original lines, comment out or delete the new ones, and remove the `computeRecordGqlOperationFilterWithEnforcedOwner` import.

**Why:** This hook builds the filter for the main record table query (the list of records you see on pages like Contacts, Companies, Opportunities). Without this change, enforced owner filters were sent as plain `ownerId IN [myId]` without the NULL fallback.

---

### 13. `packages/twenty-front/src/modules/object-record/record-index/hooks/useRecordIndexGroupCommonQueryVariables.ts`
**Status:** Modified

**What changed:**
- Same pattern as file 12: new import added, original import and call site preserved as `[OWNER-FILTER]` comments.
- New call to `computeRecordGqlOperationFilterWithEnforcedOwner(...)` added below the commented-out original.

**How to revert:** Same as file 12 — search for `[OWNER-FILTER]`.

**Why:** This hook builds the filter for grouped/kanban views. Same issue — enforced filters needed the OR NULL treatment.

---

### 14. `packages/twenty-front/src/modules/object-record/record-index/hooks/useRecordIndexGroupsAggregatesGroupBy.ts`
**Status:** Modified

**What changed:**
- Same pattern as files 12 and 13: new import added, original import and call site preserved as `[OWNER-FILTER]` comments.
- New call to `computeRecordGqlOperationFilterWithEnforcedOwner(...)` added below the commented-out original.

**How to revert:** Same as files 12 and 13 — search for `[OWNER-FILTER]`.

**Why:** This hook builds the filter for aggregate queries (e.g. group header counts). Needed the same OR NULL logic so counts reflect the correct visible records.

---

### 15. `packages/twenty-front/src/modules/views/utils/getQueryVariablesFromFiltersAndSorts.ts`
**Status:** Modified (from Update 1, further updated)

**What changed:**
- Added imports for `makeAndFilterVariables`, `makeOrFilterVariables`, and `RecordGqlOperationFilter`.
- Separates enforced filters from normal filters.
- For each enforced filter, builds `(IS condition) OR (IS NULL condition)` — with the RELATION field NULL condition built directly as `{ fieldNameId: { is: 'NULL' } }`.
- ANDs all parts together via `makeAndFilterVariables`.
- Fixes a bug where `computeRecordGqlOperationFilter` returns `{}` for empty filter lists, which `makeAndFilterVariables` would incorrectly include.

**Why:** This file is used by `useQueryVariablesFromParentView` (parent view filtering in record detail pages). Although it is not the primary data-fetching path for index pages, it still needs the same OR NULL logic for consistency when navigating into a record and seeing the parent view's filter applied.
