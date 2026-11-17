import React from "react";

const maskAccount = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length <= 4) return digits || "—";
  return `••••${digits.slice(-4)}`;
};

/**
 * Paid add-on / legacy gate for the detachable slip.
 * - includeInPdf === true → purchased (new checkouts)
 * - includeInPdf === false → explicitly not purchased
 * - includeInPdf omitted → legacy docs paid while the slip was free (`enabled`)
 */
export const shouldRenderDirectDepositSlip = (dd) => {
  if (!dd) return false;
  if (dd.includeInPdf === true) return true;
  if (dd.includeInPdf === false) return false;
  return Boolean(dd.enabled);
};

const SIZES = {
  // Matches variant thumbnail type (~6.5–8.5px).
  compact: {
    body: 7.5,
    title: 8.5,
    label: 6.5,
    hint: 6.5,
    net: 9,
    gap: "4px 14px",
    pad: "6px 8px",
    marginTop: 12,
    paddingTop: 8,
  },
  // Matches full-page document templates (~10–13px).
  document: {
    body: 11,
    title: 13,
    label: 10,
    hint: 10,
    net: 14,
    gap: "6px 24px",
    pad: "10px 12px",
    marginTop: 28,
    paddingTop: 16,
  },
};

/**
 * Detachable direct-deposit advice printed under the paystub.
 * Net amount must come from `data.directDeposit` (built from calculation.netPay).
 * `compact` — match variant thumbnail type; omit for full-page document templates.
 */
const DirectDepositSlip = ({ data, compact = false }) => {
  const dd = data?.directDeposit;
  if (!shouldRenderDirectDepositSlip(dd)) return null;

  const s = compact ? SIZES.compact : SIZES.document;
  const employeeName = data.employee?.name || data.employeeName || "—";
  const payDate =
    data.period?.payDate ||
    String(data.statement?.payDate || "").replace(/^Pay Date:\s*/i, "") ||
    "—";

  const labelStyle = {
    color: "#64748b",
    fontSize: s.label,
    fontWeight: 600,
  };
  const valueStyle = {
    fontWeight: 700,
    fontSize: s.body,
    lineHeight: 1.3,
  };

  return (
    <div
      style={{
        marginTop: s.marginTop,
        paddingTop: s.paddingTop,
        borderTop: `${compact ? 1.5 : 2}px dashed #94a3b8`,
        fontFamily: "Arial, Helvetica, sans-serif",
        color: "#0f172a",
        fontSize: s.body,
        lineHeight: 1.35,
        pageBreakInside: "avoid",
        breakInside: "avoid",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 8,
          marginBottom: compact ? 6 : 10,
        }}
      >
        <strong
          style={{
            fontSize: s.title,
            letterSpacing: "0.02em",
            whiteSpace: "nowrap",
          }}
        >
          DIRECT DEPOSIT ADVICE
        </strong>
        <span
          style={{
            color: "#64748b",
            fontSize: s.hint,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          Detach and retain for your records
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: s.gap,
          border: "1px solid #cbd5e1",
          borderRadius: compact ? 3 : 4,
          padding: s.pad,
          background: "#f8fafc",
        }}
      >
        <div>
          <div style={labelStyle}>Employee</div>
          <div style={valueStyle}>{employeeName}</div>
        </div>
        <div>
          <div style={labelStyle}>Pay date</div>
          <div style={valueStyle}>{payDate}</div>
        </div>
        <div>
          <div style={labelStyle}>Bank</div>
          <div style={valueStyle}>{dd.bankName || "—"}</div>
        </div>
        <div>
          <div style={labelStyle}>Account holder</div>
          <div style={valueStyle}>{dd.accountHolderName || "—"}</div>
        </div>
        <div>
          <div style={labelStyle}>Routing number</div>
          <div style={{ ...valueStyle, wordBreak: "break-all" }}>
            {dd.routingNumber || "—"}
          </div>
        </div>
        <div>
          <div style={labelStyle}>Account number</div>
          <div style={valueStyle}>{maskAccount(dd.accountNumber)}</div>
        </div>
        <div>
          <div style={labelStyle}>Advice / check #</div>
          <div style={valueStyle}>{dd.checkNumber || "—"}</div>
        </div>
        <div>
          <div style={labelStyle}>Net deposit</div>
          <div style={{ ...valueStyle, fontWeight: 800, fontSize: s.net }}>
            {dd.netPayText || "—"}
          </div>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <div style={labelStyle}>Amount in words</div>
          <div style={{ ...valueStyle, fontWeight: 600 }}>
            {dd.netWords || "—"}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DirectDepositSlip;
