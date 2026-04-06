import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { makeAndFilterVariables } from '@/object-record/utils/makeAndFilterVariables';
import { makeOrFilterVariables } from '@/object-record/utils/makeOrFilterVariables';
import { turnSortsIntoOrderBy } from '@/object-record/object-sort-dropdown/utils/turnSortsIntoOrderBy';
import { type RecordFilterGroup } from '@/object-record/record-filter-group/types/RecordFilterGroup';
import { type RecordFilter } from '@/object-record/record-filter/types/RecordFilter';
import { type RecordSort } from '@/object-record/record-sort/types/RecordSort';
import { type RecordFilterValueDependencies, type RecordGqlOperationFilter } from 'twenty-shared/types';
import { computeRecordGqlOperationFilter, isDefined } from 'twenty-shared/utils';

export const getQueryVariablesFromFiltersAndSorts = ({
  recordFilterGroups,
  recordFilters,
  recordSorts,
  objectMetadataItem,
  objectMetadataItems = [],
  filterValueDependencies,
}: {
  recordFilterGroups: RecordFilterGroup[];
  recordFilters: RecordFilter[];
  recordSorts: RecordSort[];
  objectMetadataItem: EnrichedObjectMetadataItem;
  objectMetadataItems?: EnrichedObjectMetadataItem[];
  filterValueDependencies: RecordFilterValueDependencies;
}) => {
  // Enforced filters (rlsDynamicValue) are handled separately so we can inject
  // an OR IS_EMPTY condition alongside the IS-me condition, allowing records
  // with no owner assigned to also be visible alongside the owner's own records.
  const enforcedFilters = recordFilters.filter((f) =>
    isDefined(f.rlsDynamicValue),
  );
  const normalFilters = recordFilters.filter(
    (f) => !isDefined(f.rlsDynamicValue),
  );

  // Base filter from normal (non-enforced) filters and filter groups.
  // computeRecordGqlOperationFilter returns {} when there are no filters, which
  // would produce invalid AND conditions. Treat {} as undefined (no filter).
  const rawBaseFilter = computeRecordGqlOperationFilter({
    fields: objectMetadataItem?.fields ?? [],
    filterValueDependencies,
    recordFilterGroups,
    recordFilters: normalFilters,
  });
  const baseFilter =
    Object.keys(rawBaseFilter).length > 0 ? rawBaseFilter : undefined;

  // For each enforced filter build: (field IS value) OR (field IS NULL)
  // Note: RELATION fields do not support the IS_EMPTY operand in
  // computeRecordGqlOperationFilter, so we build the null condition directly
  // using the raw GQL shape { fieldNameId: { is: 'NULL' } }.
  const enforcedOrFilters = enforcedFilters.map((enforcedFilter) => {
    const isFilter = computeRecordGqlOperationFilter({
      fields: objectMetadataItem?.fields ?? [],
      filterValueDependencies,
      recordFilterGroups: [],
      recordFilters: [enforcedFilter],
    });

    const fieldMeta = objectMetadataItem?.fields.find(
      (f) => f.id === enforcedFilter.fieldMetadataId,
    );

    // Build the "owner is unassigned" condition directly so we never hit the
    // unsupported IS_EMPTY operand path for RELATION fields.
    const isNullFilter: RecordGqlOperationFilter | undefined = isDefined(
      fieldMeta,
    )
      ? enforcedFilter.type === 'RELATION'
        ? { [`${fieldMeta.name}Id`]: { is: 'NULL' } }
        : computeRecordGqlOperationFilter({
            fields: objectMetadataItem?.fields ?? [],
            filterValueDependencies,
            recordFilterGroups: [],
            recordFilters: [
              {
                ...enforcedFilter,
                operand: 'IS_EMPTY' as RecordFilter['operand'],
                value: '',
                displayValue: '',
              },
            ],
          }) || undefined
      : undefined;

    return makeOrFilterVariables([isFilter, isNullFilter]);
  });

  // AND the base filter with every enforced OR condition.
  const filter = makeAndFilterVariables([baseFilter, ...enforcedOrFilters]);

  const orderBy = turnSortsIntoOrderBy(
    objectMetadataItem,
    recordSorts,
    objectMetadataItems,
  );

  return {
    filter,
    orderBy,
  };
};
