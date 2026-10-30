import api from "@/lib/api-client";
import {
  SiemDestination,
  SiemDestinationValues,
  SiemTestResult,
} from "@/features/siem/types/siem.types";

export async function getSiemDestinations(): Promise<SiemDestination[]> {
  const req = await api.post("/siem/destinations");
  return req.data;
}

export async function createSiemDestination(
  data: SiemDestinationValues & { name: string },
): Promise<SiemDestination> {
  const req = await api.post("/siem/destinations/create", data);
  return req.data;
}

export async function updateSiemDestination(data: {
  destinationId: string;
  name?: string;
  enabled?: boolean;
  config?: Record<string, any>;
  secrets?: Record<string, string>;
}): Promise<SiemDestination> {
  const req = await api.post("/siem/destinations/update", data);
  return req.data;
}

export async function deleteSiemDestination(destinationId: string) {
  await api.post("/siem/destinations/delete", { destinationId });
}

export async function retrySiemDestination(destinationId: string) {
  await api.post("/siem/destinations/retry", { destinationId });
}

export async function testSiemDestination(
  data: SiemDestinationValues & { destinationId?: string },
): Promise<SiemTestResult> {
  const req = await api.post("/siem/destinations/test", data);
  return req.data;
}
