import React from "react";

const maskAccount = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length <= 4) return digits || "—";
  return `••••${digits.slice(-4)}`;
};

/**
 * Detachable direct-deposit advice printed under the paystub.
 * Net amount must come from `data.directDeposit` (built from calculation.netPay).
 */
const DirectDepositSlip = ({ data }) => {
  const dd = data?.directDeposit;
  if (!dd?.enabled) return null;

  return (
    <div
      style={{
        marginTop: 28,
        paddingTop: 16,
        borderTop: "2px dashed #94a3b8",
        fontFamily: "Arial, Helvetica, sans-serif",
        color: "#0f172a",
        fontSize: 11,
        pageBreakInside: "avoid",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 10,
        }}
      >
        <strong style={{ fontSize: 13, letterSpacing: "0.02em" }}>
          DIRECT DEPOSIT ADVICE
        </strong>
        <span style={{ color: "#64748b" }}>Detach and retain for your records</span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "6px 24px",
          border: "1px solid #cbd5e1",
          borderRadius: 4,
          padding: "10px 12px",
          background: "#f8fafc",
        }}
      >
        <div>
          <div style={{ color: "#64748b", fontSize: 10 }}>Employee</div>
          <div style={{ fontWeight: 700 }}>{data.employee?.name || "—"}</div>
        </div>
        <div>
          <div style={{ color: "#64748b", fontSize: 10 }}>Pay date</div>
          <div style={{ fontWeight: 700 }}>{data.period?.payDate || "—"}</div>
        </div>
        <div>
          <div style={{ color: "#64748b", fontSize: 10 }}>Bank</div>
          <div style={{ fontWeight: 700 }}>{dd.bankName || "—"}</div>
        </div>
        <div>
          <div style={{ color: "#64748b", fontSize: 10 }}>Account holder</div>
          <div style={{ fontWeight: 700 }}>{dd.accountHolderName || "—"}</div>
        </div>
        <div>
          <div style={{ color: "#64748b", fontSize: 10 }}>Routing number</div>
          <div style={{ fontWeight: 700 }}>{dd.routingNumber || "—"}</div>
        </div>
        <div>
          <div style={{ color: "#64748b", fontSize: 10 }}>Account number</div>
          <div style={{ fontWeight: 700 }}>{maskAccount(dd.accountNumber)}</div>
        </div>
        <div>
          <div style={{ color: "#64748b", fontSize: 10 }}>Advice / check #</div>
          <div style={{ fontWeight: 700 }}>{dd.checkNumber || "—"}</div>
        </div>
        <div>
          <div style={{ color: "#64748b", fontSize: 10 }}>Net deposit</div>
          <div style={{ fontWeight: 800, fontSize: 14 }}>{dd.netPayText || "—"}</div>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <div style={{ color: "#64748b", fontSize: 10 }}>Amount in words</div>
          <div style={{ fontWeight: 600 }}>{dd.netWords || "—"}</div>
        </div>
      </div>
    </div>
  );
};

export default DirectDepositSlip;
