export type OperatingMode = "off" | "dryRun" | "assist" | "boundedAuto";

export interface AreaPreference {
  /** User-visible value retained for confirmation in the popup. */
  displayLabel: string;
  /** Adapter-v1 exact glob: * matches many characters and ? matches one. */
  namePattern: string;
  maximumUnitPriceTwd?: number;
}

export interface TicketTarget {
  /** ISO calendar date selected by the user (YYYY-MM-DD). */
  showDate: string;
  /** Captured from the detail-page URL when the session is armed. */
  eventId?: string;
  quantity: number;
  seatMode: "bestAvailable";
  areaPriorities: AreaPreference[];
  ticketTypePriorities: string[];
  maximumUnitPriceTwd?: number;
}

export interface ActionPermissions {
  openPerformances: boolean;
  selectPerformance: boolean;
  selectSeatMode: boolean;
  selectArea: boolean;
  setQuantity: boolean;
  submitReservation: boolean;
}

export interface ArmedSession {
  id: string;
  tabId: number;
  origin: "https://tixcraft.com" | "https://www.tixcraft.com";
  mode: Exclude<OperatingMode, "off">;
  adapterVersion: "tixcraft-v1";
  target: TicketTarget;
  permissions: ActionPermissions;
  allowAreaFallback: boolean;
  inventoryAttemptCap: number;
  bestAvailableConfirmed: boolean;
  expiresAt: number;
}
