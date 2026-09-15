export type OperatingMode = "off" | "dryRun" | "assist" | "boundedAuto";

export interface AreaPreference {
  /** Exact event-specific area name, ordered from highest to lowest priority. */
  name: string;
}

export interface TicketRequest {
  /** The standardized ticket category selected in the popup. */
  kind: "full" | "discount";
  /** Requested quantity for this ticket category. */
  quantity: number;
}

export interface TicketTarget {
  /** ISO calendar date selected by the user (YYYY-MM-DD). */
  showDate: string;
  /** Captured from the detail-page URL when the session is armed. */
  eventId?: string;
  seatMode: "bestAvailable";
  areaPriorities: AreaPreference[];
  ticketRequests: TicketRequest[];
  maximumUnitPriceTwd: number;
}

export interface ActionPermissions {
  openPerformances: boolean;
  selectPerformance: boolean;
  selectSeatMode: boolean;
  selectArea: boolean;
  setQuantity: boolean;
  acknowledgeTerms: boolean;
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
