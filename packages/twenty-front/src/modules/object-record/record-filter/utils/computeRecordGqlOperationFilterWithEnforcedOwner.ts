import { type RecordFilter } from '@/object-record/record-filter/types/RecordFilter';
import { type RecordFilterGroup } from '@/object-record/record-filter-group/types/RecordFilterGroup';
import {
  type PartialFieldMetadataItem,
  type RecordFilterValueDependencies,
  type RecordGqlOperationFilter,
} from 'twenty-shared/types';
import { computeRecordGqlOperationFilter, isDefined } from 'twenty-shared/utils';

/**
 * Wraps computeRecordGqlOperationFilter to handle enforced (rlsDynamicValue)
 * filters. For each enforced RELATION filter it builds:
 *   (fieldNameId IN [value]) OR (fieldNameId IS NULL)
 *
 * Non-enforced filters are processed normally through the standard path.
 * The results are AND-combined.
 */
export const computeRecordGqlOperationFilterWithEnforcedOwner = ({
  fields,
  recordFilters,
  recordFilterGroups,
  filterValueDependencies,
}: {
  fields: PartialFieldMetadataItem[];
  recordFilters: RecordFilter[];
  recordFilterGroups: RecordFilterGroup[];
  filterValueDependencies: RecordFilterValueDependencies;
}): RecordGqlOperationFilter => {
  const enforcedFilters = recordFilters.filter((f) =>
    isDefined(f.rlsDynamicValue),
  );
  const normalFilters = recordFilters.filter(
    (f) => !isDefined(f.rlsDynamicValue),
  );

  const baseFilter = computeRecordGqlOperationFilter({
    fields,
    filterValueDependencies,
    recordFilterGroups,
    recordFilters: normalFilters,
  });

  if (enforcedFilters.length === 0) {
    return baseFilter;
  }

  const enforcedOrConditions: RecordGqlOperationFilter[] = enforcedFilters
    .map((enforcedFilter) => {
      const isCondition = computeRecordGqlOperationFilter({
        fields,
        filterValueDependencies,
        recordFilterGroups: [],
        recordFilters: [enforcedFilter],
      });

      if (Object.keys(isCondition).length === 0) {
        return undefined;
      }

      const fieldMeta = fields.find(
        (f) => f.id === enforcedFilter.fieldMetadataId,
      );

      if (!isDefined(fieldMeta)) {
        return isCondition;
      }

      // RELATION fields don't support IS_EMPTY in computeRecordGqlOperationFilter,
      // so we build the NULL check directly using the GQL shape.
      const isNullCondition: RecordGqlOperationFilter =
        enforcedFilter.type === 'RELATION'
          ? { [`${fieldMeta.name}Id`]: { is: 'NULL' } }
          : { [fieldMeta.name]: { is: 'NULL' } };

      return { or: [isCondition, isNullCondition] };
    })
    .filter(isDefined);

  const allParts: RecordGqlOperationFilter[] = [
    ...(Object.keys(baseFilter).length > 0 ? [baseFilter] : []),
    ...enforcedOrConditions,
  ];

  if (allParts.length === 0) return {};
  if (allParts.length === 1) return allParts[0];
  return { and: allParts };
};
