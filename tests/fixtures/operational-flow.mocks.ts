import { OPERATIONAL_FLOW_FIXTURES, ROLE_FIXTURES } from "./operational-flow.fixtures";

export function mockAvailability(overrides: Partial<typeof OPERATIONAL_FLOW_FIXTURES.availability> = {}) {
  return { ...OPERATIONAL_FLOW_FIXTURES.availability, ...overrides };
}

export function mockOrder(overrides: Partial<typeof OPERATIONAL_FLOW_FIXTURES.order> = {}) {
  return { ...OPERATIONAL_FLOW_FIXTURES.order, ...overrides };
}

export function mockBlockedOrder(overrides: Partial<typeof OPERATIONAL_FLOW_FIXTURES.blockedOrder> = {}) {
  return { ...OPERATIONAL_FLOW_FIXTURES.blockedOrder, ...overrides };
}

export function mockStaging(overrides: Partial<typeof OPERATIONAL_FLOW_FIXTURES.staging> = {}) {
  return { ...OPERATIONAL_FLOW_FIXTURES.staging, ...overrides };
}

export function mockRole(role: keyof typeof ROLE_FIXTURES) {
  return { role, ...ROLE_FIXTURES[role] };
}
