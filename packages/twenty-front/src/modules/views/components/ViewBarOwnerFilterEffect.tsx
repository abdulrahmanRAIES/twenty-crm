import { useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';

import { currentUserState } from '@/auth/states/currentUserState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { contextStoreCurrentViewIdComponentState } from '@/context-store/states/contextStoreCurrentViewIdComponentState';
import { currentRecordFiltersComponentState } from '@/object-record/record-filter/states/currentRecordFiltersComponentState';
import { type RecordFilter } from '@/object-record/record-filter/types/RecordFilter';
import { useRecordIndexContextOrThrow } from '@/object-record/record-index/contexts/RecordIndexContext';
import { useAtomComponentFamilyStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentFamilyStateValue';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useSetAtomComponentState } from '@/ui/utilities/state/jotai/hooks/useSetAtomComponentState';
import { hasInitializedCurrentRecordFiltersComponentFamilyState } from '@/views/states/hasInitializedCurrentRecordFiltersComponentFamilyState';

export const ViewBarOwnerFilterEffect = () => {
  const { objectMetadataItem, recordIndexId } = useRecordIndexContextOrThrow();

  const currentUser = useAtomStateValue(currentUserState);
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);

  const contextStoreCurrentViewId = useAtomComponentStateValue(
    contextStoreCurrentViewIdComponentState,
  );

  const hasInitializedCurrentRecordFilters = useAtomComponentFamilyStateValue(
    hasInitializedCurrentRecordFiltersComponentFamilyState,
    { viewId: contextStoreCurrentViewId ?? undefined },
  );

  // Subscribe to currentRecordFilters so we re-run whenever it is cleared
  // (e.g. during SPA navigation) and can re-inject the enforced owner filter.
  const currentRecordFilters = useAtomComponentStateValue(
    currentRecordFiltersComponentState,
    recordIndexId,
  );

  const setCurrentRecordFilters = useSetAtomComponentState(
    currentRecordFiltersComponentState,
    recordIndexId,
  );

  useEffect(() => {
    if (!hasInitializedCurrentRecordFilters) {
      return;
    }

    if (currentUser?.canAccessFullAdminPanel === true) {
      return;
    }

    const ownerFieldMetadata = objectMetadataItem.fields.find(
      (fieldMetadataItem) => fieldMetadataItem.name === 'owner',
    );

    if (!ownerFieldMetadata || !currentWorkspaceMember) {
      return;
    }

    // Idempotency check: if the owner filter is already present, do nothing.
    // This is what stops the effect loop after the first injection.
    const alreadyHasOwnerFilter = currentRecordFilters.some(
      (recordFilter) =>
        recordFilter.fieldMetadataId === ownerFieldMetadata.id,
    );

    if (alreadyHasOwnerFilter) {
      return;
    }

    const displayName =
      [
        currentWorkspaceMember.name?.firstName,
        currentWorkspaceMember.name?.lastName,
      ]
        .filter(Boolean)
        .join(' ')
        .trim() || 'Me';

    const ownerFilter: RecordFilter = {
      id: uuidv4(),
      fieldMetadataId: ownerFieldMetadata.id,
      value: currentWorkspaceMember.id,
      displayValue: displayName,
      type: ownerFieldMetadata.type as RecordFilter['type'],
      operand: 'IS' as RecordFilter['operand'],
      label: ownerFieldMetadata.label,
      rlsDynamicValue: {
        workspaceMemberFieldMetadataId: ownerFieldMetadata.id,
        workspaceMemberSubFieldName: null,
      },
    };

    // eslint-disable-next-line no-console
    console.log(
      '[OwnerEnforcement][ViewBarOwnerFilterEffect] Injecting owner filter:',
      ownerFilter,
    );

    setCurrentRecordFilters((previousFilters) => {
      if (
        previousFilters.some(
          (f) => f.fieldMetadataId === ownerFieldMetadata.id,
        )
      ) {
        return previousFilters;
      }
      return [...previousFilters, ownerFilter];
    });
  }, [
    hasInitializedCurrentRecordFilters,
    currentRecordFilters,
    currentUser,
    currentWorkspaceMember,
    objectMetadataItem.fields,
    setCurrentRecordFilters,
  ]);

  return null;
};
