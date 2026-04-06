import { currentUserState } from '@/auth/states/currentUserState';
import { objectFilterDropdownSearchInputComponentState } from '@/object-record/object-filter-dropdown/states/objectFilterDropdownSearchInputComponentState';
import { visibleRecordFieldsComponentSelector } from '@/object-record/record-field/states/visibleRecordFieldsComponentSelector';
import { useFilterableFieldMetadataItemsInRecordIndexContext } from '@/object-record/record-filter/hooks/useFilterableFieldMetadataItemsInRecordIndexContext';
import { currentRecordFiltersComponentState } from '@/object-record/record-filter/states/currentRecordFiltersComponentState';
import { useRecordIndexContextOrThrow } from '@/object-record/record-index/contexts/RecordIndexContext';
import { useAtomComponentSelectorValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentSelectorValue';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { isDefined } from 'twenty-shared/utils';

export const useFilterDropdownSelectableFieldMetadataItems = () => {
  const { recordIndexId } = useRecordIndexContextOrThrow();

  const objectFilterDropdownSearchInput = useAtomComponentStateValue(
    objectFilterDropdownSearchInputComponentState,
  );

  const { filterableFieldMetadataItems } =
    useFilterableFieldMetadataItemsInRecordIndexContext();

  const visibleRecordFields = useAtomComponentSelectorValue(
    visibleRecordFieldsComponentSelector,
    recordIndexId,
  );

  const currentUser = useAtomStateValue(currentUserState);
  const isAdmin = currentUser?.canAccessFullAdminPanel === true;

  const currentRecordFilters = useAtomComponentStateValue(
    currentRecordFiltersComponentState,
    recordIndexId,
  );

  // Field metadata IDs that are locked by a system-enforced filter (non-removable for non-admins)
  const enforcedFieldMetadataIds = new Set(
    isAdmin
      ? []
      : currentRecordFilters
          .filter((f) => isDefined(f.rlsDynamicValue))
          .map((f) => f.fieldMetadataId),
  );

  const visibleFieldMetadataItemIds = visibleRecordFields.map(
    (recordField) => recordField.fieldMetadataItemId,
  );

  const filteredSearchInputFieldMetadataItems = filterableFieldMetadataItems
    .filter(
      (fieldMetadataItem) =>
        !enforcedFieldMetadataIds.has(fieldMetadataItem.id),
    )
    .filter((fieldMetadataItem) =>
      fieldMetadataItem.label
        .toLocaleLowerCase()
        .includes(objectFilterDropdownSearchInput.toLocaleLowerCase()),
    );

  const selectableVisibleFieldMetadataItems =
    filteredSearchInputFieldMetadataItems
      .sort((a, b) => {
        return (
          visibleFieldMetadataItemIds.indexOf(a.id) -
          visibleFieldMetadataItemIds.indexOf(b.id)
        );
      })
      .filter((fieldMetadataItem) =>
        visibleFieldMetadataItemIds.includes(fieldMetadataItem.id),
      );

  const selectableHiddenFieldMetadataItems =
    filteredSearchInputFieldMetadataItems
      .sort((a, b) => a.label.localeCompare(b.label))
      .filter(
        (fieldMetadataItem) =>
          !visibleFieldMetadataItemIds.includes(fieldMetadataItem.id),
      );

  return {
    selectableVisibleFieldMetadataItems,
    selectableHiddenFieldMetadataItems,
  };
};
