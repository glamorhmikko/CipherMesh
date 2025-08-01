import { describe, it, expect, beforeEach } from "vitest";

// Mock the Threat Reporting Clarity contract functions
const mockContract = {
  admin: "ST1ADMIN0000000000000000000000000000000000",
  threats: new Map<number, any>(),
  reporterReputation: new Map<string, number>(),
  slashedReporters: new Map<string, number>(),
  validatorNodes: new Map<string, boolean>(),

  nextThreatId: 1,

  isAdmin(caller: string) {
    return caller === this.admin;
  },

  reportThreat(
    reporter: string,
    target: string,
    description: string,
    severity: number
  ) {
    if (!reporter || !target || !description || severity === undefined) {
      return { error: 400 };
    }

    const id = this.nextThreatId++;
    this.threats.set(id, {
      id,
      reporter,
      target,
      description,
      severity,
      status: "pending",
      stake: 100,
    });

    return { value: id };
  },

  getThreat(id: number) {
    const threat = this.threats.get(id);
    if (!threat) return { error: 404 };
    return { value: threat };
  },

  validateThreat(validator: string, id: number, verdict: boolean) {
    if (!this.validatorNodes.get(validator)) {
      return { error: 403 }; // not validator
    }
    const threat = this.threats.get(id);
    if (!threat) return { error: 404 };

    if (threat.status !== "pending") {
      return { error: 409 }; // already validated
    }

    if (verdict) {
      threat.status = "validated";
      // reward reporter reputation
      const rep = this.reporterReputation.get(threat.reporter) ?? 0;
      this.reporterReputation.set(threat.reporter, rep + 1);
    } else {
      threat.status = "rejected";
      // slash reporter stake
      const slashed = this.slashedReporters.get(threat.reporter) ?? 0;
      this.slashedReporters.set(threat.reporter, slashed + 1);
    }

    this.threats.set(id, threat);
    return { value: true };
  },

  addValidator(caller: string, validator: string) {
    if (caller !== this.admin) {
      return { error: 403 };
    }
    this.validatorNodes.set(validator, true);
    return { value: true };
  },

  removeValidator(caller: string, validator: string) {
    if (caller !== this.admin) {
      return { error: 403 };
    }
    this.validatorNodes.delete(validator);
    return { value: true };
  },

  transferAdmin(caller: string, newAdmin: string) {
    if (caller !== this.admin) {
      return { error: 403 };
    }
    this.admin = newAdmin;
    return { value: true };
  },
};

describe("Threat Reporting Contract", () => {
  beforeEach(() => {
    mockContract.admin = "ST1ADMIN0000000000000000000000000000000000";
    mockContract.threats = new Map();
    mockContract.reporterReputation = new Map();
    mockContract.slashedReporters = new Map();
    mockContract.validatorNodes = new Map();
    mockContract.nextThreatId = 1;
  });

  it("should allow admin to add a validator", () => {
    const result = mockContract.addValidator(
      mockContract.admin,
      "ST1VALIDATOR0000000000000000000000000000000"
    );
    expect(result).toEqual({ value: true });
    expect(mockContract.validatorNodes.get("ST1VALIDATOR0000000000000000000000000000000")).toBe(true);
  });

  it("should prevent non-admin from adding a validator", () => {
    const result = mockContract.addValidator(
      "ST1NOTADMIN00000000000000000000000000000000",
      "ST1VALIDATOR0000000000000000000000000000000"
    );
    expect(result).toEqual({ error: 403 });
  });

  it("should report a threat and assign an ID", () => {
    const report = mockContract.reportThreat(
      "ST1REPORTER00000000000000000000000000000000",
      "ST1TARGET0000000000000000000000000000000000",
      "SQL Injection vulnerability",
      3
    );
    expect(typeof report.value).toBe("number");
    expect(report.value).toBeGreaterThan(0);
  });

  it("should retrieve a reported threat by ID", () => {
    const report = mockContract.reportThreat(
      "ST1REPORTER00000000000000000000000000000000",
      "ST1TARGET0000000000000000000000000000000000",
      "Cross-site scripting detected",
      2
    );
    const threatId = report.value!;
    const threat = mockContract.getThreat(threatId);
    expect(threat.value).toMatchObject({
      reporter: "ST1REPORTER00000000000000000000000000000000",
      target: "ST1TARGET0000000000000000000000000000000000",
      description: "Cross-site scripting detected",
      severity: 2,
      status: "pending",
    });
  });

  it("should allow validator to validate a threat with verdict true", () => {
    // Add validator first
    mockContract.addValidator(mockContract.admin, "ST1VALIDATOR0000000000000000000000000000000");

    const report = mockContract.reportThreat(
      "ST1REPORTER00000000000000000000000000000000",
      "ST1TARGET0000000000000000000000000000000000",
      "Buffer overflow issue",
      4
    );
    const threatId = report.value!;

    const validation = mockContract.validateThreat("ST1VALIDATOR0000000000000000000000000000000", threatId, true);
    expect(validation).toEqual({ value: true });

    const updatedThreat = mockContract.getThreat(threatId);
    expect(updatedThreat.value.status).toBe("validated");

    // Reputation incremented
    const rep = mockContract.reporterReputation.get("ST1REPORTER00000000000000000000000000000000");
    expect(rep).toBe(1);
  });

  it("should allow validator to validate a threat with verdict false and slash reporter", () => {
    mockContract.addValidator(mockContract.admin, "ST1VALIDATOR0000000000000000000000000000000");

    const report = mockContract.reportThreat(
      "ST1REPORTER00000000000000000000000000000000",
      "ST1TARGET0000000000000000000000000000000000",
      "Invalid input detected",
      1
    );
    const threatId = report.value!;

    const validation = mockContract.validateThreat("ST1VALIDATOR0000000000000000000000000000000", threatId, false);
    expect(validation).toEqual({ value: true });

    const updatedThreat = mockContract.getThreat(threatId);
    expect(updatedThreat.value.status).toBe("rejected");

    // Reporter slashed
    const slashed = mockContract.slashedReporters.get("ST1REPORTER00000000000000000000000000000000");
    expect(slashed).toBe(1);
  });

  it("should not allow non-validator to validate a threat", () => {
    const report = mockContract.reportThreat(
      "ST1REPORTER00000000000000000000000000000000",
      "ST1TARGET0000000000000000000000000000000000",
      "SQL Injection",
      3
    );
    const threatId = report.value!;

    const validation = mockContract.validateThreat("ST1NOTVALIDATOR0000000000000000000000000000", threatId, true);
    expect(validation).toEqual({ error: 403 });
  });

  it("should not validate a non-existent threat", () => {
    mockContract.addValidator(mockContract.admin, "ST1VALIDATOR0000000000000000000000000000000");

    const validation = mockContract.validateThreat("ST1VALIDATOR0000000000000000000000000000000", 9999, true);
    expect(validation).toEqual({ error: 404 });
  });

  it("should not validate an already validated threat", () => {
    mockContract.addValidator(mockContract.admin, "ST1VALIDATOR0000000000000000000000000000000");

    const report = mockContract.reportThreat(
      "ST1REPORTER00000000000000000000000000000000",
      "ST1TARGET0000000000000000000000000000000000",
      "Race condition bug",
      5
    );
    const threatId = report.value!;

    // First validation
    const firstValidation = mockContract.validateThreat("ST1VALIDATOR0000000000000000000000000000000", threatId, true);
    expect(firstValidation).toEqual({ value: true });

    // Second validation attempt
    const secondValidation = mockContract.validateThreat("ST1VALIDATOR0000000000000000000000000000000", threatId, false);
    expect(secondValidation).toEqual({ error: 409 });
  });

  it("should allow admin to remove a validator", () => {
    mockContract.addValidator(mockContract.admin, "ST1VALIDATOR0000000000000000000000000000000");

    const result = mockContract.removeValidator(mockContract.admin, "ST1VALIDATOR0000000000000000000000000000000");
    expect(result).toEqual({ value: true });
    expect(mockContract.validatorNodes.get("ST1VALIDATOR0000000000000000000000000000000")).toBeUndefined();
  });

  it("should prevent non-admin from removing a validator", () => {
    mockContract.addValidator(mockContract.admin, "ST1VALIDATOR0000000000000000000000000000000");

    const result = mockContract.removeValidator("ST1NOTADMIN00000000000000000000000000000000", "ST1VALIDATOR0000000000000000000000000000000");
    expect(result).toEqual({ error: 403 });
  });

  it("should allow admin to transfer admin rights", () => {
    const newAdmin = "ST1NEWADMIN0000000000000000000000000000000";
    const result = mockContract.transferAdmin(mockContract.admin, newAdmin);
    expect(result).toEqual({ value: true });
    expect(mockContract.admin).toBe(newAdmin);
  });

  it("should prevent non-admin from transferring admin rights", () => {
    const result = mockContract.transferAdmin("ST1NOTADMIN00000000000000000000000000000000", "ST1NEWADMIN0000000000000000000000000000000");
    expect(result).toEqual({ error: 403 });
  });
});
