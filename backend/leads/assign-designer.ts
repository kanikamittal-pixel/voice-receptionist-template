/** A row of the `designers` table (only the columns the app uses). */
export type Designer = {
  id: number; name: string; telegram_user_id: number | null; email?: string | null;
  booking_link?: string | null; cal_api_key?: string | null; read_only?: boolean;
};

/**
 * The designer-assignment rule, in one place: the designer who takes the lead gets it.
 * To assign by area, workload or turns instead, change only this function.
 */
export function assignDesigner(_lead: { id: string; area?: string | null; property_type?: string | null }, tappedBy: Designer, _all: Designer[]): Designer {
  return tappedBy;
}
